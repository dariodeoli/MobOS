# QA #619 · demo financiera y RUC de ejemplo

## Alcance

La demo usa el seed local `mobos:demo-payment-accounts:v2`. Incluye efectivo en
PYG/USD, transferencias Itaú y Continental, una cuenta del dueño ficticio
Hernán Acosta en USD, una cuenta histórica inactiva y los medios de tarjeta,
Pix, USDT y canje que ya recorrían la demo. Los IDs `demo-*` son internos y
los datos no representan cuentas operables.

El RUC `5215244` y `5215244-8` tiene un fixture local explícito:
`DISTRIBUIDORA AURORA S.A. · 5215244-8`. El resultado se marca como simulado,
requiere **Usar estos datos** y no llama a `/api/public/ruc` ni consume OwnData.
Los demás RUC mantienen el adaptador público del piloto y su fallback manual.

## Evidencia local

- `node --test src/lib/rucDemoRequest.test.js src/lib/demoCuentasCobro.test.js` → 10/10 PASS.
- `npm exec -- playwright test e2e/demo-finanzas.spec.js --grep 'medios del sistema nuevo' --workers=1` → 1/1 PASS.
- `npm exec -- playwright test --config=e2e/ruc-public.frontend.config.js --grep '5215244' --workers=1` → 1/1 PASS; el navegador no realizó solicitudes a `/api/public/ruc`.
- `git diff --check` → PASS.

La prueba aislada de ESLint no pudo arrancar en el worktree porque el snapshot
no tenía todos los plugins locales disponibles; no se omitió por eso ninguna
prueba funcional.

