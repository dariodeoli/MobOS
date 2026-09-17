import { createServer } from 'node:http'
import { cargarConfig, guardarConfig, RUTA_COLA } from './config.mjs'
import { crearCola } from './cola.mjs'
import { enviar, impresorasUsb } from './transportes.mjs'

const VERSION = '1.0.0'
const config = cargarConfig()
const cola = crearCola({ ruta: RUTA_COLA, enviar, esperaMs: config.esperaMs, reintentos: config.reintentos, log: (mensaje) => console.log(`[cola] ${mensaje}`) })
cola.reanudar()

// La app vive en un dominio público y llama a este agente en 127.0.0.1: el
// navegador pide permiso de red local (Chrome) y exige CORS + el header
// Access-Control-Allow-Private-Network.
const ORIGENES = [/^https:\/\/app\.moboss\.online$/, /^https:\/\/moboss\.online$/, /^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/]

function cors(request, response) {
  const origen = String(request.headers.origin || '')
  if (ORIGENES.some((permitido) => permitido.test(origen))) {
    response.setHeader('Access-Control-Allow-Origin', origen)
    response.setHeader('Vary', 'Origin')
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-mobos-print-token')
    response.setHeader('Access-Control-Allow-Private-Network', 'true')
  }
  if (request.method === 'OPTIONS') {
    response.writeHead(204)
    response.end()
    return true
  }
  return false
}

const responder = (response, datos, status = 200) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(datos))
}

const tokenValido = (request) => !config.token || request.headers['x-mobos-print-token'] === config.token

const leerCuerpo = (request) => new Promise((resolve, reject) => {
  let datos = ''
  request.on('data', (parte) => {
    datos += parte
    if (datos.length > 5 * 1024 * 1024) { reject(new Error('El ticket es demasiado grande.')); request.destroy() }
  })
  request.on('end', () => { try { resolve(datos ? JSON.parse(datos) : {}) } catch { reject(new Error('JSON inválido.')) } })
  request.on('error', reject)
})

const servidor = createServer(async (request, response) => {
  if (cors(request, response)) return
  const url = new URL(request.url, 'http://127.0.0.1')
  try {
    if (request.method === 'GET' && url.pathname === '/health') {
      if (!tokenValido(request)) return responder(response, { ok: true, version: VERSION })
      const usb = await impresorasUsb()
      return responder(response, {
        ok: true,
        version: VERSION,
        puerto: config.puerto,
        impresora: config.impresora,
        ancho: config.ancho,
        copias: config.copias,
        impresoras: { lan: config.lan, usb },
        cola: cola.resumen(),
      })
    }

    if (request.method === 'GET' && url.pathname.startsWith('/jobs/')) {
      if (!tokenValido(request)) return responder(response, { ok: false, error: 'Token inválido.' }, 401)
      return responder(response, { ok: true, ...cola.estado(url.pathname.slice('/jobs/'.length)) })
    }

    if (request.method === 'POST' && url.pathname === '/print') {
      if (!tokenValido(request)) return responder(response, { ok: false, error: 'Token inválido.' }, 401)
      const cuerpo = await leerCuerpo(request)
      const impresora = String(cuerpo?.impresora || config.impresora || '')
      const data = String(cuerpo?.data || '')
      const copias = Math.min(5, Math.max(1, Number(cuerpo?.copias) || config.copias))
      if (!impresora) return responder(response, { ok: false, error: 'Elegí una impresora en Configuración → Impresoras.' }, 400)
      if (!data || !/^[A-Za-z0-9+/=]+$/.test(data)) return responder(response, { ok: false, error: 'El ticket llegó vacío o mal formado.' }, 400)
      const ticket = copias > 1 ? Buffer.from(data, 'base64').toString('base64') : data
      const resultados = []
      for (let copia = 0; copia < copias; copia += 1) resultados.push(await cola.encolar({ impresora, data: ticket }))
      const pendiente = resultados.find((resultado) => resultado.encolado)
      if (pendiente) return responder(response, { ok: true, encolado: true, jobId: pendiente.jobId, error: pendiente.error || '' }, 202)
      return responder(response, { ok: true, encolado: false, jobId: resultados[0]?.jobId || null })
    }

    if (request.method === 'POST' && url.pathname === '/config') {
      if (!tokenValido(request)) return responder(response, { ok: false, error: 'Token inválido.' }, 401)
      const cuerpo = await leerCuerpo(request)
      for (const campo of ['impresora', 'ancho', 'copias']) {
        if (cuerpo?.[campo] !== undefined) config[campo] = cuerpo[campo]
      }
      guardarConfig(config)
      return responder(response, { ok: true, impresora: config.impresora, ancho: config.ancho, copias: config.copias })
    }

    return responder(response, { ok: false, error: 'Ruta no encontrada.' }, 404)
  } catch (error) {
    return responder(response, { ok: false, error: error?.message || 'Error del agente.' }, 400)
  }
})

servidor.listen(config.puerto, '127.0.0.1', () => {
  console.log(`MobOS Print ${VERSION} escuchando en http://127.0.0.1:${config.puerto}`)
  console.log(`Token: ${config.token}`)
  console.log(config.impresora ? `Impresora: ${config.impresora}` : 'Sin impresora elegida: configurala desde Configuración → Impresoras.')
})
