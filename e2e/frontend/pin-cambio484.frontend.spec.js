import {test,expect} from '@playwright/test'

async function abrir(page,width=390,height=844,dark=false){
 await page.setViewportSize({width,height})
 await page.addInitScript(d=>{localStorage.setItem('mobos:theme',d?'dark':'light');sessionStorage.setItem('mobos:demo-guia-vista','1')},dark)
 await page.route('**/api/**',r=>new URL(r.request().url()).pathname.startsWith('/api/')?r.fulfill({status:503,json:{message:'Demo aislada'}}):r.continue())
 await page.route(/https:\/\//,r=>r.abort())
 await page.goto('/demo');await page.getByRole('button',{name:'Entrar como Dueño',exact:true}).click()
 await page.getByTestId(width<1024?'shell-perfil-mobile':'shell-perfil').click()
 await page.getByTestId('shell-bloquear').click()
 await page.getByRole('button',{name:'Cambiar de usuario',exact:true}).click()
 return page.getByRole('dialog',{name:'Cambiar vendedor',exact:true})
}
async function digitos(dialog,pin){for(const n of pin)await dialog.getByRole('button',{name:`Dígito ${n}`,exact:true}).click()}

for(const [width,height,dark] of [[320,568,false],[375,667,true],[390,844,false]])test(`cambio vendedor ${width}: PIN táctil sin teclado del sistema, máscara y contexto`,async({page})=>{
 const dialog=await abrir(page,width,height,dark),input=dialog.locator('#seller-switch-pin')
 await expect(input).toHaveAttribute('readonly','');await expect(input).toHaveAttribute('inputmode','none')
 await dialog.getByTestId('pin-indicadores').click();expect(await input.evaluate(n=>n===document.activeElement)).toBe(false)
 await expect(dialog.getByTestId('pin-teclado')).toBeVisible()
 const botones=dialog.getByTestId('pin-teclado').getByRole('button')
 expect(await botones.count()).toBe(11)
 for(const box of await botones.evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().toJSON()))){expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);expect(box.left).toBeGreaterThanOrEqual(0);expect(box.right).toBeLessThanOrEqual(width)}
 await digitos(dialog,'30');await expect(dialog.locator('.pin-seg-punto')).toHaveCount(2)
 await dialog.getByRole('button',{name:'Borrar último dígito',exact:true}).click();await expect(input).toHaveValue('3')
 // Los dígitos pertenecen al usuario elegido; nunca pasan a otro contexto.
 await dialog.locator('#seller-switch').selectOption({label:'Diego López'});await expect(input).toHaveValue('')
 await digitos(dialog,'2001');await expect(dialog).toHaveCount(0);await expect(page).toHaveURL(/\/pos$/)
 await expect(page.getByTestId('pantalla-bloqueada')).toHaveCount(0)
})


test('cambio vendedor: error recuperable, cerrar limpia PIN y escritorio conserva teclado físico',async({page})=>{
 const dialog=await abrir(page)
 await digitos(dialog,'2001') // PIN público del vendedor, incorrecto para el dueño elegido.
 await expect(page.getByText('PIN demo inválido.',{exact:true})).toBeVisible()
 await expect(dialog.locator('#seller-switch-pin')).toHaveValue('')
 await expect(dialog.getByTestId('pin-segmentado')).toHaveAttribute('data-invalido','true')
 await digitos(dialog,'30');await page.keyboard.press('Escape')
 await page.getByRole('button',{name:'Cambiar de usuario',exact:true}).click()
 await expect(dialog.locator('#seller-switch-pin')).toHaveValue('')
 await expect(dialog.getByTestId('pin-segmentado')).not.toHaveAttribute('data-invalido','true')
 await page.setViewportSize({width:1440,height:900})
 const input=dialog.locator('#seller-switch-pin');await expect(input).toBeEditable()
 await expect(dialog.getByTestId('pin-teclado')).toHaveCount(0)
 await input.pressSequentially('3001');await expect(dialog).toHaveCount(0)
 await expect(page.getByTestId('pantalla-bloqueada')).toHaveCount(0)
})

test('cambio vendedor API: respeta seis dígitos y una sola validación mientras está ocupado',async({page})=>{
 await page.setViewportSize({width:390,height:844})
 const tenant={id:'qa-tenant-484',name:'Tienda ficticia'},sellers=[{id:'qa-owner-484',name:'Dueño ficticio',role:'ADMIN',pinLength:4},{id:'qa-seller-484',name:'Vendedor seis',role:'VENDEDOR',pinLength:6}]
 let current=sellers[0],posts=[];let finish;const gate=new Promise(resolve=>{finish=resolve})
 await page.addInitScript(data=>{localStorage.setItem('owncoding_hub_company_context',JSON.stringify({tenant:data.tenant,sellers:data.sellers,cookieSession:true}))},{tenant,sellers})
 await page.route('**/api/**',async r=>{
  const path=new URL(r.request().url()).pathname;if(!path.startsWith('/api/'))return r.continue()
  if(path==='/api/auth/me')return r.fulfill({json:{tenant,user:{...current,tenantId:tenant.id,branchId:'qa-branch-484',branchName:'Sucursal ficticia'}}})
  if(path==='/api/auth/pin'){
   posts.push(r.request().postDataJSON());await gate;current=sellers[1]
   return r.fulfill({json:{tenant,user:{...current,tenantId:tenant.id,branchId:'qa-branch-484',branchName:'Sucursal ficticia'}}})
  }
  return r.fulfill({json:[]})
 })
 await page.goto('/pos');await page.getByTestId('shell-perfil-mobile').click();await page.getByTestId('shell-bloquear').click();await page.getByRole('button',{name:'Cambiar de usuario',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'Cambiar vendedor',exact:true});await dialog.locator('#seller-switch').selectOption('qa-seller-484')
 await expect(dialog.locator('#seller-switch-pin')).toHaveAttribute('maxlength','6')
 await digitos(dialog,'12345');expect(posts).toEqual([])
 await digitos(dialog,'6');await expect.poll(()=>posts.length).toBe(1)
 await expect(dialog.locator('#seller-switch')).toBeDisabled()
 for(const key of await dialog.getByTestId('pin-teclado').getByRole('button').all())await expect(key).toBeDisabled()
 await page.keyboard.press('Escape');await expect(dialog).toBeVisible()
 expect(posts).toEqual([{sellerId:'qa-seller-484',pin:'123456'}])
 finish();await expect(dialog).toHaveCount(0);await expect(page.getByTestId('pantalla-bloqueada')).toHaveCount(0)
})
