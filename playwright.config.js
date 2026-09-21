import { defineConfig } from '@playwright/test'
import { existsSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Harness e2e. El backend atiende en http://localhost:3001 y el frontend en
// http://localhost:5175 (único origen local permitido por el CORS del backend,
// MOBOS_LOCAL_APP_ORIGIN). MOBOS_APP_URL apunta al mismo origen para que la
// cookie de sesión pase el chequeo sameOrigin.
//
// AISLAMIENTO ENTRE WORKTREES: la base y los puertos son compartidos, así que
// un worktree vinculado (no el checkout principal) deriva valores únicos de su
// nombre de carpeta. Sin esto, dos agentes comparten cluster y uno le apaga la
// base al otro a mitad de corrida. Los valores explícitos por entorno mandan.
const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)))
const esWorktreeVinculado = existsSync(`${ROOT}/.git`) && statSync(`${ROOT}/.git`).isFile()
const sufijo = basename(ROOT).replace(/[^a-zA-Z0-9-]/g, '') || 'worktree'
let hash = 0
for (const caracter of sufijo) hash = (hash * 31 + caracter.charCodeAt(0)) % 40

const API_PORT = process.env.MOBOS_E2E_API_PORT || (esWorktreeVinculado ? String(3100 + hash) : '3001')
const WEB_PORT = process.env.MOBOS_E2E_WEB_PORT || (esWorktreeVinculado ? String(5200 + hash) : '5175')
const PG_PORT = process.env.MOBOS_E2E_PGPORT || (esWorktreeVinculado ? String(5500 + hash) : '5439')
const PG_DATA = process.env.MOBOS_E2E_PGDATA || (esWorktreeVinculado ? `/tmp/mobos-e2e-pg-${sufijo}` : '/tmp/mobos-e2e-pg')
const DB_NAME = process.env.MOBOS_E2E_DB || (esWorktreeVinculado ? `mobos_e2e_${sufijo.replace(/-/g, '_')}` : 'mobos_e2e')

// El aislamiento tiene que verlo TODO el run: los lanzadores (procesos
// separados), globalSetup y las specs. Por eso se escribe en process.env, que
// es lo que heredan los hijos.
Object.assign(process.env, {
  MOBOS_E2E_API_PORT: API_PORT,
  MOBOS_E2E_WEB_PORT: WEB_PORT,
  MOBOS_E2E_PGPORT: PG_PORT,
  MOBOS_E2E_PGDATA: PG_DATA,
  MOBOS_E2E_DB: DB_NAME,
  MOBOS_APP_URL: `http://localhost:${WEB_PORT}`,
})

const E2E_ENV = {
  MOBOS_E2E_API_PORT: API_PORT,
  MOBOS_E2E_WEB_PORT: WEB_PORT,
  MOBOS_E2E_PGPORT: PG_PORT,
  MOBOS_E2E_PGDATA: PG_DATA,
  MOBOS_E2E_DB: DB_NAME,
  MOBOS_APP_URL: `http://localhost:${WEB_PORT}`,
}

const CI = Boolean(process.env.CI)
// Las specs comparten tenant y contadores de stock: por defecto un worker para
// no correr carreras de checkout. Subilo solo si tus specs no tocan stock
// compartido (MOBOS_E2E_WORKERS=3).
const WORKERS = Math.max(1, Number(process.env.MOBOS_E2E_WORKERS) || 1)

// Gate rápido para los ciclos de integración (`ht`): los flujos que, si se
// rompen, rompen el negocio. La suite completa queda para antes del release.
export const SMOKE_GREP = [
  'seller logs in with company credentials',
  'registers the sale and lists it in pedidos',
  'clic en la fila abre el pedido por su id interno',
  'owner-only nav items',
  'resumen shows the dashboard KPIs',
  'lists the seeded serialized unit',
  'returns the minimal public payload',
].join('|')

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!CI,
  // Flaky retry locally, zero tolerance in CI.
  retries: CI ? 0 : 1,
  workers: WORKERS,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      // No storage state: UI login flows and anonymous API tracking.
      name: 'core',
      testMatch: /auth\.spec\.js|public-tracking\.spec\.js|cliente-portal-entrada\.spec\.js|demo-finanzas\.spec\.js/,
    },
    {
      // Seeded seller session (PIN 2468) for POS and permissions coverage.
      name: 'seller',
      testMatch: /pos-checkout\.spec\.js|pos-campos\.spec\.js|pos-pedidos\.spec\.js|pos-busqueda-global\.spec\.js|pos-cliente-portal\.spec\.js|permissions\.spec\.js|responsive\.spec\.js|public-levels\.spec\.js|sesion-bloqueo\.spec\.js/,
      use: { storageState: 'e2e/.auth/seller.json' },
    },
    {
      // Seeded owner session (PIN 1234) for control views.
      name: 'admin',
      testMatch: /admin\.spec\.js|pos-resumen-fijo\.spec\.js|public-quote-transfer\.spec\.js|impresion-remota\.spec\.js|documentos-no-fiscales\.spec\.js|selector-sucursal\.spec\.js|invitar-persona\.spec\.js|auditoria\.spec\.js|equipo-integrantes\.spec\.js|equipo-invitaciones\.spec\.js|finanzas-comisiones\.spec\.js|seguridad-cuenta\.spec\.js|precios-listas\.spec\.js|etiquetas-gondola\.spec\.js|campanas-recompra\.spec\.js|cobro-cuotas\.spec\.js|inventario-importacion\.spec\.js|kardex-producto\.spec\.js|inventario-unidades\.spec\.js|servicio-tecnico\.spec\.js|inventario-pos-sync\.spec\.js|notificaciones\.spec\.js|documentacion\.spec\.js|analisis\.spec\.js|configuracion-lote5\.spec\.js|compras-densidad\.spec\.js|pos-qa-173\.spec\.js/,
      use: { storageState: 'e2e/.auth/admin.json' },
    },
  ],
  globalSetup: './e2e/global-setup.mjs',
  globalTeardown: './e2e/global-teardown.mjs',
  webServer: [
    {
      command: 'bash e2e/bin/start-backend.sh',
      url: `http://localhost:${API_PORT}/api/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: E2E_ENV,
    },
    {
      command: 'bash e2e/bin/start-frontend.sh',
      url: `http://localhost:${WEB_PORT}`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: E2E_ENV,
    },
  ],
})
