import { chromium } from '@playwright/test'

const browser = await chromium.launch({
  headless: true,
  args: ['--host-resolver-rules=MAP moboss.online 127.0.0.1, MAP app.moboss.online 127.0.0.1'],
})
const cases = [
  {
    host: 'moboss.online',
    path: '/',
    width: 320,
    height: 800,
    name: 'consent-320-landing-after.png',
  },
  {
    host: 'app.moboss.online',
    path: '/demo',
    width: 390,
    height: 844,
    name: 'consent-390-demo-after.png',
  },
  {
    host: 'moboss.online',
    path: '/',
    width: 768,
    height: 1024,
    name: 'consent-768-landing-after.png',
  },
  {
    host: 'moboss.online',
    path: '/',
    width: 1440,
    height: 900,
    name: 'consent-1440-landing-after.png',
  },
]
try {
  for (const item of cases) {
    const context = await browser.newContext({
      viewport: { width: item.width, height: item.height },
      ignoreHTTPSErrors: true,
      serviceWorkers: 'block',
      colorScheme: 'light',
    })
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (
        !['moboss.online', 'app.moboss.online'].includes(url.hostname) ||
        url.pathname.startsWith('/api')
      )
        return route.abort()
      return route.continue()
    })
    const page = await context.newPage()
    await page.goto(`https://${item.host}:5327${item.path}`, { waitUntil: 'domcontentloaded' })
    const notice = page.getByTestId('aviso-metricas')
    await notice.waitFor({ state: 'visible', timeout: 15000 })
    await notice.screenshot({
      path: new URL(`./captures/${item.name}`, import.meta.url).pathname,
      timeout: 90000,
    })
    await context.close()
  }
} finally {
  await browser.close()
}
