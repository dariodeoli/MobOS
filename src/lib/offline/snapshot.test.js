import test from 'node:test'
import assert from 'node:assert/strict'
import { crearSnapshotsPrivados, contextoPrivadoSnapshot, permiteRespaldoOffline, esDenegacionPrivada } from './snapshot.js'
const owner = { empresaId: 'A', sucursalId: 'S1', userId: 'OWNER', rol: 'dueno', permisos: ['*', 'costs:read'] }
const datos = { products: [{ costPyg: 987654 }], orders: [{ branchId: 'S1' }], users: [{ id: 'owner' }], finance: { private: true } }
function fixture() {
  const rows = new Map(), ventas = new Map([['pending', { total: 1234 }]])
  const store = { guardar: async (clave, datos) => rows.set(clave, { datos: structuredClone(datos) }), leer: async clave => rows.get(clave), limpiar: async () => rows.clear() }
  return { rows, ventas, store, snapshots: crearSnapshotsPrivados({ store }) }
}
test('contexto exige principal/empresa/rol/permisos y canonicaliza permisos', () => {
 assert.equal(contextoPrivadoSnapshot({ empresaId: 'A' }), null)
 assert.equal(contextoPrivadoSnapshot({ ...owner, permisos: null }), null)
 assert.deepEqual(contextoPrivadoSnapshot({ ...owner, permisos: ['z','a','z'] }).permisos,['a','z'])
})
test('foto solo se lee en contexto completo: principal, sucursal, tenant, rol y permisos', async () => {
 for (const change of [{userId:'SELLER',rol:'VENDEDOR',permisos:['sales:create']},{sucursalId:'S2'},{empresaId:'B'},{rol:'GERENTE'},{permisos:['sales:create']}]) {
  const f=fixture();const a=f.snapshots.activar(owner);await f.snapshots.guardar(a,datos)
  const b=f.snapshots.activar({...owner,...change});assert.equal(await f.snapshots.leer(b),null);assert.equal(await f.snapshots.leer(a),null);assert.equal(f.ventas.size,1)
 }
})
test('mismo contexto permite lectura y permisos reordenados no cambian identidad', async () => {
 const f=fixture(),a=f.snapshots.activar(owner);await f.snapshots.guardar(a,datos)
 const b=f.snapshots.activar({...owner,permisos:[...owner.permisos].reverse()});assert.equal(a,b);assert.equal((await f.snapshots.leer(b)).products[0].costPyg,987654)
})
test('rechaza versión1 empresa-only y metadatos de otro contexto incluso bajo clave correcta', async () => {
 const f=fixture(),a=f.snapshots.activar(owner)
 f.rows.set('catalogo:A',{datos:{version:1,...datos}});assert.equal(await f.snapshots.leer(a),null)
 f.rows.set(a.clave,{datos:{version:2,contexto:{...owner,userId:'OTHER'},...datos}});assert.equal(await f.snapshots.leer(a),null)
})
test('invalidación borra solo snapshots y una escritura tardía no revive datos', async () => {
 const f=fixture(),a=f.snapshots.activar(owner)
 let release,started;const inicio=new Promise(r=>{started=r});const original=f.store.guardar
 f.store.guardar=async(...args)=>{started();await new Promise(r=>{release=r});await original(...args)}
 const pending=f.snapshots.guardar(a,datos);await inicio
 const purge=f.snapshots.invalidar();release();assert.equal(await pending,false);await purge
 assert.equal(f.rows.size,0);assert.equal(f.ventas.size,1);assert.equal(await f.snapshots.leer(a),null)
})
test('invalidación tardía de generaciónA no borra generaciónB', async () => {
 const f=fixture(),a=f.snapshots.activar(owner);const b=f.snapshots.activar({...owner,userId:'B'});await f.snapshots.guardar(b,datos)
 assert.equal(await f.snapshots.invalidar({siGeneracion:a.generacion}),false);assert.ok(await f.snapshots.leer(b))
})
test('fallback solo red/timeout, nunca HTTP, cancelación o denegación explícita', () => {
 for(const error of [{status:401},{status:402},{status:403},{status:500},{status:429},{code:'CONTEXT_CHANGED'},{code:'REQUEST_ABORTED'},{code:'FORBIDDEN'},{details:{code:'SESSION_EXPIRED'}}])assert.equal(permiteRespaldoOffline(error),false)
 assert.equal(permiteRespaldoOffline({code:'NETWORK_ERROR'}),true);assert.equal(permiteRespaldoOffline({code:'REQUEST_TIMEOUT'}),true)
 assert.equal(esDenegacionPrivada({details:{code:'ACCESS_DENIED'}}),true)
})

test('una invalidación de otra pestaña impide leer/escribir aunque su evento llegue tarde', async () => {
 let marcador='A'
 const f=fixture(),s=crearSnapshotsPrivados({store:f.store,leerMarcador:()=>marcador})
 const a=s.activar(owner);await s.guardar(a,datos);marcador='B'
 assert.equal(await s.leer(a),null);assert.equal(await s.guardar(a,datos),false)
 const reload=crearSnapshotsPrivados({store:f.store,leerMarcador:()=>marcador}),b=reload.activar(owner)
 assert.equal(await reload.leer(b),null,'foto con marcador anterior no revive tras recarga')
})
test('recarga legítima conserva respaldo del mismo contexto sin invalidación', async()=>{
 const f=fixture(),a=f.snapshots.activar(owner);await f.snapshots.guardar(a,datos)
 const reload=crearSnapshotsPrivados({store:f.store}),b=reload.activar(owner)
 assert.equal((await reload.leer(b)).products[0].costPyg,987654)
})
test('una purga fallida no permite releer datos previos sin una foto online nueva',async()=>{
 const f=fixture(),a=f.snapshots.activar(owner);await f.snapshots.guardar(a,datos)
 f.store.limpiar=async()=>{throw Error('IndexedDB unavailable')}
 assert.equal(await f.snapshots.invalidar(),false)
 const b=f.snapshots.activar(owner);assert.equal(await f.snapshots.leer(b),null)
 await f.snapshots.guardar(b,{products:[{id:'fresh'}]})
 assert.equal((await f.snapshots.leer(b)).products[0].id,'fresh')
})
