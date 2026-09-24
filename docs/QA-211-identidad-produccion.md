# QA #211 — identidad unificada en producción (v1.0.153 → v1.0.154)

Verificación **post-deploy** del objeto único de identidad (`PersonaChip`) en
las superficies adoptadas, sobre producción (`app.moboss.online`) y con el
**demo anónimo** como Dueño (sin credenciales; datos aislados en el navegador).

- Script: `node e2e/prod/211-identidad.mjs` (Playwright headless, 1280×900,
  zona America/Asunción). Sale 1 si un paso falla.
- Evidencia: `docs/qa/211-identidad-prod/` (capturas claro/oscuro +
  `resultados.json`).
- Versiones verificadas: **v1.0.153** (deploy inicial) y **v1.0.154** (repetición del 24-09, mismo resultado 8/8; el mínimo del script se pasa por `QA211_VERSION_MINIMA` y hoy es 1.0.154).

## Resultado — 8/8 pasos

| Paso | Resultado |
| --- | --- |
| La versión desplegada incluye la identidad unificada | ✅ v1.0.153 y v1.0.154 |
| Pedido: encabezado y superficies con chip (claro) | ✅ 3 chips · 0 imágenes rotas |
| Pedido: bloque de transacciones con chip | ✅ chips presentes |
| Pedido: oscuro sin imágenes rotas | ✅ 3 chips |
| Pantalla de bloqueo: chip con **primer nombre** + PIN | ✅ “Hernán” + “Ingresá tu PIN de 4 dígitos” |
| Pantalla de bloqueo: oscuro | ✅ |
| Píldora de presencia del topbar | ⚠️ no visible en el demo anónimo (no hay otras personas en línea) |
| Errores de runtime en el recorrido | ✅ 0 |

Capturas: `01-pedido-cronologia-claro.png` · `02-pedido-cronologia-oscuro.png`
· `03-bloqueo-claro.png` · `04-bloqueo-oscuro.png`.

En la captura del pedido se ve además la **identidad de la sesión en el pie
del menú** (avatar + nombre + rol) usando el mismo objeto.

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
