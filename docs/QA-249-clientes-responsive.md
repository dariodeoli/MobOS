# #249 · Clientes — fixes responsive (H2/H3/H4)

Parte de la auditoría responsive de DSN (`docs/QA-RESPONSIVE-MOBILE.md`,
hallazgos priorizados): en Clientes quedaban **acciones de fila**, **chips** y
**casillas de lote** por debajo del área táctil de 44 px.

## Entregado

| Hallazgo | Antes | Ahora | Dónde |
|---|---|---|---|
| **H2 · Resumen rápido y detalle** | 36×36 | **44×44** | `IconAction` (`size="touch"`, `src/components/ui/index.jsx`) |
| **H2 · WhatsApp** | 32×32 | **44×44** | `WhatsAppMenu` (botón principal, `src/components/shared/WhatsAppMenu.jsx`) |
| **H2 · Elegir plantilla** | 16×20 | **44×44** | `WhatsAppMenu` (botón del desplegable) |
| **H3 · Chips de filtro** | 32 | **44** | `SegmentedField` en Clientes con `className="[&>button]:min-h-11"` (el patrón compartido llega con DSN/CMP; acá se aplica al uso) |
| **H3 · Solapas Clientes/Campañas** | 32 | **44** | `SellerCustomers.jsx` (`inline-flex min-h-11 items-center`) |
| **H4 · Casillas de lote** | 16×16 sin área | **área de 44×44** por casilla (el cuadradito sigue de 16) | `ClientesTabla.jsx`: `<label class="h-11 w-11 -my-2">` + columna del grid a `2.75rem` |

Notas de implementación:

- El área de 44 **no cambia el dibujo** (mismo ícono y tono) y `-my-2` evita que
  la fila crezca: el toque se amplía dentro del padding de la fila.
- La casilla sigue siendo un `<input type="checkbox">` real (el `<label>` lo
  envuelve): el clic en el área alterna la selección y no abre la ficha.
- El patrón de chips es local a Clientes para no pisar el cambio compartido de
  DSN/CMP; cuando llegue, se puede quitar el `className`.

## Evidencia

| Captura | Qué muestra |
|---|---|
| `docs/QA-249-clientes-responsive/00-antes-lista-390.png` | **Antes** (auditoría DSN): chips de 32 y casillas sin área |
| `01-lista-390.png` | Después: chips y solapas de 44, lista a 390 |
| `02-acciones-390.png` | Tabla desplazada: accesos de fila ampliados (ojito, detalle, WhatsApp) |
| `03-lote-390.png` | Selección por lote: la casilla de 16 en su área de 44 y la barra «1 seleccionada(s)» |
| `04-plantilla-390.png` | Menú de plantilla abierto desde el botón ampliado |
| `05-lista-768.png` | Los mismos controles ≥44 en tablet (768) |

Gate reproducible (mide cajas reales a 390 y 768 y falla si alguna baja de 44):

```bash
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-MOS-CRM MOBOS_E2E_PGPORT=5510 \
  MOBOS_E2E_API_PORT=3110 MOBOS_E2E_WEB_PORT=5210 \
  npx playwright test e2e/qa-249-clientes-touch.spec.js --project=admin
```

## Checks de esta entrega

`npm run lint` 0 errores · builds FE/BE con `BUILD_ID` ✓ · `npm test` ✓ ·
backend `test:unit` ✓ · `test:e2e:smoke` ✓ · `e2e/qa-249-clientes-touch.spec.js`
**1/1** (targets ≥44 a 390 y 768) · `e2e/qa-236-clientes.spec.js` **1/1** (sin
regresiones del ojito/popup/lote).
