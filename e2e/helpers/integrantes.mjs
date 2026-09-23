// Alta de integrantes para los e2e (#CI).
//
// El PIN es único entre los usuarios ACTIVOS de la empresa: con PINs de 4
// dígitos al azar y usuarios de corridas previas, el alta devolvía un 409
// (`PIN_DUPLICADO`) y specs como `equipo-integrantes` quedaban rojos de forma
// intermitente. Acá se usan PINs de 6 dígitos (900k combinaciones) y, si aun
// así el backend responde duplicado, se reintenta con otro antes de fallar.
import { expect } from '@playwright/test'

/** PIN de 6 dígitos (el backend acepta 4 a 6). */
export const pinAleatorio = () => String(100000 + Math.floor(Math.random() * 900000))

/**
 * Crea un integrante por API con un PIN libre. Devuelve el usuario creado más
 * `pin` (el que quedó en uso). Tira si no puede crearlo.
 */
export async function crearIntegranteConPinLibre(page, { api, nombre, rol = 'VENDEDOR', extra = {}, intentos = 12 }) {
  let ultimo = null
  for (let intento = 0; intento < intentos; intento += 1) {
    const pin = pinAleatorio()
    const respuesta = await page.evaluate(async ({ api, nombre, pin, rol, extra }) => {
      const res = await fetch(`${api}/api/users`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: nombre, pin, role: rol, ...extra }),
      })
      return { status: res.status, datos: await res.json().catch(() => null) }
    }, { api, nombre, pin, rol, extra })
    if (respuesta.datos?.id) return { ...respuesta.datos, pin }
    ultimo = respuesta
    if (respuesta.status !== 409) break
  }
  throw new Error(`No se pudo crear el integrante ${nombre} (HTTP ${ultimo?.status ?? '?'}): ${ultimo?.datos?.message || 'sin detalle'}`)
}

/**
 * Alta desde la UI (panel «Agregar directamente» de Configuración → Equipo):
 * completa el formulario y reintenta con otro PIN si el backend lo rechaza por
 * duplicado. Devuelve el PIN que quedó asignado.
 */
export async function agregarIntegranteDirecto(page, { nombre, panel = '#equipo-form', intentos = 12 }) {
  const contenedor = page.locator(panel)
  const exito = page.getByText('Integrante agregado correctamente.')
  const duplicado = page.getByText(/Ese PIN ya lo usa otro usuario/)
  for (let intento = 0; intento < intentos; intento += 1) {
    const pin = pinAleatorio()
    await contenedor.getByRole('button', { name: 'Agregar directamente' }).click()
    await contenedor.locator('#direct-name').fill(nombre)
    await contenedor.locator('#direct-pin').fill(pin)
    await contenedor.getByRole('button', { name: 'Agregar', exact: true }).click()
    await expect(exito.or(duplicado).first()).toBeVisible({ timeout: 15_000 })
    if (await exito.isVisible()) return pin
  }
  throw new Error(`No se pudo agregar a ${nombre}: el backend rechazó todos los PINs por duplicado`)
}
