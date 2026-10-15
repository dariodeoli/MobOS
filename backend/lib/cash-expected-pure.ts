// Fórmula única del efectivo esperado (#461), sin Prisma para poder probarla aislada.
//   esperado = apertura + (cobros en efectivo − reembolsos en efectivo) + (ingresos − egresos de caja)
// Es el neto CON SIGNO: no se recorta en cero (un esperado negativo es una señal real: se retiró
// más de lo que había). La demo (src/lib/demoCash.js) replica esta misma suma.
export const esperadoCaja = (aperturaPyg: number, movilPyg: number) => Number(aperturaPyg) + Number(movilPyg)
