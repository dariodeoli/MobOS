// Seguro del cliente (#160): resuelve el porcentaje que se aplica a la venta.
//
// Precedencia acordada con FIN (#162):
// 1. El seguro puntual del producto manda (es el objeto más específico).
// 2. Si el cliente tiene el seguro activo, usa su porcentaje personalizado; si
//    no lo definió, el default de la empresa (que FIN conecta por parámetro).
// 3. Sin seguro del cliente, rige la política por categoría.
// FIN #162 define además la base de cálculo (costo real); acá solo se resuelve
// la tasa para no duplicar esa fórmula.
export function resolveInsuranceRate({
  productRate,
  customerEnabled = false,
  customerRate = null,
  categoryRate = null,
  companyDefaultPct = 0,
}: {
  productRate?: unknown
  customerEnabled?: boolean | null
  customerRate?: unknown
  categoryRate?: unknown
  companyDefaultPct?: unknown
} = {}): number {
  if (productRate !== null && productRate !== undefined) {
    const rate = Number(productRate)
    return Number.isFinite(rate) && rate > 0 ? rate : 0
  }
  if (customerEnabled) {
    const rate = Number(customerRate)
    if (customerRate !== null && customerRate !== undefined && Number.isFinite(rate) && rate > 0) return rate
    const porDefecto = Number(companyDefaultPct)
    return Number.isFinite(porDefecto) && porDefecto > 0 ? porDefecto : 0
  }
  const categoria = Number(categoryRate)
  return Number.isFinite(categoria) && categoria > 0 ? categoria : 0
}
