# QA #211 — identidad y stepper v2 en producción (v1.0.153 → v1.0.158)

Verificación **post-deploy** del objeto único de identidad (`PersonaChip`) en
las superficies adoptadas, sobre producción (`app.moboss.online`) y con el
**demo anónimo** como Dueño (sin credenciales; datos aislados en el navegador).

- Script: `node e2e/prod/211-identidad.mjs` (Playwright headless, 1280×900,
  zona America/Asunción). Sale 1 si un paso falla.
- Evidencia: `docs/qa/211-identidad-prod/` (capturas claro/oscuro +
  `resultados.json`).
- Versiones verificadas: **v1.0.153**, **v1.0.154**, **v1.0.156** y **v1.0.158** (repeticiones del 24-09, siempre 10/10; el mínimo del script se pasa por `QA211_VERSION_MINIMA`, hoy 1.0.154).

## Resultado — 10/10 pasos

| Paso | Resultado |
| --- | --- |
| La versión desplegada incluye la identidad unificada | ✅ v1.0.153 · v1.0.154 · v1.0.156 · v1.0.158 |
| Pedido: encabezado y superficies con chip (claro) | ✅ 3 chips · 0 imágenes rotas |
| Pedido: bloque de transacciones con chip | ✅ chips presentes |
| Pedido: oscuro sin imágenes rotas | ✅ 3 chips |
| Pantalla de bloqueo: chip con **primer nombre** + PIN | ✅ “Hernán” + “Ingresá tu PIN de 4 dígitos” |
| Pantalla de bloqueo: oscuro | ✅ |
| v2: stepper de entrega del pedido con el flag `preview v2` | ✅ 4 pasos («Pendiente · Preparando · Listo para retirar · Retirado») sin imágenes rotas |
| v2: el flag se apaga sin dejar restos | ✅ |
| Píldora de presencia del topbar | ⚠️ no visible en el demo anónimo (no hay otras personas en línea) |
| Errores de runtime en el recorrido | ✅ 0 |

Capturas: `01-pedido-cronologia-claro.png` · `02-pedido-cronologia-oscuro.png`
· `03-pedido-v2-stepper.png` · `04-bloqueo-claro.png` · `05-bloqueo-oscuro.png`.

En la captura del pedido se ve además la **identidad de la sesión en el pie
del menú** (avatar + nombre + rol) usando el mismo objeto.

## Hallazgo (no bloquea, para POS/DSN)

Con el flag `preview v2`, el **stepper de entrega no marca ningún paso como
actual** en los pedidos del **demo**: las 4 tarjetas quedan grises. Causa: las
ventas del demo entran a la lista con `fulfillmentStatus` = el texto de
`entrega` («Retiro en tienda» / «Delivery»), que no es una clave de estado
(`sellerOrders` los mapea así para la demo), y el stepper no encuentra el paso.
En pedidos con estados reales de la API no se reproduce (no hay pedidos así en
el demo anónimo para verificarlo). Sugerencia: normalizar ese mapeo de demo a
una clave (`PENDING`/`PROCESSING`) o hacer que el stepper caiga al primer paso
cuando el estado es desconocido.

## Observaciones (no bloquean)

- El pedido del demo **no tiene movimientos** (“Sin movimientos — La cronología
  con comentarios y fotos está disponible con una cuenta real”), así que la
  regla “un solo chip por evento” no se puede ejercitar ahí; el script la
  evalúa cuando hay eventos y quedó cubierta por el QA de DSN con **dos
  sesiones** en un pedido real (foto local → Google → iniciales).
- Los usuarios del demo no tienen foto: los chips se ven con **iniciales**
  (el camino de la cadena con imagen se verificó en el QA de DSN con una foto
  subida por API).
- La **píldora de presencia** necesita dos sesiones para tener personas en
  línea; en el demo anónimo no aparece (correcto: sin nadie en línea no ocupa
  espacio). El puente por nombre para la foto de Google del dueño sigue
  anotado hasta que el API de presencia exponga `picture` por persona.

## Reproducir

```bash
node e2e/prod/211-identidad.mjs            # capturas en docs/qa/211-identidad-prod/
QA211_SHOTS=/tmp/qa211 node e2e/prod/211-identidad.mjs
```
