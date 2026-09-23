# Inspección PhoneCheck persistida (#240)

Cierra el desajuste que PRN marcó dos veces en #240: la ficha manda el checklist
**por clave** (`{ pantalla: { estado, nota } }`) y el PATCH solo puntuaba si
`items` era **lista**, guardando `items: []`. Resultado: al guardar desde la app
se perdían los ítems, `puntaje`/`grado` quedaban en `null` y el informe público y
el certificado salían sin grado.

## Qué cambia

- `backend/lib/inspection.ts`: normalización del checklist (objeto por clave o
  lista histórica), lista derivada para el papel y reglas de puntaje/grado
  iguales a la UI (OK=1 · observación=0,5 · falla=0 · N/A no cuenta; A ≥ 90, B ≥ 75).
- `PATCH /api/inventory-units` (`action=inspection`): persiste `items` (objeto),
  `itemsLista` (lo que recorre el informe impreso), `puntaje` y `grado`
  calculados en el servidor.
- `GET /api/public/informe/:serial`: lee `itemsLista` (y acepta la lista
  histórica en `items`) para no perder el checklist del certificado.
- Demo: `updateDemoUnit` guarda también `puntaje`/`grado`, así el tablero de
  certificaciones y el informe leen lo mismo que en la cuenta real.

## Verificación

- Unit `backend/tests/inspection.test.ts`: normalización (objeto/lista/valores
  raros), puntaje, grado y lista derivada.
- e2e `e2e/inventario-unidades.spec.js` › *la inspección guarda el checklist por
  clave con puntaje y grado*: marca «Bien» + «Con observación», carga repuestos
  con nota, guarda y — tras recargar — la ficha muestra **Grado B · 75/100**; por
  API quedan `items`, `itemsLista`, `puntaje 75` y `grado B`.
- Producción: `scripts/qa-240-certificado-prod.mjs` recorre inspección →
  certificado (80 mm y A4) con grado, puntaje, checklist y repuestos; capturas
  en `docs/qa/240-certificado/prod/`.

## Para PRN

El papel sigue leyendo la lista (`itemsLista` o el payload normalizado de
`payloadInformeInspection`); el grado/puntaje persistidos son los que manda el
servidor y coinciden con lo que muestra la ficha.
