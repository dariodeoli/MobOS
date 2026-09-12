#!/usr/bin/env node
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync(new URL('../version.json', import.meta.url), 'utf8'))
const appOrigin = (process.env.MOBOS_APP_URL || 'https://app.moboss.online').replace(/\/$/, '')
const apiOrigin = (process.env.MOBOS_API_URL || '').replace(/\/$/, '')

async function check(url, expectation) {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`${url} respondió ${response.status}.`)
  const body = await response.text()
  if (expectation && !body.includes(expectation)) {
    const scripts = [...body.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => new URL(match[1], url).href)
    const bundles = await Promise.all(scripts.map(async (source) => (await fetch(source)).text()))
    if (!bundles.some((bundle) => bundle.includes(expectation))) throw new Error(`${url} no expone ${expectation}.`)
  }
  console.log(`✓ ${url}`)
}

await check(`${appOrigin}/login?release=${version}`, `v${version}`)
if (apiOrigin) await check(`${apiOrigin}/api/health`)
console.log(`Smoke test correcto: MobOS v${version}.`)
