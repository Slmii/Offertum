import { inngest } from '@/modules/inngest/inngest.client';
import { InngestEvents, InngestFunctionIds, InngestSteps } from '@/modules/inngest/inngest.constants';
import { logContext as requestContext } from '@/modules/logger/log-context';
import { LogService } from '@/modules/logger/log.service';
import { PricingPlaybookCompileService } from '@/modules/pricing-playbook/compile/compile.service';
import { pruneNulls } from '@/modules/pricing-playbook/compile/compile.types';
import { PRICING_RULE_TYPE_FROM_WIRE } from '@/modules/pricing-playbook/pricing-rule-type.mapper';
import {
	PricingPlaybookRepository,
	type CompileRuleInput
} from '@/modules/pricing-playbook/pricing-playbook.repository';
import { Injectable } from '@nestjs/common';
import type { InngestFunction } from 'inngest';

/**
 * Pricing-playbook compile pass. Listens on `pricing-playbook/saved` events
 * (fired by `PricingPlaybookService.update`), runs the prose through the LLM,
 * and applies the typed-rule set with manual-override preservation.
 *
 * **Debounce:** `debounce.period = 5s` collapses a flurry of typed saves into
 * one compile. Inngest's debouncer keys by the optional `key` expression — we
 * key by `data.organizationId` so two different orgs typing at the same time
 * each get their own debounced run.
 *
 * **Idempotency:** the `compiledHash` check inside `LoadAndGate` short-circuits
 * when the prose hasn't actually changed (re-fired event, manual `Invoke` in
 * dev UI, retry, etc.). No LLM call, no DB writes.
 *
 * **AsyncLocalStorage:** each step.run callback re-establishes the request
 * context with `runId + organizationId` so the AICall + Log rows produced
 * inside carry the correct correlation fields. See CLAUDE.md #8.
 */
@Injectable()
export class PricingPlaybookCompileFunction {
	readonly inngestFn: InngestFunction.Any;

	constructor(
		repository: PricingPlaybookRepository,
		compileService: PricingPlaybookCompileService,
		logService: LogService
	) {
		this.inngestFn = inngest.createFunction(
			{
				id: InngestFunctionIds.PricingPlaybookCompile,
				name: 'Pricing playbook compile',
				triggers: [{ event: InngestEvents.PricingPlaybookSaved }],
				retries: 2,
				debounce: { period: '5s', key: 'event.data.organizationId' }
			},
			async ({ event, runId, step }) => {
				const data = event.data as { organizationId?: unknown; playbookHash?: unknown } | undefined;
				const organizationId = typeof data?.organizationId === 'string' ? data.organizationId : null;
				const playbookHash = typeof data?.playbookHash === 'string' ? data.playbookHash : null;

				if (!organizationId || !playbookHash) {
					await requestContext.run({ requestId: runId }, () => {
						logService.logAction({
							action: 'pricing_playbook.compile.invalid_payload',
							message: `${event.name} event missing organizationId/playbookHash`,
							metadata: { event: event.name, payload: event.data },
							level: 'warn',
							context: 'InngestFn:pricing-playbook-compile'
						});
					});
					return { skipped: true, reason: 'invalid_payload' };
				}

				const correlation = { requestId: runId, organizationId };

				const gate = await step.run(InngestSteps.PricingPlaybookCompile.LoadAndGate, () =>
					requestContext.run(correlation, async () => {
						const playbook = await repository.findByOrganizationId(organizationId);
						if (!playbook) {
							logService.logAction({
								action: 'pricing_playbook.compile.no_playbook',
								message: `No PricingPlaybook for org ${organizationId} — skipping compile`,
								metadata: { organizationId },
								level: 'warn',
								context: 'InngestFn:pricing-playbook-compile'
							});
							return { skip: true as const };
						}

						// Idempotency gate: the playbook prose hasn't changed since the
						// last successful compile. Bail out — same input → same output.
						const currentHash = compileService.hashPlaybookText(playbook.playbookText);
						if (playbook.compiledHash === currentHash) {
							logService.logAction({
								action: 'pricing_playbook.compile.no_op',
								message: `Playbook for org ${organizationId} unchanged since last compile`,
								metadata: { organizationId, currentHash, eventHash: playbookHash },
								level: 'log',
								context: 'InngestFn:pricing-playbook-compile'
							});
							return { skip: true as const };
						}

						return {
							skip: false as const,
							pricingPlaybookId: playbook.id,
							playbookText: playbook.playbookText,
							currentHash
						};
					})
				);

				if (gate.skip) {
					return { skipped: true, reason: 'no_op_or_missing' };
				}

				const compiled = await step.run(InngestSteps.PricingPlaybookCompile.RunCompile, () =>
					requestContext.run(correlation, () => compileService.compile(gate.playbookText))
				);

				const persisted = await step.run(InngestSteps.PricingPlaybookCompile.PersistRules, () =>
					requestContext.run(correlation, async () => {
						// OpenAI's strict structured-output mode forces every condition/effect
						// key to be declared (nullable) in the schema. Strip the `null` keys
						// before storage so the DB blobs read cleanly + the rule engine's
						// "missing key = matches anything" semantic stays intact.
						const rules: CompileRuleInput[] = compiled.value.rules.map(rule => ({
							ruleType: PRICING_RULE_TYPE_FROM_WIRE[rule.ruleType],
							condition: pruneNulls(rule.condition),
							effect: pruneNulls(rule.effect),
							priority: rule.priority,
							description: rule.description,
							sourceSpan: rule.sourceSpan
						}));

						await repository.applyCompileOutput(gate.pricingPlaybookId, rules);
						await repository.markCompiled(gate.pricingPlaybookId, gate.currentHash, new Date());

						logService.logAction({
							action: 'pricing_playbook.compile.completed',
							message: `Pricing playbook for org ${organizationId} compiled into ${rules.length} rule(s) via ${compiled.provider}/${compiled.model}`,
							metadata: {
								organizationId,
								pricingPlaybookId: gate.pricingPlaybookId,
								rulesEmitted: rules.length,
								provider: compiled.provider,
								model: compiled.model,
								aiCallId: compiled.callId
							},
							context: 'InngestFn:pricing-playbook-compile'
						});

						// Return a small summary so the Inngest dev UI surfaces what landed
						// instead of `null`. Side-effect-shaped step that produces a result
						// is the better hygiene anyway — easier to inspect on retries.
						return {
							pricingPlaybookId: gate.pricingPlaybookId,
							rulesPersisted: rules.length,
							compiledHash: gate.currentHash,
							aiCallId: compiled.callId
						};
					})
				);

				return {
					organizationId,
					...persisted,
					provider: compiled.provider,
					model: compiled.model
				};
			}
		);
	}
}
