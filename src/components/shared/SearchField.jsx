// Puente de migración (#241/#253): la implementación vive en `owncoding-ui`
// (docs/REGLAS.md §11) y acá solo queda la ruta histórica. No volver a
// implementar: el control de duplicados (camposReglas.test.js) lo exige.
export { SearchField as default } from 'owncoding-ui'
