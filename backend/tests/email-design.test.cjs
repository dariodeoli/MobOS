// Offline rendering and source coverage. Never invoke transport or load environment files.
const ts = require('typescript')
const fs = require('node:fs')
const path = require('node:path')
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, file)
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('@playwright/test')
const email = require('../lib/email.ts')
const { construirEmailsPrueba } = require('../lib/emails-prueba.ts')
const out = '/tmp/mobos-email-design'
const fixtures = construirEmailsPrueba({ to: 'synthetic@example.test', ahora: new Date('2026-01-01T12:00:00Z') })
fixtures.push({ id: 'quote-approval-otp', ...email.quoteApprovalOtpEmail({ to: 'synthetic@example.test', customerName: 'Synthetic', number: 'QUOTE-001', code: '123456', minutes: 10, link: 'https://app.moboss.online/cotizacion/synthetic' }) })
const unsafe = '<script>alert("x")</script>'
fixtures.push({ id: 'stress-receipt', ...email.receiptEmail({ to: 'synthetic@example.test', companyName: unsafe, customerName: unsafe, orderNumber: 'X'.repeat(160), lines: [{ quantity: 1, description: 'S'.repeat(300) + unsafe, totalPyg: 100000000 }], totalPyg: 100000000, trackingUrl: 'https://app.moboss.online/p/' + 'a'.repeat(350) + '?a=1&b=2' }) })
fixtures.push({ id: 'stress-reset', ...email.passwordRecoveryEmail({ to: 'synthetic@example.test', companyName: 'Synthetic', token: 'r'.repeat(512) }) })
function ratio(a, b) {
  const lum = s => {
    const nums = s.match(/[\d.]+/g).slice(0, 3).map(Number).map(x => x / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4)
    return .2126 * nums[0] + .7152 * nums[1] + .0722 * nums[2]
  }
  const x = lum(a), y = lum(b)
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05)
}
test('all actual email builders use shared rendering and preserve escaped links/text', () => {
  const source = fs.readFileSync(path.join(__dirname, '../lib/email.ts'), 'utf8')
  const names = [...source.matchAll(/export function (\w+Email)\(/g)].map(m => m[1])
  assert.equal(names.length, 12)
  for (const name of names) {
    const body = source.slice(source.indexOf(`export function ${name}(`)).split('\nexport function ')[0]
    assert.ok(body.includes('template('), `${name} shared renderer`)
  }
  const entryFiles = ['lib/email-actions.ts', 'lib/user-invitations.ts', 'lib/email-notifications.ts', 'lib/quote-email.ts', 'lib/otp-transport.ts', 'app/api/orders/[orderId]/receipt-email/route.ts', 'app/api/quotes/[id]/message/route.ts', 'app/api/customers/[id]/device-report/route.ts']
  for (const file of entryFiles) assert.match(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), /from ['"].*\/email['"]/, file)
  for (const fixture of fixtures) {
    assert.match(fixture.html, /data-email-system="mobos-premium"/)
    assert.match(fixture.html, /class="email-logo-plate"/)
    assert.match(fixture.html, /aria-label="MobOS"/)
    assert.match(fixture.html, /bgcolor=/)
    for (const tag of fixture.html.match(/<(?:table|td|th)\s[^>]*>/g)) {
      assert.match(tag, /bgcolor=/)
      assert.match(tag, /(?:^|[;"])background(?:-color)?:/)
      assert.match(tag, /(?:^|[;"])color:/)
    }
    assert.doesNotMatch(fixture.html, /<img/, 'text logo requires no remote images')
    assert.ok(fixture.text.length > 100)
    assert.doesNotMatch(fixture.html, /<script|<svg|@import|fonts\.googleapis/)
  }
  const stress = fixtures.find(f => f.id === 'stress-receipt')
  assert.ok(!stress.html.includes(unsafe))
  assert.ok(stress.html.includes('&lt;script&gt;'))
  assert.ok(stress.html.includes('?a=1&amp;b=2'))
  assert.ok(stress.text.includes(unsafe), 'plain text preserves content without HTML execution')
  const token = 'f'.repeat(64)
  const recovery = email.passwordRecoveryEmail({ to: 'synthetic@example.test', companyName: 'Synthetic', token })
  assert.ok(recovery.text.includes(`/restablecer-contrasena/${token}`))
  assert.equal(recovery.subject, 'Recuperá tu contraseña de Synthetic')
})
test('offline all templates: both palettes contrast, mobile geometry and CTA targets', async () => {
  fs.mkdirSync(out, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const evidence = []
  try {
    for (const theme of ['light', 'dark']) for (const width of [320, 390, 800]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme, serviceWorkers: 'block' })
      await context.route('**/*', route => route.abort())
      const page = await context.newPage()
      for (const fixture of fixtures) {
        await page.setContent(fixture.html)
        assert.equal(await page.locator('[role=img][aria-label=MobOS]').count(), 1, 'images-off logo fallback')
        const values = await page.evaluate(() => {
          const text = [...document.querySelectorAll('body *')].filter(el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().height > 0 && !el.closest('.email-preheader') && !['STYLE','TITLE','SCRIPT'].includes(el.tagName))
          const bg = el => {
            for (let p = el; p; p = p.parentElement) { const c = getComputedStyle(p).backgroundColor; if (c !== 'rgba(0, 0, 0, 0)') return c }
            return 'rgb(255, 255, 255)'
          }
          return {
            overflow: document.documentElement.scrollWidth - innerWidth,
            clipped: [...document.querySelectorAll('td,th,a')].filter(el => [...el.childNodes].some(n => {
              if (n.nodeType !== 3 || !n.textContent.trim()) return false
              const range = document.createRange(); range.selectNodeContents(n)
              const box = el.getBoundingClientRect()
              return [...range.getClientRects()].some(r => r.right > box.right + 1 || r.left < box.left - 1)
            })).length,
            text: text.map(el => { const c = getComputedStyle(el); return { label: el.textContent.slice(0, 30), fg: c.color, bg: bg(el), size: parseFloat(c.fontSize), weight: parseInt(c.fontWeight) } }),
            cta: [...document.querySelectorAll('.email-cta a')].map(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })),
          }
        })
        assert.equal(values.clipped, 0, `${fixture.id} ${theme} ${width} no clipped text`)
        assert.equal(values.overflow, 0, `${fixture.id} ${theme} ${width} no overflow`)
        let min = 100
        for (const v of values.text) {
          const contrast = ratio(v.fg, v.bg); min = Math.min(min, contrast)
          const large = v.size >= 24 || (v.size >= 18.66 && v.weight >= 700)
          assert.ok(contrast >= (large ? 3 : 4.5), `${fixture.id} ${theme} ${width} ${v.label} contrast ${contrast.toFixed(2)} (${v.fg}/${v.bg})`)
        }
        for (const cta of values.cta) assert.ok(cta.width >= 44 && cta.height >= 44)
        evidence.push({ id: fixture.id, theme, width, overflow: values.overflow, clipped: values.clipped, minContrast: min })
        if ([390, 800].includes(width) && ['password-recovery', 'receipt', 'quote-approval-otp', 'stress-receipt', 'stress-reset'].includes(fixture.id)) await page.screenshot({ path: `${out}/${fixture.id}-${theme}-${width}.png`, fullPage: true })
        fs.writeFileSync(`${out}/${fixture.id}.html`, fixture.html)
      }
      if (theme === 'light' && width === 320) {
        for (const fixture of fixtures.filter(f => f.id.startsWith('stress-'))) {
          await page.setContent(fixture.html.replace(/<style>[\s\S]*?<\/style>/, ''))
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, `${fixture.id} inline-only fallback`)
        }
      }
      await context.close()
    }
  } finally { await browser.close() }
  fs.writeFileSync(`${out}/geometry.json`, JSON.stringify(evidence, null, 2))
})
