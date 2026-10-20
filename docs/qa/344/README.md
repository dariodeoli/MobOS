# #344 — OwnData RUC y conservación de identidad fiscal

## Diagnóstico del endpoint 503

En el entorno unitario y en el PG aislado de esta verificación, `GET /api/public/ruc` devuelve `503` con `details.code=provider_not_configured` cuando la configuración de `RUC_API_KEY` no está presente. La ruta corta antes de reservar cuota o hacer una consulta externa. Esto confirma el fail-closed esperado del piloto privado; no se inspeccionó la presencia de la clave en el runtime de producción y esta rama no afirma que allí falte. Con una clave disponible, el proveedor sigue sujeto a la validación de respuesta de `backend/lib/ruc.ts` y a `rejectSimulated=true`; una respuesta demo no puede convertirse en un RUC confirmado.

La ruta privada `/api/ruc` agrega la guardia de identidad exacta (`RUC_PILOT_USER_ID`, `RUC_PILOT_TENANT_ID`, `RUC_PILOT_OWNER_EMAIL`) antes de consultar. La configuración ausente o una identidad distinta también responde 503 y permite carga manual. No se ejecutó ninguna consulta real durante esta verificación.

## Corrección entregada en esta rama

El POS podía recibir `nameOfficial`, `identityKind`, `givenNames` y `surnames` al crear un pedido inline, pero los rechazaba. Ahora reutiliza `customerIdentityInput`, conserva el nombre oficial byte por byte y calcula el nombre visible de una persona confirmada desde nombres y apellidos. La misma identidad se persiste al crear o reutilizar la ficha del cliente. Un match implícito por nombre/teléfono/RUC puede completar campos ausentes, pero rechaza una identidad fiscal conflictiva y exige seleccionar la ficha para una edición explícita. El camino de edición de contacto con `customerId` y sin nombre mantiene su compatibilidad.

La ficha normal ya conserva esta identidad mediante `POST/PATCH /api/customers`; este cambio completa el camino POS inline. Las respuestas del proveedor siguen requiriendo revisión explícita y no sobrescriben automáticamente una ficha.

## Verificación

- `backend/tests/ruc-demo.test.mjs`: 143 PASS; cubre 503 condicionado a configuración ausente, ausencia de consulta externa y datos simulados rechazados.
- `backend/tests/run-unit.cjs`: 348 pruebas, 347 PASS, 0 fallos y 1 skip.
- `backend/tests/orders-inline-fiscal-identity.mjs`: 18 checks PASS contra PG/HTTP aislado: empresa, persona, nombre oficial exacto, persona sin nombre visible, completado explícito de un campo fiscal ausente, rechazo de conflicto y conservación de la identidad existente.
- `npm test`: 1.593 PASS; `npm run lint`: 0 errores y 1 warning preexistente; build Vite PASS.
- Backend: `tsc --noEmit`, `prisma validate` y `next build` PASS; `BUILD_ID=fUCUGnlW2krPHI6X-Xit5`.
- El arnés HTTP completo PASS: migraciones y `check-db-schema` en PG aislado, backup/restauración (67 productos y 98 órdenes idénticos), flujos de abastecimiento, pagos, consistencia y logout, además de los 18 checks de identidad fiscal inline. Los errores SQL de constraints que aparecen durante algunos casos son respuestas negativas esperadas del arnés; no dejaron inconsistencias y el proceso terminó con exit 0.

La consulta del proveedor real y la habilitación del piloto quedan pendientes de configuración humana del servidor. Esta rama no cambia claves, límites, proveedor ni producción.
