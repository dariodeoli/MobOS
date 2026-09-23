# Conciliación de la consulta IMEI desde la app (#233)

La ventana **Consultas IMEI** era de búsqueda/lectura: el botón «Conciliar» solo
aparecía en registros con estado *A conciliar* (y en la demo nunca se daba ese
estado). Ahora la acción es funcional para **ADMIN/GERENTE** en cualquier
registro, con modal y auditoría.

## Flujo

1. Ficha de la unidad → **Consultas IMEI** → buscar el IMEI.
2. En el registro, botón **Conciliar** (solo ADMIN/GERENTE; el backend valida el
   rol igual y rechaza al resto con 403).
3. Modal **Conciliar consulta IMEI** con:
   - **Estado**: verificado / parcial / fallido,
   - **Costo real (US$)**: precargado con el estimado del registro,
   - **Fecha del panel** (`resolvedAt`): precargada con la del registro (o ahora),
   - **Orden/ID del proveedor** (opcional): precargada si ya existe,
   - **Nota**: precargada con la aclaración obligatoria
     «iCloud/US Block clean ≠ blacklist mundial» (también visible como ayuda).
4. Al guardar (`POST /api/imei` `action=conciliar`): se actualizan `status`,
   `costUsd`, `resolvedAt`, `normalized` (si viaja), `externalId`, la nota y
   `conciliatedAt`; el registro queda «Verificado» y el botón sigue disponible
   para corregir. Se registra `auditLog IMEI_QUERY_CONCILIATED`
   («Consulta IMEI conciliada», área IMEI) con requestId, estado, costo y orden.
5. El registro muestra «Conciliada el … · orden …» debajo del estado.

En demo la acción se resuelve con el mismo contrato (`conciliarDemoImei`).

## Verificación

- e2e `e2e/imei-mock.spec.js`:
  - *el timeout queda a conciliar y administración lo concilia sin repetir la consulta*
    (contrato HTTP, sin UI).
  - *la ficha permite conciliar una consulta desde el modal y deja la auditoría*:
    crea el caso *timeout* (estado A conciliar), abre la ventana, entra al modal,
    verifica la aclaración precargada, guarda orden + costo + nota, comprueba el
    registro por API y la entrada de auditoría `IMEI_QUERY_CONCILIATED`.
    Capturas: `docs/qa/233-conciliacion-imei/` (y `test-results/imei-conciliacion/`).
- El flujo completo corrido en local con el harness (`npx playwright test
  e2e/imei-mock.spec.js --project=admin`): 7/7.

## Notas

- `GET /api/imei` ahora devuelve `conciliatedAt` y `conciliationNote` para que el
  registro muestre la conciliación sin recargar.
- `paraInputFechaHora` (`src/utils/fecha.js`) es el helper único para los
  `<input type="datetime-local">` (hora local del equipo).
