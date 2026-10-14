import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { PIN_BLOQUEO_MS, PIN_INTENTOS_MAX, PIN_VENTANA_MS, reservarIntento, type EstadoGuardia } from '../lib/superadmin/pin-reglas'
import { correoDuenoPlataforma,decidirAcceso, motivoDenegacion } from '../lib/superadmin/acceso-reglas'
import { correoCambioReseteaVerificacion } from '../lib/tenant-email'
import { diaLocal, diasDelRango, inicioDiaLocal, inicioMesLocal, normalizarPeriodo, rangoDePeriodo, rellenarSerie, variacionPct } from '../lib/superadmin/rangos'

const RAIZ = resolve(__dirname, '..')

function archivos(dir: string, nombre: RegExp): string[] {
  return readdirSync(dir).flatMap(entrada => {
    const ruta = join(dir, entrada)
    return statSync(ruta).isDirectory() ? archivos(ruta, nombre) : nombre.test(entrada) ? [ruta] : []
  })
}

// ── Acceso ────────────────────────────────────────────────────────────────
const DUENO = 'dueno@ejemplo.test'
const usuario = { status: 'ACTIVE' }
const cuenta = { googleSubject: 'g-1' }
const identidad = { subject: 'g-1', email: 'Dueno@Ejemplo.test' }

test('acceso: dueño activo cuya identidad de Google (verificada) trae su correo pasa; se compara sin importar mayúsculas', () => {
  assert.equal(decidirAcceso({ correoDueno: DUENO, usuario, cuenta, identidad }), true)
})

test('acceso: toda falla niega y devuelve un motivo sin datos personales', () => {
  const base = { correoDueno: DUENO, usuario, cuenta, identidad }
  assert.equal(motivoDenegacion({ ...base, correoDueno: '' }), 'sin_configuracion')
  assert.equal(motivoDenegacion({ ...base, usuario: { status: 'SUSPENDED' } }), 'usuario_inactivo')
  assert.equal(motivoDenegacion({ ...base, usuario: null }), 'usuario_inactivo')
  assert.equal(motivoDenegacion({ ...base, cuenta: null }), 'sin_cuenta_google')
  assert.equal(motivoDenegacion({ ...base, cuenta: { googleSubject: null } }), 'sin_cuenta_google')
  assert.equal(motivoDenegacion({ ...base, identidad: null }), 'identidad_no_coincide')
  assert.equal(motivoDenegacion({ ...base, identidad: { subject: 'g-otro', email: DUENO } }), 'identidad_no_coincide')
  assert.equal(motivoDenegacion({ ...base, identidad: { subject: 'g-1', email: 'otro@ejemplo.test' } }), 'correo_distinto')
  assert.equal(motivoDenegacion({ ...base, identidad: { subject: 'g-1', email: null } }), 'correo_distinto')
})

test('acceso: Tenant.email / User.email (editables por la empresa) no son prueba: la regla no los recibe ni los lee', () => {
  const reglas = readFileSync(join(RAIZ, 'lib/superadmin/acceso-reglas.ts'), 'utf8')
  const codigo = reglas.replace(/\/\/.*$/gm, '')
  assert.doesNotMatch(codigo, /emailVerifiedAt|empresa|tenant/i)
  const guard = readFileSync(join(RAIZ, 'lib/superadmin/acceso.ts'), 'utf8')
  assert.doesNotMatch(guard, /prisma\.tenant\./, 'el guard no consulta Tenant')
  assert.match(guard, /prisma\.googleIdentity\.findUnique/)
})

test('acceso: el correo del dueño sale solo del entorno y se valida', () => {
  assert.equal(correoDuenoPlataforma({}), '')
  assert.equal(correoDuenoPlataforma({ MOBOS_PLATFORM_OWNER_EMAIL: 'no-es-correo' }), '')
  assert.equal(correoDuenoPlataforma({ MOBOS_PLATFORM_OWNER_EMAIL: ' Dueno@Ejemplo.test ' }), DUENO)
})

test('acceso: TODA ruta de /api/superadmin exporta sus handlers con conAdministradorPlataforma', () => {
  const rutas = archivos(join(RAIZ, 'app/api/superadmin'), /^route\.ts$/)
  assert.ok(rutas.length >= 5, 'se esperan las rutas del panel')
  for (const ruta of rutas) {
    const fuente = readFileSync(ruta, 'utf8')
    const metodos = fuente.match(/export\s+(?:async\s+function|const|let|var)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g) ?? []
    assert.ok(metodos.length > 0, `${ruta}: sin handlers`)
    const envueltos = fuente.match(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*=\s*conAdministradorPlataforma\(/g) ?? []
    assert.equal(envueltos.length, metodos.length, `${ruta}: todo handler debe usar conAdministradorPlataforma`)
    assert.doesNotMatch(fuente, /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)/, `${ruta}: sin handlers sueltos`)
    assert.doesNotMatch(fuente, /export\s+const\s+(?!GET\b|POST\b|PUT\b|PATCH\b|DELETE\b|HEAD\b|OPTIONS\b|dynamic\b|runtime\b|revalidate\b)\w+/, `${ruta}: no exportar símbolos que no sean handlers de Next`)
  }
})

test('acceso: el guard limita intentos antes de consultar, relee la base, loguea denegaciones sin PII y no hay correos fijos', () => {
  const guard = readFileSync(join(RAIZ, 'lib/superadmin/acceso.ts'), 'utf8')
  assert.match(guard, /prisma\.user\.findUnique/)
  assert.ok(guard.indexOf('enforceRateLimit(') < guard.indexOf('requerirAdministradorPlataforma(request)'), 'el límite va antes del guard')
  assert.match(guard, /superadmin_acceso_denegado/)
  assert.doesNotMatch(guard, /logInfo\([^)]*(email|correo)/i)
  for (const archivo of archivos(join(RAIZ, 'lib/superadmin'), /\.ts$/)) {
    assert.doesNotMatch(readFileSync(archivo, 'utf8'), /[\w.+-]+@(?:gmail|hotmail|outlook)\.\w+/i, `${archivo}: correo fijo`)
  }
})

test('verificación de correo: cambiar el correo de la empresa la deja sin verificar (y la ruta lo aplica)', () => {
  assert.equal(correoCambioReseteaVerificacion('a@x.test', 'b@x.test'), true)
  assert.equal(correoCambioReseteaVerificacion('a@x.test', ' A@X.test '), false)
  assert.equal(correoCambioReseteaVerificacion(null, 'b@x.test'), true)
  const ruta = readFileSync(join(RAIZ, 'app/api/account/route.ts'), 'utf8')
  assert.match(ruta, /correoCambioReseteaVerificacion\(current\.email, nextEmail\) \? \{ emailVerifiedAt: null \}/)
})

test('google: la identidad guarda el correo verificado en cada login (único origen de GoogleIdentity.email)', () => {
  const company = readFileSync(join(RAIZ, 'lib/google-company.ts'), 'utf8')
  assert.doesNotMatch(company, /googleIdentity\.upsert/, 'todo upsert pasa por recordGoogleIdentity')
  assert.ok((company.match(/recordGoogleIdentity\(/g) ?? []).length >= 3)
  const escritores = archivos(RAIZ, /\.ts$/).filter(f => !f.includes('node_modules') && !f.includes('.next') && /googleIdentity\.(upsert|update|create)/.test(readFileSync(f, 'utf8')))
  assert.deepEqual(escritores.map(f => f.slice(RAIZ.length + 1)), ['lib/membership.ts'])
})

// ── Segundo factor (PIN) ──────────────────────────────────────────────────
test('pin: toda ruta exige el PIN salvo access y pin, que solo corren tras comprobar al dueño', () => {
  const base = join(RAIZ, 'app/api/superadmin')
  const rutas = archivos(base, /^route\.ts$/)
  const sinPin = rutas.filter(r => /\{\s*sinPin:\s*true\s*\}/.test(readFileSync(r, 'utf8'))).map(r => r.slice(base.length + 1))
  assert.deepEqual(sinPin.sort(), ['access/route.ts', 'pin/route.ts'])
  const guard = readFileSync(join(RAIZ, 'lib/superadmin/acceso.ts'), 'utf8')
  assert.match(guard, /if \(!opciones\.sinPin\)[\s\S]*pinVigente\(dueno\.sessionId\)/, 'el guard exige el PIN de la sesión')
  assert.ok(guard.indexOf('requerirAdministradorPlataforma(request)') < guard.indexOf('pinVigente(dueno.sessionId)'), 'primero el dueño, después el PIN')
  assert.match(guard, /pin_requerido/)
  const acceso = readFileSync(join(RAIZ, 'app/api/superadmin/access/route.ts'), 'utf8')
  assert.match(acceso, /pinRequerido/)
  assert.match(acceso, /conAdministradorPlataforma\(/, 'el aviso de PIN requerido va detrás del chequeo del dueño')
})

test('pin: la vigencia es de 12 h, vive en la sesión (no en una cookie suelta) y usa el reloj de Postgres', () => {
  const pin = readFileSync(join(RAIZ, 'lib/superadmin/pin.ts'), 'utf8')
  assert.match(pin, /"superadminVerifiedAt" > \(now\(\) AT TIME ZONE 'UTC'\)/)
  assert.match(pin, /FROM "Session" WHERE "id" = \$\{sessionId\} AND "revokedAt" IS NULL/, 'atado a la sesión viva')
  assert.match(pin, /UPDATE "Session" SET "superadminVerifiedAt" = \(now\(\) AT TIME ZONE 'UTC'\) WHERE "id" = \$\{sessionId\}/)
  assert.doesNotMatch(pin, /Date\.now\(\)|new Date\(\)/, 'ni la vigencia ni el bloqueo usan el reloj de Node')
  assert.match(pin, /bcrypt\.compare/)
  assert.match(pin, /pinHash/, 'reutiliza el PIN personal del usuario')
  assert.ok(pin.indexOf('FOR UPDATE') < pin.indexOf('bcrypt.compare'), 'el intento se cuenta antes de verificar')
  assert.match(readFileSync(join(RAIZ, 'lib/superadmin/pin-reglas.ts'), 'utf8'), /PIN_VIGENCIA_HORAS = 12/)
  assert.doesNotMatch(readFileSync(join(RAIZ, 'app/api/superadmin/pin/route.ts'), 'utf8'), /Set-Cookie|cookies\(/i)
})

test('pin: 5 intentos por ventana de 15 min y luego 15 min de bloqueo, contados por usuario', () => {
  const t0 = new Date('2026-10-14T15:00:00Z')
  let estado: EstadoGuardia | null = null
  for (let i = 1; i <= PIN_INTENTOS_MAX; i++) {
    const r = reservarIntento(estado, new Date(t0.getTime() + i * 1000))
    assert.equal(r.permitido, true, `intento ${i}`)
    if (!r.permitido) return
    assert.equal(r.siguiente.failures, i)
    assert.equal(r.restantes, PIN_INTENTOS_MAX - i)
    estado = r.siguiente
  }
  assert.ok(estado?.lockedUntil, 'el quinto intento deja bloqueado')
  const bloqueado = reservarIntento(estado, new Date(t0.getTime() + 60_000))
  assert.equal(bloqueado.permitido, false)
  if (!bloqueado.permitido) assert.ok(bloqueado.segundos > 0 && bloqueado.segundos <= PIN_BLOQUEO_MS / 1000)
  // Sigue negando durante todo el bloqueo, aunque pase la ventana de 15 min desde el primer intento.
  assert.equal(reservarIntento(estado, new Date(t0.getTime() + PIN_BLOQUEO_MS - 1000)).permitido, false)
  // Vencido el bloqueo, el conteo arranca de nuevo.
  const despues = reservarIntento(estado, new Date(t0.getTime() + PIN_BLOQUEO_MS + 10_000))
  assert.equal(despues.permitido, true)
  if (despues.permitido) assert.equal(despues.siguiente.failures, 1)
})

test('pin: fuera de la ventana el conteo se reinicia', () => {
  const t0 = new Date('2026-10-14T15:00:00Z')
  const viejo: EstadoGuardia = { failures: 4, windowStartedAt: t0, lockedUntil: null }
  const r = reservarIntento(viejo, new Date(t0.getTime() + PIN_VENTANA_MS))
  assert.equal(r.permitido && r.siguiente.failures, 1)
  const dentro = reservarIntento(viejo, new Date(t0.getTime() + PIN_VENTANA_MS - 1))
  assert.equal(dentro.permitido && dentro.siguiente.failures, 5)
})

test('pin: el conteo es por usuario y no por IP (cambiar de red no lo reinicia)', () => {
  const pin = readFileSync(join(RAIZ, 'lib/superadmin/pin.ts'), 'utf8')
  assert.doesNotMatch(pin, /trustedClientIp|enforceRateLimit|x-forwarded-for/i)
  assert.match(pin, /WHERE "userId" = \$\{userId\} FOR UPDATE/)
})

// ── Demo ──────────────────────────────────────────────────────────────────
test('demo: toda consulta SQL del panel usa filtroSinDemo (o filtroSoloDemo para el contador aparte)', () => {
  const fuente = readFileSync(join(RAIZ, 'lib/superadmin/consultas.ts'), 'utf8')
  assert.doesNotMatch(fuente, /prisma\.(?!\$queryRaw)\w+\.(findMany|findFirst|findUnique|groupBy|count|aggregate)/, 'solo SQL crudo con el filtro')
  const consultas = fuente.split('$queryRaw').slice(1)
  assert.ok(consultas.length >= 10)
  consultas.forEach((trozo, i) => {
    const cuerpo = trozo.split(/\n\s*\]\)|\n\}/)[0]
    assert.match(cuerpo, /filtro(Sin|Solo)Demo\(/, `consulta #${i + 1} sin filtro de demo`)
  })
})

// ── Rangos, deltas y zona horaria ─────────────────────────────────────────
test('rangos: el día se corta en America/Asuncion (UTC-3), no en UTC', () => {
  // 2026-10-14 01:30 UTC sigue siendo el 13 en Asunción.
  const t = Date.UTC(2026, 9, 14, 1, 30)
  assert.equal(diaLocal(t), '2026-10-13')
  assert.equal(new Date(inicioDiaLocal(t)).toISOString(), '2026-10-13T03:00:00.000Z')
  assert.equal(new Date(inicioMesLocal(Date.UTC(2026, 10, 1, 1, 0))).toISOString(), '2026-10-01T03:00:00.000Z')
})

test('rangos: 7 y 30 días terminan hoy, tienen N días y el previo es de igual duración', () => {
  const ahora = new Date(Date.UTC(2026, 9, 14, 15, 0))
  for (const n of [7, 30, 90]) {
    const r = rangoDePeriodo(String(n) as '7', ahora)
    assert.equal(r.dias.length, n)
    assert.equal(r.diasPrevios.length, n)
    assert.equal(r.dias.at(-1), '2026-10-14')
    assert.equal(r.previoHasta.getTime(), r.desde.getTime())
    assert.equal(r.hasta.getTime() - r.desde.getTime(), r.previoHasta.getTime() - r.previoDesde.getTime())
  }
})

test('rangos: hoy y mes actual comparan lo transcurrido; mes anterior es el mes completo', () => {
  const ahora = new Date(Date.UTC(2026, 9, 14, 15, 0)) // 12:00 en Asunción
  const hoy = rangoDePeriodo('hoy', ahora)
  assert.deepEqual(hoy.dias, ['2026-10-14'])
  assert.deepEqual(hoy.diasPrevios, ['2026-10-13'])
  assert.equal(hoy.hasta.getTime() - hoy.desde.getTime(), hoy.previoHasta.getTime() - hoy.previoDesde.getTime())
  const mes = rangoDePeriodo('mes', ahora)
  assert.equal(mes.dias.length, 14)
  assert.equal(mes.dias[0], '2026-10-01')
  assert.equal(mes.diasPrevios[0], '2026-09-01')
  const anterior = rangoDePeriodo('mes-anterior', ahora)
  assert.equal(anterior.dias.length, 30)
  assert.equal(anterior.dias[0], '2026-09-01')
  assert.equal(anterior.dias.at(-1), '2026-09-30')
  assert.equal(anterior.diasPrevios.length, 30)
  assert.equal(anterior.diasPrevios[0], '2026-08-01')
})

test('rangos: mes anterior más corto que el previo no se solapa con el período', () => {
  const r = rangoDePeriodo('mes-anterior', new Date(Date.UTC(2026, 2, 10, 15, 0))) // febrero (28) vs enero (31)
  assert.equal(r.dias.length, 28)
  assert.ok(r.previoHasta.getTime() <= r.desde.getTime())
  assert.equal(r.diasPrevios.length, 28)
})

test('rangos: período inválido cae al default y diasDelRango vacío no rompe', () => {
  assert.equal(normalizarPeriodo('999'), '30')
  assert.equal(normalizarPeriodo(undefined), '30')
  assert.equal(normalizarPeriodo('mes'), 'mes')
  assert.deepEqual(diasDelRango(10, 10), [])
})

test('delta: variación porcentual con un decimal; sin base devuelve null (nunca inventa)', () => {
  assert.equal(variacionPct(150, 100), 50)
  assert.equal(variacionPct(50, 100), -50)
  assert.equal(variacionPct(10, 3), 233.3)
  assert.equal(variacionPct(5, 0), null)
  assert.equal(variacionPct(0, 0), null)
  assert.equal(variacionPct(Number.NaN, 4), null)
})

test('series: los días sin datos valen 0 y se agrupan por día', () => {
  const serie = rellenarSerie([{ dia: '2026-10-02', valor: 3 }, { dia: '2026-10-02', valor: 2 }, { dia: '2026-09-01', valor: 9 }], ['2026-10-01', '2026-10-02', '2026-10-03'])
  assert.deepEqual(serie.map(p => p.valor), [0, 5, 0])
})

test('módulos puros: ninguno importa la base de datos', () => {
  for (const archivo of ['rangos.ts', 'acceso-reglas.ts', 'pin-reglas.ts']) {
    assert.doesNotMatch(readFileSync(join(RAIZ, 'lib/superadmin', archivo), 'utf8'), /from\s+['"][^'"]*(prisma|auth)['"]|@prisma\/client/, `${archivo} debe ser puro`)
  }
})
