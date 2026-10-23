import { test, expect } from '@playwright/test'
import { openShellDestination } from './helpers/shell-navigation.js'
import { esperarAnimaciones } from './helpers/animaciones.js'

// Foco y desplazamiento (Dario, 23-10-2026): en móvil todo campo enfocado queda
// en la mitad superior del área visible (encima del teclado) y nunca tapado, y
// al abrir una sección se desplaza hasta ella y se enfoca el primer campo.
// El teclado se simula reduciendo `visualViewport` (390×844, teclado de 336 px).
const ANCHO = 390
const ALTO = 844
const TECLADO = 336
const VISIBLE = ALTO - TECLADO

// visualViewport falso y controlable: window.__teclado(px) cambia su alto y emite `resize`.
async function simularTeclado(page) {
  await page.addInitScript(({ alto }) => {
    const vv = new EventTarget()
    let altura = alto
    Object.defineProperties(vv, {
      height: { get: () => altura },
      width: { get: () => window.innerWidth },
      offsetTop: { get: () => 0 },
      offsetLeft: { get: () => 0 },
      pageTop: { get: () => window.scrollY },
      pageLeft: { get: () => 0 },
      scale: { get: () => 1 },
    })
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
    window.__teclado = px => { altura = alto - px; vv.dispatchEvent(new Event('resize')) }
  }, { alto: ALTO })
}

async function abrirTeclado(page) {
  await page.evaluate(px => window.__teclado(px), TECLADO)
}

// El campo queda dentro de la mitad superior del área visible (sobre el teclado).
async function expectEnMitadSuperior(locator, etiqueta) {
  await expect.poll(async () => {
    const r = await locator.evaluate(el => { const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom } })
    return r.top >= 0 && r.bottom <= VISIBLE / 2 + 24
  }, { message: `${etiqueta} en la mitad superior del área visible`, timeout: 6000 }).toBe(true)
}

test.use({ viewport: { width: ANCHO, height: ALTO }, hasTouch: true, isMobile: true })

test('popup de cliente: «Agregar dirección» enfoca el primer campo y los bajos suben sobre el teclado', async ({ page }) => {
  await simularTeclado(page)
  await page.route(/https:\/\//, route => route.abort())
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (!path.startsWith('/api/')) return route.continue()
    const cliente = { id: 'qa-cliente-0', name: 'Cliente QA', phone: '0981123456', countryCode: '+595', pricingTier: 'RETAIL', addresses: [], tags: [], stats: { orders: 0, totalSpentPyg: 0, pendingPyg: 0 } }
    let body = []
    if (path === '/api/auth/me') body = { user: { id: 'qa-user', name: 'Usuario local', role: 'ADMIN', tenantId: 'qa-tenant', branchId: 'qa-branch', branchName: 'Sucursal local' }, tenant: { id: 'qa-tenant', name: 'Tienda local' } }
    else if (path === '/api/inventory/branches') body = [{ id: 'qa-branch', name: 'Sucursal local' }]
    else if (path === '/api/customers/summary') body = { total: 1, wholesalers: 0, retail: 1 }
    else if (path === '/api/customers' && route.request().method() === 'GET') body = [cliente]
    else if (path === '/api/customers/qa-cliente-0') body = { customer: cliente, orders: [], stats: cliente.stats }
    else if (/\/api\/customers\/(duplicates|segments)/.test(path)) body = path.endsWith('segments') ? { rows: [], total: 0 } : { duplicados: [] }
    return route.fulfill({ status: 200, json: body })
  })
  await page.addInitScript(() => localStorage.setItem('mobos:clientes-vista', 'list'))
  await page.goto('/clientes')
  await page.getByTestId('cliente-fila').first().click()
  await page.getByRole('tab', { name: 'Datos' }).or(page.getByRole('button', { name: 'Datos', exact: true })).first().click()
  await esperarAnimaciones(page)
  await page.getByRole('button', { name: 'Agregar dirección' }).first().click()
  const popup = page.getByRole('dialog', { name: 'Agregar dirección' })
  await expect(popup).toBeVisible()
  await esperarAnimaciones(page)
  await abrirTeclado(page)
  const campos = popup.locator('input:visible, textarea:visible')
  expect(await campos.count()).toBeGreaterThan(2)
  // Esc sigue cerrando y el foco queda atrapado: el primer campo se puede tocar de nuevo.
  const ultimo = campos.last()
  await ultimo.focus()
  await expectEnMitadSuperior(ultimo, 'último campo del popup')
  await campos.first().focus()
  await expectEnMitadSuperior(campos.first(), 'primer campo del popup')
  await ultimo.focus()
  await expectEnMitadSuperior(ultimo, 'último campo del popup (de nuevo)')
  await page.keyboard.press('Escape')
  await expect(popup).toBeHidden()
})

async function entrarDemo(page) {
  await page.route('**/api/**', route =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' }),
  )
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => {
    sessionStorage.setItem('mobos:demo-guia-vista', '1')
    try { localStorage.setItem('mobos:aviso-metricas', '1') } catch { /* sin storage */ }
  })
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
}

test('página: un campo bajo sube a la mitad superior y una sección que se abre se desplaza y enfoca su primer campo', async ({ page }) => {
  await simularTeclado(page)
  await entrarDemo(page)
  await openShellDestination(page, 'Clientes')
  await expect(page.locator('main input:visible').first()).toBeVisible()
  await esperarAnimaciones(page)

  // 1. Campo al pie de una página larga del shell.
  await page.evaluate(() => {
    const relleno = document.createElement('div')
    relleno.style.height = '1200px'
    const campo = document.createElement('input')
    campo.id = 'qa-bajo'
    campo.setAttribute('aria-label', 'Campo bajo')
    document.querySelector('main').append(relleno, campo)
  })
  const bajo = page.locator('#qa-bajo')
  await bajo.scrollIntoViewIfNeeded()
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await abrirTeclado(page)
  await bajo.focus()
  await expectEnMitadSuperior(bajo, 'campo bajo de la página')

  // 2. Disclosure: un botón al pie de una página larga abre una sección con campos.
  await page.evaluate(() => {
    const relleno = document.createElement('div')
    relleno.style.height = '1400px'
    relleno.id = 'qa-relleno'
    const boton = document.createElement('button')
    boton.id = 'qa-abrir'
    boton.type = 'button'
    boton.textContent = 'Facturar a otro titular'
    boton.setAttribute('aria-expanded', 'false')
    boton.addEventListener('click', () => {
      boton.setAttribute('aria-expanded', 'true')
      setTimeout(() => {
        const sec = document.createElement('section')
        sec.id = 'qa-seccion'
        sec.innerHTML = '<label>Titular<input id="qa-titular" /></label><label>RUC<input id="qa-ruc" /></label>'
        boton.after(sec)
      }, 30)
    })
    document.querySelector('main').append(relleno, boton)
  })
  await page.evaluate(() => window.__teclado(0))
  await page.locator('#qa-abrir').scrollIntoViewIfNeeded()
  await page.locator('#qa-abrir').click()
  await abrirTeclado(page)
  await expect(page.locator('#qa-titular')).toBeFocused()
  await expectEnMitadSuperior(page.locator('#qa-titular'), 'primer campo de la sección abierta')
})

test('prefers-reduced-motion desplaza sin animación y los campos marcados del POS no se mueven', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await simularTeclado(page)
  await entrarDemo(page)
  await esperarAnimaciones(page)
  const r = await page.evaluate(async px => {
    const llamadas = []
    const original = window.scrollBy.bind(window)
    window.scrollBy = (...args) => { llamadas.push(args[0]); return original(...args) }
    document.body.insertAdjacentHTML('beforeend', '<div style="height:1600px"></div><input id="qa-escaner" data-sin-autoscroll /><input id="qa-normal" />')
    window.__teclado(px)
    document.getElementById('qa-escaner').focus()
    await new Promise(resolve => setTimeout(resolve, 400))
    const escaner = llamadas.length
    document.getElementById('qa-normal').focus()
    await new Promise(resolve => setTimeout(resolve, 400))
    return { escaner, normal: llamadas.length - escaner, comportamiento: llamadas.at(-1)?.behavior }
  }, TECLADO)
  expect(r.escaner, 'el campo del escáner no se mueve').toBe(0)
  expect(r.normal, 'el campo normal sí se ubica').toBeGreaterThan(0)
  expect(r.comportamiento).toBe('auto')
})
