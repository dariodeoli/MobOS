// Puente de migración (#253): el set de íconos vive en `owncoding-ui`
// (`Icon` + `ICONOS`, v0.30.0) y acá solo queda la ruta histórica. No volver a
// implementar: el control de duplicados (camposReglas.test.js) lo exige.
export { Icon as default, ICONOS } from 'owncoding-ui'
