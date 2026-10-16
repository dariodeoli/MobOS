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

## Seguimiento de teclado nativo

- QA nativa ad16 reprodujo Ficha → Datos → Agregar identidad: con teclado numérico solo quedaba visible el encabezado. Capacitor está configurado con Keyboard.resize=body, mientras el Modal es fixed y se alinea al pie del layout viewport.
- Baseline automatizado RED en375/390: reducir solo body/visualViewport a340/400 sin cambiar innerHeight dejaba el borde del diálogo en655/832. No se redujo artificialmente toda la ventana para simular el teclado.
- Fix acotado al editor fiscal: clase propia y observador visualViewport + eventos nativos Will/DidShow/Hide; altura limitada al borde del teclado menos offsetTop y safe areas. Al ocultar/cerrar se recupera la geometría y se eliminan los listeners, incluso un registro nativo que resuelve tarde.
- Se conserva el foco/modal de ownUI y su único cuerpo desplazable. El ajuste solo desplaza ese cuerpo para revelar el campo enfocado; no agrega un segundo contenedor de scroll ni otro focus trap. Header no encoge con teclado.
- Regresión real de componentes con modal anidado: RUC/lupa, Usar estos datos y Guardar caben o se alcanzan mediante el scroll existente; guarda y vuelve a editar después de ocultar teclado.375x667 claro y390x844 oscuro, cero capturas.
- Verificación:55/55 unitarios relacionados; matriz7/7 frontend; comprobación específica375 con espera explícita de data-teclado-visible y geometría estricta3/3. Lint sin errores (warning previo Delivery); build frontend aprobado.
- Discrepancia documentada: la primera corrida posterior al fix falló375 mostrando el borde anterior655; no se capturó entonces el estado CSS/observer y no hay causa exacta demostrada. No se contó esa corrida como aprobación. La reproducción individual, matriz7 y tres repeticiones focalizadas posteriores pasaron; el test ahora espera explícitamente el resize/rAF aplicado antes de exigir geometría, sin relajar límites. La confirmación nativa de la fuente nueva sigue siendo necesaria.

Novedad: el editor fiscal aprovecha el espacio sobre el teclado del iPhone y permite llegar al extractor y Guardar sin cerrar manualmente el teclado.

Nota separada de accesibilidad: al comprobar anidación aparecen dos aria-modal=true declarados por los dos Modal existentes. No se atribuye al observador nuevo ni demuestra dos traps activos. La regresión comprueba que el teclado no agrega diálogos, conserva un solo cuerpo desplazable del editor, Tab queda dentro y Escape cierra solo el editor. La biblioteca externa queda intacta.

## Integración del ajuste de teclado
- Revisión independiente ea09d668: APPROVE, sin hallazgos accionables. Integrado f9e23c2e sobre4c343e90.
- Frontend conjunto:1502/1502 unitarios PASS;7/7 funcionales de identidad fiscal PASS, incluidos375/390 con viewport reducido y foco/scroll/Escape. Lint0errores,1advertencia previa DeliveryOperations.
- Se conserva evidencia previa33/33 RUC+POS; el ajuste nuevo solo modifica geometría del editor fiscal. QA nativa del nuevo ajuste pendiente, sin afirmar TestFlight actualizado.
- Dos aria-modal=true preexistentes registrados en #499. No se cambió biblioteca ownUI ni se afirmó bypass.
