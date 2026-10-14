// Sesión de vendedor propia para llamadas directas a la API desde una spec.
//
// El `seller.json` sembrado se puede quedar sin vigencia a mitad de la corrida
// (otra spec inicia sesión con el mismo vendedor por PIN y la sesión anterior
// deja de valer), así que las specs que piden algo "como el vendedor" por API
// abren su propia sesión: empresa + PIN, con un dispositivo propio.
import { readFile } from 'node:fs/promises'
import { request } from '@playwright/test'
import { SEED } from './seed-data.js'

export async function contextoVendedorApi({ origen } = {}) {
  const sembrado = JSON.parse(await readFile('e2e/.auth/.seeded', 'utf8'))
  const vendedor = sembrado.sellers.find((s) => s.name === SEED.sellers[0].name) || sembrado.sellers[0]
  const extraHTTPHeaders = origen ? { Origin: origen } : undefined
  const ctx = await request.newContext({ baseURL: SEED.api, extraHTTPHeaders })
  const login = await ctx.post('/api/auth/login', {
    data: { email: SEED.company.email, password: SEED.company.password, deviceId: `e2e-vendedor-api-${Date.now().toString(36)}` },
  })
  if (!login.ok()) throw new Error(`login de empresa: HTTP ${login.status()} ${await login.text()}`)
  const pin = await ctx.post('/api/auth/pin', { data: { sellerId: vendedor.id, pin: vendedor.pin } })
  if (!pin.ok()) throw new Error(`PIN del vendedor: HTTP ${pin.status()} ${await pin.text()}`)
  return ctx
}
