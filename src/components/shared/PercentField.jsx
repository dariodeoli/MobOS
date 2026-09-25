// Puente de migración (#241/#253): la implementación y los helpers viven en
// `owncoding-ui` (docs/CAMPOS.md §2) y acá solo queda la ruta histórica. No
// volver a implementar: el control de duplicados (camposReglas.test.js) lo exige.
export { PercentField as default, parsePercent, formatPercent, limpiarPercent } from 'owncoding-ui'
