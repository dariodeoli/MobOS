# Config → Logos · un logo por modo (UX)

Antes/después del bloque **Logo de la empresa** (Configuración → Negocio).

## Antes (`antes/`)

- Dos previews por modo («Fondo claro» + «Fondo oscuro») con el mismo logo
  repetido: ruido y ambigüedad sobre dónde se usa cada variante.
- El «Fondo oscuro» usaba `bg-ink-950`, que en el **tema claro** es casi blanco:
  el preview no era fiel.
- La subida iba directo a `comprimirImagen` (sin paso de confirmación).

## Después (`despues/`)

- **Un logo por modo**, con el preview **sobre el fondo real**:
  - Modo claro → logo oscuro, preview sobre blanco.
  - Modo oscuro → logo claro, preview sobre la consola oscura (scope `.consola`).
- Acciones **Subir / Reemplazar / Quitar**.
- **Confirmación** con vista previa fiel antes de subir
  (`confirmacion-*.png`; modal «Confirmar logo» → «Usar este logo»).

## Cómo se capturaron

Con el harness e2e (`admin.spec.js`, test temporal retirado tras la captura):
`MOBOS_CAPTURA=antes|despues npx playwright test e2e/admin.spec.js --grep "captura de la tarjeta"`.
La cobertura permanente del flujo quedó en
`e2e/admin.spec.js › configuración → sube el logo de la empresa y lo quita`
(un preview por modo + confirmación + quitar).
