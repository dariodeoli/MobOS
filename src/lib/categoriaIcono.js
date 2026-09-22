// Icono de categoría del producto para el POS (#242). Normaliza el texto de la
// categoría que llega de Inventario (coordinación INV) y devuelve el nombre de
// icono de la biblioteca compartida (CMP); sin coincidencia cae a «box».
const CATEGORIAS = [
  { claves: ['iphone', 'celular', 'telefono', 'teléfono', 'smartphone'], icono: 'phone' },
  { claves: ['macbook', 'mac', 'notebook', 'laptop', 'computadora'], icono: 'box' },
  { claves: ['ipad', 'tablet'], icono: 'box' },
  { claves: ['watch', 'reloj'], icono: 'clock' },
  { claves: ['airpods', 'auricular', 'audio'], icono: 'box' },
  { claves: ['accesorio', 'funda', 'cargador', 'protector', 'cable', 'skin'], icono: 'box' },
]

const normalizar = (texto) => String(texto || '').trim().toLowerCase()

export function categoriaDeProducto(producto) {
  const texto = normalizar(producto?.categoria ?? producto?.category ?? producto?.rubro)
  if (!texto) return 'accesorios'
  const encontrada = CATEGORIAS.find(({ claves }) => claves.some((clave) => texto.includes(clave)))
  return encontrada ? encontrada.icono : 'box'
}

export function categoriaIcono(producto) {
  return categoriaDeProducto(producto)
}
