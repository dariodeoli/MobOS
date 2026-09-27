# Cierre #278 · hallazgos de las auditorías (#250/#148/#256) — slot INVENTARIO

Cierra los tres ítems de INV del issue de cierre: el **botón de lista de compra**
(§11 de #250), el **historial del serial en la ficha de la unidad** (F4 de #250)
y los **compactos de #256** que faltaban en Precios · Celulares · Comparador.

Spec re-ejecutable: `e2e/qa-278-cierre.spec.js` (**3/3**). Capturas:
`docs/qa/278-cierre/`.

## 1. Lista de compra 80 mm desde el panel (#250 §11)

El impreso existía sin llamador (`b04cbf04`, v1.0.180) y `docs/LISTA-COMPRA.md`
declaraba «adopción del panel: pendiente de UI».

- **API (aditiva, sin migración):** `GET /api/supply/purchases` ahora manda
  `createdBy { name }` en la compra y, por línea, `priority`, `source`,
  `promisedAt`, `orderNumber` y `needOrigin` de su necesidad. Era el «pedido a
  INV» del contrato (§1 de `docs/LISTA-COMPRA.md`); el arnés
  `backend/tests/supply-purchases.mjs` §13 lo verifica.
- **UI:** botón **«Lista de compra»** en cada fila de **Compras del Centro**
  (`ListaCompraModal`). Vista previa real del papel, **Imprimir** por la
  impresora del tipo `lista-compra` (con diálogo de respaldo), **PDF real**
  (`CompartirPdf`) y **PNG** (`CompartirImagen`). El tipo quedó registrado en
  `preferencias.js` para «Formatos»/«última usada».
- **Evidencia:** `lista-compra-modal-claro-desktop.png` y
  `lista-compra-modal-claro-mobile.png`. El test imprime contra el agente
  simulado y valida el papel (`LISTA DE COMPRA`, `COM-…`, proveedor, producto,
  `Prioridad Alta · Carga manual`, `Reposición libre`) y descarga el PDF real.

## 2. Cadena de abastecimiento en la ficha de la unidad (#250 F4)

`GET /api/supply/serials/:serial` (necesidad → compra → lote → estado) no tenía
consumidor. Ahora la ficha de la unidad (Inventario → Unidades) muestra el bloque
**«Cadena de abastecimiento»**: estado en stock, necesidad con origen/destino/
promesa, compra (código, proveedor, referencia, estado, fecha) y cada lote
(envío, método, recorrido, salida/ETA/llegada). Sin cadena se anuncia el ingreso
directo a stock; en demo el bloque no aplica.

- **Archivos:** `UnidadDetalle.jsx` (+ recurso `supplySerials` en
  `src/lib/api/index.js`). Etiquetas con los objetos de `owncoding-ui`
  (`etiquetaOrigen`, `etiquetaNecesidad`, `etiquetaEnvio`, `etiquetaMetodoEnvio`).
- **Evidencia:** `unidad-cadena-claro-desktop.png` y `unidad-cadena-claro-mobile.png`
  (con `COM-CDE-0012 · Proveedor…`, `ENV-CDE-SUC-0009 · Recibido`, `CDE → Sucursal
  E2E`). El test arma la cadena por API, recibe y verifica la API y la ficha.

## 3. Compactos de Precios · Celulares · Comparador (#256)

Patrón de `BarraModulo`: una sola barra con la identidad del módulo (h2), su
detalle y las acciones juntas; sin encabezado grande duplicado ni botones
aislados. Los tres quedan con `data-testid` `barra-precios`,
`barra-celulares` y `barra-comparador` (el que mide `scripts/qa-256-cierre.mjs`).

| Pantalla | Antes (v1.0.192) | Después (#278) |
|---|---|---|
| Precios | `docs/qa/256-cierre/produccion/precios-claro-desktop.jpg` (dos tarjetas con encabezado propio y botón dentro) | `compacto-precios-claro-desktop.png` — barra con «+ Nueva lista»; secciones rotuladas |
| Celulares | `docs/qa/256-cierre/produccion/celulares-claro-desktop.jpg` (fila de botones suelta) | `compacto-celulares-claro-desktop.png` — barra con «Compartir por WhatsApp» y «Comparar»; la tarjeta exportable queda intacta |
| Comparador | `docs/qa/256-cierre/produccion/comparador-claro-desktop.jpg` (switch suelto) | `compacto-comparador-claro-desktop.png` — barra con el switch de condición a la derecha |

En los tres: captura desktop + 390 px sin desborde horizontal
(`compacto-*-claro-mobile.png`) y los títulos/secciones que usaban otros specs se
conservaron (`Listas de precios`, `Precios por cantidad`, `+ Nueva lista`).

## 4. Cómo re-verificar

```sh
# con los puertos aislados de tu worktree (MOBOS_E2E_*)
npx playwright test e2e/qa-278-cierre.spec.js
MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh   # arnés F1→F6 + lista §13
node scripts/e2e-shards.mjs --check                          # el spec nuevo está shardeado
```

Nota de estado: `qa-254-por-comprar` afirma **pestañas vacías** («Compradas»,
«Recibidas», «Canceladas»), así que necesita una base e2e sin compras del Centro
de otras corridas; el sharding de CI lo mantiene separado de los specs que crean
compras (`qa-250-escaneo-recepcion`, `qa-278-cierre`). No es un cambio de este
cierre: se verificó verde sobre base limpia.
