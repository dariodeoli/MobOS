# OwnData RUC server prerequisite — private account pilot

Date: 2026-10-11. Branch: `codex/mobos-nav-v2`. Base HEAD: `d54e674e831c52c81f9a35b99d913c8eb3d08a08`.
Initial status (2026-10-11): implemented server prerequisite; full backend verification blocked by missing dependencies. The dated appendices below supersede local verification and owner-binding limitations only. Not a completed frontend integration or production release; pilot remains disabled pending real principal verification and runtime configuration.

## Owner-facing changes

- OwnData lookup is restricted to the individual pilot account, not everyone in its tenant.
- Official names retain their exact source spelling, punctuation and whitespace in lookup responses.
- Manual entry remains available when lookup is unavailable or a quota is exhausted.

## Contract and design boundary

`GET /api/ruc?ruc=...` retains authenticated seller-session validation, tenant/user account quota fingerprint, installation quota, and minimal success audit. The account limit remains 12/hour; installation limit remains 90/31 days (existing server overrides unchanged). Quotas remain transactional through the existing AuthAttempt implementation. Audit stores only RUC suffix/provider, never the official name or fiscal payload.

The upstream is fixed to `GET https://app.controlaria.online/api/v1/ruc/{ruc}`. Only runtime `RUC_API_KEY` supplies `X-API-Key`; SUN settings, browser settings and configurable provider URLs are ignored. No redirects, retry, or cache; timeout is 8 seconds including body consumption, with a 65,536-byte streamed response ceiling. Unknown upstream fields/diagnostics are dropped. A credential reflected in otherwise allowed output rejects the response rather than modifying official values.

Input accepts 1–9 base digits without leading zero, optional explicit `-DV`, and existing point/space formatting. Explicit DV is checked using the existing SIFEN modulo-11 algorithm. A ninth bare digit is part of the base, never reinterpreted as a verifier. `data.ruc`, `data.dv`, and `data.fullRuc` must correspond to the request and calculated DV.

`result.nameOfficial` is the exact raw official string; compatibility `result.name` is the same string, not reordered or truncated. `equivalenceRaw` and `stateRaw` are preserved. Legacy `state` is a raw alias, not a normalized classification; unavailable SUN enrichment fields are null. Documented requestId and allowlisted environment/quota/accounting/provenance metadata are retained when valid. No taxpayerType, givenNames, surnames, nameNatural, or nameParsing is fabricated. All route responses, including authentication failures and unexpected errors, are `Cache-Control: private, no-store`.

Upstream 429 stays 429 with a validated positive integer `Retry-After`, plus `details.quotaRetryAfter`; other diagnostics are never echoed. Existing account/installation quota Retry-After and manual-entry details remain. Provider 401/403 become safe 503 configuration-unavailable responses.

## Exact activation prerequisites (not configured here)

Set server runtime `RUC_API_KEY` to the authorized OwnData credential through the parent's secure credential workflow. Set server runtime `RUC_PILOT_OWNER_EMAIL=dariodeoli@gmail.com` AND `RUC_PILOT_USER_ID` AND `RUC_PILOT_TENANT_ID` to the independently verified existing owner's persisted User.id and Tenant.id. No real IDs were inspected or configured here; never populate production with test IDs or placeholders. Missing/blank ID configuration or any other owner-email value fails closed with `pilot_not_configured` (503). A different persisted user/tenant pair fails with `pilot_forbidden` (403), including another seller using the same email. Both denials precede installation lookup, quota consumption, provider requests and success audit.

The trusted seller session must resolve to a User in that exact tenant whose persisted id and tenantId match BOTH runtime ID allowlist values and whose stored email equals the pilot owner. Its related Tenant must have the same email and a non-null `emailVerifiedAt`. The latter verifies the tenant email, NOT personal/Google ownership. SessionContext does not expose email; the route reads the User with both trusted session userId and tenantId, selecting persisted id/tenantId rather than request claims. User itself has no email-verification field and its email is editable/nonunique. GoogleIdentity has no persisted email or direct seller-user identity binding, so no Google-owner policy or verified Google principal is claimed. Header/query email or ID claims never grant access. No role policy is broadened.

This is deliberately narrower than tenant ownership or email equality alone: an admin with missing User.email, another seller with the same email, or a tenant without verified matching email is denied. Confirm the real owner's existing principal/tenant pair before enabling the pilot; do not populate arbitrary user emails or IDs to bypass this guard. Until that independent evidence and secure runtime configuration exist, leave the pilot disabled. This offline patch does not establish real principal ownership.

## Regression and verification evidence

No real database, API, credentials, deployment, or dependency installation was used. Provider requests, session identity, audit writes and quota storage are mocked in the focused harness; it exercises the real normalization, quota-window implementation and provider mapper.

RED: with TypeScript borrowed read-only from the existing PagaYa dependency directory via NODE_PATH, the regression failed with `Missing expected exception` on the old invalid-DV/overlong-base acceptance. The unmodified exact invocation also exposed the missing local TypeScript dependency, which is an environment failure, not RED behavioral proof.

After source normalization, supplemental command:

`NODE_PATH=/Users/dariodeoli/Documents/GitHub/pagaya/node_modules node backend/tests/ruc.test.mjs`

Result: exit 0, **95 checks OK**. Covers raw long names; DV/identity mismatch; nine-digit base; allowlist/secret reflection; 401/403/429; malformed/oversized/stalled-body handling; exact byte boundary; private-pilot denial before quota/provider/audit; manual-entry and Retry-After; no-store on success/error; real quota algorithm with in-memory storage. This uses an existing compiler only, not PagaYa business logic or its database. It is not equivalent to a successful native backend build/typecheck.

Exact requested commands observed:

| Command | Outcome |
| --- | --- |
| `node backend/tests/ruc.test.mjs` | exit 1: cannot find module `typescript` |
| `npm --prefix backend run test:unit` | exit 1: cannot find module `typescript` |
| `npm --prefix backend run prisma:validate` | exit 127: `prisma: command not found` |
| `npm --prefix backend run build` | exit 127 at Prisma generation: `prisma: command not found`; Next build never started |
| `git diff --check` | exit 0 |

No env values were invented to unblock Prisma/build. No BUILD_ID or successful full-suite evidence exists. Parent must provision the backend dependencies and independently rerun the exact commands in an isolated, non-production environment; do not use live DB access to obtain build proof.

## Files and rollback

This single uncommitted work unit consists of `backend/lib/ruc.ts`, `backend/lib/ruc-owndata.ts` (new narrowly scoped stream/metadata helper), `backend/app/api/ruc/route.ts`, `backend/tests/ruc.test.mjs`, and this handoff. No frontend files, schema, migrations, auth module, test runner or deployment configuration were changed.

Operational rollback: remove `RUC_PILOT_OWNER_EMAIL` to disable lookup immediately, retaining manual entry. Code rollback: revert only this unit's tracked-file hunks and remove its new helper/handoff, without resetting any other working-tree file. Returning to the old adapter requires a separate provider/credential decision; pilot disable is preferable to automatic SUN fallback.

The six pre-existing dirty/untracked Conciliacion/spec/Stock artifacts were SHA-256 checked before/after and remain byte-identical. No commit, push, rebase or deploy was performed.

## Remaining integration and safety work

- Frontend OwnCoding UI `src/utils/taxId.js` still validates 5–8 base digits, so valid ninth-digit bases (and short bases) remain blocked before the server. It also shows the old incorrect `80012345-6` example. Neither library nor demo validation was changed here.
- Exact-name persistence is NOT implemented: customer creation still cleans/truncates `name` and `billingName` to 200 characters and may compose firstName/secondName. No raw official fiscal identity storage was added. Lookup response preservation does not prove saved-name preservation.
- Consumer/output safety audit remains open: raw official names must remain text, with escaping at every HTML/print/export boundary. The shared RucField uses React text rendering; this does not establish all downstream consumers are safe. No frontend/unsafe-consumer repairs or full security clearance are claimed.
- Credential UI/secure runtime setup, identity activation, independent verification, actual authorized pilot lookup, persistence, frontend compatibility and production smoke belong to later authorized work. No all-tenant rollout was authorized.

## Skill resolution

`skill_resolution: paths-injected`

Loaded before work: `/Users/dariodeoli/.codex/skills/work-unit-commits/SKILL.md`, `/Users/dariodeoli/.codex/plugins/cache/claude-cowork/engineering/1.2.0/skills/architecture/SKILL.md`, `/Users/dariodeoli/.codex/plugins/cache/claude-cowork/engineering/1.2.0/skills/testing-strategy/SKILL.md`, and repository `AGENTS.md`.


## Follow-up: bounded environment repair and native verification

Date: 2026-10-11 (local; execution logs extend into 2026-10-12 UTC). Status: **complete for this environment-repair/verification task**, pending parent's independent verification. Earlier missing-dependency outcomes above remain historical evidence; this appendix supersedes only that local verification limitation, not the frontend/persistence/activation/safety gaps.

### Setup, exact commands and isolation

The existing backend package-lock root matched package.json name, version, dependency and devDependency declarations before installation. No install lifecycle scripts were present. No package, lockfile, source or project configuration was edited.

1. `npm --prefix backend ci --ignore-scripts` — exit 0; installed 197 packages, audited 198. npm reported 8 vulnerabilities (1 moderate, 6 high, 1 critical). No audit-fix, package upgrade, lock repair or lifecycle script execution was performed.
2. `npm --prefix backend run prisma:generate` — exit 0; generated the locked Prisma Client v7.10.0. No migrate/seed/database command ran.

Prisma generation and all verification commands used an explicitly clean environment with only PATH, HOME and TMPDIR retained, plus these verification-only settings:

```sh
DATABASE_URL='postgresql://mobos_build_only@127.0.0.1:1/mobos_build_only?connect_timeout=1'
NEXT_TELEMETRY_DISABLED=1
NODE_OPTIONS='--require=/var/folders/k_/kb6z6bgj5vl_80y4xt33krvh0000gn/T/mobos-ruc-env-proof-hi80j8jh/no-tcp.cjs'
```

This is a synthetic, password-free, build-only URL at loopback port 1, not a real or live credential. Repository CI documents generation/build with a local PostgreSQL-format URL in `.github/workflows/ci.yml`; this task intentionally did NOT use its potentially active port 5432 or start the database harness. The temporary preload outside the repository replaces `net.Socket.prototype.connect` with a synchronous `MOBOS_VERIFICATION_TCP_BLOCKED` error, blocking all Node TCP connections before opening a socket. Thus even accidental persistence cannot connect to a database/provider. No NODE_PATH substitution, secrets, environment files, live identity provisioning, database connection, migration or API call was used.

The exact setup generation invocation was:

```sh
env -i PATH="$PATH" HOME="$HOME" TMPDIR="$TMPDIR" NEXT_TELEMETRY_DISABLED=1 DATABASE_URL='postgresql://mobos_build_only@127.0.0.1:1/mobos_build_only?connect_timeout=1' NODE_OPTIONS='--require=/var/folders/k_/kb6z6bgj5vl_80y4xt33krvh0000gn/T/mobos-ruc-env-proof-hi80j8jh/no-tcp.cjs' npm --prefix backend run prisma:generate
```

Each native check below ran once after setup, through a sequential subprocess harness with that same clean environment. The harness would stop immediately on the first nonzero exit; none occurred.

| Native command | Observed outcome |
| --- | --- |
| `node backend/tests/ruc.test.mjs` | exit 0; 95 checks OK using the installed backend TypeScript |
| `npm --prefix backend run test:unit` | exit 0; TAP reported 138 tests, 138 pass, 0 fail/cancelled/skipped; additional existing self-check logs also passed |
| `npm --prefix backend run prisma:validate` | exit 0; schema valid |
| `npm --prefix backend run build` | exit 0; Prisma generation, Next compile, typecheck/lint, 139/139 static-page generation and trace collection completed |
| `git diff --check` | exit 0 |

Observed build artifact: `backend/.next/BUILD_ID` = `r94ju2WB09nuSPCUxYd-c`. `/api/ruc` was listed as a dynamic route. This is a local optimized build, not deployment or production proof.

Unit-test caveat: four `error_report_persist_failed` diagnostics reported that the TCP guard blocked attempted errorReport persistence. The suite still exited 0. No socket/database connection or write occurred; this task does not claim database-backed error-report persistence was verified.

### Byte-preservation proof and retained output

Before setup, SHA-256 snapshots captured 7,616 tracked/nonignored files, including all RUC implementation files, package/lock/schema/config files and the six existing dirty Conciliacion/spec/Stock artifacts. After setup and native checks, there were **zero changed snapshot files and zero added nonignored files**. Only ignored dependency/generated build artifacts were created. The handoff's original bytes were preserved; this appendix is the sole permitted source-tree edit for the follow-up task.

Proof directory (temporary local evidence): `/var/folders/k_/kb6z6bgj5vl_80y4xt33krvh0000gn/T/mobos-ruc-env-proof-hi80j8jh`:

- `before.json`, `after-setup.json`, and `handoff-before.md` — snapshots and original handoff bytes.
- `npm-ci.log`, `prisma-generate.log` — complete setup output.
- `check-1.log` through `check-5.log`, `results.json` — complete native command output/exit codes.
- `no-tcp.cjs` — verification-only connection guard, outside the repository.

No commit, rebase, main modification, push, deploy, frontend implementation or package security remediation occurred. Parent independently verifies the frozen source bytes; earlier integration and safety follow-ups remain open. Skill resolution remains `paths-injected` with the same three exact skills and repository AGENTS.md reloaded before this task.


## Follow-up: P1 persisted owner allowlist binding

Date: 2026-10-12. Status: **bounded owner-binding fix complete; offline checks passed; pilot remains disabled pending independently verified real principal IDs and secure runtime configuration**. This corrects the email-only individual-binding claim in the original prerequisite. It is not real identity verification, deployment, or full OwnData integration.

### Security change and regression proof

The private pilot now requires explicit runtime `RUC_PILOT_USER_ID` AND `RUC_PILOT_TENANT_ID`, in addition to the fixed owner email, matching stored User/Tenant emails, and non-null tenant email verification. The route selects persisted User.id/tenantId using BOTH trusted seller-session IDs. The guard compares that persisted pair exactly with the runtime allowlist. No query/header email or ID claim participates in authorization; no role, frontend, schema, authentication or helper changes were made.

Missing/empty/whitespace ID configuration returns safe 503; a nonmatching configured pair returns safe 403. Regression cases prove a second authenticated seller using the same owner email, another tenant, persisted ID mismatch, mismatched Tenant.email, unverified tenant, missing IDs and wrong configured IDs/wildcard values are denied. Every denial preserves the quota/provider/audit/installation-call counters unchanged. Successful response quota remains `accountRemaining: 11`, `installationRemaining: 89` in the route fixture; the actual quota implementation is byte-identical to HEAD, including its default limits and overrides. The existing in-memory quota fixture is unchanged: it does NOT prove real database rollback/concurrency.

### Exact offline verification

All commands ran once, sequentially, stopping on first nonzero result (none occurred). Reused the current handoff's exact no-TCP preload, clean PATH/HOME/TMPDIR-only environment, telemetry disable and password-free synthetic loopback-port-1 DATABASE_URL. No environment file or real credential was read; no real database, provider request, production principal, runtime configuration, installation, commit, push or deployment was used.

| Exact command | Observed outcome |
| --- | --- |
| `node backend/tests/ruc.test.mjs` | exit 0; **188 checks OK** |
| `npm --prefix backend run test:unit` | exit 0; **138 tests / 138 pass**, zero failures/cancelled/skipped; RUC self-check also passed |
| `npm --prefix backend run prisma:validate` | exit 0; schema valid |
| `npm --prefix backend run build` | exit 0; Prisma generation, Next compilation/typecheck/static generation/trace collection completed; BUILD_ID `ndILtjitHw0-qdV_qPR4z` |

The final `git diff --check` result is recorded in `/tmp/mobos-ruc-owner-binding-proof/results.json` after this appendix is written. Four existing `error_report_persist_failed` diagnostics occurred under the no-TCP guard; database-backed error persistence remains unverified. Logs are `/tmp/mobos-ruc-owner-binding-proof/check-1.log` through `check-5.log`. Only local ignored generated build outputs were produced by verification; this is not production proof.

### Preservation, scope and rollback

This correction owns only `backend/lib/ruc.ts`, `backend/app/api/ruc/route.ts`, `backend/tests/ruc.test.mjs`, and this handoff. The existing `backend/lib/ruc-owndata.ts` helper is unchanged. SHA-256 comparison against the task-start non-env tracked/nonignored snapshot found no changes outside those four files, including unrelated dirty Conciliacion/spec/Stock artifacts; HEAD remains `d54e674e831c52c81f9a35b99d913c8eb3d08a08`, preserving the committed redesign. Final snapshot/readback is retained in `/tmp/mobos-ruc-owner-binding-proof/preservation.json`.

Rollback boundary: remove only this follow-up's ID allowlist/select/test/documentation hunks, not the earlier OwnData prerequisite or unrelated dirty work. Operationally prefer removing either pilot ID runtime variable (or owner-email configuration) to keep lookup disabled with manual entry available. Do not revert to email-only activation as a security workaround.

### Owner-facing changes

- Another seller cannot gain private lookup access merely by sharing the owner's email.
- Lookup remains disabled until the real owner's existing account and tenant IDs are independently verified and securely configured; no verified Google principal is claimed.
- Existing quota behavior and manual entry remain unchanged. Nothing was committed or deployed.

### Skill resolution

`status: complete` for this bounded offline fix only. `skill_resolution: paths-injected`.

Loaded before work: `/Users/dariodeoli/.codex/plugins/cache/claude-cowork/engineering/1.2.0/skills/code-review/SKILL.md`, `/Users/dariodeoli/.codex/skills/work-unit-commits/SKILL.md`, `/Users/dariodeoli/.codex/skills/memory/SKILL.md`, and repository AGENTS.md. Direct delegated executor work; no SDD artifacts or review transaction was created.
