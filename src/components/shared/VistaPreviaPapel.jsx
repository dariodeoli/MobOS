// Puente de migración (#241/#253): la implementación y el mapa de anchos viven
// en `owncoding-ui` y acá solo queda la ruta histórica. No volver a
// implementar: el control de duplicados (camposReglas.test.js) lo exige.
export { VistaPreviaPapel as default, ANCHOS_PAPEL } from 'owncoding-ui'
