# QA #516 — shell web móvil / iOS simulado

Base: 6f30c8b7; rama codex/paridad-shell516. Comparación de la misma fuente, empresa demo Aurora, Dueño y tema. No usa API real ni datos reales.

## Cambio y causa
- El padding genérico de Modal de `html.app-ios .fixed.inset-0.z-50` colocaba el cobro completo en y=-12 en Chromium390; web y=0. La hoja ya incorpora safe areas internas. El override exclusivo de `.bottom-sheet-fondo` elimina ese padding; no modifica Modal genérico ni Auth.
- Compartir carrito nativo informa «Se abrieron las opciones para compartir.»: el helper atiende también cancelación y no demuestra envío. Fallo nativo explícito; Copiar web conserva su mensaje. Revisión del cableado true/false, sin ejecutar plugins ni añadir tests espejo de textos.

## Evidencia
- 6 casos pareados 360/390/1440, claro/oscuro: cabecera, catálogo, fotografía/icono, controles móviles >=44px, cobro/total y geometría de filas Pedidos; sin overflow horizontal. 1440 iOS es simulación de escritorio, no teléfono físico.
- 4 casos adicionales a390, alturas640/844 y ambos temas, cada uno web+iOS simulado: hoja carrito auto, cobro full, cabecera/cierre/CTA >=44px dentro del viewport, teclado numérico, cambio640↔844, Tab dentro de la hoja y Escape.
- Plataformas/tema se afirman tras la recarga de entrarDemo. iOS se simula interceptando exclusivamente plataforma/arranque/Keychain en el arnés; los componentes y sesión demo son reales. API devuelve503 local; HTTPS externo se aborta.
- Capturas válidas390oscuro en outputs/QA-516-shell; web e iOS simulado tienen SHA256 de56e0fafd9b7232a734ad9335b6afc526c4f840e378d8b2667f654e1723fabd.
- Intento inicial de flag en memoria perdió iOS tras entrarDemo y se descartó como evidencia nativa. La primera corrida extendida falló por seleccionar nombre crudo en lugar de familia; corregido el arnés, 4/4 pasan. No hubo cambio de producto para resolverlo.

## Gates y alcance
- Config dedicada e2e/paridad-shell516.frontend.config.js, puerto5418, forbidOnly, sin retries ni capturas/trace/video automáticos. Spec paridad-shell516.frontend.spec.js.
- Logs: /tmp/mobos-shell516-short-final.log (4/4); /tmp/mobos-shell516-paired-final.log (6/6); /tmp/mobos-shell516-delivery-lint.log; /tmp/mobos-shell516-delivery-build.log.
- Full frontend previo1566/1566 pasó antes del CSS final y de retirar3 tests triviales de texto; no se presenta como full final. El integrador ejecuta gates unidos.
- Diferencias intencionales conservadas: iOS4módulos, Pedidos frente a Ventas, pestañas no disponibles, anti-zoom16px nativo. El desplazamiento vertical de la lista por menos pestañas es legítimo; ancho/alto de fila coinciden.
- Pendiente #516: comprobación de build distribuido de igual SHA, safe areas físicas, teclado software/Share reales, Face ID y VoiceOver. Sin claims de iOS físico/App Store ni cierre completo.

## Novedades para el dueño
- El cobro móvil ocupa correctamente toda la pantalla también en la versión iPhone.
- Compartir muestra un aviso coherente con las opciones de compartir, sin afirmar que el enlace ya se envió.

## Extensión Clientes y Configuración
- 6 pares nuevos360/390/1440 claro/oscuro, cada uno web+iOS simulado, sin nuevas capturas ni cambios de producto. Log /tmp/mobos-shell516-clientes-config-final.log.
- Clientes: ruta, búsqueda por nombre y limpieza, resumen, botón Crear, barra y resumen con igual geometría. Configuración: lista móvil y acceso Mi cuenta, nombre demo Hernán, tarjeta perfil y campo con igual geometría; nombres accesibles, foco de teclado, fuente>=12px, controles medidos>=44px y ningún overflow horizontal.
- La tarjeta Este iPhone existe sólo en iOS, intencionalmente; añade altura total (212px a390) sin cambiar ancho, tarjeta común ni campo. Se afirma presencia/ausencia explícita. El escritorio redirige Configuración a Organización; móvil conserva lista: el recorrido respeta ese contrato.
- No se pulsan Guardar/Crear, permisos, notificaciones ni Face ID; no se acredita funcionamiento de plugins. No se exige igualdad de secciones restringidas ni altura total con bloques específicos de plataforma. No se probaron todos los subapartados de Configuración.
- Primera corrida nueva:6 fallos por exigir misma altura total y ruta sin redirección desktop; se corrigió el oráculo según los contratos explícitos anteriores, sin parche de producto. Segunda6/6PASS; después aserción explícita Este iPhone,6/6PASS final.
