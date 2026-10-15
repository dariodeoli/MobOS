import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as policies from '../lib/policies'

// Políticas públicas de la empresa (#433): sanitizado, lectura estable de
// Tenant.settings, permisos y tenancy de la API.

// 1) Sanitizado: nada de HTML, control ni direccionales; formato mínimo intacto.
assert.equal(policies.sanitizePolicyText('<script>alert(1)</script>Hola <b>mundo</b>'), 'alert(1)Hola mundo')
assert.equal(policies.sanitizePolicyText('<img src=x onerror=alert(1)'), '')
assert.equal(policies.sanitizePolicyText('a < b > c'), 'a  c')
assert.equal(policies.sanitizePolicyText('Linea\u0000 uno\r\n\r\n\r\n\r\nLinea‮ dos  '), 'Linea uno\n\nLinea dos')
assert.equal(policies.sanitizePolicyText('# Título\n- uno\n- **dos**'), '# Título\n- uno\n- **dos**')
assert.equal(policies.sanitizePolicyText(42), '')

// 2) Lectura estable: todas las claves, borrador sin texto nunca figura publicado.
const leidas = policies.policiesFrom({ policies: { garantia: { content: '  Texto  ', published: true, updatedAt: '2026-10-14T00:00:00.000Z' }, cambios: { content: '', published: true } } })
assert.deepEqual(Object.keys(leidas), [...policies.POLICY_TYPES])
assert.equal(leidas.garantia.published, true)
assert.equal(leidas.cambios.published, false)
assert.equal(leidas.envios.published, false)
assert.equal(policies.policiesFrom(null).garantia.content, '')
assert.equal(policies.policiesFrom({ policies: { garantia: { content: 'x'.repeat(9000), published: true } } }).garantia.content.length, policies.POLICY_MAX_CHARS)

// 3) Resumen para comprobantes.
assert.equal(policies.policySummary('# Garantía\n- 30 días en equipos nuevos\n- **7 días** en semi-nuevos\n\nMás texto', 3), 'Garantía\n• 30 días en equipos nuevos\n• 7 días en semi-nuevos')
assert.ok(policies.policySummary('x'.repeat(1000), 4, 100).length <= 100)

// 4) API: permisos y tenancy.
type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>
function cargar(ruta: string, modulos: Record<string, unknown>) {
  const fuente = ts.transpileModule(readFileSync(require.resolve(ruta), 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exportados: Record<string, unknown> = {}
  runInNewContext(fuente, {
    exports: exportados,
    require: (nombre: string) => { assert.ok(Object.hasOwn(modulos, nombre), `Import inesperado: ${nombre}`); return modulos[nombre] },
    Response, Request, URL, Promise, console, Date, Object, Array, Boolean, String,
  })
  return exportados
}

let settingsGuardados: Record<string, unknown> | null = null
let consultaTenantId: string | null = null
let auditorias = 0
const tenantSettings: Record<string, unknown> = { policies: { garantia: { content: 'Garantía 30 días', published: true, updatedAt: '2026-10-14T00:00:00.000Z' } } }
let rol = 'ADMIN'
const prismaFalso = {
  tenant: {
    findUnique: async (args: { where: { id: string } }) => { consultaTenantId = args.where.id; return { slug: 'mi-tienda', settings: tenantSettings } },
    update: async (args: { data: { settings: Record<string, unknown> } }) => { settingsGuardados = args.data.settings },
  },
  auditLog: { create: async () => { auditorias += 1 } },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaFalso),
}
const http = { json: (data: unknown, init?: ResponseInit) => Response.json(data, init), error: (message: string, status = 400) => Response.json({ message }, { status }) }
const auth = { requireSession: async () => ({ user: { id: 'u1', tenantId: 'tenant-A', role: rol } }) }
const baseModulos = {
  '../../../../lib/prisma': { prisma: prismaFalso },
  '../../../../../lib/prisma': { prisma: prismaFalso },
  '../../../../lib/http': http,
  '../../../../../lib/http': http,
  '../../../../lib/auth': auth,
  '../../../../../lib/auth': auth,
  '../../../../lib/policies': policies,
  '../../../../../lib/policies': policies,
  '@prisma/client': { Prisma: {} },
}
const lista = cargar('../app/api/tenant/policies/route.ts', baseModulos).GET as (request: Request) => Promise<Response>
const guardar = cargar('../app/api/tenant/policies/[type]/route.ts', baseModulos).PUT as Handler
const impresion = cargar('../app/api/tenant/policies/print/route.ts', baseModulos).GET as (request: Request) => Promise<Response>
const put = (type: string, body: unknown) => guardar(new Request('https://api.test/api/tenant/policies/x', { method: 'PUT', body: JSON.stringify(body) }), { params: Promise.resolve({ type }) })

async function main() {
  // La tienda no se elige: el tenant sale de la sesión.
  const ok = await lista(new Request('https://api.test/api/tenant/policies'))
  assert.equal(ok.status, 200)
  const cuerpo = await ok.json()
  assert.equal(cuerpo.policies.length, 6)
  assert.equal(consultaTenantId, 'tenant-A')

  // Solo el dueño lee completas y edita.
  for (const otro of ['GERENTE', 'VENDEDOR', 'CAJERA', 'REPARTIDOR']) {
    rol = otro
    assert.equal((await lista(new Request('https://api.test/api/tenant/policies'))).status, 403)
    assert.equal((await put('garantia', { content: 'x', published: true })).status, 403)
  }
  assert.equal(settingsGuardados, null)
  assert.equal(auditorias, 0)

  rol = 'ADMIN'
  assert.equal((await put('inexistente', { content: 'x', published: false })).status, 404)
  assert.equal((await put('garantia', { content: 'x' })).status, 400)
  assert.equal((await put('garantia', { content: '   ', published: true })).status, 400)
  assert.equal((await put('garantia', { content: 'y'.repeat(policies.POLICY_MAX_CHARS + 1), published: false })).status, 400)
  assert.equal(settingsGuardados, null)

  const guardada = await put('cambios', { content: '<b>7 días</b> para cambios', published: true })
  assert.equal(guardada.status, 200)
  assert.equal((await guardada.json()).content, '7 días para cambios')
  const guardadas = (settingsGuardados as unknown as { policies: Record<string, { content: string; published: boolean }> }).policies
  assert.equal(guardadas.cambios.content, '7 días para cambios')
  assert.equal(guardadas.cambios.published, true)
  assert.equal(guardadas.garantia.content, 'Garantía 30 días', 'no pisa las otras políticas')
  assert.equal(auditorias, 1)

  // Comprobantes: cualquier rol, solo lo publicado y resumido.
  rol = 'VENDEDOR'
  const print = await impresion(new Request('https://api.test/api/tenant/policies/print'))
  assert.equal(print.status, 200)
  assert.deepEqual(await print.json(), { slug: 'mi-tienda', garantia: 'Garantía 30 días', cambios: '', garantiaPublicada: true, cambiosPublicada: false })
  // Páginas públicas: sin sesión, por slug, solo lo publicado y sin datos internos.
  const slugsConsultados: string[] = []
  const prismaPublico = {
    tenant: {
      findFirst: async (args: { where: { slug: string } }) => {
        slugsConsultados.push(args.where.slug)
        if (args.where.slug !== 'mi-tienda') return null
        return {
          id: 'tenant-A', name: 'Mi Tienda', slug: 'mi-tienda', phone: '0981', email: null, address: null, city: 'Asunción', department: null, logos: [],
          settings: { costos: 'SECRETO', permissions: { sellerSeesCosts: false }, policies: { garantia: { content: 'Garantía 30 días', published: true, updatedAt: '2026-10-14T00:00:00.000Z' }, envios: { content: 'Borrador interno', published: false } } },
        }
      },
    },
  }
  const publicPolicies = require('../lib/public-policies')
  const modulosPublicos = {
    '../../../../../lib/http': http, '../../../../../../lib/http': http,
    '../../../../../lib/rate-limit': { enforceRateLimit: () => null }, '../../../../../../lib/rate-limit': { enforceRateLimit: () => null },
    '../../../../../lib/policies': policies, '../../../../../../lib/policies': policies,
    '../../../../../lib/public-policies': { ...publicPolicies }, '../../../../../../lib/public-policies': { ...publicPolicies },
  }
  // public-policies usa su propio prisma: se reemplaza el módulo con el falso.
  const { empresaPublicaPorSlug, politicaPublica } = (() => {
    const fuente = ts.transpileModule(readFileSync(require.resolve('../lib/public-policies.ts'), 'utf8'), {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
    const exportados: Record<string, unknown> = {}
    runInNewContext(fuente, { exports: exportados, require: (n: string) => (n === './prisma' ? { prisma: prismaPublico } : n === './policies' ? policies : (() => { throw new Error(n) })()), Promise, Object, Array, Boolean, String })
    return exportados as { empresaPublicaPorSlug: unknown; politicaPublica: unknown }
  })()
  const publicosModulos = { ...modulosPublicos, '../../../../../lib/public-policies': { empresaPublicaPorSlug, politicaPublica, SLUG_VALIDO: publicPolicies.SLUG_VALIDO }, '../../../../../../lib/public-policies': { empresaPublicaPorSlug, politicaPublica, SLUG_VALIDO: publicPolicies.SLUG_VALIDO } }
  const indicePublico = cargar('../app/api/public/policies/[slug]/route.ts', publicosModulos).GET as Handler
  const detallePublico = cargar('../app/api/public/policies/[slug]/[type]/route.ts', publicosModulos).GET as Handler
  const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) })
  const indice = await indicePublico(new Request('https://api.test/x'), ctx({ slug: 'Mi-Tienda' }))
  assert.equal(indice.status, 200)
  const cuerpoIndice = await indice.json()
  assert.deepEqual(cuerpoIndice.policies.map((p: { type: string }) => p.type), ['garantia'], 'solo las publicadas')
  assert.equal(JSON.stringify(cuerpoIndice).includes('SECRETO'), false, 'nada interno')
  assert.equal(JSON.stringify(cuerpoIndice).includes('Borrador interno'), false, 'sin borradores')
  assert.deepEqual(Object.keys(cuerpoIndice.company).sort(), ['address', 'city', 'department', 'email', 'logo', 'name', 'phone', 'slug'])
  assert.equal((await detallePublico(new Request('https://api.test/x'), ctx({ slug: 'mi-tienda', type: 'garantia' }))).status, 200)
  assert.equal((await detallePublico(new Request('https://api.test/x'), ctx({ slug: 'mi-tienda', type: 'envios' }))).status, 404, 'un borrador responde como inexistente')
  assert.equal((await detallePublico(new Request('https://api.test/x'), ctx({ slug: 'mi-tienda', type: 'nada' }))).status, 404)
  assert.equal((await indicePublico(new Request('https://api.test/x'), ctx({ slug: 'otra-tienda' }))).status, 404, 'otra empresa no ve nada de esta')
  assert.equal((await indicePublico(new Request('https://api.test/x'), ctx({ slug: '../etc' }))).status, 404)
  assert.equal(slugsConsultados.includes('../etc'), false, 'un slug inválido ni llega a la base')

  console.log('policies: sanitize, settings, permisos ADMIN y tenancy OK')
}
main().catch((failure) => { console.error(failure); process.exitCode = 1 })
