# Billing identity timestamp-default parity — local checkpoint

Date:2026-10-12. Canonical issue [#345](https://github.com/dariodeoli/MobOS/issues/345); parent issue readback confirmed in `/tmp/mobos-billing-default-repair.md`. Status: local unit validated, NOT delivery/full-production PASS.

Root cause: the historical conditional missing-column backfill can leave CURRENT_TIMESTAMP on CustomerBillingIdentity.updatedAt, unlike fresh replay and the retained Prisma @updatedAt contract. New migration removes ONLY that default, with no historical-row updates; re-execution is harmless on the existing column.

Evidence: `/tmp/mobos-billing-default-independent.md`. Independent `env -i PATH="$PATH" HOME="$HOME" LANG=C TZ=UTC node --test backend/tests/billing-identity-default.test.mjs`: exit0,3/3 (fresh/legacy/parent), no failures/skips. Real isolated PostgreSQL coverage: drift negative control, schema parity, repeat repair, exact stored rows/timestamps, NOT NULL, raw omission/default rejection, explicit timestamp, inverse/reapply and Prisma create/update preserving createdAt. Owned cluster cleaned.

Writer checks retained, not rerun: `npm --prefix backend run prisma:validate` exit0; `npm --prefix backend run test:unit` exit0,138/138, under clean env with explicitly unreachable synthetic DB URL. Commands/logs in `/tmp/mobos-billing-default-repair.md`.

Rollback: revert only this three-file unit before application. If applied, do not delete/rewrite migration history: authorized integrator may compensate with `ALTER TABLE "CustomerBillingIdentity" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;` only if it matches recorded pre-change metadata. This restores omission fallback and deliberately reintroduces drift; it is not an update trigger.

Not applied to production. External raw/import writers must supply updatedAt and remain uncertified; real metadata/backup/restore and lock-window/timeouts require separate authorization. No push, merge, deploy or additional DB run.

## Novedades para el dueño
- The repair preserves existing billing identities and their historical timestamps.
- Local database checks pass; external importers still need confirmation before production use.
