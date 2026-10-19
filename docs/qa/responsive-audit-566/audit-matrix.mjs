import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const root = new URL('./captures/', import.meta.url)
const output = decodeURIComponent(root.pathname)
const scheme = process.env.MOBOS_AUDIT_SCHEME || 'https'
const urls = {
  landing: `${scheme}://moboss.online:5327/`,
  app: `${scheme}://app.moboss.online:5327`,
}
const viewports = [
  { width: 320, height: 800 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 414, height: 896 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
]

mkdirSync(output, { recursive: true })
const browser = await chromium.launch({
  headless: true,
  args: ['--host-resolver-rules=MAP moboss.online 127.0.0.1, MAP app.moboss.online 127.0.0.1'],
})
const results = {
  capturedAt: new Date().toISOString(),
  base: urls,
  viewports,
  cases: [],
  blockedRequests: [],
}

async function openPage(url, viewport, theme = 'light') {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile: viewport.width <= 414,
    hasTouch: viewport.width <= 414,
    colorScheme: theme,
    ignoreHTTPSErrors: true,
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  })
  await context.addInitScript(value => localStorage.setItem('mobos:theme', value), theme)
  await context.route('**/*', route => {
    const requestUrl = new URL(route.request().url())
    const allowedHost =
      requestUrl.hostname === 'moboss.online' || requestUrl.hostname === 'app.moboss.online'
    if (!allowedHost || requestUrl.pathname.startsWith('/api')) {
      results.blockedRequests.push(
        `${route.request().method()} ${requestUrl.hostname}${requestUrl.pathname}`,
      )
      return route.abort()
    }
    return route.continue()
  })
  const page = await context.newPage()
  page.on('pageerror', error =>
    results.cases.push({ kind: 'pageerror', viewport: viewport.width, message: error.message }),
  )
  return { context, page }
}

async function measure(page, kind, width) {
  return page.evaluate(
    ({ kind, width }) => {
      const visible = element => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity) > 0.02
        )
      }
      const rect = element => {
        const box = element.getBoundingClientRect()
        return {
          x: Math.round(box.x),
          y: Math.round(box.y),
          width: Math.round(box.width),
          height: Math.round(box.height),
          right: Math.round(box.right),
          bottom: Math.round(box.bottom),
        }
      }
      const isUserScrollable = element => {
        const ownOverflow = getComputedStyle(element).overflowX
        if (ownOverflow === 'auto' || ownOverflow === 'scroll') return true
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          const overflow = getComputedStyle(parent).overflowX
          if (overflow === 'auto' || overflow === 'scroll') return true
        }
        return false
      }
      const viewportWidth = innerWidth
      const overflow = Math.max(0, document.documentElement.scrollWidth - viewportWidth)
      const selectors =
        'button, a[href], input:not([type=hidden]), select, textarea, h1, h2, h3, table, img, [role=button], [data-testid]'
      const clipped = [...document.querySelectorAll(selectors)]
        .filter(visible)
        .filter(element => {
          if (isUserScrollable(element)) return false
          const box = element.getBoundingClientRect()
          return box.left < -1 || box.right > viewportWidth + 1
        })
        .filter(element => !element.closest('.sr-only,[aria-hidden="true"]'))
        .slice(0, 12)
        .map(element => ({
          tag: element.tagName.toLowerCase(),
          text: (element.textContent || element.getAttribute('aria-label') || '')
            .trim()
            .replace(/\s+/g, ' ')
            .slice(0, 60),
          rect: rect(element),
          testId: element.getAttribute('data-testid'),
        }))
      const textClips = [
        ...document.querySelectorAll(
          'button, a[href], input, select, textarea, h1, h2, h3, [data-testid]',
        ),
      ]
        .filter(visible)
        .filter(element => {
          if (element.closest('.sr-only,[aria-hidden="true"]') || isUserScrollable(element))
            return false
          const style = getComputedStyle(element)
          return (
            element.scrollWidth > element.clientWidth + 1 &&
            /(hidden|clip)/.test(`${style.overflowX} ${style.textOverflow}`)
          )
        })
        .slice(0, 15)
        .map(element => ({
          tag: element.tagName.toLowerCase(),
          text: (element.textContent || element.getAttribute('aria-label') || '')
            .trim()
            .replace(/\s+/g, ' ')
            .slice(0, 60),
          client: element.clientWidth,
          scroll: element.scrollWidth,
          testId: element.getAttribute('data-testid'),
        }))
      const controls = [
        ...document.querySelectorAll(
          'button, a[href], input:not([type=hidden]), select, textarea, [role=button]',
        ),
      ]
        .filter(visible)
        .filter(element => !element.closest('.sr-only,[aria-hidden="true"]'))
        .map(element => {
          const box = element.getBoundingClientRect()
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
          if (hit && hit !== element && !element.contains(hit) && !hit.contains(element))
            return null
          const label = (
            element.textContent ||
            element.getAttribute('aria-label') ||
            element.getAttribute('placeholder') ||
            element.getAttribute('title') ||
            ''
          )
            .trim()
            .replace(/\s+/g, ' ')
            .slice(0, 50)
          const touchBox =
            element.matches('input[type=checkbox],input[type=radio]') && element.labels?.[0]
              ? element.labels[0].getBoundingClientRect()
              : box
          return {
            label,
            width: Math.round(Math.max(box.width, touchBox.width)),
            height: Math.round(Math.max(box.height, touchBox.height)),
            rect: rect(element),
          }
        })
      const smallTargets =
        width <= 768
          ? controls
              .filter(Boolean)
              .filter(item => item.width < 44 || item.height < 44)
              .slice(0, 20)
          : []
      const headerSelectors =
        kind === 'landing'
          ? '.landing-header,.landing-nav'
          : '[data-testid=shell-mobile-header],[data-testid=shell-header],[data-testid=shell-lateral],header,[role=banner]'
      const headers = [...document.querySelectorAll(headerSelectors)]
        .filter(visible)
        .slice(0, 5)
        .map(element => ({
          testId: element.getAttribute('data-testid'),
          className: typeof element.className === 'string' ? element.className.slice(0, 90) : '',
          position: getComputedStyle(element).position,
          zIndex: getComputedStyle(element).zIndex,
          rect: rect(element),
        }))
      const overlays = [
        ...document.querySelectorAll(
          '[role=dialog],[aria-modal=true],[data-testid*=drawer],[data-testid*=hoja],.fixed,[class*=fixed]',
        ),
      ]
        .filter(visible)
        .filter(element => {
          const style = getComputedStyle(element)
          return style.position === 'fixed' || style.position === 'sticky'
        })
        .slice(0, 15)
        .map(element => ({
          role: element.getAttribute('role'),
          testId: element.getAttribute('data-testid'),
          className: typeof element.className === 'string' ? element.className.slice(0, 100) : '',
          position: getComputedStyle(element).position,
          zIndex: getComputedStyle(element).zIndex,
          rect: rect(element),
        }))
      const overlayCollisions = overlays.flatMap(overlay => {
        const layer =
          document.querySelector(`[data-testid="${overlay.testId}"]`) ||
          [...document.querySelectorAll('.fixed,[class*=fixed]')].find(element => {
            const box = element.getBoundingClientRect()
            return (
              Math.round(box.x) === overlay.rect.x &&
              Math.round(box.y) === overlay.rect.y &&
              Math.round(box.width) === overlay.rect.width &&
              Math.round(box.height) === overlay.rect.height
            )
          })
        if (!layer) return []
        const layerBox = layer.getBoundingClientRect()
        return [...document.querySelectorAll('h1,h2,h3,button,a[href],input,select,textarea')]
          .filter(visible)
          .filter(element => !layer.contains(element))
          .filter(element => {
            const box = element.getBoundingClientRect()
            return (
              box.left < layerBox.right &&
              box.right > layerBox.left &&
              box.top < layerBox.bottom &&
              box.bottom > layerBox.top
            )
          })
          .slice(0, 8)
          .map(element => ({
            overlay: overlay.testId || overlay.className,
            target: (element.textContent || element.getAttribute('aria-label') || '')
              .trim()
              .replace(/\s+/g, ' ')
              .slice(0, 60),
            targetRect: rect(element),
            overlayRect: overlay.rect,
          }))
      })
      const horizontalScrollRegions = [...document.querySelectorAll('*')]
        .filter(visible)
        .filter(element => {
          const style = getComputedStyle(element)
          return (
            ['auto', 'scroll'].includes(style.overflowX) &&
            element.scrollWidth > element.clientWidth + 2
          )
        })
        .slice(0, 12)
        .map(element => ({
          testId: element.getAttribute('data-testid'),
          className: typeof element.className === 'string' ? element.className.slice(0, 90) : '',
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          text: (element.innerText || '').replace(/\s+/g, ' ').slice(0, 60),
          rect: rect(element),
        }))
      return {
        viewport: { width: viewportWidth, height: innerHeight },
        document: {
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          overflowX: overflow,
        },
        clipped,
        textClips,
        touchTargets: { below44Count: smallTargets.length, below44: smallTargets },
        header: headers,
        overlays,
        overlayCollisions,
        horizontalScrollRegions,
        controls: controls.length,
        scrollY,
        pageTitle: document.querySelector('h1')?.innerText?.trim() || document.title,
      }
    },
    { kind, width },
  )
}

async function saveCase(page, { kind, name, width, state, fullPage = false }) {
  const metrics = await measure(page, kind, width)
  const filename = `${kind}-${width}-${state}${fullPage ? '-full' : ''}.png`
  if (!process.env.AUDIT_NO_SCREENSHOTS)
    await page.screenshot({ path: `${output}/${filename}`, fullPage, timeout: 90000 })
  const result = {
    kind,
    name,
    width,
    state,
    ...(!process.env.AUDIT_NO_SCREENSHOTS ? { image: `captures/${filename}` } : {}),
    ...metrics,
  }
  results.cases.push(result)
  return result
}

try {
  for (const viewport of viewports) {
    const width = viewport.width

    const landing = await openPage(urls.landing, viewport)
    await landing.page.goto(urls.landing, { waitUntil: 'networkidle', timeout: 30000 })
    await landing.page.evaluate(() => document.fonts.ready)
    await landing.page.getByRole('heading', { level: 1 }).waitFor({ timeout: 15000 })
    await saveCase(landing.page, {
      kind: 'landing',
      name: 'Landing pública',
      width,
      state: 'initial',
    })
    if (width <= 1023) {
      const toggle = landing.page.getByRole('button', { name: 'Abrir menú' })
      if (await toggle.isVisible()) {
        await toggle.click()
        await landing.page.locator('#menu-movil').waitFor({ state: 'visible' })
        await saveCase(landing.page, {
          kind: 'landing',
          name: 'Landing pública',
          width,
          state: 'menu-open',
        })
      }
    }
    if ([390, 768, 1440].includes(width)) {
      const anchors = [
        ['#imei', landing.page.locator('#imei')],
        ['#precio', landing.page.locator('#precio')],
        ['faq', landing.page.locator('section').filter({ hasText: 'Preguntas rápidas' }).first()],
        ['#demo', landing.page.locator('#demo')],
      ]
      for (const [name, section] of anchors) {
        if (await section.count()) {
          await section.scrollIntoViewIfNeeded()
          await landing.page.waitForTimeout(100)
          await saveCase(landing.page, {
            kind: 'landing',
            name: 'Landing pública',
            width,
            state: `section-${name.replace('#', '')}`,
          })
        }
      }
    }
    await landing.context.close()

    const app = await openPage(urls.app, viewport)
    await app.page.goto(`${urls.app}/demo`, { waitUntil: 'networkidle', timeout: 30000 })
    await app.page.getByRole('button', { name: /^Entrar como Dueño/ }).click()
    await app.page.getByTestId('shell').waitFor({ state: 'visible', timeout: 20000 })
    await app.page.goto(`${urls.app}/resumen`, { waitUntil: 'networkidle', timeout: 30000 })
    await app.page.getByTestId('shell').waitFor({ state: 'visible', timeout: 15000 })
    await saveCase(app.page, {
      kind: 'app',
      name: 'Resumen con shell de tienda demo',
      width,
      state: 'resumen',
    })
    await app.page.goto(`${urls.app}/pos`, { waitUntil: 'networkidle', timeout: 30000 })
    await app.page.getByTestId('shell').waitFor({ state: 'visible', timeout: 15000 })
    await saveCase(app.page, {
      kind: 'app',
      name: 'POS con shell de tienda demo',
      width,
      state: 'pos',
    })
    if (width <= 1023) {
      const more = app.page.getByTestId('shell-mas')
      if ((await more.count()) && (await more.isVisible())) {
        await more.click()
        await app.page.getByTestId('shell-mas-hoja').waitFor({ state: 'visible' })
        await saveCase(app.page, {
          kind: 'app',
          name: 'POS con shell de tienda demo',
          width,
          state: 'more-open',
        })
      }
    }
    await app.context.close()
  }

  await writeFileSync(`${output}/../coverage.json`, `${JSON.stringify(results, null, 2)}\n`)
  console.log(
    JSON.stringify(
      {
        cases: results.cases.filter(item => item.document).length,
        pageErrors: results.cases.filter(item => item.kind === 'pageerror'),
        blockedRequests: [...new Set(results.blockedRequests)],
        caseSummary: results.cases
          .filter(item => item.document)
          .map(
            ({
              kind,
              width,
              state,
              document,
              clipped,
              textClips,
              touchTargets,
              header,
              overlays,
              overlayCollisions,
              horizontalScrollRegions,
            }) => ({
              kind,
              width,
              state,
              overflowX: document.overflowX,
              clipped: clipped.length,
              textClips: textClips.length,
              undersizedTargets: touchTargets.below44Count,
              header,
              overlays: overlays.length,
              overlayCollisions: overlayCollisions.length,
              horizontalScrollRegions: horizontalScrollRegions.length,
            }),
          ),
      },
      null,
      2,
    ),
  )
} finally {
  await browser.close()
}
