export const RUC_EMPRESA_DESDE: number
export type NombreDesdeRuc = { tipo: 'persona' | 'empresa'; nombres: string; apellidos: string; nombreCompleto: string; razonSocial: string }
export function formatoTitulo(texto: unknown): string
export function esRazonSocialTexto(texto: unknown): boolean
export function tipoDeContribuyente(datos?: { ruc?: unknown; nameOfficial?: unknown; givenNames?: unknown; surnames?: unknown }): 'persona' | 'empresa'
export function nombreCompletoPersona(nombres: unknown, apellidos: unknown): string
export function nombreDesdeRuc(consulta?: { nameOfficial?: unknown; name?: unknown; givenNames?: unknown; surnames?: unknown; ruc?: unknown; fullRuc?: unknown }): NombreDesdeRuc
