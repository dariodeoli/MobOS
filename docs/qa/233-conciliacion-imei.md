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
    Capturas: `docs/qa/233-conciliacion-imei/01-modal-conciliar.png` y
    `02-consulta-conciliada.png` (harness, backend real).
- e2e `e2e/demo-imei-conciliacion.spec.js` (demo anónima, sin backend): consulta
  simulada → registro → modal → guardado, con capturas
  `demo-03-modal-conciliar.png` y `demo-04-consulta-conciliada.png`.
- Producción: `node scripts/qa-233-conciliacion-prod.mjs` (lee la versión, busca
  las marcas en los assets y recorre el flujo en la demo con capturas en
  `docs/qa/233-conciliacion-imei/prod/`).

### Hallazgo del deploy v1.0.145 (importante)

La búsqueda de la ventana exigía **15 dígitos**, pero los seriales de la demo son
`AUR…` (16): en la demo la consulta registrada **nunca aparecía** y la ventana
parecía de solo lectura. El fix (usar `validarImeiDemo` y permitir alfanuméricos
en el campo cuando `esDemo`) quedó fuera del merge de `main` (`9db98228`): está
re-aplicado en esta rama y cubierto por el e2e de la demo. En la **cuenta real**
(IMEIs de 15 dígitos) el flujo de v1.0.145 funciona; en la **demo** entra con la
próxima ronda.

## Notas

- `GET /api/imei` ahora devuelve `conciliatedAt` y `conciliationNote` para que el
  registro muestre la conciliación sin recargar.
- `paraInputFechaHora` (`src/utils/fecha.js`) es el helper único para los
  `<input type="datetime-local">` (hora local del equipo).
