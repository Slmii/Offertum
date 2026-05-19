# AI provider notes (W5.1)

Decision: **OpenAI as the only runtime AI provider at MVP.** Locked 2026-05-19.

## Provider configuration

| Concern              | Default                                                | Override                                              |
| -------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| Provider             | OpenAI direct                                          | `AZURE_OPENAI_ENDPOINT` set → routes via Azure OpenAI |
| EU data residency    | Azure OpenAI EU (Frankfurt / Sweden) in production     | OpenAI direct (US) for dev                            |
| Classifier model     | `gpt-4o-mini` (high volume, conservative output)       | Configurable per call                                 |
| Extractor model      | `gpt-4o` (lower volume, accuracy-sensitive)            | Configurable per call                                 |
| Reply-draft model    | `gpt-4o` (W5.3 — tone-sensitive, want top-tier output) | Reassess after first 100 sends                        |
| Kennisbank compile   | `gpt-4o-mini` (W11.3 — bounded structured output)      | Reassess on prompt-tuning iteration                   |
| Retention            | `store: false` on every call per D24                   | Non-negotiable for GDPR posture                       |
| Retries              | SDK built-in budget (429 / 5xx / network)              | No custom retry layer                                 |
| Structured output    | `zodTextFormat` (Responses API per D23)                | Drop-in `zodResponseFormat` if Chat Completions ever wins |

## Why we skipped the Mistral / Anthropic spike

The W5.1 plan originally called for a comparison spike against Mistral and Anthropic on the W4 fixtures. We're skipping it at MVP for three reasons:

1. **W4 accuracy is already past launch threshold.** Classifier: **97.7% accuracy** on a 43-fixture Dutch corpus (validated against the live API). Extractor: **100% per-fixture pass rate** on 23 fixtures (≥6 of 8 fields acceptable per fixture). Both numbers exceed what we'd need for a public beta. The spike was always about cost optimization + accuracy-vs-cost tradeoffs, not "can we ship?"

2. **The `AI_CLIENT` seam (D22) makes a future switch mechanical, not architectural.** `OpenAIClient` implements the `AIClient` interface. Adding `MistralClient` or `AnthropicClient` is a sibling file + a one-line `useExisting:` change in `AiModule`. Caller code (`ClassifierService`, `ExtractorService`, future `ReplyDraftService`) never sees the swap. So the cost of deferring the spike is "we may run on OpenAI for a few months longer than optimal" — not "we have to rewrite anything."

3. **MVP volume doesn't justify the spike yet.** Pre-launch we have zero customers. The cost slice of the eventual decision (€/1k extractions) needs real-world traffic to interpret; running the spike now would produce numbers we'd then have to re-validate against real customers anyway.

## When to revisit

Revisit the multi-provider spike when **any** of these is true:

- First 50 paying customers' monthly OpenAI cost crosses a threshold worth optimizing (estimate: when monthly bill exceeds ~€500 — at that point a 30% cost win pays for a week of engineering).
- A specific accuracy failure mode surfaces that's known to be model-dependent (e.g. one provider handling Dutch idioms better).
- A customer's data-residency requirement can't be met by Azure OpenAI EU (unlikely — EU presence covers GDPR + customer trust).
- A provider releases a model that materially shifts the latency / accuracy / cost frontier.

## EU data residency posture

- Production deployments configure `AZURE_OPENAI_ENDPOINT` → routes traffic via Azure OpenAI EU regions (Frankfurt or Sweden, per W14d / Phase 5.6 GDPR readiness).
- Dev uses OpenAI direct (US) — acceptable because no customer data is in the dev environment.
- `store: false` on every call eliminates the 30-day retention on whichever provider is in front (Azure or direct), so customer data never sits at-rest on the provider's side.

## Adding a new provider later

1. New file `apps/api/src/modules/ai/clients/<provider>-client.service.ts` implementing the `AIClient` interface.
2. Add `Provide<Provider>Client` to `AiModule.providers`.
3. Switch `AI_CLIENT` binding to `useExisting: <Provider>Client`.
4. Run the accuracy harnesses (`pnpm test:ai`) against the new provider to confirm parity.
5. Update this doc with the new provider's defaults + retain the OpenAI defaults section for rollback context.

That's it. No service rewrites, no DTO churn, no migration.
