// Piezas de formulario compartidas: grillas de campos y pie de acciones.
// Desde #323 viven en `owncoding-ui` y se re-exportan acá para conservar la
// ruta histórica `@/components/shared/formulario`: las pantallas no repiten las
// clases.
import { PIE_ACCIONES_REVERSO as PIE_ACCIONES_REVERSO_BASE } from 'owncoding-ui/utils'

export {
  GRILLA_DOS_COLUMNAS,
  GRILLA_DOS_COLUMNAS_COMPACTA,
  PIE_ACCIONES,
} from 'owncoding-ui/utils'

// Dentro de un Popup, `popup-acciones-cuerpo` pega la fila al borde inferior del
// cuerpo como pie fijo (popup.css); fuera de un Popup no cambia nada.
export const PIE_ACCIONES_REVERSO = `${PIE_ACCIONES_REVERSO_BASE} popup-acciones-cuerpo`
