// Auditoría de modales (#237): lista cada `<Modal>` con el tamaño estándar que
// le corresponde, cuenta los que todavía declaran `max-w-*` a mano y los que no
// usan el objeto compartido. Uso: node scripts/auditoria-modales.mjs
import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TAMANOS_MODAL } from '../src/components/shared/modal.js'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(RAIZ, 'src')

// Tamaños del objeto Modal: el ancho vive en el objeto, no en cada uso.
export { TAMANOS_MODAL }

// Migración de los anchos sueltos al tamaño estándar: se aplica una vez y el
// test de aserción evita que vuelvan a aparecer `max-w-*` en un `<Modal>`.
export const MIGRACION = {
  '': 'formulario',
  'max-w-xs': 'corto',
  'max-w-sm': 'corto',
  'max-w-md': 'corto',
  'max-w-lg': 'formulario',
  'max-w-xl': 'formulario',
  'max-w-2xl': 'amplio',
  'max-w-3xl': 'amplio',
  'max-w-4xl': 'amplio',
  'max-w-5xl': 'completo',
  'max-w-6xl': 'completo',
  'max-w-7xl': 'completo',
  'max-w-full': 'completo',
}

export const ANCHO_A_TAMANO = Object.fromEntries(Object.entries(TAMANOS_MODAL).map(([tamano, clase]) => [clase, tamano]))
export const TAMANO_PREDETERMINADO = 'formulario'

function archivosFuente() {
  return readdirSync(SRC, { recursive: true })
    .filter((ruta) => /\.jsx$/.test(ruta) && !/\.test\./.test(ruta))
    .map((ruta) => ({ ruta: String(ruta).split(sep).join('/'), contenido: readFileSync(join(SRC, ruta), 'utf8') }))
}

/** Cada etiqueta `<Modal …>` con su título y el ancho que declara. */
export function usosDeModal() {
  const usos = []
  for (const archivo of archivosFuente()) {
    const lineas = archivo.contenido.split('\n')
    for (const [indice, linea] of lineas.entries()) {
      if (!linea.includes('<Modal')) continue
      for (const etiqueta of etiquetasModal(linea, lineas, indice)) {
        const ancho = (etiqueta.texto.match(/max-w-[a-z0-9]+/) || [])[0] || ''
        const declarado = (etiqueta.texto.match(/\bsize="([a-z]+)"/) || [])[1] || ''
        const titulo = (etiqueta.texto.match(/title="([^"]*)"/) || [])[1] || ''
        usos.push({
          ruta: archivo.ruta,
          linea: etiqueta.linea,
          ancho,
          declarado,
          tamano: declarado || ANCHO_A_TAMANO[ancho] || MIGRACION[ancho] || TAMANO_PREDETERMINADO,
          aMigrar: Boolean(ancho),
          classNameDinamico: /className=\{/.test(etiqueta.texto),
          texto: etiqueta.texto.slice(0, 240),
          titulo,
        })
      }
    }
  }
  return usos
}

// Una línea puede traer varios `<Modal …>` (el repo los usa seguidos): se
// recorre cada aparición y la etiqueta se corta en el primer `>` real
// (ignorando llaves, comillas y `=>`).
function etiquetasModal(linea, lineas, indice) {
  const etiquetas = []
  let desde = 0
  while (true) {
    const inicio = linea.indexOf('<Modal', desde)
    if (inicio === -1) break
    let resto = linea.slice(inicio)
    let extra = indice
    while (finDeEtiqueta(resto) === -1 && extra + 1 < lineas.length) {
      extra += 1
      resto += ` ${lineas[extra]}`
    }
    const fin = finDeEtiqueta(resto)
    etiquetas.push({ texto: fin === -1 ? resto : resto.slice(0, fin + 1), linea: indice + 1 })
    desde = inicio + 6
  }
  return etiquetas
}

// Devuelve el índice del `>` que cierra la etiqueta, o -1 si sigue abierta.
function finDeEtiqueta(texto) {
  let llaves = 0
  let comilla = ''
  for (let indice = 0; indice < texto.length; indice += 1) {
    const caracter = texto[indice]
    if (comilla) {
      if (caracter === comilla && texto[indice - 1] !== '\\') comilla = ''
      continue
    }
    if (caracter === '"' || caracter === "'") { comilla = caracter; continue }
    if (caracter === '{') { llaves += 1; continue }
    if (caracter === '}') { llaves -= 1; continue }
    if (llaves === 0 && caracter === '>') return indice
  }
  return -1
}

const usos = usosDeModal()
const porTamano = {}
for (const uso of usos) (porTamano[uso.tamano] ||= []).push(uso)

// El informe solo se imprime al correr el script; el test importa las funciones.
if (process.argv[1] && process.argv[1].endsWith('auditoria-modales.mjs')) {
  console.log(`Modales: ${usos.length} · con tamaño estándar: ${usos.filter((uso) => !uso.aMigrar).length} · a migrar: ${usos.filter((uso) => uso.aMigrar).length}\n`)
  for (const [tamano, clase] of Object.entries(TAMANOS_MODAL)) {
    const grupo = porTamano[tamano] || []
    console.log(`${tamano} (${clase}): ${grupo.length}`)
    for (const fila of grupo) console.log(`  ${fila.aMigrar ? '· A MIGRAR' : '✓'} ${fila.ruta}:${fila.linea} ${fila.ancho || fila.declarado || '(predeterminado)'}${fila.classNameDinamico ? ' [className dinámico]' : ''}${fila.titulo ? ` · ${fila.titulo}` : ''}`)
    console.log('')
  }
  const conClassNameDinamico = usos.filter((uso) => uso.classNameDinamico)
  if (conClassNameDinamico.length) {
    console.log(`className dinámico en la etiqueta (revisar a mano): ${conClassNameDinamico.length}`)
    for (const fila of conClassNameDinamico) console.log(`  ${fila.ruta}:${fila.linea}`)
  }
}
