// Puente de migración (#253): la implementación vive en `owncoding-ui`
// (con el alto táctil de 44 px de #249) y acá solo queda la ruta histórica.
// No volver a implementar: el control de duplicados lo exige.
export { ListGridToggle as default } from 'owncoding-ui'
