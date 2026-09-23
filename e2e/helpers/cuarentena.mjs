// Cuarentena de flaky (#CI).
//
// El workflow declara la lista explícita de specs en cuarentena en
// `MOBOS_E2E_CUARENTENA` (nombres de archivo sin extensión, separados por coma)
// y SOLO esos specs habilitan 1 retry. Sin la variable no hay retries en ningún
// lado: una falla es una falla. El reporter de flakiness deja el registro de los
// que realmente reintentaron para vaciar la lista.
import { test } from '@playwright/test'

export const SPECS_EN_CUARENTENA = (process.env.MOBOS_E2E_CUARENTENA || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)

export function enCuarentena(archivo) {
  return SPECS_EN_CUARENTENA.includes(archivo)
}

export function habilitarRetrySiCuarentena(archivo) {
  if (enCuarentena(archivo)) test.describe.configure({ retries: 1 })
}
