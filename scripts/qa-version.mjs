// Imprime la versión que expone el bundle del frontend publicado y, si se pasa
// una esperada, falla cuando no coincide (útil para esperar un deploy).
//
// Uso: QA_BASE_URL=https://app.moboss.online node scripts/qa-version.mjs [1.0.140]
const app = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const esperada = process.argv[2]

const html = await (await fetch(`${app}/login`)).text()
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => new URL(match[1], app).href)
let version = ''
for (const src of scripts) {
  const body = await (await fetch(src)).text()
  // Si se espera una versión, alcanza con encontrarla en el bundle (mismo
  // criterio que `release:smoke`); si no, se informa la primera candidata.
  if (esperada) {
    if (!body.includes(esperada)) continue
    version = esperada
    break
  }
  const match = body.match(/\b1\.0\.\d{2,}\b/)
  if (match) { version = match[0]; break }
}
console.log(version || '(no detectada)')
if (esperada && version !== esperada) process.exitCode = 1
