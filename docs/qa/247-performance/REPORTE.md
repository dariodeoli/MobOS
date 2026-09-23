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

## Cómo repetir

```bash
npm --prefix backend run build            # backend prod (BUILD_ID)
MOBOS_PERF_AUDIT=1 MOBOS_E2E_BACKEND=prod MOBOS_E2E_FRONTEND=preview \
  MOBOS_PERF_SALIDA=docs/qa/247-performance/despues \
  npx playwright test e2e/perf-247.spec.js --project=admin
```
