import { Input } from '@/components/ui'
import { cn } from '@/lib/utils'

// Instagram con "@" fijo, sin espacios: guardamos el username pelado para
// armar el link directo (https://instagram.com/<username>). El adorno no se
// puede borrar porque no forma parte del valor del campo.

const MAX_USERNAME = 30

// Acepta "@usuario", "usuario", "instagram.com/usuario" o una URL completa y
// devuelve solo el username: sin @, sin espacios y sin caracteres inválidos.
export function normalizarInstagram(value) {
  const texto = String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/^instagram\.com\//i, '')
    .replace(/^@+/, '')
  return texto
    .split(/[/?#]/)[0]
    .replace(/\s+/g, '')
    .replace(/[^A-Za-z0-9._]/g, '')
    .slice(0, MAX_USERNAME)
}

export default function InstagramField({ value = '', onChange, disabled = false, placeholder = 'usuario', className }) {
  return (
    <div className={cn('relative', className)}>
      <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-mute">@</span>
      <Input
        maxLength={MAX_USERNAME}
        disabled={disabled}
        value={normalizarInstagram(value)}
        onChange={(event) => onChange?.(normalizarInstagram(event.target.value))}
        placeholder={placeholder}
        className="pl-8"
      />
    </div>
  )
}
