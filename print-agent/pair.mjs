// Vinculación del puente desde la línea de comandos: canjea el código de un
// solo uso por el token y lo persiste en config.json. El token nunca se imprime
// en el log (solo queda en el archivo, con permisos 0600).
import { pathToFileURL } from 'node:url'
import { cargarConfig, guardarConfig } from './config.mjs'
import { canjearCodigo } from './remoto.mjs'

const ALFABETO_CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const LARGO_CODIGO = 10

// Espejo de `normalizarCodigoVinculacion` del backend: acepta minúsculas,
// espacios y las confusiones I/L → 1, O → 0.
export function normalizarCodigo(valor) {
  if (typeof valor !== 'string') return null
  const cuerpo = valor.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0')
  if (cuerpo.length !== LARGO_CODIGO) return null
  if ([...cuerpo].some((caracter) => !ALFABETO_CROCKFORD.includes(caracter))) return null
  return `${cuerpo.slice(0, 5)}-${cuerpo.slice(5)}`
}

export async function vincular({
  code,
  apiUrl = '',
  version = '',
  plataforma = process.platform,
  fetchImpl = fetch,
  log = console.log,
} = {}) {
  const codigo = normalizarCodigo(code)
  if (!codigo) throw new Error('El código de vinculación no es válido (formato ABCDE-FGHIJ).')
  const config = cargarConfig()
  const base = String(apiUrl || config.apiUrl || '').replace(/\/+$/, '')
  if (!base) throw new Error('Falta la dirección del backend (--api-url o config.json).')
  const { token, bridgeId } = await canjearCodigo({ apiUrl: base, code: codigo, version, platform: plataforma, fetchImpl })
  guardarConfig({ ...config, apiUrl: base, bridgeToken: token, remotoActivo: true })
  log(`Puente vinculado${bridgeId ? ` (${bridgeId})` : ''} con ${base}. Reiniciá el agente para tomar el modo remoto.`)
  return { bridgeId, apiUrl: base }
}

function argumento(nombre) {
  const indice = process.argv.indexOf(nombre)
  return indice === -1 ? '' : String(process.argv[indice + 1] || '')
}

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (esPrincipal) {
  vincular({
    code: argumento('--code'),
    apiUrl: argumento('--api-url'),
    version: argumento('--version'),
  }).catch((error) => {
    console.error(`No se pudo vincular: ${error?.message || error}`)
    process.exitCode = 1
  })
}
