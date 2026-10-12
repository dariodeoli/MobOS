# Handoff — F5 Conciliación: bounded presentation

Current status: **Renewed continuation locally VERIFIED, not published.** See the independent mocked-QA checkpoint below for the latest observed verification; the renewed-continuation appendix retains the implementation history. The PARTIAL statuses and exhausted budgets below are preserved historical receipts, not the current result.

Date: 2026-10-11. Worktree: `/Users/dariodeoli/Documents/GitHub/MobOS-nav-v2`.
Branch: `codex/mobos-nav-v2`. Clean entry and unchanged HEAD: `d54e674e831c52c81f9a35b99d913c8eb3d08a08` (`feat(ui): show complete stock identities and explicit zero costs`).
Status: **PARTIAL — the single authorized final correction passes lint/build/unit/focused checks, but the final browser suite is 140/146: actual 390px document height is 2432px in both themes and signed-money cell width assertions fail.** No further correction or retry was performed. This is Conciliación only, not all Finanzas/F5, and does not authorize publication.

The original PARTIAL receipt below is retained as historical evidence (including the original lint failure, 144/144 browser snapshot and 2796px document height). The bounded-correction appendix is the final candidate evidence and supersedes those earlier measurements, not their failure history.

## Authorization and references

One inline writer. Explicitly no delegation, SDD, native review, fetch/rebase, commit, push, PR, merge, deploy, backend/PG or real financial operations. Preserve other writers' changes. Technical artifacts are English; existing UI remains professional Spanish; product-release notes below are Spanish.

Read repository AGENTS.md, docs/CAMPOS.md, docs/TABLAS.md, prior navigation/Inicio/POS/Ventas/Entregas/Clientes/Taller/Stock handoffs, and `/Users/dariodeoli/Downloads/docs 2/redesign/REDESIGN.md` §0, F5 and §7.15 / mobile criteria. Inspected the original desktop prototype screenshot and prototype KPI tokens. The approved shell wins over older proposed navigation labels. No reference fixture amounts were copied into the product.

## Owned files and rollback boundary

| Absolute path | Change |
| --- | --- |
| `/Users/dariodeoli/Documents/GitHub/MobOS-nav-v2/src/components/control/Conciliacion.jsx` | Flat summary, full money/identities, closed group disclosure, scope labels, narrow cards and presentation-only pager. |
| `/Users/dariodeoli/Documents/GitHub/MobOS-nav-v2/src/components/control/conciliacionF5.css` | Component-scoped neutral RGB tokens, shared header/row grids, natural wrapping, focus and touch targets. |
| `/Users/dariodeoli/Documents/GitHub/MobOS-nav-v2/src/lib/conciliacionF5.test.js` | Six preservation and presentation contracts. |
| `/Users/dariodeoli/Documents/GitHub/MobOS-nav-v2/e2e/frontend/nav-v2.frontend.spec.js` | Append-only 29-case F5 suffix; original 115-case prefix remains byte-identical. |
| `/Users/dariodeoli/Documents/GitHub/MobOS-nav-v2/docs/HANDOFF-F5-CONCILIACION.md` | This receipt. |

Rollback only the Conciliacion import/presentation/helper hunks, new CSS/test, appended F5 suffix and this receipt. Do not reset/restore whole shared files or discard other writers' hunks. The original browser prefix is **115759 bytes**, SHA-256 `8ff58df61d33594380d4a9712c0a1b46abb46267f73542d43281369a8ac2c616`; it includes the already-fixed Clientes semantic warning locator. No schema, dependency, fixture or financial-data rollback exists.

## Preserved behavior and data scopes

- The full original component state/business block from `export default function Conciliacion()` through `verPedido` is checked byte-for-byte against the entry commit. Only a new presentation hook call follows it. The summary metric definitions are also byte-identical; the progress still uses `verifiedCount / count` and its original visibility predicate.
- Refund exclusions, pending selection, difference calculation (`received - expected`), required observation guard, mixed-account rejection, clearing after successful mutation, remembered filters, ordering, URL period, API payloads and demo isolation remain unchanged.
- `data.resumen` is the response aggregate for the period/account/method/processor request. Local reconciliation `estado` changes only `filtrados`; it does not recalculate summary or batches. The UI distinguishes response summary, filtered list, displayed page/range, selected payments and batch totals. No shell-branch summary is claimed: this request does not send `branchId`. No tenant authorization or backend persistence is inferred from the mock.
- Payment status, reconciliation state and batch state have distinct labels. A refunded payment is not selectable even when its reconciliation state is pending. A verified payment is not selectable. No financial-coherence correction is fabricated.
- Mixed selected accounts are described explicitly instead of being presented as merely missing an account. Actual rejection remains with the existing demo/API contract; no new financial validation engine is introduced.
- The shell keeps its single page title. The duplicate internal heading is removed; the short description and explicit local-demo warning remain. Existing legacy PG/browser specs still reference the removed internal heading; they informed the new mock tests but were not edited or run as the default backend suite.

## Presentation and pagination tradeoff

Four individual tinted tiles become one bordered neutral strip with separators and the unchanged progress row. At narrow widths the strip stacks to retain full positive/negative Gs 100.000.000 rather than reducing font size or abbreviating values. Payment/group identities, references, currency details and amounts wrap naturally without ellipses; monetary values remain complete. The shared desktop grid activates at **1060px component-container width**, independently of the shell breakpoint. Narrow screens use labeled cards. Group disclosure starts closed, exposes expanded/control metadata, and supports Enter/Space with visible focus. Primary actions remain 44px on cards; desktop row actions are compact.

Paging was added only after the actual unpaginated 22-payment mobile render measured **12826px document height**. Final pager uses **2 payments per narrow page (viewport ≤1100px), 20 above that**, with explicit previous/next controls. The small narrow-page size trades more page navigation for readable full identities and amounts; it is intentionally different from the older reference's uniform 20-card proposal.

Paging only slices the rendered list. Selected IDs/totals/forms are not cleared by page changes, including selections outside the displayed state. “Seleccionar por conciliar” preserves its original replacement semantics: **all pending non-refunded payments in the entire filtered list, across every page**, not just the current page. Account/method/processor/period changes retain their original selection-reset behavior; display-state changes retain selection. Bulk scope is stated next to the control. Tests select across pages, return to earlier pages, filter state, and prove all 23 eligible isolated records are selected without refunded/verified records.

At 390px light, final measured **module height 2369px; document height 2796px** (scope closed, no selection). The module fits 2400px but the full page does not: **do not claim the REDESIGN §10 full scroll-container target ≤2400px passed**. Existing host controls/header contribute 427px. This is a remaining density/layout gap, not hidden by clipping, truncation or a relaxed monetary assertion. Selected batches, expanded summaries and exceptional identities naturally add height.

## Normalization and verification

Normalized only owned helper functions, new CSS/test and the appended browser suffix. Restored the exact original summary metric definition bytes after formatting; the protected business block was never reformatted. No broad formatter. `source-final.sha256` records the accepted four source/test files; only this passive receipt is subsequently updated.

All new logs/screens/geometry are in `/tmp/mobos-redesign-conciliacion-qa`. Prior harness screenshots and default runner output remain at their existing `/tmp/mobos-nav-v2-qa` locations to preserve the prefix/configuration.

| Exact command | Outcome / log |
| --- | --- |
| `npm run lint` | Exit 1: one pre-existing `no-undef` error, `/Users/dariodeoli/Documents/GitHub/MobOS-nav-v2/src/lib/stockF4.test.js:223:16`, `Buffer` undefined. `lint-final.log`. The file is byte-identical to HEAD; `git diff --quiet HEAD -- src/lib/stockF4.test.js` exits 0, and `git show HEAD:src/lib/stockF4.test.js` contains the same offending expression. Not repaired outside this scope. |
| `npx --no-install eslint src/components/control/Conciliacion.jsx src/lib/conciliacionF5.test.js` | Exit 0; `lint-owned.log`. Does not replace the failed repository lint gate. |
| `npm run build` | Exit 0; existing >500kB chunk warning; `build-final.log`. |
| `npm test` | Exit 0, 1007/1007, zero failures/cancellations/skips; `test-final.log`. |
| `node --test src/lib/ciHarness.test.js src/lib/shellNavigation.test.js src/lib/orderDetailNavigation.test.js src/lib/inicioPosF2.test.js src/lib/ventasF3.test.js src/lib/entregasF3.test.js src/lib/clientesF3.test.js src/lib/tallerF3.test.js src/lib/stockF4.test.js src/lib/conciliacionF5.test.js` | Exit 0, 54/54; `focused-final.log`. |
| `npx --no-install playwright test --config e2e/nav-v2.frontend.config.js` | Exit 0, **144/144 passed (3.8m)**: 115 original + 29 F5; one worker, retries 0; `browser-final.log`. |
| `git diff --check` | Exit 0; `diff-final.log`, repeated after final receipt completion. |

New scenarios: actual rendered demo and isolated stress records at **320/360/390/430/1440**, light and dark; no horizontal page overflow plus cell scroll/client widths; full positive and negative Gs 100.000.000 in summary/payment/group/selected/batch contexts, positive and negative differences, input amount, nonselectable refund/verified states, loading/error/empty, oversized account/customer/reference wrapping at 320/1440, closed group disclosure and keyboard focus/Enter/Space, page-preserved selection and all-filtered bulk semantics, exact GET query and POST batch payloads, required observation, mock mixed-account rejection, encoded order trace, and demo-local batch/order trace without finance API calls. Screens: `demo-*`, `isolated-all-*`, `isolated-*`, `long-*`; per-cell and module/document geometry: `*-metrics.json`.

ADMIN reaches the reconciliation page and runs the full mock contract flow. The unchanged shell is owner-only for Finanzas: mocked GERENTE and CAJERA redirect to `/pos` without requesting reconciliation. Their tests preserve that existing boundary; they do **not** certify those roles accessing this page or real backend authorization. The API `conciliar` capability supports those roles independently; navigation was not broadened to reconcile that pre-existing difference.

### Preparation and failure history (retained, not overwritten as success)

- `structural-preliminary.log`: initial five preservation contracts passed. `structural-paging.log`: five passed after the pagination boundary was added.
- `browser-preliminary.log`: 4 failed, 1 interrupted, 19 not run. The test used the disclosure's old accessible name after opening changed it; canceled the owned run and used its stable `aria-controls` identity.
- `browser-correction-1.log`: 3 failed, 21 not run. Test compared `innerText` (layout line breaks) with `toHaveText`'s textContent; corrected the captured comparator, without changing values.
- `browser-targeted-1.log`: 2 passed / 2 failed. Shared Select was located by implicit wrapping label rather than its actual combobox name; changed only the new locator. API client expects `message`, not mock `error`; corrected only the mock response shape.
- `browser-targeted-2.log`: 5 passed / 1 failed. The 4-card module was 3395px at 390, genuinely above target. `height-correction.log`: 3-card module still 2744px; corrected bounded presentation/card density and used 2-card narrow pages. `height-bounded.log`: directed height case passed. The separate full document shortfall remains explicit above.
- `browser-scoped.log`: 19 passed / 3 failed / 5 not run. Retained height and existing GERENTE shell-gating failures. `browser-scoped-2.log`: 22 passed / 3 failed / 2 not run. The remaining paging test tried to check a correctly disabled refund on page 2; it now navigates to a later eligible page before selecting. The product exclusion was never removed. `roles-verified.log`: 3/3 after explicitly testing the existing redirects rather than falsely widening roles.
- `normalized-contracts.log`: 5/6 because helper normalization changed metric-definition formatting. Restored the original metric-definition bytes, preserving the strict comparison; `normalized-contracts-accepted.log`: 6/6.
- `browser-full-interrupted.log`: the first full run was deliberately interrupted before completion after spotting the unresolved disabled-refund locator in the prior bounded failure log. It is not accepted full-suite proof. Final source hashes and required checks were refreshed after correcting and normalizing only that new paging-test suffix.
- `browser-scoped-normalized.log`: 29/29 passed (52.8s), retained pre-full F5 result. Final accepted evidence is the later complete full run, not any preliminary snapshot.

## Server ownership, limitations and remaining work

Port 5291 was free before starting:
`VITE_API_URL=http://127.0.0.1:5291 npm run dev -- --host 127.0.0.1 --port 5291 --strictPort`.
Own execution session: **7674**, Vite listener PID **32601**. Stopped only the owned execution session with Ctrl-C (terminal exit 130). `lsof -nP -iTCP:5291 -sTCP:LISTEN` then returned no listener (exit 1). No process was killed by port. Final source SHA-256 verification passed after cleanup; branch/HEAD remain unchanged. `cleanup-final.log` records the readback.

Remaining: required baseline lint correction by the Stock owner; full-page mobile density target; broader F5 modules and delivery decisions are outside this authorization. No backend/PG, real financial persistence, tenant authorization, external/provider operation, CI or production PASS is claimed. Browser mocks are request/response observations only. No full WCAG/VoiceOver/device certification. Local demo mutations are isolated to the test browser, never fixture edits or real records. Memory MCP had ambiguous active-session ownership; independent local Engram saves recorded scope/paging/role discoveries without selecting or closing another session.

## Novedades para el dueño

- La conciliación muestra una sola tira de indicadores y los importes completos, sin abreviarlos ni cortarlos.
- En celular, los pagos se muestran en tarjetas con sus datos y acciones; el resumen por cuenta comienza cerrado.
- Cambiar de página conserva la selección; la selección masiva indica que abarca todos los pagos pendientes filtrados.
- Se distingue el resumen del período, la lista visible, los pagos seleccionados y los lotes; no se atribuyen cifras a la sucursal del menú.
- Es una mejora local de Conciliación, todavía sin publicar; queda pendiente el error previo de verificación de Stock y reducir más la altura total en celular.

## Skill resolution

`skill_resolution: paths-injected`. Loaded the exact supplied paths before work:
- `/Users/dariodeoli/.codex/skills/work-unit-commits/SKILL.md`
- `/Users/dariodeoli/.codex/plugins/cache/claude-cowork/design/1.2.0/skills/design-system/SKILL.md`
- `/Users/dariodeoli/.codex/plugins/cache/claude-cowork/design/1.2.0/skills/accessibility-review/SKILL.md`
- `/Users/dariodeoli/.codex/plugins/cache/claude-cowork/engineering/1.2.0/skills/testing-strategy/SKILL.md`

## Final bounded correction — terminal PARTIAL, no retry

The user explicitly extended authority for exactly one mechanical Stock test edit: `import { Buffer } from 'node:buffer'`. The final source contract proves that removing this line reproduces the entry commit's entire Stock test file; assertions are unchanged. No financial logic, shell, accounts, Caja, backend, fixtures, roles or navigation changes were authorized or made.

Loaded `/Users/dariodeoli/.codex/plugins/cache/claude-cowork/design/1.2.0/skills/ux-copy/SKILL.md` before revising copy. Summary/request scope, display-state/list scope, page range, all-filtered bulk replacement and page-preserved selection remain explicit in shorter neutral Spanish. The period is now inside the filter grid; at actual component width >=300px filters use two columns, and at >=620px four. At component width 350–619px the summary uses 2×2 cells, with `Gs` on a separate line and numeric font still 22px. Below that it stacks; desktop remains compact. The 2-card narrow/20-card wide pager is unchanged: more clicks remain the explicit tradeoff, not an arbitrary one-payment workaround.

Final normalization was limited to the owned F5 browser suffix, summary-render fragment, scoped CSS and F5 source test. The protected metric definitions/business block remain byte-identical to the entry commit. The Stock import was not reformatted. No source mutation or new normalization occurred after final proof started. Five source/test hashes are in `bounded-correction/source-final.sha256`; all five were verified unchanged after cleanup. Original 115-case prefix (115759 bytes and SHA-256 above) still passes its strict byte-preservation contract. Final suffix is 31 F5 cases; source contracts are eight (including the Stock mechanical-only and bounded layout checks).

All final correction logs, new screenshots and geometry are under `/tmp/mobos-redesign-conciliacion-qa/bounded-correction`. The exact command strings in the original table remain the commands executed, with these new terminal outcomes:

| Required command | Final result / file |
| --- | --- |
| `npm run lint` | Exit 0; `lint-final.log`. The previously recorded Buffer error is fixed by the authorized import only. |
| `npm run build` | Exit 0 in 3.42s; existing >500kB chunk warning; `build-final.log`. |
| `npm test` | Exit 0, 1009/1009; zero failures/cancellations/skips; `test-final.log`. |
| Exact ten-file focused `node --test` command above | Exit 0, 56/56; `focused-final.log`. |
| `node --test src/lib/conciliacionF5.test.js` | Exit 0, 8/8; `contracts-final.log`. |
| `npx --no-install playwright test --config e2e/nav-v2.frontend.config.js` | **Exit 1, 140 passed / 6 failed (3.5m), all 146 ran, one worker, retries 0**; `browser-final.log`. Original 115 cases pass. |
| `git diff --check` | Exit 0; `diff-final.log`; repeated after this passive receipt update. |

### Exact final browser failures and limits

- `F5 demo reconciliation 390px light` and `... dark`: actual `document.documentElement.scrollHeight` **2432**, expected <=2400. Strengthened the old module-only assertion to actual document height; it was not weakened. Final module height is 2005; document is 2432 (427px difference). Both document widths are 390. Height improved from 2796 by 364px, but still exceeds the target by **32px**. The shell is unchanged.
- `F5 isolated full signed money and selection 390px light` and `... dark`: cell text `Gs -100.000.000`, `scrollWidth` **145**, allowed `clientWidth + 1` **142** (client width141). This is a real contained-cell fit failure; do not claim the signed summary fully fits the final 2×2 layout. No truncation, hidden overflow or assertion relaxation was used.
- `F5 final document height and readable 2x2 money at 390px light` and `... dark`: actual document height **2432**, expected <=2400. Those new cases stop at the height assertion, so their subsequent isolated 2×2/full-digit/font/44px proof did **not** execute. Do not claim it passed.

`document-390-light.json` and `document-390-dark.json` retain exact final height2432/width390/viewport390. `demo-390-*-metrics.json` also retain module/document and individual-cell geometry. The failing assertions occur before 390px screenshots, so no final 390 screenshot is claimed. Successful final screenshots include demo/isolated widths320/360/430/1440, light/dark, and oversized identities320/1440. Inspected `demo-430-light.png` visually; it shows the two-column filters and 2×2 summary, without certifying the failed390 case.

One post-proof, read-only attempt to capture missing390 screenshots failed, without source edits or retry: a temporary inline Playwright script timed out after30000ms locating `Entrar como Dueño` at `/demo`, exit1. It produced no screenshots; no screenshot or delivery proof is fabricated. This ancillary failure is separate from the six real required browser failures. The full suite was not rerun.

### Cleanup and rollback readback

Owned Vite session **10794**, listener PID **45885**, started only after5291 was free with the exact command above. Stopped only that owned session via Ctrl-C (exit130). `lsof -nP -iTCP:5291 -sTCP:LISTEN` returned no listener (exit1). `bounded-correction/cleanup-final.log` records absent listener, all five hashes OK, unchanged branch and HEAD `d54e674e831c52c81f9a35b99d913c8eb3d08a08`. No commit, push, deployment, real record operation or native review occurred.

Rollback remains own hunks only. The scope additionally includes the **single Buffer import** in `/Users/dariodeoli/Documents/GitHub/MobOS-nav-v2/src/lib/stockF4.test.js`; remove only that line if rolling back this correction, preserving all Stock assertions and other work. Do not reset whole shared files. This passive handoff is the only update after frozen source proof.

Remaining for parent decision/independent check: the32px full-document gap and3px cell-overflow excess relative to assertion tolerance at390 in both themes. The authorized single correction is exhausted; no additional correction loop. This candidate is not browser-verified complete, not all Finanzas, and not backend/tenant/persistence/production proof.

### Novedades para el dueño — corrección final

- El período y los filtros ocupan menos altura; los indicadores se distribuyen en dos columnas cuando el ancho permite.
- La selección y la paginación mantienen su comportamiento; mostrar dos pagos por página requiere más cambios de página.
- La verificación local de código pasa, pero quedan32px de altura y un problema de ancho del importe negativo en390px. La mejora sigue parcial y sin publicar.

`skill_resolution: paths-injected`, including the additional exact ux-copy path above. Memory MCP still rejects ambiguous active runtime-session ownership; independent Engram fallback is used without selecting or closing other sessions.

## Renewed authorized continuation — one fresh bounded remediation

Date: 2026-10-11 (America/Asuncion). The user renewed direct implementation after the preceding correction exhausted its budget. This is one separate remediation, not a retry of that exhausted correction. **All six required checks passed on the normalized frozen source; no test assertions were weakened and no failed required check was rerun.** No commit, push, deploy, backend operation, SDD or native review.

### Root cause and correction

The retained historical browser log proves six failures: demo document height2432px in both390px themes, signed KPI overflow145px against141px content, and the two final390px document cases. Nested padding constrained each two-column KPI's content; repeated panel padding and payment-grid row gaps accumulated document height. This correction changes only component-owned CSS: narrow panel padding12→10px, payment-grid gap8→6px, and two-column KPI inline padding12→8px. Amount typography stays22px, controls stay at least44px on narrow cards, complete text/data remain visible, and the two-card/20-card pager is unchanged. No clipping, hidden text, smaller amount typography, financial calculation change or pagination workaround.

Changed during this continuation:
- `/Users/dariodeoli/Documents/GitHub/MobOS-nav-v2/src/components/control/conciliacionF5.css` — bounded spacing changes above.
- `/Users/dariodeoli/Documents/GitHub/MobOS-nav-v2/src/lib/conciliacionF5.test.js` — one additional spacing/type/touch/paging preservation contract; existing assertions retained.
- `/Users/dariodeoli/Documents/GitHub/MobOS-nav-v2/e2e/frontend/nav-v2.frontend.spec.js` — separate renewed evidence directory and signed KPI metrics; existing browser assertions retained. Only the F5 suffix was normalized; original115759-byte/115-case prefix hash remains exact.
- `/Users/dariodeoli/Documents/GitHub/MobOS-nav-v2/docs/HANDOFF-F5-CONCILIACION.md` — current-status pointer and this appended receipt; historical failures/budgets retained.

`/Users/dariodeoli/Documents/GitHub/MobOS-nav-v2/src/components/control/Conciliacion.jsx` and `/Users/dariodeoli/Documents/GitHub/MobOS-nav-v2/src/lib/stockF4.test.js` are unchanged from continuation entry; the existing Buffer import is preserved. Protected calculations, original summary definitions, selection, callbacks and paging pass byte/behavior preservation contracts. No backend/env/package/permissions/shared-shell edits. Other existing edits were not reset or reverted.

### Frozen verification and observed results

Normalization finished before verification: scoped CSS/test and F5 browser suffix only. Source hashes for all five source/test files are in `/tmp/mobos-redesign-conciliacion-qa/renewed-continuation/source-final.sha256`; all five subsequently verified OK. Only this passive handoff changed after the freeze.

| Exact command | Observed outcome | Evidence under `/tmp/mobos-redesign-conciliacion-qa/renewed-continuation/` |
| --- | --- | --- |
| `npm run lint` | Exit0, no lint errors | `lint-final.log` |
| `npm run build` | Exit0; existing large-chunk warning | `build-final.log` |
| `npm test` | Exit0;1010/1010, zero failures/cancellations/skips | `test-final.log` |
| `node --test src/lib/ciHarness.test.js src/lib/shellNavigation.test.js src/lib/orderDetailNavigation.test.js src/lib/inicioPosF2.test.js src/lib/ventasF3.test.js src/lib/entregasF3.test.js src/lib/clientesF3.test.js src/lib/tallerF3.test.js src/lib/stockF4.test.js src/lib/conciliacionF5.test.js` | Exit0;57/57, zero failures/cancellations/skips | `focused-final.log` |
| `npx --no-install playwright test --config e2e/nav-v2.frontend.config.js` | Exit0;146/146 in4.9m, one worker, retries0;115 original +31 F5 | `browser-final.log` |
| `git diff --check` | Exit0, including completed handoff readback | `diff-final.log`, `diff-handoff-final.log` |

Browser coverage remains320/360/390/430/1440, light/dark, complete ±Gs100.000.000 in summary/payment/group/selected/batch contexts, page-preserved and all-filtered selection, original request/payload/callback behavior, keyboard disclosure and44px controls, loading/error/empty and long identities. It uses isolated mocked APIs and browser-local demo data, not backend/production/persistence proof. The unchanged owner-only shell redirects GERENTE/CAJERA; no permission expansion is claimed.

| Viewport | Module width | Module height | Full document height (light and dark) |
| --- | --- | --- | --- |
|320|288|2445|2896|
|360|328|2109|2536|
|390|358|1917|**2344 ≤2400**|
|430|398|1813|2240|
|1440|1144|2285|2580|

The2400px target is verified at390px, not claimed for every viewport. Fresh390px signed KPI metrics in both themes: positive digits135.578125px within150/151px, negative digits145.03125px within151px; parent scrollWidth151 equals clientWidth151, font22px. Full-page width390 equals viewport390. Saved per-cell assertions pass at all five widths/themes.

Fresh screenshots (not the old2796px captures):
- `/tmp/mobos-redesign-conciliacion-qa/renewed-continuation/document-390-light.png`
- `/tmp/mobos-redesign-conciliacion-qa/renewed-continuation/document-390-dark.png`
- `/tmp/mobos-redesign-conciliacion-qa/renewed-continuation/kpi-stress-390-light.png`
- `/tmp/mobos-redesign-conciliacion-qa/renewed-continuation/kpi-stress-390-dark.png`

Also saved new demo/isolated/isolated-all screenshots for every required width/theme and long-identity320/1440 captures. Visually inspected the new390px light document and dark signed-stress screenshot. Existing fixed shell navigation remains unchanged; this is not a complete WCAG/VoiceOver/device certification.

One ancillary read-only metrics aggregation command failed with `TypeError: stress.map is not a function` because the JSON contains a `cells` object property, not a top-level array. It was not a required gate, caused no source mutation, and was not retried; the required146-case browser proof and original JSON metrics are the evidence of record.

### Ownership, cleanup and rollback

Port5291 was free before starting exactly:
`VITE_API_URL=http://127.0.0.1:5291 npm run dev -- --host 127.0.0.1 --port 5291 --strictPort`.
Owned session17999, listener PID58226. Stopped only that owned session via Ctrl-C, exit130. No kill-by-port. Cleanup readback records no5291 listener, all five frozen hashes OK, unchanged branch `codex/mobos-nav-v2` and HEAD `d54e674e831c52c81f9a35b99d913c8eb3d08a08`.

Rollback only this continuation's CSS spacing hunks, additional source test and browser evidence/normalization hunks, and appended receipt/current-status pointer. Entry snapshots are retained in the renewed evidence directory. Preserve all preceding F5 work and the existing Stock Buffer import; never restore whole shared files.

### Novedades para el dueño — continuación renovada

- Los importes positivos y negativos completos entran en los indicadores, sin reducir su tamaño.
- La página de390px ahora mide2344px en ambos temas, dentro del objetivo de2400px.
- Se mantienen la selección, los filtros y los dos pagos por página; la mejora está verificada localmente, todavía sin publicar.

`skill_resolution: paths-injected`. Loaded all five exact requested paths before this continuation: work-unit-commits, engineering/debug, engineering/testing-strategy, design/design-system and design/accessibility-review, as listed in the user request. Memory MCP rejected ambiguous runtime-session ownership; the observed independent `engram save` fallback succeeded without selecting or closing another session.

## Independent mocked-QA checkpoint — 2026-10-12

Latest executed report: `/tmp/mobos-frontend-syntax-fixed.md`. Native Vite JavaScript/exact loopback API_URL preflight passed; the frontend suite passed **146/146**, exit 0, one worker, zero retries/skips/flaky cases. The temporary spec copy normalized byte-for-byte to the original after only output/import-path substitutions. Actual controlled RucField mount passed **5/5** checks for nine-digit identity, explicit acceptance, exact raw official name, manual fallback and stale-result rejection. Existing receipts and the six dirty-file source hashes were preserved; owned processes were cleaned up.

This is isolated mocked/demo frontend evidence, not production authentication, tenant/backend/database/provider/fiscal persistence, real consumer storage, printing, deployment or release proof. No browser suite is rerun for this checkpoint. The separately authorized six-file local commit does not authorize push, main integration or deployment; backend schema-default drift remains outside F5 scope.

Local checkpoint checks (2026-10-12): `npm test` exit 0, **1020/1020**, no failures/skips; `npm run lint` exit 0; `npm run build` exit 0 with the existing large-chunk warning; `git diff --check` exit 0. Commands used an isolated frontend environment with loopback `VITE_API_URL`; no backend/provider/database checks or browser rerun. Local verification logs: `/tmp/mobos-f5-checkpoint-OUMQ2Y`.
