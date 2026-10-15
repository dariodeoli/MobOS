import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Railpack 0.23 copia algunas excepciones de .dockerignore en la raíz.
// El documento canónico del checkout siempre tiene prioridad.
export function prepararNovedades(raiz = process.cwd()) {
  const destino = resolve(raiz, 'docs/NOVEDADES.md')
  if (existsSync(destino) && statSync(destino).isFile()) return false
  const reubicado = resolve(raiz, 'NOVEDADES.md')
  if (!existsSync(reubicado) || !statSync(reubicado).isFile()) {
    throw new Error('Falta docs/NOVEDADES.md en el contexto de compilación.')
  }
  mkdirSync(dirname(destino), { recursive: true })
  copyFileSync(reubicado, destino)
  return true
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    if (prepararNovedades()) console.log('Registro de novedades restaurado en docs/.')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
