// Capacitor Keyboard.resize=body escribe document.body.style.height y emite
// eventos DOM window, aun si visualViewport no cambia. No depende de cargar
// el proxy JS del plugin antes de que aparezca el teclado.
export function geometriaDialogoTeclado({ layoutHeight, visualHeight = layoutHeight, offsetTop = 0, keyboardHeight = 0, bodyHeight = 0 }) {
  const top = Math.max(0, offsetTop)
  const bodyReduced = bodyHeight > 0 && bodyHeight < layoutHeight - 80
  const bottom = bodyReduced ? bodyHeight : layoutHeight - keyboardHeight
  const available = Math.max(1, Math.min(visualHeight, bottom - top))
  return { height: available, top, visible: keyboardHeight > 0 || available < layoutHeight - 80 }
}

export function ajustarDialogoAlTeclado(form, { win = window } = {}) {
  const dialog = form?.closest('[role="dialog"]')
  if (!dialog) return () => {}
  const viewport = win.visualViewport
  // Conserva la altura anterior al teclado: algunos WebView reducen también
  // innerHeight. Restarle el teclado otra vez dejaría solo el encabezado.
  const layoutHeight = win.innerHeight
  let keyboardHeight = 0
  let active = true
  let frame = null
  const update = () => {
    frame = null
    if (!active) return
    const bodyHeight = Number.parseFloat(form.ownerDocument.body?.style.height) || 0
    const geometry = geometriaDialogoTeclado({ layoutHeight: Math.max(layoutHeight, win.innerHeight), visualHeight: viewport?.height || win.innerHeight, offsetTop: viewport?.offsetTop || 0, keyboardHeight, bodyHeight })
    dialog.dataset.tecladoVisible = String(geometry.visible)
    dialog.style.setProperty('--identidad-viewport-height', `${geometry.height}px`)
    dialog.style.setProperty('--identidad-viewport-top', `${geometry.top}px`)
    const focused = form.ownerDocument.activeElement
    const scroller = form.parentElement
    if (!geometry.visible || !form.contains(focused) || !focused.matches('input, textarea, select')) return
    const field = focused.getBoundingClientRect()
    const body = scroller.getBoundingClientRect()
    if (field.bottom > body.bottom - 8) scroller.scrollTop += field.bottom - body.bottom + 8
    else if (field.top < body.top + 8) scroller.scrollTop += field.top - body.top - 8
  }
  const schedule = () => {
    if (active && frame === null) frame = win.requestAnimationFrame(update)
  }
  const show = event => { keyboardHeight = Math.max(0, Number(event.keyboardHeight ?? event.detail?.keyboardHeight) || 0); schedule() }
  const hide = () => { keyboardHeight = 0; schedule() }
  viewport?.addEventListener('resize', schedule)
  viewport?.addEventListener('scroll', schedule)
  win.addEventListener('resize', schedule)
  form.addEventListener('focusin', schedule)
  for (const event of ['keyboardWillShow', 'keyboardDidShow']) win.addEventListener(event, show)
  for (const event of ['keyboardWillHide', 'keyboardDidHide']) win.addEventListener(event, hide)
  const observer = win.MutationObserver ? new win.MutationObserver(schedule) : null
  if (form.ownerDocument.body) observer?.observe(form.ownerDocument.body, { attributes: true, attributeFilter: ['style'] })
  update()
  return () => {
    active = false
    if (frame !== null) win.cancelAnimationFrame(frame)
    observer?.disconnect()
    viewport?.removeEventListener('resize', schedule)
    viewport?.removeEventListener('scroll', schedule)
    win.removeEventListener('resize', schedule)
    form.removeEventListener('focusin', schedule)
    for (const event of ['keyboardWillShow', 'keyboardDidShow']) win.removeEventListener(event, show)
    for (const event of ['keyboardWillHide', 'keyboardDidHide']) win.removeEventListener(event, hide)
    delete dialog.dataset.tecladoVisible
    dialog.style.removeProperty('--identidad-viewport-height')
    dialog.style.removeProperty('--identidad-viewport-top')
  }
}
