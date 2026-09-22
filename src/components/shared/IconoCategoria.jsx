import Icon from '@/components/shared/Icon'
import { iconoDeCategoria } from '@/lib/categorias'
import { cn } from '@/lib/utils'

// Icono de categoría de producto (#242): mobile (iPhone), laptop (MacBook),
// tablet (iPad), watch, buds (AirPods) y cable (accesorios). Los glifos nuevos
// viven acá (el set compartido no los tenía) con el mismo trazo que `Icon`; el
// resto de las categorías (servicio, otro) delegan en `Icon`.
// Uso: `<IconoCategoria categoria="MacBook Pro" />` o `icono="mobile"`.
export const GLIFOS_CATEGORIA = {
  // Celular: marco redondeado con parlante y botón.
  mobile: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM10 5h4M11 18.5h2',
  // Laptop: pantalla arriba, base ancha.
  laptop: 'M5 5h14v10H5zM2.5 19h19M9 15l-.5 4M15 15l.5 4',
  // Tablet: marco redondeado más ancho que el celular.
  tablet: 'M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM11 18.5h2',
  // Reloj: caja central con correas.
  watch: 'M9 2h6l.8 4H8.2L9 2ZM8.2 18h7.6l-.8 4H9l-.8-4ZM6 8h12v8H6zM12 10.5v3l2 1',
  // Auriculares: dos buds con su tallo.
  buds: 'M7 3.5a3 3 0 0 1 3 3v7a3 3 0 1 1-6 0v-7a3 3 0 0 1 3-3ZM7 16.5V21M17 3.5a3 3 0 0 1 3 3v7a3 3 0 1 1-6 0v-7a3 3 0 0 1 3-3ZM17 16.5V21',
  // Cable: curva con conectores en los extremos.
  cable: 'M4 3v5a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4v5M2 3h4M18 21h4',
}

export default function IconoCategoria({ categoria, icono, className, ...props }) {
  const glifo = icono || iconoDeCategoria(categoria)
  const clases = cn('shrink-0', className || 'h-5 w-5')
  if (!GLIFOS_CATEGORIA[glifo]) return <Icon name={glifo} className={clases} {...props} />
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={clases}
      {...props}
    >
      <path d={GLIFOS_CATEGORIA[glifo]} />
    </svg>
  )
}
