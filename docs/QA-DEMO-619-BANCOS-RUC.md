# QA #619 · demo financiera y RUC de ejemplo

## Alcance

La demo usa el seed local `mobos:demo-payment-accounts:v2`. Si existe el seed
v1, la migración es aditiva: conserva ediciones, cuentas propias y bajas, y
agrega solo los IDs nuevos. Incluye efectivo en
PYG/USD, transferencias Itaú y Continental, una cuenta del dueño ficticio
Hernán Acosta en USD, una cuenta histórica inactiva y los medios de tarjeta,
Pix, USDT y canje que ya recorrían la demo. Los IDs `demo-*` son internos y
los datos no representan cuentas operables.

El RUC `5215244` y `5215244-8` tiene un fixture local explícito:
`DISTRIBUIDORA AURORA S.A. · 5215244-8`. El resultado se marca como simulado,
requiere **Usar estos datos** y no llama a `/api/public/ruc` ni consume OwnData.
Los demás RUC mantienen el adaptador público del piloto y su fallback manual.

## Evidencia local

- `node --test src/lib/rucDemoRequest.test.js src/lib/demoCuentasCobro.test.js` → 11/11 PASS.
- `npm exec -- playwright test e2e/demo-finanzas.spec.js --grep 'medios del sistema nuevo' --workers=1` → 1/1 PASS.
- `npm exec -- playwright test --config=e2e/ruc-public.frontend.config.js --grep '5215244' --workers=1` → 1/1 PASS; el navegador no realizó solicitudes a `/api/public/ruc`.
- `npm exec -- playwright test e2e/demo-finanzas.spec.js --grep 'mobile: cuentas nuevas' --workers=1` → 1/1 PASS; edición conservada al navegar dentro de la demo.
- `npm run lint` → PASS (0 errores; queda una advertencia preexistente de hooks en `DeliveryOperations.jsx`).
- `npm run build` → PASS; Vite produjo `dist/`.
- `npm --prefix backend run build` → PASS; Next produjo `backend/.next/BUILD_ID`.
- `npm --prefix backend run test:unit` → PASS (347 pass, 1 skip).
- `git diff --check` → PASS.

`npm run db:check` quedó pendiente en este entorno porque no hay PostgreSQL
alcanzable en `127.0.0.1:5535` (Prisma P1001); no se modificó ninguna base.

