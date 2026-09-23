# Arnés E2E y CI (#CI)

Cómo queda el arnés de pruebas de punta a punta y el workflow de CI después del
rediseño: **rápido** (shards en paralelo), **determinista** (backend prod, datos
con PIN libre, sin ruido de abortos) y **honesto** (retries solo en cuarentena y
con reporte). Los comandos del día a día siguen siendo los de siempre:
`npm run test:e2e:smoke` y `npm run test:e2e`.

## 1. Jobs de CI y duraciones

| Job | Qué corre | Actual | Timeout |
| --- | --- | --- | --- |
| Frontend (lint + build) | `npm run lint` · `npm test` · `npm run build` | ~1m35 | 15 min |
| Backend (typecheck + build) | `tsc --noEmit` · `test:unit` · `build` | ~1m40 | 12 min |
| Integration | `backend/tests/integration-http.sh` (Postgres efímero) | ~3m10 | 15 min |
| **E2E (3 shards)** | `playwright test --shard=n/3` sobre backend prod | **~2-3 min de tests + setup por shard** | 20 min |

El job E2E corre en **matriz de 3 shards** (`fail-fast: false`): cada shard tiene
su propio runner, cluster de Postgres, backend y frontend, así que no comparten
estado. El balanceo lo hace Playwright (~88/86/84 tests) y un shard tarda lo que
la suite completa / 3.

### 1.1 Workflow paso a paso (job E2E)

Ambos shards corren la misma receta (timeout 20 min por job):

| Paso | Qué hace |
| --- | --- |
| `checkout` + `setup-node` | Node 22 con cache de npm de **ambos** lockfiles (raíz y backend). |
| PostgreSQL | instala el server y expone los binarios donde los busca el harness (`/opt/homebrew/bin`). |
| `npm ci` (raíz + backend) + `prisma generate` | dependencias y cliente Prisma. |
| Cache + instalación de Chromium | `~/.cache/ms-playwright` cacheado por lockfile; `--with-deps` deja las libs. |
| `npm --prefix backend run build` | build prod del backend: el harness lo arranca con `next start`. |
| `npx playwright test --shard=n/3` | la suite del shard con `MOBOS_E2E_BACKEND=prod` y `MOBOS_E2E_CUARENTENA=<lista>`. |
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

## 4. Cuarentena de flaky (retries)

Los retries **no** son globales: por defecto son 0.

- La lista vive en el workflow (`.github/workflows/ci.yml`) como
  `MOBOS_E2E_CUARENTENA: spec-a,spec-b,...` (hoy: `documentos-no-fiscales`,
  `etiquetas-unidad`, `finanzas-conciliacion`, `inventario-unidades`,
  `pos-qa-173`, `vendidos-comprobante-rapido`).
- `e2e/helpers/cuarentena.mjs` habilita `retries: 1` **solo** a los specs de esa
  lista (`habilitarRetrySiCuarentena('nombre')` al inicio del archivo). Sin la
  variable no hay retries en ningún lado.
- `e2e/reporters/flaky.mjs` deja `test-results/reporte-flaky.md|json` con los
  tests que reintentaron (o fallaron) y emite anotaciones en GitHub. El workflow
  sube un artifact por shard.
- **Vaciar la cuarentena:** si el reporte muestra que un spec ya no reintenta en
  varias corridas, se saca de la lista del workflow (y del hook del archivo). La
  guarda `src/lib/ciHarness.test.js` exige que ambos lados coincidan.

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

# Igual que CI: backend prod + un shard
npm --prefix backend run build
MOBOS_E2E_BACKEND=prod npx playwright test --shard=1/3

# Cuarentena explícita (qué specs pueden reintentar)
MOBOS_E2E_CUARENTENA=inventario-unidades,pos-qa-173 npm run test:e2e
```

## Validación

Con el rediseño completo (sobre v1.0.146): **3 rondas consecutivas × 3 shards en
verde (9/9)** — 279-280 passed por ronda, **0 fallos inesperados**, 2.4-4.6 min
de tests por shard y **0 ruido** de abortos en los logs del backend.

La cuarentena absorbió 2 reintentos reales durante las rondas
(`inventario-unidades › el motivo de baja recuerda el último usado` y
`etiquetas-unidad › al llegar a otra sucursal se reimprime la etiqueta`), que es
exactamente su propósito: la corrida queda verde, el reporter deja el registro y
el spec sale de la lista cuando se corrige la causa de fondo.

## 7. Pendientes conocidos

- **Cuarentena:** los 6 specs deberían dejar de reintentar con el backend prod;
  cuando el reporte lo confirme, se vacía la lista (`MOBOS_E2E_CUARENTENA` en el
  workflow) y se sacan los hooks `habilitarRetrySiCuarentena` de los archivos.
  La guarda `src/lib/ciHarness.test.js` mantiene ambos lados sincronizados.
