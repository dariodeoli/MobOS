import assert from 'node:assert/strict'
import test from 'node:test'
import { describirDispositivo, haceCuanto } from './dispositivoSesion.js'

const UA_MAC_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const UA_IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
const UA_ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'
const UA_WINDOWS_EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0'
const UA_IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
// El cliente HTTP del arnés en CI (#340): Playwright sobre ubuntu, sin la
// palabra «Linux» en el agente.
const UA_CI_PLAYWRIGHT = 'Playwright/1.63.0 (x64; ubuntu 24.04) node/22.23 CI/1'

test('#300 · un dispositivo se describe por navegador, sistema y tipo', () => {
  assert.deepEqual(describirDispositivo(UA_MAC_CHROME), { navegador: 'Chrome', sistema: 'macOS', dispositivo: 'Mac', etiqueta: 'Chrome en Mac · macOS' })
  assert.equal(describirDispositivo(UA_IPHONE_SAFARI).etiqueta, 'Safari en iPhone · iOS')
  assert.equal(describirDispositivo(UA_ANDROID_CHROME).etiqueta, 'Chrome en celular Android · Android')
  assert.equal(describirDispositivo(UA_WINDOWS_EDGE).etiqueta, 'Edge en PC · Windows')
  assert.equal(describirDispositivo(UA_IPAD).etiqueta, 'Safari en iPad · iPadOS')
})

test('#300 · sin agente de usuario no se inventa un dispositivo', () => {
  for (const valor of [null, undefined, '']) {
    const resultado = describirDispositivo(valor)
    assert.equal(resultado.etiqueta, 'Dispositivo sin identificar')
  }
  // Un agente irreconocible no rompe: queda el genérico.
  assert.equal(describirDispositivo('AlgoRaro/1.0').navegador, 'Navegador')
  // Si el agente nombra el sistema aunque no sea un navegador conocido (p. ej.
  // el cliente HTTP del arnés), el sistema se muestra igual.
  assert.equal(describirDispositivo('Playwright/1.63.0 (arm64; macOS 27.0) node/24.21').sistema, 'macOS')
  assert.equal(describirDispositivo('Playwright/1.63.0 (arm64; macOS 27.0) node/24.21').dispositivo, 'Mac')
})

test('#340 · el agente de CI (ubuntu, sin «Linux») reconoce la distro', () => {
  // El arnés crea la sesión con su cliente HTTP en un runner ubuntu; antes
  // quedaba como «Navegador en Dispositivo · Sistema desconocido».
  assert.deepEqual(describirDispositivo(UA_CI_PLAYWRIGHT), {
    navegador: 'Navegador',
    sistema: 'Linux',
    dispositivo: 'equipo Linux',
    etiqueta: 'Navegador en equipo Linux · Linux',
  })
  // Otras distros que tampoco dicen «Linux».
  for (const agente of ['curl/8.5.0 (Debian)', 'Wget/1.21 (Fedora)', 'CentOS 9', 'alpine/3.20', 'Red Hat']) {
    assert.equal(describirDispositivo(agente).sistema, 'Linux', agente)
    assert.equal(describirDispositivo(agente).dispositivo, 'equipo Linux', agente)
  }
  // Android sigue mandando aunque su agente mencione Linux.
  assert.equal(describirDispositivo(UA_ANDROID_CHROME).sistema, 'Android')
})

test('#300 · la última actividad se cuenta en palabras', () => {
  const ahora = new Date('2026-10-02T12:00:00Z').getTime()
  const hace = (ms) => haceCuanto(ahora - ms, ahora)
  assert.equal(hace(10 * 1000), 'hace instantes')
  assert.equal(hace(5 * 60 * 1000), 'hace 5 min')
  assert.equal(hace(3 * 60 * 60 * 1000), 'hace 3 h')
  assert.equal(hace(25 * 60 * 60 * 1000), 'ayer')
  assert.equal(hace(5 * 24 * 60 * 60 * 1000), 'hace 5 días')
  assert.equal(hace(95 * 24 * 60 * 60 * 1000), 'hace 3 meses')
  assert.equal(haceCuanto('no-es-fecha', ahora), '')
})
