import test from 'node:test'
import assert from 'node:assert/strict'
import { completarEquipoDemo } from './equipo.js'
import { EQUIPO_DEMO } from './iphones.js'
import { EMPRESA_DEMO, SUCURSALES_DEMO } from './empresa.js'
import { logoAurora } from './identidadVisual.js'
import { telefonoValido } from '../../utils/telefono.js'

const datos = new Map()
globalThis.localStorage = { getItem: k => datos.get(k) ?? null, setItem: (k,v) => datos.set(k,String(v)), removeItem:k=>datos.delete(k) }
const { getDemoTenant } = await import('../demoTenant.js')

test('#350: equipo ficticio completo con roles y sucursales consistentes, sin cambiar sus metas', () => {
  assert.deepEqual(EQUIPO_DEMO.map(v=>v.metaDiaria), [0,3000000,1500000,0,0,1200000,0])
  for (const v of EQUIPO_DEMO) {
    assert.ok(telefonoValido(v.phone), v.nombre)
    assert.match(v.email, /^[^@]+@[^@]+\.[^@]+$/)
    assert.equal(v.role,v.rol)
    assert.ok(SUCURSALES_DEMO.some(s=>s.id===v.branchId))
    assert.equal(v.hasAvatar,true)
    assert.equal(v.commissionPct,undefined,'la comisión sigue derivada de las ventas, no inventa tasa de usuario')
  }
  for(const branch of SUCURSALES_DEMO) {
    assert.ok(telefonoValido(branch.phone))
    assert.match(branch.email,/^[^@]+@[^@]+\.[^@]+$/)
    assert.ok(branch.schedule && branch.address && branch.city && branch.instagram)
  }
})

test('#350: completar defaults no pisa ajustes de una demo ya usada', () => {
  const saved={name:'Mi comercio editado',phone:'+595 981 222 333',ruc:'80000000-0',insurancePct:12,orderNextNumber:999,orderPrefix:'ABC'}
  datos.set('mobos:demo-tenant:v1',JSON.stringify(saved))
  const t=getDemoTenant()
  for(const [key,value] of Object.entries(saved)) assert.equal(t[key],value)
  assert.equal(t.email,EMPRESA_DEMO.email)
  assert.equal(t.city,EMPRESA_DEMO.city)
  assert.equal(JSON.parse(datos.get('mobos:demo-tenant:v1')).email,undefined,'leer no reescribe almacenamiento')
})

test('#350: marca local transparente con dos variantes sin URLs remotas', () => {
  const claro=decodeURIComponent(logoAurora('light').split(',')[1])
  const oscuro=decodeURIComponent(logoAurora('dark').split(',')[1])
  assert.notEqual(claro,oscuro)
  for(const svg of [claro,oscuro]) {
    assert.match(svg,/AURORA/)
    assert.match(svg,/MÓVILES/)
    assert.doesNotMatch(svg,/<image|<script|href=|<rect/)
  }
  assert.match(claro,/#17212d/)
  assert.match(oscuro,/#f1f5f9/)
})

test('#350: completar equipo preserva ediciones, ceros, vacíos y usuarios agregados', () => {
  const guardado={id:'demo-user-vendedor',nombre:'Nombre editado',email:'propio@example.invalid',phone:'',rol:'GERENTE',metaDiaria:0,activo:false}
  const extra={id:'persona-local',nombre:'Persona agregada'}
  const copia=JSON.stringify([guardado,extra])
  const mezcla=completarEquipoDemo([guardado,extra])
  const actual=mezcla.find(p=>p.id===guardado.id)
  for(const [key,value] of Object.entries(guardado))assert.equal(actual[key],value)
  assert.equal(actual.role,'GERENTE')
  assert.equal(actual.branchId,'mobos-demo-central')
  assert.deepEqual(mezcla.find(p=>p.id===extra.id),extra)
  assert.equal(JSON.stringify([guardado,extra]),copia)
  assert.deepEqual(completarEquipoDemo(mezcla),mezcla,'idempotente')
})
