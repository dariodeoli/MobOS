// Categorías de producto con icono (#242): las categorías controladas, sus
// alias para normalizar el texto libre actual y el mapa categoría→icono que
// comparten POS, catálogo e inventario. Los glifos nuevos (mobile, laptop,
// tablet, watch, buds, cable) viven en `shared/IconoCategoria.jsx`.
// Sin lógica de negocio: normaliza texto y devuelve la clave canónica.

export const CATEGORIAS_PRODUCTO = [
  { clave: 'iphone', etiqueta: 'iPhone', icono: 'mobile', alias: ['iphone', 'mobile', 'celular', 'telefono', 'smartphone'] },
  { clave: 'macbook', etiqueta: 'MacBook', icono: 'laptop', alias: ['macbook', 'mac', 'laptop', 'notebook', 'computadora'] },
  { clave: 'ipad', etiqueta: 'iPad', icono: 'tablet', alias: ['ipad', 'tablet', 'tableta'] },
  { clave: 'watch', etiqueta: 'Watch', icono: 'watch', alias: ['watch', 'reloj', 'apple watch'] },
  { clave: 'airpods', etiqueta: 'AirPods', icono: 'buds', alias: ['airpods', 'auriculares', 'audifonos', 'buds', 'earbuds'] },
  { clave: 'accesorios', etiqueta: 'Accesorios', icono: 'cable', alias: ['accesorios', 'cable', 'cables', 'cargador', 'cargadores', 'funda', 'fundas', 'vidrio', 'lamina', 'templado', 'adaptador'] },
  { clave: 'servicio', etiqueta: 'Servicio', icono: 'wrench', alias: ['servicio', 'servicios', 'reparacion'] },
  { clave: 'otro', etiqueta: 'Otro', icono: 'box', alias: [] },
]

// La clave canónica de un acceso rápido: categoría → icono.
export const ICONO_CATEGORIA = Object.fromEntries(CATEGORIAS_PRODUCTO.map(({ clave, icono }) => [clave, icono]))

// Palabras que mandan a accesorios aunque el nombre mencione un equipo
// ("Funda iPhone" es accesorio, no iPhone).
const PALABRAS_ACCESORIO = ['funda', 'cable', 'cargador', 'vidrio', 'lamina', 'templado', 'adaptador', 'protector', 'soporte', 'auriculares genericos']

const sinAcentos = (texto) => String(texto ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')

/**
 * Normaliza una categoría o nombre de producto a su categoría canónica.
 * Devuelve el objeto completo `{ clave, etiqueta, icono }`.
 */
export function normalizarCategoria(texto) {
  const limpio = sinAcentos(texto)
  const buscar = (clave) => CATEGORIAS_PRODUCTO.find((categoria) => categoria.clave === clave)
  if (!limpio) return buscar('otro')

  if (PALABRAS_ACCESORIO.some((palabra) => limpio.includes(palabra))) return buscar('accesorios')

  const exacta = CATEGORIAS_PRODUCTO.find((categoria) => categoria.alias.includes(limpio))
  if (exacta) return exacta

  const contiene = CATEGORIAS_PRODUCTO.find((categoria) => categoria.alias.some((alias) => alias.length > 3 && limpio.includes(alias)))
  return contiene || buscar('otro')
}

export const categoriaDe = (texto) => normalizarCategoria(texto).clave
export const iconoDeCategoria = (texto) => normalizarCategoria(texto).icono
export const etiquetaDeCategoria = (texto) => normalizarCategoria(texto).etiqueta
