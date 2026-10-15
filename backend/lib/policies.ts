// Políticas públicas de la empresa (#433): garantía, cambios, envíos,
// privacidad, términos y contacto. Viven en Tenant.settings.policies (JSON) y
// cada una tiene texto simple, estado publicada/borrador y fecha de última
// actualización. Todo lo que llega del cliente pasa por `sanitizePolicyText`:
// texto plano con formato mínimo (# título, - lista, **negrita**), sin HTML.

export const POLICY_TYPES = ['garantia', 'cambios', 'envios', 'privacidad', 'terminos', 'contacto'] as const
export type PolicyType = (typeof POLICY_TYPES)[number]

export const POLICY_LABELS: Record<PolicyType, string> = {
  garantia: 'Garantía',
  cambios: 'Cambios y devoluciones',
  envios: 'Envíos y entregas',
  privacidad: 'Privacidad de la tienda',
  terminos: 'Términos de venta',
  contacto: 'Contacto',
}

/** Tope de caracteres por política (después de limpiar). */
export const POLICY_MAX_CHARS = 8000

export function isPolicyType(value: unknown): value is PolicyType {
  return typeof value === 'string' && (POLICY_TYPES as readonly string[]).includes(value)
}

/** Limpia el texto: sin HTML, sin caracteres de control, saltos normalizados. */
export function sanitizePolicyText(input: unknown): string {
  if (typeof input !== 'string') return ''
  return input
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    // Caracteres de control (menos salto de línea y tabulación) y direccionales invisibles.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g, '')
    // Etiquetas HTML completas o incompletas y cualquier < > suelto.
    .replace(/<[^>]*>?/g, '')
    .replace(/[<>]/g, '')
    .replace(/\t/g, '  ')
    .split('\n')
    .map(line => line.replace(/[ ]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export type StoredPolicy = { content: string; published: boolean; updatedAt: string | null }

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/** Lee las políticas de Tenant.settings con forma estable (todas las claves). */
export function policiesFrom(settings: unknown): Record<PolicyType, StoredPolicy> {
  const raw = asRecord(asRecord(settings).policies)
  const result = {} as Record<PolicyType, StoredPolicy>
  for (const type of POLICY_TYPES) {
    const item = asRecord(raw[type])
    const content = sanitizePolicyText(item.content).slice(0, POLICY_MAX_CHARS)
    result[type] = {
      content,
      published: item.published === true && content.length > 0,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : null,
    }
  }
  return result
}

/** Primeras `maxLines` líneas con contenido, sin marcas de formato. Para comprobantes. */
export function policySummary(content: string, maxLines = 4, maxChars = 360): string {
  const lines = sanitizePolicyText(content)
    .split('\n')
    .map(line => line.replace(/^#{1,3}\s+/, '').replace(/^[-*•]\s+/, '• ').replace(/\*\*/g, '').trim())
    .filter(Boolean)
    .slice(0, maxLines)
  const text = lines.join('\n')
  return text.length > maxChars ? `${text.slice(0, maxChars - 1).trimEnd()}…` : text
}
