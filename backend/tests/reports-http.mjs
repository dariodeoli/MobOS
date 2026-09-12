#!/usr/bin/env node
// Contrato del reporte sobre una respuesta HTTP ya obtenida.
// Uso: node reports-http.mjs <archivo.json> <totalEsperado> <ordenesEsperadas> <groupBy>
//
// No crea ni modifica datos: solo lee el JSON y comprueba que los totales
// reconcilien con la base y que el agrupamiento no duplique importes.

import fs from 'node:fs'

const [file, totalEsperado, ordenesEsperadas, groupBy] = process.argv.slice(2)
if (!file || !totalEsperado || !ordenesEsperadas || !groupBy) {
  console.error('Uso: reports-http.mjs <archivo.json> <totalEsperado> <ordenesEsperadas> <groupBy>')
  process.exit(2)
}

const cuerpo = JSON.parse(fs.readFileSync(file, 'utf8'))
const fallo = (mensaje) => {
  console.error(`reports-http: ${mensaje}`)
  process.exit(1)
}

if (!cuerpo || typeof cuerpo !== 'object') fallo('la respuesta no es un objeto')
if (cuerpo.groupBy !== groupBy) fallo(`se esperaba groupBy=${groupBy}, llegó ${cuerpo.groupBy}`)
if (!cuerpo.from || !cuerpo.to) fallo('faltan from/to en la respuesta')

const { totals, groups } = cuerpo
if (!totals || !Array.isArray(groups)) fallo('faltan totals o groups')
if (totals.orders !== Number(ordenesEsperadas)) fallo(`orders: esperado ${ordenesEsperadas}, recibido ${totals.orders}`)
if (totals.totalPyg !== Number(totalEsperado)) fallo(`totalPyg: esperado ${totalEsperado}, recibido ${totals.totalPyg}`)
if (typeof totals.totalPyg !== 'number' || !Number.isSafeInteger(totals.totalPyg)) fallo('totalPyg no es un entero seguro')

const pendienteEsperado = Math.max(0, totals.totalPyg - totals.collectedPyg)
if (totals.pendingPyg !== pendienteEsperado) fallo(`pendingPyg: esperado ${pendienteEsperado}, recibido ${totals.pendingPyg}`)
if (totals.costPyg < 0 || totals.profitPyg < 0 || totals.salesWithoutCostPyg < 0) fallo('hay importes negativos')

for (const [indice, grupo] of groups.entries()) {
  if (typeof grupo.label !== 'string' || !grupo.label.trim()) fallo(`grupo ${indice} sin etiqueta`)
  if (typeof grupo.key !== 'string' || !grupo.key.trim()) fallo(`grupo ${indice} sin clave`)
  for (const campo of ['units', 'grossPyg', 'costPyg', 'profitPyg', 'salesWithoutCostPyg', 'linesWithoutCost', 'orders']) {
    if (!Number.isSafeInteger(grupo[campo]) || grupo[campo] < 0) fallo(`grupo ${grupo.label}: ${campo} inválido`)
  }
  if (grupo.profitPyg > grupo.grossPyg) fallo(`grupo ${grupo.label}: la ganancia supera la venta`)
}

// Por producto y por categoría cada línea aparece una sola vez: la suma de las
// ventas de los grupos debe coincidir con el subtotal del período. Por día y
// por vendedor cada orden aparece una sola vez: debe coincidir con el total.
const sumaVentas = groups.reduce((total, grupo) => total + grupo.grossPyg, 0)
const sumaOrdenes = groups.reduce((total, grupo) => total + grupo.orders, 0)
if (groupBy === 'product' || groupBy === 'category') {
  if (sumaVentas !== totals.grossPyg) fallo(`ventas por línea: esperado ${totals.grossPyg}, sumado ${sumaVentas}`)
} else {
  const sumaTotales = groups.reduce((total, grupo) => total + grupo.totalPyg, 0)
  if (sumaTotales !== totals.totalPyg) fallo(`totales por orden: esperado ${totals.totalPyg}, sumado ${sumaTotales}`)
  if (sumaOrdenes !== totals.orders) fallo(`ordenes: esperado ${totals.orders}, sumado ${sumaOrdenes}`)
}

console.log(`reports-http ${groupBy}: PASS (${groups.length} grupos, ${totals.orders} ventas)`)
