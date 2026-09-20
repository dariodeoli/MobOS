import { test, expect } from '@playwright/test'

test('the client portal has a private entry landing', async ({ page }) => {
  await page.goto('/clientes-preview')

  await expect(page.getByRole('heading', { name: 'Ingresá con el enlace que te enviamos.' })).toBeVisible()
  await expect(page.getByText('Portal de clientes')).toBeVisible()
  await expect(page.getByText('¿Necesitás ayuda? Escribile por WhatsApp a la tienda que te envió el enlace.')).toBeVisible()
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://clientes.moboss.online/')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
})
