// Puente de migración (#253): la implementación vive en `owncoding-ui` y acá
// solo queda la ruta histórica. No volver a implementar: el control de
// duplicados (camposReglas.test.js) lo exige.
export { ProductCombobox as default } from 'owncoding-ui'
