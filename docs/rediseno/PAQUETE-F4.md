# Paquete de aprobación F4 (#241) — actualizado 2026-09-26

> Para **activar y verificar** el rollout, el checklist por pantalla, el orden y
> las capturas finales están en [`ACTIVACION-F4.md`](ACTIVACION-F4.md).

**✅ Aprobado y activado por Dario el 26/09/2026** (v1.0.178): el v2 es el
diseño por defecto y el toggle para volver al anterior se mantiene un tiempo.

## Switch de activación (listo para Dario)

El rollout v2 se prende o apaga desde el **entorno de build** del front, sin
tocar código:

| `VITE_TEMA_V2` | Efecto |
|---|---|
| sin definir o `1` | **F4 activo** (estado actual): el v2 es el diseño por defecto |
| `0` | F4 apagado: se ve el diseño anterior; el v2 queda como prueba por dispositivo |

- Se cambia en las variables de entorno del front en **Coolify** y se redeploya
  (Vite inyecta el valor en el build).
- El **dispositivo siempre manda**: `localStorage['mobos:tema-v2'] = '0'`
  vuelve al diseño anterior y `'1'` regresa al v2; el selector visible está en
  **Configuración → Mi cuenta → Preferencias del dispositivo** («Volver al diseño anterior»).
- Verificación después de activar (o de apagar):
  1. `node scripts/qa-241-shell-produccion.mjs` → AA del shell en producción
     (sale con código 1 si baja de AA).
  2. `npm run test:e2e:smoke` y el gate responsive
     (`e2e/dsn-responsive-mobile.spec.js`).
  3. `npm test` cubre el switch y la precedencia del dispositivo
     (`src/lib/temaV2.test.js`).
- **Rollback**: `VITE_TEMA_V2=0` + redeploy, o por dispositivo con el selector
  de Preferencias.

**Rollout aprobado.** El rediseño v2 ("device ops") es el **diseño por defecto**
desde el 24-09: el paso 2 activó el **shell** (barra lateral + superior, estados
de navegación y densidad) con los tokens v2, con QA antes/después en claro,
oscuro y mobile. El paso 3 activó el **tablero operativo** (`/ops`), que ahora
se abre sin flag y suma los patrones del mock.

## Cómo volver al diseño anterior (opt-out por dispositivo)

En la consola del navegador: `localStorage.setItem('mobos:tema-v2','0')` y
recargar. Para volver al v2: `localStorage.removeItem('mobos:tema-v2')`.
El par de capturas `c241f4b-shell-optout-antes-claro-desktop.png` (anterior) y
`c241f4b-shell-default-despues-claro-desktop.png` (v2) documenta la activación.

## Qué cambia por dominio (con capturas claro/oscuro × 390/1280)

Cada dominio tiene sus capturas **con la vista previa prendida** y una muestra
**con el flag apagado** (el default de hoy, sin cambios). Todas viven en esta
carpeta (`docs/rediseno/`).

| Dominio | Qué se ve distinto | Capturas |
|---|---|---|
| **Shell** | Ítem activo en azul, rótulos de sección sólidos, foco visible por tema, sin restos del tema viejo | `c241f4-shell-aa-{claro,oscuro}-{desktop,mobile}`, `…-menu`, `…-inventario-oscuro`, y el par antes/después `c241f4-shell-aa-antes-*` |
| **Pedidos** | Chips en píldora, filtros azules, **resumen en tiles** (activos / por cobrar / en reparto) y **stepper del flujo de entrega** en el pedido | `c241f4b-pedidos-on-*`, `c241f4b-pedido-detalle-on-*` |
| **Clientes** | Chips y filtros del lenguaje nuevo, **resumen en tiles** (clientes / con deuda / por cobrar) y el resumen rápido | `c241f4b-clientes-on-*`, `c241f4b-clientes-resumen-on-*` |
| **Finanzas** | **Caja en tiles**, **Conciliación** con tiles y **"x de y"** (conciliado sobre el total), solapas azules | `c241f4b-finanzas-on-*`, `c241f4b-finanzas-conciliacion-on-*` |
| **Servicio y Garantías** | **Stepper del taller** (recepción → entrega) con la carga por etapa, importes grandes | `c241f4b-servicio-on-*`, `c241f4b-garantias-on-*` |
| **Resumen / Análisis** | **Tiles de KPI** y números grandes; el hero verde con los rótulos legibles | `c241f4b-resumen-on-*`, `c241f4b-analisis-reportes-on-*`, `c241f4b-analisis-ganancias-on-*` |
| **Inventario** | **Tiles de equipo** en la vista cuadrícula (IMEI, batería, ubicación, proveedor y costo) | `c241f4b-inventario-tiles-on-*` |
| **Compras** | **Resumen en tiles** y **"x de y"** de recepción con barra | `c241f4b-compras-on-*` |
| **Configuración** | **Tiles de rol/acceso** (x de y de permisos + dominios) y fichas del equipo | `c241f4b-equipo-on-*`, `c241f4b-roles-on-*` |
| **Públicas** | Página del pedido y landing con el lenguaje v2 | `c241f4b-pedido-publico-on-*`, `c241f4b-landing-on-*` |
| **Tablero operativo** | Pantalla completa activa: KPIs grandes, stepper del lote con la carga por etapa, tiles de equipo con **«x de y» del checklist** y **chips de locks** (desde la consulta IMEI guardada) | `c241f4b-ops-on-*` (+ `c241f4b-ops-off-claro-desktop.png`) |
| **Modo taller/rack** | Carriles por estación con **objetos de CMP** (tile de equipo, avance «N de M», acciones en serie) y **vista previa del rollo** en la impresión de etiquetas | `c241f4b-taller-on-*`, `c241f4b-taller-impresion-on-*` |

## Accesibilidad (medida, no estimada)

**Cerrada.** El cierre completo —local y producción, con capturas— está en
[`../QA-241-shell-aa.md`](../QA-241-shell-aa.md): 8/8 estados locales y
**0 bajos de AA** en producción (v1.0.181). Resumen de lo medido:

- Cada captura viene con **medición de contraste AA** en el navegador
  (`e2e/dsn-241-a11y.spec.js` + `e2e/dsn-241-dominios.spec.js`): 0 textos por
  debajo de AA en las pantallas y combos medidos, en claro y oscuro.
- Las mediciones dejaron 5 hallazgos del tema claro que quedaron corregidos en
  v2 (rótulos del hero verde, encabezados de tabla, verde vivo como texto, chip
  neutro en oscuro y tintes de chips): el detalle está en
  [`F4-DOMINIOS.md`](F4-DOMINIOS.md).
- Los fixes de **mobile (#249)** (áreas táctiles de 44 px, sin scroll
  horizontal) están en [`../QA-RESPONSIVE-MOBILE.md`](../QA-RESPONSIVE-MOBILE.md).

## Qué queda antes del rollout completo

- **Prints** (lote H): informe del dispositivo y etiquetas con el lenguaje v2.
- **Datos (#240)**: el tablero ya muestra el checklist y los locks de cada
  consulta IMEI guardada; el grado/locks de los tiles del inventario quedan para
  la próxima vuelta con el lote de INV.
- **Biblioteca (CMP)**: la app ya usa owncoding-ui **v0.30.0** (TileEquipo,
  BarraLote, ContadorLote, ConteoChecklist, VistaPreviaPapel, BuscadorDispositivo,
  PaletaComandos, EstadoGuardado…); quedan copias locales de `PasosEquipo` y
  `FichaCertificado` en `shared/` como adopción final pendiente.
- **Entrada al menú del tablero**: hoy se llega por `/ops`; la entrada en el
  panel es una decisión de producto/navegación (PLT).

## Qué se pide aprobar

1. ¿El rumbo por dominio (tiles, steppers, chips y números) es el definitivo?
2. ¿Prints y los datos de #240 entran en el mismo rollout o en una segunda
   vuelta?
3. ¿La densidad nueva del shell (barra superior de 64 px) queda como está?
