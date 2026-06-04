import { num } from '@/utils/calculos'

// Calcula el valor de trade-in a partir de la selección y la config.
// sel: { model, capacity, isNew, phys, battery, repairs:[] }
// config: getTradein()
export function calcularTradein(sel, config) {
  const dev = config.devices.find((d) => d.model === sel.model)
  if (!dev) return null
  const base = num(dev.prices[sel.capacity])
  if (base <= 0) return null

  // Nuevo = 100% del precio base; seminuevo aplica multiplicadores.
  const cMult = sel.isNew === 'nuevo' ? 1 : num(config.conditionMultipliers[sel.phys]?.value) || 1
  const bMult = sel.isNew === 'nuevo' ? 1 : num(config.batteryMultipliers[sel.battery]?.value) || 1
  let rMult = 1
  if (sel.isNew !== 'nuevo' && Array.isArray(sel.repairs)) {
    sel.repairs.forEach((r) => {
      const v = num(config.repairMultipliers[r]?.value)
      if (v > 0) rMult *= v
    })
  }

  const usd = Math.round(base * cMult * bMult * rMult)
  const pyg = Math.round(usd * num(config.exchangeRate))
  return { usd, pyg, base }
}
