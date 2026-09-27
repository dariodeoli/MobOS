# #253 · Menú interno de Configuración colapsable y horizontal

La navegación de los 7 grupos de Configuración suma el modo **colapsable**
(solo íconos con tooltip) en escritorio y mantiene la **tira horizontal** en
mobile/tablet, con espaciado y accesibilidad cuidados.

## Qué cambió

- **Riel colapsable (escritorio):** un botón `config-nav-toggle` (chevron)
  contrae el riel a **solo íconos** (3.75 rem) y lo vuelve a expandir. El estado
  se **recuerda por dispositivo** (`localStorage['mobos:config-nav']`).
- **Tooltips y lectura:** cada ícono conserva `title` y `aria-label` con el
  nombre del grupo, así el menú contraído sigue siendo entendible y anunciado.
- **Accesibilidad:** el toggle expone `aria-expanded` y `aria-controls`
  (`#config-grupos`); las pestañas mantienen `role="tab"`/`aria-selected`; las
  **flechas** (↑↓←→) mueven y activan la pestaña contigua a la enfocada; el foco
  visible usa los tokens del tema.
- **Mobile/tablet:** la tira horizontal con íconos + etiquetas se mantiene y el
  toggle **no se muestra** (ahí ya es compacta); la sección activa se centra sola.
- **Espaciado:** gap del riel a 4 px, paddings parejos (2 en el contenedor, 3 en
  cada fila) y 44 px de alto por fila, alineado con el resto del shell.

## Capturas (`docs/qa/253-config-nav/`)

| Archivo | Qué muestra |
|---|---|
| `nav-expandido-claro-desktop.jpg` / `nav-expandido-oscuro-desktop.jpg` | riel completo en ambos temas |
| `nav-colapsado-claro-desktop.jpg` / `nav-colapsado-oscuro-desktop.jpg` | solo íconos con tooltip y toggle |
| `nav-horizontal-mobile-claro.jpg` / `nav-horizontal-mobile-oscuro.jpg` | tira horizontal en 390 en ambos temas (sin toggle) |

Se reproducen con
`MOBOS_CAPTURAS=docs/qa/253-config-nav npx playwright test e2e/qa-253-config-grupos.spec.js --project=admin -g "capturas del menú"`.

## Verificación

- `e2e/qa-253-config-grupos.spec.js` **6/6**: estructura y deep links, sin
  scroll 390/1280, AA claro/oscuro, capturas, **colapso** (íconos, tooltips,
  `aria`, persistencia y teclado) y capturas del menú.
- Regla de objetos: el menú se contrae con tooltip y etiquetas accesibles, y el
  estado se recuerda (`src/lib/objetosReglas.test.js`).

## Coordinación

- **PLT (shell):** el menú vive dentro de Configuración; el resto del shell no
  cambia. Si PLT mueve la estructura de Configuración, el contrato es: toggle con
  `aria-expanded/aria-controls`, pestañas con `aria-label`/`title` y persistencia
  en `mobos:config-nav`.
- **CMP (biblioteca):** junto con la estructura de los 7 grupos (#253), este
  menú colapsable/horizontal es candidato a publicarse en `owncoding-ui` como
  objeto de navegación de configuración.
