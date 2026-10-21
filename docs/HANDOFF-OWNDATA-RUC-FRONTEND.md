# OwnData RUC frontend handoff

Date: 2026-10-12. Worktree: MobOS-nav-v2. Branch: codex/mobos-nav-v2.
Base: c8bdee72. Uncommitted, bounded frontend change; no provider requests.
Final status: **SUCCESS for local checks** — the user authorized reconciliation of the RUC-specific architecture assertion; full npm test, helper tests, lint and frontend build passed. Browser and production behavior remain unverified.

## Behavior and contract

- Local composition uses the existing Input, Badge and BotonDentroCampo primitives. The installed owncoding-ui 0.63.1 RucField source treats an unhyphenated ninth digit as a DV and clamps the base to eight digits; no dependency upgrade was attempted.
- A base has 1–9 digits and cannot start with zero, matching backend normalizeRuc. A DV is explicit only after a hyphen and must be a single correct modulo-11 digit. Dots/spaces are removed without inferring the ninth digit as a DV. Invalid/incomplete values remain editable; extraction rejects them.
- Real extraction uses only the authenticated internal GET /api/ruc through the existing API client, with cacheMs: 0, cache: no-store and an AbortSignal. There is no frontend provider key or provider URL.
- Public `consultar` override compatibility is deliberately restricted: previously `<CampoRuc consultar={consultar} {...props} />` allowed a consumer-supplied `consultar` prop to override the internal lookup. The local component now consumes and ignores that prop to enforce the user's internal `/api/ruc`-only real lookup requirement. The independent verifier reported no current consumers passing this prop. Current-consumer compatibility does not make this fully backwards compatible: custom public lookup overrides no longer work.
- Admission requires reviewRequired: true, source.provider: OwnData, matching query.normalized/query.fullRuc and result.ruc/dv/fullRuc, and a nonblank string nameOfficial. equivalenceRaw/sourcePartition are optional metadata; status/stateRaw are ignored and never exposed to application consumers. A simulated response on the real path is rejected.
- nameOfficial is retained byte-for-byte as received; name is an exact compatibility alias. The component does not trim, reorder or reinterpret company/person names.
- Existing consumers use onAplicar with name/fullRuc. onDatos is supported as an acceptance-only fallback when onAplicar is absent. The two callbacks are not emitted together. Lookup itself never emits either callback or changes the input.
- The name and RUC are shown before “Usar estos datos”; “Descartar” removes the suggestion. Apply is guarded by the original request identity. Input edits, controlled value changes, disabling, extractor visibility, demo changes and unmount cancel/invalidate results. Generation plus scope checks reject stale results even if transport ignores cancellation.
- Existing public demo runtime or esDemo forces browser-only simulation. The legacy mock requires at least five digits: a short base is padded only for its fictitious digit-sum seed; the displayed/admitted identity retains the original base and correct DV. Demo responses must explicitly carry simulado: true, and the UI labels them fictitious. No network path is used for the demo branch.
- Errors, quota failures and non-admission leave manual entry available, with an accessible alert. Server-side admission and quotas remain authoritative.

## Verification

- `node --test src/components/shared/rucLookup.test.js`: 9/9 passing. Initial fixture incorrectly expected DV 7 for 123456789; backend modulo-11 source confirms DV 0; fixture corrected before delivery.
- `npm run lint`: exit 0.
- `npm run build`: exit 0; existing large-chunk warning remains.
- `git diff --check`: exit 0.
- Initial focused legacy adapter check failed with `RucField no reimplementa la UI`. The user subsequently explicitly authorized updating only the RUC-specific assertion in `src/lib/camposReglas.test.js`. It now requires shared Input/BotonDentroCampo composition, internal uncached lookup, demo simulation, stale identity checks, official-name preview and acceptance-only callbacks. Other adapter assertions remain unchanged; no regex evasion was used.
- `npm test`: exit 0; 1020/1020 tests passed, 0 failed, 0 skipped, approximately 16.4 seconds. This includes the reconciled architecture assertion and new helper tests.
- Final `npm run lint`, `npm run build`, `node --test src/components/shared/rucLookup.test.js` and `git diff --check` were rerun after reconciliation; all exit 0. Build retains the large-chunk warning.
- Runtime/browser interaction: not executed. No browser/e2e suite, backend build/tests, database checks, real provider calls, live API integration, CI, commit, push or deployment were performed; there is no production or end-to-end persistence proof.

## Limitations and rollback

No consumer forms, backend, schema, dependencies or fiscal/displayName persistence architecture were changed. Some existing consumers (including checkout name normalization and private-holder name splitting) transform accepted names downstream; preserving the component payload does not prove end-to-end fiscal storage fidelity. This is not a storage migration or deployment.

Rollback only src/components/shared/RucField.jsx and the RUC-specific architecture assertion in src/lib/camposReglas.test.js to their starting state, and remove the new rucLookup.js, rucLookup.test.js and this handoff. Do not revert the six pre-existing F5 files or other concurrent work.

## Novedades para el dueño

- The ninth RUC digit remains part of the base unless a hyphen explicitly separates a valid DV.
- Official data is offered for review, with explicit acceptance or discard; manual entry remains available.
- Demo extraction remains fictitious and makes no real registry request.


## Actualización #663

La opción “Confirmo que es una persona: consultar nombre completo” está desmarcada inicialmente. Se incluye en la identidad de la petición; cambiarla descarta una propuesta anterior o tardía. Sólo solicita `subjectKind=individual` al backend; el servidor agrega `nameMethods=full` en la misma llamada OwnData. Las empresas y consultas sin confirmación mantienen el nombre oficial.

La propuesta puede mostrar `namePresentation.values.full` de la raíz, validada en backend y admitida sólo con la confirmación explícita. `nameOfficial` se conserva sin modificación; `displayName` es separado y no implica separar nombres/apellidos ni acreditar identidad. Los campos exclusivamente fiscales, incluida la identidad de factura guardada, conservan el nombre oficial. El POS y los clientes pueden aplicar la presentación al nombre visible; el titular de cuenta usa la presentación confirmada. No se guarda ni sobrescribe nada al extraer: “Usar estos datos” aplica al formulario, y guardar sigue siendo una acción posterior.

Un error de credencial OwnData401 o permiso/plan403, sólo en GET privado `/api/ruc` con marcador/código admitidos, conserva la sesión y snapshots de MobOS. Un401 propio o cuerpo inválido sigue invalidando el contexto; no hay excepción general para401/403 ni reintentos automáticos. Cuota429 respeta Retry-After; los demás estados conservan carga manual y mensajes seguros.
