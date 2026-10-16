import { isNativeIOS } from '../plataforma.js'

// Keyboard.resize=body deja intacto el layout viewport de la WebView. El
// diálogo fijo necesita el menor espacio de visualViewport y teclado nativo.
export function geometriaDialogoTeclado({ layoutHeight, visualHeight = layoutHeight, offsetTop = 0, keyboardHeight = 0 }) {
  const top = Math.max(0, offsetTop)
  const available = Math.max(1, Math.min(visualHeight, layoutHeight - keyboardHeight - top))
  return { height: available, top, visible: keyboardHeight > 0 || available < layoutHeight - 80 }
}

export function ajustarDialogoAlTeclado(form, { win = window, native = isNativeIOS(), loadKeyboard = () => import('@capacitor/keyboard').then(module => module.Keyboard) } = {}) {
  const dialog = form?.closest('[role="dialog"]')
  if (!dialog) return () => {}
  const viewport = win.visualViewport
  let keyboardHeight = 0
  let active = true
  let frame = null
  const handles = []
  const update = () => {
    frame = null
    if (!active) return
    const layoutHeight = win.innerHeight
    const geometry = geometriaDialogoTeclado({ layoutHeight, visualHeight: viewport?.height || layoutHeight, offsetTop: viewport?.offsetTop || 0, keyboardHeight })
    dialog.dataset.tecladoVisible = String(geometry.visible)
    dialog.style.setProperty('--identidad-viewport-height', `${geometry.height}px`)
    dialog.style.setProperty('--identidad-viewport-top', `${geometry.top}px`)
    // Reutiliza el cuerpo desplazable del Modal, sin mover el fondo ni crear
    // otro scroll/focus trap. Solo mantiene a la vista el campo enfocado.
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
  viewport?.addEventListener('resize', schedule)
  viewport?.addEventListener('scroll', schedule)
  win.addEventListener('resize', schedule)
  form.addEventListener('focusin', schedule)
  update()
  if (native) {
    loadKeyboard().then(async keyboard => {
      for (const event of ['keyboardWillShow', 'keyboardDidShow', 'keyboardWillHide', 'keyboardDidHide']) {
        if (!active) return
        const handle = await keyboard.addListener(event, info => {
          keyboardHeight = event.endsWith('Hide') ? 0 : Math.max(0, Number(info.keyboardHeight) || 0)
          schedule()
        })
        if (active) handles.push(handle)
        else await handle.remove()
      }
    }).catch(error => { if (active) console.error('[nativo] no se pudo observar el teclado del diálogo:', error) })
  }
  return () => {
    active = false
    if (frame !== null) win.cancelAnimationFrame(frame)
    viewport?.removeEventListener('resize', schedule)
    viewport?.removeEventListener('scroll', schedule)
    win.removeEventListener('resize', schedule)
    form.removeEventListener('focusin', schedule)
    for (const handle of handles) Promise.resolve().then(() => handle.remove()).catch(error => console.error('[nativo] no se pudo liberar el teclado:', error))
    delete dialog.dataset.tecladoVisible
    dialog.style.removeProperty('--identidad-viewport-height')
    dialog.style.removeProperty('--identidad-viewport-top')
  }
}
