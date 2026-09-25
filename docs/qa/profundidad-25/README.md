# Profundidad del tema (owncoding-ui v0.25.0 · lote 31) — shell, panel y carrito

- **Antes** (`antes/`): el claro quedaba plano — lienzo y tarjetas casi del mismo
  tono, tarjetas con borde de marca (`border-fono/30`) y sin sombra; el shell no
  mostraba capas.
- **Después** (`despues/`): lienzo profundo **#F1F4F8** (claro) / **#181D27**
  (oscuro); `Card` y paneles con **borde neutro + `shadow-card`**; modales,
  cajones y menús con **`shadow-float`**; shell en capas (sidebar/topbar/barra
  inferior elevadas sobre el lienzo, bordes con presencia #D5DCE6 / #3E475A) y
  hovers renovados (#EDF1F6 / #2D3444); el panel de venta y el carrito del POS
  suman la sombra de tarjeta y conservan números de consola (`v2-numero`) y
  chips.

Superficies capturadas: `/resumen` (shell) y `/pos` (panel de venta + carrito)
en **claro/oscuro × 1280/390**, con el flag `preview v2` prendido.

QA: `dsn-241-a11y` (AA del shell en ambos temas), `pos-241-v2` (AA del
carrito/cobro y modales) y `dominios` (equipo/roles con AA del contenido
exigido) en verde — `bajos=0` en todas las mediciones.

Capturado con el harness e2e (`admin.spec.js`, test temporal retirado tras la
captura; `MOBOS_CAPTURA=antes|despues`).
