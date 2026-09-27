# #281 · Contenedores de la venta con identidad de color

Cada bloque de la pantalla de venta tiene ahora una identidad de color suave y
consistente entre temas: tinte de fondo + borde + título, todo con tokens
existentes. Sin cambios de lógica, datos ni estructura (solo color y los
`data-testid` de medición).

| Bloque | Token | Tinte / borde / título |
| --- | --- | --- |
| **Cliente** | `info` | `border-info/35 bg-info/[.04]` · título `text-info` |
| **Productos** (buscador y resultados) | `fono` (marca) | `border-fono/35 bg-fono/[.04]` · título `text-fono-light` |
| **Productos de esta venta** (carrito) | `ok` | `border-ok/35 bg-ok/[.04]` · encabezado `border-ok/20 bg-ok/[.06]` · título `text-ok` |
| **Pagos de esta venta** | `reserved` | `border-reserved/35 bg-reserved/[.04]` · título `text-reserved` |
| **Tiles** | `info` / `ok` / `warn` | Total `border-info/35 bg-info/[.06] text-info` · Pagado `border-ok/35 bg-ok/[.08] text-ok` · Pendiente `border-warn/35 bg-warn/[.08] text-warn` |
| **Barra compacta** (`carrito-barra`) | `fono` | gradiente de marca existente (sin cambios) |

## Capturas antes/después

En `docs/qa/281-contenedores/` con el sufijo `-antes` / `-despues`, en tres temas
por bloque (desktop 1440×900 y mobile 390×844; la barra compacta solo en mobile):

- **claro** y **oscuro** nativos (`mobos:theme`).
- **alto contraste**: emulación de `forced-colors: active` del sistema
  (Chromium); el SO reemplaza la paleta y se verifica que la pantalla siga
  legible y estructurada.

La captura full page neutraliza `position: sticky` del resumen fijo y de la
barra compacta solo para la foto (el comportamiento real no cambia).

## Medición AA

`resultados-antes.json` / `resultados-despues.json` miden cada bloque con el
auditor compartido (`e2e/helpers/contraste.js`, compone alfas sobre el fondo
real, exige 4.5:1 y 3:1 en texto grande):

| Tema | Antes | Después |
| --- | --- | --- |
| claro | 0 bajos (73 textos) | **0 bajos** |
| oscuro | 0 bajos | **0 bajos** |
| alto contraste | 0 bajos | **0 bajos** |

Los JSON guardan además el fondo/borde computado de cada bloque, para auditar el
tinte más allá de la captura.

Reproducir:

```bash
npx vite --port 5216 --strictPort &
QA_BASE_URL=http://localhost:5216 QA_ETIQUETA=despues \
  QA_OUT=docs/qa/281-contenedores node scripts/qa-281-contenedores.mjs
```

## Propuesta de token (falta en la app)

La biblioteca define la familia de **texto AA** para los tintes suaves
(`--c-ok-text`, `--c-warn-text`, `--c-bad-text`, `--c-info-text`, `--c-fono-text`,
`--c-pass-text` en `owncoding-ui/dist/styles.css`) y sus objetos la usan (p. ej.
`Aviso` con `text-warn-text`), pero `tailwind.config.js` **pisa** los colores
`ok/bad/warn/info` como un único valor y no expone la subclave `.text`, así que
esas clases no se generan en MobOS. Se usan los tonos base que la app ya emplea
para texto (`text-ok`, `text-warn`, `text-info`, `text-reserved`,
`text-fono-light`), medidos AA en esta corrida.

**Propuesta (DSN/CMP)**: exponer la subclave `.text` en
`tailwind.config.js` (`ok: { DEFAULT: 'rgb(var(--c-ok)…)', text: 'rgb(var(--c-ok-text)…' } }`,
ídem `warn/bad/info/fono`) para que los objetos de la biblioteca y las pantallas
tengan el par de texto AA oficial. No se toca acá por ser configuración
compartida de todos los dominios.
