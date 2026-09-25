// Puente de migración (#253): el objeto vive en la biblioteca compartida
// (`owncoding-ui`, docs/REGLAS.md §11) y acá solo se conserva la ruta histórica
// `@/components/shared/PanelDerecho` para no tocar a los consumidores. El
// control de duplicación (`src/lib/camposReglas.test.js`) exige que este
// archivo no vuelva a tener implementación propia.
export { PanelDerecho as default } from 'owncoding-ui'
