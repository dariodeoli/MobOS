import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

// Login y entrada demo rediseñados (#373), animaciones con reduced-motion (#371)
// y códigos segmentados con pegado completo (#372). Frontend-only, sin backend.
const out = process.env.MOBOS_QA_OUT || '/tmp/mobos-login-qa'

async function tema(page, oscuro) {
  // Sin backend: /auth/me responde401 (sesión ausente); los demás endpoints503.
  await page.route('**/api/**', (route) => !new URL(route.request().url()).pathname.startsWith('/api/') ? route.continue() : route.fulfill({ status: new URL(route.request().url()).pathname === '/api/auth/me' ? 401 : 503, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' }))
  await page.route(/https:\/\//, (route) => route.abort())
  await page.emulateMedia({ colorScheme: oscuro ? 'dark' : 'light' })
  await page.addInitScript((d) => { try { localStorage.setItem('mobos:theme', d ? 'dark' : 'light') } catch { /* sin storage */ } document.documentElement.classList.toggle('dark', d) }, oscuro)
}

async function medir(page) {
  return page.evaluate(() => {
    const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
    const chicos = [...document.querySelectorAll('main button, main input, main select, main a[href]')].filter(visible)
      .map((el) => { const r = el.getBoundingClientRect(); return { n: (el.getAttribute('aria-label') || el.textContent || el.id || el.tagName).trim().slice(0, 40), h: Math.round(r.height) } })
      .filter((x) => x.h < 44)
    const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return [0, 0, 0, 0]; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1] }
    const fondo = (el) => { const capas = []; for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c[3] > 0) capas.push(c); if (c[3] === 1) break } let base = [255, 255, 255]; for (const c of capas.reverse()) base = base.map((v, i) => c[i] * c[3] + v * (1 - c[3])); return base }
    const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }
    const textos = [...document.querySelectorAll('main h1, main p, main label, main li b, main li span')].filter(visible)
      .filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
      .map((el) => ({ n: el.textContent.trim().slice(0, 30), r: ratio(parse(getComputedStyle(el).color).slice(0, 3), fondo(el)) }))
      .filter((x) => x.r < 4.5)
    return { scroll: document.documentElement.scrollWidth, ancho: innerWidth, chicos, bajos: textos }
  })
}

for (const [width, nombre] of [[1440, 'login-1440'], [375, 'login-375']]) {
  for (const oscuro of [false, true]) {
    test(`login ${width} ${oscuro ? 'oscuro' : 'claro'}: sin scroll horizontal, 44px y contraste`, async ({ page }) => {
      await mkdir(out, { recursive: true })
      await page.setViewportSize({ width, height: width > 600 ? 900 : 812 })
      await tema(page, oscuro)
      await page.goto('/login', { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { name: 'Entrá a tu tienda' })).toBeVisible()
      await expect(page.getByLabel('Correo').first()).toBeVisible()
      await expect(page.getByTestId('login-probar-demo')).toBeVisible()
      const m = await medir(page)
      expect(m.scroll, 'scroll horizontal').toBeLessThanOrEqual(m.ancho)
      // El ThemeToggle y el Google button son compartidos; se exige a lo propio del acceso.
      expect(m.chicos.filter((x) => !/tema|modo|claro|oscuro/i.test(x.n)), JSON.stringify(m.chicos)).toEqual([])
      expect(m.bajos, JSON.stringify(m.bajos)).toEqual([])
      if (process.env.MOBOS_QA_SCREENSHOTS === '1') await page.screenshot({ path: `${out}/${nombre}${oscuro ? '-dark' : ''}.png` })
    })
  }
}

for (const width of [1440, 375]) {
  test(`entrada demo ${width}: perfiles, PIN y enlace al login`, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 600 ? 900 : 812 })
    await tema(page, false)
    await page.goto('/demo', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Elegí un perfil y entrá' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Entrar como/ })).toHaveCount(2)
    await page.getByTestId('demo-pin-toggle').click()
    if (width < 768) { for (const d of '9999') await page.getByRole('button', { name: `Dígito ${d}`, exact: true }).click() }
    else await page.getByLabel('Ingresar otro PIN').fill('9999')
    await expect(page.locator('#demo-pin-status')).toContainText('PIN incorrecto')
    const m = await medir(page)
    expect(m.scroll).toBeLessThanOrEqual(m.ancho)
    expect(m.chicos.filter((x) => !/tema|modo|claro|oscuro/i.test(x.n)), JSON.stringify(m.chicos)).toEqual([])
    if (process.env.MOBOS_QA_SCREENSHOTS === '1') await page.screenshot({ path: `${out}/demo-${width}.png` })
  })
}

async function pegar(page, selector, texto) {
  await page.locator(selector).focus()
  await page.evaluate(([sel, t]) => {
    const dt = new DataTransfer(); dt.setData('text', t)
    document.querySelector(sel).dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  }, [selector, texto])
}

test('códigos segmentados: pegar el código completo llena todos los segmentos, avanza solo y valida el IMEI', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/bloques-preview', { waitUntil: 'domcontentloaded' })
  const puente = page.getByTestId('prev-puente')
  // Pegado completo con guion y minúsculas.
  await pegar(page, '[data-testid="prev-puente"] [data-testid="codigo-celda-0"]', 'abcde-fghij')
  await expect(page.getByTestId('prev-puente-valor')).toHaveText('ABCDEFGHIJ')
  for (let i = 0; i < 10; i += 1) await expect(puente.getByTestId(`codigo-celda-${i}`)).toHaveValue('ABCDEFGHIJ'[i])
  await expect(puente).toContainText('Código completo')
  // Escritura: avanza sola y Backspace retrocede.
  await puente.getByTestId('codigo-celda-9').focus()
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace')
  await expect(page.getByTestId('prev-puente-valor')).toHaveText('ABCDEFGH')
  await page.keyboard.type('xy')
  await expect(page.getByTestId('prev-puente-valor')).toHaveText('ABCDEFGHXY')
  // Teclado numérico en el IMEI y validación instantánea.
  const imei = page.getByTestId('prev-imei')
  await expect(imei.getByTestId('codigo-celda-0')).toHaveAttribute('inputmode', 'numeric')
  await pegar(page, '[data-testid="prev-imei"] [data-testid="codigo-celda-0"]', '49-015420-323751-9')
  await expect(imei.getByRole('alert')).toContainText('El IMEI no es válido')
  await pegar(page, '[data-testid="prev-imei"] [data-testid="codigo-celda-0"]', '490154203237518')
  await expect(imei).toContainText('Código completo')
  expect((await page.evaluate(() => document.documentElement.scrollWidth))).toBeLessThanOrEqual(375)
  const alto = await imei.getByTestId('codigo-celda-0').evaluate((el) => el.getBoundingClientRect().height)
  expect(alto).toBeGreaterThanOrEqual(44)
})

test('animaciones: el check se anima y con prefers-reduced-motion no hay movimiento', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/bloques-preview', { waitUntil: 'domcontentloaded' })
  const aro = page.locator('.mobos-check-aro').first()
  await expect(aro).toBeVisible()
  expect(await aro.evaluate((el) => getComputedStyle(el).animationName)).toBe('mobos-check-aro')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await aro.evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
  expect(await page.locator('.mobos-check').first().evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
  await expect(page.getByTestId('check-animado').first()).toBeVisible()
})
