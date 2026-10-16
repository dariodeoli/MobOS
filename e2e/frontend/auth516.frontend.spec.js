import { test, expect } from '@playwright/test'
async function preparar(page, plataforma, dark) {
  await page.addInitScript(dark => localStorage.setItem('mobos:theme', dark ? 'dark' : 'light'), dark)
  await page.route('**/api/**', r => {
    const path = new URL(r.request().url()).pathname
    if (!path.startsWith('/api/')) return r.continue()
    if (path === '/api/auth/login') return r.fulfill({ json: { tenant: { id: 'fixture-516', name: 'Tienda ficticia' }, sellers: [{ id: 'persona-516', name: 'Vendedor ficticio' }] } })
    return r.fulfill({ status: 401, json: { message: 'Sin sesión QA' } })
  })
  await page.route(/https:\/\//, r => r.abort())
  await page.goto(`/e2e/fixtures/auth516.html?plataforma=${plataforma}`)
  await expect(page.getByRole('heading', { name: 'Entrá a tu tienda', exact: true })).toBeVisible()
  await expect(page.getByText('Verificando tu sesión…')).toHaveCount(0)
}
for (const [width,height] of [[360,640],[390,844],[1440,900]]) for (const dark of [false,true]) test(`#516 mismas bases visuales auth ${width} ${dark ? 'oscuro' : 'claro'}`, async ({ page }) => {
  await page.setViewportSize({ width, height })
  const medidas = {}
  for (const plataforma of ['web','ios']) {
    await preparar(page, plataforma, dark)
    medidas[plataforma] = await page.evaluate(() => {
      const estilo = selector => {
        const el = document.querySelector(selector), s = getComputedStyle(el), r = el.getBoundingClientRect()
        return { altura: r.height, fuente: s.fontSize, radio: s.borderRadius, color: s.color, fondo: s.backgroundColor }
      }
      return { mail: estilo('#mail'), pass: estilo('#pass'), titulo: estilo('.login-panel > h1'), panel: estilo('.login-panel'), scroll: document.documentElement.scrollHeight > innerHeight, horizontal: document.documentElement.scrollWidth > innerWidth, formularioVisible: document.querySelector('.auth-form').getBoundingClientRect().bottom <= innerHeight }
    })
    console.log('AUTH516',width,dark,plataforma,JSON.stringify(medidas[plataforma]))
  }
  if (width < 768) {
    expect(medidas.ios.mail).toEqual(medidas.web.mail)
    expect(medidas.ios.pass).toEqual(medidas.web.pass)
  } else {
    // iOS conserva campo16px/44px compacto;1440 no representa un iPhone físico.
    for (const campo of ['mail','pass']) for (const atributo of ['radio','color','fondo']) expect(medidas.ios[campo][atributo]).toBe(medidas.web[campo][atributo])
  }
  for (const plataforma of ['web','ios']) {
    expect(medidas[plataforma].horizontal).toBe(false)
    expect(medidas[plataforma].formularioVisible).toBe(true)
    if (width < 768) expect(medidas[plataforma].scroll).toBe(false)
  }
})

for (const plataforma of ['web','ios']) test(`#516 ${plataforma} conserva botón y progreso mientras autentica`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 }); await preparar(page, plataforma, false)
  let start, finish
  const started = new Promise(resolve => start = resolve)
  await page.route('**/api/auth/login', async route => {
    start(); await new Promise(resolve => finish = resolve)
    await route.fulfill({ status: 400, json: { message: 'Credenciales de fixture inválidas' } })
  })
  await page.locator('#mail').fill('fixture@example.invalid'); await page.locator('#pass').fill('Fixture516!')
  await page.getByRole('button', { name: 'Continuar', exact: true }).click(); await started
  await expect(page.getByRole('button', { name: 'Un momento…', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Un momento…', exact: true })).toBeDisabled()
  if (process.env.MOBOS_QA_VISUAL === '1') await page.screenshot({ path: testInfo.outputPath(`login-${plataforma}-progreso.png`) })
  finish()
  await expect(page.getByRole('alert')).toContainText('Credenciales de fixture inválidas')
  await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeVisible()
})


for (const [width,height] of [[360,640],[390,844]]) for (const plataforma of ['web','ios']) test(`#516 PIN ${plataforma} ${width}: mismo teclado propio, foco y error`, async ({ page }) => {
  await page.setViewportSize({ width, height }); await preparar(page, plataforma, false)
  await page.route('**/api/auth/pin', r => r.fulfill({ status: 400, json: { message: 'PIN de fixture inválido' } }))
  await page.locator('#mail').fill('fixture@example.invalid'); await page.locator('#pass').fill('Fixture516!')
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  const pin = page.locator('#seller-pin')
  await expect(pin).toHaveAttribute('readonly',''); await expect(pin).toHaveAttribute('inputmode','none')
  await expect(page.getByTestId('pin-teclado')).toBeVisible()
  await page.getByTestId('pin-indicadores').click(); await expect(pin).not.toBeFocused()
  for (const key of await page.getByTestId('pin-teclado').getByRole('button').all()) { const box = await key.boundingBox(); expect(box.height).toBeGreaterThanOrEqual(44); expect(box.width).toBeGreaterThanOrEqual(44); expect(box.y + box.height).toBeLessThanOrEqual(height) }
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(false)
  for (const d of '9999') await page.getByRole('button', { name: `Dígito ${d}`, exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('PIN de fixture inválido')
  await expect(pin).toHaveValue('')
})

for (const plataforma of ['web', 'ios']) test(`#516 teclado ${plataforma}: campo y continuar alcanzables al reducir viewport`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await preparar(page, plataforma, false)
  const main = page.locator('main.auth-login'), pass = page.locator('#pass')
  await pass.focus()
  await page.evaluate(() => {
    document.body.style.height = '400px'
    window.dispatchEvent(Object.assign(new Event('keyboardDidShow'), { keyboardHeight: 444 }))
  })
  await expect(main).toHaveAttribute('data-teclado-visible', 'true')
  await expect(pass).toBeFocused()
  const rect = await pass.boundingBox()
  expect(rect.y + rect.height).toBeLessThanOrEqual(400)
  const continuar = page.getByRole('button', { name: 'Continuar', exact: true })
  await continuar.scrollIntoViewIfNeeded()
  await expect(continuar).toBeInViewport()
  await page.evaluate(() => {
    document.body.style.height = ''
    window.dispatchEvent(new Event('keyboardDidHide'))
  })
  await expect(main).toHaveAttribute('data-teclado-visible', 'false')
  expect((await main.boundingBox()).height).toBeLessThanOrEqual(845)
})
