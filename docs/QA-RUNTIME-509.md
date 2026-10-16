# #509 — contexto validado al recargar y consultas de cuenta personal

## Causa y corrección
- Reproducción RED en `fd1135c9`, PG aislado5577/API3195/web5359: `pos-pedidos.spec.js:11` mostraba filas y, al recargar, quedaba vacío. El trace CI confirma `/api/auth/tenants`401 («sin cuenta vinculada») después de una sesión de vendedor válida. `useCambioEmpresa` consultaba ese endpoint siempre al montar AppShell; #502 retiraba correctamente los datos privados al recibir ese401.
- `/api/auth/me` ahora agrega `user.canManageCompanies`, booleano calculado con `requireAccountContext` y coincidencia del principal/tenant actuales. Una sesión compartida de tienda no se presenta como cuenta personal. Se conserva el401 del endpoint de empresas sin excepciones en el cliente.
- La sesión React normaliza la capacidad estrictamente (`=== true`). El selector consulta empresas solo con esa capacidad, reacciona también al cambio de usuario y conserva el aviso de ingresar con el perfil vinculado. Falta/cadena/número/null no habilitan consultas.
- Segunda causa confirmada: `precargarAvatar` se iniciaba antes de `setContexto`. La revisión de consultas de #502 descartaba esa respuesta al activar el contexto; la caché quedaba sin revalidación. La precarga ahora empieza después de validar el contexto y de comprobar que la activación sigue vigente.

## Evidencia aislada
- Pedidos original: RED antes y GREEN después contra API/PG reales, sin cambiar sus assertions.
- Corrida relacionada inicial: delivery, checkout dividido, Pedidos reload, selector IMEI y las dos pruebas de Notificaciones PASS. Una prueba nueva de contrato falló inicialmente por faltar Origin en su request Node; se corrigió la fixture, no la autenticación.
- Tres regresiones nuevas PASS: vendedor sin cuenta y reload (cero requests de empresas); DTO malformado string/número/null sin habilitación; revocación REAL en servidor401 que retira productos/pedidos, no recupera snapshot al quedar offline y mantiene la cola/idempotencia.
- La tercera prueba nueva ejecuta `auth-context509.mjs` con PostgreSQL real:8 comprobaciones de capacidad false sin cuenta, denegación401 intacta, true con pertenencia válida, listado solo de sus dos empresas, false para perfil ajeno con mismo rol/cuenta, true para miembro VENDEDOR vinculado y revocación real401. Limpia únicamente sus tenants/cuentas sintéticos.
- Avatar271 reload y avatar284 revalidación: ambos RED antes del reordenamiento,2/2 PASS después con API/PG reales, sin tocar assertions/selectores de esas specs.
- Negativos #502:2/2 Chromium PASS sin cambios de sus pruebas. Unitarios relacionados avatar/snapshot/cola:48/48 PASS después del último cambio.
- Full FE1522/1522 y BE332PASS+1skip previo antes del reordenamiento final de avatar; el integrador ejecuta gates del árbol unido. Lint final0errores/1warning previo DeliveryOperations; build FE finalPASS. Build BE finalPASS con `.next/BUILD_ID` creado y Prisma validatePASS.
- El harness nuevo se invoca desde la prueba E2E relacionada y desde `integration-http.sh`; exige base loopback de prueba (`mobos_it`, `mobos_e2e*` o `mobos_runtime_509`) y no lee `.env` ni secretos. Ninguna escritura de negocio real/producción.

## Mapa de fallos CI38839012933
| Grupo | Estado de esta unidad |
| --- | --- |
| Pedidos lista/reload, comprobantes, cronología, notas; responsive Pedidos | Recarga original corregida; resto comparte la carga vacía, pendiente retest unido del integrador. |
| POS checkout/búsqueda/precio/IMEI/offline/correo | Checkout dividido y selector IMEI GREEN; otros recorridos pendientes de retest unido. No se bajaron aserciones de dinero/stock. |
| Delivery/repartidor y matriz de roles | Flujo real de reparto GREEN; matriz completa pendiente de retest. |
| Menciones/notificaciones | Dos sanity checks de Notificaciones GREEN; la mención original queda para el subset unido. |
| Avatar271/284 | Ambos reproducidos y corregidos,2/2 GREEN. |
| Redirección protegida | Compatible con nuevo contexto; no ejecutada aquí, no se afirma resuelta sin retest. |
| Demo328, demo-anónimo333 y heading informe240 | Cambios separados del integrador; no se tocaron aquí ni se atribuyen a #509. |

## Límites y novedades
- No se modificaron `auth.ts`, permisos de negocio, invalidación401/402/403, snapshot, cola, CI, versión ni publicación. Las capacidades son información para UI; cada endpoint mantiene su autorización del servidor.
- El usuario conserva Pedidos/POS al recargar una sesión válida sin cuenta personal vinculada.
- Las fotos vuelven a cargar y revalidar después de recuperar la sesión; una sesión revocada sigue retirando datos privados y conserva ventas pendientes.
