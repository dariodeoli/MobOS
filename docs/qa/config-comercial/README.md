# Configuración · Grupo Comercial (#253)

- **Rama:** `slot/finanzas` · **Fecha:** 2026-09-25 · **Resultado:** el grupo
  **Comercial** vive en su propio archivo (`src/components/control/config/Comercial.jsx`)
  y reúne listas de precios, precios por cantidad, seguro de ventas, límites y
  autorizaciones, fidelización y mora.

## El pedido (#253, reparto por dominio)

> **MOS-FIN**: grupo **Comercial** → listas de precios, precios por cantidad,
> seguro de ventas, límites y autorizaciones, fidelización y mora.

Regla del reparto: cada dominio trabaja en **archivos propios** de su sección
(evitar editar `Config.jsx` a la vez); los deep links siguen funcionando.

## Qué cambió

- **Archivo propio del grupo**: las tarjetas y su guardado se mudaron de
  `Config.jsx` a `control/config/Comercial.jsx` (mismo patrón de hidratación sin
  pisar lo editado y de reautenticación en el lugar). `Config` delega la sección
  y `PanelVendedor` ya no monta `Precios` aparte: los precios son parte del grupo.
- **Cuatro bloques con jerarquía**: `Seguro de ventas` · `Límites y
  autorizaciones` · `Fidelización y mora` · `Listas de precios` + `Precios por
  cantidad`.
- **Cruce con la bandeja de autorizaciones**: el bloque de límites explica y
  enlaza `Operación → Autorizaciones`, donde se piden y aprueban las operaciones
  fuera de política.
- **Sin cambios de contrato**: ids (`#seguro-toggle`, `#seguro-pct`,
  `#limite-gasto`, `#limite-compra`, `#limite-bajo-lista`,
  `#limite-fidelizacion`, `#limite-mora`), testids (`seguro-estado`,
  `limites-estado`, paneles `*-reauth`) y guardado con Enter intactos.
- **Deep links intactos**: `/configuracion/precios` cae en Comercial; los slugs
  viejos siguen redirigiendo a su sección.
- **Demo**: mismo aviso de simulación y mismos valores locales.

## Evidencia

| Qué | Dónde |
| --- | --- |
| Antes (producción v1.0.172, demo): “Seguro y límites” en una sola tarjeta y Precios aparte | `antes/comercial-antes-desktop.png`, `antes/comercial-antes-mobile.png` (`scripts/qa-253-comercial-antes.mjs`) |
| Después: grupo Comercial con los cuatro bloques y los precios adentro | `config-comercial-despues.png`, `config-comercial-despues-mobile.png` (`e2e/config-comercial.spec.js`) |

- e2e `config-comercial.spec.js`: los cuatro bloques + precios por cantidad
  visibles, ids presentes, enlace a `/autorizaciones`, hidratación de la cuenta,
  deep link `/configuracion/precios` → Comercial y mobile sin desborde.
- Guardado real sin regresiones: `config-seguro-limites.spec.js` (Enter, estado
  Guardado/Error, persistencia tras recargar, reautenticación en el lugar).

## Verificación

- Suite enfocada (`config-comercial`, `config-seguro-limites`, `precios-listas`,
  `ia-configuracion`, `configuracion-lote5`, `menu-ia`, `config-guardado`,
  `admin`, `demo-anonimo`, `demo-finanzas*`): **88/88 verde** (5.0m).
- `npm test` (**751/751**), `npm --prefix backend run test:unit` (**75/75**),
  `lint` 0 errores, builds FE/BE con `BUILD_ID` y `prisma:validate` en verde.

## Coordinación

- **DSN/PLT**: el grupo queda listo para la estructura visual de los 7 grupos
  (#253); el archivo propio evita conflictos con los otros dominios.
- **POS (#251)**: la navegación de Precios dentro de Inventario no se toca; el
  deep link `/precios` sigue abriendo la pantalla propia.
- **PRN/PLT**: `Dispositivos`/`Sistema` no se tocan en esta entrega.
