// Correos de la demo pública: validación, sanitizado, cuota (Postgres simulado en
// memoria con la misma API de transacción) y ruta (429, 400, flag apagado, origen).
// Nunca manda correos reales: el transporte es un stub que registra el mensaje.
import assert from 'node:assert/strict'
import { load, auth, http } from './ruc-demo.test.mjs'

const identity = load('../lib/identity.ts')
const publicRuc = load('../lib/ruc-public.ts', { './ruc': { RucLookupError: class extends Error {}, normalizeRuc: () => ({}) }, './identity': identity })
const orderNumber = load('../lib/order-number.ts')
const email = load('../lib/email.ts', { './identity': identity, './email-outbox-crypto': { emailOutboxEncryptionConfigured: () => false }, './order-number': orderNumber })
const demo = load('../lib/demo-email.ts')

// Store en memoria con la forma de `tx` que usa la cuota.
function fakeDb() {
  const rows = []
  const match = (row, where) => row.scope === where.scope && row.fingerprint === where.fingerprint
    && (!where.createdAt?.gte || row.createdAt >= where.createdAt.gte) && (!where.createdAt?.lt || row.createdAt < where.createdAt.lt)
  const tx = {
    $executeRaw: async () => 1,
    $queryRaw: async () => [{ nowMs: BigInt(Date.now()) }],
    authAttempt: {
      count: async ({ where }) => rows.filter(row => match(row, where)).length,
      findFirst: async ({ where }) => rows.filter(row => match(row, where)).sort((a, b) => a.createdAt - b.createdAt)[0] ?? null,
      deleteMany: async ({ where }) => { for (let i = rows.length - 1; i >= 0; i -= 1) if (match(rows[i], where)) rows.splice(i, 1); return { count: 0 } },
      create: async ({ data }) => { rows.push({ ...data }); return data },
    },
  }
  return { rows, $transaction: async fn => fn(tx) }
}

const pedido = (extra = {}) => ({
  kind: 'receipt', number: 'AUR-#0007', email: 'cliente@gmail.com', customerName: 'María <b>González</b>',
  items: [{ quantity: 1, description: 'iPhone 15 · 128 GB', unitPricePyg: 4850000 }, { quantity: 2, description: 'Funda', unitPricePyg: 90000 }],
  discountPyg: 30000, totalPyg: 5000000, ...extra,
})

export async function unit() {
  const saved = { ...process.env }
  let checks = 0
  const ok = (value, message) => { assert.ok(value, message); checks += 1 }
  const equal = (a, b) => { assert.deepEqual(a, b); checks += 1 }
  const rejects = async (fn, code) => { await assert.rejects(fn, e => e.code === code, code); checks += 1 }
  try {
    process.env.MOBOS_APP_URL = 'https://app.moboss.online'

    // Validación de la solicitud.
    const parsed = demo.parseDemoEmailRequest(pedido())
    equal(parsed.customerName, 'María González')
    equal(parsed.totalPyg, 5000000)
    equal(parsed.email, 'cliente@gmail.com')
    for (const [mutacion, code] of [
      [{ kind: 'otro' }, 'invalid_request'], [{ number: 'x' }, 'invalid_request'], [{ items: [] }, 'invalid_request'],
      [{ items: Array.from({ length: 11 }, () => ({ quantity: 1, description: 'a', unitPricePyg: 1 })), totalPyg: undefined, discountPyg: 0 }, 'invalid_request'],
      [{ totalPyg: 1 }, 'invalid_request'], [{ discountPyg: 99999999999 }, 'invalid_request'], [{ adjunto: 'http://x' }, 'invalid_request'],
      [{ items: [{ quantity: 0, description: 'a', unitPricePyg: 1 }], totalPyg: undefined, discountPyg: 0 }, 'invalid_request'],
      [{ items: [{ quantity: 1, description: 'a', unitPricePyg: 1, html: '<b>' }], totalPyg: undefined, discountPyg: 0 }, 'invalid_request'],
      [{ validUntil: '2026-10-10' }, 'invalid_request'],
    ]) await rejects(async () => demo.parseDemoEmailRequest(pedido(mutacion)), code)
    for (const body of [null, [], 'x', 5]) await rejects(async () => demo.parseDemoEmailRequest(body), 'invalid_request')

    // Un solo destinatario, formato y desechables.
    for (const value of ['a@b.com, c@d.com', 'a@b.com;c@d.com', 'a b@c.com', '<a@b.com>', 'a@@b.com', 'a@b', '', '"x"@b.com', 'x@b.com\nBcc: y@z.com', 5, null]) {
      await rejects(async () => demo.normalizeDemoEmailAddress(value), 'invalid_email')
    }
    for (const value of ['x@mailinator.com', 'x@sub.yopmail.com', 'x@Example.com', 'lucia@ejemplo.com', 'x@tienda.ejemplo', 'x@algo.invalid']) await rejects(async () => demo.normalizeDemoEmailAddress(value), 'disposable_email')
    equal(demo.normalizeDemoEmailAddress(' Ana@Gmail.COM '), 'Ana@gmail.com')

    // Sanitizado: sin etiquetas, enlaces, correos, controles; truncado.
    equal(demo.sanitizeDemoText('<script>alert(1)</script> Ana', 60), 'alert(1) Ana')
    equal(demo.sanitizeDemoText('Visitá https://evil.test/x y www.malo.com o a@b.com ya', 60), 'Visitá y o ya')
    equal(demo.sanitizeDemoText('promo.click ahora', 60), 'ahora')
    equal(demo.sanitizeDemoText('a\u0000\u0007b\r\n c', 60), 'a b c')
    equal(demo.sanitizeDemoText('x'.repeat(200), 60).length, 60)
    equal(demo.sanitizeDemoText(undefined, 60), '')
    equal(demo.demoEmailQuotaKey('A.B+x@Googlemail.com'), 'ab@gmail.com')

    // Armado del correo: banda demo, CTA al registro, sin datos reales, todo escapado.
    process.env.NODE_ENV = 'test'
    for (const kind of ['receipt', 'quote', 'ready_for_pickup', 'in_transit', 'delivered']) {
      const message = email.demoDocumentEmail({ to: 'a@gmail.com', kind, number: 'AUR-#0007', customerName: 'Ana', items: parsed.items, discountPyg: 30000, totalPyg: 5000000, validUntilLabel: '30/10/2026' })
      ok(message && message.html.includes('Demo de MobOS · datos ficticios') && message.text.includes('Demo de MobOS · datos ficticios'), `leyenda ${kind}`)
      ok(message.html.includes('data-demo-band') && message.html.includes('https://app.moboss.online/login') && message.html.includes('https://app.moboss.online/demo'), `enlaces demo/registro ${kind}`)
      ok(message.subject.includes('Demo de MobOS'), `asunto ${kind}`)
      ok(!/href="(?!https:\/\/app\.moboss\.online\/(demo|login))/.test(message.html), `solo enlaces propios ${kind}`)
    }
    const xss = email.demoDocumentEmail({ to: 'a@gmail.com', kind: 'receipt', number: 'AUR-#0007', customerName: '<img src=x onerror=1>', items: [{ quantity: 1, description: '<b>x</b>', unitPricePyg: 1 }], totalPyg: 1 })
    ok(!xss.html.includes('<img src=x') && !xss.html.includes('<b>x</b>'), 'escapa HTML')
    equal(email.demoDocumentEmail({ to: 'no-es-correo', kind: 'receipt', number: 'AUR-1', customerName: '', items: parsed.items, totalPyg: 1 }), null)

    // Cuota: 5/correo, 10/red, 200/global; el alias no evade; ventanas por separado.
    const request = (headers = {}) => new Request('https://api.example.test/api/public/demo-email', { method: 'POST', headers: { origin: 'https://app.moboss.online', ...headers } })
    const quota = load('../lib/demo-email-quota.ts', { './prisma': { prisma: {} }, './auth': auth, './demo-email': demo })
    process.env.MOBOS_TRUST_PROXY = 'true'
    let db = fakeDb()
    for (let i = 0; i < 5; i += 1) await quota.reserveDemoEmailQuota(request({ 'x-forwarded-for': `203.0.113.${i + 1}` }), `ana${i ? `+${i}` : ''}@gmail.com`, { db })
    equal(db.rows.length, 15)
    await assert.rejects(() => quota.reserveDemoEmailQuota(request({ 'x-forwarded-for': '203.0.113.99' }), 'a.na@gmail.com', { db }), e => e.code === 'demo_rate_limited_recipient' && e.status === 429 && e.retryAfterSeconds > 0); checks += 1
    equal(db.rows.length, 15) // el rechazo no consume cuota
    db = fakeDb()
    for (let i = 0; i < 10; i += 1) await quota.reserveDemoEmailQuota(request({ 'x-forwarded-for': '198.51.100.7' }), `u${i}@dominio.com`, { db })
    await rejects(() => quota.reserveDemoEmailQuota(request({ 'x-forwarded-for': '198.51.100.7' }), 'otro@dominio.com', { db }), 'demo_rate_limited_network')
    await quota.reserveDemoEmailQuota(request({ 'x-forwarded-for': '198.51.100.8' }), 'otro@dominio.com', { db }); checks += 1
    db = fakeDb()
    const env = { DEMO_EMAIL_GLOBAL_DAILY_LIMIT: '2' }
    await quota.reserveDemoEmailQuota(request({ 'x-forwarded-for': '192.0.2.1' }), 'a@dominio.com', { db, env })
    await quota.reserveDemoEmailQuota(request({ 'x-forwarded-for': '192.0.2.2' }), 'b@dominio.com', { db, env })
    await rejects(() => quota.reserveDemoEmailQuota(request({ 'x-forwarded-for': '192.0.2.3' }), 'c@dominio.com', { db, env }), 'demo_rate_limited_global')
    // Ventana vencida (>24 h) no cuenta y se limpia.
    db = fakeDb()
    db.rows.push(...Array.from({ length: 5 }, () => ({ scope: 'demo-email:recipient', fingerprint: quota.demoEmailRecipientFingerprint('viejo@dominio.com'), createdAt: new Date(Date.now() - 25 * 3600_000) })))
    await quota.reserveDemoEmailQuota(request({ 'x-forwarded-for': '192.0.2.9' }), 'viejo@dominio.com', { db }); checks += 1
    // Límites mal configurados o por encima del tope: sin vía libre.
    for (const [name, value] of [['DEMO_EMAIL_GLOBAL_DAILY_LIMIT', '0'], ['DEMO_EMAIL_NETWORK_DAILY_LIMIT', '11'], ['DEMO_EMAIL_RECIPIENT_DAILY_LIMIT', '1e1'], ['DEMO_EMAIL_RECIPIENT_DAILY_LIMIT', '']]) {
      let tx = 0
      await assert.rejects(() => quota.reserveDemoEmailQuota(request(), 'a@dominio.com', { env: { [name]: value }, db: { $transaction: async () => { tx += 1 } } }), e => e.code === 'demo_quota_not_configured'); equal(tx, 0)
    }
    delete process.env.MOBOS_TRUST_PROXY

    // Ruta.
    const sent = []
    let transport = true
    let routeDb = fakeDb()
    const makeRoute = () => load('../app/api/public/demo-email/route.ts', {
      '../../../../lib/http': http, '../../../../lib/log': { logError: () => {}, logInfo: (...args) => logs.push(args) },
      '../../../../lib/email': { ...email, emailTransportConfigured: () => transport, sendTransactionalEmail: async message => { sent.push(message); return !message.to.startsWith('falla@') } },
      '../../../../lib/ruc-public': publicRuc, '../../../../lib/auth': auth, '../../../../lib/demo-email': demo,
      '../../../../lib/demo-email-quota': { reserveDemoEmailQuota: (req, to) => quota.reserveDemoEmailQuota(req, to, { db: routeDb }) },
    })
    const logs = []
    const route = makeRoute()
    const post = (body, headers = {}) => route.POST(new Request('https://api.example.test/api/public/demo-email', { method: 'POST', headers: { origin: 'https://app.moboss.online', 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.50', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }))

    // Apagado (por defecto): 503, nada se envía ni se cuenta.
    delete process.env.DEMO_EMAIL_ENABLED
    let res = await post(pedido()); equal(res.status, 503); equal((await res.json()).details.code, 'demo_email_disabled'); equal(res.headers.get('cache-control'), 'private, no-store')
    process.env.DEMO_EMAIL_ENABLED = 'false'; res = await post(pedido()); equal(res.status, 503)
    equal([sent.length, routeDb.rows.length], [0, 0])
    process.env.DEMO_EMAIL_ENABLED = 'true'

    // Origen no permitido.
    for (const origin of ['', 'https://evil.test', 'null']) { res = await post(pedido(), { origin }); equal(res.status, 403) }
    // Inválidos: 400 sin enviar ni gastar cuota.
    for (const body of ['no-json', '{', JSON.stringify([]), pedido({ email: 'a@mailinator.com' }), pedido({ email: 'a@b.com,c@d.com' }), pedido({ kind: 'x' }), pedido({ totalPyg: 7 }), 'x'.repeat(9000)]) {
      res = await post(body); ok([400, 413].includes(res.status), `inválido ${String(body).slice(0, 20)}`)
    }
    equal([sent.length, routeDb.rows.length], [0, 0])
    // Transporte sin configurar: 503 sin gastar cuota.
    transport = false; res = await post(pedido()); equal(res.status, 503); equal(routeDb.rows.length, 0); transport = true
    // Éxito: un solo destinatario, sin adjuntos, la respuesta no devuelve el correo ni el cuerpo.
    res = await post(pedido()); equal(res.status, 200); equal(await res.json(), { sent: true, kind: 'receipt' })
    equal(sent.length, 1); equal(sent[0].to, 'cliente@gmail.com'); ok(sent[0].idempotencyKey.startsWith('demo-email:'), 'idempotencia'); equal(Object.keys(sent[0]).sort(), ['html', 'idempotencyKey', 'subject', 'text', 'to'])
    ok(sent[0].html.includes('Demo de MobOS · datos ficticios'), 'banda en el envío')
    ok(!JSON.stringify(logs).includes('cliente@gmail.com'), 'el log no guarda el correo completo')
    // Quinto envío al mismo correo OK, sexto 429 con Retry-After.
    for (let i = 0; i < 4; i += 1) { res = await post(pedido(), { 'x-forwarded-for': `203.0.113.${60 + i}` }); equal(res.status, 200) }
    res = await post(pedido(), { 'x-forwarded-for': '203.0.113.70' }); equal(res.status, 429); ok(Number(res.headers.get('Retry-After')) > 0, 'Retry-After'); equal(res.headers.get('cache-control'), 'private, no-store')
    equal(sent.length, 5)
    // Falla del relay: 502 con mensaje seguro.
    res = await post(pedido({ email: 'falla@dominio.com' })); equal(res.status, 502)
    // Fallo inesperado: 503 sin filtrar el detalle.
    routeDb = { $transaction: async () => { throw new Error('SECRET-DATABASE-CANARY') } }
    res = await post(pedido({ email: 'otra@dominio.com' })); equal(res.status, 503); ok(!(await res.text()).includes('SECRET'), 'sin filtrar detalles')

    // Middleware: la ruta nueva es pública (sin cookies ni credenciales CORS).
    const { createRequire } = await import('node:module')
    const require = createRequire(import.meta.url)
    const { NextRequest } = require('next/server')
    let forwarded
    const middleware = load('../middleware.ts', { 'next/server': require('next/server'), './lib/log': { logInfo: () => {}, logError: () => {} }, './lib/internal': load('../lib/internal.ts'), './lib/identity': identity },
      { crypto: (await import('node:crypto')).webcrypto, fetch: async (url, init) => { forwarded = new Headers(init.headers); return new Response('{}', { status: 200 }) } })
    const preflight = await middleware.middleware(new NextRequest('https://api.example.test/api/public/demo-email', { method: 'OPTIONS', headers: { origin: 'https://app.moboss.online' } }))
    equal([preflight.status, preflight.headers.get('access-control-allow-credentials'), preflight.headers.get('cache-control')], [204, null, 'private, no-store'])
    await middleware.middleware(new NextRequest('https://api.example.test/api/public/demo-email', { method: 'POST', body: '{}', headers: { origin: 'https://app.moboss.online', authorization: 'Bearer SECRET', cookie: 'SECRET=1' } }))
    equal([forwarded.get('authorization'), forwarded.get('cookie'), forwarded.get('x-mobos-cookie')], [null, null, null])
    console.log(`Demo email unit: ${checks} PASS`)
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]
    Object.assign(process.env, saved)
  }
}
if (process.argv[1] === new URL(import.meta.url).pathname) await unit()
