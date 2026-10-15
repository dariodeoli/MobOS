# RUC en POS y guardado fiscal demo — #498

Unidad de escritura desde77ea29ae, sin backend, base de datos, proveedor real ni capturas. El inventario completo de consumidores está en el mapa de coordinación `work/ruc498-mapa.md`; esta entrega corrige POS cliente/titular y Ficha del cliente.

## Criterios

| Criterio | Resultado |
| --- | --- |
| Fiscal exacto tras consentimiento | PASS: `nameOfficial` conserva espacios, mayúsculas, puntuación y orden. El alias `name` recibe el valor exacto y `displayName` queda separado. No se infiere PERSON ni nombres/apellidos. |
| Cliente/titular POS | PASS: ambos usan la misma aplicación; editar nombre/documento manualmente invalida metadatos anteriores. Buscar/elegir/quitar cliente mantiene sus funciones. |
| Borrador y restauración | PASS: pre-cliente por empresa y carrito suspendido conservan identidad; el titular restaurado no pierde sus metadatos. |
| Payload de pedidos | PASS de frontend: solo claves admitidas; `billingTo` contiene name/document, sin campos nuevos rechazados por la API. El nombre fiscal aceptado se envía sin normalizar/trim. |
| Guardar/reabrir identidad en demo | PASS: alta y edición conservan id, fechas, usos y nombre exacto. Reabrir no depende de referencias mutadas del seed. Duplicados/identidad ajena/inválidos no escriben. |
| Persistencia local | PASS: memoria de `demoStorage` compartida en la pestaña, aislada por empresa+cliente, con `{demo:true}` explícito. No localStorage, API real ni mutaciones de seeds. Conserva al cerrar/navegar/reabrir; recargar/salir reinicia según reglas de demo. |
| Consentimiento y stale | PASS: preview no cambia nombre; Descartar/Cancelar no guarda; cambiar cliente/empresa/contexto cierra editor y descarta respuesta pendiente. No se alteró la admisión privada compartida. |
| Browser funcional | PASS: ficha y POS a390 claro/1440 oscuro; se comprueba clase de tema real. Contexto de sesión demo real, componentes reales, fixture específica sin shell. Cero consultas `/api/ruc` y cero escrituras `/api/customers`. |
| Roles/tenant/piloto | SIN CAMBIOS de backend, permiso o piloto344. El nuevo guardado solo corre en esDemo y su almacenamiento usa empresa+cliente. |
| Otros consumidores/mobile/iOS/TestFlight | FUERA de esta unidad: integrador aporta matriz móvil general y agente nativo su propio informe. Ninguna prueba browser equivale a bundle publicado o iPhone físico. |

## Contrato y límites

- `/api/orders` admite únicamente campos legacy en customer/billingTo. No se envía nameOfficial como clave extra ni se amplía el endpoint. Cliente POS mantiene metadatos exactos en formulario/borrador; el servidor actual limita inline customer.name a200 y hace trim. Persistir la identidad oficial separada en Customer por esa ruta requiere trabajo backend dentro344, no está acreditado aquí. El titular ya usa officialNameInput en el servidor (hasta2000).
- Esta entrega habilita alta/edición fiscal en demo; Usar como actual y Eliminar conservan sus bloqueos demo anteriores. No se amplían otras funciones de la ficha ni permisos.
- Las fixtures usan datos ficticios y API interceptada. No se consultó OwnData ni se verificaron cuentas reales fuera del piloto.

## Verificación

- Unitarios relacionados:52/52, incluyendo contratos fiscales, nombres largos, serialización, preclientes, demoClientes, demoRuc y guardas de consultas.
- Frontend dedicado:5/5, `MOBOS_QA_PORT=5313 npx playwright test -c e2e/ruc498.frontend.config.js`, un worker, sin capturas/DB.
- `npm run lint`:0errores y una advertencia previa en DeliveryOperations. `npm run build`:exit0. Diffcheck y búsqueda de marcadores:sin hallazgos. Sin suites completas repetidas.

## Novedades para el dueño

- El POS conserva tal cual la razón social que aceptás del extractor, tanto para el cliente como para otro titular.
- En la demo podés guardar una identidad fiscal, cerrar la ficha y volver a abrirla para verla o editarla.
- Descartar la sugerencia o cambiar de ficha no aplica ni guarda datos de la consulta anterior.
