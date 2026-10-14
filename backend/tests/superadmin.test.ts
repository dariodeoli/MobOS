import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { correoDuenoPlataforma, decidirAcceso } from '../lib/superadmin/acceso-reglas'
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
const usuario = { status: 'ACTIVE', email: 'Dueno@Ejemplo.test' }
const google = { email: DUENO, googleSubject: 'g-1' }

test('acceso: dueño activo con cuenta de Google pasa; el correo se compara exacto sin importar mayúsculas', () => {
  assert.equal(decidirAcceso({ correoDueno: DUENO, usuario, cuenta: google, empresa: null }), true)
})

test('acceso: la empresa con correo del dueño verificado también habilita (sin Google)', () => {
  assert.equal(decidirAcceso({ correoDueno: DUENO, usuario, cuenta: null, empresa: { email: DUENO, emailVerifiedAt: new Date() } }), true)
  assert.equal(decidirAcceso({ correoDueno: DUENO, usuario, cuenta: null, empresa: { email: DUENO, emailVerifiedAt: null } }), false, 'sin verificar no pasa')
})

test('acceso: toda falla niega (sin entorno, inactivo, otro correo, cuenta ajena, correo sin verificar)', () => {
  assert.equal(decidirAcceso({ correoDueno: '', usuario, cuenta: google, empresa: null }), false)
  assert.equal(decidirAcceso({ correoDueno: DUENO, usuario: { ...usuario, status: 'SUSPENDED' }, cuenta: google, empresa: null }), false)
  assert.equal(decidirAcceso({ correoDueno: DUENO, usuario: { ...usuario, email: 'otro@ejemplo.test' }, cuenta: google, empresa: null }), false)
  assert.equal(decidirAcceso({ correoDueno: DUENO, usuario, cuenta: { email: 'otro@ejemplo.test', googleSubject: 'g-2' }, empresa: null }), false)
  assert.equal(decidirAcceso({ correoDueno: DUENO, usuario, cuenta: { email: DUENO, googleSubject: null }, empresa: null }), false)
  assert.equal(decidirAcceso({ correoDueno: DUENO, usuario: null, cuenta: google, empresa: null }), false)
  assert.equal(decidirAcceso({ correoDueno: DUENO, usuario: { status: 'ACTIVE', email: null }, cuenta: google, empresa: null }), false)
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
    const metodos = fuente.match(/export\s+(?:async\s+function|const|let|var)\s+(GET|POST|PUT|PATCH|DELETE)\b/g) ?? []
    assert.ok(metodos.length > 0, `${ruta}: sin handlers`)
    const envueltos = fuente.match(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=\s*conAdministradorPlataforma\(/g) ?? []
    assert.equal(envueltos.length, metodos.length, `${ruta}: todo handler debe usar conAdministradorPlataforma`)
    assert.doesNotMatch(fuente, /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)/, `${ruta}: sin handlers sueltos`)
    assert.doesNotMatch(fuente, /export\s+const\s+(?!GET|POST|PUT|PATCH|DELETE|dynamic|runtime|revalidate)\w+/, `${ruta}: no exportar símbolos que no sean handlers de Next`)
  }
})

test('acceso: el guard relee al usuario en la base y no hay correos fijos en el panel', () => {
  const guard = readFileSync(join(RAIZ, 'lib/superadmin/acceso.ts'), 'utf8')
  assert.match(guard, /prisma\.user\.findUnique/)
  assert.match(guard, /prisma\.tenant\.findUnique/)
  for (const archivo of archivos(join(RAIZ, 'lib/superadmin'), /\.ts$/)) {
    assert.doesNotMatch(readFileSync(archivo, 'utf8'), /[\w.+-]+@(?:gmail|hotmail|outlook)\.\w+/i, `${archivo}: correo fijo`)
  }
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
  for (const archivo of ['rangos.ts', 'acceso-reglas.ts']) {
    assert.doesNotMatch(readFileSync(join(RAIZ, 'lib/superadmin', archivo), 'utf8'), /from\s+['"][^'"]*(prisma|auth)['"]|@prisma\/client/, `${archivo} debe ser puro`)
  }
})
