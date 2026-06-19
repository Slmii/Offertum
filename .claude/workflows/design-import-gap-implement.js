export const meta = {
  name: 'design-import-gap-implement',
  description: 'Import the Claude Design project, audit every surface against the codebase, implement gaps (with mock data for unbacked features), verify, and summarize.',
  phases: [
    { title: 'Inspect', detail: 'DesignSync import + inventory design surfaces' },
    { title: 'Audit', detail: 'one agent per surface: design vs codebase gap report' },
    { title: 'Implement', detail: 'sequential implementers for each actionable gap' },
    { title: 'Verify', detail: 'typecheck + lint + test, fix until green' },
    { title: 'Summarize', detail: 'final report: gaps, changes, mock assumptions, follow-ups' }
  ]
}

const PROJECT = '882630e9-132f-4d16-a102-fe5e17136c93'
const WEB = '/Users/selami/Documents/Personal/Offertum/apps/web'

const CONVENTIONS = [
  'Routes: TanStack Router createFileRoute. Route GETs use createServerFn + queryOptions + route loader (ensureQueryData) + useSuspenseQuery — NEVER bare useQuery for route data (on-demand interactions like search may use useQuery). Mutations: useMutation + the api() client.',
  'Design-system typography: use components from @/components/Text.component (Display/H1/H2/H3/Body/BodySmall/Label/Overline/Mono) — NOT MUI <Typography variant=...>. Set color via the `color` prop and weight via the `fontWeight` prop with NAMED values (normal|medium|bold) — never numeric weights, never sx for color/weight on these components. Non-Typography elements (Box/Button) use sx with named fontWeight.',
  'Spacing: space siblings with a MUI Stack spacing/gap, not per-element mb/mt (individual margins only when spacing genuinely differs).',
  'Icons: use @/components/AppIcon.component (Tabler-backed). Add any new icon to that registry paired outline+filled with currentColor — do not import @tabler/icons-react ad hoc.',
  'Use theme tokens via useTheme().tokens (colors/radius/shadow/layout/motion). Settings pages live under routes/(app)/settings and are reachable via SettingsNav.component.tsx.',
  'Preserve existing functionality unless the design clearly requires a change. Responsive + accessible (semantic elements, aria labels, keyboard handling where relevant).',
  'Unbacked features (no API in apps/api): implement the FRONTEND with TYPED mock data / local fixtures, clearly separated from production logic — a dedicated `*.mock.ts` file or a clearly-commented MOCK_* constant — so it can later be swapped for a real backend. State the mock assumptions.',
  'Do NOT git commit. Match the surrounding code style.'
].join('\n- ')

const SURFACE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    surfaces: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          name: { type: 'string' },
          designPath: { type: 'string' },
          intendedRoute: { type: 'string' },
          kind: { type: 'string', enum: ['page', 'component', 'flow', 'state'] }
        },
        required: ['name', 'designPath', 'intendedRoute', 'kind']
      }
    },
    notes: { type: 'string' }
  },
  required: ['surfaces', 'notes']
}

const AUDIT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    name: { type: 'string' },
    status: { type: 'string', enum: ['covered', 'partial', 'missing', 'inconsistent', 'design-only-no-backend'] },
    codebaseTarget: { type: 'string' },
    backed: { type: 'boolean' },
    gaps: { type: 'array', items: { type: 'string' } },
    recommendation: { type: 'string' }
  },
  required: ['name', 'status', 'codebaseTarget', 'backed', 'gaps', 'recommendation']
}

const IMPL_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    name: { type: 'string' },
    done: { type: 'boolean' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    mockAssumptions: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
    remaining: { type: 'string' }
  },
  required: ['name', 'done', 'filesChanged', 'mockAssumptions', 'notes', 'remaining']
}

const VERIFY_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    typecheckPass: { type: 'boolean' },
    lintPass: { type: 'boolean' },
    testPass: { type: 'boolean' },
    fixesApplied: { type: 'array', items: { type: 'string' } },
    details: { type: 'string' }
  },
  required: ['typecheckPass', 'lintPass', 'testPass', 'fixesApplied', 'details']
}

// ── Inspect ──────────────────────────────────────────────────────────────────────────
phase('Inspect')
const inspect = await agent(
  `Inventory the UI surfaces of a Claude Design project so they can be audited against our codebase.\n` +
  `1. Load the MCP tool: call ToolSearch with query "select:DesignSync".\n` +
  `2. DesignSync method=list_files projectId="${PROJECT}" — list all files.\n` +
  `3. DesignSync method=get_file for "src/app.jsx" (the prototype router — reveals route↔page mapping) and "design-system/colors_and_type.css" (token system).\n` +
  `4. Produce the inventory of distinct DESIGN SURFACES the PRODUCT implements: pages, shared components, and notable flows/states/interactions. For each give name, designPath (the src file under the project), intendedRoute (the route in our app, e.g. /opportunities, /settings/email, or "" for shared components/flows), and kind.\n` +
  `EXCLUDE prototype-only scaffolding: app.jsx router wiring, data.js mock data, tweaks-panel.jsx, the DevToolbar. INCLUDE every real page (Opportunities, OpportunityDetail, QuoteBuilder, Calendar, Catalogus, Prijsregels, all Settings tabs, Team, Billing, Admin) and shared surfaces (Shell/Sidebar/TopBar, global search + notifications, Timeline, modals, entitlement/upsell states, AvailabilityPicker).\n` +
  `Return ONLY the structured object.`,
  { schema: SURFACE_SCHEMA, label: 'inspect-design', phase: 'Inspect' }
)
const surfaces = (inspect && inspect.surfaces) ? inspect.surfaces : []
log(`Inspect: ${surfaces.length} design surfaces inventoried`)

// ── Audit (parallel, read-only) ──────────────────────────────────────────────────────
phase('Audit')
const audits = (await parallel(surfaces.map((s) => () =>
  agent(
    `Audit whether the Claude Design surface "${s.name}" is fully implemented in our codebase at ${WEB}.\n` +
    `Design file: ${s.designPath}. Intended product route: ${s.intendedRoute || '(shared component/flow)'}.\n` +
    `Steps:\n` +
    `1. Load DesignSync: ToolSearch "select:DesignSync". Read the design file: DesignSync method=get_file projectId="${PROJECT}" path="${s.designPath}". Note its key elements, states, and interactions.\n` +
    `2. Find the codebase counterpart with Grep/Glob/Read. Routes: ${WEB}/src/routes/(app)/**. Shared components: ${WEB}/src/components/**. Design system: ${WEB}/src/lib/utils/theme.utils.ts, Text.component.tsx, AppIcon.component.tsx. Check apps/api/src for backend support of the feature.\n` +
    `3. Compare and classify status: covered | partial | missing | inconsistent | design-only-no-backend (design feature with NO backend API).\n` +
    `4. Report concrete gaps (specific missing elements/states/interactions), codebaseTarget (the file to create or edit), backed (true if a real backend feature exists), and a one-line recommendation.\n` +
    `Read the REAL files — much has already been implemented (theme, shell, settings nav, integrations demo, global search, notification tabs). Mark fully-done surfaces "covered". Return ONLY the structured object.`,
    { schema: AUDIT_SCHEMA, label: `audit:${s.name}`, phase: 'Audit' }
  )
))).filter(Boolean)

const actionable = audits.filter((a) => a.status !== 'covered')
log(`Audit: ${audits.length} surfaces checked — ${actionable.length} need work, ${audits.length - actionable.length} already covered`)

// ── Implement (sequential — shared working tree, conflict-free) ───────────────────────
phase('Implement')
const implemented = []
for (let i = 0; i < actionable.length; i++) {
  const gap = actionable[i]
  const r = await agent(
    `Implement the design gap for surface "${gap.name}" in ${WEB}.\n` +
    `Audit findings: ${JSON.stringify(gap)}.\n\n` +
    `Conventions you MUST follow:\n- ${CONVENTIONS}\n\n` +
    `Read the design file again if needed (ToolSearch "select:DesignSync"; DesignSync get_file projectId="${PROJECT}" path="${gap.name}"-related). Read the existing codebase target and matching sibling files first, then implement faithfully — match the design's layout, states, and interactions.\n` +
    `If the feature is design-only-no-backend or backed=false, build the frontend with typed mock data in a clearly-separated, clearly-commented module so it can be swapped for a real API later.\n` +
    `If you ADD a new route file, regenerate the TanStack route tree: cd ${WEB} && (pnpm dev > /tmp/wf-dev.log 2>&1 &) ; poll until grep finds the new path in src/routeTree.gen.ts ; then pkill -f "vite dev" (match "vite dev" only). Run \`pnpm --filter @offertum/web typecheck\` for the files you touched and fix issues before returning.\n` +
    `Return the structured result.`,
    { schema: IMPL_SCHEMA, label: `impl:${gap.name}`, phase: 'Implement', effort: 'high' }
  )
  if (r) implemented.push(r)
}
log(`Implement: ${implemented.length} surfaces implemented (${implemented.filter((x) => x.done).length} done)`)

// ── Verify ───────────────────────────────────────────────────────────────────────────
phase('Verify')
const verify = await agent(
  `Verify the web app from /Users/selami/Documents/Personal/Offertum. Run, in order:\n` +
  `1) pnpm --filter @offertum/web typecheck\n2) pnpm --filter @offertum/web lint\n3) pnpm --filter @offertum/web test\n` +
  `If typecheck or lint fails because of changes made this run, FIX the errors (follow the same design-system conventions: typography components, color/fontWeight props, named weights, AppIcon, Stack spacing) and re-run until green or you hit a genuine blocker. Do NOT git commit.\n` +
  `Conventions reference:\n- ${CONVENTIONS}\n\n` +
  `Return the structured result (pass flags + any fixes applied + concise details).`,
  { schema: VERIFY_SCHEMA, label: 'verify', phase: 'Verify', effort: 'high' }
)
log(`Verify: typecheck=${verify && verify.typecheckPass} lint=${verify && verify.lintPass} test=${verify && verify.testPass}`)

// ── Summarize ────────────────────────────────────────────────────────────────────────
phase('Summarize')
const summary = await agent(
  `Write the final report for a Claude-Design → codebase implementation pass. Use the data below.\n\n` +
  `AUDITS:\n${JSON.stringify(audits, null, 1)}\n\n` +
  `IMPLEMENTED:\n${JSON.stringify(implemented, null, 1)}\n\n` +
  `VERIFY:\n${JSON.stringify(verify, null, 1)}\n\n` +
  `Produce concise GitHub-flavored markdown with exactly these sections:\n` +
  `## Design gaps found  (group by status; note which were already covered)\n` +
  `## UI changes implemented  (per surface: what + files)\n` +
  `## Backend / mock-data assumptions  (every mock fixture added and what real API would replace it)\n` +
  `## Remaining gaps / follow-up work  (incl. anything that needs a real backend)\n` +
  `Then one line on verification status (typecheck/lint/test). Be specific and accurate to the data; do not invent results.`,
  { label: 'summary', phase: 'Summarize', effort: 'high' }
)

return {
  surfacesInventoried: surfaces.length,
  audited: audits.length,
  covered: audits.length - actionable.length,
  implemented: implemented.length,
  verify,
  summary
}