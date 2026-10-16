import test from 'node:test'
import assert from 'node:assert/strict'
import {crearContextoDemo,contextoDemo} from './contexto.js'
import {crearAlmacenDemo,crearCacheDemo} from './memoria.js'

test('#350-A: registro activo cerrado; no habilita otro escenario ni admite token reconstruido',()=>{
 const antes=contextoDemo.capturar()
 assert.throws(()=>contextoDemo.activar({empresaId:'mobos-demo-horizonte'}),/no disponible/)
 assert.equal(contextoDemo.capturar(),antes)
 assert.equal(contextoDemo.vigente({...antes}),false)
 assert.ok(Object.isFrozen(antes))
})

test('#350-A: A→B→A aísla mismos IDs y fachadas retenidas; borrar B no toca A',()=>{
 const c=crearContextoDemo({empresas:['A','B'],inicial:'A'}),mem=crearAlmacenDemo(c)
 const a=c.activar({empresaId:'A',sucursalId:'local',userId:'persona'})
 const facadeA=mem.almacen(a)
 facadeA.setItem('cliente:1','Nombre A')
 const b=c.activar({empresaId:'B',sucursalId:'local',userId:'persona'})
 assert.equal(mem.almacen(b).getItem('cliente:1'),null)
 mem.almacen(b).setItem('cliente:1','Nombre B')
 assert.equal(facadeA.getItem('cliente:1'),null)
 facadeA.setItem('cliente:1','Respuesta vieja')
 c.activar({empresaId:'A',sucursalId:'local',userId:'persona'})
 assert.equal(mem.almacen().getItem('cliente:1'),'Nombre A')
 assert.equal(c.vigente(a),false,'el primer A no vuelve a ser vigente')
 c.activar({empresaId:'B',sucursalId:'local',userId:'persona'})
 mem.almacen().removeItem('cliente:1')
 assert.equal(mem.almacen().getItem('cliente:1'),null)
 c.activar({empresaId:'A',sucursalId:'local',userId:'persona'})
 assert.equal(mem.almacen().getItem('cliente:1'),'Nombre A')
})

test('#350-A: respuestas demoradas no escriben al resolver después de A→B→A',async()=>{
 const c=crearContextoDemo({empresas:['A','B'],inicial:'A'}),m=crearAlmacenDemo(c)
 let resolver;const gate=new Promise(r=>{resolver=r})
 const token=c.capturar(),vinculado=m.almacen(token)
 const pendiente=gate.then(()=>vinculado.setItem('pago:1','viejo'))
 c.activar({empresaId:'B'});m.almacen().setItem('pago:1','B')
 c.activar({empresaId:'A'});m.almacen().setItem('pago:1','nuevo A')
 resolver();await pendiente
 assert.equal(m.almacen().getItem('pago:1'),'nuevo A')
 c.activar({empresaId:'B'});assert.equal(m.almacen().getItem('pago:1'),'B')
})

test('#350-A: usuario, sucursal, salida y reset invalidan token sin compartir referencias',()=>{
 const c=crearContextoDemo({empresas:['A','B'],inicial:'A'}),m=crearCacheDemo(c)
 const a=c.activar({empresaId:'A',sucursalId:'uno',userId:'uno'})
 const state={productos:[{id:'igual',precio:100}],ventas:[]}
 assert.equal(m.guardar(a,state),true)
 state.productos[0].precio=999
 c.activar({empresaId:'B'});m.guardar(c.capturar(),{productos:[{id:'igual',precio:200}],ventas:[]})
 assert.equal(m.leer(c.capturar()).productos[0].precio,200)
 c.activar({empresaId:'A',sucursalId:'dos',userId:'uno'})
 assert.equal(c.vigente(a),false)
 const restored=m.leer(c.capturar());assert.equal(restored.productos[0].precio,100)
 restored.productos[0].precio=888
 assert.equal(m.leer(c.capturar()).productos[0].precio,100)
 const branch=c.capturar();c.activar({empresaId:'A',sucursalId:'dos',userId:'dos'})
 assert.equal(c.vigente(branch),false)
 assert.equal(m.guardar(branch,state),false)
 c.activar({empresaId:null});assert.equal(m.leer(c.capturar()),null)
 m.limpiar();c.activar({empresaId:'A'});assert.equal(m.leer(c.capturar()),null)
 const antes=c.capturar();c.invalidar();assert.equal(c.vigente(antes),false)
})

test('#350-A: contexto/almacenes aislados no acceden a almacenamiento persistente',()=>{
 const previo=globalThis.localStorage
 const idb=globalThis.indexedDB
 let accesos=0
 globalThis.localStorage={getItem(){accesos++;throw new Error('Prohibido')},setItem(){accesos++;throw new Error('Prohibido')}}
 globalThis.indexedDB={open(){accesos++;throw new Error('Prohibido')}}
 try {
  const c=crearContextoDemo({empresas:['A','B'],inicial:'A'}),m=crearAlmacenDemo(c),cache=crearCacheDemo(c)
  m.almacen().setItem('id:1','A');cache.guardar(c.capturar(),{id:1})
  c.activar({empresaId:'B'});assert.equal(m.almacen().getItem('id:1'),null)
  c.activar({empresaId:'A'});assert.equal(m.almacen().getItem('id:1'),'A')
  assert.deepEqual(cache.leer(c.capturar()),{id:1})
  assert.equal(accesos,0)
 } finally {if(previo===undefined)delete globalThis.localStorage;else globalThis.localStorage=previo;if(idb===undefined)delete globalThis.indexedDB;else globalThis.indexedDB=idb}
})
