// Imprime HTML abriendo un iframe oculto en la misma página, sin ventanas
// emergentes: evita popups bloqueados (ventana about:blank vacía).

export function printHtml(html) {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument || frame.contentWindow?.document
  if (!doc) {
    frame.remove()
    return false
  }
  doc.open()
  doc.write(html)
  doc.close()
  window.setTimeout(() => {
    try {
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
    } catch {
      /* el usuario puede imprimir con Ctrl+P */
    }
    window.setTimeout(() => frame.remove(), 60000)
  }, 150)
  return true
}
