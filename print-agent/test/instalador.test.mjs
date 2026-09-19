// Tests del instalador one-liner (matriz de amenaza del design): nombre de
// artefacto alterado, checksum corrupto, código inválido, rutas peligrosas en
// el tarball y configuración legacy `usb:` que sobrevive a la vinculación.
// El instalador se corre de verdad contra un backend falso en node:http.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ARCHIVOS_AGENTE, crearTarGz } from '../../scripts/pack-agent.mjs'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const INSTALADOR = join(RAIZ, 'print-agent', 'install.sh')
const AGENTE = join(RAIZ, 'print-agent')
const VERSION = '1.6.0'
const sha256 = (datos) => createHash('sha256').update(datos).digest('hex')

function tarballDelAgente(entradasExtra = []) {
  const fuentes = ARCHIVOS_AGENTE.map((nombre) => ({ nombre, contenido: readFileSync(join(AGENTE, nombre)) }))
  return crearTarGz([...fuentes, ...entradasExtra], { prefijo: `mobos-print-agent-${VERSION}/` })
}

function manifestDe(tarball, cambios = {}) {
  return { version: VERSION, file: `mobos-print-agent-${VERSION}.tgz`, sha256: sha256(tarball), size: tarball.length, ...cambios }
}

// Backend falso: sirve el manifest, el tarball y el canje del código.
function crearBackend() {
  const peticiones = []
  const servidor = createServer((peticion, respuesta) => {
    peticiones.push({ metodo: peticion.method, url: peticion.url })
    if (peticion.method === 'POST' && peticion.url === '/api/print/bridge/pair') {
      respuesta.writeHead(201, { 'content-type': 'application/json' })
      respuesta.end(JSON.stringify({ token: 'token-de-prueba', bridgeId: 'bridge-e2e' }))
      return
    }
    const contenido = peticion.url.startsWith('/print-agent/') ? archivos[peticion.url] : undefined
    if (!contenido) {
      respuesta.writeHead(404)
      respuesta.end('no')
      return
    }
    respuesta.writeHead(200, { 'content-type': 'application/octet-stream' })
    respuesta.end(contenido)
  })
  const archivos = {}
  return { servidor, peticiones, archivos }
}

async function escuchar(servidor) {
  await new Promise((listo) => servidor.listen(0, '127.0.0.1', listo))
  return servidor.address().port
}

// async a propósito: el backend falso vive en este proceso, así que el event
// loop tiene que quedar libre mientras corre el instalador.
function ejecutar(argumentos, opciones) {
  return new Promise((listo) => {
    execFile('bash', argumentos, opciones, (error, stdout, stderr) => {
      listo({ codigo: error ? Number(error.code) || 1 : 0, salida: `${stdout || ''}${stderr || ''}` })
    })
  })
}

async function correrInstalador({ manifest, tarball, code = '', configPrevio = null }) {
  const base = mkdtempSync(join(tmpdir(), 'mobos-instalador-'))
  const hogar = join(base, 'hogar')
  const destino = join(base, 'aplicacion')
  const configDir = join(base, 'config')
  mkdirSync(hogar, { recursive: true })
  if (configPrevio) {
    mkdirSync(configDir, { recursive: true })
    writeFileSync(join(configDir, 'config.json'), JSON.stringify(configPrevio))
  }
  const backend = crearBackend()
  if (manifest) backend.archivos['/print-agent/manifest.json'] = JSON.stringify(manifest)
  if (tarball && manifest) backend.archivos[`/print-agent/${manifest.file}`] = tarball
  const puerto = await escuchar(backend.servidor)
  const argumentos = [INSTALADOR, '--api-url', `http://127.0.0.1:${puerto}`, '--no-service']
  if (code) argumentos.push('--code', code)
  const resultado = await ejecutar(argumentos, {
    encoding: 'utf8',
    env: { ...process.env, HOME: hogar, MOBOS_PRINT_DIR: configDir, MOBOS_PRINT_INSTALL_DIR: destino },
  })
  await new Promise((listo) => backend.servidor.close(listo))
  // Se lee el estado antes de limpiar el sandbox: después ya no existe.
  const rutaConfig = join(configDir, 'config.json')
  const config = existsSync(rutaConfig) ? JSON.parse(readFileSync(rutaConfig, 'utf8')) : null
  const instalado = existsSync(join(destino, 'server.mjs'))
  rmSync(base, { recursive: true, force: true })
  return { ...resultado, instalado, config, peticiones: backend.peticiones }
}

test('el instalador rechaza un nombre de artefacto distinto al fijo', async () => {
  const tarball = tarballDelAgente()
  const resultado = await correrInstalador({ manifest: manifestDe(tarball, { file: 'otro.tgz' }), tarball })
  assert.notEqual(resultado.codigo, 0, 'debe abortar')
  assert.match(resultado.salida, /nombre de archivo inesperado/i)
  assert.equal(resultado.instalado, false, 'no instala nada')
})

test('un checksum que no coincide aborta sin instalar', async () => {
  const tarball = tarballDelAgente()
  const resultado = await correrInstalador({ manifest: manifestDe(tarball, { sha256: '0'.repeat(64) }), tarball })
  assert.notEqual(resultado.codigo, 0, 'debe abortar')
  assert.match(resultado.salida, /checksum/i)
  assert.equal(resultado.instalado, false, 'no deja archivos instalados')
  assert.equal(resultado.config, null, 'no toca la configuración')
})

test('un código inválido no descarga ni escribe token', async () => {
  const tarball = tarballDelAgente()
  const resultado = await correrInstalador({ manifest: manifestDe(tarball), tarball, code: 'NO-VALIDO' })
  assert.notEqual(resultado.codigo, 0, 'debe abortar')
  assert.match(resultado.salida, /código de vinculación/i)
  assert.equal(resultado.peticiones.length, 0, 'no pide nada al backend')
  assert.equal(resultado.config, null, 'no escribe token')
})

test('un tarball con rutas absolutas o .. se rechaza antes de extraer', async () => {
  for (const nombre of ['../evil.mjs', '/tmp/evil.mjs']) {
    const conRuta = crearTarGz(
      [
        { nombre: `mobos-print-agent-${VERSION}/server.mjs`, contenido: 'x' },
        { nombre, contenido: 'x' },
      ],
      { prefijo: nombre.startsWith('/') ? '' : `mobos-print-agent-${VERSION}/` },
    )
    const resultado = await correrInstalador({ manifest: manifestDe(conRuta), tarball: conRuta })
    assert.notEqual(resultado.codigo, 0, `debe rechazar ${nombre}`)
    assert.match(resultado.salida, /rutas no permitidas|no permitido/i)
    assert.equal(resultado.instalado, false, 'no extrae')
  }
})

test('el destino usb: legacy sobrevive a la vinculación', async () => {
  const tarball = tarballDelAgente()
  const resultado = await correrInstalador({
    manifest: manifestDe(tarball),
    tarball,
    code: 'ABCDE-FGHIJ',
    configPrevio: { impresora: 'usb:Epson TM-T20', token: 'token-local', copias: 2 },
  })
  assert.equal(resultado.codigo, 0, `el instalador debe terminar bien: ${resultado.salida}`)
  assert.equal(resultado.instalado, true, 'el agente queda instalado')
  assert.equal(resultado.config?.impresora, 'usb:Epson TM-T20', 'el destino legacy no se toca')
  assert.equal(resultado.config?.copias, 2, 'la configuración existente se conserva')
  assert.equal(resultado.config?.bridgeToken, 'token-de-prueba', 'el token del puente queda guardado')
  assert.ok(resultado.peticiones.some((peticion) => peticion.url === '/api/print/bridge/pair'), 'canjea el código')
})
