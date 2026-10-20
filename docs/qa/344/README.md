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

## Contrato UI fiscal POS — 2026-10-20

`e2e/qa-344-fiscal-pos.spec.js` recorre componentes reales del POS e inspecciona los requests HTTP que emiten. Las respuestas de clientes, RUC y pedidos se simulan; esto prueba el contrato UI/API, **no una consulta real de OwnData ni la habilitación del piloto**. No se leyeron claves ni se usaron datos reales.

Cuatro casos nuevos: (1) selección de cliente con campos fiscales `null`, confirmación sin enviar borrado fiscal; (2) PERSON persistida sin teléfono/correo, con tuple exacto en PATCH y POST orders; (3) aceptación explícita de nombre fiscal de 1.924 caracteres, espacios/puntuación intactos, nombre visible manual separado en POST/PATCH y fiscal exacto en orders; (4) conflicto 409 mantiene formulario/datos/error y reintento 201 cierra edición. El POST orders recibe un 409 simulado para evitar crear una venta y mantener la pantalla; la evidencia es el payload realmente emitido.

Se agregó un campo independiente «Nombre visible del cliente» cuando hay identidad fiscal: editarlo conserva la identidad aceptada. **Integración posterior a POS #622 / v236:** reconciliar este campo con el nombre editable del Modal de esa rama para evitar dos controles redundantes; conservar la separación `displayName` / `nameOfficial` y no invalidar fiscal al cambiar sólo el visible. Esta rama no incluye el layout de #622.

El archivo de QA sin seguimiento recibido de la tarea anterior se reemplazó: su tercer caso disparaba un evento sin consumidor y afirmaba que no se emitía pedido; no era evidencia del flujo de venta.

Validaciones tras rebase sobre v1.0.235: frontend 1.598 PASS; lint 0 errores (1 warning previo en DeliveryOperations); build frontend PASS; helpers fiscales 12 PASS con `node --test`. Backend sin cambios respecto a los gates PG/HTTP/build/Prisma documentados arriba. Cluster aislado `/tmp/mobos-e2e-pg-344-contract`, PG 5587, API 3187, web 5287.

### Novedades para el dueño

- El POS conserva los datos fiscales al confirmar clientes sin teléfono ni correo.
- Los nombres fiscales largos pueden conservarse completos usando un nombre corto para el mostrador.
- Un conflicto al guardar permite corregir o reintentar sin perder lo cargado.
- El piloto con el proveedor real sigue pendiente; estas pruebas usan respuestas simuladas.

## Compatibilidad con POS #622

La rama funcional `codex/pos-620-fiscal-344` unifica el campo visible con el nombre editable del Modal compartido de #622. Véase `docs/qa/620-344/README.md`; el campo redundante fue eliminado en esa integración, preservando fiscal e id. Las ramas originales permanecen intactas.
