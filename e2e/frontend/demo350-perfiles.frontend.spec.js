import { test, expect } from '@playwright/test'

for (const width of [390,1440]) for (const dark of [false,true]) {
  test(`#350 perfiles, contacto y logos locales ${width} ${dark?'oscuro':'claro'}`, async ({page}) => {
    const api=[]
    await page.route('**/api/**',route=> {
      if(!new URL(route.request().url()).pathname.startsWith('/api/')) return route.continue()
      api.push(route.request().url())
      return route.fulfill({status:503,json:{error:'Sin API en esta prueba'}})
    })
    await page.route(/https:\/\//,route=>route.abort())
    await page.setViewportSize({width,height:900})
    await page.addInitScript(({dark})=> {
      sessionStorage.setItem('mobos:demo-guia-vista','1')
      localStorage.setItem('mobos:theme',dark?'dark':'light')
    },{dark})
    await page.goto('/demo')
    await page.getByRole('button',{name:'Entrar como Dueño',exact:true}).click()
    await expect(page.getByTestId('shell')).toBeVisible()
    await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark)
    await page.goto('/configuracion/equipo')
    await expect(page.locator('html')).toHaveClass(dark ? /dark/ : /^(?!.*dark).*$/)
    await expect(page.getByTestId('integrante-fila')).toHaveCount(7)
    const diego=page.getByTestId('integrante-fila').filter({has:page.getByRole('textbox',{name:'Nombre de Diego López',exact:true})})
    await expect(diego).toContainText('+595 981 000 103')
    await expect(diego).toContainText('Casa Central')
    await expect(diego).toContainText('Comisión hoy')
    await expect(diego.getByRole('combobox',{name:'Rol de Diego López'})).toHaveValue('VENDEDOR')
    await expect(diego.getByRole('img',{name:'Foto de Diego López'})).toBeVisible()
    await expect(page.getByText('Datos ficticios para probar:',{exact:false})).toBeVisible()
    // Reaplicar el seed en la misma demostración no pisa una edición de la UI.
    // Recargar todo el documento sí reinicia la memoria por el contrato #204.
    const nombre=diego.getByRole('textbox',{name:'Nombre de Diego López',exact:true})
    await nombre.fill('Diego Editado')
    await nombre.press('Tab')
    await expect(page.getByText('Integrante actualizado.',{exact:true})).toBeVisible()
    await page.evaluate(async()=>{ const s=await import('/src/lib/storage.js'); s.prepararDatosDemo() })
    await expect(page.getByRole('textbox',{name:'Nombre de Diego Editado',exact:true})).toHaveValue('Diego Editado')
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1)

    await page.goto('/configuracion/negocio')
    await expect(page.getByTestId('fila-contacto')).toContainText('35800100@correo.com.py')
    await page.getByTestId('fila-contacto').click()
    await expect(page.getByRole('combobox',{name:'Correo de la empresa',exact:true})).toHaveValue('35800100@correo.com.py')
    await page.keyboard.press('Escape')
    await page.getByRole('tab',{name:'Identidad visual',exact:true}).click()
    for(const variant of ['light','dark']) {
      const image=page.getByTestId(`logo-preview-${variant}`).getByRole('img')
      await expect(image).toBeVisible()
      await expect.poll(()=>image.evaluate(n=>n.complete&&n.naturalWidth>0)).toBe(true)
      await expect(image).toHaveAttribute('src',/^data:image\/svg\+xml/)
      const contrast=await image.evaluate(img=> {
        const rgb=getComputedStyle(img.parentElement).backgroundColor.match(/[\d.]+/g).slice(0,3).map(Number)
        const svg=decodeURIComponent(img.src.slice(img.src.indexOf(',')+1))
        const hex=svg.match(/<g fill="(#[0-9a-f]+)"/)[1].slice(1)
        const ink=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16))
        const lum=c=>c.map(x=>x/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[0.2126,0.7152,0.0722][i],0)
        const a=lum(rgb),b=lum(ink)
        return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)
      })
      expect(contrast,'texto de la marca contra su fondo real').toBeGreaterThanOrEqual(4.5)
    }
    expect(await page.getByTestId('logo-preview-light').getByRole('img').getAttribute('src')).not.toBe(await page.getByTestId('logo-preview-dark').getByRole('img').getAttribute('src'))
    await expect(page.getByRole('button',{name:'Reemplazar',exact:true}).first()).toBeDisabled()
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1)
    expect(api.filter(url=>new URL(url).pathname !== '/api/public/track'),'sin endpoints privados, logos remotos ni OwnData').toEqual([])
  })
}
