// Puente de migración (#241/#253): la implementación y el mapa de glifos viven
// en `owncoding-ui` y acá solo queda la ruta histórica. No volver a
// implementar: el control de duplicados (camposReglas.test.js) lo exige.
export { IconoCategoria as default, GLIFOS_CATEGORIA } from 'owncoding-ui'
