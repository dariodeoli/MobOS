// Papel físico y área útil de la ZKP8008: 8 puntos/mm, sin reducir tipografía.
export function areaTermica(ancho) {
  if (![58, 80].includes(Number(ancho))) throw Error('Papel térmico no compatible.')
  const papelMm = Number(ancho),
    utilMm = papelMm === 80 ? 72 : 48
  return {
    papelMm,
    utilMm,
    margenMm: (papelMm - utilMm) / 2,
    dots: utilMm * 8,
    papelDots: papelMm * 8,
    css: (papelMm * 96) / 25.4,
  }
}
export function htmlConAreaTermica(html, formato) {
  const ancho = formato === 'thermal-80' ? 80 : formato === 'thermal-58' ? 58 : null
  if (!ancho) return html
  const { papelMm, utilMm, margenMm } = areaTermica(ancho)
  const css = `<style data-area-termica="${ancho}">@page{size:${papelMm}mm auto;margin:0}html{width:${papelMm}mm!important;min-height:0!important;height:auto!important;padding:0!important;margin:0!important;background:#fff}body{box-sizing:border-box!important;width:${utilMm}mm!important;max-width:${utilMm}mm!important;min-width:0!important;min-height:0!important;height:auto!important;margin-left:${margenMm}mm!important;margin-right:${margenMm}mm!important}@media print{body{margin-left:${margenMm}mm!important;margin-right:${margenMm}mm!important}}</style>`
  return html.replace('</head>', css + '</head>')
}
