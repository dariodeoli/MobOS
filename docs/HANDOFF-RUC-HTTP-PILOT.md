# Private-pilot HTTP quota fixtures — local checkpoint

Date:2026-10-12. Issue [#344](https://github.com/dariodeoli/MobOS/issues/344). Status: fixture unit and synthetic full HTTP locally validated, NOT production/delivery fullPASS.

Only two test fixtures changed: dedicated persisted synthetic user/tenant with verified matching owner email, normal company/PIN authentication, matching pilot IDs and empty provider keys. Non-pilot403/pilot_forbidden and repeated authorized quota429/account_rate_limited, Retry-After/exact stored quota count retained. Production source/guards/auth limits untouched.

Old failure: added pilot PIN shared the normal network budget;16 ordinary preceding calls +1 pilot +4 lifecycle =21 against unchanged20/15minutes. Correction confines optional forwarded IP192.0.2.44 to pilot login/PIN and pilot auth/me/quota, leaving all ordinary callers unchanged. Corrected ordinary count16+4=20, pilot PIN1 separate. Counts reconstructed from source, not a retained runtime bucket snapshot; no quota reset, expiry wait or assertion relaxation.

Writer corrected run: `/tmp/mobos-ruc-http-fixture-repair.md`, `/tmp/mobos-ruc-http-fixture-attempt2.log`, full synthetic HTTP exit0. Historical PIN expected200/received429 remains recorded, not waived.

Fresh independent proof: `/tmp/mobos-ruc-http-fixture-final-independent.md`; `env -i PATH="$PATH" HOME="$HOME" LANG=C TZ=UTC node --test backend/tests/ruc.test.mjs` exit0,188 internal checks (Node1/1); `node --check backend/tests/finance-consolidated.mjs` and `bash -n backend/tests/integration-http.sh` exit0. `env -i PATH="$PATH" HOME="$HOME" LANG=C TZ=UTC python3 /tmp/mobos-ruc-http-isolated.py` executed ONCE, exit0; log `/tmp/mobos-ruc-final-independent-yzfVlM/http.log`. Finance25checks twice, lifecycle14 and final full-harness PASS; synthetic backup/restore56products/72orders. No rerun or skipped gate.

Env-file-free mirror copied current fixtures and existing build; owned cluster/server/mirror cleaned. Source/package/generated-client/build bytes preserved. Existing build-to-HEAD provenance not certified. No real provider request/key, production mailbox/persistence/backup proof or deployment.

Rollback: revert only this fixture/handoff unit; preserve billing migration and other work. Temporary DB was removed, no real DB rollback needed. No push/main/deploy.

## Novedades para el dueño
- The synthetic pilot no longer consumes other test users' login budget; normal protections remain unchanged.
- Writer and independent synthetic HTTP checks pass; nothing has been published or applied in production.
