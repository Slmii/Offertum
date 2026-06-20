# GitHub Actions — setup

This repo ships three workflows under [`.github/workflows/`](./workflows):

| Workflow                                  | Trigger                                   | What it does                                                                                                              |
| ----------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [`ci.yml`](./workflows/ci.yml)            | push to `main` + `workflow-audit/**`, PRs | Install → Prisma generate → typecheck → lint → test → build.                                                             |
| [`ai-audit.yml`](./workflows/ai-audit.yml) | push to `main`                            | A Claude agent audits the pushed diff; if it finds real issues it opens a `workflow-audit/*` PR titled `AI Audit: …`.   |
| [`pr-review.yml`](./workflows/pr-review.yml) | every pull request                      | A second, independent Claude agent reviews the PR and posts findings as a review comment (review-only — never pushes).   |
| [`apply-review.yml`](./workflows/apply-review.yml) | PR labeled `apply-ai-review`        | A third Claude agent reads the PR's review comments, applies the actionable ones, validates, pushes to the PR branch, then removes the label and comments a summary. |

The agents chain: the audit opens a PR → that PR triggers `pr-review.yml` (second-agent review) and `ci.yml` (typecheck/lint/test/build) → a human reads the review and, if they want the feedback applied, adds the `apply-ai-review` label → `apply-review.yml` applies it and pushes back to the same PR.

## One-time setup

These workflows depend on repo configuration that is **not** in the files. Until it exists, the AI workflows fail at their first secret reference.

### 1. Secret `ANTHROPIC_API_KEY` — required by `ai-audit` + `pr-review`

Settings → **Secrets and variables → Actions → New repository secret**

- **Name:** `ANTHROPIC_API_KEY`
- **Value:** an Anthropic API key with billing/credit. The workflows use the `claude-sonnet-4-6` model (bump to `claude-opus-4-8` in the workflow's `claude_args` for deeper, pricier audits).

### 2. Secret `AUDIT_PR_TOKEN` — required by `ai-audit`

A **fine-grained Personal Access Token** (or GitHub App installation token). The audit creates its branch + PR with this token instead of the built-in `GITHUB_TOKEN`, so the resulting PR **triggers** `pr-review.yml` and `ci.yml`. (PRs opened by the default `GITHUB_TOKEN` deliberately do not trigger other workflows.)

1. github.com → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. **Resource owner:** your account · **Repository access:** Only select repositories → this repo.
3. **Repository permissions:** `Contents` = **Read and write**, `Pull requests` = **Read and write**.
4. Generate and copy the token.
5. Repo → Settings → Secrets and variables → Actions → New repository secret → **Name** `AUDIT_PR_TOKEN`, paste the value.

### 3. Branch protection on `main` — important

Because `AUDIT_PR_TOKEN` has write access, protect `main` so changes can only land via a reviewed PR:

Settings → **Branches** (or **Rules → Rulesets**) → rule for `main`:

- ✅ Require a pull request before merging
- ✅ Block force pushes

### 4. Create the `apply-ai-review` label — required by `apply-review`

The apply workflow is triggered by adding a label. Create it once: repo → **Issues → Labels → New label** → name it exactly `apply-ai-review` (any color/description). Then, to apply an AI review's feedback to a PR, add that label to the PR; the agent applies it, pushes, and removes the label. Re-add to run another pass.

### `GITHUB_TOKEN` — nothing to do

`pr-review.yml` uses the auto-provided `secrets.GITHUB_TOKEN`. It only **comments** on PRs (`gh pr review --comment` — never approve/create), so the "Allow GitHub Actions to create and approve pull requests" org/repo toggle is **not** required.

## Verifying

Watch the **Actions** tab:

- **CI** runs on every push to `main` and on PRs.
- **AI Audit** runs on your next push to `main` (needs secrets 1 + 2). If it finds issues, look for a new `workflow-audit/*` PR.
- **AI PR Review** runs on any opened/updated PR — including the audit's PR — and leaves a review comment.
- **Apply AI Review** runs when you add the `apply-ai-review` label to a PR; watch it push a commit and comment a summary, then drop the label.

Most common first-run failures: a missing or un-funded `ANTHROPIC_API_KEY`, or an `AUDIT_PR_TOKEN` lacking the two permissions above.

## Safety notes

- The AI agents treat the diff/PR contents as **untrusted input** and run with a scoped tool allowlist (no arbitrary shell).
- `pr-review.yml` is review-only: `contents: read`, no `Edit`/`Write` tools, so it cannot modify code or loop.
- `ai-audit.yml` skips its own bot pushes and audit-PR merges (`AI Audit:` commit-message guard) to avoid re-audit loops.
- `apply-review.yml` is human-gated (only runs on the `apply-ai-review` label) and pushes with the default `GITHUB_TOKEN`, so its commit does not re-trigger `pr-review.yml`/`ci.yml` — no review↔apply ping-pong. It only applies high-confidence feedback and reports what it skipped.
