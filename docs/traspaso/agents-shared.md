# Shared rules for every MobOS role

Repo: MobOS (dariodeoli/MobOS) — Vite/React frontend (src/) + Next.js/Prisma/Postgres backend (backend/), POS/ERP SaaS for phone shops in Paraguay (guaraníes). Rules of record: AGENTS.md, docs/RELEASE.md (prevails over AGENTS.md on release), docs/CAMPOS.md, docs/TABLAS.md, docs/TOKENS.md.

## Shared rules
- Work only inside your scope and your assigned worktree/branch. Anything else is a handoff for the integrator.
- Never push, open PRs, bump versions, run release:prepare/release:publish, deploy, send email or touch production DB/env. Commit locally on your branch only.
- Small conventional commits (`feat(area): ...`, `fix(area): ...`, `Refs #NNN`). No Co-Authored-By or AI attribution lines.
- UI copy in Spanish as in the app. Identifiers and comments follow repo conventions.
- Real bug: fix source + keep/add a test. Stale test: update keeping intent. Never delete assertions, `.skip`, or weaken permissions/fixtures to go green.
- E2E: isolate with unique MOBOS_E2E_PGDATA/PGPORT/API_PORT/WEB_PORT/DB; never kill by port; clean only your own cluster.
- Never read .env secrets or infer a DB target from someone else's .env.
- Shell: rg/fd/eza or Read/Edit tools (no cat/grep/find/sed/ls). Prisma, Postgres and Chromium may need to run outside the sandbox.

## Before you report (QA acceptance — meet all first)
- List each acceptance criterion of the task with pass/fail.
- Tenancy: queries scoped by tenant/branch; permissions never widened.
- Money: guaraníes, full amounts (no ellipsis), idempotent writes, no double counting.
- UI: light/dark, 375px without horizontal scroll, 44px targets, contrast >= 4.5, keyboard + Esc on overlays.
- Migrations additive only; no DROP COLUMN.
- Errors logged, never swallowed.

## Token economy
- Use the brief/map you were given; do not re-explore the repo.
- Iterate with related tests only; full suite once at the end (writer only).
- Max 6 screenshots per task. Stop background monitors before reporting.
- Fix rounds: resumed if under ~300k tokens, otherwise a fresh agent gets a short brief.
- Max 3 agents in parallel on this machine; a timed-out suite is reported, not blindly re-run.
- Report approximate token use.

## Report format
1. Status: done | partial | blocked
2. Branch / worktree and commits (hash + subject)
3. What changed and why
4. Verification: `<command>: <observed result>`
5. Handoffs and open questions (max 3)
5. Approx. tokens used

## Roles (launch as general-purpose with this model; brief says "follow role mobos-<x> in .claude/agents-shared.md")
| Role | Model | Writes | Scope |
|---|---|---|---|
| mobos-ui | sonnet | yes | src/components/app, ventas, landing, src/pages, e2e/frontend |
| mobos-ops | sonnet | yes | stock, taller, entregas, conciliación (src/components/control, delivery + backend routes) |
| mobos-crm | sonnet | yes | customers, RUC/OwnData, fiscal identity, SIFEN, email templates/outbox |
| mobos-pay | sonnet | yes | backend/lib/billing (PagaYa, policy, coupons); no live keys |
| mobos-infra | sonnet | yes | CI, Prisma/migrations, scripts/release, E2E harness, build gates |
| mobos-qa | sonnet | no | review a branch: verdict + findings by severity (file:line, failure scenario) |
| mobos-mapper | haiku | no | short file/line map, <=30 lines |
| mobos-architect | opus | no | staged plan with acceptance criteria for DB, money, auth, release |
