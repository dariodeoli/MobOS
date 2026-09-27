# #187 · QA visual del shell: AA y contraste en producción (v1.0.190)

Pasada de **diseño/QA visual** sobre el shell en la versión publicada, como
complemento del recorrido funcional de #187 (POS, Inventario y Clientes tienen
sus cierres en el hilo). Acá se mide el **chrome del shell** (barra superior,
lateral/cajón, barra inferior y avisos) y se dejan capturas.

## Método

- `scripts/qa-187-shell-aa.mjs` (Playwright headless) contra
  `https://app.moboss.online`, entrando por la **demo pública** (`/demo` →
  Entrar como Dueño), sin credenciales reales.
- Pantallas: **POS, Resumen, Clientes e Inventario (unidades)**.
- Temas y tamaños: **claro y oscuro** × **desktop 1600×900** y **móvil 390×844**,
  más el **cajón de acciones** abierto en móvil.
- Auditor: el mismo de `e2e/dsn-241-a11y.spec.js` (`e2e/helpers/contraste.js`):
  recorre nodos de texto visibles, **compone las alfas sobre el fondo real**
  (incluye degradados) y exige **AA** (4.5:1; 3:1 en texto grande). El shell debe
  dar **0 bajos**; el contenido fuera del chrome se reporta aparte.

## Resultado — v1.0.190 (27/09/2026)

**18 mediciones · shell sin bajos de AA · contenido sin bajos.**

| Pantalla | Claro desktop | Oscuro desktop | Claro móvil | Oscuro móvil |
|---|---|---|---|---|
| POS | 57 textos · 0 bajos | 57 · 0 | 16 · 0 | 16 · 0 |
| Resumen | 58 · 0 | 58 · 0 | 16 · 0 | 16 · 0 |
| Clientes | 58 · 0 | 58 · 0 | 16 · 0 | 16 · 0 |
| Inventario | 58 · 0 | 58 · 0 | 16 · 0 | 16 · 0 |
| Cajón móvil | — | — | 65 · 0 | 65 · 0 |

## Observaciones visuales (capturas)

- **Topbar**: sucursal, campana y candado legibles en ambos temas; el chip
  «Casa C…» no desborda en 390.
- **Barra del día (POS)**: el degradado verde del total mantiene AA (caso que el
  auditor mide contra el peor tono del degradado).
- **Barra inferior móvil**: 4 accesos + «Menú», con el ítem activo distinguible
  por color **y** posición.
- **Cajón**: grupos plegables (Inicio/Vender/Clientes/Inventario) con el activo
  resaltado y punto verde; acciones con atajos (`Ctrl K`) legibles en oscuro.
- **Aviso de demo**: texto y botón «Cómo funciona» con contraste correcto.

Sin hallazgos de producto de mi lado: el shell se mantiene en AA en todos los
combos y no se observaron solapamientos ni cortes.

## Evidencia

- Capturas (18) + `resultado.json` sellado con v1.0.190:
  `docs/qa/187-shell-aa/produccion/`.
- Re-correr: `node scripts/qa-187-shell-aa.mjs`
  (o `QA_OUT=... node scripts/qa-187-shell-aa.mjs`); sale con código 1 si el
  shell baja de AA.
- Complementa: `docs/QA-241-shell-aa.md` y `docs/QA-241-shell-produccion.md`
  (pasadas previas de AA del chrome, con la misma herramienta).
