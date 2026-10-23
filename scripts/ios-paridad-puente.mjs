// Puente de QA para el simulador de iPhone. Sirve `dist/` (build VITE_PLATFORM=ios)
// por HTTP en 127.0.0.1 inyectando un cliente que ejecuta JS ordenado desde acá
// DENTRO de la WebView real de la app. Solo se usa para sacar capturas/medidas:
// el build de producción no lo incluye (la app de tienda carga el bundle local).
//
// Uso:  node scripts/ios-paridad-puente.mjs [puerto]   (deja el servidor andando)
// Ordenes:  curl -s --data-binary @paso.js http://127.0.0.1:5433/__paridad/run
import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(fileURLToPath(new URL('..', import.meta.url)), 'dist')
const puerto = Number(process.argv[2] || process.env.PUERTO_PUENTE || 5433)
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' }

const cliente = `(() => {
  if (window.__paridadCliente) return; window.__paridadCliente = true
  const ciclo = async () => {
    for (;;) {
      try {
        const r = await fetch('/__paridad/next'); if (r.status === 204) continue
        const { id, js } = await r.json(); let salida
        try { const AF = Object.getPrototypeOf(async function () {}).constructor; salida = { ok: true, valor: await new AF(js)() } } catch (e) { salida = { ok: false, error: String(e && e.message || e) } }
        await fetch('/__paridad/result?id=' + id, { method: 'POST', body: JSON.stringify(salida === undefined ? null : salida) })
      } catch { await new Promise((r) => setTimeout(r, 800)) }
    }
  }
  ciclo()
})()`

let cola = []; let esperando = null; const pendientes = new Map(); let n = 0
const leer = (req) => new Promise((ok) => { const t = []; req.on('data', (c) => t.push(c)); req.on('end', () => ok(Buffer.concat(t).toString())) })

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  if (url.pathname === '/__paridad/cliente.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(cliente) }
  if (url.pathname === '/__paridad/next') {
    const entregar = () => { const o = cola.shift(); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)) }
    if (cola.length) return entregar()
    esperando = entregar
    const t = setTimeout(() => { if (esperando) { esperando = null; res.writeHead(204); res.end() } }, 20000)
    res.on('close', () => { clearTimeout(t); if (esperando) esperando = null })
    return
  }
  if (url.pathname === '/__paridad/result') {
    const id = url.searchParams.get('id'); const cuerpo = await leer(req); const p = pendientes.get(id)
    if (p) { pendientes.delete(id); p(cuerpo) } res.writeHead(200); return res.end('ok')
  }
  if (url.pathname === '/__paridad/run') {
    const js = await leer(req); const id = String(++n)
    const resultado = new Promise((ok) => pendientes.set(id, ok))
    const orden = { id, js }
    if (esperando) { const e = esperando; esperando = null; cola.push(orden); e() } else cola.push(orden)
    const timeout = new Promise((ok) => setTimeout(() => ok(JSON.stringify({ ok: false, error: 'timeout: la app no respondió (¿abierta y cargada desde el puente?)' })), 60000))
    const cuerpo = await Promise.race([resultado, timeout]); res.writeHead(200, { 'content-type': 'application/json' }); return res.end(cuerpo)
  }
  // Archivos estáticos de dist/ (con SPA fallback a index.html).
  let ruta = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '')
  let archivo = join(raiz, ruta)
  try { if ((await stat(archivo)).isDirectory()) archivo = join(archivo, 'index.html') } catch { archivo = join(raiz, 'index.html') }
  try {
    let cuerpo = await readFile(archivo)
    if (archivo.endsWith('index.html')) cuerpo = Buffer.from(cuerpo.toString().replace('<head>', '<head><script src="/__paridad/cliente.js"></script>'))
    res.writeHead(200, { 'content-type': tipos[extname(archivo)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(cuerpo)
  } catch { res.writeHead(404); res.end('no encontrado') }
}).listen(puerto, '127.0.0.1', () => console.log(`puente de paridad en http://127.0.0.1:${puerto} (sirve ${raiz})`))
