import { expect } from '@playwright/test'
import { digitoVerificadorRuc } from '../../src/lib/demoRuc.js'

// Contrato mínimo del endpoint público, sin contactar OwnData ni fabricar
// resultados en el código de producto. Los datos son exclusivamente ficticios QA.
export function rucPublicPayload(query, nameOfficial) {
  const ruc = query.split('-')[0]
  const dv = digitoVerificadorRuc(ruc)
  const fullRuc = `${ruc}-${dv}`
  return {
    query: { normalized: query, fullRuc },
    result: { ruc, dv, fullRuc, nameOfficial: nameOfficial ?? `COMERCIAL QA ${ruc} S.A.`, equivalenceRaw: 'QA', sourcePartition: 3 },
    source: { provider: 'OwnData' }, reviewRequired: true,
  }
}

export async function mockRucPublic(page, { respond } = {}) {
  const calls = [], forbidden = [], credentialLeaks = []
  await page.addInitScript(() => { document.cookie = 'qa_private_session=must-not-travel; path=/' })
  // Un solo handler contabiliza API HTTP/HTTPS antes de bloquear terceros.
  await page.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (!url.pathname.startsWith('/api/')) {
      return url.protocol === 'https:' ? route.abort() : route.continue()
    }
    if (url.pathname === '/api/public/track') return route.fulfill({ status: 204, body: '' })
    if (url.pathname !== '/api/public/ruc' || request.method() !== 'GET') {
      forbidden.push(`${request.method()} ${url.pathname}`)
      return route.fulfill({ status: 401, json: { message: 'API privada bloqueada en QA demo' } })
    }
    const headers = await request.allHeaders()
    if (headers.cookie || headers.authorization || request.postData()) credentialLeaks.push({ cookie: headers.cookie, authorization: headers.authorization, body: request.postData() })
    expect([...url.searchParams.keys()]).toEqual(url.searchParams.has('subjectKind') ? ['ruc', 'subjectKind'] : ['ruc'])
    if (url.searchParams.has('subjectKind')) expect(url.searchParams.get('subjectKind')).toBe('individual')
    const query = url.searchParams.get('ruc')
    calls.push(query)
    const answer = respond ? await respond({ query, subjectKind: url.searchParams.get('subjectKind'), call: calls.length, request }) : null
    if (answer?.abort) return route.abort()
    return route.fulfill(answer ?? { status: 200, json: rucPublicPayload(query) })
  })
  return {
    calls,
    assertClean() {
      expect(forbidden, 'solo GET público RUC y métricas; sin API privada ni escrituras de negocio').toEqual([])
      expect(credentialLeaks, 'sin cookie, Bearer ni cuerpo en consulta pública').toEqual([])
    },
  }
}
