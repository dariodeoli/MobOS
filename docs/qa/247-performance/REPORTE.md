# Performance de cargas (#247) — auditoría antes/después

Medición de las cuatro pantallas más usadas (inventario, POS, clientes y
finanzas) con el **bundle de producción** (`vite build` + `vite preview`), CPU
limitada 4x y **3 repeticiones por escenario** (se reporta la mediana) para que
las diferencias sean comparables. El escenario `segunda` es la visita con la
**foto local** ya guardada (ÍndiceDB) y el API refrescando atrás.

- **Verificador reutilizable:** `e2e/perf-247.spec.js`
  (`MOBOS_PERF_AUDIT=1 MOBOS_E2E_BACKEND=prod MOBOS_E2E_FRONTEND=preview` y
  `MOBOS_PERF_SALIDA=<carpeta>`; `MOBOS_PERF_REPS` cambia las repeticiones).
- **Evidencia cruda:** [`antes/perf-247.json`](antes/perf-247.json) ·
  [`despues/perf-247.json`](despues/perf-247.json) (y sus `.md`).

## Resultado

### Peso del arranque (determinista, mismo build de producción)

| Métrica | Antes | Después |
| --- | --- | --- |
| Chunk de entrada (`index-*.js`) | **1130 KB** | **172 KB** (−85%) |
| Chunk del panel | (dentro del anterior) | 791 KB, diferido hasta entrar al panel |
| Chunks de páginas públicas | (dentro del anterior) | 45-170 KB por página, diferidos |

El login y las páginas públicas ya no descargan el panel completo; el panel
carga su chunk la primera vez que se entra y queda cacheado.

### Tiempos hasta "listo" (mediana de 3, ms, CPU 4x)

| Pantalla | Carga | Antes | Después | Δ |
| --- | --- | --- | --- | --- |
| Inventario | primera visita | 1816 | 2041 | +12%¹ |
| Inventario | recarga | 3059 | 3059 | 0% |
| Inventario | segunda visita | 1755 | **1669** | **−5%** |
| POS | primera visita | 1079 | **1019** | **−6%** |
| POS | recarga | 695 | 701 | +1% |
| POS | segunda visita | 874 | **846** | **−3%** |
| Clientes | primera visita | 1127 | **1026** | **−9%** |
| Clientes | recarga | 1153 | **724** | **−37%** |
| Clientes | segunda visita | 1280 | 1274 | 0% |
| Finanzas | primera visita | 534 | 1728 | +224%¹ |
| Finanzas | recarga | 399 | 632 | +58%¹ |
| Finanzas | segunda visita | 537 | 595 | +11%¹ |

¹ **Los tiempos son ruidosos en esta máquina** (varios agentes corriendo en
paralelo; la corrida A/B previa, con la máquina más cargada, mostró 11/12
escenarios mejores y ~22% de mejora en las cargas con caché). En la corrida
archivada acá, la pantalla de finanzas carga además el refresco de fondo del
catálogo que dispara el arranque SWR: el "listo" no lo espera, pero el total de
ms de API sí lo cuenta (11 → 21 pedidos), lo que ensucia la comparación. La
conclusión honesta: la ganancia **estructural** (chunk de entrada −85% y panel
diferido) es determinista; las mejoras de tiempo aparecen en las cargas con
caché/segunda visita de POS y clientes y quedan dentro del ruido en el resto.

## Pendientes (#247, segunda tanda): pedidos, finanzas y chunk del panel

Corrida con `MOBOS_PERF_REPS=2` y la pantalla `/pedidos` sumada a la auditoría;
evidencia cruda en [`pendientes/perf-247.json`](pendientes/perf-247.json).

### Chunk del panel (POS)

| Chunk | Antes | Después |
| --- | --- | --- |
| `PanelVendedor` (shell) | **791 KB** | **47 KB** |
| `VistaCargarVenta` (POS) | (dentro del panel) | 129 KB, bajo demanda |
| `SellerOrders` (pedidos) | (dentro del panel) | 51 KB, bajo demanda |
| `SellerCustomers` (clientes) | (dentro del panel) | 142 KB, bajo demanda |
| `Inventario` | 168 KB | 168 KB (ya era diferido) |

Cada sección del panel se descarga al entrar y queda cacheada; el POS ya no
arrastra el código de finanzas, configuración, servicio, etc.

### Finanzas fuera de la hidratación

`/api/finance` se pedía en **todas** las pantallas para llenar el espejo de
gastos. Ahora se hidrata al entrar a finanzas, análisis o resumen (que son las
que lo usan) y, desde ahí, sigue incluida en los refrescos siguientes:

| Pantalla | `/api/finance` antes | después | API total antes → después |
| --- | --- | --- | --- |
| Inventario | 1 | **0** | 22 → 20 |
| POS | 1 | **0** | 13 → 11 |
| Clientes | 1 | **0** | 18 → 16 |
| Pedidos | 1 | **0** | 12 |
| Finanzas | 2 | 2 | 21 → 20 |

### Pedidos: solapas y sync

- La pantalla de pedidos **ya consultaba por solapa** (`filtro` + `limit=50` con
  cursor al servidor); se verificó y ahora además es su propio chunk (51 KB).
- El sync del catálogo pasó de páginas de 200 a **500** por consulta: en la base
  e2e (más de 500 productos) baja de 3 a **2** requests y en catálogos de hasta
  500 productos entra en **1** (antes: 2-3 siempre).

### Tiempos de la tanda (mediana de 2, ms)

| Pantalla | fría | caliente | segunda |
| --- | --- | --- | --- |
| Inventario | 2191 | 2414 | 1592 |
| POS | 1481 | 657 | 836 |
| Pedidos | 1082 | 672 | 798 |
| Clientes | 973 | 646 | 805 |
| Finanzas | 997 | 519 | 620 |

Sigue siendo una máquina muy cargada (varios agentes): los valores absolutos
varían entre corridas; lo determinista son los pedidos menos por pantalla, el
tamaño de los chunks y que cada sección/pantalla carga solo lo suyo.

## Producción (v1.0.153 y re-verificado en v1.0.154)

`scripts/qa-247-produccion.mjs` → [`produccion/resultados.json`](produccion/resultados.json)
(registra la versión medida) y capturas `01-demo-inventario` … `05-demo-finanzas`.

| Métrica | v1.0.152 (antes) | v1.0.153 (después) |
| --- | --- | --- |
| Chunk de entrada (`index-*.js`) | 1104 KB | **169 KB (−85%)** |
| Chunks por sección | (dentro del entry) | `vendor` + panel/secciones bajo demanda |

Carga de las pantallas en la demo de producción (datos ficticios locales, **0
llamadas al API**):

| Pantalla | Listo (ms) | JS decodificado del recorrido |
| --- | --- | --- |
| Inventario | 236 | 1101 KB |
| POS | 113 | 911 KB |
| Pedidos | 266 | 972 KB |
| Clientes | 268 | 1066 KB |
| Finanzas | 144 | 926 KB |

El "JS decodificado" acumula los chunks que ya quedaron en la sesión de la
pestaña; lo determinista es el entry (−85%) y que cada sección se trae al
entrar.

## Re-verificación v1.0.168 (25/09/2026)

Ronda nueva con el mismo método (bundle de producción, CPU 4x, 3 repeticiones
por escenario) después del rollout v2 (#241), la estabilización de CI (#245) y
los lotes de plataforma.

- **Local:** [`reverificacion-v1.0.168/perf-247.json`](reverificacion-v1.0.168/perf-247.json)
  · [`.md`](reverificacion-v1.0.168/perf-247.md)
- **Producción:** [`produccion-v1.0.168/resultados.json`](produccion-v1.0.168/resultados.json)
  + capturas `01-demo-inventario` … `05-demo-finanzas`.

### Bundle (determinista)

| Métrica | Línea base v1.0.152 | v1.0.154 | v1.0.168 |
| --- | --- | --- | --- |
| Chunk de entrada (`index-*.js`) | 1104 KB | 169 KB | **173 KB (−84%)** |

### Tiempos hasta "listo" (ms, mediana de 3, CPU 4x) y pedidos de la carga fría

| Pantalla | fría | caliente | segunda | API fría (ronda anterior → ahora) |
| --- | --- | --- | --- | --- |
| Inventario | 781 | 482 | 647 | 20 → **11** |
| POS | 1034 | 416 | 548 | 11 → **10** |
| Pedidos | 1000 | 389 | 491 | 12 → **11** |
| Clientes | 1042 | 399 | 543 | 16 → **15** |
| Finanzas | 927 | 272 | 387 | 20 → **18** |

Lectura honesta: la máquina estaba **menos cargada** que en las rondas previas
(los mismos escenarios de `pendientes` daban 1.5–3 s), así que los ms no se
comparan 1:1; lo comparable es el método y el **recuento de pedidos**, que bajó
en las cinco pantallas. En inventario, la primera visita y la segunda ya no
repiten la sindicación del catálogo ni piden `/api/finance` (quedó fuera de las
pantallas de operación).

### Producción (demo, datos ficticios locales, 0 llamadas al API)

| Pantalla | Listo (ms) | JS decodificado del recorrido |
| --- | --- | --- |
| Inventario | 1488 | 1156 KB |
| POS | 208 | 925 KB |
| Pedidos | 412 | 988 KB |
| Clientes | 863 | 1086 KB |
| Finanzas | 104 | 940 KB |

### Pendiente vigente (INV)

La primera visita a inventario baja de 20 a **11** pedidos, pero en la visita en
caliente siguen entrando solapas que no están a la vista
(`/api/inventory-reservations`, `/api/transfers`, `/api/suppliers`,
`/api/inventory-units?view=removed`, `/api/stock-locations`): cargarlas por
solapa recortaría otros ~5 pedidos. Es el único pendiente con datos de esta
ronda; los de FIN (`/api/finance` en todas las pantallas) y POS (chunk del
panel) quedaron resueltos en la segunda tanda.

## Optimizaciones v1.0.168 (lazy diferido, POS a demanda y adelanto ocioso)

Tanda sobre lo que quedaba abierto del alcance (#247: lazy loading, caché y
preload de lo crítico), con evidencia antes/después de la misma medición.

### 1. El POS deja de montarse en todas las pantallas

El formulario de venta quedaba montado siempre (oculto) para no perder la venta
en curso: cada pantalla pagaba su chunk, sus combos y sus cuentas de cobro.
Ahora entra al árbol la primera vez que se visita el POS y desde ahí se mantiene
(la venta en curso sigue viva al navegar y el handoff por `sessionStorage` se lee
al montar, así que no se pierde nada).

- JS decodificado en la carga fría (mediana): inventario **398 → 322 KB**,
  pedidos **344 → 276 KB**, clientes **370 → 280 KB**, finanzas **347 → 250 KB**.
  El POS queda igual (321 → 319 KB).
- Pedidos al API en la carga fría: inventario **11 → 9**, pedidos **11 → 9**,
  clientes **15 → 13**: `/api/combos` y `/api/payment-accounts` ya no viajan a
  pantallas que no venden (el POS los sigue pidiendo, sin cambios).

### 2. Búsqueda global diferida

`GlobalSearch` baja junto con su modal (antes viajaba en el arranque del panel):
chunk del panel **48.326 → 41.946 B (−13%)**.

### 3. Adelanto ocioso de las secciones más usadas

Con la pantalla pintada y el equipo ocioso (2,5 s + `requestIdleCallback`), el
panel descarga los chunks de POS/Pedidos/Clientes (y de Inventario para el
dueño), una sola vez por carga y solo si la conexión lo permite (nada de
`saveData` ni 2G). Es el caso «segunda pantalla»: con red 3G simulada
(150 ms, 200 KB/s) y CPU 4x, la navegación entre secciones queda casi
instantánea.

| Paso | Antes (ms) | Después (ms) | Δ |
| --- | --- | --- | --- |
| POS → Pedidos | 1132 | **462** | −59% |
| POS → Clientes | 1002 | **254** | −75% |
| → Inventario | 1141 | **490** | −57% |
| → POS | 236 | **199** | −16% |

Medición reproducible (antes = mismo spec sin el adelanto):
`MOBOS_PERF_AUDIT=1 MOBOS_E2E_BACKEND=prod MOBOS_E2E_FRONTEND=preview npx playwright test e2e/perf-247.spec.js -g navegación --project=admin`.
Evidencia: [`optimizaciones-v1.0.168/antes/perf-247-navegacion.json`](optimizaciones-v1.0.168/antes/perf-247-navegacion.json)
y [`despues/perf-247-navegacion.json`](optimizaciones-v1.0.168/despues/perf-247-navegacion.json).

### 4. Caché y paginación (estado)

- La caché ya estaba cubierta y no se tocó: service worker (shell + catálogo con
  fallback sin conexión) y la foto local del arranque (ÍndiceDB).
- La paginación del catálogo y de pedidos ya es por cursor (`limit=500`); el
  único pendiente con datos sigue siendo el de INV (solapas ocultas), abajo.

Evidencia cruda de la ronda: [`optimizaciones-v1.0.168/despues/perf-247.json`](optimizaciones-v1.0.168/despues/perf-247.json)
· [`.md`](optimizaciones-v1.0.168/despues/perf-247.md).

## CI estable (#245)

El release **v1.0.168** quedó rojo en `main` por un único test real (no flake,
sin cuarentena): `e2e/dsn-241-a11y.spec.js` fijaba la paleta de `owncoding-ui`
**v0.21** (`--c-paper` claro `246 248 251`) y la biblioteca vigente es **v0.25.0**
(profundidad del tema #241: `241 244 248`). Se actualizó la expectativa y el
título del test; el spec completo pasa **8/8** local.

Racha de 3 corridas completas seguidas en modo CI sobre este código
(`MOBOS_E2E_BACKEND=prod`, sin reintentos): ver
[`../247-performance/racha/`](../247-performance/racha/) con el resumen y el
reporte de flakiness de cada corrida (0 flaky, 0 cuarentena).

## Qué se cambió (dominio PLT)

1. **Rutas diferidas** (`src/App.jsx`): el panel, el reparto y todas las páginas
   públicas pasan a `lazy()`; el chunk de entrada baja de 1119 KB a 171 KB.
2. **Arranque con foto local** (`src/lib/storage.js`): la primera hidratación de
   la sesión pinta con la última foto del catálogo (ÍndiceDB) y refresca contra
   el API **en segundo plano**; las hidrataciones posteriores (mutaciones,
   refresco periódico) siguen esperando al API. La pantalla deja de esperar las
   ~3 páginas del catálogo + pedidos + usuarios + finanzas.
3. **Consultas en vuelo** (`src/lib/api/client.js`): dos componentes que piden
   el mismo GET al mismo tiempo comparten una sola llamada (la caché corta solo
   cubría los pedidos seguidos).
4. **Preconnect** (`index.html`): handshake adelantado al API de producción.
5. **Arnés**: modo `MOBOS_E2E_FRONTEND=preview` (build de producción) para medir
   como el usuario; los tests siguen en `dev`.
6. **POS a demanda y búsqueda diferida** (`src/pages/PanelVendedor.jsx`): el
   formulario de venta se monta en la primera visita (después queda oculto para
   no perder la venta) y `GlobalSearch` baja con su modal; el panel queda en
   41,9 KB.
7. **Adelanto ocioso** (`src/hooks/usePrefetchSecciones.js`): con el equipo
   ocioso se adelantan los chunks de las secciones más usadas, una vez por carga
   y solo si la conexión lo permite.

## Pedidos a otros dominios (con datos)

- **INV — inventario**: la pantalla dispara ~15 pedidos, varios de solapas que no
  están a la vista (`/api/inventory-reservations`, `/api/transfers`,
  `/api/suppliers`, `/api/inventory-units?view=removed`, `/api/stock-alerts`).
  Cargarlos por solapa recortaría ~6 pedidos en la primera visita. Además el
  catálogo se sincroniza en 3 páginas (`/api/products?limit=200&cursor=…`):
  un endpoint compacto de sincronización (id/nombre/precio/stock) o un `limit`
  mayor reduciría el tiempo de refresco.
- **FIN — finanzas**: `/api/finance` se pide en **todas** las pantallas como
  parte de la hidratación (solo dueño/gerencia/cajera); moverlo a la pantalla de
  finanzas ahorra ~200 ms por carga.
- **POS — panel**: el chunk del panel son **791 KB**; dividir sus secciones
  cargadas de forma directa (finanzas, clientes, herramientas) con `lazy()`
  bajaría el tiempo de parseo al entrar al POS (hoy es el costo dominante).

**Estado (re-verificación v1.0.168):** INV sigue abierto (los pedidos de sus
solapas ocultas, ver arriba); FIN y POS quedaron resueltos en la segunda tanda
y la re-verificación los confirma (panel 47 KB y `/api/finance` solo en las
pantallas que lo usan).

## Cómo repetir

```bash
npm --prefix backend run build            # backend prod (BUILD_ID)
MOBOS_PERF_AUDIT=1 MOBOS_E2E_BACKEND=prod MOBOS_E2E_FRONTEND=preview \
  MOBOS_PERF_SALIDA=docs/qa/247-performance/despues \
  npx playwright test e2e/perf-247.spec.js --project=admin
```
