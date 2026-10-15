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
- Product direction (Dario, 14-10-2026): MobOS is «Shopify adapted to phone shops, mobile first». Dario has used Shopify admin + POS for 6 years, so ADAPT existing MobOS screens (POS, Pedidos, Clientes, Productos/Stock, Configuración) to Shopify's patterns — same structure, naming, page layouts (list → detail page with main column + right side column, settings as rows with «›»/Gestionar, KPI strip with period selector, filters as tabs, «Más acciones», prev/next arrows) — instead of inventing new UI or rebuilding features. Keep MobOS-specific needs (IMEI/serial units, guaraníes, RUC, multiempresa, taller). Mobile 360/390 first. Shopify screenshots are reference models, not specs: where MobOS is already better (e.g. premium receipts/tickets), keep MobOS and only borrow missing details; compare with the current screen before changing it.
- Receipts/printables (Dario, 14-10-2026): the approved standard is the premium sale receipt (#407): logo + company header, colored small-caps doc type, big number, CLIENTE/PEDIDO/PAGO/GARANTÍA blocks, «Total» as a bold big line (no boxed totals), QR + link footer. Every printable (incl. test prints) uses that same header/footer and style.
- UX density (Dario, 14-10-2026), check proactively on every screen you touch:
  - One control per state: a chosen result (client, supplier, device) replaces its search box with a compact one-row card + change/remove icons; removing brings the search back focused.
  - No redundant UI: never the same value, title or status twice on screen.
  - Inputs sized by content in ≥768px (phone, CI/RUC, email, city, country are not full width); short fields share a row; full width on mobile. Use the shared field components (docs/CAMPOS.md) so a fix applies app-wide.
  - List screens: search + chips + sort + view + primary action in ONE toolbar row on desktop; KPI strip one line, no redundant subtext.
  - Details and previews open as a centered modal with a large red close X, never a panel stuck to the right.
- Migrations additive only; no DROP COLUMN.
- Errors logged, never swallowed.

## Token economy (Dario, 15-10-2026 — plan de ahorro)
- Use the brief/map you were given; do not re-explore the repo or «review the whole repo». If you must read 4+ files to locate things, ask for (or run) a mobos-mapper (haiku) first.
- Writer: related tests while working; full suite ONCE at the end. QA: reads the diff and runs only its area's tests — no full suite, no database. Integrator runs everything once after joining branches.
- Max 3 screenshots per task, only if the task changes the screen; prefer reading text / measuring with JS.
- Never paste long logs: only the failing lines.
- Fix rounds: resume only under ~300k tokens; otherwise a fresh agent with a ≤10-line brief. Small QA fixes are done by the integrator, not a new agent.
- One QA review per release batch (joined branches), not per branch. QA model: sonnet for money/permissions/DB/security; haiku for screens and copy.
- Max 3 agents in parallel, touching different files; same-area work goes in series. A timed-out suite is reported, not blindly re-run. Never relaunch an agent «just in case»: wait for its report.
- Decisions go to docs/ (and engram) so nobody re-explains or re-explores.
- NEVER run git checkout/switch in /Users/dario/Documents/GitHub/MobOS (main checkout) — only in your worktree.
- ALWAYS finish by delivering your report.

## Report format (8–12 lines max)
1. Status: done | partial | blocked
2. Branch and commits (hash + subject)
3. Acceptance criteria: pass/fail each
4. Verification: `<command>: <result>` (only failing lines if any)
5. Up to 3 open questions
6. Approx. tokens used

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
