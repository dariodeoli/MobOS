import { APP_NAME, APP_VERSION } from '@/lib/brand'
import { landingStructuredData, resolvePageMetadata } from '@/lib/metadataPolicy'

const STRUCTURED_DATA_ID = 'mobos-structured-data'

function setMeta(selector, value) {
  document.head.querySelector(selector)?.setAttribute('content', value)
}

function syncStructuredData(landing) {
  const current = document.getElementById(STRUCTURED_DATA_ID)
  if (!landing) {
    current?.remove()
    return
  }

  const script = current || document.createElement('script')
  script.id = STRUCTURED_DATA_ID
  script.type = 'application/ld+json'
  script.textContent = JSON.stringify(landingStructuredData(APP_NAME))
  if (!current) document.head.appendChild(script)
}

export function applyPageMetadata({ pathname, publicPage }) {
  const metadata = resolvePageMetadata({ pathname, publicPage, appName: APP_NAME })
  document.title = metadata.title

  document.head.querySelector('link[rel="canonical"]')?.setAttribute('href', metadata.canonical)
  const version = APP_VERSION.replace(/^v/, '')
  document.head.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], link[rel="mask-icon"]').forEach((link) => {
    const href = link.getAttribute('href')?.split('?')[0]
    if (href) link.setAttribute('href', `${href}?v=${version}`)
  })
  setMeta('meta[property="og:url"]', metadata.canonical)
  setMeta('meta[property="og:title"]', metadata.title)
  setMeta('meta[property="og:description"]', metadata.description)
  setMeta('meta[property="og:image"]', metadata.socialImage)
  setMeta('meta[property="og:image:secure_url"]', metadata.socialImage)
  setMeta('meta[name="twitter:title"]', metadata.title)
  setMeta('meta[name="twitter:description"]', metadata.description)
  setMeta('meta[name="twitter:image"]', metadata.socialImage)
  setMeta('meta[name="description"]', metadata.description)
  setMeta('meta[name="robots"]', metadata.robots)
  syncStructuredData(metadata.landing)
}
