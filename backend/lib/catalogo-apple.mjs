// Catálogo Apple versionado de MobOS: un solo origen de modelos, capacidades y
// colores. Lo importan el backend (valores de toma, validación del lote) y el
// front (Trade-in, cotizador, cotizaciones, demo), igual que modulos-catalogo.mjs:
// sin dependencias ni efectos. Para sumar un modelo nuevo se agrega una línea
// acá y se sube CATALOGO_APPLE_VERSION; no hay otra lista por modelo.
//
// Formato: modelo(familia, nombre, año, capacidades, colores).
// Las capacidades vacías (AirPods) significan «sin capacidad».

export const CATALOGO_APPLE_VERSION = '2026.10.1'
export const FAMILIAS_APPLE = Object.freeze(['iPhone', 'iPad', 'Mac', 'Apple Watch', 'AirPods'])

const GB = (...valores) => valores.map(valor => (valor >= 1024 ? `${valor / 1024}TB` : `${valor}GB`))

const normalizar = (valor) => String(valor ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

const slug = (valor) => normalizar(valor).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const lista = []
function modelo(familia, nombre, anio, capacidades, colores) {
  lista.push(Object.freeze({
    id: slug(nombre), familia, nombre, anio,
    capacidades: Object.freeze([...capacidades]),
    colores: Object.freeze([...colores]),
  }))
}

// ---- iPhone (11 en adelante) ----
const C11 = ['Negro', 'Blanco', 'Verde', 'Amarillo', 'Lila', 'Rojo']
const CPRO11 = ['Gris espacial', 'Plata', 'Oro', 'Verde noche']
const C12 = ['Negro', 'Blanco', 'Rojo', 'Verde', 'Azul', 'Violeta']
const CPRO12 = ['Grafito', 'Plata', 'Oro', 'Azul pacífico']
const C13 = ['Medianoche', 'Blanco estelar', 'Rojo', 'Azul', 'Rosa', 'Verde']
const CPRO13 = ['Grafito', 'Oro', 'Plata', 'Azul sierra', 'Verde alpino']
const CSE = ['Medianoche', 'Blanco estelar', 'Rojo']
const C14 = ['Medianoche', 'Blanco estelar', 'Azul', 'Violeta', 'Amarillo', 'Rojo']
const CPRO14 = ['Negro espacial', 'Plata', 'Oro', 'Morado oscuro']
const C15 = ['Negro', 'Azul', 'Verde', 'Amarillo', 'Rosa']
const CPRO15 = ['Titanio natural', 'Titanio azul', 'Titanio blanco', 'Titanio negro']
const C16 = ['Negro', 'Blanco', 'Rosa', 'Verde azulado', 'Ultramar']
const CPRO16 = ['Titanio negro', 'Titanio blanco', 'Titanio natural', 'Titanio desierto']
const C17 = ['Negro', 'Blanco', 'Azul niebla', 'Salvia', 'Lavanda']
const CPRO17 = ['Plata', 'Azul intenso', 'Naranja cósmico']

modelo('iPhone', 'iPhone 11', 2019, GB(64, 128, 256), C11)
modelo('iPhone', 'iPhone 11 Pro', 2019, GB(64, 256, 512), CPRO11)
modelo('iPhone', 'iPhone 11 Pro Max', 2019, GB(64, 256, 512), CPRO11)
modelo('iPhone', 'iPhone SE (2da gen)', 2020, GB(64, 128, 256), ['Negro', 'Blanco', 'Rojo'])
modelo('iPhone', 'iPhone 12 mini', 2020, GB(64, 128, 256), C12)
modelo('iPhone', 'iPhone 12', 2020, GB(64, 128, 256), C12)
modelo('iPhone', 'iPhone 12 Pro', 2020, GB(128, 256, 512), CPRO12)
modelo('iPhone', 'iPhone 12 Pro Max', 2020, GB(128, 256, 512), CPRO12)
modelo('iPhone', 'iPhone 13 mini', 2021, GB(128, 256, 512), C13)
modelo('iPhone', 'iPhone 13', 2021, GB(128, 256, 512), C13)
modelo('iPhone', 'iPhone 13 Pro', 2021, GB(128, 256, 512, 1024), CPRO13)
modelo('iPhone', 'iPhone 13 Pro Max', 2021, GB(128, 256, 512, 1024), CPRO13)
modelo('iPhone', 'iPhone SE (3ra gen)', 2022, GB(64, 128, 256), CSE)
modelo('iPhone', 'iPhone 14', 2022, GB(128, 256, 512), C14)
modelo('iPhone', 'iPhone 14 Plus', 2022, GB(128, 256, 512), C14)
modelo('iPhone', 'iPhone 14 Pro', 2022, GB(128, 256, 512, 1024), CPRO14)
modelo('iPhone', 'iPhone 14 Pro Max', 2022, GB(128, 256, 512, 1024), CPRO14)
modelo('iPhone', 'iPhone 15', 2023, GB(128, 256, 512), C15)
modelo('iPhone', 'iPhone 15 Plus', 2023, GB(128, 256, 512), C15)
modelo('iPhone', 'iPhone 15 Pro', 2023, GB(128, 256, 512, 1024), CPRO15)
modelo('iPhone', 'iPhone 15 Pro Max', 2023, GB(256, 512, 1024), CPRO15)
modelo('iPhone', 'iPhone 16e', 2025, GB(128, 256, 512), ['Negro', 'Blanco'])
modelo('iPhone', 'iPhone 16', 2024, GB(128, 256, 512), C16)
modelo('iPhone', 'iPhone 16 Plus', 2024, GB(128, 256, 512), C16)
modelo('iPhone', 'iPhone 16 Pro', 2024, GB(128, 256, 512, 1024), CPRO16)
modelo('iPhone', 'iPhone 16 Pro Max', 2024, GB(256, 512, 1024), CPRO16)
modelo('iPhone', 'iPhone 17', 2025, GB(256, 512), C17)
modelo('iPhone', 'iPhone Air', 2025, GB(256, 512, 1024), ['Negro espacial', 'Blanco nube', 'Oro claro', 'Azul cielo'])
modelo('iPhone', 'iPhone 17 Pro', 2025, GB(256, 512, 1024), CPRO17)
modelo('iPhone', 'iPhone 17 Pro Max', 2025, GB(256, 512, 1024, 2048), CPRO17)

// ---- iPad ----
modelo('iPad', 'iPad (9na gen)', 2021, GB(64, 256), ['Gris espacial', 'Plata'])
modelo('iPad', 'iPad (10ma gen)', 2022, GB(64, 256), ['Azul', 'Rosa', 'Amarillo', 'Plata'])
modelo('iPad', 'iPad (A16)', 2025, GB(128, 256, 512), ['Azul', 'Rosa', 'Amarillo', 'Plata'])
modelo('iPad', 'iPad mini (6ta gen)', 2021, GB(64, 256), ['Gris espacial', 'Rosa', 'Violeta', 'Luz estelar'])
modelo('iPad', 'iPad mini (A17 Pro)', 2024, GB(128, 256, 512), ['Gris espacial', 'Azul', 'Violeta', 'Luz estelar'])
modelo('iPad', 'iPad Air 10.9 (M1)', 2022, GB(64, 256), ['Gris espacial', 'Luz estelar', 'Rosa', 'Violeta', 'Azul'])
modelo('iPad', 'iPad Air 11 (M2)', 2024, GB(128, 256, 512, 1024), ['Gris espacial', 'Luz estelar', 'Azul', 'Violeta'])
modelo('iPad', 'iPad Air 13 (M2)', 2024, GB(128, 256, 512, 1024), ['Gris espacial', 'Luz estelar', 'Azul', 'Violeta'])
modelo('iPad', 'iPad Air 11 (M3)', 2025, GB(128, 256, 512, 1024), ['Gris espacial', 'Luz estelar', 'Azul', 'Violeta'])
modelo('iPad', 'iPad Air 13 (M3)', 2025, GB(128, 256, 512, 1024), ['Gris espacial', 'Luz estelar', 'Azul', 'Violeta'])
modelo('iPad', 'iPad Pro 11 (M4)', 2024, GB(256, 512, 1024, 2048), ['Negro espacial', 'Plata'])
modelo('iPad', 'iPad Pro 13 (M4)', 2024, GB(256, 512, 1024, 2048), ['Negro espacial', 'Plata'])
modelo('iPad', 'iPad Pro 11 (M5)', 2025, GB(256, 512, 1024, 2048), ['Negro espacial', 'Plata'])
modelo('iPad', 'iPad Pro 13 (M5)', 2025, GB(256, 512, 1024, 2048), ['Negro espacial', 'Plata'])

// ---- Mac ----
const CAIR = ['Gris espacial', 'Plata', 'Oro', 'Medianoche', 'Luz estelar']
const CPRO_MAC = ['Gris espacial', 'Plata', 'Negro espacial']
modelo('Mac', 'MacBook Air 13 (M1)', 2020, GB(256, 512, 1024, 2048), ['Gris espacial', 'Plata', 'Oro'])
modelo('Mac', 'MacBook Air 13 (M2)', 2022, GB(256, 512, 1024, 2048), CAIR)
modelo('Mac', 'MacBook Air 15 (M2)', 2023, GB(256, 512, 1024, 2048), CAIR)
modelo('Mac', 'MacBook Air 13 (M3)', 2024, GB(256, 512, 1024, 2048), ['Gris espacial', 'Plata', 'Medianoche', 'Luz estelar'])
modelo('Mac', 'MacBook Air 15 (M3)', 2024, GB(256, 512, 1024, 2048), ['Gris espacial', 'Plata', 'Medianoche', 'Luz estelar'])
modelo('Mac', 'MacBook Air 13 (M4)', 2025, GB(256, 512, 1024, 2048), ['Azul cielo', 'Plata', 'Medianoche', 'Luz estelar'])
modelo('Mac', 'MacBook Air 15 (M4)', 2025, GB(256, 512, 1024, 2048), ['Azul cielo', 'Plata', 'Medianoche', 'Luz estelar'])
modelo('Mac', 'MacBook Pro 13 (M2)', 2022, GB(256, 512, 1024, 2048), ['Gris espacial', 'Plata'])
modelo('Mac', 'MacBook Pro 14 (M1 Pro)', 2021, GB(512, 1024, 2048, 4096, 8192), ['Gris espacial', 'Plata'])
modelo('Mac', 'MacBook Pro 16 (M1 Pro)', 2021, GB(512, 1024, 2048, 4096, 8192), ['Gris espacial', 'Plata'])
modelo('Mac', 'MacBook Pro 14 (M3)', 2023, GB(512, 1024, 2048, 4096, 8192), ['Gris espacial', 'Negro espacial', 'Plata'])
modelo('Mac', 'MacBook Pro 16 (M3 Pro)', 2023, GB(512, 1024, 2048, 4096, 8192), ['Negro espacial', 'Plata'])
modelo('Mac', 'MacBook Pro 14 (M4)', 2024, GB(512, 1024, 2048, 4096), CPRO_MAC.slice(1))
modelo('Mac', 'MacBook Pro 16 (M4 Pro)', 2024, GB(512, 1024, 2048, 4096, 8192), CPRO_MAC.slice(1))
modelo('Mac', 'MacBook Pro 14 (M5)', 2025, GB(512, 1024, 2048, 4096), CPRO_MAC.slice(1))
modelo('Mac', 'iMac 24 (M1)', 2021, GB(256, 512, 1024, 2048), ['Azul', 'Verde', 'Rosa', 'Plata', 'Amarillo', 'Naranja', 'Violeta'])
modelo('Mac', 'iMac 24 (M3)', 2023, GB(256, 512, 1024, 2048), ['Azul', 'Verde', 'Rosa', 'Plata', 'Amarillo', 'Naranja', 'Violeta'])
modelo('Mac', 'iMac 24 (M4)', 2024, GB(256, 512, 1024, 2048), ['Azul', 'Verde', 'Rosa', 'Plata', 'Amarillo', 'Naranja', 'Violeta'])
modelo('Mac', 'Mac mini (M2)', 2023, GB(256, 512, 1024, 2048), ['Plata'])
modelo('Mac', 'Mac mini (M4)', 2024, GB(256, 512, 1024, 2048), ['Plata'])
modelo('Mac', 'Mac Studio (M2 Max)', 2023, GB(512, 1024, 2048, 4096, 8192), ['Plata'])
modelo('Mac', 'Mac Studio (M4 Max)', 2025, GB(512, 1024, 2048, 4096, 8192), ['Plata'])

// ---- Apple Watch ----
const CW = ['Medianoche', 'Luz estelar', 'Plata', 'Rojo', 'Rosa']
modelo('Apple Watch', 'Apple Watch Series 6', 2020, GB(32), ['Gris espacial', 'Plata', 'Oro', 'Azul', 'Rojo'])
modelo('Apple Watch', 'Apple Watch SE (2da gen)', 2022, GB(32), ['Medianoche', 'Luz estelar', 'Plata'])
modelo('Apple Watch', 'Apple Watch SE 3', 2025, GB(64), ['Medianoche', 'Luz estelar'])
modelo('Apple Watch', 'Apple Watch Series 7', 2021, GB(32), ['Medianoche', 'Luz estelar', 'Verde', 'Azul', 'Rojo'])
modelo('Apple Watch', 'Apple Watch Series 8', 2022, GB(32), ['Medianoche', 'Luz estelar', 'Plata', 'Rojo'])
modelo('Apple Watch', 'Apple Watch Series 9', 2023, GB(64), CW)
modelo('Apple Watch', 'Apple Watch Series 10', 2024, GB(64), ['Negro azabache', 'Oro rosa', 'Plata'])
modelo('Apple Watch', 'Apple Watch Series 11', 2025, GB(64), ['Negro azabache', 'Oro rosa', 'Plata', 'Gris espacial'])
modelo('Apple Watch', 'Apple Watch Ultra', 2022, GB(32), ['Titanio natural'])
modelo('Apple Watch', 'Apple Watch Ultra 2', 2023, GB(64), ['Titanio natural', 'Titanio negro'])
modelo('Apple Watch', 'Apple Watch Ultra 3', 2025, GB(64), ['Titanio natural', 'Titanio negro'])

// ---- AirPods ----
modelo('AirPods', 'AirPods (2da gen)', 2019, [], ['Blanco'])
modelo('AirPods', 'AirPods (3ra gen)', 2021, [], ['Blanco'])
modelo('AirPods', 'AirPods 4', 2024, [], ['Blanco'])
modelo('AirPods', 'AirPods 4 con cancelación activa de ruido', 2024, [], ['Blanco'])
modelo('AirPods', 'AirPods Pro (1ra gen)', 2019, [], ['Blanco'])
modelo('AirPods', 'AirPods Pro 2', 2022, [], ['Blanco'])
modelo('AirPods', 'AirPods Pro 3', 2025, [], ['Blanco'])
modelo('AirPods', 'AirPods Max', 2020, [], ['Gris espacial', 'Plata', 'Verde', 'Azul cielo', 'Rosa'])

export const CATALOGO_APPLE = Object.freeze(lista)

const porId = new Map(CATALOGO_APPLE.map(item => [item.id, item]))
const porClave = new Map(CATALOGO_APPLE.map(item => [normalizar(item.nombre), item]))

/** Clave de comparación del modelo (misma regla que DeviceValuation.modelKey). */
export const normalizarClaveModelo = normalizar

/** Una capacidad escrita a mano («256 gb», «1 tb») en su forma canónica («256GB», «1TB»). */
export function normalizarCapacidad(valor) {
  const m = String(valor ?? '').replace(/\s+/g, '').match(/^(\d+(?:\.\d+)?)(TB|GB)$/i)
  return m ? `${Number(m[1])}${m[2].toUpperCase()}` : String(valor ?? '').trim()
}

/** Modelo exacto por nombre (sin mayúsculas ni acentos) o por id; null si no es del catálogo. */
export const modeloApple = (nombreOId) => porId.get(String(nombreOId)) || porClave.get(normalizar(nombreOId)) || null

/** Capacidades del modelo; vacío si el modelo no existe o no tiene capacidad. */
export const capacidadesDeModelo = (nombreOId) => modeloApple(nombreOId)?.capacidades ?? []

/** Colores del modelo; vacío si no es del catálogo. */
export const coloresDeModelo = (nombreOId) => modeloApple(nombreOId)?.colores ?? []

/**
 * Búsqueda por palabras: «15 pro max» encuentra «iPhone 15 Pro Max» y no
 * «iPhone 15 Pro». Cada palabra tiene que estar en el nombre; el orden da igual.
 * Los resultados más cortos (coincidencia más exacta) van primero.
 */
export function buscarModelosApple(texto, { familia = '', limite = 12 } = {}) {
  const palabras = normalizar(texto).split(' ').filter(Boolean)
  if (!palabras.length) return []
  const palabrasDe = (item) => normalizar(`${item.familia} ${item.nombre}`).replace(/[()]/g, '').split(' ')
  return CATALOGO_APPLE
    .filter(item => (!familia || item.familia === familia) && palabras.every(palabra => palabrasDe(item).some(parte => parte.startsWith(palabra))))
    .sort((a, b) => a.nombre.length - b.nombre.length || b.anio - a.anio)
    .slice(0, limite)
}

/** Verifica un par modelo/capacidad contra el catálogo. Modelos fuera del catálogo no se rechazan. */
export function capacidadValida(nombreModelo, capacidad) {
  const item = modeloApple(nombreModelo)
  if (!item) return true
  const valor = normalizarCapacidad(capacidad)
  if (!item.capacidades.length) return !valor
  return item.capacidades.includes(valor)
}
