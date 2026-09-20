#!/usr/bin/env node
// Empaquetador del agente de impresión: genera el tarball versionado, su
// checksum y el manifest que sirve el backend (backend/public/print-agent/).
// `--check` es el gate anti-drift: falla si el artefacto no coincide con las
// fuentes de print-agent/ o si la versión de package.json y server.mjs difiere.
import { createHash } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const AGENTE = join(RAIZ, 'print-agent')
const PUBLICO = join(RAIZ, 'backend', 'public', 'print-agent')
const RUTA_INSTALADOR = join(AGENTE, 'install.sh')

// Allow-list del paquete: solo lo que el agente necesita para correr y
// vincularse. Nada de tests, docs ni scripts locales.
export const ARCHIVOS_AGENTE = [
  'server.mjs',
  'transportes.mjs',
  'cola.mjs',
  'config.mjs',
  'remoto.mjs',
  'usb.mjs',
  'pair.mjs',
  'package.json',
]

const sha256 = (datos) => createHash('sha256').update(datos).digest('hex')

// Cabecera ustar determinista: uid/gid 0, mtime 0 y modo fijo. Así el mismo
// contenido produce siempre el mismo tarball en cualquier máquina.
function cabeceraTar(nombre, tamano) {
  const cabecera = Buffer.alloc(512)
  const octal = (valor, largo) => `${valor.toString(8).padStart(largo - 1, '0')}\0`
  Buffer.from(nombre, 'utf8').copy(cabecera, 0, 0, 100)
  cabecera.write(octal(0o644, 8), 100, 8, 'ascii')
  cabecera.write(octal(0, 8), 108, 8, 'ascii')
  cabecera.write(octal(0, 8), 116, 8, 'ascii')
  cabecera.write(octal(tamano, 12), 124, 12, 'ascii')
  cabecera.write(octal(0, 12), 136, 12, 'ascii')
  cabecera.write('        ', 148, 8, 'ascii')
  cabecera.write('0', 156, 1, 'ascii')
  cabecera.write('ustar\0', 257, 6, 'ascii')
  cabecera.write('00', 263, 2, 'ascii')
  const suma = cabecera.reduce((total, byte) => total + byte, 0)
  cabecera.write(`${suma.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')
  return cabecera
}

export function crearTarGz(entradas, { prefijo = '' } = {}) {
  const bloques = []
  for (const entrada of entradas) {
    const nombre = `${prefijo}${entrada.nombre}`
    const datos = Buffer.isBuffer(entrada.contenido) ? entrada.contenido : Buffer.from(String(entrada.contenido))
    bloques.push(cabeceraTar(nombre, datos.length), datos)
    const relleno = (512 - (datos.length % 512)) % 512
    if (relleno) bloques.push(Buffer.alloc(relleno))
  }
  bloques.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(bloques), { level: 9 })
}

// Lector mínimo del tar (solo archivos regulares) para comparar contenidos.
export function leerTarGz(tarball) {
  const tar = gunzipSync(tarball)
  const entradas = new Map()
  let offset = 0
  while (offset + 512 <= tar.length) {
    const cabecera = tar.subarray(offset, offset + 512)
    if (cabecera.every((byte) => byte === 0)) break
    const nombre = cabecera.subarray(0, 100).toString('utf8').replace(/\0.*$/, '')
    const tamano = parseInt(cabecera.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim() || '0', 8)
    const inicio = offset + 512
    entradas.set(nombre, Buffer.from(tar.subarray(inicio, inicio + tamano)))
    offset = inicio + tamano + ((512 - (tamano % 512)) % 512)
  }
  return entradas
}

export function leerVersion() {
  const paquete = JSON.parse(readFileSync(join(AGENTE, 'package.json'), 'utf8'))
  const servidor = readFileSync(join(AGENTE, 'server.mjs'), 'utf8')
  const enServidor = /const VERSION = '([^']+)'/.exec(servidor)?.[1] || ''
  if (!paquete.version || paquete.version !== enServidor) {
    throw new Error(`La versión no coincide: package.json=${paquete.version || '?'} server.mjs=${enServidor || '?'}`)
  }
  return { version: paquete.version, archivo: `mobos-print-agent-${paquete.version}.tgz` }
}

export function construir() {
  const { version, archivo } = leerVersion()
  if (!existsSync(RUTA_INSTALADOR)) throw new Error('Falta print-agent/install.sh.')
  const fuentes = ARCHIVOS_AGENTE.map((nombre) => ({ nombre, contenido: readFileSync(join(AGENTE, nombre)) }))
  const tarball = crearTarGz(fuentes, { prefijo: `mobos-print-agent-${version}/` })
  return {
    version,
    archivo,
    tarball,
    instalador: readFileSync(RUTA_INSTALADOR),
    manifest: { version, file: archivo, sha256: sha256(tarball), size: tarball.length },
    entradas: new Map(fuentes.map((fuente) => [`mobos-print-agent-${version}/${fuente.nombre}`, fuente.contenido])),
  }
}

function compararEntradas(esperadas, reales) {
  const faltan = [...esperadas.keys()].filter((nombre) => !reales.has(nombre))
  const sobran = [...reales.keys()].filter((nombre) => !esperadas.has(nombre))
  const distintos = [...esperadas.keys()].filter((nombre) => reales.has(nombre) && !esperadas.get(nombre).equals(reales.get(nombre)))
  return { faltan, sobran, distintos }
}

export function verificar({ paquete = construir() } = {}) {
  const problemas = []
  const rutaManifest = join(PUBLICO, 'manifest.json')
  const rutaTarball = join(PUBLICO, paquete.archivo)
  const rutaInstaladorPublico = join(PUBLICO, 'install.sh')
  if (!existsSync(rutaManifest)) problemas.push('falta backend/public/print-agent/manifest.json')
  if (!existsSync(rutaTarball)) problemas.push(`falta backend/public/print-agent/${paquete.archivo}`)
  if (!existsSync(rutaInstaladorPublico)) problemas.push('falta backend/public/print-agent/install.sh')
  if (problemas.length) return problemas

  const manifest = JSON.parse(readFileSync(rutaManifest, 'utf8'))
  for (const campo of ['version', 'file', 'sha256', 'size']) {
    if (manifest[campo] !== paquete.manifest[campo]) {
      problemas.push(`el manifest no coincide en ${campo}: publicado=${manifest[campo]} esperado=${paquete.manifest[campo]}`)
    }
  }
  const tarball = readFileSync(rutaTarball)
  if (sha256(tarball) !== manifest.sha256) problemas.push('el sha256 del tarball no coincide con el manifest')
  if (tarball.length !== manifest.size) problemas.push(`el tamaño del tarball cambió: ${tarball.length} != ${manifest.size}`)
  if (!readFileSync(rutaInstaladorPublico).equals(paquete.instalador)) problemas.push('install.sh publicado difiere de print-agent/install.sh')

  const diferencias = compararEntradas(paquete.entradas, leerTarGz(tarball))
  if (diferencias.faltan.length) problemas.push(`faltan archivos en el tarball: ${diferencias.faltan.join(', ')}`)
  if (diferencias.sobran.length) problemas.push(`sobran archivos en el tarball: ${diferencias.sobran.join(', ')}`)
  if (diferencias.distintos.length) problemas.push(`archivos desactualizados en el tarball: ${diferencias.distintos.join(', ')}`)

  const otros = readdirSync(PUBLICO).filter((nombre) => nombre.endsWith('.tgz') && nombre !== paquete.archivo)
  if (otros.length) problemas.push(`hay tarballs de otra versión: ${otros.join(', ')}`)
  return problemas
}

export function publicar({ paquete = construir() } = {}) {
  mkdirSync(PUBLICO, { recursive: true })
  for (const nombre of readdirSync(PUBLICO)) {
    if (nombre.endsWith('.tgz') && nombre !== paquete.archivo) rmSync(join(PUBLICO, nombre))
  }
  writeFileSync(join(PUBLICO, paquete.archivo), paquete.tarball)
  writeFileSync(join(PUBLICO, 'manifest.json'), `${JSON.stringify(paquete.manifest, null, 2)}\n`)
  writeFileSync(join(PUBLICO, 'install.sh'), paquete.instalador, { mode: 0o755 })
  return paquete
}

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (esPrincipal) {
  try {
    if (process.argv.includes('--check')) {
      const problemas = verificar()
      if (problemas.length) {
        console.error('El artefacto del agente no está al día:')
        for (const problema of problemas) console.error(`  - ${problema}`)
        console.error('Corré `node scripts/pack-agent.mjs` y commiteá el resultado.')
        process.exitCode = 1
      } else {
        console.log(`pack-agent: el artefacto v${leerVersion().version} está al día.`)
      }
    } else {
      const paquete = publicar()
      const peso = `${(statSync(join(PUBLICO, paquete.archivo)).size / 1024).toFixed(1)} KB`
      console.log(`pack-agent: publicado v${paquete.version} (${peso})`)
      console.log(`  backend/public/print-agent/${paquete.archivo}`)
      console.log(`  backend/public/print-agent/manifest.json (sha256 ${paquete.manifest.sha256.slice(0, 12)}…)`)
      console.log('  backend/public/print-agent/install.sh')
    }
  } catch (error) {
    console.error(`pack-agent: ${error?.message || error}`)
    process.exitCode = 1
  }
}
