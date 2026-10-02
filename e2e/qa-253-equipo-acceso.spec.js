// #253 · Grupo «Equipo y acceso»: integrantes, invitaciones, roles y permisos,
// horarios, PIN, metas y comisiones. Esta spec cubre el orden nuevo del grupo y
// el resumen de horario por integrante. #299: cada tarea vive en su pestaña
// (Miembros · Invitaciones · Permisos · Rendimiento).
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const VENDEDOR = SEED.sellers[0].name

const pestana = (page, nombre) => page.getByTestId('equipo-pantalla').getByRole('tab', { name: nombre, exact: true })

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

test('Equipo y acceso: cada tarea en su pestaña, con integrantes, metas y roles (#253/#299)', async ({ page }) => {
  await page.goto('/configuracion/equipo')

  // Miembros: la ficha del integrante y el resumen de horario.
  await expect(page.getByRole('heading', { name: 'Integrantes' })).toBeVisible()
  await expect(page.getByTestId('integrante-fila').filter({ hasText: VENDEDOR }).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByLabel(`Horario de ${VENDEDOR}`)).toHaveAttribute('title', /^(Horario:|Sin horario:)/)
  await expect(page.getByRole('heading', { name: 'Metas y comisiones' })).toHaveCount(0)

  // Rendimiento: metas, cumplimiento y comisiones por integrante.
  await pestana(page, 'Rendimiento').click()
  await expect(page.getByRole('heading', { name: 'Metas y comisiones' })).toBeVisible()
  const filas = page.getByTestId('meta-fila')
  await expect(filas.filter({ hasText: VENDEDOR })).toBeVisible({ timeout: 20_000 })
  const fila = filas.filter({ hasText: VENDEDOR })
  for (const etiqueta of ['Hoy', 'Cumplimiento', 'Comisión hoy', 'Mes']) {
    await expect(fila.getByText(etiqueta, { exact: true })).toBeVisible()
  }

  // Permisos: la matriz de roles.
  await pestana(page, 'Permisos').click()
  await expect(page.getByRole('heading', { name: 'Matriz de capacidades' })).toBeVisible()
})

test('Equipo y acceso: la meta diaria se edita en Rendimiento y persiste (#253/#299)', async ({ page }) => {
  await page.goto('/configuracion/equipo')
  await pestana(page, 'Rendimiento').click()
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
