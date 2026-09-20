// Auditoría de la configuración de impresión: qué cambió, quién y con qué
// valores. Nunca se auditan tokens ni secretos; el destino LAN se guarda con el
// último octeto enmascarado para poder ubicar la impresora sin persistir el
// host concreto en el historial.
import type { PrintPrinter } from '@prisma/client'

// Campos que se comparan al editar. `lastTest` queda afuera a propósito: es
// telemetría de la última prueba, no configuración.
const CAMPOS = [
  'name',
  'brand',
  'model',
  'location',
  'connection',
  'destination',
  'width',
  'copies',
  'cut',
  'density',
  'characters',
  'isDefault',
  'isActive',
  'bridgeId',
] as const

export function enmascararDestino(destination: unknown): string {
  const valor = String(destination ?? '').trim()
  return valor.replace(/(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}/, '$1.x')
}

// Resumen estable de una impresora para crear, borrar o describir el estado.
export function resumenImpresora(impresora: Pick<PrintPrinter, 'name' | 'connection' | 'destination' | 'width' | 'copies' | 'isDefault' | 'isActive'>) {
  return {
    name: impresora.name,
    connection: impresora.connection,
    destination: enmascararDestino(impresora.destination),
    width: impresora.width,
    copies: impresora.copies,
    isDefault: impresora.isDefault,
    isActive: impresora.isActive,
  }
}

// Valores aceptados por el JSON de auditoría de estos campos.
type Json = string | number | boolean | null

const normalizar = (valor: unknown): Json => {
  if (valor === null || valor === undefined) return null
  if (typeof valor === 'string' || typeof valor === 'number' || typeof valor === 'boolean') return valor
  return String(valor)
}

// Campos cambiados con antes/después, sin secretos. Un campo ausente en
// `despues` (parche parcial ya normalizado) no cuenta como cambio.
export function cambiosDeImpresora(
  antes: Record<string, unknown>,
  despues: Record<string, unknown>,
): Record<string, { from: Json; to: Json }> {
  const cambios: Record<string, { from: Json; to: Json }> = {}
  for (const campo of CAMPOS) {
    const previo = campo === 'destination' ? enmascararDestino(antes[campo]) : normalizar(antes[campo])
    const nuevo = campo === 'destination' ? enmascararDestino(despues[campo]) : normalizar(despues[campo])
    if (previo !== nuevo) cambios[campo] = { from: previo, to: nuevo }
  }
  return cambios
}
