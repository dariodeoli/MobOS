import { test, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { measureLayout, expectLayoutContract } from './helpers/layoutContract.js'

for (const [width, dark] of [[375, false], [1440, false], [1440, true]]) {
  test(`237+370 primer contenido real ${width} ${dark ? 'dark' : 'light'}`, async ({ page }) => {
    await page.route('**/api/**', route => !new URL(route.request().url()).pathname.startsWith('/api/') ? route.continue() : route.fulfill({ status: 503, json: { error: 'Frontend-only isolated QA' } }))
    await page.route(/https:\/\//, route => route.abort())
    await page.setViewportSize({ width, height: width < 768 ? 812 : 900 })
    await page.addInitScript(dark => {
      sessionStorage.setItem('mobos:demo-guia-vista', '1')
      localStorage.setItem('mobos:theme', dark ? 'dark' : 'light')
    }, dark)
    await page.goto('/demo')
    await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
    await expect(page.getByTestId('shell')).toBeVisible()
    await expectLayoutContract(page, `237+370 Inicio ${width}`)
    await expect(page.getByTestId('demo-perspectivas-toggle')).toHaveCount(1)
    const m = await measureLayout(page)
    const out = process.env.CAPTURE_237 || '/tmp/mobos-pos237-370-geometry'
    await mkdir(out, { recursive: true })
    await writeFile(`${out}/first-content-${width}-${dark ? 'dark' : 'light'}.json`, JSON.stringify({ width, dark, firstContentTop: m.firstContentTop, chromeBottom: m.chromeBottom, hscroll: m.hscroll }, null, 2))
    await page.screenshot({ path: `${out}/first-content-${width}-${dark ? 'dark' : 'light'}.png` })
  })
}
