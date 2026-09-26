# #185 — Recorrido funcional de **Finanzas** en producción · v1.0.178

- **Issue:** #185 (recorrido funcional por módulos) · **Módulo:** Finanzas
- **Versión:** producción **v1.0.178** · **Fecha:** 2026-09-26 (post-.178)
- **Método:** `QA_BASE_URL=https://app.moboss.online QA_OUT=docs/qa/185/produccion-1.0.178 node scripts/qa-185-finanzas-demo.mjs`
- **Resultado:** **16/16 pasos OK** · 25 capturas · **0 errores de consola** ·
  **0 respuestas API ≥ 400** · **0 pedidos fallidos**.

## Pasos verificados (todos en verde)

Los 16 pasos del recorrido (demo → bancos → medios → conciliación → caja →
seguro → resumen/ganancias), con capturas `01-…` a `25-…` y `resultados.json`
en esta carpeta.

## Corrección de la sonda en esta corrida

El paso del **seguro** quedaba vacuo: iba a `/configuracion/negocio`, que con
el IA (#253) redirige a **Organización**, y al no encontrar el toggle pasaba
sin verificar nada (captura `21-seguro-config` mostrando Organización).

- Ahora entra a **`/configuracion/comercial`**, exige `#seguro-toggle` visible
  (falla si no está), comprueba la ayuda **«Costo real = costo + seguro»** y el
  guardado en demo.
- Detalle de la corrida: `sección visible: 1 · toggle: sí · % propuesto: "25" ·
  ayuda de fórmula: 1 · guardar en demo → Modo demo: datos ficticios, no se
  guardan y se descartan al recargar`.
- Captura corregida: `21-seguro-config.jpg` (Configuración → Comercial, con el
  menú vertical del kit y el grupo completo).
