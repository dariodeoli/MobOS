import { test, expect } from '@playwright/test'

// #433: alias del índice y detalle, API simulada y sin backend/base.
const company = { name: 'Tienda Alias QA', slug: 'alias-qa', phone: '0981123456', logo: false }
const policy = { type: 'garantia', label: 'Garantía', content: '# Condiciones\nGarantía pública de la tienda.', updatedAt: '2026-10-15T12:00:00.000Z' }

for (const width of [360, 1440]) {
  test(`alias políticas ${width}px: índice y detalle públicos`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.route(/https:\/\//, route => route.abort())
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname
      if (!path.startsWith('/api/')) return route.continue()
      if (path === '/api/public/policies/alias-qa') return route.fulfill({ json: { company, policies: [{ type: policy.type, label: policy.label, updatedAt: policy.updatedAt }] } })
      if (path === '/api/public/policies/alias-qa/garantia') return route.fulfill({ json: { company, policy, others: [] } })
      return route.fulfill({ status: 401, json: { message: 'Sin sesión: prueba pública' } })
    })
    await page.goto('/p/alias-qa/politicas')
    await expect(page.getByTestId('politicas-titulo')).toHaveText('Nuestras políticas')
    await expect(page.getByTestId('cabecera-tienda')).toContainText(company.name)
    await expect(page.getByTestId('politicas-indice').getByRole('link')).toHaveCount(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    // El enlace actual sigue siendo válido: alias y canónica comparten vista.
    await page.getByTestId('politicas-indice').getByRole('link').click()
    await expect(page).toHaveURL(`${baseURL}/alias-qa/politicas/garantia`)
    await expect(page.getByTestId('politicas-titulo')).toHaveText('Garantía')
    await page.goto('/p/alias-qa/politicas/garantia?fuente=ticket#condiciones')
    await expect(page.getByTestId('politicas-titulo')).toHaveText('Garantía')
    await expect(page.getByTestId('politica-texto')).toContainText('Garantía pública de la tienda.')
    await expect(page).toHaveURL(`${baseURL}/p/alias-qa/politicas/garantia?fuente=ticket#condiciones`)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('link', { name: '← Todas las políticas' }).click()
    await expect(page).toHaveURL(`${baseURL}/alias-qa/politicas`)
    await expect(page.getByTestId('politicas-titulo')).toHaveText('Nuestras políticas')
  })
}
