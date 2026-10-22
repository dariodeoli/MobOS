// Impresión Pro: ¿el módulo está activo?
//
// Mientras no exista el helper único de módulos (`moduloActivo`, rama
// codex/modulos-base), este adaptador mínimo lee el estado de la empresa. Cuando
// ese helper llegue basta con reemplazar `moduloActivoImpresionPro` por
// `moduloActivo(state, MODULO_IMPRESION_PRO, { esDemo })`: nada más depende de
// cómo se calcula.
//
// Reglas del plan:
// - demo = activo (la galería se ve completa);
// - cuentas = activo por defecto (sin dato guardado no se le quita nada a nadie);
// - apagado a mano = se imprime el premium normal; las plantillas guardadas y los
//   predeterminados se conservan, solo se ignoran.
export const MODULO_IMPRESION_PRO = 'impresion-pro'

/** `state` = `state` de GET /api/tenant/modules (o null si todavía no hay). */
export function moduloActivoImpresionPro(state, { esDemo = false } = {}) {
  if (esDemo) return true
  return state?.modules?.[MODULO_IMPRESION_PRO]?.enabled !== false
}
