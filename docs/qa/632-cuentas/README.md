# #632 — cabeceras legibles de cuentas del POS

Rama propia `codex/pos-632-cuentas-legibles`, rebasada sin conflictos sobre main236 `43204589a410c959cc6033c7503716a714e042bd`. Diff exclusivo de cuentas; no incorpora unidades demo/foco de otras ramas.

## Cambio

La cabecera anterior intentaba colocar logo, nombre truncado, moneda/tipo, editar, estado y quitar en una sola fila. En360px el tipo se solapaba con edición.

La cápsula canónica ahora separa identificación (logo, nombre completo multilínea, editar) de moneda/tipo y estado/quitar. Las acciones conservan44 px en móvil/tablet/escritorio. La cuenta, sus montos y cotización permanecen en el mismo formulario; no se agrega scroll interno por cuenta ni se cambia aritmética o persistencia.

## Evidencia

`e2e/frontend/cuentas632.frontend.spec.js`: ocho casos360/390/768/1440, claro/oscuro, tres cuentas ficticias con nombres largos (efectivo PYG, transferencia PYG, efectivo USD), montos 20.000/15.000/USD 10 y tasa 7.300. Comprueba límites y todos los pares de elementos nombre/editar/tipo/estado/quitar,44 px, ausencia de overflow/truncado de nombre/scroll de cuenta, teclado para estado/cambio de cuenta, monto conservado y submit alcanzable por scrollIntoView.

Harness demo contextual: todas las rutasAPI interceptadas503; HTTPS bloqueado; cero writes de negocio solicitados. Telemetría también interceptada; ningún write real ni consulta OwnData.

- Baseline 235 + nuevo test360light: FAIL `overlap 1/2` (editar/tipo), demostrando el defecto con medición real, no sólo DOM.
- Corrección: ocho casos nuevos PASS. Capturas de las ocho variantes en `outputs/mobos-632-cuentas/` del workspace de coordinación, incluyendo `cuentas-390-light.png` y `cuentas-1440-dark.png`, inspeccionadas visualmente.
- Regresión cobro existente + nuevos:16PASS/2FAIL. Los dos fallos son el contrato anterior de footer dentro de viewport a 1280x720 y 1440x900, no funcionalidad de pagos. Baseline 235 comparado sin corrección:1280x720FAIL y 1440x900 PASS. La corrección añade altura legible y hace fallar también el límite900. No se oculta esta diferencia ni se comprime la cabecera para acomodar ese contrato histórico.
- El integrador confirmó que236 reemplaza ese contrato por scroll de documento sin mini scroll. Revalidar/adaptar esas expectativas sobre main236 antes de integrar 632. La nueva prueba afirma CTA alcanzable mediante scrollIntoView. No afirmar toda la suite UI en verde.
- FE 1596PASS; BE 347PASS+1 skip; lint 0 errores (warning previo DeliveryOperations); builds FE/BE PASS, `backend/.next/BUILD_ID=3Gsf1tSu5pnZW04LHiGXg`; Prisma validate PASS.
- PG fresco aislado en puerto dinámico: todas las migraciones y dbcheckPASS; cluster detenido/eliminado. Sin backend/schema modificados.

Ejecutar casos nuevos: `MOBOS_QA_PORT=5394 npx playwright test --config e2e/cuentas632.frontend.config.js`. También incluidos en configfrontend general de CI.

## Novedades para el dueño

- Los nombres completos de las cuentas ya no compiten con editar, tipo y estado del pago.
- Cambiar cuenta, marcar el pago y quitarlo mantienen controles de 44 px y acceso por teclado.
- Se conservan los montos y monedas, sin introducir scroll pequeño dentro de cada cuenta.

Draft rebasado y revalidado para revisión/integración posterior a236. No merge/deploy y #632 permanece abierto hasta publicación.

## Revalidación final sobre main236

- Rebase normal sin conflictos sobre `43204589`. El harness nuevo usa `ensureCobro` canónico para entrar explícitamente al paso de cobro en escritorio/tablet.
- Suite ampliada: 43 casos = 8 cuentas nuevos + 10 cobro + 25 layout; 39 PASS y 4 FAIL de baseline ajenos a cuentas. Los dos casos de footer/docscroll antes rojos ahora PASS (1280x720 y 1440x900).
- Cuatro fallos baseline preservados: catálogo exige12/recibe8; teléfono compara centros y recibe74.5; contenido inicial exige y<=132/recibe163; miniatura exige<=48/recibe64. Confirmados también al restaurar temporalmente los tres componentes de pago de origin/main236: mismos cuatro fallos. El integrador ya los había auditado contra235. No se alteran esas expectativas ni se atribuyen a632.
- FE 1598 PASS; BE 347 PASS + 1 skip; lint sin errores, builds FE/BE, Prisma y PG fresco/dbcheck PASS. BUILD_ID backend `uM_OiAojL0K6Nhqzd8vbi`.
- Capturas regeneradas sobre236 en `outputs/mobos-632-cuentas-236/` de coordinación; ocho variantes. No afirmar suite UI ampliada completamente verde.
