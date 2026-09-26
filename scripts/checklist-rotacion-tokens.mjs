#!/usr/bin/env node
// Checklist ejecutable de rotación de tokens (#232) para Dario.
//
// Recorre `scripts/rotacion-tokens-pasos.mjs` paso a paso: muestra la acción
// exacta, ofrece correr la verificación cuando existe y deja un registro del
// día (sin valores) en docs/qa/rotacion-tokens/.
//
// Uso:
//   npm run rotacion:tokens              # recorrido guiado (paso a paso)
//   npm run rotacion:tokens -- --estado  # tablero de estado, sin preguntas
//   npm run rotacion:tokens -- --registro docs/qa/rotacion-tokens/registro.md
//
// Nunca imprime valores de secretos: solo nombres de variables y estados.

import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { FASES, PASOS } from './rotacion-tokens-pasos.mjs'

const args = process.argv.slice(2)
const tiene = (flag) => args.includes(flag)
const valorDe = (flag) => {
  const indice = args.indexOf(flag)
  return indice >= 0 ? String(args[indice + 1] || '') : ''
}

if (tiene('--ayuda') || tiene('-h')) {
  console.log(`Checklist de rotación de tokens (#232)

  npm run rotacion:tokens                 recorrido guiado paso a paso
  npm run rotacion:tokens -- --estado     tablero de estado (no pregunta)
  npm run rotacion:tokens -- --registro <ruta>   además, deja el registro ahí

No imprime valores de secretos: solo nombres de variables y estados.`)
  process.exit(0)
}

const MODO_ESTADO = tiene('--estado') || !process.stdin.isTTY
const REGISTRO = valorDe('--registro')
const SERVICIOS_KEYCHAIN = ['mobos-release-deploy-webhook', 'mobos-release-deploy-token']

const icono = (estado) => ({ hecho: '✓', pendiente: '•', fallo: '✖', manual: '•' }[estado] || '•')

function listarChecklist() {
  for (const fase of FASES) {
    console.log(`\n${fase.titulo} · ${fase.cuando}`)
    for (const paso of PASOS.filter((item) => item.fase === fase.id)) {
      const como = paso.comando ? `verificable con \`${paso.comando.texto}\`` : 'manual (panel)'
      const estado = paso.hecho ? 'hecho' : 'manual'
      console.log(`  ${icono(estado)} ${paso.id} ${paso.titulo} — ${como}${paso.hecho ? ' · hecho' : ''}`)
    }
  }
}

function keychainPresente(servicio) {
  if (process.platform !== 'darwin') return null
  const resultado = spawnSync('security', ['find-generic-password', '-a', process.env.USER || '', '-s', servicio], { stdio: 'ignore' })
  return resultado.status === 0
}

function ghDisponible() {
  const resultado = spawnSync('gh', ['auth', 'status'], { stdio: 'ignore' })
  if (resultado.error?.code === 'ENOENT') return null
  return resultado.status === 0
}

function ejecutar(comando) {
  const bin = comando.bin === 'node' ? process.execPath : comando.bin
  const resultado = spawnSync(bin, comando.args, { stdio: 'inherit' })
  if (resultado.error?.code === 'ENOENT') {
    console.log(`  (no se encontró \`${comando.bin}\`; corré a mano: ${comando.texto})`)
    return false
  }
  return resultado.status === 0
}

function faltanVariables(comando) {
  if (!comando.env?.length) return []
  return comando.env.filter((nombre) => !String(process.env[nombre] || '').trim())
}

function registroMarkdown(resultados) {
  const filas = PASOS.map((paso) => `| ${paso.id} | ${paso.titulo} | ${resultados[paso.id] || 'pendiente'} |`)
  return `# Registro de rotación de tokens — ${new Date().toISOString().slice(0, 10)}

Generado con \`npm run rotacion:tokens\` (no imprime valores de secretos).
Después de completarlo, volcá los resultados en la tabla «Registro de rotación»
de \`docs/ROTACION-TOKENS.md\`.

| Paso | Qué | Estado |
| --- | --- | --- |
${filas.join('\n')}

Estados: hecho · pendiente · fallo.
`
}

async function modoEstado() {
  console.log('Checklist de rotación de tokens (#232) — estado')
  listarChecklist()
  console.log('\nVerificación automática (delega en scripts/verificar-rotacion-tokens.mjs):')
  const verificador = ejecutar({ bin: 'node', args: ['scripts/verificar-rotacion-tokens.mjs'], texto: 'node scripts/verificar-rotacion-tokens.mjs' })
  console.log('\nCheques locales:')
  for (const servicio of SERVICIOS_KEYCHAIN) {
    const presente = keychainPresente(servicio)
    console.log(`${icono(presente ? 'hecho' : 'pendiente')} Keychain: ${servicio} ${presente === null ? '(solo macOS)' : presente ? 'presente' : 'ausente'}`)
  }
  const gh = ghDisponible()
  console.log(`${icono(gh ? 'hecho' : 'pendiente')} GitHub CLI: ${gh === null ? 'gh no está instalado (se verifica a mano)' : gh ? 'autenticada' : 'sin autenticar'}`)
  console.log('\nRecorrido guiado: `npm run rotacion:tokens`')
  if (!verificador) process.exitCode = 1
}

async function modoGuiado() {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const resultados = {}
  let interrumpido = false
  const preguntar = async (texto) => {
    try {
      return (await rl.question(texto)).trim().toLowerCase()
    } catch {
      interrumpido = true
      return ''
    }
  }
  console.log('Checklist de rotación de tokens (#232) — recorrido guiado')
  console.log('Regla de oro: generar → cargar en Coolify (locked) → redeploy → verificar → revocar el viejo.\n')
  try {
    for (const fase of FASES) {
      if (interrumpido) break
      console.log(`\n=== ${fase.titulo} · ${fase.cuando} ===`)
      for (const paso of PASOS.filter((item) => item.fase === fase.id)) {
        if (interrumpido) break
        console.log(`\n[${paso.id}] ${paso.titulo}`)
        console.log(`  Hacer: ${paso.accion.replace(/\n/g, '\n         ')}`)
        console.log(`  Verificar: ${paso.verificacion}`)
        if (paso.comando) {
          const faltantes = faltanVariables(paso.comando)
          console.log(`  Comando: ${paso.comando.texto}`)
          if (faltantes.length) {
            console.log(`  (Para que el script lo corra, exportá primero: ${faltantes.join(', ')}. No se imprimen valores.)`)
          }
          const respuesta = await preguntar('  ¿Ejecutar la verificación ahora? [s/N/p] ')
          if (interrumpido) break
          if (respuesta === 's' && !faltantes.length) {
            resultados[paso.id] = ejecutar(paso.comando) ? 'hecho' : 'fallo'
          } else {
            const hecho = await preguntar('  ¿El paso ya quedó hecho? [s/N] ')
            if (interrumpido) break
            resultados[paso.id] = hecho === 's' ? 'hecho' : 'pendiente'
          }
          continue
        }
        const respuesta = await preguntar('  ¿Hecho? [s/N/p] ')
        if (interrumpido) break
        resultados[paso.id] = respuesta === 's' ? 'hecho' : 'pendiente'
      }
    }

    if (interrumpido) console.log('\nRecorrido interrumpido (Ctrl+D): lo no respondido queda pendiente.')

    const hechos = PASOS.filter((paso) => resultados[paso.id] === 'hecho').length
    const fallos = PASOS.filter((paso) => resultados[paso.id] === 'fallo').length
    console.log(`\nResumen: ${hechos}/${PASOS.length} hechos · ${PASOS.length - hechos - fallos} pendientes · ${fallos} fallos`)

    let destino = REGISTRO
    if (!destino && !interrumpido) {
      const respuesta = await preguntar('¿Escribo el registro en docs/qa/rotacion-tokens/? [S/n] ')
      if (!interrumpido && respuesta !== 'n') destino = `docs/qa/rotacion-tokens/registro-${new Date().toISOString().slice(0, 10)}.md`
    }
    if (destino) {
      mkdirSync(dirname(destino), { recursive: true })
      writeFileSync(destino, registroMarkdown(resultados))
      console.log(`Registro guardado en ${destino} (sin valores; revisalo y commitealo si querés).`)
    }
    if (fallos) process.exitCode = 1
  } finally {
    rl.close()
  }
}

if (MODO_ESTADO) {
  if (!process.stdin.isTTY && !tiene('--estado')) {
    console.log('(sin terminal interactiva: se muestra el estado; para el recorrido guiado corré `npm run rotacion:tokens`)')
  }
  await modoEstado()
} else {
  await modoGuiado()
}
