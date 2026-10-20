import {test,expect} from '@playwright/test'
import {mkdir} from 'node:fs/promises'
const out='/Users/dario/Documents/Codex/2026-10-15/gi/outputs/QA-516-shell'
async function preparar(browser,baseURL,{width,dark,ios}){
 const context=await browser.newContext({viewport:{width,height:900},baseURL})
 const page=await context.newPage(),requests=[]
 await page.addInitScript(dark=>{localStorage.setItem('mobos:theme',dark?'dark':'light');sessionStorage.setItem('mobos:demo-guia-vista','1')},dark)
 await page.route(/https:\/\//,r=>r.abort())
 await page.route('**/api/**',r=>{if(!new URL(r.request().url()).pathname.startsWith('/api/'))return r.continue();requests.push(r.request().method()+' '+new URL(r.request().url()).pathname);return r.fulfill({status:503,json:{error:'Demo local aislada516'}})})
 if(ios){
  // Persisten a través de la navegación completa de entrarDemo. Sólo flags de
  // interfaz: arranque/Keychain/plugins reales quedan reemplazados en el arnés.
  await page.route(/\/src\/lib\/plataforma\.js(?:\?.*)?$/,async r=>{const response=await r.fetch();const source=await response.text();const body=source.replace('function isNativeIOS(capacitor = Capacitor) {','function isNativeIOS(capacitor = Capacitor) { return true;');expect(body).not.toBe(source);await r.fulfill({response,body})})
  await page.route(/\/src\/lib\/nativo\/arranque\.js(?:\?.*)?$/,async r=>{const response=await r.fetch();const source=await response.text();const body=source.replace('async function prepararNativo() {','async function prepararNativo() { document.documentElement.classList.add("app-ios"); return;').replace('async function mostrarApp() {','async function mostrarApp() { return;');expect(body).not.toBe(source);await r.fulfill({response,body})})
  await page.route(/\/src\/lib\/api\/nativo\.js(?:\?.*)?$/,async r=>{const response=await r.fetch();await r.fulfill({response,body:(await response.text())+'\nconst qa516Store=new Map();usarAlmacen({get:async key=>qa516Store.get(key)||null,set:async(key,value)=>qa516Store.set(key,value),remove:async key=>qa516Store.delete(key)});\n'})})
 }
 await page.goto('/demo',{waitUntil:'domcontentloaded'})
 await expect(page.getByRole('button',{name:'Entrar como Dueño',exact:true})).toBeVisible()
 expect(await page.evaluate(async()=> (await import('/src/lib/plataforma.js')).isNativeIOS())).toBe(ios)
 if(ios)expect(await page.evaluate(async()=>{const p=await import('/src/lib/plataforma.js');return {vender:p.moduloDisponible('cargar'),inventario:p.moduloDisponible('inventario'),finanzas:p.moduloDisponible('finanzas')}})).toEqual({vender:true,inventario:false,finanzas:false})
 await page.getByRole('button',{name:'Entrar como Dueño',exact:true}).click()
 await expect(page.getByTestId('shell')).toBeVisible()
 const nav=width<1024?page.getByTestId('shell-bottom-nav'):page.getByTestId('shell-lateral').getByRole('navigation',{name:'Navegación principal',exact:true})
 await nav.getByRole('button',{name:'Vender',exact:true}).click()
 await expect(page.getByTestId('pos-bloque-productos')).toBeVisible()
 expect(await page.evaluate(async()=> (await import('/src/lib/plataforma.js')).isNativeIOS())).toBe(ios)
 expect(await page.locator('html').evaluate(el=>el.classList.contains('app-ios'))).toBe(ios)
 expect(await page.locator('html').evaluate(el=>el.classList.contains('dark'))).toBe(dark)
 return {context,page,requests}
}
async function medir(page){return page.evaluate(()=>{
 const box=selector=>{const el=document.querySelector(selector);if(!el)return null;const r=el.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}}
 const smallTouch=[...document.querySelectorAll('[data-testid="shell-mobile-header"] button,[data-testid="pos-acciones-movil"] button,[data-testid="cobro-medios"] button')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&(r.width<43.5||r.height<43.5)}).map(el=>el.textContent.trim())
 return {smallTouch,overflow:document.documentElement.scrollWidth>innerWidth,header:box(innerWidth<1024?'[data-testid="shell-mobile-header"]':'div:has(> [data-testid="shell-breadcrumb"])'),productos:box('[data-testid="pos-bloque-productos"]'),foto:box('[data-testid="pos-bloque-productos"] [data-testid="foto-producto"]'),busqueda:[...document.querySelectorAll('input')].filter(el=>el.placeholder==='Buscar producto…').map(el=>({height:Math.round(el.getBoundingClientRect().height),font:getComputedStyle(el).fontSize})),cobro:box(innerWidth<768?'[data-testid="cobro-movil"]':'[data-testid="pos-cobro"]'),total:box('[data-testid="cobro-total-grande"]'),pedido:box('[data-testid="pedido-fila"]')}
})}
async function agregarYCobrar(page,width){
 const prod=await page.evaluate(async()=>{const s=await import('/src/lib/storage.js'),{agruparProductos}=await import('/src/utils/colores.js');const f=agruparProductos(s.getProductos().filter(p=>p.activo)).find(f=>f.items.length===1&&Number(f.items[0].stock)>=2&&/Funda|Cargador/.test(f.base));return {nombre:f.base,precio:Number(f.items[0].precioVenta)}})
 await page.getByPlaceholder('Buscar producto…').fill(prod.nombre)
 await page.locator('.pos-product-card',{hasText:prod.nombre}).first().click()
 if(width<768){await page.getByTestId('pos-barra-carrito-abrir').click();await page.getByTestId('carrito-cobrar').click();await expect(page.getByTestId('cobro-movil')).toBeVisible();await expect.poll(async()=>Math.round((await page.getByTestId('cobro-movil').boundingBox()).y)).toBe(0);await expect(page.getByTestId('cobro-total-grande')).toContainText(prod.precio.toLocaleString('es-PY'))}
 else {
  // Desktop keeps checkout collapsed until the explicit Cobrar action; this
  // mirrors the current POS flow instead of asserting an unmounted payment
  // panel immediately after adding a product.
  await page.getByRole('button', { name: /^Cobrar(?:\s|$)/ }).first().click()
  await expect(page.getByTestId('pos-cobro')).toBeVisible()
 }
 return prod
}
for(const width of [360,390,1440])for(const dark of [false,true])test(`#516 misma fuente web/iOS simulado ${width} ${dark?'oscuro':'claro'}`,async({browser,baseURL})=>{
 const web=await preparar(browser,baseURL,{width,dark,ios:false}),ios=await preparar(browser,baseURL,{width,dark,ios:true})
 try{
  const a=await medir(web.page),b=await medir(ios.page)
  expect(a.overflow).toBe(false);expect(b.overflow).toBe(false)
  if(width<1024){expect(a.smallTouch).toEqual([]);expect(b.smallTouch).toEqual([])}
  expect(b.header,'cabecera compartida, safeareas0 en Chromium').toEqual(a.header)
  expect(b.productos,'misma tarjeta catálogo').toEqual(a.productos)
  expect(b.foto,'mismo icono/foto').toEqual(a.foto)
  const wa=await agregarYCobrar(web.page,width),ia=await agregarYCobrar(ios.page,width);expect(ia).toEqual(wa)
  const ca=await medir(web.page),cb=await medir(ios.page)
  expect(cb.cobro).toEqual(ca.cobro);expect(cb.total).toEqual(ca.total)
  expect(ca.overflow).toBe(false);expect(cb.overflow).toBe(false)
  if(width<1024){expect(ca.smallTouch).toEqual([]);expect(cb.smallTouch).toEqual([])}
  if(width===390&&dark&&process.env.MOBOS_516_SHOTS==='1'){await mkdir(out,{recursive:true});await ios.page.screenshot({path:out+'/390-oscuro-cobro-ios-simulado.png'})}
  if(width<768)for(const p of [web.page,ios.page])await p.getByRole('dialog').getByRole('button',{name:/Cerrar/}).first().click()
  for(const p of [web.page,ios.page]){await p.evaluate(()=>{history.pushState(null,'','/pedidos');dispatchEvent(new PopStateEvent('popstate'))});await expect(p.getByTestId('pedido-fila').first()).toBeVisible()}
  const pa=await medir(web.page),pb=await medir(ios.page);expect({x:pb.pedido.x,width:pb.pedido.width,height:pb.pedido.height}).toEqual({x:pa.pedido.x,width:pa.pedido.width,height:pa.pedido.height}); // y cambia al ocultar pestañas de módulos no disponibles en iOS
  expect(pa.overflow).toBe(false);expect(pb.overflow).toBe(false)
  console.log('PARIDAD516',JSON.stringify({width,dark,web:a,ios:b,cobroWeb:ca.cobro,cobroIOS:cb.cobro,pedidoWeb:pa.pedido,pedidoIOS:pb.pedido,webRequests:web.requests.length,iosRequests:ios.requests.length}))
 }finally{await web.context.close();await ios.context.close()}
})

async function esperarAnimacion(sheet){await expect(sheet).toBeVisible();await expect.poll(()=>sheet.evaluate(el=>Math.round(new DOMMatrixReadOnly(getComputedStyle(el).transform).m42))).toBe(0)}
async function comprobarControles(sheet,height,cta){
 const close=sheet.getByRole('button',{name:'Cerrar',exact:true});const targets=cta?[close,sheet.getByTestId(cta)]:[close]
 for(const target of targets){const r=await target.boundingBox();expect(r.width).toBeGreaterThanOrEqual(44);expect(r.height).toBeGreaterThanOrEqual(44);expect(r.x).toBeGreaterThanOrEqual(0);expect(r.y).toBeGreaterThanOrEqual(0);expect(r.y+r.height).toBeLessThanOrEqual(height)}
}
for(const height of [640,844])for(const dark of [false,true])test(`#516 hojas auto/full ${height} ${dark?'oscuro':'claro'}: cabecera, CTA, teclado y cambio de altura`,async({browser,baseURL})=>{
 const pages=[]
 try{
  for(const ios of [false,true]){
   const f=await preparar(browser,baseURL,{width:390,dark,ios});pages.push(f)
   await f.page.setViewportSize({width:390,height})
   const nombre=await f.page.evaluate(async()=>{const {getProductos}=await import('/src/lib/storage.js'),{agruparProductos}=await import('/src/utils/colores.js');return agruparProductos(getProductos().filter(p=>p.activo)).find(f=>f.items.length===1&&Number(f.items[0].stock)>=2&&/Funda|Cargador/.test(f.base)).base})
   await f.page.getByPlaceholder('Buscar producto…').fill(nombre);await f.page.locator('.pos-product-card',{hasText:nombre}).first().click()
   await f.page.getByTestId('pos-barra-carrito-abrir').click()
   const auto=f.page.getByTestId('hoja-carrito');await esperarAnimacion(auto);await comprobarControles(auto,height,'carrito-cobrar')
   await auto.getByTestId('carrito-cobrar').click()
   const full=f.page.getByTestId('cobro-movil');await esperarAnimacion(full)
   expect(Math.round((await full.boundingBox()).y)).toBe(0);expect(Math.round((await full.boundingBox()).height)).toBe(height)
   await comprobarControles(full,height)
   await full.getByTestId('cobro-dividir').click();await expect(full.getByTestId('cobro-teclado')).toBeVisible()
   await comprobarControles(full,height,'teclado-aceptar')
   const rotated=height===640?844:640;await f.page.setViewportSize({width:390,height:rotated})
   expect(Math.round((await full.boundingBox()).y)).toBe(0);expect(Math.round((await full.boundingBox()).height)).toBe(rotated)
   await comprobarControles(full,rotated,'teclado-aceptar')
   await f.page.keyboard.press('Tab');expect(await full.evaluate(el=>el.contains(document.activeElement))).toBe(true)
   await f.page.keyboard.press('Escape');await expect(full).toHaveCount(0)
   expect(await f.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false)
  }
 }finally{for(const f of pages)await f.context.close()}
})

async function irRuta516(page,path){
 await page.evaluate(path=>{history.pushState(null,'',path);dispatchEvent(new PopStateEvent('popstate'))},path)
 await expect.poll(()=>page.evaluate(()=>location.pathname)).toBe(path)
}
test('#516 el shell móvil recupera el espacio inferior al abrir y cerrar el teclado',async({browser,baseURL})=>{
 const pages=[]
 try{
  for(const ios of [false,true]){
   const f=await preparar(browser,baseURL,{width:390,dark:false,ios});pages.push(f)
   await f.page.setViewportSize({width:390,height:430})
   await irRuta516(f.page,'/clientes')
   const nav=f.page.getByTestId('shell-bottom-nav')
   const body=f.page.locator('.shell-body')
   const search=f.page.getByRole('textbox',{name:'Buscar clientes',exact:true})
   await expect(nav).toBeVisible()
   await expect.poll(()=>body.evaluate(el=>getComputedStyle(el).paddingBottom)).toBe('56px')
   await search.focus()
   await expect(nav).toBeHidden()
   await expect.poll(()=>body.evaluate(el=>getComputedStyle(el).paddingBottom)).toBe('0px')
   const fontSize=await search.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))
   expect(fontSize,'los campos en iOS evitan zoom al abrir teclado').toBeGreaterThanOrEqual(ios?16:12)
   await search.blur()
   await expect(nav).toBeVisible()
   await expect.poll(()=>body.evaluate(el=>getComputedStyle(el).paddingBottom)).toBe('56px')
  }
 }finally{for(const f of pages)await f.context.close()}
})

for (const width of [360, 390]) test(`#521 Inicio móvil web/iOS simulado ${width}px: marca, avisos y resumen con los mismos datos`, async ({ browser, baseURL }) => {
 const pages = []
 try {
  for (const ios of [false, true]) {
   const f = await preparar(browser, baseURL, { width, dark: false, ios })
   pages.push(f)
   await irRuta516(f.page, '/resumen')
   await expect(f.page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible()
   await expect(f.page.getByTestId('resumen-indicadores')).toBeVisible()
   await expect(f.page.getByTestId('notificaciones-aviso-mobile')).toBeVisible()
   await expect(f.page.locator('[data-testid="shell-mobile-brand"]:visible, [data-testid="shell-mobile-brand-icon"]:visible').first()).toBeVisible()
   for (const id of ['indicador-facturado', 'indicador-cobrado', 'indicador-por-cobrar', 'indicador-margen']) {
    await expect(f.page.getByTestId(id)).toBeVisible()
   }
   expect(await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
   f.inicio = await f.page.evaluate(() => ({
    indicadores: [...document.querySelectorAll('[data-testid="resumen-indicadores"] [data-testid^="indicador-"]')].map(el => el.innerText.trim()),
    marca: (() => { const el = [...document.querySelectorAll('[data-testid="shell-mobile-brand"], [data-testid="shell-mobile-brand-icon"]')].find(node => node.getBoundingClientRect().width > 0); const r = el?.getBoundingClientRect(); return r ? { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } : null })(),
    notificaciones: (() => { const r = document.querySelector('[data-testid="notificaciones-aviso-mobile"]')?.getBoundingClientRect(); return r ? { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } : null })(),
   }))
  }
  expect(pages[0].inicio.indicadores).toEqual(pages[1].inicio.indicadores)
  expect(pages[0].inicio.marca).toEqual(pages[1].inicio.marca)
  expect(pages[0].inicio.notificaciones).toEqual(pages[1].inicio.notificaciones)
  expect(pages[0].inicio.marca.width).toBeGreaterThan(0)
  expect(pages[0].inicio.notificaciones.width).toBeGreaterThanOrEqual(44)
  expect(pages[0].inicio.notificaciones.height).toBeGreaterThanOrEqual(44)
  console.log('PARIDAD521_INICIO', JSON.stringify({ width, web: pages[0].inicio, iosSimulado: pages[1].inicio }))
 } finally { for (const f of pages) await f.context.close() }
})

for (const width of [320, 375, 390, 430]) test(`#546 cabecera móvil ${width}px: sucursal legible y controles táctiles`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await page.route('**/src/hooks/usePresence.js*', async route => {
    const response = await route.fetch()
    const source = await response.text()
    const body = source.replace('return personas', 'return [{ id: "mobile-qa-peer", name: "Vendedor QA" }]')
    expect(body).not.toBe(source)
    await route.fulfill({ response, body })
  })
  await page.route('**/src/hooks/useColaOffline.js*', async route => {
    const response = await route.fetch()
    const source = await response.text()
    const body = source.replace(
      'return { ...resumen, items, reporte, sincronizando, sincronizar, refrescar, enLinea }',
      'return { ...resumen, pendientes: 2, items, reporte, sincronizando, sincronizar, refrescar, enLinea }',
    )
    expect(body).not.toBe(source)
    await route.fulfill({ response, body })
  })
  await page.route('**/api/**', route =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' }),
  )
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => sessionStorage.setItem('mobos:demo-guia-vista', '1'))
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()

  const header = page.getByTestId('shell-mobile-header')
  const sucursal = header.locator('[data-testid="sucursal-info"], [data-testid="sucursal-selector"]')
  await expect(sucursal).toBeVisible()
  await expect(sucursal).toHaveAttribute('aria-label', /Sucursal|Tienda/)
  await expect(header.getByTestId('shell-cola-offline-pill')).toBeVisible()
  await expect(header.getByTestId('shell-equipo-online-mobile')).toHaveAccessibleName('Equipo en línea: 1 persona')
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)

  const sucursalBox = await sucursal.boundingBox()
  expect(sucursalBox.width).toBeGreaterThanOrEqual(44)
  expect(sucursalBox.height).toBeGreaterThanOrEqual(44)
  for (const selector of ['shell-cola-offline-pill', 'shell-buscar-mobile', 'notificaciones-aviso-mobile', 'shell-equipo-online-mobile', 'shell-perfil-mobile']) {
    const box = await header.getByTestId(selector).boundingBox()
    expect(box.width, selector).toBeGreaterThanOrEqual(44)
    expect(box.height, selector).toBeGreaterThanOrEqual(44)
    expect(box.x, selector).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width, selector).toBeLessThanOrEqual(width)
  }

  await header.getByTestId('shell-equipo-online-mobile').click()
  await expect(page.getByRole('dialog', { name: 'Equipo en línea' })).toBeVisible()
})
async function geometria516(locator){return locator.evaluate(el=>{const r=el.getBoundingClientRect();return {x:Math.round(r.x),width:Math.round(r.width),height:Math.round(r.height)}})}
async function campo516(locator,width){
 await expect(locator).toBeVisible()
 const r=await locator.boundingBox();expect(r.width).toBeGreaterThanOrEqual(44);expect(r.height).toBeGreaterThanOrEqual(44)
 expect(r.x).toBeGreaterThanOrEqual(0);expect(r.x+r.width).toBeLessThanOrEqual(width+1)
 expect(await locator.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12)
 await locator.focus();await expect(locator).toBeFocused()
}
for(const width of [360,390,1440])for(const dark of [false,true])test(`#516 Clientes y Configuración pareados ${width} ${dark?'oscuro':'claro'}`,async({browser,baseURL})=>{
 const pairs=[]
 try{
  for(const ios of [false,true]){
   const f=await preparar(browser,baseURL,{width,dark,ios});pairs.push(f)
   await irRuta516(f.page,'/clientes')
   const search=f.page.getByRole('textbox',{name:'Buscar clientes',exact:true})
   await campo516(search,width)
   await expect(f.page.getByTestId('resumen-clientes')).toBeVisible()
   await campo516(f.page.getByRole('button',{name:'+ Crear cliente',exact:true}),width)
   await search.fill('María');await expect(search).toHaveValue('María');await search.fill('')
   f.clientes={barra:await geometria516(f.page.getByTestId('barra-clientes')),resumen:await geometria516(f.page.getByTestId('resumen-clientes'))}
   expect(await f.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false)
   await irRuta516(f.page,width<1024?'/configuracion':'/configuracion/mi-cuenta')
   await expect(f.page.getByTestId('config-pagina')).toBeVisible()
   if(width<1024){
    const secciones=f.page.getByRole('navigation',{name:'Secciones de Configuración',exact:true})
    await campo516(secciones.getByRole('button',{name:'Mi cuenta',exact:true}),width)
    await secciones.getByRole('button',{name:'Mi cuenta',exact:true}).click()
   }else await irRuta516(f.page,'/configuracion/mi-cuenta')
   await expect(f.page.getByTestId('mi-cuenta-perfil')).toBeVisible()
   // El bloque propio del equipo iPhone añade altura; no se exige altura
   // total idéntica ni se eliminan controles nativos para igualar la web.
   await expect(f.page.getByTestId('mi-cuenta-iphone')).toHaveCount(ios?1:0)
   const nombre=f.page.getByRole('textbox',{name:'Nombre',exact:true})
   await campo516(nombre,width);await expect(nombre).toHaveValue(/Hernán/)
   f.config={pagina:await geometria516(f.page.getByTestId('config-pagina')),perfil:await geometria516(f.page.getByTestId('mi-cuenta-perfil')),nombre:await geometria516(nombre)}
   expect(await f.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false)
   expect(await f.page.evaluate(async()=> (await import('/src/lib/plataforma.js')).isNativeIOS())).toBe(ios)
   expect(await f.page.locator('html').evaluate(el=>el.classList.contains('app-ios'))).toBe(ios)
  }
  expect(pairs[1].clientes).toEqual(pairs[0].clientes)
  expect(pairs[1].config.perfil).toEqual(pairs[0].config.perfil)
  expect(pairs[1].config.nombre).toEqual(pairs[0].config.nombre)
  expect(pairs[1].config.pagina.x).toBe(pairs[0].config.pagina.x)
  expect(pairs[1].config.pagina.width).toBe(pairs[0].config.pagina.width)
  console.log('PARIDAD516_CLIENTES_CONFIG',JSON.stringify({width,dark,clientes:pairs[0].clientes,config:pairs[0].config}))
 }finally{for(const f of pairs)await f.context.close()}
})
