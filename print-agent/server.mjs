import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { hostname } from 'node:os'
import { promisify } from 'node:util'
import { cargarConfig, guardarConfig, RUTA_COLA, RUTA_HISTORIAL } from './config.mjs'
import { crearCola } from './cola.mjs'
import { aplicarConfigRemota, crearRemoto } from './remoto.mjs'
import { aliasSecundario, colaLanDeCups, colaUri, diagnosticoRed, enviar, impresorasUsb, probarConexion, probarConexionDetalle, tipoDeCola } from './transportes.mjs'

const VERSION = '1.6.0'
const config = cargarConfig()
// Transporte real del último envío (directo | cups | usb): la app solo debe
// marcar éxito cuando hubo entrega confirmada, no solo encolado.
let ultimoTransporte = ''
const cola = crearCola({ ruta: RUTA_COLA, rutaHistorial: RUTA_HISTORIAL, enviar: async (destino, bytes) => {
  const transporte = await enviar(destino, bytes, { lanCups: config.lanCups, alias: config.alias })
  ultimoTransporte = transporte
  return transporte
}, esperaMs: config.esperaMs, reintentos: config.reintentos, log: (mensaje) => console.log(`[cola] ${mensaje}`) })
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

// Alcance de la impresora elegida, con cache corto para no golpear el puerto
// en cada consulta del panel.
let cacheAlcance = { hasta: 0, ok: null }
async function impresoraResponde() {
  if (Date.now() < cacheAlcance.hasta) return cacheAlcance.ok
  const ok = config.impresora ? await probarConexion(config.impresora, { alias: config.alias }) : false
  cacheAlcance = { hasta: Date.now() + 3000, ok }
  return ok
}

// Poller remoto: solo se arranca con apiUrl + token (vinculados con pair.mjs).
// Nunca bloquea el camino local y ningún error de red puede tumbar el proceso.
const remoto = config.remotoActivo
  ? crearRemoto({
      apiUrl: config.apiUrl,
      token: config.bridgeToken,
      cola,
      enviar,
      baseMs: config.intervaloPollMs,
      version: VERSION,
      log: (mensaje) => console.log(`[remoto] ${mensaje}`),
    })
  : null
if (remoto) {
  remoto.iniciar((datos) => {
    // La config del backend manda: impresora, ancho, copias y allow-list LAN.
    aplicarConfigRemota(config, datos)
    guardarConfig(config)
    cacheAlcance = { hasta: 0, ok: null }
  }).catch((error) => console.error(`[remoto] no fatal: ${error?.message || error}`))
  console.log(`Puente remoto activo: ${config.apiUrl} (poll cada ${config.intervaloPollMs} ms)`)
} else if (config.apiUrl && !config.bridgeToken) {
  console.log('Hay apiUrl configurada sin token: vinculá el puente con `node pair.mjs --code ABCDE-FGHIJ`.')
}

// Autotest desde el MISMO proceso que corre por launchd: es la única prueba
// que refleja lo que ve el agente automático (Terminal puede tener otra ruta o
// permiso de Red Local). Se guarda el error real (errno) y si el respaldo CUPS
// está disponible.
let autotest = { at: null, ok: null, error: '', errno: '', cups: '', transporte: 'ninguno' }
async function ejecutarAutotest() {
  const cups = await colaLanDeCups(config.lanCups || 'MobOS_LAN')
  if (!config.impresora) {
    autotest = { at: new Date().toISOString(), ok: false, error: 'No hay impresora configurada.', errno: '', cups, transporte: 'ninguno' }
    return autotest
  }
  const detalle = await probarConexionDetalle(config.impresora, { alias: config.alias })
  autotest = {
    at: new Date().toISOString(),
    ok: detalle.ok,
    error: detalle.error || '',
    errno: detalle.errno || '',
    origen: detalle.origen || '',
    cups,
    transporte: detalle.ok ? 'directo' : (cups ? 'cups' : 'ninguno'),
  }
  return autotest
}

const responder = (response, datos, status = 200) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(datos))
}

const tokenValido = (request) => !config.token || request.headers['x-mobos-print-token'] === config.token

// IP real del equipo que llama (la del socket: no se confía en headers que el
// cliente puede inventar). Sirve para saber desde qué computadora se imprimió.
const ipDe = (request) => String(request.socket?.remoteAddress || '').replace(/^::ffff:/, '')

const ejecutar = promisify(execFile)

// Recrea la IP secundaria de la red de la impresora (sudo -n: sin prompt; el
// instalador deja el permiso en /etc/sudoers.d). Después verifica el alcance.
async function repararRed() {
  const alias = config.alias
  const iface = await ifaceDeRed()
  const agregado = await (async () => {
    if (!alias || !iface) return false
    try {
      const { stdout } = await ejecutar('ifconfig', [], { timeout: 5000 })
      if (stdout.includes(`inet ${alias} `)) return true // ya estaba
    } catch { /* sigue */ }
    try {
      await ejecutar('sudo', ['-n', 'ifconfig', iface, 'alias', alias, 'netmask', '255.255.255.0'], { timeout: 8000 })
      return true
    } catch {
      return false
    }
  })()
  cacheAlcance = { hasta: 0, ok: null }
  // macOS moderno ya no permite crear colas "raw" con lpadmin: no se crea
  // nada. Si la cola existe, se reporta su URI real para que la app decida
  // (p. ej. socket://… = CUPS sobre LAN; usb://… = CUPS sobre USB físico).
  const nombreCola = config.lanCups || 'MobOS_LAN'
  const colaExistente = await colaLanDeCups(nombreCola)
  const cups = colaExistente
    ? { ok: true, cola: nombreCola, uri: await colaUri(nombreCola) }
    : { ok: false, cola: nombreCola, uri: '', motivo: 'No existe una cola con ese nombre. macOS moderno no crea colas raw; se conserva TCP directo y diálogo.' }
  return {
    alias,
    iface,
    agregado,
    permiso: !agregado ? 'Sin permiso de administrador: corré `bash print-agent/red-mac.sh agregar` en el puente.' : '',
    cups,
    impresoraOk: await impresoraResponde(),
  }
}

async function ifaceDeRed() {
  try {
    const { stdout } = await ejecutar('route', ['-n', 'get', 'default'], { timeout: 5000 })
    return (stdout.match(/interface: (\S+)/) || [])[1] || ''
  } catch {
    return ''
  }
}

// Solo se permite imprimir a destinos configurados: evita que un cliente
// autenticado use el agente como puente hacia otros equipos de la red.
async function destinosPermitidos() {
  const usb = await impresorasUsb()
  // Cada cola CUPS se acepta como `cups:` (nombre honesto) y `usb:` (app vieja).
  return new Set([...config.lan, ...usb.flatMap((cola) => [`cups:${cola}`, `usb:${cola}`]), config.impresora].filter(Boolean))
}

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
        impresoraOk: await impresoraResponde(),
        red: {
          tcp: await impresoraResponde(),
          cups: await colaLanDeCups(config.lanCups || 'MobOS_LAN'),
          cupsUri: (await colaLanDeCups(config.lanCups || 'MobOS_LAN')) ? await colaUri(config.lanCups || 'MobOS_LAN') : '',
          colaTipo: await tipoDeCola(config.lanCups || 'MobOS_LAN'),
          alias: await aliasSecundario(config.alias),
          transporte: (await impresoraResponde()) ? 'directo' : ((await colaLanDeCups(config.lanCups || 'MobOS_LAN')) ? 'cups' : 'ninguno'),
          ultimoTransporte,
          autotest,
        },
        cola: cola.resumen(),
        // Estado del poller remoto: nunca incluye el token del puente.
        remoto: remoto
          ? remoto.estado()
          : { activo: false, apiUrl: config.apiUrl || '', ultimoContacto: null, pendientesDeReporte: 0, backoffMs: 0, ultimoError: '' },
        cliente: ipDe(request),
        host: config.host,
        equipo: hostname(),
        alias: await aliasSecundario(config.alias),
      })
    }

    if (request.method === 'GET' && url.pathname === '/diagnostico') {
      if (!tokenValido(request)) return responder(response, { ok: false, error: 'Token inválido.' }, 401)
      const destino = url.searchParams.get('destino') || config.impresora
      return responder(response, { ok: true, ...(await diagnosticoRed(destino, { alias: config.alias, cups: config.lanCups || 'MobOS_LAN' })) })
    }

    if (request.method === 'GET' && url.pathname === '/historial') {
      if (!tokenValido(request)) return responder(response, { ok: false, error: 'Token inválido.' }, 401)
      const limite = Math.min(60, Math.max(1, Number(url.searchParams.get('limite')) || 20))
      return responder(response, { ok: true, historial: cola.historial(limite) })
    }

    // Confirmación física: el operador vio el papel y lo marca en la app.
    // El sufijo secreto impreso en el ticket debe coincidir con el guardado.
    if (request.method === 'POST' && url.pathname === '/jobs/confirm') {
      if (!tokenValido(request)) return responder(response, { ok: false, error: 'Token inválido.' }, 401)
      const cuerpo = await leerCuerpo(request)
      const resultado = cola.confirmar(String(cuerpo?.id || ''), String(cuerpo?.sufijo ?? ''))
      const mensajes = {
        'no-encontrado': 'El trabajo no existe en el historial.',
        'ya-confirmado': 'Este trabajo ya estaba confirmado en papel.',
        'no-confirmable': 'El trabajo no está aceptado por el transporte: no se puede confirmar en papel.',
        'sufijo-incorrecto': 'El número secreto no coincide con el impreso: revisá el papel.',
      }
      return responder(response, resultado.ok
        ? { ok: true, confirmado: true }
        : { ok: false, confirmado: false, motivo: resultado.motivo, error: mensajes[resultado.motivo] || 'No se pudo confirmar el trabajo.' })
    }

    if (request.method === 'POST' && url.pathname === '/jobs/clear') {
      if (!tokenValido(request)) return responder(response, { ok: false, error: 'Token inválido.' }, 401)
      const cuerpo = await leerCuerpo(request)
      return responder(response, { ok: true, limpiados: cola.limpiarFallidos(Array.isArray(cuerpo?.ids) ? cuerpo.ids : []) })
    }

    if (request.method === 'POST' && url.pathname === '/red/agregar') {
      if (!tokenValido(request)) return responder(response, { ok: false, error: 'Token inválido.' }, 401)
      const resultado = await repararRed()
      await ejecutarAutotest()
      return responder(response, { ok: true, ...resultado, autotest })
    }

    if (request.method === 'POST' && url.pathname === '/jobs/retry') {
      if (!tokenValido(request)) return responder(response, { ok: false, error: 'Token inválido.' }, 401)
      return responder(response, { ok: true, reintentados: cola.reintentarFallidos() })
    }

    if (request.method === 'GET' && url.pathname === '/jobs') {
      if (!tokenValido(request)) return responder(response, { ok: false, error: 'Token inválido.' }, 401)
      return responder(response, { ok: true, ...cola.listar(), resumen: cola.resumen() })
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
      const usuario = String(cuerpo?.usuario || '').slice(0, 80)
      const ref = String(cuerpo?.ref || '').slice(0, 64)
      const tipo = String(cuerpo?.tipo || '').slice(0, 40)
      // Metadatos de testeo (los manda la app; el token va enmascarado).
      const validacion = String(cuerpo?.validacion || '').slice(0, 12)
      const sufijo = String(cuerpo?.sufijo ?? '').slice(0, 2)
      const puente = String(cuerpo?.puente || '').slice(0, 80)
      const tokenPista = String(cuerpo?.tokenPista || '').slice(0, 40)
      const modo = String(cuerpo?.modo || '').slice(0, 40)
      const ancho = Math.min(120, Math.max(0, Number(cuerpo?.ancho) || 0))
      if (!impresora) return responder(response, { ok: false, error: 'Elegí una impresora en Configuración → Impresoras.' }, 400)
      if (!(await destinosPermitidos()).has(impresora)) {
        return responder(response, { ok: false, error: `La impresora ${impresora} no está configurada en este agente.` }, 400)
      }
      if (cola.resumen().pendientes >= 100) {
        return responder(response, { ok: false, error: 'La cola de impresión está llena (100 trabajos): revisá la impresora antes de seguir.' }, 429)
      }
      if (!data || !/^[A-Za-z0-9+/=]+$/.test(data)) return responder(response, { ok: false, error: 'El ticket llegó vacío o mal formado.' }, 400)
      const ticket = copias > 1 ? Buffer.from(data, 'base64').toString('base64') : data
      const resultados = []
      const cliente = ipDe(request)
      for (let copia = 0; copia < copias; copia += 1) resultados.push(await cola.encolar({ impresora, data: ticket, cliente, usuario, ref, tipo, validacion, sufijo, puente, tokenPista, modo, ancho }))
      const pendiente = resultados.find((resultado) => resultado.encolado)
      if (pendiente) {
        const sinRuta = /EHOSTUNREACH|ENETUNREACH/i.test(pendiente.error || '')
        const incierto = pendiente.estado === 'incierto'
        return responder(response, {
          ok: true,
          encolado: true,
          incierto,
          estado: pendiente.estado || 'pendiente',
          jobId: pendiente.jobId,
          error: incierto
            ? `Resultado incierto: ${pendiente.error || 'el transporte pudo haber enviado el trabajo'}. No se reintenta solo para no duplicar; reintentá a mano desde la cola.`
            : sinRuta
              ? 'Sin ruta a la impresora. Revisá que la Mac y la impresora compartan la subred (o agregá una IP secundaria con print-agent/red-mac.sh); el trabajo queda en cola.'
              : pendiente.error || '',
        }, 202)
      }
      return responder(response, { ok: true, encolado: false, transporte: ultimoTransporte || 'directo', jobId: resultados[0]?.jobId || null })
    }

    if (request.method === 'POST' && url.pathname === '/config') {
      if (!tokenValido(request)) return responder(response, { ok: false, error: 'Token inválido.' }, 401)
      const cuerpo = await leerCuerpo(request)
      for (const campo of ['impresora', 'ancho', 'copias']) {
        if (cuerpo?.[campo] !== undefined) config[campo] = cuerpo[campo]
      }
      // Los destinos LAN permitidos viven acá: la app los sincroniza con las
      // impresoras guardadas para que el agente nunca imprima a un equipo ajeno.
      if (Array.isArray(cuerpo?.lan)) config.lan = cuerpo.lan.map(String).filter(Boolean)
      guardarConfig(config)
      cacheAlcance = { hasta: 0, ok: null }
      return responder(response, { ok: true, impresora: config.impresora, ancho: config.ancho, copias: config.copias, lan: config.lan })
    }

    return responder(response, { ok: false, error: 'Ruta no encontrada.' }, 404)
  } catch (error) {
    return responder(response, { ok: false, error: error?.message || 'Error del agente.' }, 400)
  }
})

ejecutarAutotest().then((resultado) => console.log(`[autotest] ${resultado.ok ? 'TCP OK' : `falla: ${resultado.error || 'sin detalle'}`}${resultado.cups ? ` · CUPS ${resultado.cups}` : ' · sin CUPS'}`)).catch((error) => console.error(`[autotest] no fatal: ${error?.message || error}`))

// Cada 90 segundos: si la IP secundaria se perdió (reinicio o cambio de red),
// se intenta recrearla en silencio (necesita el permiso del instalador).
setInterval(async () => {
  const alias = await aliasSecundario(config.alias)
  if (!alias.presente) {
    const reparada = await repararRed()
    if (reparada.agregado) console.log(`[red] IP secundaria ${config.alias} recreada en ${reparada.iface}`)
  }
}, 90000).unref()

servidor.listen(config.puerto, config.host, async () => {
  // Nada del arranque puede tumbar el proceso: un error acá dejaría a launchd
  // relanzando en loop (ya pasó con `interfaces` undefined).
  try {
    console.log(`MobOS Print ${VERSION} escuchando en http://${config.host}:${config.puerto}`)
    console.log(`Token: ${config.token}`)
    console.log(config.impresora ? `Impresora: ${config.impresora}` : 'Sin impresora elegida: configurala desde Configuración → Impresoras.')
    if (config.host === '0.0.0.0' && !config.token) {
      console.warn('ATENCIÓN: el agente acepta conexiones de la red y no tiene token. Cualquiera en la red podría imprimir.')
    }
    if (config.host === '0.0.0.0' && config.impresora) {
      const { interfaces = [] } = await diagnosticoRed(config.impresora)
      for (const ip of interfaces) console.log(`Puente de impresión: http://${ip}:${config.puerto} (poné esta dirección en las demás computadoras y móviles)`)
    } else if (config.host === '0.0.0.0') {
      console.log('Puente de impresión listo: configurá la impresora en Configuración → Impresoras.')
    }
    console.log('Si macOS pregunta si Node puede aceptar conexiones entrantes, aceptá (Firewall).')
  } catch (error) {
    console.error(`[arranque] Aviso no fatal: ${error?.message || error}`)
  }
})
