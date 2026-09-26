// Puente de migración (#253): la implementación vive en `owncoding-ui`
// (superconjunto: suma puntaje, condición y repuestos no OEM) y acá solo queda
// la ruta histórica. No volver a implementar: el control lo exige.
export { FichaCertificado as default } from 'owncoding-ui'
