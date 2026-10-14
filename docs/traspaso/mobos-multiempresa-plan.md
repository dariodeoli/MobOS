# MobOS multi-empresa (#377) — architect plan (2026-10-14)

Owner decisions taken (Dario asleep, all authorized): PIN on switch is skipped only when the current seller is that account's linked user, otherwise PIN screen; billing per company stays as today (each company its own plan, no new billing work); invited MEMBERs see the switcher only if they have ≥2 active memberships.

## Current
- Tenant holds login email/password (schema.prisma:31,:34, unique email); login finds one tenant by email (backend/lib/auth.ts:285-287); register refuses an email with a tenant (backend/app/api/auth/register/route.ts:36-39).
- User = PIN profile inside one tenant (schema.prisma:316, @@unique([tenantId,email]) :372).
- Session opaque, tenant from DB (schema.prisma:443-466), valid only if user+session same tenant (auth.ts:241-242). Cookies: company + seller (backend/lib/google-oauth.ts:41-42).
- Already multi-company via Google only: GoogleIdentity, GoogleStoreAccess (schema.prisma:154-173), picker backend/lib/google-company.ts:64-79, create :30-47, switch revokes previous session (backend/app/api/auth/google/complete/route.ts:25-27), account list (backend/app/api/account/route.ts:53-58), "Crear otra tienda" restarts Google (src/components/config/TiendasSucursales.jsx:142-145).
- x-tenant-id only in CORS list (backend/middleware.ts:58), never read. sucursalEfectiva per tenant+user (fine).
- Frontend: company context src/lib/api/session.js:46-56; mirror per tenant src/lib/storage.js:78-79; snapshot src/lib/offline/snapshot.js:8; cart src/lib/posCart.js:13-15.
- GAP: offline sales queue has no tenant (src/lib/offline/queue.js:100-113, ventas.js:12-18) → after a switch a queued sale from A would be sent with B's session.

## Target
- Account(id, email unique lowercase nullable, googleSubject unique nullable, timestamps). TenantMembership(accountId, tenantId, userId → that person's User in that tenant, role OWNER|ADMIN|MEMBER, revokedAt, lastUsedAt, unique(accountId,tenantId)). Keep GoogleStoreAccess, dual-write.
- Session.accountId additive; requireSession rejects if membership revoked. tenantId ONLY from session.
- POST /api/auth/switch-tenant {tenantId}: same-origin, account session, active membership, non-archived tenant, rate-limited; one tx revokes both sessions, creates company session (+ seller session only if current seller is the account's linked user, else PIN screen); audit TENANT_SWITCH_OUT/IN; returns {tenant, sellers, onboardingRequired} like login.
- GET /api/auth/tenants → active memberships {id,name,slug,role,current}; account route list moves here.
- POST /api/auth/companies {companyName}: account + OWNER in current tenant, rate-limited; like google-company.ts:44-48 (tenant without email, ADMIN user with unusable PIN, adminPinPending, ADMIN email = account email); OWNER membership; switch into it. "Crear otra tienda" uses this.
- Login/register/Google: find-or-create Account+Membership in same tx; email links only with proof (tenant password or Google subject); keep takeover guard google-company.ts:37-42.
- Invitations accept-by-id with account session → MEMBER membership. Leave/delete revoke memberships.
- SelectorEmpresa next to SelectorSucursal in AppShell header; visible with ≥2 companies or can create; ends with "Crear empresa"; switching: check offline queue → endpoint → clear context → full reload to /.
- Offline: stamp tenantId(+userId) on queued sales; sender only sends current tenant's; others shown "Pendiente en otra empresa", kept; legacy items get the active tenant on first load; switcher warns on pending; server rejects order whose branch isn't in session tenant.

## Migration 20270104000000_tenant_membership (additive, re-runnable)
DO $$ guard CREATE TYPE "MembershipRole"; CREATE TABLE IF NOT EXISTS Account, TenantMembership; CREATE UNIQUE INDEX IF NOT EXISTS; FKs in DO blocks (account/tenant cascade, user set null); ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "accountId" + index. Backfill with deterministic ids ('acc_g_'||md5(subject), 'acc_e_'||md5(lower(email)), 'mem_'||md5(accountId||tenantId)) ON CONFLICT DO NOTHING: account per GoogleIdentity + memberships from GoogleStoreAccess (owner→OWNER else ADMIN); account per Tenant.email with password + OWNER membership; membership.userId = oldest active ADMIN with matching email else oldest ADMIN; timestamps CURRENT_TIMESTAMP AT TIME ZONE 'UTC'. Check: run twice no change; no non-archived tenant with email/Google owner lacks OWNER membership; db:check clean.

## Security tests
1 switch to non-member/revoked/archived → 403, no session, audit. 2 spoofed x-tenant-id / body tenantId ignored; remove x-tenant-id from CORS. 3 old cookies 401 after switch; old bearer replay fails. 4 revoked membership → next request fails. 5 membership.userId of another tenant rejected. 6 email-only linking impossible. 7 seller list after switch only target tenant. 8 company creation rate-limit 429, MEMBER can't create, adminPinPending. 9 frontend: after A→B nothing from A visible; queued offline sale in A not sent in B, sent after switching back. 10 leave/delete revoke memberships.

## Work units
- WU1 infra schema+migration+backfill test (backend/prisma/schema.prisma, migrations/20270104000000_tenant_membership/migration.sql, backend/tests/*.mjs). Verify prisma:validate, db:check (isolated), test:unit.
- WU3 ui offline queue per tenant (src/lib/offline/queue.js, ventas.js, queue indicator, queue.test.js). Verify npm test, lint, build.
- WU2 auth backend (after WU1): auth.ts, new lib/membership.ts, google-company.ts, auth/{login,register,google/complete}, new auth/switch-tenant, auth/tenants, auth/companies, account/route.ts, user-invitations/accept-by-id, middleware.ts:58, tests 1–8. Verify test:unit, integration-http, backend build.
- WU4 ui switcher+create (after WU2+WU3): src/components/shared/SelectorEmpresa.jsx, AppShell.jsx header, src/lib/api/session.js (switchTenant, createCompany, listTenants), TiendasSucursales.jsx, e2e spec. Test 9.
QA review on all (auth/DB).
