#!/usr/bin/env node
// Filtro del log del backend para el harness e2e (#CI).
//
// `next dev` loguea `⨯ uncaughtException: Error: aborted` (y su variante
// `⨯ Error: aborted`) cuando el navegador corta una request en vuelo: cierre del
// contexto de Playwright, navegación o reload. El stack es de Node
// (`abortIncoming` / `socketOnClose`, ECONNRESET), no de la app: es ruido
// conocido y benigno de Next (vercel/next.js#84649, #49587).
//
// El filtro reemplaza esos bloques por UNA línea-resumen (así se ve que
// pasaron) y deja pasar todo lo demás intacto, incluido un `Error: aborted` con
// stack propio de la app (se distingue por `abortIncoming (node:_http_server`).
//
// Uso como filtro:  next dev ... 2>&1 | node scripts/filtro-log-web.mjs
// Puro y testeable:   ver src/lib/filtroLogWeb.test.js

import { pathToFileURL } from 'node:url'

const RE_CABECERA = /⨯\s+(?:uncaughtException:\s+)?Error: aborted\s*$/
const RE_ABORTO_DE_NODE = /at abortIncoming \(node:_http_server:/
const RE_FIN_DE_BLOQUE = /^\s*\}\s*$/

export function crearFiltroLogWeb({ maxEspera = 12 } = {}) {
  let candidato = []
  let suprimiendo = false
  let lineasSuprimidas = 0
  let silenciados = 0

  const resumen = () => ` ⨯ ${silenciados} request(s) cortada(s) por el cliente (ECONNRESET): ruido conocido de Next dev (vercel/next.js#84649), resumido por scripts/filtro-log-web.mjs`

  const volcar = (salida, linea) => {
    if (silenciados) {
      salida.push(resumen())
      silenciados = 0
    }
    salida.push(linea)
  }

  return {
    /** Procesa una línea y devuelve las que hay que emitir (0..n). */
    linea(linea) {
      const salida = []
      if (suprimiendo) {
        lineasSuprimidas += 1
        if (RE_FIN_DE_BLOQUE.test(linea) || lineasSuprimidas > maxEspera) suprimiendo = false
        return salida
      }
      if (candidato.length) {
        candidato.push(linea)
        if (RE_ABORTO_DE_NODE.test(linea)) {
          candidato = []
          lineasSuprimidas = 0
          silenciados += 1
          suprimiendo = true
          return salida
        }
        // No era el bloque conocido: se emite tal cual (p. ej. un error real).
        if (candidato.length > maxEspera || RE_FIN_DE_BLOQUE.test(linea)) {
          for (const guardada of candidato) volcar(salida, guardada)
          candidato = []
        }
        return salida
      }
      if (RE_CABECERA.test(linea)) {
        candidato = [linea]
        return salida
      }
      volcar(salida, linea)
      return salida
    },
    /** Cierra el filtro: alcanza para volcar lo pendiente. */
    cerrar() {
      const salida = []
      if (candidato.length) {
        for (const guardada of candidato) volcar(salida, guardada)
        candidato = []
      }
      if (silenciados) {
        salida.push(resumen())
        silenciados = 0
      }
      return salida
    },
  }
}

export async function filtrarFlujo(entrada, salida, opciones = {}) {
  const filtro = crearFiltroLogWeb(opciones)
  let resto = ''
  for await (const trozo of entrada) {
    const texto = resto + trozo.toString('utf8')
    const lineas = texto.split('\n')
    resto = lineas.pop() ?? ''
    for (const linea of lineas) {
      for (const emitida of filtro.linea(linea)) salida.write(`${emitida}\n`)
    }
  }
  if (resto) for (const emitida of filtro.linea(resto)) salida.write(`${emitida}\n`)
  for (const emitida of filtro.cerrar()) salida.write(`${emitida}\n`)
}

const esEjecutable = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (esEjecutable) {
  await filtrarFlujo(process.stdin, process.stdout)
}
