// Junta lado a lado (simulador | web) las capturas con el mismo nombre.
// Uso: node scripts/ios-paridad-comparar.mjs <dir-ios> <dir-web> <dir-salida> [patron]
import { chromium } from '@playwright/test'
import { readdir, mkdir, readFile } from 'node:fs/promises'

const [ios, web, out, patron = ''] = process.argv.slice(2)
if (!ios || !web || !out) { console.error('uso: ios-paridad-comparar.mjs <ios> <web> <salida> [patron]'); process.exit(1) }
await mkdir(out, { recursive: true })
const nombres = (await readdir(ios)).filter((n) => n.endsWith('.png') && n.includes(patron)).sort()
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } })
const uri = async (ruta) => `data:image/png;base64,${(await readFile(ruta)).toString('base64')}`
for (const n of nombres) {
  let b
  try { b = await uri(`${web}/${n}`) } catch { continue }
  const a = await uri(`${ios}/${n}`)
  await page.setContent(`<body style="margin:0;background:#888;display:flex;gap:24px;padding:24px;font:600 22px sans-serif;color:#fff">
    <div><div style="margin-bottom:8px">Simulador iPhone (iOS)</div><img src="${a}" style="height:1400px;display:block"></div>
    <div><div style="margin-bottom:8px">Web móvil 390x844</div><img src="${b}" style="height:1400px;display:block"></div></body>`)
  await page.setViewportSize({ width: 2000, height: 1500 })
  await page.screenshot({ path: `${out}/${n.replace('.png', '')}-lado-a-lado.png`, fullPage: true })
  console.log('par', n)
}
await browser.close()
