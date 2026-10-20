# #344 — OwnData RUC y conservación de identidad fiscal

## Diagnóstico del endpoint 503

`GET /api/public/ruc` devuelve `503` con `details.code=provider_not_configured` cuando falta `RUC_API_KEY`. La ruta corta antes de reservar cuota o hacer una consulta externa. Esto es el comportamiento esperado del piloto privado: la clave se configura sólo en el servidor y nunca se expone al demo, al navegador ni a los logs. Con una clave disponible, el proveedor sigue sujeto a la validación de respuesta de `backend/lib/ruc.ts` y a `rejectSimulated=true`; una respuesta demo no puede convertirse en un RUC confirmado.

La ruta privada `/api/ruc` agrega la guardia de identidad exacta (`RUC_PILOT_USER_ID`, `RUC_PILOT_TENANT_ID`, `RUC_PILOT_OWNER_EMAIL`) antes de consultar. La configuración ausente o una identidad distinta también responde 503 y permite carga manual. No se ejecutó ninguna consulta real durante esta verificación.

## Corrección entregada en esta rama

El POS podía recibir `nameOfficial`, `identityKind`, `givenNames` y `surnames` al crear un pedido inline, pero los rechazaba. Ahora reutiliza `customerIdentityInput`, conserva el nombre oficial byte por byte y calcula el nombre visible de una persona confirmada desde nombres y apellidos. La misma identidad se persiste al crear o reutilizar la ficha del cliente. El camino de edición de contacto con `customerId` y sin nombre mantiene su compatibilidad.

La ficha normal ya conserva esta identidad mediante `POST/PATCH /api/customers`; este cambio completa el camino POS inline. Las respuestas del proveedor siguen requiriendo revisión explícita y no sobrescriben automáticamente una ficha.

## Verificación

- `backend/tests/ruc-demo.test.mjs`: cubre 503 sin `RUC_API_KEY`, ausencia de consulta externa y datos simulados rechazados.
- `backend/tests/customer-identity.test.mjs`: cubre POST/PATCH, nombre oficial exacto y clasificación de persona/empresa.
- `backend/tests/orders-inline-fiscal-identity.mjs`: prueba HTTP contra PG aislado de empresa y persona, incluyendo nombre oficial, RUC y nombres desdoblados.

La consulta del proveedor real y la habilitación del piloto quedan pendientes de configuración humana del servidor. Esta rama no cambia claves, límites, proveedor ni producción.
