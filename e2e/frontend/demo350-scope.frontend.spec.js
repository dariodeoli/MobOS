import {test,expect} from '@playwright/test'

test('#350-A: Aurora conserva ediciones al cambiar contexto; tokens viejos no escriben y reload reinicia',async({page})=>{
 const peticiones=[]
 await page.route(/https:\/\//,r=>r.abort())
 await page.route('**/api/**',r=>{const path=new URL(r.request().url()).pathname;if(!path.startsWith('/api/'))return r.continue();peticiones.push(path);return r.fulfill({status:503,json:{error:'Solo demo local'}})})
 await page.addInitScript(()=>sessionStorage.setItem('mobos:demo-guia-vista','1'))
 await page.goto('/demo')
 await page.getByRole('button',{name:'Entrar como Dueño',exact:true}).click()
 await expect(page.getByTestId('shell')).toBeVisible()
 await page.goto('/configuracion/equipo')
 const nombre=page.getByRole('textbox',{name:'Nombre de Diego López',exact:true})
 await nombre.fill('Diego conservado en sesión');await nombre.press('Tab')
 await expect(page.getByText('Integrante actualizado.',{exact:true})).toBeVisible()
 const resultado=await page.evaluate(async()=>{
  const s=await import('/src/lib/storage.js')
  const ds=await import('/src/lib/demoStorage.js')
  const c=await import('/src/lib/demo/contexto.js')
  const before=JSON.stringify(s.getProductos())
  const valores=Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]))
  let opens=0
  const open=indexedDB.open.bind(indexedDB);indexedDB.open=(...args)=>{opens++;return open(...args)}
  const token=c.capturarContextoDemo();ds.guardarDemo('prueba-recurso:1','Aurora',{demo:true})
  await s.setContexto({empresaId:'mobos-demo',sucursalId:'mobos-demo-villa-morra',userId:'demo-user-vendedor',rol:'VENDEDOR',fuente:'legacy'})
  s.prepararDatosDemo()
  const segundo=c.capturarContextoDemo()
  await s.setContexto({empresaId:'mobos-demo',sucursalId:'mobos-demo-central',userId:'demo-user',rol:'dueno',fuente:'legacy'})
  s.prepararDatosDemo()
  ds.guardarDemo('prueba-recurso:1','Respuesta vieja',{demo:true,contexto:token})
  const tokenRol=c.capturarContextoDemo()
  await s.setContexto({empresaId:'mobos-demo',sucursalId:'mobos-demo-central',userId:'demo-user',rol:'dueno',permisos:['ventas'],fuente:'legacy'})
  const rolVigente=c.contextoDemoVigente(tokenRol)
  const after=JSON.stringify(s.getProductos())
  let rechaza=false;try{await s.setContexto({empresaId:'mobos-demo-horizonte',fuente:'legacy'})}catch{rechaza=true}
  return {before,after,nombre:s.getVendedores().find(v=>v.id==='demo-user-vendedor').nombre,vigenciaA:c.contextoDemoVigente(token),vigenciaB:c.contextoDemoVigente(segundo),rolVigente,valor:ds.leerDemo('prueba-recurso:1',{demo:true}),rechaza,empresa:s.contextoActual().empresaId,opens,persistido:JSON.stringify(valores)!==JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])))}
 })
 expect(resultado.after).toBe(resultado.before)
 expect(resultado.nombre).toBe('Diego conservado en sesión')
 expect(resultado.vigenciaA).toBe(false);expect(resultado.vigenciaB).toBe(false)
 expect(resultado.rolVigente).toBe(false)
 expect(resultado.valor).toBe('Aurora');expect(resultado.rechaza).toBe(true);expect(resultado.empresa).toBe('mobos-demo')
 expect(resultado.opens,'el contexto demo no abre base privada').toBe(0)
 expect(resultado.persistido,'no escribe localStorage de negocio ni configuración real').toBe(false)
 await page.reload()
 await expect(page.getByRole('textbox',{name:'Nombre de Diego López',exact:true})).toHaveValue('Diego López')
 expect(peticiones.filter(p=>p!=='/api/public/track')).toEqual([])
})
