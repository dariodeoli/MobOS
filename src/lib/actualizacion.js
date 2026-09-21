// Aviso y actualización del shell PWA (#214). La app abierta puede quedarse con
// el bundle viejo aunque producción ya sirva otro (caso real .130 vs .131): se
// compara el bundle que cargó esta pestaña contra el que declara el index.html
// en vivo (sin caché) y, cuando cambian, se ofrece recargar.
//
// No toca el modo offline del POS (#131/#168): el service worker sigue con
// network-first para navegaciones y con la caché de catálogo para arrancar sin
// conexión; acá solo se agrega la detección y una recarga controlada.

const RE_BUNDLE = /\/assets\/index-[A-Za-z0-9_-]+\.js/

/** Bundle que cargó esta pestaña (en dev es `/src/main.jsx`, sin hash). */
export function bundleCargado() {
  try {
    const src = document.querySelector('script[type="module"][src]')?.getAttribute('src') || ''
    return RE_BUNDLE.exec(src)?.[0] || src
  } catch {
    return ''
  }
}

/** Bundle hasheado declarado en un HTML (null si no hay, p. ej. en dev). */
export function bundleEnHtml(html) {
  return RE_BUNDLE.exec(String(html || ''))?.[0] || null
}

/**
 * ¿El HTML servido apunta a un bundle distinto del cargado? Puro: sin red ni
 * DOM, para poder probarlo con `npm test`.
 */
export function esVersionNueva(bundleActual, html) {
  const nuevo = bundleEnHtml(html)
  return Boolean(nuevo) && Boolean(bundleActual) && nuevo !== bundleActual
}

/** Consulta el index.html sin caché y responde si hay un bundle nuevo. */
export async function hayVersionNueva() {
  const actual = bundleCargado()
  if (!actual) return false
  try {
    const respuesta = await fetch(`/index.html?_mobos_version=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'text/html' },
    })
    if (!respuesta.ok) return false
    const tipo = respuesta.headers.get('content-type') || ''
    if (!tipo.includes('text/html')) return false
    return esVersionNueva(actual, await respuesta.text())
  } catch {
    // Sin red (o respuesta rara) no se avisa: la app sigue usable.
    return false
  }
}

/**
 * Recarga controlada: si hay un service worker nuevo esperando se le pide
 * activarse (`SKIP_WAITING`) y se recarga al tomar el control; si no, se
 * recarga directo. Una sola recarga por gesto.
 */
export function aplicarVersionNueva() {
  let recargando = false
  const recargar = () => {
    if (recargando) return
    recargando = true
    window.location.reload()
  }
  try {
    const sw = navigator.serviceWorker
    if (!sw) {
      recargar()
      return
    }
    sw.addEventListener('controllerchange', recargar, { once: true })
    const registro = sw.getRegistration?.()
    if (!registro?.then) {
      window.setTimeout(recargar, 200)
      return
    }
    registro
      .then((instalado) => {
        instalado?.waiting?.postMessage({ type: 'SKIP_WAITING' })
        // Si no había SW esperando, la recarga no depende de controllerchange.
        window.setTimeout(recargar, 200)
      })
      .catch(() => window.setTimeout(recargar, 200))
  } catch {
    recargar()
  }
}
