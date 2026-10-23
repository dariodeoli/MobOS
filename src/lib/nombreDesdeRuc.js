// Regla única de nombres desde una consulta de RUC/CI. Vive en
// backend/lib/nombre-desde-ruc.mjs (compartida con el servidor): se reexporta
// acá para que el front la importe como `@/lib/nombreDesdeRuc`.
export { nombreDesdeRuc, nombreCompletoPersona, formatoTitulo, tipoDeContribuyente, esRazonSocialTexto, RUC_EMPRESA_DESDE } from '../../backend/lib/nombre-desde-ruc.mjs'
