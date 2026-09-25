# Arnés E2E y CI (#CI)

Cómo queda el arnés de pruebas de punta a punta y el workflow de CI: **rápido**
(shards balanceados en paralelo), **determinista** (backend prod, datos con PIN
libre, sin ruido de abortos) y **sin reintentos**: si algo flapea, se aísla y se
corrige la raíz (#245). Los comandos del día a día siguen siendo los de siempre:
`npm run test:e2e:smoke` y `npm run test:e2e`.

## 1. Jobs de CI y duraciones

| Job | Qué corre | Actual | Timeout |
| --- | --- | --- | --- |
| Frontend (lint + build) | `npm run lint` · `npm test` · `npm run build` | ~1m35 | 15 min |
| Backend (typecheck + build) | `tsc --noEmit` · `test:unit` · `build` | ~1m40 | 12 min |
| Integration | `backend/tests/integration-http.sh` (Postgres efímero) | ~3m10 | 15 min |
| **E2E (3 shards)** | archivos de `e2e/sharding.json` sobre backend prod | **~103 tests por shard** | 20 min |

El job E2E corre en **matriz de 3 shards** (`fail-fast: false`): cada shard tiene
su propio runner, cluster de Postgres, backend y frontend, así que no comparten
estado. La distribución es **explícita y balanceada** (`e2e/sharding.json`,
generada con `node scripts/e2e-shards.mjs --generar`: 103/102/102 tests); la
heurística de Playwright dejaba 135/73/99.

### 1.1 Workflow paso a paso (job E2E)

Los tres shards corren la misma receta (timeout 20 min por job):

| Paso | Qué hace |
| --- | --- |
| `checkout` + `setup-node` | Node 22 con cache de npm de **ambos** lockfiles (raíz y backend). |
| PostgreSQL | instala el server y expone los binarios donde los busca el harness (`/opt/homebrew/bin`). |
| `npm ci` (raíz + backend) + `prisma generate` | dependencias y cliente Prisma. |
| Cache + instalación de Chromium | `~/.cache/ms-playwright` cacheado por lockfile; `--with-deps` deja las libs. |
| `npm --prefix backend run build` | build prod del backend: el harness lo arranca con `next start`. |
| `npx playwright test $(node scripts/e2e-shards.mjs --shard N)` | la suite del shard con `MOBOS_E2E_BACKEND=prod`, sin reintentos. |
| Upload de artifacts | `playwright-report/` + `test-results/reporte-flaky.{md,json}` por shard (14 días). |

Los otros jobs no cambiaron de forma: Frontend (lint + unit + build, 15 min),
Backend (typecheck + unit + build, 12 min) e Integration (harness HTTP con
Postgres efímero, 15 min). Los timeouts salen de medir las corridas reales y
dejan margen ~2-4x.

## 2. Backend del arnés: `dev` local, `prod` en CI

`e2e/bin/start-backend.sh` arranca el backend de dos maneras:

- **`dev` (default)**: `next dev`. Compila por ruta y por eso las requests que el
  navegador corta durante el compile ensucian el log y (bajo carga) hacían
  fallar specs por timeouts. Es el modo cómodo para trabajar local.
- **`prod` (CI, `MOBOS_E2E_BACKEND=prod`)**: `next start` sobre
  `npm --prefix backend run build`. Sin compilación por ruta, la suite es más
  rápida y estable. **Requiere `backend/.next/BUILD_ID`**: si falta, el harness
  corta con un mensaje claro (ojo: correr `next dev` borra ese archivo).

En modo prod sobre `http://localhost` el backend necesita dos permisos que en
producción real no aplican: `MOBOS_E2E_LOCAL_ORIGIN=1` (origen local confiable
para `sameOrigin`) y la cookie de sesión sin `Secure` (el navegador la descarta
en http). `start-backend.sh` la exporta solo en modo prod.

## 3. Ruido de abortos

**Qué era:** `⨯ uncaughtException: Error: aborted` (stack de Node
`abortIncoming`/`socketOnClose`, ECONNRESET) cada vez que el navegador cortaba
una request en vuelo (cierre de contexto de Playwright, navegación). Es un
problema conocido de Next (vercel/next.js#84649) y en `next dev` podía dejar el
servidor inestable.

**Qué se hizo:**
1. CI usa el backend prod (sin compile), que no emite ese ruido.
2. Aun así, el log del backend pasa por `scripts/filtro-log-web.mjs`, que
   reemplaza el bloque por una línea-resumen y deja pasar el resto intacto
   (incluido un `Error: aborted` con stack propio de la app). Tiene test en
   `src/lib/filtroLogWeb.test.js`.

## 4. Sin reintentos: un flake se corrige en la raíz

La suite corre con **`retries: 0` en local y CI** (no hay cuarentena ni retries
por spec: lo prohíbe la guarda de `src/lib/ciHarness.test.js`).

- Cuando algo flapea, se **aísla** (spec solo, con el shard/orden en el que
  apareció) y se corrige la causa: datos con PIN libre, clicks que se pierden en
  re-renders, listados paginados, guías que montan tarde, etc. Ver §5.
- `e2e/reporters/flaky.mjs` deja `test-results/reporte-flaky.md|json` con lo que
  falló (o necesitó más de un intento) y emite anotaciones en GitHub; el
  workflow sube un artifact por shard. Es la herramienta para investigar, no
  para tapar.
- Los specs de la cuarentena anterior (`documentos-no-fiscales`,
  `etiquetas-unidad`, `finanzas-conciliacion`, `inventario-unidades`,
  `pos-qa-173`, `vendidos-comprobante-rapido`) corren sin retry desde #245.

## 5. Datos deterministas en specs

- **PINs de integrantes:** el PIN es único entre los usuarios *activos* de la
  empresa; con 4 dígitos al azar chocaba con usuarios de corridas previas (409
  `PIN_DUPLICADO`) y el spec quedaba rojo de forma intermitente.
  `e2e/helpers/integrantes.mjs` genera PINs de 6 dígitos y reintenta con otro si
  el backend responde duplicado; `agregarIntegranteDirecto` hace lo mismo desde
  la UI.
- Cada spec crea y limpia sus propios datos (`limpiar`/`limpiarSeriales`) y no
  depende del orden. Los worktrees aíslan base y puertos (`MOBOS_E2E_*`).
- **Cuotas de un plan de crédito:** la cronología de pagos no garantiza el orden
  de las cuotas (el backend no las ordena), así que `cobro-cuotas` cobra **por
  referencia** (`Cuota n/3`) y verifica la cuota en el formulario antes de
  confirmar; el recordatorio se espera con `expect.poll` en vez de asumir que
  desaparece en el mismo instante. (Antes usaba `.first()` y podía cobrar la
  3/3 dejando la 1/3 pendiente y reclamada.)
- **Listados paginados:** `GET /api/products` devuelve hasta 200 ordenado por
  nombre; con el catálogo e2e de cientos de productos, un spec que buscaba su
  fila con `.find()` podía no verla (falló `public-quote-transfer`). Los specs
  buscan por `?q=<sku>` (único) y esperan el efecto con `expect.poll`.
- **Botones que se re-renderizan:** las acciones que abren modales o disparan
  impresión viven en paneles que se re-renderizan y el click podía caer en el
  medio sin efecto: «Vender todos» (~1/3 en local), el modal de recepción y la
  reimpresión de etiqueta (`etiquetas-unidad`, modal abierto, sin aviso y sin
  trabajo en el agente). Los specs reintentan el click con `toPass` y esperan el
  **efecto real** (navegación, aviso o trabajo capturado por el agente falso),
  no solo que el click no tire error.
- **Combobox de cuentas del POS (#241 paso 5):** la opción se elige abriendo el
  combobox propio y esperando su lista (`aria-controls`), filtrando por nombre y
  con `toPass` hasta ver el efecto (el campo queda con la cuenta o aparece la
  cotización). El `.first()` global podía caer en la lista de otra fila o en una
  cerrada (roja .160: la cuenta USD no existía todavía al hidratar el POS).
- **Chips «Pagado / No pagado» del cobro (#241 paso 5):** el toggle se reintenta
  **sin volver a togglear** (`if (await chip.count()) click`) hasta ver el
  efecto: el chip cambia de estado y el botón principal pasa a «Confirmar venta»
  (con el cobro parcial dice «Crear pedido»). Un clic perdido bajo carga dejaba
  la venta parcial y el spec buscaba un botón inexistente (roja .161; el mismo
  criterio en el armado del cobro y en la vuelta a «No pagado»).
- **Ficha de la unidad desde la fila (mobile, #249):** el táctil se abre tocando
  el ícono de categoría (blanco fijo dentro de la primera columna; el clic
  burbujea al `onClick` de la fila) y se esperan el diálogo y el checklist; la
  selección va por la etiqueta de la casilla (44 px) y se exige que el nombre
  del modelo no colapse (roja .160: el `b` de la fila quedaba no visible).
- **Fixtures con fecha fija:** un test que compara contra un "ahora" congelado
  (`AHORA`) mientras el productor arma las fechas con el ahora real **envejece**
  y falla horas después (caso `portalAvisos.test.js`, release .156: el aviso
  "pago por vencer" dejó de corresponder). Se evalúa con el ahora del productor.
- **Día paraguayo:** el navegador del harness corre con
  `timezoneId: 'America/Asuncion'`. Sin eso, de noche el reloj del navegador
  (UTC) cruzaba el día comercial y specs de "hoy" fallaban (noche del 23/09);
  la guarda de `src/lib/ciHarness.test.js` lo exige.
- **Puentes de impresión:** `global-setup` revoca todos los puentes activos de
  la empresa sembrada antes de correr. Los specs de impresión crean puentes y no
  todos los revocan: el tope de 20 activos hacía fallar la creación con **429**
  en la corrida siguiente (#245).
- **Unit tests del print-agent (dominio PRN):** el flake de
  `la cola lista, reintenta fallidos...` quedó resuelto en v1.0.146 con el tick
  de seguridad de la cola del agente (`fix(impresion): tick de seguridad…`);
  era el presupuesto de ~60 s al límite con la impresora caída.

## 6. Comandos útiles

```bash
# Gate rápido durante el trabajo (~20 s)
npm run test:e2e:smoke

# Suite completa local (dev)
npm run test:e2e

# Igual que CI: backend prod + un shard (distribución versionada)
npm --prefix backend run build
MOBOS_E2E_BACKEND=prod npx playwright test $(node scripts/e2e-shards.mjs --shard 1)

# Recalcular la distribución si cambian los specs (y validarla)
node scripts/e2e-shards.mjs --generar
node scripts/e2e-shards.mjs --check
```

## Validación

- **#245 (sin cuarentena):** 3 rondas × 3 shards en verde con la distribución
  balanceada (103/102/102) y `retries: 0`; los dos flaky históricos
  (`inventario-unidades › el motivo de baja…` y `etiquetas-unidad › al llegar a
  otra sucursal…`) quedaron corregidos en la raíz (clicks que se perdían en
  re-renders) y corren sin retry.
- **Rediseño previo (sobre v1.0.146):** 3 rondas consecutivas × 3 shards en
  verde (9/9) — 279-280 passed por ronda, **0 ruido** de abortos en los logs del
  backend.
- **Noche del 23/09 (3 rojas en main):** las causas raíz quedaron cerradas
  (tiempo paraguayo en el navegador, lectura estabilizada de Análisis, toast de
  la demo y conciliación por contenido). Los specs afectados
  (`analisis.spec.js`, `demo-finanzas*.spec.js`) corren **5/5 vueltas en verde**
  aislados y sin reintentos.
- **Release .156 (roja unitaria):** `portalAvisos.test.js` usaba un "ahora" fijo
  que envejecía; corregido en `8d106814` (con el ahora real) y verificado local
  (6/6). La racha se sigue desde ahí.
- **Producción #247 (v1.0.153):** entry **1104 KB → 169 KB**; pantallas de la
  demo (sin API) en 113-268 ms. Ver
  [`docs/qa/247-performance/produccion/`](../qa/247-performance/produccion/).

## 8. Racha de CI

El objetivo es **3 corridas consecutivas verdes** en `main`. Para mirar la racha:

```bash
node scripts/qa-ci-racha.mjs            # sale 0 cuando hay 3 verdes completas
gh run list --repo dariodeoli/MobOS --branch main --limit 5
```

Cuentan las corridas **completas**: las canceladas (superseded por un push
nuevo) no cortan ni suman. Si una corrida queda roja: se lee el job que falló,
se reproduce aislado (con el shard de `e2e/sharding.json` si es e2e), se corrige
la raíz y se vuelve a empezar la cuenta. No hay reintentos ni lista de
excepciones.

### Paquete de cierre de #245

Causas raíz corregidas en `main` (sin cuarentena ni reintentos). Cuando
`qa-ci-racha.mjs` marque 3 o más, el cierre cita esta tabla y las corridas de la
racha:

| Rojo | Causa raíz | Fix |
| --- | --- | --- |
| E2E de la noche 23/09 (`analisis`, `demo-finanzas*`) | lectura inestable de Análisis, toast perdido en un re-render, conciliación frágil y reloj del navegador en UTC contra el día paraguayo | `6725e032` · `90072e6b` · `11c44b8b` |
| .155 Backend (typecheck) | `supply.test.ts` no cubría el `null` de `compararModelo()` | `d4ccd478` |
| .156 Frontend (unit) | `portalAvisos.test.js` evaluaba con un "ahora" fijo que envejecía | `8d106814` |
| .157 Integration | el test del manifiesto (F4) pedía `/api/public/supply/shipments/:token` antes de que la ruta existiera en esa release (404 HTML → JSON inválido) | `c339047d` |
| .159 Frontend (unit) | la guarda de shards listaba specs sin `global-setup` y `dsn-241-dominios.spec.js` leía `seed-order.json` al importar | `960c102a` |
| .160 E2E shard 3 (`pos-241-v2`, `qa-249-inventario-touch`) | combobox de cuentas sin la cuenta USD (fetch en vuelo) y `b` de la fila no visible en mobile | `2d680040` |
| .161 E2E shard 3 (`pos-241-v2`) | clic perdido en el chip «No pagado»: la venta quedaba parcial y faltaba «Confirmar venta» | `1096ae41` (POS) + combobox determinista y vuelta del chip acá (§5) |

Evidencia mínima del cierre:

1. **Racha (cumplida el 25/09):** las 3 corridas completas verdes consecutivas
   fueron `36089666759` (`9204563`, 9m36s) · `36101675980` (`499966a`, 11m14s) ·
   `36103971417` (`ac5d2ae`, 10m46s); `node scripts/qa-ci-racha.mjs` sale 0.
   Las rojas previas y sus fixes están en la tabla de arriba.
2. **Sin cuarentena:** el workflow sin la variable de cuarentena ni reintentos por
   spec, `e2e/` sin `.skip(`/`.fixme(` y `retries: 0`; lo exige
   `src/lib/ciHarness.test.js`. Shards balanceados (143/143/142 · 428 tests).
3. **Local:** los specs de la noche 23/09, 5/5 vueltas aisladas sin reintentos;
   los flaky de los releases .160/.161 (POS y táctil) y el de config
   (`config-guardado`, .162–.165) endurecidos y verificados (repeat 3/3 y
   archivo 5/5); QA de shell/dominios/POS v2 con `bajos=0`; `npm test` en verde.
4. **#247 en producción:** entry 1104 → 169 KB (medido en v1.0.154) —
   `docs/qa/247-performance/`.

## 7. Pendientes conocidos

- Ninguno de estabilidad: la suite corre sin cuarentena y con shards balanceados
  (#245). Si aparece un flake, se aísla y se corrige la raíz (no se habilita un
  re-run ciego).
