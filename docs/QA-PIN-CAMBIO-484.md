# PIN al cambiar de usuario — #484 / #504

Base main: 2def99308454fbd92b67033e2fad5a2eb26e70da. Rama codex/pin-cambio-usuario-484. Este fix no está incluido en el build1.0(3) ya enviado a Apple.

## Hallazgo y corrección

En el simulador con assets exactos del build3, bloquear→Cambiar de usuario→tocar PIN demo abría teclado numérico del sistema y tapaba el campo. Ambas ramas de PanelVendedor (demo/API) usaban PinInput clásico.

Se usa ahora PinSegmentado compartido: teclado táctil propio en móvil/iOS, input readonly/inputmode none, máscara, borrado y error. Escritorio conserva edición y teclado físico. Las teclas son44×44px; no se modificó el control compartido ni CSS general. La validación sigue en el efecto existente:4/6dígitos según vendedor y una única llamada, con selector/PIN/teclas deshabilitados mientras verifica. Cambiar usuario o cerrar el diálogo borra los dígitos y el error. No se guarda ni registra PIN. La superficie opaca de #493 se conserva.

## Evidencia RED → GREEN

- RED navegador390: falta readonly, inputmode numeric en seller-switch-pin. RED nativo: teclado del sistema visible tapando el campo. Antes hubo dos errores del harness de prueba nuevo (capturaba imports API de Vite y faltaba abrir perfil), corregidos antes de acreditar el RED funcional; no eran fallos de producto.
- GREEN cinco regresiones nuevas:320/375/390, máscara/borrar, limpiar al elegir otro vendedor, error demo, Escape/cerrar/reabrir, escritorio físico y API con6dígitos/una sola petición mientras busy.
- Quince casos relacionados PASS (incluye los cinco nuevos): PIN/login320claro/oscuro, texto ampliado320/390, foco al reanudar, salida nativa sin esperar red, fondo opaco390/1440.
- Full frontend:1522/1522PASS, una ejecución. Lint:0errores y1warning previo DeliveryOperations.jsx42. Build frontend con VITE_PLATFORM=ios y API de producción:exit0. Sin cambios backend/DB y sin suites de servidor.
- Comando dedicado: `MOBOS_QA_PORT=5371 MOBOS_QA_OUT=/tmp/mobos-pin-cambio484-green-all npx playwright test --config e2e/pin-cambio484.frontend.config.js`.
- El spec nuevo tiene configuración frontend propia; el integrador debe incluirlo en sus gates de integración/CI. No se cambió CI compartido.

## Simulador

iPhone18Pro/iOS27, scaffold Debug anterior sinMLKit; assets nuevos de esta rama construidos aparte, SHA256b8c96cbc20bf19145467d7a03e01e29867e1eb7ce3e3cd9c7dae4731d7f89ddf. No se modificaron SOURCE/archive/IPA del build3.

PASS: login→demo→Dueño→Perfil→Bloquear→Cambiar de usuario; teclado propio completo visible. Tocar indicadores no abre teclado del sistema. Ingresar PIN público demo3001 en teclas propias produce «Sesión cambiada» y retorna a Vender. Bloquear→Cerrar sesión→Salir retorna al login. Ambos diálogos siguen ocultando ventas.

Evidencia visual en outputs/QA-PIN-484: cambio-usuario-teclado-sistema.png (antes) y cambio-usuario-teclado-propio.png (después). Sin nueva consulta OwnData ni operación en negocio real. No acredita OAuth, VoiceOver, FaceID, instalación física, cámara o impresión. Sin push/deploy/version/upload; se necesita una compilación posterior para distribuir esta corrección.

## Novedades para el dueño

- Cambiar de usuario usa el teclado propio de MobOS, sin otro teclado tapando el PIN.
- Al elegir otro usuario o cerrar el diálogo, se borran los dígitos anteriores.
- Los datos de ventas siguen ocultos al cambiar usuario o cerrar sesión desde el bloqueo.
