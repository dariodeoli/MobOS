import {test,expect} from '@playwright/test'
const a='a'.repeat(32),b='b'.repeat(64)
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5l8AAAAASUVORK5CYII=','base64')
const tipos=[{nombre:'garantia',api:'/api/public/warranty',base:{productName:'Equipo ficticio con nombre completo',serial:'350000000000010',status:'ACTIVE',daysRemaining:0,warrantyDays:365,store:{name:'Sucursal ficticia',city:'Asunción',phone:'0981123456'}}},{nombre:'remito',api:'/api/transfers/public',base:{sourceBranch:{name:'Depósito ficticio'},destinationBranch:{name:'Destino ficticio'},status:'RECEIVED',createdAt:'2026-10-16T12:00:00Z',lines:[],photos:[]}}]
async function setup(page,tipo,{logoA=true,delayDoc,delayImage}={}){
 const requests=[]
 await page.route(/https:\/\//,r=>r.abort())
 await page.route('**/api/**',async r=>{
  const u=new URL(r.request().url());if(!u.pathname.startsWith('/api/'))return r.continue()
  requests.push(u.pathname+u.search)
  const t=u.pathname.split('/')[4],isA=t===a
  if(u.pathname===`${tipo.api}/${a}`||u.pathname===`${tipo.api}/${b}`){
   if(isA&&delayDoc)await delayDoc
   return r.fulfill({json:{...tipo.base,company:{name:isA?'Tienda ficticia A':'Tienda ficticia B',logo:true}}})
  }
  if(u.pathname===`${tipo.api}/${a}/logo`||u.pathname===`${tipo.api}/${b}/logo`){
   if(isA&&delayImage)await delayImage
   return r.fulfill(isA&&!logoA?{status:404,body:''}:{contentType:'image/png',body:png})
  }
  return r.fulfill({status:404,json:{message:'No encontrado.'}})
 })
 return requests
}
function navegar(page,path){return page.evaluate(path=>{history.pushState(null,'',path);dispatchEvent(new PopStateEvent('popstate'))},path)}
for(const tipo of tipos){
 for(const tema of ['light','dark'])test(`#403 marca ${tipo.nombre} 400px ${tema}: logo autorizado/tema sin cambios de estado`,async({page})=>{
  await page.setViewportSize({width:400,height:850})
  await page.addInitScript(t=>localStorage.setItem('mobos:theme',t),tema)
  const req=await setup(page,tipo)
  await page.goto(`/${tipo.nombre}/${a}`,{waitUntil:'domcontentloaded'})
  const h=page.getByTestId('cabecera-tienda'),img=h.getByRole('img',{name:'Logo de Tienda ficticia A',exact:true})
  await expect(h).toContainText('Tienda ficticia A');await expect(img).toBeVisible()
  await expect(img).toHaveAttribute('src',new RegExp(`/logo[?]variant=${tema}`))
  await expect.poll(()=>img.evaluate(n=>n.complete&&n.naturalWidth>0)).toBe(true)
  if(tipo.nombre==='garantia')await expect(page.getByTestId('estado-garantia')).toContainText('Garantía vencida')
  else await expect(page.getByTestId('estado-remito')).toContainText('Recibido')
  await page.evaluate(t=>document.documentElement.classList.toggle('dark',t!=='dark'),tema)
  await expect(img).toHaveAttribute('src',new RegExp(`/logo[?]variant=${tema==='dark'?'light':'dark'}`))
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  expect(req.some(p=>p.includes('/api/tenant')||p.includes('/ruc')||p.includes('tenantId='))).toBe(false)
 })
 test(`#403 ${tipo.nombre}: logo ausente no oculta documento y próximo token recupera imagen`,async({page})=>{
  await setup(page,tipo,{logoA:false});await page.goto(`/${tipo.nombre}/${a}`,{waitUntil:'domcontentloaded'})
  const h=page.getByTestId('cabecera-tienda')
  await expect(h).toContainText('Tienda ficticia A');await expect(h.getByRole('img',{name:'Logo de Tienda ficticia A',exact:true})).toHaveCount(0)
  await navegar(page,`/${tipo.nombre}/${b}`)
  await expect(h).toContainText('Tienda ficticia B');await expect(h.getByRole('img',{name:'Logo de Tienda ficticia B',exact:true})).toBeVisible()
 })
 for(const target of ['documento','imagen'])test(`#403 ${tipo.nombre}: respuesta ${target} A tardía no sustituye documento/logo B`,async({page})=>{
  let release;const gate=new Promise(r=>{release=r})
  await setup(page,tipo,target==='documento'?{delayDoc:gate}:{delayImage:gate})
  await page.goto(`/${tipo.nombre}/${a}`,{waitUntil:'domcontentloaded'})
  if(target==='imagen')await expect(page.getByTestId('cabecera-tienda')).toContainText('Tienda ficticia A')
  await navegar(page,`/${tipo.nombre}/${b}`)
  const h=page.getByTestId('cabecera-tienda')
  await expect(h).toContainText('Tienda ficticia B')
  const img=h.getByRole('img',{name:'Logo de Tienda ficticia B',exact:true})
  await expect.poll(()=>img.evaluate(n=>n.complete&&n.naturalWidth>0)).toBe(true)
  release();await page.waitForTimeout(150)
  await expect(h).not.toContainText('Tienda ficticia A');await expect(img).toHaveAttribute('src',new RegExp(b+'/logo'))
 })
}
