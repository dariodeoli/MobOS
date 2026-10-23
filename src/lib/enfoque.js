// Foco y desplazamiento global (Dario, 23-10-2026).
//  - Todo campo que recibe el foco en móvil queda en la mitad superior del área
//    visible (encima del teclado), usando visualViewport; también dentro del
//    cuerpo con scroll de un Popup.
//  - Al abrir una sección o un campo (disclosure, «+ Agregar dirección»,
//    «Facturar a otro titular», «Agregar nota»…) se desplaza hasta ella y se
//    enfoca el primer campo.
//  - Respeta prefers-reduced-motion (sin animación) y no toca los campos
//    marcados con `data-sin-autoscroll` (escáner del POS).
const CAMPO = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable=""], [contenteditable="true"]'
const ES_CAMPO = 'input, select, textarea, [contenteditable=""], [contenteditable="true"]'
const NO_TOCAR = '[data-sin-autoscroll]'
const DIALOGO = '[role="dialog"], [role="alertdialog"]'

// Geometría pura: cuánto hay que desplazar para que el campo quede en la
// mitad superior del área visible (0 si ya está). `minTop` evita encabezados fijos.
export function desplazamientoParaMitadSuperior({ campoTop, campoBottom, visibleTop, visibleHeight, minTop = 72 }) {
  const objetivo = visibleTop + Math.min(Math.max(minTop, visibleHeight * 0.16), visibleHeight * 0.3)
  const limite = visibleTop + visibleHeight * 0.5
  const fuera = campoTop < visibleTop + 8 || campoBottom > limite
  return fuera ? campoTop - objetivo : 0
}

export function sinMovimiento(win = window) {
  return Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

function esMovil(win) {
  const ancho = win.visualViewport?.width || win.innerWidth
  return ancho < 768 || Boolean(win.matchMedia?.('(pointer: coarse)').matches)
}

function ancestroScroll(el, win) {
  let a = el.parentElement
  while (a && a !== win.document.body && a !== win.document.documentElement) {
    const s = win.getComputedStyle(a)
    if (['auto', 'scroll'].includes(s.overflowY) && a.scrollHeight > a.clientHeight + 1) return a
    a = a.parentElement
  }
  return null
}

function areaVisible(win) {
  const vv = win.visualViewport
  return { top: vv?.offsetTop || 0, height: vv?.height || win.innerHeight }
}

// Deja `el` en la mitad superior del área visible. Con `forzar`, también en
// escritorio lo trae a la vista (apertura de una sección).
export function ubicarEnMitadSuperior(el, { win = window, forzar = false } = {}) {
  if (!el?.isConnected || el.closest?.(NO_TOCAR)) return false
  const movil = esMovil(win)
  if (!movil && !forzar) return false
  const { top: visibleTop, height: visibleHeight } = areaVisible(win)
  const comportamiento = sinMovimiento(win) ? 'auto' : 'smooth'
  const r = el.getBoundingClientRect()
  const scroller = ancestroScroll(el, win)
  if (scroller) {
    const s = scroller.getBoundingClientRect()
    const top = Math.max(s.top, visibleTop)
    const alto = Math.max(1, Math.min(s.bottom, visibleTop + visibleHeight) - top)
    const delta = movil
      ? desplazamientoParaMitadSuperior({ campoTop: r.top, campoBottom: r.bottom, visibleTop: top, visibleHeight: alto, minTop: 8 })
      : (r.bottom > top + alto - 8 ? r.bottom - (top + alto) + 16 : r.top < top + 8 ? r.top - top - 16 : 0)
    if (Math.abs(delta) > 1) scroller.scrollBy({ top: delta, behavior: comportamiento })
    return true
  }
  const delta = movil
    ? desplazamientoParaMitadSuperior({ campoTop: r.top, campoBottom: r.bottom, visibleTop, visibleHeight })
    : (r.bottom > visibleHeight - 8 ? r.bottom - visibleHeight + 16 : r.top < 72 ? r.top - 88 : 0)
  if (Math.abs(delta) > 1) win.scrollBy({ top: delta, behavior: comportamiento })
  return true
}

// Relleno inferior (`html.teclado-abierto`, ver index.css): iOS no redimensiona
// el layout con el teclado y un campo bajo no tendría recorrido para subir.
function aplicarRelleno(win) {
  const vv = win.visualViewport
  if (!vv) return
  const teclado = Math.max(0, win.innerHeight - vv.height - (vv.offsetTop || 0))
  const raiz = win.document.documentElement
  if (teclado > 80) raiz.style.setProperty('--teclado-alto', `${Math.round(teclado)}px`)
  else raiz.style.removeProperty('--teclado-alto')
  raiz.classList.toggle('teclado-abierto', teclado > 80)
}

export function enfocarPrimerCampo(contenedor, { win = window } = {}) {
  const campo = [...contenedor.querySelectorAll(CAMPO)].find(c => !c.closest(NO_TOCAR) && c.offsetParent !== null && !c.readOnly)
  if (!campo) return false
  try { campo.focus({ preventScroll: true }) } catch { campo.focus() }
  ubicarEnMitadSuperior(campo, { win, forzar: true })
  return true
}

// Instala los listeners una sola vez (shell, páginas y Popup comparten document).
export function instalarEnfoque(win = window) {
  if (!win?.document || win.__mobosEnfoque) return () => {}
  win.__mobosEnfoque = true
  const doc = win.document
  let frame = 0
  const reubicar = () => {
    win.cancelAnimationFrame(frame)
    frame = win.requestAnimationFrame(() => {
      aplicarRelleno(win)
      const a = doc.activeElement
      if (a?.matches?.(ES_CAMPO)) ubicarEnMitadSuperior(a, { win })
    })
  }
  const alEnfocar = e => {
    const el = e.target
    if (!(el instanceof win.Element) || !el.matches(ES_CAMPO)) return
    aplicarRelleno(win)
    ubicarEnMitadSuperior(el, { win })
    // El teclado tarda en aparecer: reubica cuando ya cambió el área visible.
    setTimeout(() => { if (doc.activeElement === el) { aplicarRelleno(win); ubicarEnMitadSuperior(el, { win }) } }, 320)
  }
  doc.addEventListener('focusin', alEnfocar, true)
  win.visualViewport?.addEventListener('resize', reubicar)
  win.visualViewport?.addEventListener('scroll', reubicar)

  // Apertura de secciones: tras un clic en un botón, si en 700 ms aparece un
  // bloque con campos, se desplaza hasta él y se enfoca el primero.
  let observador = null
  let cierre = 0
  const detener = () => { observador?.disconnect(); observador = null; clearTimeout(cierre) }
  const alClic = e => {
    const boton = e.target instanceof win.Element ? e.target.closest('button, summary, [role="button"], [aria-expanded]') : null
    if (!boton || boton.closest(NO_TOCAR)) return
    detener()
    const antes = new Set(doc.querySelectorAll(CAMPO))
    const dialogoAntes = boton.closest(DIALOGO)
    const rutaAntes = win.location.pathname + win.location.search
    const revisar = () => {
      // Un clic que navega (abrir un pedido, una ficha) no es abrir una sección:
      // los campos de la pantalla nueva no roban el foco ni abren el teclado.
      if (win.location.pathname + win.location.search !== rutaAntes) { detener(); return }
      const nuevo = [...doc.querySelectorAll(CAMPO)].find(c => !antes.has(c) && c.offsetParent !== null && !c.closest(NO_TOCAR) && !c.readOnly &&
        !boton.contains(c) && c.closest(DIALOGO) === dialogoAntes)
      if (!nuevo) return
      detener()
      const activo = doc.activeElement
      // Si el usuario ya está escribiendo en otro campo, no le roba el foco.
      if (activo && activo !== doc.body && activo.matches?.(ES_CAMPO) && !boton.contains(activo)) return
      const bloque = nuevo.closest('[data-seccion], fieldset, section') || nuevo.parentElement
      win.requestAnimationFrame(() => enfocarPrimerCampo(bloque.contains(nuevo) ? bloque : nuevo.parentElement, { win }))
    }
    observador = new win.MutationObserver(revisar)
    observador.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class', 'style', 'open'] })
    cierre = setTimeout(detener, 700)
    setTimeout(revisar, 0)
  }
  doc.addEventListener('click', alClic, true)
  return () => {
    detener()
    doc.removeEventListener('focusin', alEnfocar, true)
    doc.removeEventListener('click', alClic, true)
    win.visualViewport?.removeEventListener('resize', reubicar)
    win.visualViewport?.removeEventListener('scroll', reubicar)
    delete win.__mobosEnfoque
  }
}
