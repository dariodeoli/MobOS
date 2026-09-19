import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

// Iniciales de un nombre para avatares y filas compactas (DD de Dario De Oliveira).

// Primer nombre: en una línea de tiempo el apellido no aporta y ocupa lugar.
export function primerNombre(nombre = '') {
  return String(nombre ?? '').trim().split(/\s+/)[0] || ''
}
