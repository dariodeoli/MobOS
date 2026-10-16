import { test, expect } from '@playwright/test'

async function aislar(page, dark = false) {
 await page.addInitScript(d => { localStorage.setItem('mobos:theme', d?'dark':'light');document.documentElement.classList.toggle('dark',d) },dark)
 await page.route('**/api/**',r=>new URL(r.request().url()).pathname.startsWith('/api/') ? r.fulfill({status:401,json:{message:'Fixture sin sesión'}}) : r.continue())
 await page.route(/https:\/\//,r=>r.abort())
}
async function medir(page, selector) {
 return page.locator(selector).evaluate(el=>{
  const r=el.getBoundingClientRect()
  const controls=[...el.querySelectorAll('button,a[href],input,summary,select')].filter(n=>{const s=getComputedStyle(n),b=n.getBoundingClientRect();return b.width>0&&b.height>0&&s.display!=='none'&&s.visibility!=='hidden'})
  return {width:document.documentElement.scrollWidth,viewport:innerWidth,height:document.documentElement.scrollHeight,viewportHeight:innerHeight,rect:r.toJSON(),scroll:el.scrollHeight,client:el.clientHeight,controls:controls.map(n=>({name:n.getAttribute('aria-label')||n.textContent||n.id,...n.getBoundingClientRect().toJSON()}))}
 })
}
for(const [width,height] of [[320,568],[360,640],[375,667],[390,844],[430,932]])for(const dark of [false,true]){
 test(`PIN completo ${width}x${height} ${dark?'oscuro':'claro'}`,async({page})=>{
  await page.setViewportSize({width,height});await aislar(page,dark);await page.goto('/e2e/fixtures/pin-tactil.html')
  await expect(page.getByTestId('pin-teclado')).toBeVisible()
  const input=page.getByTestId('pin-input');await expect(input).toHaveAttribute('readonly','');await expect(input).toHaveAttribute('inputmode','none')
  await page.getByTestId('pin-indicadores').click();await expect(input).not.toBeEditable()
  const m=await medir(page,'.lock-overlay')
  expect(m.width).toBeLessThanOrEqual(width);expect(m.scroll).toBeLessThanOrEqual(m.client+1)
  for(const c of m.controls.filter(c=>!c.name.includes('PIN de'))){expect(c.width,c.name).toBeGreaterThanOrEqual(44);expect(c.height,c.name).toBeGreaterThanOrEqual(44);expect(c.bottom,c.name).toBeLessThanOrEqual(height);expect(c.top,c.name).toBeGreaterThanOrEqual(0)}
  const screen=page.getByTestId('pantalla-bloqueada');expect(await screen.evaluate(n=>getComputedStyle(n).borderRadius)).toBe('0px')
  for(const d of '9999')await page.getByRole('button',{name:`Dígito ${d}`,exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('PIN inválido')
  expect((await medir(page,'.lock-overlay')).scroll).toBeLessThanOrEqual(m.client+1)
  for(const d of '30')await page.getByRole('button',{name:`Dígito ${d}`,exact:true}).click()
  await page.getByRole('button',{name:'Borrar último dígito'}).click()
  for(const d of '001')await page.getByRole('button',{name:`Dígito ${d}`,exact:true}).click()
  await expect(screen).toHaveCount(0);await expect(page.getByTestId('intentos')).toHaveText('2')
  await page.getByRole('button',{name:'Volver a bloquear'}).click();await expect(screen).toBeVisible()
 })
 test(`login completo ${width}x${height} ${dark?'oscuro':'claro'}`,async({page})=>{
  await page.setViewportSize({width,height});await aislar(page,dark);await page.goto('/login')
  await expect(page.getByRole('heading',{name:'Entrá a tu tienda'})).toBeVisible()
  await expect(page.getByText('Verificando tu sesión…')).toHaveCount(0)
  const m=await medir(page,'main.auth-login')
  expect(m.width).toBeLessThanOrEqual(width);expect(m.height).toBeLessThanOrEqual(height+1)
  for(const c of m.controls){expect(c.bottom,c.name).toBeLessThanOrEqual(height+1);expect(c.height,c.name).toBeGreaterThanOrEqual(44)}
 })
}

for (const [width,height] of [[320,568],[390,844]]) test(`PIN inicial ${width}: sin teclado y texto ampliado alcanzable`,async({page})=>{
 await page.setViewportSize({width,height});await aislar(page)
 await page.route('**/api/auth/login',r=>r.fulfill({json:{tenant:{id:'fixture',name:'Tienda de prueba'},sellers:[{id:'seller',name:'Vendedor'}]}}))
 await page.goto('/login');await page.locator('#mail').fill('qa@example.invalid');await page.locator('#pass').fill('Fixture123456!');await page.getByRole('button',{name:'Continuar',exact:true}).click()
 await expect(page.locator('#seller-pin')).toHaveAttribute('readonly','');await expect(page.getByTestId('pin-teclado')).toBeVisible()
 await expect.poll(()=>page.evaluate(()=>document.activeElement?.tagName)).not.toBe('INPUT')
 await page.getByTestId('pin-indicadores').click()
 expect(await page.locator('#seller-pin').evaluate(n=>n===document.activeElement)).toBe(false)
 const normal=await medir(page,'main.auth-login');expect(normal.height).toBeLessThanOrEqual(height+1)
 await page.locator('summary').click();await expect(page.getByRole('combobox',{name:'Elegí tu usuario'})).toBeInViewport()
 expect((await medir(page,'main.auth-login')).height).toBeLessThanOrEqual(height+1)
 await page.evaluate(()=>document.documentElement.style.fontSize='200%')
 await page.getByRole('button',{name:'← Volver a empresa'}).scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'← Volver a empresa'})).toBeInViewport()
})

test('PIN al reanudar retira foco editable; escritorio conserva teclado físico',async({page})=>{
 await page.setViewportSize({width:390,height:844});await aislar(page);await page.goto('/e2e/fixtures/pin-tactil.html')
 await page.getByTestId('pin-teclado').waitFor()
 await page.evaluate(()=>{const input=document.createElement('input');document.body.append(input);input.focus();document.dispatchEvent(new Event('visibilitychange'))})
 expect(await page.evaluate(()=>document.activeElement?.tagName)).not.toBe('INPUT')
 await page.setViewportSize({width:1440,height:900})
 await page.goto('/login');await page.route('**/api/auth/login',r=>r.fulfill({json:{tenant:{id:'fixture',name:'Tienda de prueba'},sellers:[{id:'seller',name:'Vendedor'}]}}))
 await page.locator('#mail').fill('qa@example.invalid');await page.locator('#pass').fill('Fixture123456!');await page.getByRole('button',{name:'Continuar',exact:true}).click()
 const pin=page.locator('#seller-pin');await expect(pin).toBeEditable();await expect(page.getByTestId('pin-teclado')).toHaveCount(0)
 await pin.pressSequentially('12');await expect(pin).toHaveValue('12')
})

for(const estado of ['faceid','busy'])test(`bloqueo320 estado ${estado}: controles presentes sin scroll`,async({page})=>{
 await page.setViewportSize({width:320,height:568});await aislar(page);await page.goto(`/e2e/fixtures/pin-tactil.html?estado=${estado}`)
 await expect(page.getByTestId('pantalla-bloqueada')).toBeVisible()
 if(estado==='faceid')await expect(page.getByRole('button',{name:'Usar Face ID'})).toBeVisible()
 else await expect(page.locator('.lock-ayuda')).toContainText('Verificando')
 const m=await medir(page,'.lock-overlay');expect(m.scroll).toBeLessThanOrEqual(m.client+1)
 for(const c of m.controls.filter(c=>!c.name.includes('PIN de'))){expect(c.top,c.name).toBeGreaterThanOrEqual(0);expect(c.bottom,c.name).toBeLessThanOrEqual(568)}
})

test('correo/contraseña con body resize nativo: campo y acciones alcanzables; restauración al ocultar',async({page})=>{
 await page.setViewportSize({width:390,height:844});await aislar(page);await page.goto('/login')
 const main=page.locator('main.auth-login'),pass=page.locator('#pass')
 await pass.focus()
 await page.evaluate(()=>{document.body.style.height='400px';window.dispatchEvent(Object.assign(new Event('keyboardDidShow'),{keyboardHeight:444}))})
 await expect(main).toHaveAttribute('data-teclado-visible','true')
 expect((await main.boundingBox()).height).toBe(400)
 const r=await pass.boundingBox();expect(r.y+r.height).toBeLessThanOrEqual(400)
 await page.getByRole('button',{name:'Continuar',exact:true}).scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'Continuar',exact:true})).toBeInViewport()
 await page.evaluate(()=>{document.body.style.height='';window.dispatchEvent(new Event('keyboardDidHide'))})
 await expect(main).toHaveAttribute('data-teclado-visible','false')
 expect((await medir(page,'main.auth-login')).height).toBeLessThanOrEqual(845)
})
