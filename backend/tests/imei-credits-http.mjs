// Créditos de verificación IMEI (docs/IMEI-CREDITOS.md): consumo atómico,
// reembolso único, tope de arrastre y acciones exclusivas del dueño de la plataforma.
// Uso: node backend/tests/imei-credits-http.mjs BASE_URL ADMIN_TOKEN DATABASE_URL PG_BIN
// El servidor del arnés corre con MOBOS_PLATFORM_OWNER_EMAIL=platform-owner-it@example.invalid.

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const [baseUrl, adminToken, databaseUrl, pgBin] = process.argv.slice(2)
if (!baseUrl || !adminToken || !databaseUrl || !pgBin) throw new Error('Uso: imei-credits-http.mjs <baseUrl> <adminToken> <databaseUrl> <pgBin>')
const psql = sql => execFileSync(path.join(pgBin, 'psql'), [databaseUrl, '-tAc', sql], { encoding: 'utf8' }).trim()
const A = 'tenant-a-it'
const marca = Date.now()

const llamar = (ruta, token, metodo = 'GET', cuerpo) => fetch(`${baseUrl}${ruta}`, {
  method: metodo,
  headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'x-tenant-id': A, 'Content-Type': 'application/json' },
  ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
}).then(async response => ({ status: response.status, payload: await response.json().catch(() => null) }))
const consultar = (body, token = adminToken) => llamar('/api/imei', token, 'POST', { action: 'checks', imei: '490154203237518', confirm: true, ...body })
const saldoA = async () => (await llamar('/api/imei', adminToken)).payload.creditos.saldo
const prepararSaldo = async n => {
  await saldoA() // acredita la verificación gratis antes de vaciar, para que no reaparezca
  psql(`UPDATE "ImeiCreditLot" SET "remaining" = 0 WHERE "tenantId" = '${A}'`)
  if (n > 0) psql(`INSERT INTO "ImeiCreditLot" ("id","tenantId","source","granted","remaining","note") VALUES ('it-lote-${randomUUID()}','${A}','GRANT',${n},${n},'prueba')`)
}
const contar = sql => Number(psql(sql))

// ── 5 consultas paralelas con saldo 2: pasan exactamente 2 ─────────────────
await prepararSaldo(2)
assert.equal(await saldoA(), 2)
const carrera = await Promise.all(Array.from({ length: 5 }, (_, i) => consultar({ requestId: `cr-par-${marca}-${i}` })))
const estados = carrera.map(r => r.status).sort()
assert.deepEqual(estados, [201, 201, 402, 402, 402], JSON.stringify(estados))
const rechazo = carrera.find(r => r.status === 402).payload
assert.equal(rechazo.code, 'IMEI_SIN_CREDITOS')
assert.ok(!/\$|USD|precio|comprar/i.test(JSON.stringify(rechazo)), 'el rechazo no habla de precios ni compra')
assert.equal(await saldoA(), 0)
assert.equal(contar(`SELECT count(*) FROM "ImeiCheckQuery" WHERE "requestId" LIKE 'cr-par-${marca}-%'`), 2, 'los rechazados no dejan fila')
assert.equal(contar(`SELECT -COALESCE(SUM("amount"),0) FROM "ImeiCreditEntry" WHERE "tenantId" = '${A}' AND "type" = 'CONSUME' AND "sourceRef" LIKE 'cr-par-${marca}-%'`), 2)

// ── 10 paralelas con el mismo requestId: UN solo CONSUME ───────────────────
await prepararSaldo(5)
const mismo = `cr-mismo-${marca}`
const diez = await Promise.all(Array.from({ length: 10 }, () => consultar({ requestId: mismo })))
assert.deepEqual(diez.map(r => r.status).sort(), [200, 200, 200, 200, 200, 200, 200, 200, 200, 201])
assert.equal(contar(`SELECT count(*) FROM "ImeiCreditEntry" WHERE "tenantId" = '${A}' AND "type" = 'CONSUME' AND "sourceRef" LIKE '${mismo}:%'`), 1)
assert.equal(await saldoA(), 4)

// ── Servicios: 2 créditos el avanzado, 15 el MDM completo ──────────────────
const avanzado = await consultar({ requestId: `cr-adv-${marca}`, servicio: 'APPLE_ADVANCED' })
assert.equal(avanzado.status, 201)
assert.equal(await saldoA(), 2)
const mdm = await consultar({ requestId: `cr-mdm-${marca}`, servicio: 'FULL_MDM' })
assert.equal(mdm.status, 402)
assert.equal(mdm.payload.creditos.requeridos, 15)
const pre = await llamar('/api/imei', adminToken, 'POST', { action: 'precheck', imei: '490154203237518', servicio: 'APPLE_ADVANCED' })
assert.equal(pre.payload.creditosRequeridos, 2)
assert.equal(pre.payload.saldo, 2)
assert.ok(!('costoEstimadoUsd' in pre.payload) && !('costoReferenciaUsd' in pre.payload), 'sin precios en la app')

// ── Reembolso automático, una sola vez; «a conciliar» conserva el crédito ───
await prepararSaldo(3)
const fallida = `cr-falla-${marca}`
const f1 = await consultar({ requestId: fallida, escenario: 'sin-saldo' })
assert.equal(f1.status, 201)
assert.equal(f1.payload.status, 'fallido')
assert.equal(await saldoA(), 3, 'el crédito volvió')
const f2 = await consultar({ requestId: fallida, escenario: 'sin-saldo' })
assert.equal(f2.status, 200)
const queryId = f1.payload.id
assert.equal(contar(`SELECT count(*) FROM "ImeiCreditEntry" WHERE "queryId" = '${queryId}' AND "type" = 'REFUND'`), 1)
assert.equal(await saldoA(), 3, 'repetir no devuelve dos veces')
const ambigua = await consultar({ requestId: `cr-timeout-${marca}`, escenario: 'timeout' })
assert.equal(ambigua.payload.status, 'conciliar')
assert.equal(await saldoA(), 2, 'a conciliar mantiene el crédito')
// La empresa NO concilia ni reembolsa: «conciliar» no existe en su API; «reportar» solo deja constancia.
const intento = await llamar('/api/imei', adminToken, 'POST', { action: 'conciliar', requestId: `cr-timeout-${marca}`, status: 'fallido', costUsd: 0, note: 'me devuelvo el crédito' })
assert.equal(intento.status, 400)
assert.equal(await saldoA(), 2, 'la empresa no puede reembolsarse')
assert.equal(contar(`SELECT count(*) FROM "ImeiCheckQuery" WHERE "requestId" = 'cr-timeout-${marca}' AND "status" = 'conciliar' AND "conciliatedAt" IS NULL`), 1, 'estado y costo intactos')
const reporte = await llamar('/api/imei', adminToken, 'POST', { action: 'reportar', requestId: `cr-timeout-${marca}`, note: 'no respondió' })
assert.equal(reporte.status, 200)
assert.equal((await llamar('/api/imei', adminToken, 'POST', { action: 'reportar', requestId: `cr-timeout-${marca}` })).status, 400, 'el reporte exige nota')
assert.equal(await saldoA(), 2)
assert.equal(contar(`SELECT count(*) FROM "AuditLog" WHERE "tenantId" = '${A}' AND "action" = 'IMEI_QUERY_REPORTED'`), 1)
// Sin precios ni USD hacia la empresa (listado, alta, repetición y reporte).
const lista0 = await llamar(`/api/imei`, adminToken)
for (const r of [lista0, ambigua, f1, f2, reporte]) assert.ok(!/costUsd|costoUsd|US\$/i.test(JSON.stringify(r.payload)), 'la app de la empresa no muestra USD')

// ── Superadmin: solo el dueño de la plataforma ─────────────────────────────
// Dueño sintético: cuenta de Google verificada con el correo del entorno del arnés.
const tokenDueno = `owner-it-${marca}-${randomUUID()}`
const hash = createHash('sha256').update(tokenDueno).digest('hex')
psql(`INSERT INTO "Account" ("id","googleSubject","updatedAt") VALUES ('acc-owner-it','g-owner-it',CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING`)
psql(`INSERT INTO "GoogleIdentity" ("subject","email") VALUES ('g-owner-it','platform-owner-it@example.invalid') ON CONFLICT DO NOTHING`)
psql(`INSERT INTO "TenantMembership" ("id","accountId","tenantId","userId","updatedAt") VALUES ('mem-owner-it','acc-owner-it','${A}','user-admin-it',CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING`)
psql(`INSERT INTO "Session" ("id","tenantId","userId","accountId","level","deviceId","tokenHash","expiresAt") VALUES ('ses-owner-it-${marca}','${A}','user-admin-it','acc-owner-it','SELLER','device-owner-it','${hash}', now() + interval '1 day')`)

const C = 'tenant-c-it'
const ruta = `/api/superadmin/imei-creditos/${C}`
// Denegado para empresas (incluido su administrador), sesiones ajenas y sin sesión: 404, sin revelar el panel.
for (const token of [adminToken, '', 'token-inventado']) {
  assert.equal((await llamar(ruta, token)).status, 404, 'GET denegado')
  assert.equal((await llamar(ruta, token, 'POST', { action: 'agregar', cantidad: 5 })).status, 404, 'POST denegado')
  assert.equal((await llamar('/api/superadmin/imei-creditos', token)).status, 404, 'lista denegada')
}
assert.equal(contar(`SELECT count(*) FROM "ImeiCreditEntry" WHERE "tenantId" = '${C}' AND "type" <> 'GRANT'`), 0, 'el rechazo no tocó nada')

// Conciliación: solo la plataforma. Fallido sin cobro devuelve el crédito, una sola vez.
const rutaA = `/api/superadmin/imei-creditos/${A}`
assert.equal((await llamar(rutaA, adminToken, 'POST', { action: 'conciliar', requestId: `cr-timeout-${marca}`, status: 'fallido', costUsd: 0 })).status, 404, 'la empresa no concilia por la vía de la plataforma')
assert.equal(await saldoA(), 2)
const conciliada = await llamar(rutaA, tokenDueno, 'POST', { action: 'conciliar', requestId: `cr-timeout-${marca}`, status: 'fallido', costUsd: 0, note: 'sin orden en el proveedor' })
assert.equal(conciliada.status, 200, JSON.stringify(conciliada.payload))
assert.equal(await saldoA(), 3, 'al conciliar la plataforma como fallida sin cobro se devuelve')
await llamar(rutaA, tokenDueno, 'POST', { action: 'conciliar', requestId: `cr-timeout-${marca}`, status: 'fallido', costUsd: 0 })
assert.equal(await saldoA(), 3, 'conciliar dos veces no devuelve dos veces')
assert.equal((await llamar(rutaA, tokenDueno, 'POST', { action: 'conciliar', requestId: 'no-existe' })).status, 404)

// Verificación gratis: toda empresa (también las existentes) arranca con 1.
const inicial = await llamar(ruta, tokenDueno)
assert.equal(inicial.status, 200, JSON.stringify(inicial.payload))
assert.equal(inicial.payload.saldo, 1)
assert.equal(contar(`SELECT count(*) FROM "ImeiCreditLot" WHERE "tenantId" = '${C}' AND "source" = 'FREE'`), 1)
await llamar(ruta, tokenDueno)
assert.equal(contar(`SELECT count(*) FROM "ImeiCreditEntry" WHERE "tenantId" = '${C}' AND "sourceRef" = 'free'`), 1, 'la gratis se otorga una sola vez')

// Agregar (idempotente por opId), ajuste con nota obligatoria, saldo nunca negativo.
const op = `op-${marca}`
const agregado = await llamar(ruta, tokenDueno, 'POST', { action: 'agregar', cantidad: 7, nota: 'cortesía', opId: op })
assert.equal(agregado.status, 201, JSON.stringify(agregado.payload))
assert.equal(agregado.payload.saldo, 8)
assert.equal((await llamar(ruta, tokenDueno, 'POST', { action: 'agregar', cantidad: 7, nota: 'cortesía', opId: op })).payload.saldo, 8, 'mismo opId no suma dos veces')
assert.equal((await llamar(ruta, tokenDueno, 'POST', { action: 'agregar', cantidad: 0 })).status, 400)
assert.equal((await llamar(ruta, tokenDueno, 'POST', { action: 'ajuste', cantidad: -2 })).status, 400, 'ajuste sin nota')
assert.equal((await llamar(ruta, tokenDueno, 'POST', { action: 'ajuste', cantidad: -99, nota: 'x' })).status, 400, 'no deja saldo negativo')
const ajuste = await llamar(ruta, tokenDueno, 'POST', { action: 'ajuste', cantidad: -3, nota: 'corrección de conteo' })
assert.equal(ajuste.status, 200, JSON.stringify(ajuste.payload))
assert.equal(ajuste.payload.saldo, 5)
assert.equal((await llamar(ruta, tokenDueno, 'POST', { action: 'ajuste', cantidad: 2, nota: 'devolución' })).payload.saldo, 7)
assert.equal((await llamar(ruta, tokenDueno, 'POST', { action: 'agregar', cantidad: 1, venceEl: '2001-01-01' })).status, 400, 'vencimiento pasado')
assert.equal(contar(`SELECT count(*) FROM "AuditLog" WHERE "tenantId" = '${C}' AND "action" IN ('IMEI_CREDITS_GRANTED','IMEI_CREDITS_ADJUSTED')`), 3, 'todo queda auditado')
assert.equal(contar(`SELECT count(*) FROM "ImeiCreditLot" WHERE "tenantId" = '${C}' AND "remaining" < 0`), 0)
// El id del lote incluye la empresa: el mismo opId en dos empresas acredita en ambas.
assert.equal(contar(`SELECT count(*) FROM "ImeiCreditLot" WHERE "id" = 'ilg_${C}_${op}'`), 1, 'id del lote con empresa')
const otraEmpresa = await llamar(`/api/superadmin/imei-creditos/tenant-b-it`, tokenDueno, 'POST', { action: 'agregar', cantidad: 4, nota: 'mismo opId', opId: op })
assert.equal(otraEmpresa.status, 201, JSON.stringify(otraEmpresa.payload))
assert.equal(contar(`SELECT count(*) FROM "ImeiCreditLot" WHERE "tenantId" = 'tenant-b-it' AND "id" = 'ilg_tenant-b-it_${op}' AND "remaining" = 4`), 1, 'el lote de la otra empresa existe con su propio id')
psql(`DELETE FROM "ImeiCreditLot" WHERE "id" = 'ilg_tenant-b-it_${op}'`) // no ensucia el saldo de la prueba de cupo
// opId con comodines LIKE: un ajuste «a%» no se confunde con «abc».
const saldoAntes = (await llamar(ruta, tokenDueno)).payload.saldo
assert.equal((await llamar(ruta, tokenDueno, 'POST', { action: 'ajuste', cantidad: -1, nota: 'x', opId: `abc-${marca}` })).payload.saldo, saldoAntes - 1)
const comodin = await llamar(ruta, tokenDueno, 'POST', { action: 'ajuste', cantidad: -1, nota: 'x', opId: 'a%' })
assert.ok(!comodin.payload.repetido && comodin.payload.saldo === saldoAntes - 2, `el comodín no cuenta como repetido: ${JSON.stringify(comodin.payload)}`)

// Libro solo de agregado.
assert.throws(() => psql(`UPDATE "ImeiCreditEntry" SET "amount" = 0 WHERE "tenantId" = '${C}'`), /solo de agregado/)
assert.throws(() => psql(`DELETE FROM "ImeiCreditEntry" WHERE "tenantId" = '${C}'`), /solo de agregado/, 'tampoco se borra')

// ── Cupo mensual: perezoso, idempotente, tope de arrastre y vencimiento a 12 meses ──
const D = 'tenant-b-it'
const rutaD = `/api/superadmin/imei-creditos/${D}`
const cupo = await llamar(rutaD, tokenDueno, 'POST', { action: 'cupo', cantidad: 10 })
assert.equal(cupo.status, 200, JSON.stringify(cupo.payload))
assert.equal(cupo.payload.cupoMensual, 10)
assert.equal(contar(`SELECT count(*) FROM "ImeiCreditEntry" WHERE "tenantId" = '${D}' AND "sourceRef" LIKE 'sub:%'`), 1, 'el mes en curso se acredita en el acto')
const mesActual = psql(`SELECT to_char(now() AT TIME ZONE 'America/Asuncion','YYYY-MM')`)
assert.equal(contar(`SELECT count(*) FROM "ImeiCreditEntry" WHERE "tenantId" = '${D}' AND "sourceRef" = 'sub:${mesActual}'`), 1)
assert.ok(contar(`SELECT count(*) FROM "ImeiCreditLot" WHERE "tenantId" = '${D}' AND "source" = 'MONTHLY' AND "expiresAt" > now() + interval '11 months' AND "expiresAt" < now() + interval '13 months'`) === 1, 'el lote mensual vence a los 12 meses')
await llamar(rutaD, tokenDueno)
await llamar(rutaD, tokenDueno)
assert.equal(contar(`SELECT count(*) FROM "ImeiCreditEntry" WHERE "tenantId" = '${D}' AND "sourceRef" LIKE 'sub:%'`), 1, 'sub:YYYY-MM no se repite')

// Arrastre: 100 sin usar de meses viejos + 3 meses por acreditar ⇒ el sobrante de más de 3 cupos vence.
psql(`UPDATE "ImeiCreditSetting" SET "since" = now() - interval '6 months' WHERE "tenantId" = '${D}'`)
psql(`DELETE FROM "ImeiCreditLot" WHERE "tenantId" = '${D}' AND "source" = 'MONTHLY'`)
// El libro no admite DELETE: el arnés lo suspende solo para reiniciar el escenario.
psql(`ALTER TABLE "ImeiCreditEntry" DISABLE TRIGGER "ImeiCreditEntry_append_only"; DELETE FROM "ImeiCreditEntry" WHERE "tenantId" = '${D}' AND "sourceRef" LIKE 'sub:%'; ALTER TABLE "ImeiCreditEntry" ENABLE TRIGGER "ImeiCreditEntry_append_only"`)
psql(`INSERT INTO "ImeiCreditLot" ("id","tenantId","source","granted","remaining","expiresAt","sourceRef") VALUES ('it-viejo-${marca}','${D}','MONTHLY',100,100, now() + interval '6 months','sub:viejo')`)
const arrastre = await llamar(rutaD, tokenDueno)
assert.equal(arrastre.status, 200)
// Cada mes recorta el arrastre a 2 cupos y suma el cupo nuevo: tope = 3 cupos (30), no 4.
assert.equal(arrastre.payload.saldo, 31, `saldo con tope (30 mensuales + 1 gratis): ${arrastre.payload.saldo}`)
assert.ok(contar(`SELECT count(*) FROM "ImeiCreditEntry" WHERE "tenantId" = '${D}' AND "type" = 'EXPIRE' AND "sourceRef" LIKE 'cap:%'`) >= 1)
assert.equal((await llamar(rutaD, tokenDueno)).payload.saldo, 31, 'releer no cambia el saldo')

// Lista y detalle de la plataforma: saldo, consumo y costo del proveedor.
const lista = await llamar('/api/superadmin/imei-creditos', tokenDueno)
assert.equal(lista.status, 200)
const filaA = lista.payload.items.find(f => f.id === A)
assert.ok(filaA && filaA.consumidos > 0 && typeof filaA.costoUsd === 'number', JSON.stringify(filaA))
const detalle = await llamar(`/api/superadmin/imei-creditos/${A}`, tokenDueno)
assert.ok(detalle.payload.movimientos.length > 0 && detalle.payload.consumo.length > 0 && detalle.payload.costoProveedorUsd.consultas > 0)

// Deja a la empresa A con saldo para las pruebas que vienen después.
await prepararSaldo(1000)

console.log('imei-credits: checks OK (carrera 2 de 5, 10 paralelas = 1 consumo, reembolso único, conciliar conserva, 404 a empresas, cupo y tope de arrastre).')
