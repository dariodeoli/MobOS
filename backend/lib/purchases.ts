export type PurchaseCostLineInput = {
  id: string
  quantity: number
  unitCostPyg: number
}

export type PurchaseCostInput = {
  shippingPyg: number
  customsPyg: number
  insurancePyg: number
  taxesPyg: number
  otherCostsPyg: number
  method?: 'PROPORTIONAL_VALUE' | 'PROPORTIONAL_QUANTITY'
}

type Allocation = Record<string, number>

function allocate(total: number, weights: number[], ids: string[]): Allocation {
  const result: Allocation = Object.fromEntries(ids.map(id => [id, 0]))
  if (total === 0) return result
  const denominator = weights.reduce((sum, value) => sum + value, 0)
  if (denominator <= 0) throw new Error('No se puede distribuir un costo sin líneas.')
  const pieces = weights.map((weight, index) => {
    const exact = total * weight / denominator
    return { index, floor: Math.floor(exact), fraction: exact - Math.floor(exact) }
  })
  let remaining = total - pieces.reduce((sum, item) => sum + item.floor, 0)
  // Orden estable: mayor residuo y luego la posición declarada de la línea.
  pieces.sort((a, b) => b.fraction - a.fraction || a.index - b.index)
  for (const item of pieces) result[ids[item.index]] = item.floor + (remaining-- > 0 ? 1 : 0)
  return result
}

/** Distribuye cada gasto explícitamente, sin redondeos perdidos, por valor o cantidad. */
export function distributePurchaseCosts<T extends PurchaseCostLineInput>(lines: T[], input: PurchaseCostInput) {
  if (!lines.length) throw new Error('La compra necesita al menos una línea.')
  const ids = lines.map(line => line.id)
  const baseTotals = lines.map(line => line.quantity * line.unitCostPyg)
  const weights = input.method === 'PROPORTIONAL_QUANTITY' ? lines.map(line => line.quantity) : baseTotals
  const shipping = allocate(input.shippingPyg, weights, ids)
  const customs = allocate(input.customsPyg, weights, ids)
  const insurance = allocate(input.insurancePyg, weights, ids)
  const taxes = allocate(input.taxesPyg, weights, ids)
  const other = allocate(input.otherCostsPyg, weights, ids)
  return lines.map((line, index) => {
    const baseTotalPyg = baseTotals[index]
    const allocatedExtraCostPyg = shipping[line.id] + customs[line.id] + insurance[line.id] + taxes[line.id] + other[line.id]
    const finalTotalCostPyg = baseTotalPyg + allocatedExtraCostPyg
    return {
      ...line, baseTotalPyg,
      allocatedShippingPyg: shipping[line.id], allocatedCustomsPyg: customs[line.id],
      allocatedInsurancePyg: insurance[line.id], allocatedTaxesPyg: taxes[line.id], allocatedOtherCostsPyg: other[line.id],
      allocatedExtraCostPyg, finalTotalCostPyg,
      // Se conserva el total exacto; este valor es una referencia por unidad redondeada.
      finalUnitCostPyg: Math.round(finalTotalCostPyg / line.quantity),
    }
  })
}

export function purchaseTotals(lines: ReturnType<typeof distributePurchaseCosts>, payments: Array<{ amountPyg: number }> = []) {
  const finalCostPyg = lines.reduce((sum, line) => sum + line.finalTotalCostPyg, 0)
  const paidPyg = payments.reduce((sum, payment) => sum + Number(payment.amountPyg || 0), 0)
  return { finalCostPyg, paidPyg, outstandingPyg: finalCostPyg - paidPyg }
}
