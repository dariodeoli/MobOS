// Milímetros físicos: ni la orientación ni el zoom cambian el medio alimentado.
export const MM_A_PX = 96 / 25.4
export const mmAPuntos = mm => (mm * 72) / 25.4
export const redondearMm = n => Math.round(n * 100) / 100
export function paginaFisica(definition) {
  const { page, elements } = definition
  return {
    widthMm: page.widthMm,
    heightMm:
      page.heightMm ??
      Math.max(1, ...elements.filter(e => e.visible).map(e => e.yMm + e.heightMm)) +
        page.margins.bottom,
  }
}
export function rotacionElemento(element, page) {
  const rotation = (element.rotation + page.orientation) % 360
  const swapped = rotation === 90 || rotation === 270
  return {
    widthMm: swapped ? element.heightMm : element.widthMm,
    heightMm: swapped ? element.widthMm : element.heightMm,
    rotation,
    transform:
      rotation === 90
        ? `translate(${element.widthMm}mm,0) rotate(90deg)`
        : rotation === 180
          ? `translate(${element.widthMm}mm,${element.heightMm}mm) rotate(180deg)`
          : rotation === 270
            ? `translate(0,${element.heightMm}mm) rotate(270deg)`
            : 'none',
  }
}
export function moverElemento(definition, id, dx, dy) {
  return {
    ...definition,
    elements: definition.elements.map(e =>
      e.id === id ? { ...e, xMm: redondearMm(e.xMm + dx), yMm: redondearMm(e.yMm + dy) } : e,
    ),
  }
}
export function solapesElementos(elements) {
  const visible = elements.filter(e => e.visible),
    errors = []
  for (let i = 0; i < visible.length; i++)
    for (let j = i + 1; j < visible.length; j++) {
      const a = visible[i],
        b = visible[j]
      if (
        a.xMm < b.xMm + b.widthMm - 0.001 &&
        b.xMm < a.xMm + a.widthMm - 0.001 &&
        a.yMm < b.yMm + b.heightMm - 0.001 &&
        b.yMm < a.yMm + a.heightMm - 0.001
      )
        errors.push(`Se superponen ${a.binding} y ${b.binding}.`)
    }
  return errors
}
