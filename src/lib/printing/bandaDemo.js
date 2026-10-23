// Demo: los documentos que se imprimen desde el navegador salen con datos
// ficticios y una banda «Demo» arriba, para que nadie los confunda con un
// comprobante real. Puro: recibe el HTML y devuelve el HTML con la banda.
export const TEXTO_BANDA_DEMO = 'Demo · datos ficticios, sin valor'

const BANDA = `<div class="banda-demo" role="note" style="margin:0 0 8px;padding:4px 8px;border:1px dashed #b45309;border-radius:4px;background:#fef3c7;color:#92400e;font:700 11px/1.3 system-ui,sans-serif;letter-spacing:.06em;text-align:center;text-transform:uppercase;-webkit-print-color-adjust:exact;print-color-adjust:exact">${TEXTO_BANDA_DEMO}</div>`

export function conBandaDemo(html) {
  const texto = String(html || '')
  if (texto.includes('class="banda-demo"')) return texto
  if (/<body[^>]*>/i.test(texto)) return texto.replace(/<body([^>]*)>/i, (coincidencia) => `${coincidencia}${BANDA}`)
  return `${BANDA}${texto}`
}
