// Pasos de captura compartidos por la web móvil (Playwright) y la app de iPhone
// (simulador, vía scripts/ios-paridad-puente.mjs). Cada paso corre DENTRO de la
// página (JS en cadena) para que ambas plataformas hagan exactamente lo mismo.
// El `prelude` define window.__p con helpers.

export const prelude = `
if (!window.__p) {
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const buscar = (sel, texto) => {
    const lista = [...document.querySelectorAll(sel)].filter(visible)
    if (texto === undefined) return lista[0] || null
    return lista.find((el) => (el.textContent || '').trim() === texto || el.getAttribute('aria-label') === texto) || null
  }
  const esperar = async (fn, ms = 8000) => {
    const fin = Date.now() + ms
    while (Date.now() < fin) { const v = fn(); if (v) return v; await dormir(100) }
    throw new Error('timeout esperando: ' + fn)
  }
  window.__p = {
    dormir, buscar, esperar,
    ios: !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()),
    async click(sel, texto) { const el = await esperar(() => buscar(sel, texto)); el.click(); await dormir(450) },
    async clickSiExiste(sel, texto) { const el = buscar(sel, texto); if (el) { el.click(); await dormir(450) } },
    async nav(ruta) { history.pushState(null, '', ruta); dispatchEvent(new PopStateEvent('popstate')); await dormir(900) },
    tid(id) { return document.querySelector('[data-testid="' + id + '"]') },
    async esperarTid(id) { return esperar(() => { const el = document.querySelector('[data-testid="' + id + '"]'); return el && visible(el) ? el : null }) },
    async quitarAvisosNativos() { await dormir(600); await this.clickSiExiste('button', 'Ahora no') },
  }
}
`

const entrarDemo = `
  const p = window.__p
  await p.esperarTid('shell')
  await p.quitarAvisosNativos()
`

// `ios: true` = solo en el simulador, `web: true` = solo en la web.
export const pasos = [
  { nombre: '00-ingreso', js: `const p = window.__p; if (!p.ios) { await p.nav('/login') } await p.esperar(() => p.buscar('button', 'Continuar'), 15000).catch(() => null); await p.dormir(500)` },
  { nombre: '01-inicio-pin', js: `const p = window.__p; if (p.ios) { await p.click('button, a, [role=button]', 'Probar la demo') } else { location.assign('/demo'); await p.dormir(1500) } await p.esperar(() => p.buscar('button', 'Entrar como Dueño'))` },
  // Entrar a la demo recarga la página: el clic se agenda y el paso termina antes.
  { nombre: '01b-entrar', silencioso: true, espera: 5000, js: `const p = window.__p; const b = await p.esperar(() => p.buscar('button', 'Entrar como Dueño')); setTimeout(() => b.click(), 50); return true` },
  { nombre: '02-inicio', js: `${entrarDemo}; await p.nav('/resumen'); await p.esperarTid('resumen-indicadores')` },
  { nombre: '03-vender-catalogo', js: `const p = window.__p; await p.click('[data-testid="shell-bottom-nav"] button', 'Vender'); await p.esperarTid('pos-bloque-productos'); window.scrollTo(0, 0)` },
  { nombre: '04-vender-carrito', js: `const p = window.__p
    const tarjeta = await p.esperar(() => [...document.querySelectorAll('.pos-product-card')].find((c) => c.textContent.includes('Cargador USB-C 20W')))
    tarjeta.click(); await p.dormir(600); await p.click('[data-testid="pos-barra-carrito-abrir"]'); await p.esperarTid('hoja-carrito'); await p.dormir(500)` },
  { nombre: '05-vender-cobro', js: `const p = window.__p; await p.click('[data-testid="carrito-cobrar"]'); await p.esperarTid('cobro-movil'); await p.dormir(500)` },
  { nombre: '06-pedidos-lista', js: `const p = window.__p; await p.click('[role="dialog"] button', 'Cerrar'); await p.nav('/pedidos'); await p.esperarTid('pedido-fila'); await p.dormir(500)` },
  { nombre: '07-pedido-detalle', js: `const p = window.__p; await p.click('[data-testid="pedido-fila"]'); await p.dormir(900)` },
  { nombre: '08-clientes-lista', js: `const p = window.__p; if (history.length) { await p.nav('/clientes') } await p.esperar(() => document.body.innerText.includes('Clientes')); await p.dormir(700)` },
  { nombre: '09-cliente-ficha', js: `const p = window.__p; const fila = document.querySelector('main [role="row"], main li button, main a[href*="/clientes/"], [data-testid^="cliente"]'); if (fila) { fila.click() } await p.dormir(1100)` },
  { nombre: '10-stock', js: `const p = window.__p; await p.nav('/stock'); await p.dormir(900)` },
  { nombre: '11-finanzas', js: `const p = window.__p; await p.nav('/finanzas'); await p.dormir(900)` },
  { nombre: '12-configuracion', js: `const p = window.__p; await p.nav('/configuracion'); await p.dormir(900)` },
  { nombre: '13-modulos', js: `const p = window.__p; await p.nav('/configuracion/modulos'); await p.dormir(900)` },
  { nombre: '14-popup-datos-cliente', js: `const p = window.__p; await p.click('[data-testid="shell-bottom-nav"] button', 'Vender'); await p.esperarTid('pos-bloque-productos'); window.scrollTo(0, 0); await p.dormir(400)
    const b = await p.esperar(() => [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === 'Agregar cliente' && x.getBoundingClientRect().width > 0)); b.click(); await p.dormir(1200)` },
  { nombre: '15-menu-mas', js: `const p = window.__p; await p.clickSiExiste('[role="dialog"] button', 'Cerrar'); await p.click('[data-testid="shell-bottom-nav"] button', 'Más'); await p.dormir(700)` },
]
