// Medición de contraste AA para los QA de diseño (#241).
//
// Recorre los NODOS de texto visibles de la página, compone las alfas sobre el
// fondo real (los tokens usan /75, /15, /14) y compara contra AA (4.5:1; 3:1 en
// texto grande). `raices` define qué parte se considera "shell" (barra, topbar,
// cajón, barra inferior, banners) para exigir 0 bajos solo ahí y reportar el
// contenido aparte.
export const SHELL = [
  '[data-testid="shell-lateral"]',
  'header',
  'nav[aria-label="Accesos rápidos"]',
  '[data-testid="shell-drawer-acciones"]',
  'footer',
]

export async function auditarContraste(page, raices, contenedores = []) {
  return page.evaluate(({ selectores, contenedores }) => {
    const parse = (c) => {
      const m = String(c).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/)
      return m ? { rgb: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] } : null
    }
    const sobre = (fg, bg) => fg.rgb.map((v, i) => v * fg.a + bg[i] * (1 - fg.a))
    const lum = ([r, g, b]) => {
      const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const ratio = (a, b) => {
      const [alto, bajo] = [lum(a), lum(b)].sort((x, y) => y - x)
      return (alto + 0.05) / (bajo + 0.05)
    }
    // Fondo real: compone desde la raíz del documento hasta el elemento.
    const fondoDe = (el) => {
      const cadena = []
      for (let n = el; n; n = n.parentElement) cadena.push(n)
      let fondo = [255, 255, 255]
      for (let i = cadena.length - 1; i >= 0; i--) {
        const bg = parse(getComputedStyle(cadena[i]).backgroundColor)
        if (bg && bg.a > 0) fondo = sobre(bg, fondo)
      }
      return fondo
    }
    const raices = selectores.flatMap((s) => Array.from(document.querySelectorAll(s)))
    const visible = (el) => el.offsetParent !== null && !el.closest('[aria-hidden="true"]')
    // Se miden NODOS de texto (no elementos): hay textos que viven sueltos
    // dentro de un div con íconos (banners) y un scan por elementos los pierde.
    const paseo = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (nodo) => {
        const padre = nodo.parentElement
        if (!padre || !nodo.nodeValue || nodo.nodeValue.trim().length < 2) return NodeFilter.FILTER_REJECT
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION'].includes(padre.tagName)) return NodeFilter.FILTER_REJECT
        return visible(padre) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
      },
    })
    const textos = []
    while (paseo.nextNode()) textos.push(paseo.currentNode)

    const bajos = []
    const contenido = []
    let medidos = 0
    for (const nodo of textos) {
      const el = nodo.parentElement
      const cs = getComputedStyle(el)
      const color = parse(cs.color)
      if (!color) continue
      const esRaiz = raices.some((raiz) => raiz.contains(el))
      const esContexto = contenedores.some((s) => el.closest(s))
      if (!esRaiz && !esContexto) continue
      const fondo = fondoDe(el)
      const mezclado = sobre(color, fondo)
      const r = ratio(mezclado, fondo)
      const tam = parseFloat(cs.fontSize)
      const negrita = Number(cs.fontWeight) >= 600
      const grande = tam >= 24 || (tam >= 18.66 && negrita)
      const minimo = grande ? 3 : 4.5
      const dato = {
        texto: nodo.nodeValue.trim().slice(0, 40),
        ratio: Number(r.toFixed(2)),
        color: cs.color,
        fondo: fondo.map((v) => Math.round(v)).join(','),
        tamano: cs.fontSize,
        peso: cs.fontWeight,
        clase: String(el.className).slice(0, 90),
      }
      if (r < minimo) {
        if (esRaiz) bajos.push(dato)
        else contenido.push(dato)
      }
      medidos++
    }
    return { medidos, bajos, contenido: contenido.slice(0, 8), totalBajosContenido: contenido.length }
  }, { selectores: raices, contenedores })
}

export function informar(etiqueta, medicion) {
  console.log(`[${etiqueta}] textos=${medicion.medidos} bajos=${medicion.bajos.length} · contenido bajos=${medicion.totalBajosContenido}`)
  if (medicion.bajos.length) console.log(JSON.stringify(medicion.bajos, null, 2))
  if (medicion.totalBajosContenido) console.log('contenido:', JSON.stringify(medicion.contenido, null, 2))
}
