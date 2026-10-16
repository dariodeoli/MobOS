import {test,expect} from '@playwright/test'
import {paginas,nombreLargo,skuLargo,serialLargo} from '../fixtures/publicas403-restantes.js'
import {auditar} from '../helpers/publicas403-auditar.js'
const imagen='<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><text x="2" y="25">Tienda ficticia</text></svg>'
async function preparar(page,vista,tema='light') {
 const llamadas=[]
 await page.addInitScript(tema=>{localStorage.setItem('mobos:theme',tema)},tema)
 await page.route(/https:\/\//,r=>r.abort())
 await page.route('**/api/**',r=>{
  const req=r.request(),u=new URL(req.url());if(!u.pathname.startsWith('/api/'))return r.continue()
  llamadas.push({path:u.pathname,query:u.search,method:req.method()})
  if(u.pathname==='/api/auth/me')return r.fulfill({status:vista.autenticado?200:401,json:vista.autenticado?{user:{id:'qa-403-user',name:'Persona ficticia',role:'ADMIN',tenantId:'qa-403-tenant',branchId:'qa-403-branch'},tenant:{id:'qa-403-tenant',name:'Comercio ficticio'}}:{}})
  if(vista.autenticado&&['/api/orders','/api/users','/api/inventory-branches','/api/inventory/branches'].includes(u.pathname))return r.fulfill({json:[]})
  if(u.pathname===vista.logoApi)return r.fulfill({contentType:'image/svg+xml',body:imagen})
  if(u.pathname===vista.api)return r.fulfill({json:vista.payload})
  return r.fulfill({status:404,json:{message:'Enlace no disponible.'}})
 })
 await page.goto(vista.ruta)
 await expect(page.locator('main')).toContainText(vista.listo)
 await page.evaluate(async tema=>{document.documentElement.classList.toggle('dark',tema==='dark');await document.fonts.ready;await Promise.all(document.getAnimations().filter(x=>x instanceof CSSTransition).map(x=>x.finished.catch(()=>{})))},tema)
 return llamadas
}
for(const vista of paginas)for(const width of [360,390,1440])for(const tema of ['light','dark'])test(`#403 restante ${vista.id} ${width} ${tema}`,async({page})=>{
 await page.setViewportSize({width,height:900})
 const llamadas=await preparar(page,vista,tema)
 if(vista.id==='cuenta')await page.getByTestId('pedido-detalle-boton').click()
 if(vista.logoApi){const logo=page.locator('main img').first();await expect(logo).toBeVisible();await expect.poll(()=>logo.evaluate(n=>n.complete&&n.naturalWidth>0)).toBe(true);expect(llamadas.some(r=>r.path===vista.logoApi)).toBe(true)}
 if(['cuenta','portal','cotizacion','remito','informe'].includes(vista.id))await expect(page.getByTestId('publico-whatsapp')).toHaveAttribute('href',/^https:\/\/wa.me\/595981123456/)
 if(vista.id==='producto'){await expect(page.locator('main')).toContainText(skuLargo);await expect(page.locator('main')).toContainText('100.000.000')}
 if(vista.id==='garantia'){await expect(page.locator('main')).toContainText(serialLargo);await expect(page.getByTestId('boton-whatsapp')).toHaveAttribute('href',/^https:\/\/wa.me\/595981123456/)}
 const m=await auditar(page);console.log('PUBLICA403RESTANTE',vista.id,width,tema,JSON.stringify(m))
 for(const[k,v]of Object.entries(m))expect.soft(v,k).toEqual(k==='desborde'?false:[])
 expect(llamadas.some(r=>r.path.includes('/ruc'))).toBe(false)
})
for(const id of ['cuenta','cotizacion','garantia'])test(`#403 ${id}: token legado32 y sufijo inválido no se recortan`,async({page})=>{
 const v=paginas.find(v=>v.id===id)
 const llamadas=await preparar(page,v)
 await page.goto(v.ruta+'ÿ')
 await expect.poll(()=>llamadas.some(r=>r.path.endsWith('%C3%BF'))).toBe(true)
 await expect(page.locator('main')).toContainText('Enlace no disponible.')
 expect(await page.locator('main').innerText()).not.toContain(nombreLargo)
})
