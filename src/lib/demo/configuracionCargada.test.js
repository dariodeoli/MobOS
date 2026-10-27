// Configuración de la demo cargada: datos fiscales, sucursales, invitaciones y
// preferencias arrancan con datos ficticios coherentes con el resto de la demo
// y se pueden operar en memoria de la pestaña.
const memoriaSesion = new Map()
globalThis.sessionStorage = {
  getItem: (clave) => (memoriaSesion.has(clave) ? memoriaSesion.get(clave) : null),
  setItem: (clave, valor) => memoriaSesion.set(clave, String(valor)),
  removeItem: (clave) => memoriaSesion.delete(clave),
}
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
globalThis.window = { location: { pathname: '/demo' }, addEventListener: () => {}, dispatchEvent: () => {} }

import test from 'node:test'
import assert from 'node:assert/strict'

const { EMPRESAS_FISCALES_DEMO, TITULARES_FISCALES_DEMO, semillaEmpresasFiscalesDemo, semillaTitularesFiscalesDemo } = await import('./datosFiscales.js')
const { EMPRESA_DEMO, SUCURSALES_DEMO } = await import('./empresa.js')
const { EQUIPO_DEMO } = await import('./iphones.js')
const { CUENTAS_DEMO } = await import('../demoCuentasCobro.js')
const { digitoVerificadorRuc } = await import('../demoRuc.js')
const { nombreCompleto, validarRevisionTitular } = await import('../accountNames.js')
const { listDemoBranches, saveDemoBranch } = await import('../demoInventory.js')
const { limpiarMemoriaDemo } = await import('../demoStorage.js')

const dvValido = (documento) => {
  const [base, dv] = String(documento).split('-')
  return /^\d{5,12}$/.test(base) && dv === digitoVerificadorRuc(base)
}

test('datos fiscales: Aurora Móviles S.A. con el RUC y la dirección de la empresa demo', () => {
  const aurora = EMPRESAS_FISCALES_DEMO[0]
  assert.equal(aurora.legalName, EMPRESA_DEMO.razonSocial)
  assert.equal(aurora.ruc, EMPRESA_DEMO.ruc)
  assert.match(aurora.legalAddress, /Asunción/)
  assert.ok(EMPRESAS_FISCALES_DEMO.length >= 2)
  for (const empresa of EMPRESAS_FISCALES_DEMO) {
    assert.ok(dvValido(empresa.ruc), `${empresa.legalName}: RUC con DV inválido (${empresa.ruc})`)
    assert.ok(empresa.legalName && empresa.legalAddress, `${empresa.id}: incompleta`)
    assert.match(empresa.id, /^demo-/)
  }
  // Las cuentas de cobro de la sociedad usan el mismo RUC.
  assert.ok(CUENTAS_DEMO.some((cuenta) => cuenta.document === aurora.ruc))
})

test('datos fiscales: titulares con CI válida, revisables y coherentes con el equipo', () => {
  assert.ok(TITULARES_FISCALES_DEMO.length >= 2 && TITULARES_FISCALES_DEMO.length <= 4)
  const nombresEquipo = new Set(EQUIPO_DEMO.map((persona) => persona.nombre))
  for (const titular of TITULARES_FISCALES_DEMO) {
    assert.ok(dvValido(titular.document), `${titular.id}: CI con DV inválido (${titular.document})`)
    assert.ok(titular.firstName && titular.lastName, `${titular.id}: sin nombre o apellido`)
    assert.doesNotThrow(() => validarRevisionTitular(titular))
  }
  // El dueño es titular, con la misma CI que su cuenta personal de cobro.
  const hernan = TITULARES_FISCALES_DEMO.find((titular) => titular.firstName === 'Hernán')
  assert.ok(nombresEquipo.has(`${hernan.firstName} ${hernan.lastName}`))
  const cuentaDueno = CUENTAS_DEMO.find((cuenta) => cuenta.holder === 'Hernán Acosta')
  assert.equal(cuentaDueno.document, hernan.document)
  assert.ok(TITULARES_FISCALES_DEMO.some((titular) => titular.isActive === false), 'un socio inactivo muestra el estado')
  assert.equal(new Set(TITULARES_FISCALES_DEMO.map(nombreCompleto)).size, TITULARES_FISCALES_DEMO.length)
})

test('datos fiscales: la semilla entrega copias que no comparten referencias', () => {
  const empresas = semillaEmpresasFiscalesDemo()
  empresas[0].legalName = 'Editada'
  assert.equal(EMPRESAS_FISCALES_DEMO[0].legalName, EMPRESA_DEMO.razonSocial)
  const titulares = semillaTitularesFiscalesDemo()
  titulares[0].isActive = false
  assert.equal(TITULARES_FISCALES_DEMO[0].isActive, true)
})

test('sucursales: Configuración e Inventario comparten las sucursales demo con dirección y contacto', () => {
  limpiarMemoriaDemo()
  const sucursales = listDemoBranches()
  assert.deepEqual(sucursales.map((sucursal) => sucursal.id), SUCURSALES_DEMO.map((sucursal) => sucursal.id))
  assert.equal(sucursales[0].name, 'Casa Central')
  for (const sucursal of sucursales) {
    assert.ok(sucursal.address && sucursal.city && sucursal.department && sucursal.phone, `${sucursal.name}: datos incompletos`)
    assert.equal(sucursal.isActive, true)
  }
})

test('sucursales: se crean, editan y desactivan en memoria y vuelven al salir', () => {
  limpiarMemoriaDemo()
  const nueva = saveDemoBranch({ name: 'Sucursal San Lorenzo', city: 'San Lorenzo', department: 'Central', address: 'Ruta Mcal. Estigarribia km 10', phone: '+595 981 000 204' })
  assert.equal(nueva.isActive, true)
  assert.ok(listDemoBranches().some((sucursal) => sucursal.id === nueva.id))
  const editada = saveDemoBranch({ id: nueva.id, name: 'San Lorenzo Centro', address: '' })
  assert.equal(editada.name, 'San Lorenzo Centro')
  assert.equal(editada.address, null)
  assert.equal(editada.city, 'San Lorenzo', 'lo que no se manda se conserva')
  assert.equal(saveDemoBranch({ id: nueva.id, isActive: false }).isActive, false)
  assert.throws(() => saveDemoBranch({ name: '  ' }), /nombre/)
  assert.throws(() => saveDemoBranch({ name: 'casa central' }), /Ya existe/)
  assert.throws(() => saveDemoBranch({ id: 'no-existe', isActive: true }), /ya no está disponible/)
  limpiarMemoriaDemo()
  assert.ok(!listDemoBranches().some((sucursal) => sucursal.id === nueva.id), 'al salir vuelve la semilla')
})

test('invitaciones: pendiente, vencida y aceptada coherentes con el equipo demo', async () => {
  const { listarInvitacionesDemo } = await import('./invitaciones.js')
  limpiarMemoriaDemo()
  const lista = listarInvitacionesDemo()
  assert.deepEqual(new Set(lista.map((invitacion) => invitacion.status)), new Set(['PENDING', 'EXPIRED', 'ACCEPTED']))
  const correosEquipo = new Map(EQUIPO_DEMO.map((persona) => [persona.email, persona.nombre]))
  for (const invitacion of lista) {
    assert.match(invitacion.email, /^\d{8}@correo\.com\.py$/, `${invitacion.name}: correo ficticio del patrón demo`)
    if (invitacion.status === 'ACCEPTED') assert.equal(correosEquipo.get(invitacion.email), invitacion.name, 'la aceptada es de alguien del equipo')
    else assert.ok(!correosEquipo.has(invitacion.email), 'una pendiente o vencida no es de alguien que ya está en el equipo')
  }
})

test('invitaciones: se invitan, reenvían y revocan en memoria, sin duplicar pendientes', async () => {
  const { invitarDemo, listarInvitacionesDemo, reenviarInvitacionDemo, revocarInvitacionDemo } = await import('./invitaciones.js')
  limpiarMemoriaDemo()
  const ahora = Date.now()
  const { invitation, deliveryState } = invitarDemo({ name: ' Carla Duarte ', email: 'Carla@Ejemplo.com', role: 'GERENTE' }, ahora)
  assert.equal(deliveryState, 'sent')
  assert.equal(invitation.name, 'Carla Duarte')
  assert.equal(invitation.email, 'carla@ejemplo.com')
  assert.equal(invitation.status, 'PENDING')
  assert.equal(listarInvitacionesDemo(ahora)[0].id, invitation.id, 'la más nueva arriba')
  assert.throws(() => invitarDemo({ name: 'Otra', email: 'carla@ejemplo.com' }, ahora), (error) => error.details?.invitation?.id === invitation.id)
  assert.throws(() => invitarDemo({ name: 'Sin correo', email: 'no-es-correo' }, ahora), /correo válido/)
  const renovada = reenviarInvitacionDemo(invitation.id, ahora + 3 * 86_400_000).invitation
  assert.ok(new Date(renovada.expiresAt) > new Date(invitation.expiresAt))
  assert.throws(() => reenviarInvitacionDemo('demo-inv-pablo', ahora), /pendientes/)
  assert.equal(revocarInvitacionDemo('demo-inv-pablo', ahora).status, 'REVOKED')
  assert.throws(() => revocarInvitacionDemo('demo-inv-marcos', ahora), /ya no se puede revocar/)
  // Una pendiente cuyo plazo pasó se lista vencida.
  assert.equal(listarInvitacionesDemo(ahora + 30 * 86_400_000).find((fila) => fila.id === invitation.id).status, 'EXPIRED')
  limpiarMemoriaDemo()
  assert.ok(!listarInvitacionesDemo().some((fila) => fila.id === invitation.id))
})

test('preferencias: archivado y saldo a favor se guardan en memoria y vuelven al salir', async () => {
  const { getDemoPreferencias, setDemoPreferencias, PREFERENCIAS_DEMO } = await import('./preferencias.js')
  limpiarMemoriaDemo()
  assert.deepEqual(getDemoPreferencias(), { orders: { ...PREFERENCIAS_DEMO.orders }, portal: { ...PREFERENCIAS_DEMO.portal } })
  assert.equal(getDemoPreferencias().portal.showStoreCredit, true, 'el portal muestra el saldo por defecto')
  const conPortal = setDemoPreferencias({ portal: { showStoreCredit: false } })
  assert.equal(conPortal.portal.showStoreCredit, false)
  assert.equal(conPortal.orders.autoArchivePrepared, false, 'un cambio parcial no toca el otro grupo')
  setDemoPreferencias({ orders: { autoArchivePrepared: 'sí' } })
  assert.equal(getDemoPreferencias().orders.autoArchivePrepared, false, 'solo acepta booleanos')
  assert.equal(setDemoPreferencias({ orders: { autoArchivePrepared: true } }).orders.autoArchivePrepared, true)
  limpiarMemoriaDemo()
  assert.equal(getDemoPreferencias().portal.showStoreCredit, true)
})
