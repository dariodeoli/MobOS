// Puente de migración (#253): la implementación y los helpers viven en
// `owncoding-ui` (docs/CAMPOS.md §2) y acá solo queda la ruta histórica. No
// volver a implementar: el control de duplicados (camposReglas.test.js) lo exige.
export { EmailField as default, DOMINIOS_EMAIL, sugerenciasDe } from 'owncoding-ui'
