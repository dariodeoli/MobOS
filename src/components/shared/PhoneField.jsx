import { useState } from 'react'
import { Input } from '@/components/ui'
import { telefonoValido, MENSAJE_TELEFONO } from '@/utils/telefono'

// Teléfono unificado: el código de país es editable (por defecto +595) y el
// número acepta espacios, guiones y paréntesis, así se puede escribir por
// ejemplo "+595  99467453". El componente entrega el número suelto y el código
// aparte para que cada pantalla componga el string final al guardar.

const MAX_CODIGO = 6
const MAX_NUMERO = 30
const CODIGOS_PAIS = ['+595', '+55', '+54', '+56', '+591', '+598', '+1', '+34', '+44', '+351']

// Deja solo dígitos: el código de país se muestra siempre detrás de un "+".
function soloDigitos(value) {
  return String(value || '').replace(/\D/g, '').slice(0, MAX_CODIGO)
}

// Deja dígitos, espacios, guiones y paréntesis: el número puede llevar
// separadores, pero nunca letras ni símbolos raros.
function soloNumero(value) {
  return String(value || '').replace(/[^\d\s()-]/g, '').slice(0, MAX_NUMERO)
}

// Separa un teléfono guardado como string único ("+595 971521111") en código
// de país y número. Sin "+" inicial se interpreta con el código por defecto.
export function parseTelefono(value, countryCodePorDefecto = '+595') {
  const texto = String(value || '').trim()
  const partes = texto.match(/^\+(\d{1,3})\s*(.*)$/)
  if (partes) return { countryCode: `+${partes[1]}`, phone: partes[2].trim() }
  return { countryCode: countryCodePorDefecto, phone: texto }
}

// Compone el string único que guardan sucursales y proveedores:
// "+<código> <número>". Sin número devuelve null.
export function componerTelefono({ countryCode = '+595', phone = '' } = {}) {
  const numero = String(phone || '').trim().replace(/\s+/g, ' ')
  if (!numero) return null
  const codigo = String(countryCode || '').replace(/\D/g, '') || '595'
  return `+${codigo} ${numero}`
}

export default function PhoneField({
  countryCode = '+595',
  phone = '',
  onChange,
  onCountryCodeChange,
  disabled = false,
  placeholder = '981 123 456',
  countryAriaLabel = 'Código de país',
  phoneAriaLabel = 'Teléfono',
  className,
}) {
  // El mensaje aparece recién cuando el usuario sale del campo (touched):
  // mientras escribe no lo interrumpimos.
  const [tocado, setTocado] = useState(false)
  const invalido = tocado && Boolean(phone.trim()) && !telefonoValido(phone, countryCode)
  return (
    <div className={className}>
      <div className="flex gap-2">
        <Input
          inputMode="numeric"
          list="mobos-codigos-pais"
          disabled={disabled}
          value={`+${soloDigitos(countryCode)}`}
          onChange={(event) => onCountryCodeChange?.(`+${soloDigitos(event.target.value)}`)}
          aria-label={countryAriaLabel}
          className="w-[92px] shrink-0 text-center"
        />
        <datalist id="mobos-codigos-pais">
          {CODIGOS_PAIS.map((codigo) => <option key={codigo} value={codigo} />)}
        </datalist>
        <Input
          type="tel"
          inputMode="tel"
          maxLength={MAX_NUMERO}
          disabled={disabled}
          value={phone}
          onChange={(event) => onChange?.(soloNumero(event.target.value))}
          placeholder={placeholder}
          aria-label={phoneAriaLabel}
          onBlur={() => setTocado(true)}
          className="min-w-0 flex-1"
        />
      </div>
      {invalido && <span className="block pt-1 text-[11px] text-bad">{MENSAJE_TELEFONO}</span>}
    </div>
  )
}
