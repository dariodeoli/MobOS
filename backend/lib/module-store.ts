import type { Prisma } from '@prisma/client'

import { MODULE_CATALOG as CATALOGO, MODULE_KINDS as KINDS, MODULE_PRESETS as PRESETS, MODULE_STORE_VERSION, estadoDeModulo, leerModuleStore, nuevoModuleStore as nuevoStore, type ModuleDefinition, type ModulePreset as ModulePresetType } from './modulos-catalogo.mjs'

// El catálogo vive en modulos-catalogo.mjs (compartido con el front). Se vuelve
// a exportar acá para que los imports existentes sigan funcionando.
export const MODULE_KINDS = KINDS
export type ModuleKind = typeof MODULE_KINDS[number]
export const MODULE_CATALOG = CATALOGO
export type { ModuleDefinition }
export const MODULE_PRESETS = PRESETS
export type ModulePreset = ModulePresetType
export type ModuleSetting = { enabled: boolean; manuallySelected: boolean; source: 'preset' | 'manual'; updatedAt: string }
export type ModuleStoreState = { version: 2; preset: ModulePreset; modules: Record<string, ModuleSetting> }

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const presetModules = (preset: ModulePreset) => new Set(MODULE_CATALOG.filter(module => module.nucleo || module.status === 'available' && module.recommendedFor.some(rubro => rubro === preset)).map(module => module.id))

/** Estado de una empresa nueva (register, google-company, tenant-switch): núcleo + defaultNuevo. */
export function newCompanyModuleStore(now = new Date().toISOString()): ModuleStoreState {
  return nuevoStore(now) as ModuleStoreState
}

export function dependenciesEnabled(dependencies: readonly string[], modules: Record<string, { enabled: boolean }>) {
  return dependencies.every(id => modules[id]?.enabled === true)
}

export function hasEnabledDependents(moduleId: string, catalog: readonly { id: string; dependencies: readonly string[] }[], modules: Record<string, { enabled: boolean }>) {
  return catalog.some(module => modules[module.id]?.enabled && module.dependencies.includes(moduleId))
}

export function moduleStoreFrom(settings: unknown, now = new Date().toISOString()): ModuleStoreState {
  const stored = leerModuleStore({ settings })
  const oldModules = record(stored?.modules)
  const modules: Record<string, ModuleSetting> = {}
  for (const module of MODULE_CATALOG) {
    const saved = record(oldModules[module.id])
    modules[module.id] = {
      enabled: estadoDeModulo(module, stored),
      manuallySelected: !module.nucleo && saved.manuallySelected === true,
      source: module.nucleo ? 'preset' : saved.source === 'manual' ? 'manual' : 'preset',
      updatedAt: typeof saved.updatedAt === 'string' ? saved.updatedAt : now,
    }
  }
  return { version: MODULE_STORE_VERSION, preset: stored?.preset ?? 'comercio', modules }
}

export function parseModuleChange(body: unknown): { preset?: ModulePreset; moduleId?: string; enabled?: boolean } | null {
  const value = record(body)
  if (typeof value.preset === 'string' && MODULE_PRESETS.includes(value.preset as ModulePreset) && Object.keys(value).length === 1) return { preset: value.preset as ModulePreset }
  if (Object.keys(value).length === 2 && typeof value.moduleId === 'string' && typeof value.enabled === 'boolean' && MODULE_CATALOG.some(module => module.id === value.moduleId)) return { moduleId: value.moduleId, enabled: value.enabled }
  return null
}

export function updateModuleStore(settings: unknown, change: NonNullable<ReturnType<typeof parseModuleChange>>, now = new Date().toISOString()) {
  const current = moduleStoreFrom(settings, now)
  const modules = { ...current.modules }
  if (change.preset) {
    const included = presetModules(change.preset)
    for (const module of MODULE_CATALOG) {
      if (!module.changeable) continue
      modules[module.id] = { enabled: included.has(module.id), manuallySelected: false, source: 'preset', updatedAt: now }
    }
    return { version: MODULE_STORE_VERSION, preset: change.preset, modules }
  }
  const definition = MODULE_CATALOG.find(module => module.id === change.moduleId)
  if (!definition || !definition.changeable) {
    throw new Error('MODULE_CHANGE_NOT_ALLOWED')
  }
  if (change.enabled === false && hasEnabledDependents(definition.id, MODULE_CATALOG, modules)) throw new Error('MODULE_HAS_ENABLED_DEPENDENTS')
  if (change.enabled === true && !dependenciesEnabled(definition.dependencies, modules)) throw new Error('MODULE_DEPENDENCY_REQUIRED')
  modules[definition.id] = { enabled: change.enabled!, manuallySelected: true, source: 'manual', updatedAt: now }
  return { ...current, modules }
}

export function mergeModuleStoreSettings(settings: unknown, state: ModuleStoreState) {
  return { ...record(settings), moduleStore: state } as Prisma.InputJsonObject
}

/** Settings de una empresa nueva: sus ajustes iniciales más el store de módulos en versión 2. */
export function newCompanySettings(settings: Record<string, unknown> = {}, now = new Date().toISOString()) {
  return mergeModuleStoreSettings(settings, newCompanyModuleStore(now))
}
