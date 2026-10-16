import {test,expect} from '@playwright/test'
const nombre='Samsung Galaxy S24 Ultra 512 GB Titanium Black con cobertura extendida'
const rutaFoto='/api/products/product404/images/photo404?size=thumb'
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5l8AAAAASUVORK5CYII=','base64')
const producto={id:'product404',sku:'QA404',name:nombre,pricePyg:123456789,stock:8,condition:'NEW',category:'Celulares',thumbUrl:rutaFoto,isActive:true}
const quotes=[{id:'quote404',number:'COT-404',customerName:'Cliente ficticio de la cotización',status:'DRAFT',totalPyg:123456789,items:[{description:'Cargo libre anterior',quantity:1,unitPricePyg:0,totalPyg:0},{productId:producto.id,description:nombre,quantity:1,unitPricePyg:123456789,totalPyg:123456789}]},{id:'free404',number:'COT-LIBRE',customerName:'Cliente sin producto vinculado',status:'DRAFT',totalPyg:7,items:[{description:nombre,quantity:1,unitPricePyg:7,totalPyg:7}]}]
async function setup(page,{auth=true,dark=false,missing=false,delayed=false}={}){
 const requests=[];let releaseImage
 await page.addInitScript(dark=>{localStorage.setItem('mobos:theme',dark?'dark':'light');sessionStorage.setItem('mobos:demo-guia-vista','1')},dark)
 await page.route(/https:\/\//,r=>r.abort())
 await page.route('**/api/**',async r=>{
  const u=new URL(r.request().url());if(!u.pathname.startsWith('/api/'))return r.continue()
  requests.push({path:u.pathname,search:u.search,method:r.request().method()})
  if(u.pathname==='/api/auth/me')return r.fulfill({status:auth?200:401,json:auth?{user:{id:'user404',name:'Persona ficticia',role:'ADMIN',tenantId:'tenant404',branchId:'branch404'},tenant:{id:'tenant404',name:'Empresa ficticia'}}:{}})
  if(u.pathname==='/api/products')return r.fulfill({json:[producto]})
  if(u.pathname==='/api/quotes')return r.fulfill({json:quotes})
  if(u.pathname===rutaFoto.split('?')[0]){if(delayed)await new Promise(resolve=>releaseImage=resolve);return r.fulfill(missing?{status:404,json:{error:'Sin foto'}}:{contentType:'image/png',body:png})}
  if(u.pathname.includes('branches'))return r.fulfill({json:[{id:'branch404',tenantId:'tenant404',name:'Sucursal ficticia'}]})
  return r.fulfill({json:[]})
 })
 return {requests,release:()=>releaseImage?.()}
}
async function imagenVisible(locator){await expect(locator).toBeVisible();await expect.poll(()=>locator.evaluate(el=>el.complete&&el.naturalWidth>0)).toBe(true)}
async function geometria(page){
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false)
 const recortados=await page.locator('.ventas-f3-name,.ventas-f3-description,.ventas-f3-quote-total,main h1').evaluateAll(els=>els.filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&(el.scrollWidth>el.clientWidth+1||r.right>innerWidth+1)}).map(el=>el.textContent))
 expect(recortados,'nombres, artículos e importes completos').toEqual([])
}
for(const width of [360,390,1440])for(const dark of [false,true])for(const vista of ['cotizacion','producto'])test(`#404 consumidores ${vista} ${width} ${dark?'oscuro':'claro'}`,async({page})=>{
 await page.setViewportSize({width,height:900});const {requests}=await setup(page,{dark})
 await page.goto(vista==='cotizacion'?'/cotizaciones':'/producto/QA404')
 expect(await page.locator('html').evaluate(el=>el.classList.contains('dark'))).toBe(dark)
 if(vista==='cotizacion'){
  const row=page.getByTestId('cotizacion-fila').filter({hasText:'COT-404'})
  await expect(row).toContainText(nombre);await expect(row).toContainText('123.456.789')
  await imagenVisible(row.getByRole('img',{name:`Foto de ${nombre}`,exact:true}))
  await expect(row.getByRole('button',{name:'Enviar',exact:true})).toBeVisible()
  await expect(page.getByTestId('cotizacion-fila').filter({hasText:'COT-LIBRE'}).getByTestId('foto-producto')).toHaveCount(0)
 }else{
  await expect(page.getByRole('heading',{name:nombre,exact:true})).toBeVisible();await expect(page.locator('main')).toContainText('123.456.789')
  await imagenVisible(page.getByRole('img',{name:`Foto de ${nombre}`,exact:true}))
  await expect(page.getByRole('link',{name:'Ver en el catálogo',exact:true})).toHaveAttribute('href','/productos?q=QA404')
 }
 await geometria(page)
 expect(requests.filter(r=>r.path===rutaFoto.split('?')[0])).toHaveLength(1)
 expect(requests.some(r=>r.path.includes('/ruc'))).toBe(false)
})
test('#404 producto sin sesión no consulta catálogo ni foto privada',async({page})=>{
 const {requests}=await setup(page,{auth:false});await page.goto('/producto/QA404')
 await expect(page.getByText('Iniciá sesión para ver el precio, el stock y la garantía de este producto.',{exact:true})).toBeVisible()
 expect(requests.some(r=>r.path==='/api/products'||r.path.includes('/images/'))).toBe(false)
 await expect(page.getByTestId('foto-producto')).toHaveCount(0)
})
for(const vista of ['cotizacion','producto'])test(`#404 ${vista}: foto ausente conserva nombre/precio`,async({page})=>{
 const {requests}=await setup(page,{missing:true});await page.goto(vista==='cotizacion'?'/cotizaciones':'/producto/QA404')
 const area=vista==='cotizacion'?page.getByTestId('cotizacion-fila').filter({hasText:'COT-404'}):page.locator('main')
 await expect(area).toContainText(nombre);await expect(area).toContainText('123.456.789')
 await expect.poll(()=>requests.filter(r=>r.path.includes('/images/')).length).toBe(1)
 await expect(area.getByTestId('foto-producto').locator('img')).toHaveCount(0)
})
for(const vista of ['cotizacion','producto'])for(const delayed of [false,true])test(`#404 ${vista}: invalidar contexto ${delayed?'con respuesta tardía':'con foto visible'} no conserva imagen`,async({page})=>{
 const fixture=await setup(page,{delayed});await page.goto(vista==='cotizacion'?'/cotizaciones':'/producto/QA404')
 await expect.poll(()=>fixture.requests.filter(r=>r.path.includes('/images/')).length).toBe(1)
 if(!delayed)await imagenVisible(page.getByRole('img',{name:`Foto de ${nombre}`,exact:true}))
 await page.evaluate(async()=>{await(await import('/src/lib/offline/snapshot.js')).invalidarSnapshotsPrivados({difundir:false})})
 if(delayed)fixture.release()
 await expect(page.getByTestId('foto-producto').locator('img')).toHaveCount(0)
})
