import { createHash, randomBytes } from 'node:crypto'

// Tokens de páginas públicas (#172/#178): 64 hex aleatorios y solo su sha256 en
// la base (docs/TOKENS.md). Mismo criterio que el enlace de carrito y el resto
// de los tokens de un solo uso. Las columnas legacy en claro se resuelven con
// `buscarPorTokenPublico` mientras dure la rotación.
export const TOKEN_PUBLICO_RE = /^[a-f0-9]{64}$/

export const hashTokenPublico = (token: string) => createHash('sha256').update(token).digest('hex')

export const nuevoTokenPublico = () => randomBytes(32).toString('hex')

// Resuelve una fila por token nuevo (hash) o legacy (claro). `buscarHash` y
// `buscarLegacy` son las dos consultas de la tabla; si el token es legacy se
// devuelve `{ row, legacy: true }` para que la ruta pueda backfillear el hash.
export async function buscarPorTokenPublico<T>(
  token: string,
  buscarHash: (hash: string) => Promise<T | null>,
  buscarLegacy: (token: string) => Promise<T | null>,
): Promise<{ row: T | null; hash: string | null; legacy: boolean }> {
  if (TOKEN_PUBLICO_RE.test(token)) return { row: await buscarHash(hashTokenPublico(token)), hash: null, legacy: false }
  const row = await buscarLegacy(token)
  return { row, hash: row ? hashTokenPublico(token) : null, legacy: Boolean(row) }
}
