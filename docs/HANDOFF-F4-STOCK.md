# Handoff — F4 Stock: bounded serialized-list body

Date: 2026-10-11. Worktree: `/Users/dariodeoli/Documents/GitHub/MobOS-nav-v2`.
Branch: `codex/mobos-nav-v2`. Clean entry and unchanged HEAD: `b437eaa9dec89c6ea7591115901086d46f540f44`.
Status: **PASS — bounded local frontend unit**. Final normalized-source checks passed; own server stopped. No implementation blockers remain inside this scope. This does not authorize integration or publication.

## Authorization, references and mapping

One writer, no delegation, SDD, native review, commit, push, fetch/rebase, deploy or production operations. Read repository AGENTS.md, docs/TABLAS.md, REDESIGN.md §0 / §7.9 / Stock-F4, local prototype tokens and previous navigation/Inicio/POS/Ventas/Entregas/Clientes/Taller handoffs. The user's explicit single-line standard desktop identity supersedes the older two-line prototype. This is NOT completion of all F4.

| Owned file | Bounded change |
| --- | --- |
| `/Users/dariodeoli/Documents/GitHub/MobOS-nav-v2/src/components/control/Inventario.jsx` | UNIDADES_GRID, header/loading, serialized rows/mobile cards, local action-menu accessibility; list wrappers and mobile selection wiring. |
| `/Users/dariodeoli/Documents/GitHub/MobOS-nav-v2/src/components/control/stockF4.css` | Scoped neutral tokens, content-sized columns, flat rows/cards, container breakpoint and keyboard/touch presentation. |
| `/Users/dariodeoli/Documents/GitHub/MobOS-nav-v2/src/lib/stockF4.test.js` | Six structural/behavior contracts, including unchanged business bytes and original 87 frontend cases. |
| `/Users/dariodeoli/Documents/GitHub/MobOS-nav-v2/e2e/frontend/nav-v2.frontend.spec.js` | Append-only suffix: 24 Stock cases. Original 87 cases remain byte-identical. |
| `/Users/dariodeoli/Documents/GitHub/MobOS-nav-v2/docs/HANDOFF-F4-STOCK.md` | This receipt. |

Protected, byte-identical: main component state/business block through its render boundary (roles, branch/store scope, search/sort/filter, availability, delivery, reservation, valuation, cost-save handlers, printing/bulk), alternative grid and detail-related code after TarjetaUnidad. accionesDeUnidad was restored to its exact original bytes after proving equivalent formatting. UnidadDetalle.jsx, routes/shared navigation, quantity products, API/backend/finance, fixtures, dependencies and existing handoffs are untouched. Existing provider IMEI/SIM/blacklist information was already absent from the main row/card; no removal is claimed and no provider result is substituted for physical verification.

## Visible behavior and constraints

- Model/capacity/color/battery, serial and full physical actor/calendar date are visible, not ellipsized. Battery uses the existing shared MedidorBateria, not a replacement widget.
- Desktop header, loading and body share the same grid and border/padding geometry. Reclaimed list-side padding and smaller 24px mouse actions make room for identities; mobile/card targets stay at least 44px.
- Below **1120px actual list-container width**, rows become natural cards rather than a cramped or horizontally scrolling table. At 1280px viewport this is the card layout; at 1440/1920 it is the standard grid. The compact header retains “Seleccionar visibles” for narrow desktop instead of losing select-all. Mobile cards retain selection and full location names/codes; alternate tiles remain available.
- Desktop conversion remains `costoGs / cotizacion`, with clear `Costo (USD)` heading. Mobile retains Gs. If no FX exists for a PYG unit, display the real Gs amount explicitly: the prior presentation fell through to `Number(null)` and incorrectly displayed USD zero. This is a display fallback only, not a change to cost/valuation engines or USD save semantics.
- Enter/Space open the row only when the row itself owns the event. Nested cost Enter/Escape does not open detail. Local menu exposes menu/menuitem/expanded metadata, initial focus, arrows/Home/End, Tab exit and Escape focus restoration. Existing callbacks and busy guards remain.
- Standard demo rows and isolated 15-digit IMEI rows are measured as **one line for model/serial/verification at 1440/1920**, including full verifier names/dates. Finite columns cannot guarantee one line for arbitrary unbounded names: exceptional models/actors/locations wrap naturally even on desktop, without truncation or smaller fonts. Stress mocks repeat model names 20 times and actors 15 times at 320/1440. Longer-than-standard serials also wrap without losing characters. No arbitrary character cap is imposed.
- Reserved rows may be taller for the complete customer name and retained “Finalizar venta”; location/state may wrap. The single-line commitment concerns standard model, serial and physical verification, not every ancillary label.

## Required final verification

Normalization was limited to the five touched presentation functions, new CSS/test and the appended harness suffix. No broad formatter or mutating normalizer runs after the accepted source snapshot. `source-final.sha256` records the four source/test files; only this receipt is subsequently updated.

All logs below are in `/tmp/mobos-redesign-stock-qa`.

| Exact command | Accepted outcome / log |
| --- | --- |
| `npm run lint` | Exit 0, zero errors; `lint-accepted.log`. |
| `npm run build` | Exit 0; existing >500kB chunk warning, not a failure; `build-accepted.log`. |
| `npm test` | Exit 0, 996/996, zero failures/cancellations/skips; `test-accepted.log`. |
| `node --test src/lib/ciHarness.test.js src/lib/shellNavigation.test.js src/lib/orderDetailNavigation.test.js src/lib/inicioPosF2.test.js src/lib/ventasF3.test.js src/lib/entregasF3.test.js src/lib/clientesF3.test.js src/lib/tallerF3.test.js src/lib/stockF4.test.js` | Exit 0, 43/43; `focused-accepted.log`. |
| `npx --no-install playwright test --config e2e/nav-v2.frontend.config.js` | Exit 0, **111/111** (87 unchanged + 24 new), 3.3m, one worker, zero retries; `browser-accepted.log`. |
| `git diff --check` | Exit 0; `diff-accepted.log`, repeated after receipt completion. |

Browser scenarios: real rendered demo at 320/390/430/1280/1440/1920, light and dark; cell scrollWidth/clientWidth and one-line identity measurements; header alignment; loading-not-empty and empty states; isolated full Gs 100.000.000 cards; 15-digit IMEI; menu/row/detail focus/Escape; mobile/card 44px targets; selection/select-all; Sold and In-transit; unchanged USD mock-save payload and cancel behavior; oversized identities. Screenshots and per-cell metrics: `{width}-{light,dark}.png`, `{width}-{light,dark}-metrics.json`, `isolated-{width}.png` in the same directory. Inspected 1440 dark and 320 isolated visually; the mobile model uses the full card width instead of being squeezed between state and selection.

Every browser API/provider request is mocked or blocked. Mock-only cost mutation observes the existing payload, not server persistence. The existing frontend configuration uses no PG/backend setup. Previous 87-case screenshots/artifacts retain their original `/tmp/mobos-nav-v2-qa` paths to preserve the append-only harness.

### Preserved preparation/failure history

- Initial temporary inspection timed out because its blanket API mock intercepted `/src/lib/api/...` module requests. Corrected the temporary mock to intercept only pathname `/api/`; no product change for that harness mistake.
- `browser-preliminary.log`: 8/21 passed, 13 failed. Real failures: badge cell overflow and 1px loading/header border mismatch. Corrected scoped widths/padding/borders, without relaxing assertions. The other mock failures counted unrelated presence/push background POSTs as inventory writes; those background paths are explicitly blocked with 503, while unexpected business mutations remain recorded and asserted empty.
- `browser-correction-1.log`: 21/21 passed. These results preceded the shared-battery restoration and final mobile refinements.
- `test-before-battery-fix.log`: 995/996. Existing objetosReglas contract rejected the ad-hoc battery percent. Restored shared MedidorBateria, left the existing assertion unchanged. `battery-contract.log`: 51/51.
- `battery-correction.log`: one strict one-line probe failed because inline-flex battery introduced a second rectangle top. Used inline rendering of the existing widget, without changing the geometric assertion. `battery-correction-2.log`: 1/1 passed.
- `browser-correction-2.log`: 24/24 passed, including added mock USD-save and narrow Sold/In-transit cases. `mobile-card-readback.log`: 1/1 after giving model the full natural card width.
- `browser-final.log`: earlier full 111/111. Final receipt uses the subsequent `*-accepted.log` checks after the last normalization/select-all refinement; earlier checks do not replace final evidence.

## Server cleanup, limitations and next owner

Port 5291 was free before starting the own server with exactly:
`VITE_API_URL=http://127.0.0.1:5291 npm run dev -- --host 127.0.0.1 --port 5291 --strictPort`.
Owned execution session: 84671; Vite listener PID: 3014. Stopped only the owned session with Ctrl-C (exit 130). `lsof -nP -iTCP:5291 -sTCP:LISTEN` then returned no listener. No process was killed by port. Final four-file SHA-256 verification succeeded after cleanup; branch/HEAD remained unchanged.

No backend/PG, authorization/persistence, real printing/physical verification/provider query, external sends, CI or production PASS is claimed. No full WCAG/VoiceOver/device certification. Only this serialized-list body is completed; remaining F4 screens and global density/pagination are outside scope. MCP memory save was ambiguous because multiple sessions match; an independent local Engram save recorded observation #9415 without choosing or closing another session.

## Scoped rollback

Remove only this unit's own Inventario presentation/import/wrapper hunks, new stockF4.css and stockF4.test.js, the 24-case appended suffix, and this receipt. Preserve the original 87 cases, all prior work and concurrent edits. Do not reset/restore complete shared files. No production data, schema, dependency or fixture rollback exists.

## Novedades para el dueño

- El modelo, IMEI y quién verificó físicamente el equipo se leen completos; ya no dependen de una abreviatura o un texto cortado.
- En pantallas estrechas se usan tarjetas legibles, con ubicación y costo completos, sin desplazar la página lateralmente.
- Si falta la cotización, se conserva el costo real en guaraníes en lugar de mostrar un cero en dólares.
- Las acciones, reservas, vendidos y equipos en tránsito se conservan; teclado y selección siguen disponibles.
- Es una mejora local acotada, todavía sin publicar; no representa el rediseño completo de Stock.

## Skill resolution

`skill_resolution: paths-injected`. No registry was found; the four supplied paths were loaded directly:
- `/Users/dariodeoli/.codex/skills/work-unit-commits/SKILL.md`
- `/Users/dariodeoli/.codex/plugins/cache/claude-cowork/design/1.2.0/skills/design-system/SKILL.md`
- `/Users/dariodeoli/.codex/plugins/cache/claude-cowork/design/1.2.0/skills/accessibility-review/SKILL.md`
- `/Users/dariodeoli/.codex/plugins/cache/claude-cowork/engineering/1.2.0/skills/testing-strategy/SKILL.md`


## Zero-display follow-up — 2026-10-11 (append-only correction)

**Corrected final status: PASS — bounded local frontend display only.** The preceding receipt is preserved as historical evidence, not rewritten. Entry was the existing five-file uncommitted Stock body at HEAD `b437eaa9dec89c6ea7591115901086d46f540f44`, branch `codex/mobos-nav-v2`; all prior edits were preserved. This follow-up modifies only local Inventario display derivation, Stock unit contracts, four appended browser cases and this passive appendix. `stockF4.css` is byte-identical to entry.

### Incoming independent result and reproduced cause

The incoming independent report supplied at follow-up entry was **PARTIAL**: 43/43 focused and 111/111 browser cases passed, with no candidate findings, but explicit `costPyg: 0` displayed zero while `originalCost: 0, costPyg: null` displayed `—`. The pre-existing, unchanged `src/utils/inventario.js:104` rejects `originalCost <= 0` in `costoEnGs`. Therefore the preceding PASS did not cover the newly identified original-zero display case. This follow-up does not claim another independent/native review.

RED preceded the correction: `node --test src/lib/stockF4.test.js` exited 1, **8/11 passed, 3 failed** (`zero-red.log`). The explicit original PYG zero assertion observed `—` instead of `USD 0,00`; additional display tests exposed blank-value and negative-value behavior. Corrected local tests then passed 11/11 (`zero-green.log`, `zero-normalized.log`).

### Display-only correction and preservation

- `costoVisible` is private to Inventario presentation. It accepts only finite, nonnegative stored numeric amounts or nonblank numeric strings. Missing/null/undefined/blank values remain missing; `Number(null)` cannot fabricate an original USD zero. Invalid/negative values show `—`, never an invented amount.
- Stored PYG zero and original PYG zero display `Gs 0` on mobile and USD zero on desktop when FX exists; without FX the actual `Gs 0` remains explicit. Original USD zero with a valid unit FX displays Gs zero on mobile; without unit FX mobile displays `USD 0,00`, not a fabricated PYG conversion. Desktop USD zero remains explicit even without FX.
- Positive conversion still uses `costoGs / cotizacion`; save payloads/handlers and the shared valuation engine are unchanged. Blank `costPyg` does not override a valid original amount with a coerced zero.
- Main state/business/role/permissions/API/sort/filter/selection/valuation/save block, alternate grid, detail and trailing modals match entry. Shared `src/utils/inventario.js` and `UnidadDetalle.jsx` match HEAD. No financial, original conversion engine, API/backend, persistence, dependency, fixture or permission edits. Evidence: `preservation-final.log`, `own-inventario.diff` and original entry snapshots under `before/`.
- All prior **111 browser cases are a byte-identical prefix**, guarded by a SHA-256 unit assertion. Five unit contracts and four browser cases were added; prior behavior checks remain, with only the display-source assertion adjusted to the guarded local derivation.

### Final normalized-source verification

All new follow-up logs/screenshots are under `/tmp/mobos-redesign-stock-zero-qa`. Normalization was scoped to the private display helper, Stock test file and appended browser suffix only; no whole-Inventario or whole-browser formatter was run. `source-final.sha256` freezes the four source/test files before final checks; all four hashes passed again after browser completion and server cleanup. Only this passive appendix was written afterward.

| Exact command | Final result / log |
| --- | --- |
| `npm run lint` | Exit 0, zero errors; `lint-final.log`. |
| `npm run build` | Exit 0; existing >500kB chunk warning only; `build-final.log`. |
| `npm test` | Exit 0, **1001/1001**, zero failures/cancellations/skips; `test-final.log`. |
| `node --test src/lib/ciHarness.test.js src/lib/shellNavigation.test.js src/lib/orderDetailNavigation.test.js src/lib/inicioPosF2.test.js src/lib/ventasF3.test.js src/lib/entregasF3.test.js src/lib/clientesF3.test.js src/lib/tallerF3.test.js src/lib/stockF4.test.js` | Exit 0, **48/48** (43 + 5); `focused-final.log`. |
| `npx --no-install playwright test --config e2e/nav-v2.frontend.config.js` | Exit 0, **115/115** (unchanged 111 + 4), 2.7m, one worker, zero retries; `browser-final.log`. |
| `node --test src/lib/stockF4.test.js` | Final spot check exit 0, **11/11**; `spot-check-final.log`. |
| `git diff --check` | Exit 0 before and after this appendix; `diff-final.log`. |

The appended four browser cases prove rendered zero versus missing at **1440px desktop / 320px mobile**, with and without reference FX: 16 isolated current-unit records per case covering stored/original numeric/string zero, PYG/USD, absent/null/undefined/blank/whitespace, invalid/negative and stored PYG with missing USD original. Undefined fields serialize as absent in API JSON; their distinct JavaScript input is also tested directly in unit contracts. Assertions cover exact cost labels, no false missing badge for zero, no overflow and no business writes. Every API response is mocked and every nonlocal request in these new cases is blocked; there are no real data/provider operations. Existing mock-only USD-save payload regression also passes unchanged.

Screenshots: `zero-1440-fx.png`, `zero-1440-no-fx.png`, `zero-320-fx.png`, `zero-320-no-fx.png`. Desktop/mobile no-FX images were visually inspected for the distinction between zero, `Sin costo` and invalid `—`. Earlier original-prefix artifacts keep their existing paths. Playwright's pre-existing output directory remains unchanged.

Preserved harness history: `browser-zero-preliminary.log` exited 1, 0/4 passed because the appended exact inventory route glob missed query strings and returned the prior three-row mock. Only the appended mock route changed to a query-aware regex, not production code or assertions; `browser-zero-corrected.log` then passed 4/4. The subsequent full normalized-source 115/115 run is the final evidence; there was no loop-until-pass retry.

### Cleanup, scope and rollback

Port 5291 was verified free (`port-before.log`, lsof exit 1) before launching exactly:
`VITE_API_URL=http://127.0.0.1:5291 npm run dev -- --host 127.0.0.1 --port 5291 --strictPort`.
Owned exec session **98859**, Vite PID **20032** (`server-start.log`). Stopped only that session via Ctrl-C, exit **130**. Post-cleanup `lsof -nP -iTCP:5291 -sTCP:LISTEN` returned no listener (`port-after.log`, exit 1). No process was killed by port. HEAD and branch remain unchanged.

No delegation, SDD, native review, commit, push, fetch/rebase, deploy or external calls were performed. No production/CI/backend/persistence/real-device certification is claimed. Scoped rollback removes only `costoVisible` and its desktop/mobile display call-site hunks, follow-up test additions/imports/display-source assertion change, the four-case appended browser suffix and this appendix. Preserve the previous 111-case prefix, all five entry files and all unrelated/concurrent changes; never restore/reset whole shared files.

MCP memory saving reported multiple matching runtime sessions. Independent CLI manual saves recorded the cause/fix/prefix contract without selecting, inventing or closing any runtime session.

### Novedades para el dueño — corrección de cero

- Un costo guardado explícitamente como cero ya se ve como cero; no se confunde con un costo que falta cargar.
- Se mantienen las conversiones, el guardado y la valuación existentes; esta corrección local todavía no está publicada.

### Follow-up skill resolution

`skill_resolution: paths-injected`. Read the supplied paths before task-specific work:
- `/Users/dariodeoli/.codex/plugins/cache/claude-cowork/engineering/1.2.0/skills/debug/SKILL.md`
- `/Users/dariodeoli/.codex/plugins/cache/claude-cowork/engineering/1.2.0/skills/testing-strategy/SKILL.md`
- `/Users/dariodeoli/.codex/skills/work-unit-commits/SKILL.md`


## Same-candidate verification correction — 2026-10-11

**Latest local status: PASS.** One bounded, explicitly authorized test-only correction was applied; no product source changed. Earlier zero-display and byte-identical-prefix proofs above remain historical records, not claims about the current prefix.

### Independent failure history and verified diagnosis

The incoming independent result reported **48/48 focused PASS**, **28/28 Stock browser PASS**, but **114/115 full frontend (PARTIAL)**: `F3 Clientes summary unavailable and campaigns return for ADMIN`, original line 1778. The preserved failure artifact, `locator-correction/independent-admin-failure.md`, confirms that `.clientes-f3.getByRole('status')` resolved to two legitimate elements at the same time: the summary-warning paragraph and an `aria-busy="true"` loading div. This is assertion ambiguity, not a Stock display defect or an invalid product status role. Product source confirms the warning text and separate loading feedback; no product fix was needed.

Exactly one prior assertion now uses:
`root.getByRole('status').filter({ hasText: 'Resumen de tienda no disponible' })`
with the unchanged expectation:
`.toContainText('Resumen de tienda no disponible')`.
The existing ADMIN/GERENTE/VENDEDOR loop, test intent, expected warning text and all other assertions are unchanged. No sleeps, retries, positional `.first()` workaround, product edits or dependency-phase expansion.

### Transparent prefix-baseline update

The **current 87/111-case prefix is NOT byte-identical to the old prefix**: this one authorized prior Clientes assertion changed. Both Stock prefix guards were updated explicitly, rather than disabled or silently weakened. The 87-case guard compares against HEAD with only the exact authorized assertion substitution. The 111-case guard checks the corrected prefix hash and reverses exactly one scoped assertion to reproduce the historical original hash:

- Historical 111-case prefix: **111100 bytes**, SHA-256 `6b71cde94e06cc900147894cafbf3aedfd6f16ce99da005f189d4c79789ac6b0`.
- Corrected prefix: **111168 bytes**, SHA-256 `da116dfbcf1d4cca667ba45102ef828220066ee7014bd8be5ad299adb60e950f`.

Entry-to-final readback verifies that the entire 115-case browser file differs only by this one assertion. All four zero-display cases and the remaining browser bytes are unchanged. Inventario and Stock CSS match entry byte-for-byte. New evidence lives under `/tmp/mobos-redesign-stock-zero-qa/locator-correction`; earlier logs are not overwritten. Files: `prefix-baseline-transition.log`, `preservation-final.log`, `nav-v2.frontend.spec.js.diff`, `stockF4.test.js.diff` and entry snapshots.

### One final verification run

Normalization was confined to the updated Stock guard file before checks; the browser assertion was written in its scoped final format without formatting the prior prefix. `source-final.sha256` records the corrected candidate and passed after browser completion/cleanup. No source mutation followed final verification.

| Exact command | Result / new log |
| --- | --- |
| `node --test src/lib/ciHarness.test.js src/lib/shellNavigation.test.js src/lib/orderDetailNavigation.test.js src/lib/inicioPosF2.test.js src/lib/ventasF3.test.js src/lib/entregasF3.test.js src/lib/clientesF3.test.js src/lib/tallerF3.test.js src/lib/stockF4.test.js` | Exit 0, **48/48**, no failures/cancellations/skips; `focused-final.log`. |
| `npx --no-install playwright test --config e2e/nav-v2.frontend.config.js` | Exit 0, **115/115**, 2.9m, one worker, **zero retries**; `browser-final.log`. ADMIN, GERENTE and VENDEDOR warning cases all pass. |
| `git diff --check` | Exit 0 before and after this appendix; `diff-final.log`. |

These are the only requested functional reruns; earlier lint/build/full-unit evidence remains historical and is not presented as newly rerun. One correction and one full-suite run, not a loop-until-clean. No new independent/native review is claimed.

Port 5291 was verified free before starting the same isolated local Vite command:
`VITE_API_URL=http://127.0.0.1:5291 npm run dev -- --host 127.0.0.1 --port 5291 --strictPort`.
Owned session **43786**, listener PID **26781**; stopped only this session with Ctrl-C, exit **130**. Post-cleanup lsof returned no listener, exit 1 (`port-after.log`). No process killed by port. Branch/HEAD unchanged at `codex/mobos-nav-v2` / `b437eaa9dec89c6ea7591115901086d46f540f44`.

No delegation, SDD, native review, commit, push, deploy, real API/provider or external delivery operations. Rollback is only the single text-scoped assertion, its corresponding two prefix-guard updates and this appendix; preserve all prior Stock and concurrent edits.

### Novedades para el dueño — verificación

- La verificación de Clientes distingue el aviso de resumen no disponible del indicador de carga; la aplicación no cambió.
- La suite completa vuelve a pasar, incluida la distinción entre costo cero y costo faltante; no se publicó ningún cambio.

`skill_resolution: paths-injected` — the same exact debug, testing-strategy and work-unit-commits paths listed in the preceding appendix were reloaded. No additional phase/dependency work.

## Final independent closure after the bounded locator correction

The initial independent full run remains 114/115, with all 28 Stock cases passing and the unrelated Clientes status ambiguity recorded above. After the single allowed assertion correction, the writer's complete suite passed 115/115. Independent readback confirmed exactly that semantic substitution, unchanged expected warning/count/campaign/mutation assertions, and unchanged Stock product/CSS hashes. Independent focused checks passed 48/48; targeted Clientes runtime passed 3/3 roles (ADMIN, GERENTE, VENDEDOR). The verifier did not rerun all 115 cases after the correction; the full 115/115 result is the writer's log, not an invented independent full run. Parent repeated Stock contracts: 11/11. No backend, CI, production or publication evidence. Source remained unchanged; this passive receipt precedes a local checkpoint only.
