// Adaptador de migración (#253): el autocompletado vive en la biblioteca
// (`owncoding-ui/CityAutocomplete`); acá queda el endpoint real y el modo demo
// (sin sugerencias y sin resolver departamento, como antes).
import { CityAutocomplete as CampoCiudad } from 'owncoding-ui'
import { api } from '@/lib/api/client'

export default function CityAutocomplete({ esDemo = false, onSelect, ...props }) {
  const buscar = esDemo
    ? async () => []
    : (texto) => api.get(`/api/geo/cities?q=${encodeURIComponent(texto)}`)
  const elegir = esDemo ? (ciudad) => onSelect?.(ciudad, '') : onSelect
  return <CampoCiudad buscar={buscar} onSelect={elegir} {...props} />
}
