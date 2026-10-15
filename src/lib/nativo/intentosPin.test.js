import test from 'node:test'
import assert from 'node:assert/strict'
import { crearControlIntentosPin } from './intentosPin.js'
function pendiente() { let resolve, reject; const promise = new Promise((a,b)=>{resolve=a;reject=b}); return {promise,resolve,reject} }
for(const fallaViejo of [false,true]) test(`pause invalida respuesta anterior ${fallaViejo?'incorrecta':'correcta'} sin alterar el intento nuevo`,async()=>{
 const control=crearControlIntentosPin(), anterior=pendiente(), nuevo=pendiente(), eventos=[]
 const callbacks=id=>({alIniciar:()=>eventos.push(`${id}:inicio`),alConfirmar:()=>eventos.push(`${id}:abre`),alFallar:()=>eventos.push(`${id}:error`),alTerminar:()=>eventos.push(`${id}:fin`)})
 const a=control.ejecutar(()=>anterior.promise,callbacks('a'))
 assert.equal(await control.ejecutar(()=>Promise.resolve(),callbacks('duplicado')),false)
 control.invalidar()
 const b=control.ejecutar(()=>nuevo.promise,callbacks('b'))
 if(fallaViejo) anterior.reject(new Error('PIN inválido anterior')); else anterior.resolve()
 await a;assert.deepEqual(eventos,['a:inicio','b:inicio'])
 nuevo.resolve();await b;assert.deepEqual(eventos,['a:inicio','b:inicio','b:abre','b:fin'])
})
test('salir mientras valida descarta el resultado y el siguiente bloqueo permite intentar',async()=>{
 const control=crearControlIntentosPin(), espera=pendiente(), eventos=[]
 const a=control.ejecutar(()=>espera.promise,{alConfirmar:()=>eventos.push('abre'),alTerminar:()=>eventos.push('fin')})
 control.invalidar();espera.resolve();await a;assert.deepEqual(eventos,[])
 await control.ejecutar(()=>Promise.reject(new Error('PIN inválido')),{alFallar:e=>eventos.push(e.message),alTerminar:()=>eventos.push('fin')})
 assert.deepEqual(eventos,['PIN inválido','fin'])
})
