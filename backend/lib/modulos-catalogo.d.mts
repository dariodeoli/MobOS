export type ModuleKind = 'core' | 'configurable' | 'catalogOnly' | 'integration' | 'sensitive' | 'specialized'
export type ModulePreset = 'comercio' | 'servicios' | 'salud'
export type ModuleDefinition = {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly category: string
  readonly icon: string
  readonly recommendedFor: readonly string[]
  readonly tier: string
  readonly kind: ModuleKind
  readonly core: boolean
  readonly nucleo: boolean
  readonly changeable: boolean
  readonly dependencies: readonly string[]
  readonly preview: string
  readonly demo: string
  readonly benefits: readonly string[]
  readonly status: 'available' | 'coming-soon'
  readonly navIds: readonly string[]
  readonly tabIds: readonly string[]
  readonly apiPrefixes: readonly string[]
  readonly defaultLegacy: boolean
  readonly defaultNuevo: boolean
  readonly legacyFrom?: string
  readonly porDatos?: boolean
  readonly implicadoPor?: readonly string[]
  readonly configureHref?: string
  readonly capabilities: readonly string[]
  readonly packs?: readonly { id: string; name: string; status: string; includes: readonly string[] }[]
}
export type ModuleStoreLike = { version: 1 | 2; preset: ModulePreset; modules: Record<string, { enabled?: boolean; [key: string]: unknown }> }
export const MODULE_KINDS: readonly ModuleKind[]
export const MODULE_STORE_VERSION: 2
export const MODULE_PRESETS: readonly ModulePreset[]
export const MODULE_CATALOG: readonly ModuleDefinition[]
export function moduloDef(id: string): ModuleDefinition | undefined
export function leerModuleStore(fuente: unknown): ModuleStoreLike | null
export function estadoDeModulo(def: ModuleDefinition, almacen: ModuleStoreLike | null): boolean
export function moduloActivo(fuente: unknown, id: string, opciones?: { demo?: boolean }): boolean
export function nuevoModuleStore(ahora?: string, preset?: ModulePreset): { version: 2; preset: ModulePreset; modules: Record<string, { enabled: boolean; manuallySelected: boolean; source: 'preset' | 'manual'; updatedAt: string }> }
export function moduloDePrefijo(ruta: string): string | null
