# App de iPhone = web móvil: medición y diferencias

Medido con la demo (sin cuenta real), 390×844 (iPhone 16e en el simulador, Chromium móvil en la web),
tema claro. Capturas antes/después en esta carpeta (izquierda simulador, derecha web).
Para repetir: `bash scripts/ios-paridad-capturas.sh` (ver `docs/IOS-APP.md`, «Paridad con la web»).

## Diferencias encontradas y corregidas

| Pantalla | Diferencia | Causa | Estado |
|---|---|---|---|
| Todas | Fuentes (Inter, Space Grotesk) bajaban de Google Fonts: sin red o con red lenta la app caía a la fuente del sistema y todo cambiaba de ancho | `@import` remoto en `index.css` | Corregido: `@fontsource` propio, igual en web y app, también sin conexión |
| Pedido (detalle) y cualquier botón que navega | Al abrir un pedido se enfocaba solo «Dejá un comentario», saltaba 1450 px y se abría el teclado | `enfoque.js` trataba la pantalla nueva como «sección que se abrió» | Corregido (web y app): un clic que cambia de ruta ya no roba el foco |
| Inputs en web móvil | Solo la app forzaba 16 px (sin zoom de iOS); Safari móvil hacía zoom en los campos de 12–14 px | Regla `html.app-ios input` | Corregido: misma regla en pantallas angostas de web y app |
| Todas | Resaltado gris al tocar solo se quitaba en la app | Regla `html.app-ios` | Corregido: global |

Sin diferencias (medido): cabecera, selector de sucursal, barra de Demo, pestañas, tarjetas de Inicio, catálogo,
carrito, cobro, lista y detalle de pedidos, clientes, Stock, Finanzas, Configuración, Módulos, popup «Cliente»,
menú «Más». El test `#paridad todas las pantallas` (e2e/frontend/paridad-shell516.frontend.spec.js) fija
cabecera, barra inferior, primer bloque, popup, título y ausencia de overflow en 360 y 390 px.

## Diferencias que quedan (con motivo)

| Qué | Motivo |
|---|---|
| Zonas seguras (isla/notch arriba, barra de inicio abajo) | Nativo; no existen en el navegador |
| Ingreso: «Continuar con Apple», sin «Volver al inicio», sin «Creá tu tienda», con Privacidad · Términos, sin pie institucional | Apple 4.8 y 3.1.1 (sin alta de tienda ni planes). El pie queda afuera para que el ingreso entre sin scroll en iPhone SE (test auth516) |
| Bloque «iPhone» en Mi cuenta (Face ID, avisos, borrar cuenta) | Nativo / Apple 5.1.1(v) |
| `overscroll-behavior-y: none` y sin menú de vista previa al mantener presionado un enlace | Comportamiento de app: sin rebote ni pull-to-refresh del navegador |
| Aviso previo y permiso de notificaciones | Nativo (push) |
| Texto 1–3 % más ancho/angosto en algunas líneas | Motor de render: WebKit (app) vs Chromium (capturas web). En Safari real la web coincide |
| Enlaces externos | Capacitor los abre en el navegador del sistema (`WebViewDelegationHandler`); no hace falta código |

## Revisado y sin cambios

`viewport-fit=cover` + `interactive-widget=resizes-content` (index.html), `100dvh` (`min-h-dvh`), teclado
(`Keyboard.resize = body` + `enfoque.js`), compartir (`@capacitor/share` vía `lib/nativo/compartir*.js`, Web Share
en la web), impresión (agente de impresión, igual en ambas). Inicio de sesión con Google y Apple: no se tocó.
