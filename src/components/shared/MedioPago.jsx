import { cn } from '@/lib/utils'

// Logos de los medios de pago, vectorizados a SVG: sin fondo, nítidos en
// cualquier tamaño y legibles sobre el tema oscuro.
//
// Mapeo con los nombres guardados en las ventas (storage.MEDIOS_PAGO):
// UENO BANK ueno · POS UENO Upay · PIK ITAÚ Pik · DINELCO dinelco
// CONTINENTAL continental · FAMILIAR Banco Familiar · DINERO billete

const C = {
  ueno: '#5BC894',
  dinelco: '#8B4FBF',
  pik: '#F0812E',
  pikText: '#4A1A6B',
  familiar: '#0E2A7B',
  continental: '#134391',
  continentalTri: '#B5CE3A',
  dinero: '#7DBE8A',
}

// ── Marcas ──────────────────────────────────────────────────────────
function Ueno() {
  return (
    <svg viewBox="0 0 74 22" className="h-full w-auto" aria-label="ueno">
      <g fill={C.ueno}>
        <path d="M2 5h4.2v8.4a2.6 2.6 0 0 0 5.2 0V5h4.2v8.6c0 3.9-3 6.6-6.8 6.6S2 17.5 2 13.6V5Z" />
        <path d="M25.4 8.2c-3.6 0-6.3 2.6-6.3 6s2.7 6 6.5 6c2.1 0 3.8-.7 4.9-1.9l-2.3-2.1c-.6.6-1.4.9-2.4.9-1.4 0-2.4-.6-2.8-1.8h8.2c0-.3.1-.7.1-1.1 0-3.5-2.5-6-5.9-6Zm-2.5 4.9c.3-1.2 1.2-1.9 2.5-1.9s2.1.7 2.4 1.9h-4.9Z" />
        <path d="M41.6 8.2c-1.5 0-2.7.5-3.5 1.5V8.5h-4V20h4.2v-6.2c0-1.4.8-2.3 2.1-2.3s2 .8 2 2.2V20h4.2v-7c0-3-1.9-4.8-5-4.8Z" />
        <path d="M56.9 8.2c-3.6 0-6.4 2.6-6.4 6s2.8 6 6.4 6 6.4-2.6 6.4-6-2.8-6-6.4-6Zm0 8.4c-1.3 0-2.2-1-2.2-2.4s.9-2.4 2.2-2.4 2.2 1 2.2 2.4-.9 2.4-2.2 2.4Z" />
      </g>
    </svg>
  )
}

function Upay() {
  return (
    <svg viewBox="0 0 70 22" className="h-full w-auto" aria-label="Upay">
      <circle cx="11" cy="11" r="10" fill={C.ueno} />
      <path
        d="M6.6 5.4h2.9v6.2a1.6 1.6 0 0 0 3.2 0V5.4h2.9v6.3c0 2.6-2 4.4-4.5 4.4s-4.5-1.8-4.5-4.4V5.4Z"
        fill="#fff"
      />
      <g fill={C.ueno}>
        <path d="M28.4 7.6c-1.2 0-2.2.4-2.9 1.2V7.8h-3.1V21h3.2v-4.3c.7.6 1.6 1 2.8 1 2.9 0 5-2.2 5-5.1s-2.1-5-5-5Zm-.7 7.3c-1.3 0-2.2-1-2.2-2.3s.9-2.3 2.2-2.3 2.2 1 2.2 2.3-.9 2.3-2.2 2.3Z" />
        <path d="M43.2 7.8v.9c-.7-.7-1.7-1.1-2.9-1.1-2.8 0-4.9 2.2-4.9 5.1s2.1 5.1 4.9 5.1c1.2 0 2.2-.4 2.9-1.1v.9h3.1V7.8h-3.1Zm-2.2 7.1c-1.3 0-2.2-1-2.2-2.3s.9-2.3 2.2-2.3 2.2 1 2.2 2.3-.9 2.3-2.2 2.3Z" />
        <path d="M55.6 7.8 53.4 14l-2.3-6.2h-3.4l4 9.8-.2.4c-.3.8-.8 1.1-1.7 1.1h-.9V21h1.3c2.2 0 3.4-.9 4.3-3.2l3.9-10h-3.3Z" />
      </g>
    </svg>
  )
}

function Dinelco() {
  return (
    <svg viewBox="0 0 96 22" className="h-full w-auto" aria-label="dinelco">
      <path
        d="M11 1.5a9.5 9.5 0 1 0 9.5 9.5V1.5h-3.8v9.5a5.7 5.7 0 1 1-5.7-5.7h.9V1.5H11Z"
        fill={C.dinelco}
      />
      <path d="M13.9 5.9h3.1v5.2a3.05 3.05 0 1 1-3.1-3.1V5.9Z" fill={C.dinelco} />
      <text
        x="24"
        y="18"
        fontSize="16.5"
        fontWeight="800"
        fill="currentColor"
        letterSpacing="-.7"
        fontFamily="'Nunito','Arial Rounded MT Bold',system-ui,sans-serif"
      >
        dinelco
      </text>
      <circle cx="92.5" cy="16.6" r="2.2" fill={C.dinelco} />
    </svg>
  )
}

function Pik() {
  return (
    <svg viewBox="0 0 56 22" className="h-full w-auto" aria-label="Pik Itaú">
      <rect width="56" height="22" rx="4" fill={C.pik} />
      <g fill={C.pikText}>
        <path d="M8 5h6.2c2.9 0 4.8 1.7 4.8 4.3s-1.9 4.4-4.8 4.4h-2.7V17H8V5Zm3.5 2.7v3.3h2.2c1.1 0 1.8-.6 1.8-1.7s-.7-1.6-1.8-1.6h-2.2Z" />
        <path d="M21 8.6h3.3V17H21zM22.6 4.3a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8Z" />
        <path d="M27 5h3.3v6.6l3-3h4.1l-4.2 4 4.4 4.4h-4.2l-3.1-3.3V17H27V5Z" />
      </g>
    </svg>
  )
}

function Familiar() {
  return (
    <svg viewBox="0 0 92 22" className="h-full w-auto" aria-label="Banco Familiar">
      <rect width="92" height="22" rx="4" fill={C.familiar} />
      {/* Figuras simplificadas del isotipo */}
      <circle cx="9" cy="7" r="1.9" fill="#fff" />
      <circle cx="14.6" cy="5.4" r="1.9" fill="#fff" />
      <path d="M6.4 18.4c0-3 1-5.4 2.6-5.4s2.6 2.4 2.6 5.4H6.4Z" fill="#fff" />
      <path d="M12 18.4c0-3.6 1.1-6.4 3-6.4s3 2.8 3 6.4h-6Z" fill="#fff" />
      <path d="M4.6 18.4c0-2 .7-3.6 1.7-3.6s1.7 1.6 1.7 3.6H4.6Z" fill="#E23B34" />
      <path
        d="M6 9.6c2.6-2.2 6.4-2.6 10-1.2"
        stroke="#F5C531"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
      <g fill="#fff">
        <text x="24" y="9.2" fontSize="6" fontWeight="600" letterSpacing=".6">
          BANCO
        </text>
        <text x="24" y="18.4" fontSize="10.5" fontWeight="700" letterSpacing="-.2">
          FAMILIAR
        </text>
      </g>
    </svg>
  )
}

function Continental() {
  return (
    <svg viewBox="0 0 104 22" className="h-full w-auto" aria-label="Continental">
      <rect width="104" height="22" rx="4" fill={C.continental} />
      <text x="7" y="16" fontSize="12.5" fontWeight="500" fill="#fff" letterSpacing="-.3">
        continental
      </text>
      <circle cx="91.5" cy="11" r="8.2" fill="none" stroke="#fff" strokeWidth="1.4" />
      <path d="M91.5 5.6 96.4 15h-9.8l4.9-9.4Z" fill={C.continentalTri} />
    </svg>
  )
}

function Dinero() {
  return (
    <svg viewBox="0 0 32 22" className="h-full w-auto" aria-label="Dinero">
      <rect x="1" y="3" width="30" height="16" rx="2.5" fill={C.dinero} />
      <rect
        x="3.6"
        y="5.6"
        width="24.8"
        height="10.8"
        rx="1.4"
        fill="none"
        stroke="#3F7A52"
        strokeWidth="1"
        opacity=".7"
      />
      <circle cx="16" cy="11" r="4" fill="none" stroke="#2F5E3E" strokeWidth="1.6" />
      <path
        d="M16 8.4v5.2M14.4 9.6h2.6a1.3 1.3 0 0 1 0 2.6h-2.6"
        stroke="#2F5E3E"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="6.6" cy="11" r="1.1" fill="#2F5E3E" opacity=".6" />
      <circle cx="25.4" cy="11" r="1.1" fill="#2F5E3E" opacity=".6" />
    </svg>
  )
}

// ── Registro ────────────────────────────────────────────────────────
// Se compara normalizado (sin acentos ni mayúsculas) para tolerar variantes.
const norm = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

// Marcas exportadas: las reutiliza el logo de bancos (#119) sin duplicar SVG.
export const MARCAS_MEDIO_PAGO = {
  ueno: Ueno,
  upay: Upay,
  pik: Pik,
  dinelco: Dinelco,
  continental: Continental,
  familiar: Familiar,
  dinero: Dinero,
}

const MARCAS = [
  { clave: 'upay', test: (m) => m.includes('pos') || m.includes('upay') || m.includes('u pay') },
  { clave: 'ueno', test: (m) => m.includes('ueno') },
  { clave: 'pik', test: (m) => m.includes('pik') || m.includes('itau') },
  { clave: 'dinelco', test: (m) => m.includes('dinelco') },
  { clave: 'continental', test: (m) => m.includes('continental') },
  { clave: 'familiar', test: (m) => m.includes('familiar') },
  { clave: 'dinero', test: (m) => m.includes('dinero') || m.includes('efectivo') || m.includes('cash') },
]

// Clave de marca de un medio de pago, o null si no se reconoce.
export function marcaDeMedio(medio) {
  const m = norm(medio)
  if (!m) return null
  return MARCAS.find((x) => x.test(m))?.clave || null
}

/**
 * Muestra el logo del medio de pago. Si no se reconoce la marca, cae a un
 * texto simple para no romper la fila.
 */
export default function MedioPago({ medio, className, alto = 'h-5' }) {
  const clave = marcaDeMedio(medio)
  if (!clave) {
    return <span className={cn('text-sm text-mute', className)}>{medio || '—'}</span>
  }
  const Logo = MARCAS_MEDIO_PAGO[clave]
  return (
    <span className={cn('inline-flex items-center', alto, className)} title={medio}>
      <Logo />
    </span>
  )
}
