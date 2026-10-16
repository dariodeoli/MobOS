# #350 — contactos, perfiles y marca de Aurora

Base: main2def99308454fbd92b67033e2fad5a2eb26e70da, rama codex/demo-perfiles-350. Unidad de datos ficticios de la demo; sin API/backend, permisos, OAuth, impresión507 ni controlesPIN.

## Criterios de esta unidad
- PASS: los7integrantes conservan IDs/PIN/correo/metas existentes y tienen teléfono ficticio válido, sucursal y role coherente con rol. Miembros muestra teléfono, Casa Central, rol, Avatar existente, meta y comisión derivada de ventas. No se inventa tasa de comisión de User ni se modifica un importe.
- PASS: Aurora y sus3sucursales conservan identidad/contactos anteriores; se completan ciudad/departamento/red y contactos de sucursal. getDemoTenant proporciona los datos de Aurora al formulario real de Configuración y deja prevalecer los ajustes guardados. IdentidadCuenta recibe el correo ficticio sin afectar el guardado fiscal existente.
- PASS: dos marcas vectoriales locales transparentes para claro/oscuro mediante getLogoDataUrl compartido; Configuración muestra las dos con imagen cargada. No cambia branding de empresa real, fuentes privadas ni proyección de documentos. Cargar/quitar logo remoto permanece deshabilitado en demo con explicación.
- PASS: completarEquipoDemo es idempotente y no pisa nombre/contacto/meta0/estado/rol de una ficha ya editada ni borra integrantes agregados al reaplicar el seed en la misma sesión. No introduce persistencia: #204 mantiene demo solo en memoria y recargar documento reinicia sus datos.
- PASS: las24identidades originales y las60unidades, costos/estados/fechas/importes/historia se conservan; no se toca generador de inventario, catálogo ni ventas. La prueba hash de24campos comerciales y coherencia financiera existente sigue pasando.

## Verificación
- npmci sin audit:exit0;469paquetes. No auditfix ni cambios de manifiesto/lock.
- node--test perfiles350/demoInventory/demoTenant/demoBarrido/coherencia/datosConsistentes/historial120/identidadCuenta:53/53PASS.
- npmtest:1526/1526PASS, una sola ejecución completa.
- Chromium demo350:4/4PASS a390/1440, claro/oscuro; UI Miembros y correo del formulario, marca cargada y contraste del texto≥4,5 sobre los fondos reales, sin overflow horizontal. Edición de nombre por UI→reaplicar semilla conserva el cambio. Sin capturas ni DB.
- Harness: puerto5370, salida/tmp/mobos-demo350-results, forbidOnlyenCI, screenshot/trace/videooff. BloqueaHTTPS y todos/api antes de red. Solo se observó trackingpúblico/api/public/track interceptado; CEROendpointsprivados/logo remoto/OwnData y ninguna escritura real. Esto no acredita proveedorRUC ni servidor real.
- Corridas iniciales detectaron selectorCorreo equivocado y supuesto incorrecto de persistencia trasreload; se corrigió el arnés a Correo de laempresa y al contrato #204, conservando la aserción de edición y todos los controles de red. No se cambió persistencia para pasar.
- npmrunlint:0errores,1warning previo DeliveryOperations.jsx. npmrunbuild:exit0, advertencia de chunks previa. gitdiff--check:PASS. No backend/fullDB/nativo/impresora ni despliegue.

## #350 sigue PARCIAL
- Pendientes explícitos de sus comentarios14/10: varias empresas seleccionables/aisladas, stock Samsung/Xiaomi/iPhone11–17 adicional sin alterar Aurora, y revisión de todas las pantallas sin datos faltantes. No equivale al alcance global de todas las acciones#451.
- Propuesta para próxima unidad, sin implementar: catálogo de escenarios keyedpor empresa; Aurora sigue namespace/seedactual y su historial intacto; otra empresa usa IDs/namespace propios, catálogo multimarcas y ventas/pagos coherentes separados. Selector solo en demo llama transición que vacía consultas/estado y actualiza impresión/sucursal; nunca concede canManageCompanies ni cambia el flujo real. Confirmar contrato antes de datos masivos.
- Bancos ya tienen componente/catálogo compartido: no se sustituyen por logos decorativos. Proveedores conservan icono/color/contacto; logos de proveedores y evaluación completa de marca quedan pendientes del siguiente cotejo, sin afirmar cumplimiento universal.

## Novedades para el dueño
- Las fichas del equipo de la demo muestran teléfono y sucursal, con el rol correcto y sus metas y comisiones existentes.
- Los datos de contacto de Aurora aparecen en Configuración y se pueden revisar en el formulario habitual.
- La demo muestra una marca propia legible en ambos temas, sin depender de imágenes externas.
- Volver a preparar los datos dentro de la misma demostración conserva las fichas que editaste; recargar la página sigue reiniciando la demo.
