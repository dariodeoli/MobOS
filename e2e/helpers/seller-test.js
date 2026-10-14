// `test` para los specs del proyecto `seller` (#364).
//
// El `seller.json` sembrado vale mientras nadie más inicie sesión por PIN con
// el mismo vendedor: otro spec que lo haga revoca la sesión anterior y el
// siguiente spec del proyecto arranca con 401. Este fixture automático revisa
// la sesión antes de cada test (un GET barato) y, solo si venció, abre una
// nueva (empresa + PIN, dispositivo propio) y la inyecta en el contexto. Con
// sesión vigente no hace nada más, así que no suma tiempo apreciable.
import { readFile } from 'node:fs/promises'
import { test as base, expect } from '@playwright/test'
import { SEED } from './seed-data.js'

async function sesionVigente(request, token) {
  const res = await request.get(`${SEED.api}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
  return res.ok()
}

function valorCookie(setCookie, nombre) {
  for (const fila of setCookie) {
    const match = String(fila).match(new RegExp(`(?:^|;\\s*)${nombre}=([^;]*)`))
    if (match) return match[1]
  }
  return null
}

async function abrirSesion(request) {
  const sembrado = JSON.parse(await readFile('e2e/.auth/.seeded', 'utf8'))
  const vendedor = sembrado.sellers.find((s) => s.name === SEED.sellers[0].name) || sembrado.sellers[0]
  const login = await request.post(`${SEED.api}/api/auth/login`, {
    data: { email: SEED.company.email, password: SEED.company.password, deviceId: `e2e-vendedor-sesion-${Date.now().toString(36)}` },
  })
  if (!login.ok()) throw new Error(`login de empresa: HTTP ${login.status()} ${await login.text()}`)
  const empresa = valorCookie(login.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value), 'mobos_company_session')
  const pin = await request.post(`${SEED.api}/api/auth/pin`, { headers: { Authorization: `Bearer ${empresa}` }, data: { sellerId: vendedor.id, pin: vendedor.pin } })
  if (!pin.ok()) throw new Error(`PIN del vendedor: HTTP ${pin.status()} ${await pin.text()}`)
  const vendedorToken = valorCookie(pin.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value), 'mobos_seller_session')
  return { empresa, vendedor: vendedorToken }
}

export const test = base.extend({
  sesionVendedorVigente: [async ({ context }, use, testInfo) => {
    if (testInfo.project.name === 'seller') {
      const cookies = await context.cookies()
      const actual = cookies.find((c) => c.name === 'mobos_seller_session')?.value
      if (!actual || !(await sesionVigente(context.request, actual))) {
        const nueva = await abrirSesion(context.request)
        const comunes = { domain: 'localhost', path: '/', httpOnly: true, secure: false, sameSite: 'Lax' }
        await context.addCookies([
          { ...comunes, name: 'mobos_company_session', value: nueva.empresa },
          { ...comunes, name: 'mobos_seller_session', value: nueva.vendedor },
        ])
      }
    }
    await use()
  }, { auto: true }],
})

export { expect }
