// Adaptador de migración (#253): el autocompletado vive en la biblioteca
// (`owncoding-ui/CityAutocomplete`) con su catálogo de ciudades de Paraguay
// (resuelve el departamento sin red). Acá queda solo el endpoint real; en la
// demo (prop `esDemo` o sesión demo) se usa el catálogo de la biblioteca, así
// que el campo sugiere ciudades y departamento sin llamar al API. El valor
// guardado sigue siendo el nombre de la ciudad (string).
import { CityAutocomplete as CampoCiudad } from 'owncoding-ui'
import { api } from '@/lib/api/client'
import { demoSessionActive, isDemoRuntime } from '@/lib/demoMode'
import { cn } from '@/lib/utils'
import { ANCHO_CAMPO } from './anchoCampos'

// Referencia estable: la biblioteca invalida la búsqueda si cambia `buscar`.
const buscarEnApi = (texto) => api.get(`/api/geo/cities?q=${encodeURIComponent(texto)}`)

export default function CityAutocomplete({ esDemo = false, className, ...props }) {
  const demo = esDemo || isDemoRuntime || demoSessionActive()
  return <CampoCiudad buscar={demo ? undefined : buscarEnApi} {...props} className={cn('w-full', ANCHO_CAMPO.ciudad, className)} />
}
