# Controles del dispositivo en el informe público (#240)

Continuación del [checklist en el informe público](240-informe-publico-checklist.md):
el enlace compartido con el comprador ahora muestra el **semáforo de los locks**
de la última consulta IMEI.

## Qué incluye

- `GET /api/public/units/:serial` → dentro de `unit`, `controles`:
  `[{ clave, label, valor, ok }]` con los mismos rótulos y criterio que la ficha
  (`locksDeVerificacion`): iCloud/Find My (Off = limpio), MDM, ESN/Blacklist
  (sin reportes = limpio), Carrier/SIM (unlocked = limpio).
- **Solo se publican los locks informados con valor**: un «—» verde no aporta
  nada (el papel lo resuelve como «Sin dato»); el resto del `normalized` del
  proveedor no viaja al enlace público.
- La página los dibuja como chips con semáforo (verde/rojo) dentro de la tarjeta
  «Consulta de IMEI». En la demo el payload sale del mock local con el mismo
  criterio (`demoInformePayload`).
- El IMEI sigue enmascarado en todo el informe.

## Verificación

- Unit `backend/tests/imeicheck.test.ts` › `controlesPublicos`: rótulos, semáforo
  (Off/Sin reportes/Unlocked verdes; On/Activado/Reportado/Locked rojos), campos
  que no son locks descartados y sin valor → sin chip.
- e2e `e2e/informe-publico-controles.spec.js`: crea una unidad con IMEI válido,
  corre la consulta mock (Find My Off, SIM Unlocked, blacklist sin reportes) y el
  informe público muestra los tres chips verdes, sin MDM (sin dato) y con el IMEI
  enmascarado. Captura: `docs/qa/240-informe-publico-controles/01-controles.png`.
- Post-deploy: `scripts/qa-240-historial-serial-prod.mjs` (paso del informe
  público) queda para sumar los controles cuando la ronda esté desplegada.

## Pendiente para la próxima ronda

- Verificación post-deploy del informe público con controles (v1.0.15x).
