# #241 · F3 paso 6 — Ficha de unidad completa v2

**Qué pide el paso**: *checklist persistido + grado oficial + chips de locks reales
con fuente/hora* (dependía de INV: persistencia y grado).

El rediseño visual de la ficha ya estaba detrás del flag `preview v2`; lo que
faltaba era que la ficha **muestre y use los datos reales** en vez de solo el
borrador en pantalla. Nada de esto cambia el default (sin flag la app se ve igual)
y no hay migración: se apoya en la persistencia de #240 y en las consultas IMEI
que ya se guardan.

## Qué cambia

### Checklist persistido
- El encabezado del PhoneCheck distingue **oficial** (lo que quedó guardado en la
  unidad, con puntaje, fecha y autor) del **borrador** en pantalla.
- `Cambios sin guardar` aparece cuando la huella del borrador difiere de lo
  persistido; al guardar, el oficial se toma de la respuesta del servidor
  (`puntaje`/`grado` calculados allí) y queda el chip `Guardado`.
- Se muestra el avance **«x de y con resultado»** y cada estado del semáforo
  expone `aria-pressed` (accesible y verificable en e2e).

### Grado oficial
- Badge `Grado A/B/C · oficial` + `NN/100 · guardado el dd/mm/aa, hh:mm por
  <usuario>`; si hay cambios sin guardar y el grado cambiaría, se avisa
  `provisional B`.
- Sin inspección guardada, la ficha dice `Provisional <grado>` o `Sin
  inspeccionar` (nunca inventa un grado oficial).

### Chips de locks reales con fuente/hora
- `GET /api/inventory-units/[id]/history` ahora devuelve `verificacion`: la
  **última consulta IMEI guardada** del serial (`serviceName`, `provider`,
  `requestedAt`/`resolvedAt` y los campos normalizados; se excluye la respuesta
  cruda del proveedor).
- La ficha arma los chips con esa verificación o, si hay una **consulta nueva en
  la sesión**, con esa (y lo aclara). Debajo de los chips: `Fuente: Apple Basic ·
  24/9/26, 20:40 · última consulta guardada del serial` (o `· consulta de esta
  sesión`, con el agregado `· simulado` en el adaptador simulado).

### Lógica pura (`src/lib/phonecheck.js`)
- `estadoInspeccion({ inspection, borrador })` → `{ oficial, provisional,
  sinGuardar, marcados, total }`.
- `huellaInspeccion(inspection)` → huella estable (no depende del orden de los
  ítems; normaliza batería, cosmético, notas y costo de repuestos).
- `resumenVerificacion(verificacion)` → `{ servicio, proveedor, fecha, simulado,
  chips }` (acepta `campos` o `normalized`; sin campos devuelve `null`).

## Capturas (después)

`docs/rediseno/c241f3p6-ficha-on-{claro,oscuro}-{desktop,mobile}.png` — ficha con
`Grado A · oficial`, `100/100 · guardado el … por …`, `Guardado`, el avance del
checklist y los chips de locks con su fuente.

- Contraste del shell: **0 bajos en las 4 combinaciones** (AA).
- Nota para DSN: en tema claro el chip de contenido `Vendido` mide 4.25 (el
  informe separa shell de contenido; queda como hallazgo de tokens v2).

## Verificación

- Unit: `src/lib/phonecheck.test.js` (+2 tests: oficial vs borrador, chips con
  fuente).
- e2e `e2e/qa-241-ficha-paso6.spec.js`:
  - funcional: consulta IMEI real guardada → chips + fuente/fecha; checklist
    completo → `Grado A · oficial` + `Guardado` + fecha/autor; recarga y reabre →
    todo sale de lo persistido (`aria-pressed` del primer ítem en `true`).
  - capturas: claro/oscuro × 1280/390 con el flag + auditoría de contraste.
- Regresión: `inventario-unidades` (#240), `qa-249-inventario-touch` (#245),
  `informe-publico-checklist`, `qa-240-garantia-portal`, `qa-240-valuacion` y
  `dsn-241-dominios` en verde.
