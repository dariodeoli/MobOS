import assert from 'node:assert/strict'
import test from 'node:test'
import {
  OWNER_ONLY_PERMISSIONS,
  PERMISSION_CATALOG,
  USER_ROLES,
  baselinePermissions,
  canAccessAny,
  catalogForRole,
  effectivePermissions,
  hasPermission,
} from '../lib/auth'

const usuario = (permissions: string[]) => ({ permissions })

test('el catálogo no repite ids y todos tienen etiqueta', () => {
  const ids = PERMISSION_CATALOG.map(item => item.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const item of PERMISSION_CATALOG) {
    assert.match(item.id, /^[a-z]+:[a-z]+$/)
    assert.ok(item.label.trim().length > 3, `etiqueta corta: ${item.id}`)
  }
})

test('la base del ADMIN es el comodín y no se expone como permiso suelto', () => {
  assert.deepEqual(baselinePermissions('ADMIN'), [])
  assert.deepEqual(effectivePermissions('ADMIN', []), ['*'])
  assert.deepEqual(effectivePermissions('ADMIN', ['pos:use']), ['*'])
  assert.equal(hasPermission(usuario(['*']), 'team:manage'), true)
  assert.equal(canAccessAny(usuario(['*']), ['print:manage', 'orders:manage']), true)
})

test('todo permiso del catálogo le corresponde a algún rol operativo o es del dueño', () => {
  const deRoles = new Set(USER_ROLES.filter(role => role !== 'ADMIN').flatMap(role => baselinePermissions(role)))
  for (const item of PERMISSION_CATALOG) {
    const esDelDueno = (OWNER_ONLY_PERMISSIONS as readonly string[]).includes(item.id)
    assert.ok(deRoles.has(item.id) || esDelDueno, `permiso huérfano: ${item.id}`)
  }
})

test('los permisos solo del dueño no aparecen en la base de ningún rol operativo', () => {
  for (const permission of OWNER_ONLY_PERMISSIONS) {
    for (const role of USER_ROLES) {
      if (role === 'ADMIN') continue
      assert.equal(baselinePermissions(role).includes(permission), false, `${role} no debería tener ${permission}`)
      assert.equal(catalogForRole(role).some(item => item.id === permission), false)
    }
  }
})

test('la configuración por integrante solo recorta: nunca concede', () => {
  for (const role of USER_ROLES) {
    if (role === 'ADMIN') continue
    const base = baselinePermissions(role)
    const configurado = [...base, 'team:manage', 'permiso:inventado']
    const efectivo = effectivePermissions(role, configurado)
    for (const permission of efectivo) assert.ok(base.includes(permission), `${role} ganó ${permission}`)
    assert.equal(efectivo.includes('team:manage'), false)
    assert.equal(efectivo.includes('permiso:inventado'), false)
  }
})

test('quitar un permiso de la base lo deja fuera del alcance efectivo', () => {
  const cajera = baselinePermissions('CAJERA')
  assert.ok(cajera.includes('finance:read'))
  const reducida = effectivePermissions('CAJERA', cajera.filter(permission => permission !== 'finance:read'))
  assert.equal(hasPermission(usuario(reducida), 'finance:read'), false)
  assert.equal(canAccessAny(usuario(reducida), ['finance:read', 'payments:manage']), true)
})

test('los grupos migrados quedan en la base de los roles que los usaban', () => {
  const esperado: Record<string, string[]> = {
    GERENTE: ['finance:read', 'finance:manage', 'collections:manage', 'marketing:manage', 'print:metrics', 'authorizations:resolve', 'purchases:manage', 'cash:manage'],
    CAJERA: ['finance:read', 'finance:manage', 'collections:manage', 'payments:manage'],
    VENDEDOR: ['delivery:manage'],
    REPARTIDOR: ['delivery:use'],
  }
  for (const [role, permisos] of Object.entries(esperado)) {
    const base = baselinePermissions(role)
    for (const permission of permisos) assert.ok(base.includes(permission), `${role} debería tener ${permission}`)
  }
})

test('catalogForRole devuelve solo lo que el rol tiene por defecto', () => {
  const gerente = catalogForRole('GERENTE').map(item => item.id)
  assert.ok(gerente.includes('marketing:manage'))
  assert.equal(gerente.includes('team:manage'), false)
  const vendedor = catalogForRole('VENDEDOR').map(item => item.id)
  assert.deepEqual([...vendedor].sort(), baselinePermissions('VENDEDOR').sort())
})
