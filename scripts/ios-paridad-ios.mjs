// Corre los pasos de captura dentro de la app del simulador (vía el puente) y
// guarda un PNG por paso. Uso:
//   SIM=<udid|booted> OUT=/ruta PUENTE=http://127.0.0.1:5433 node scripts/ios-paridad-ios.mjs
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { pasos, prelude } from './ios-paridad-pasos.mjs'

const sim = process.env.SIM || 'booted'
const out = process.env.OUT || '/tmp/mobos-paridad/ios'
const puente = process.env.PUENTE || 'http://127.0.0.1:5433'
mkdirSync(out, { recursive: true })

async function correr(js) {
  const r = await fetch(`${puente}/__paridad/run`, { method: 'POST', body: js })
  return r.json()
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

// Mismas banderas de estado que la web (tema claro, guía de la demo ya vista).
await correr(`localStorage.setItem('mobos:theme', 'light'); sessionStorage.setItem('mobos:demo-guia-vista', '1'); localStorage.setItem('mobos:push-previo', 'no'); return true`)
for (const paso of pasos) {
  const res = await correr(`${prelude}\n${paso.js}`)
  if (!res.ok) console.log('fallo', paso.nombre, String(res.error).slice(0, 300))
  await dormir(paso.espera || 900)
  if (paso.silencioso) continue
  execFileSync('xcrun', ['simctl', 'io', sim, 'screenshot', '--type=png', `${out}/${paso.nombre}.png`], { stdio: 'ignore' })
  console.log('captura', paso.nombre)
}
