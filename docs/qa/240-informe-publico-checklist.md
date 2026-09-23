# Checklist de la inspección en el informe público (#240)

Gap que quedaba del informe de dispositivo: la ruta pública devolvía
`checklist: null` y la página solo mostraba el grado y los repuestos. Ahora el
enlace que se comparte con el comprador (`/u/<serial>`) muestra el **checklist
con semáforo** de la inspección.

## Qué incluye

- `GET /api/public/units/:serial` → `unit.checklist`:
  `{ puntaje, aprobados, evaluados, items: [{ label, estado, nota }] }`.
- **Privacidad del contrato** (`docs/PHONECHECK-INFORME.md`): las **notas solo
  viajan en los ítems no conformes** (observación/falla); las de ítems OK o
  «no aplica» se descartan en el servidor.
- **Rótulos** desde el catálogo único del backend (`ETIQUETAS_ITEMS`, mismas
  10 claves que la ficha) y resumen «x de y conformes · puntaje/100».
- La página pública dibuja el semáforo con los tonos del sistema
  (ok/warn/bad/mute) y el **grado** que ya se mostraba.
- En la demo el payload se arma igual (`demoInformePayload` → `checklistDemo`).

## Verificación

- Unit `backend/tests/inspection.test.ts`: `checklistPublico` (rótulos, resumen,
  notas solo de lo no-OK, N/A contado como conforme, sin ítems → `null`).
- e2e `e2e/informe-publico-checklist.spec.js`: guarda una inspección con un ítem
  OK **con nota interna** y otro con observación; el informe público muestra
  «1 de 2 conformes · 75/100», ambos ítems y **solo** la nota del no conforme.
  Captura: `test-results/informe-publico-checklist/01-informe-publico-checklist.png`.
- La ruta pública ya se verifica post-deploy en
  `scripts/qa-240-historial-serial-prod.mjs` (paso del informe público).

## Pendiente para la próxima ronda

- Chips de **controles IMEI** (iCloud/Find My/ESN/carrier) con el mismo contrato
  del papel: requieren exponer el `normalized` de la última consulta (hoy el
  informe público solo muestra fuente/resultado/fecha).
