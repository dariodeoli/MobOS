// #253 · Grupo «Equipo y acceso»: integrantes, invitaciones, roles y permisos,
// horarios, PIN, metas y comisiones. Esta spec cubre el orden nuevo del grupo
// (Integrantes → Metas y comisiones → Roles y permisos), el resumen de horario
// por integrante y que la meta diaria se edite desde «Metas y comisiones» y
// persista en el backend.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const VENDEDOR = SEED.sellers[0].name

async function usuarioDe(page, nombre) {
  return page.evaluate(async ({ api, nombre }) => {
    const usuarios = await fetch(`${api}/api/users`, { credentials: 'include' }).then(r => r.json())
    return (Array.isArray(usuarios) ? usuarios : []).find(u => u.name === nombre) || null
  }, { api: API, nombre })
}

async function fijarMeta(page, nombre, valor) {
  const campo = page.getByLabel(`Meta diaria de ${nombre}`)
  await campo.fill(String(valor))
  await campo.blur()
}

test('Equipo y acceso: integrantes, metas y comisiones y roles en un solo grupo (#253)', async ({ page }) => {
  await page.goto('/configuracion/equipo')
  await expect(page.getByRole('heading', { name: 'Integrantes' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Metas y comisiones' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Matriz de capacidades' })).toBeVisible()

  // Una fila de metas por integrante activo, con cumplimiento y comisiones.
  const filas = page.getByTestId('meta-fila')
  await expect(filas.filter({ hasText: VENDEDOR })).toBeVisible()
  const fila = filas.filter({ hasText: VENDEDOR })
  for (const etiqueta of ['Hoy', 'Cumplimiento', 'Comisión hoy', 'Mes']) {
    await expect(fila.getByText(etiqueta, { exact: true })).toBeVisible()
  }

  // El horario del integrante se resume en la propia ficha (o avisa que es libre).
  await expect(page.getByLabel(`Horario de ${VENDEDOR}`)).toHaveAttribute('title', /^(Horario:|Sin horario:)/)
})

test('Equipo y acceso: la meta diaria se edita en Metas y comisiones y persiste (#253)', async ({ page }) => {
  await page.goto('/configuracion/equipo')
  await expect(page.getByRole('heading', { name: 'Metas y comisiones' })).toBeVisible()

  const previo = await usuarioDe(page, VENDEDOR)
  expect(previo, 'el vendedor sembrado tiene que existir').toBeTruthy()
  const metaOriginal = previo.dailyGoalPyg ?? null

  try {
    await fijarMeta(page, VENDEDOR, 100000)
    await expect(page.getByLabel(`Meta diaria de ${VENDEDOR}`)).toHaveValue('100.000')
    const fila = page.getByTestId('meta-fila').filter({ hasText: VENDEDOR })
    await expect(fila.getByText(/^\d+%$/)).toBeVisible()
    expect((await usuarioDe(page, VENDEDOR))?.dailyGoalPyg).toBe(100000)
  } finally {
    // La meta del seed se restaura para no ensuciar otras corridas.
    if (metaOriginal === null) {
      await page.evaluate(async ({ api, nombre }) => {
        const usuarios = await fetch(`${api}/api/users`, { credentials: 'include' }).then(r => r.json())
        const usuario = (Array.isArray(usuarios) ? usuarios : []).find(u => u.name === nombre)
        if (usuario) {
          await fetch(`${api}/api/users`, {
            method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: usuario.id, dailyGoalPyg: null }),
          })
        }
      }, { api: API, nombre: VENDEDOR })
    } else {
      await fijarMeta(page, VENDEDOR, metaOriginal)
    }
    expect((await usuarioDe(page, VENDEDOR))?.dailyGoalPyg ?? null).toBe(metaOriginal)
  }
})
