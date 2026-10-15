import { test, expect } from '@playwright/test'

async function abrir(page) {
 await page.route('**/api/**', route=>new URL(route.request().url()).pathname.startsWith('/api/') ? route.fulfill({status:503,json:{error:'Fixture sin servidor'}}) : route.continue())
 await page.goto('/e2e/fixtures/pin-tactil.html')
 await expect(page.getByTestId('pin-teclado')).toBeVisible()
}
async function digitos(page, pin) { for(const d of pin) await page.getByRole('button',{name:`Dígito ${d}`,exact:true}).click() }
for(const [width,height,dark] of [[375,667,false],[390,844,true],[360,740,false]]) test(`PIN táctil ${width}x${height}, ${dark?'oscuro':'claro'}: teclas y máscara sin teclado del sistema`,async({page})=>{
 await page.setViewportSize({width,height}); await abrir(page)
 await page.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark)
 const input=page.getByTestId('pin-input')
 await expect(input).toHaveAttribute('readonly',''); await expect(input).toHaveAttribute('inputmode','none')
 expect(await input.evaluate(el=>el===document.activeElement)).toBe(false)
 const keys=page.getByTestId('pin-teclado').getByRole('button')
 expect(await keys.count()).toBe(11)
 for(const r of await keys.evaluateAll(els=>els.map(el=>el.getBoundingClientRect().toJSON()))) { expect(r.width).toBeGreaterThanOrEqual(44);expect(r.height).toBeGreaterThanOrEqual(44);expect(r.left).toBeGreaterThanOrEqual(0);expect(r.right).toBeLessThanOrEqual(width);expect(r.bottom).toBeLessThanOrEqual(height) }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await digitos(page,'30'); await expect(page.locator('.pin-seg-punto')).toHaveCount(2)
 await page.getByRole('button',{name:'Borrar último dígito'}).click(); await expect(page.locator('.pin-seg-punto')).toHaveCount(1)
 await digitos(page,'001');await expect(page.getByTestId('pantalla-bloqueada')).toHaveCount(0);await expect(page.getByTestId('intentos')).toHaveText('1')
 await page.getByRole('button',{name:'Volver a bloquear'}).click();await expect(keys.first()).toBeEnabled();await digitos(page,'3001');await expect(page.getByTestId('pantalla-bloqueada')).toHaveCount(0);await expect(page.getByTestId('intentos')).toHaveText('2')
})
test('PIN táctil: error recuperable, bloqueo mientras verifica y teclado físico',async({page})=>{
 await abrir(page);await digitos(page,'9999');await expect(page.getByRole('alert')).toHaveText('PIN inválido. Probá de nuevo.');await expect(page.locator('.pin-seg-punto')).toHaveCount(0)
 const input=page.getByTestId('pin-input');await input.focus();await input.pressSequentially('30');await expect(page.locator('.pin-seg-punto')).toHaveCount(2);await input.press('Backspace');await expect(page.locator('.pin-seg-punto')).toHaveCount(1);await input.pressSequentially('001');await expect(page.getByTestId('pantalla-bloqueada')).toHaveCount(0);await expect(page.getByTestId('intentos')).toHaveText('2')
})


test('salir nativo no espera la red y revoca empresa y vendedor con los permisos capturados',async({page})=>{
 const permisos=[]
 await page.route('**/api/auth/logout',async route=>{ permisos.push(route.request().headers().authorization); await new Promise(resolve=>setTimeout(resolve,2000)); await route.fulfill({json:{ok:true}}).catch(()=>{}) })
 await page.goto('/e2e/fixtures/sesion-nativa.html')
 await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click()
 await expect(page.getByText('Sin sesión: ok')).toBeVisible({timeout:1000})
 // El destino de navegación se alcanza solo después del Keychain lento.
 await page.getByRole('button',{name:'Comprobar Keychain'}).click();await expect(page.getByText('Keychain: 0')).toBeVisible()
 await expect.poll(()=>permisos.sort()).toEqual(['Bearer EMPRESA_QA_484','Bearer VENDEDOR_QA_484'])
 await page.getByRole('button',{name:'Comprobar Keychain'}).click();await expect(page.getByText('Keychain: 0')).toBeVisible()
})
