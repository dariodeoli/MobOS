// Utilidad de pruebas: el inventario se partió en src/components/stock/. Las
// pruebas de reglas de diseño leen el código fuente de la pantalla; este lector
// devuelve el código de toda la pantalla (cascarón, hook, listas, pestañas y
// diálogos) cuando se le pide el módulo histórico `control/Inventario.jsx`.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const CARPETA_STOCK = join(AQUI, '..', 'components', 'stock')

export function fuenteStock() {
  return readdirSync(CARPETA_STOCK)
    .filter((nombre) => /\.(jsx|js)$/.test(nombre))
    .sort()
    .map((nombre) => readFileSync(join(CARPETA_STOCK, nombre), 'utf8'))
    .join('\n')
}

// Igual que readFileSync, salvo para el módulo histórico del inventario.
export function leerFuente(ruta, codificacion = 'utf8') {
  const texto = typeof ruta === 'string' ? ruta : ruta instanceof URL ? ruta.pathname : String(ruta)
  if (/components[\\/]control[\\/]Inventario\.jsx$/.test(texto)) return fuenteStock()
  return readFileSync(ruta, codificacion)
}
