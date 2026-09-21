// Importación de productos (CSV/XLSX): normalización y validación fila por
// fila. Es la única fuente de verdad del flujo: la vista previa (dryRun) y la
// escritura real usan el mismo análisis, así que lo que el panel muestra es
// exactamente lo que se importa. Sin escrituras acá: solo datos y diagnósticos.

export const IMPORT_MAX_FILAS = 500
export const IMPORT_SKU_MAX = 60
export const IMPORT_NOMBRE_MAX = 160
export const IMPORT_INT_MAX = 2147483647
const IMPORT_USD_MAX = 1000000000000

export type ImportMode = 'crear' | 'actualizar'
export type ImportAction = 'crear' | 'actualizar' | 'omitir'
export type ImportStatus = 'ok' | 'warning' | 'error'
export type ImportCondition = 'NEW' | 'USED' | 'REFURBISHED'

// Producto que ya vive en la sucursal de destino (incluye los dados de baja:
// el SKU sigue ocupado por el índice único).
export type ProductoExistente = {
  id: string
  sku: string
  name: string
  pricePyg: number
  isActive: boolean
}

// Payload normalizado que consume la escritura. En modo actualización solo
// viajan los campos que tienen sentido (el resto se ignora a propósito).
export type FilaImportacion = {
  sku: string
  name: string | null
  pricePyg: number | null
  stock: number | null
  category: string | null
  condition: ImportCondition | null
  costPyg: number | null
  wholesalePricePyg: number | null
  priceUsd: number | null
  model: string | null
  color: string | null
  capacity: string | null
  warrantyDays: number | null
}

export type ResultadoFilaImportacion = {
  /** Número de fila del archivo contando el encabezado (la primera fila de datos es 2). */
  line: number
  action: ImportAction | null
  status: ImportStatus
  errors: string[]
  warnings: string[]
  message: string
  data: FilaImportacion
}

export type ResumenImportacion = {
  total: number
  crear: number
  actualizar: number
  omitir: number
  errores: number
  advertencias: number
}

const CONDICIONES: Record<string, ImportCondition> = {
  NUEVO: 'NEW', NUEVA: 'NEW', NEW: 'NEW',
  SEMI: 'USED', SEMINUEVO: 'USED', SEMINUEVA: 'USED', USED: 'USED', USADO: 'USED', USADA: 'USED',
  REACONDICIONADO: 'REFURBISHED', REACONDICIONADA: 'REFURBISHED', REFURBISHED: 'REFURBISHED',
}

const vacio = (valor: unknown) => valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '')

/** Texto plano de una celda; las fechas se leen como YYYY-MM-DD. */
export function textoImportado(valor: unknown): string | null {
  if (vacio(valor)) return null
  const texto = valor instanceof Date ? valor.toISOString().slice(0, 10) : String(valor).trim()
  return texto ? texto.replace(/\s+/g, ' ') : null
}

// Números de planilla (1500000) y de CSV en español ("1.500.000"). En los
// campos de guaraníes no existen los decimales, así que el punto y la coma se
// leen siempre como separadores de miles cuando cierran el número: "55.000" es
// 55000, no 55. null = vacío; undefined = inválido.
export function enteroImportado(valor: unknown): number | null | undefined {
  if (vacio(valor)) return null
  const numero = typeof valor === 'number' ? valor : enteroDeTexto(String(valor))
  if (numero === null || !Number.isSafeInteger(numero) || numero < 0 || numero > IMPORT_INT_MAX) return undefined
  return numero
}

export function decimalImportado(valor: unknown, decimales = 2): number | null | undefined {
  if (vacio(valor)) return null
  const numero = typeof valor === 'number' ? valor : numeroDeTexto(String(valor))
  if (numero === null || !Number.isFinite(numero) || numero < 0 || numero > IMPORT_USD_MAX) return undefined
  const factor = 10 ** decimales
  if (Math.abs(Math.round(numero * factor) - numero * factor) > 1e-9) return undefined
  return numero
}

function enteroDeTexto(texto: string): number | null {
  const limpio = texto.trim().replace(/[\s\u00a0]/g, '').replace(/[^\d.,-]/g, '')
  if (!/\d/.test(limpio)) return null
  const signo = limpio.startsWith('-') ? -1 : 1
  const cuerpo = limpio.replace(/-/g, '')
  const ultimo = Math.max(cuerpo.lastIndexOf('.'), cuerpo.lastIndexOf(','))
  if (ultimo === -1) return /^\d+$/.test(cuerpo) ? Number(cuerpo) * signo : null
  const cola = cuerpo.slice(ultimo + 1)
  // Cola de 3 dígitos: separador de miles (1.500.000). Cualquier otra cola se
  // rechaza salvo que sea un decimal en cero ("45000,0"), que no aporta nada.
  if (cola.length === 3) {
    const digitos = cuerpo.replace(/[.,]/g, '')
    return /^\d+$/.test(digitos) ? Number(digitos) * signo : null
  }
  if (Number(cola) !== 0) return null
  const entera = cuerpo.slice(0, ultimo).replace(/[.,]/g, '')
  return /^\d+$/.test(entera) ? Number(entera) * signo : null
}

function numeroDeTexto(texto: string): number | null {
  const limpio = texto.trim().replace(/\s/g, '').replace(/[^\d.,-]/g, '')
  if (!limpio || !/\d/.test(limpio)) return null
  const puntos = (limpio.match(/\./g) || []).length
  const normalizado = puntos > 1 ? limpio.replace(/\./g, '') : limpio.replace(/,/g, '.')
  const numero = Number(normalizado)
  return Number.isFinite(numero) ? numero : null
}

export function condicionImportada(valor: unknown): ImportCondition | null | undefined {
  const texto = textoImportado(valor)
  if (!texto) return null
  const clave = texto.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return CONDICIONES[clave] ?? undefined
}

// La columna `condicion` también viaja como etiqueta lista para mostrar.
export function etiquetaCondicion(condition: ImportCondition | null | undefined): string {
  return condition === 'USED' ? 'Seminuevo' : condition === 'REFURBISHED' ? 'Reacondicionado' : 'Nuevo'
}

/** Analiza todas las filas contra el modo elegido y los SKU ya existentes. */
export function analizarImportacion(filas: unknown[], opciones: { existentes: ProductoExistente[]; mode: ImportMode }): { rows: ResultadoFilaImportacion[]; resumen: ResumenImportacion } {
  const existentesPorSku = new Map(opciones.existentes.map(producto => [producto.sku, producto]))
  // Aviso (no bloqueo) cuando el SKU difiere solo en mayúsculas de uno activo.
  const activosPorClave = new Map<string, string>()
  for (const producto of opciones.existentes) {
    if (!producto.isActive) continue
    const clave = producto.sku.toUpperCase()
    if (!activosPorClave.has(clave)) activosPorClave.set(clave, producto.sku)
  }
  const vistos = new Map<string, number>()
  const rows: ResultadoFilaImportacion[] = []

  filas.forEach((fila, indice) => {
    const line = indice + 2
    const bruto = (fila && typeof fila === 'object' ? fila : {}) as Record<string, unknown>
    const errors: string[] = []
    const warnings: string[] = []

    const sku = textoImportado(bruto.sku)
    const name = textoImportado(bruto.name)
    const category = textoImportado(bruto.category)
    const model = textoImportado(bruto.model)
    const color = textoImportado(bruto.color)
    const capacity = textoImportado(bruto.capacity)
    const condition = condicionImportada(bruto.condition)
    const pricePyg = enteroImportado(bruto.pricePyg)
    const stock = enteroImportado(bruto.stock)
    const costPyg = enteroImportado(bruto.costPyg)
    const wholesalePricePyg = enteroImportado(bruto.wholesalePricePyg)
    const priceUsd = decimalImportado(bruto.priceUsd)
    const warrantyDays = enteroImportado(bruto.warrantyDays)

    if (!sku) errors.push('Falta el SKU.')
    else if (sku.length > IMPORT_SKU_MAX) errors.push(`El SKU supera los ${IMPORT_SKU_MAX} caracteres.`)
    else {
      const clave = sku.toUpperCase()
      const repetida = vistos.get(clave)
      if (repetida) errors.push(`SKU repetido en el archivo (fila ${repetida}).`)
      else vistos.set(clave, line)
    }
    if (name && name.length > IMPORT_NOMBRE_MAX) errors.push(`El nombre supera los ${IMPORT_NOMBRE_MAX} caracteres.`)
    if (category && category.length > 120) errors.push('La categoría supera los 120 caracteres.')
    if (model && model.length > 80) errors.push('El modelo supera los 80 caracteres.')
    if (color && color.length > 60) errors.push('El color supera los 60 caracteres.')
    if (capacity && capacity.length > 20) errors.push('La capacidad supera los 20 caracteres.')
    if (pricePyg === undefined) errors.push('Precio inválido: usá un entero en guaraníes.')
    if (stock === undefined) errors.push('Stock inválido: usá un entero mayor o igual a 0.')
    if (costPyg === undefined) errors.push('Costo inválido: usá un entero en guaraníes.')
    if (wholesalePricePyg === undefined) errors.push('Precio mayorista inválido: usá un entero en guaraníes.')
    if (priceUsd === undefined) errors.push('Precio en USD inválido: usá hasta 2 decimales.')
    if (warrantyDays === undefined) errors.push('Los días de garantía deben ser un entero entre 0 y 730.')
    else if (warrantyDays !== null && warrantyDays > 730) errors.push('Los días de garantía deben ser un entero entre 0 y 730.')
    if (condition === undefined) errors.push('Condición inválida: usá NUEVO, SEMI o REACONDICIONADO.')

    const existente = sku ? existentesPorSku.get(sku) : undefined
    let action: ImportAction | null = null
    const precio = pricePyg === undefined ? null : pricePyg
    const existencias = stock === undefined ? null : stock
    const garantia = warrantyDays === undefined ? null : warrantyDays

    if (!errors.length) {
      if (existente && !existente.isActive) {
        errors.push('El SKU pertenece a un producto eliminado del catálogo. Reactivalo o usá otro SKU.')
      } else if (existente && opciones.mode === 'crear') {
        errors.push('Ya existe un producto con ese SKU en la sucursal.')
      } else if (existente) {
        if (precio === null || precio <= 0) {
          action = 'omitir'
          warnings.push('Sin precio mayor a 0: no hay nada para actualizar.')
        } else {
          action = 'actualizar'
          warnings.push(`Actualiza el precio de "${existente.name}".`)
          if (existencias !== null && existencias > 0) warnings.push('El stock no se actualiza en productos existentes: usá Compras o un ajuste de inventario.')
        }
      } else {
        if (!name) errors.push('Falta el nombre.')
        else action = 'crear'
      }
      if (!existente && sku) {
        const parecido = activosPorClave.get(sku.toUpperCase())
        if (parecido) warnings.push(`Ya existe un producto activo con un SKU parecido: ${parecido}.`)
      }
      if (!existente && action === 'crear' && precio === null) warnings.push('Sin precio en la fila: el producto se crea con precio 0.')
    }

    const status: ImportStatus = errors.length ? 'error' : warnings.length ? 'warning' : 'ok'
    rows.push({
      line,
      action: errors.length ? null : action,
      status,
      errors,
      warnings,
      message: errors[0] || warnings[0] || '',
      data: {
        sku: sku || '',
        name,
        pricePyg: precio,
        stock: existencias,
        category,
        condition: condition === undefined ? null : condition,
        costPyg: costPyg === undefined ? null : costPyg,
        wholesalePricePyg: wholesalePricePyg === undefined ? null : wholesalePricePyg,
        priceUsd: priceUsd === undefined ? null : priceUsd,
        model,
        color,
        capacity,
        warrantyDays: garantia,
      },
    })
  })

  return {
    rows,
    resumen: {
      total: rows.length,
      crear: rows.filter(row => row.action === 'crear').length,
      actualizar: rows.filter(row => row.action === 'actualizar').length,
      omitir: rows.filter(row => row.action === 'omitir').length,
      errores: rows.filter(row => row.status === 'error').length,
      advertencias: rows.filter(row => row.status === 'warning').length,
    },
  }
}
