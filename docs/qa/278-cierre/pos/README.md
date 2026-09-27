# Cierre #278 · dominio POS

## 1) #256 · Compacto del pipeline Trade-In del dueño

Patrón #256: una sola barra de módulo (`BarraModulo`) con la identidad y la
acción juntas; el `h1` sigue siendo el del shell. Antes el contenido repetía
«Equipos recibidos como pago» como título grande (`h2.text-2xl`) y dejaba
«Actualizar» aislado en la fila.

| Variante | Antes (producción, sin el fix) | Después (rama `slot/pos`) |
|---|---|---|
| Desktop claro | `trade-in-desktop-claro-antes.jpg` | `trade-in-desktop-claro-despues.jpg` |
| Desktop oscuro | `trade-in-desktop-oscuro-antes.jpg` | `trade-in-desktop-oscuro-despues.jpg` |
| Mobile claro | `trade-in-mobile-claro-antes.jpg` | `trade-in-mobile-claro-despues.jpg` |

Marcadores (`resultados-trade-in-antes.json` → `resultados-trade-in-despues.json`):
`barraCompacta` 0 → 1 · `encabezadoGrandeDuplicado` 1 → 0 · sin errores de página.

Reproducir:

```bash
# Antes (demo pública de producción)
QA_BASE_URL=https://app.moboss.online QA_ETIQUETA=antes \
  QA_OUT=docs/qa/278-cierre/pos node scripts/qa-256-tradein-pipeline.mjs
# Después (demo local con la rama)
QA_BASE_URL=http://localhost:5216 QA_ETIQUETA=despues \
  QA_OUT=docs/qa/278-cierre/pos node scripts/qa-256-tradein-pipeline.mjs
```

## 2) #148 §20 · Aviso de disponibilidad del enlace público

El aviso «Sin stock en este momento: lo confirmamos al cerrar» ya estaba
implementado (`src/pages/CarritoPublico.jsx`) pero no tenía aserción e2e ni
captura. Se agrega el test a `e2e/pos-qa-173.spec.js` («el enlace público del
borrador avisa cuando no alcanza el stock»): borrador con 2 unidades de un
producto con 1 en stock → la página pública lo avisa.

- Captura: `carrito-publico-aviso-stock.jpg`.
- Reproducir: `MOBOS_CAPTURAS=docs/qa/278-cierre/pos npx playwright test e2e/pos-qa-173.spec.js`
