# Seguimiento RUC498 — teclado y consumidores

## Reapertura nativa: modo body-only

La QA nativa de ea09d668 NO aprobó el teclado; el PASS browser anterior no lo sustituye. No se confirmó portal/montaje diferido: Modal devuelve markup síncrono y el reproducer body-only mostró el observador montado con data-teclado-visible=false.

El código instalado de Capacitor Keyboard.m cambia document.body.style.height y emite eventos window. Nueva prueba causal mantiene innerHeight/visualViewport intactos y reduce solo body: RED con helper anterior y PASS con observación de style y eventos DOM síncronos. Se elimina el import/registro asíncrono del proxy del plugin; el montaje síncrono del Modal y su ref quedan conservados. Se conserva la altura previa al teclado y se prueba innerHeight ya reducido para no restar dos veces.

Verificación focalizada actual:3 unitarios de teclado y3 geométricos (375/390 y body-only), sin capturas. Los valores internos del runtime nativo no pudieron leerse mediante AX; la hipótesis del mecanismo no se presenta como medición nativa. Requiere nueva QA del bundle de esta fuente.

## Dos consumidores pendientes

- Datos de la tienda: guardar demo usa memoria explícita por empresa, aplica onExito y vuelve a lectura; reabrir recupera nombre/RUC/contacto. Nombre fiscal raw queda separado del nombre público con su contrato existente; cambiar RUC manual invalida ese metadato. No se alteró /api/account ni la reautenticación real.
- Titular privado: aceptar el resultado conserva nameOfficial exacto y vacía las cinco partes previas. No se llama partesConocidas ni se clasifica PERSON: la persona completa y confirma nombres/apellidos; Guardar valida esa revisión. El nombre fiscal se muestra separado y persiste en la demo, aislado por empresa. Los payloads reales siguen limitados a campos del contrato existente, sin esquema/backend nuevo.
- Demo de datos privados: opciones aditivas de empresa/demo en accountParties, con memoria explícita; los consumidores existentes mantienen su firma/default para la demo única mobos-demo. No se modificaron permisos ni módulos iOS. Persistencia fiscal separada en backend real sigue fuera de esta entrega/#344.
- Regresiones: aplicar no pisa antes del consentimiento, guardar/reabrir cuenta; editar titular con cinco partes antiguas, aceptar nombre nuevo/ambiguo, partes vacías, revisión obligatoria y reapertura sin restos. Pruebas390 claro/1440 oscuro.

Cambio posterior de instrucción: Dario autorizó consulta REAL OwnData en demo. Este commit termina los dos consumidores y no implementa todavía ese transporte; el integrador definirá credenciales/rate limits. Los logs de cero consultas RUC anteriores acreditan la simulación bajo el alcance previo, no una exigencia futura. Los nuevos tests de Configuración solo exigen cero escrituras de negocio; no fijan cero /api/ruc como contrato futuro.

## Evidencia final de esta unidad

- QA nativa b5b604ac: PASS formulario sobre teclado, RUC/lupa, extraer, consentimiento, exacto fiscal, reenfocar/Guardar y guardado demo. Cero capturas nuevas. Informe externo del agente: outputs/QA-RUC-498/QA-b5b6.md. Hash idéntico dist/scaffold/App.app/public:2a0d475d99a2c972fde0b15b0b0dd78059c45c1878482dc40399d0bc4e83d465. Edición de tabla y POS no acreditados por ese recorrido nativo.
- Unitarios relacionados:71/71. Frontend propio:12/12; tras añadir comprobación de aislamiento por empresa y conservar fiscal raw, los4 de Configuración pasan4/4. Tema390 claro/1440 oscuro. Cero escrituras de negocio en los nuevos ensayos.
- Lint:0errores, una advertencia previa de DeliveryOperations. Build frontend:exit0. Sin suite completa, DB/env/cuentas reales ni cambios al proveedor/piloto/backend.

## Novedades para el dueño
- La edición fiscal se mantiene por encima del teclado del iPhone y permite completar el guardado.
- Los datos de la tienda se pueden guardar y volver a abrir en la demo.
- Al aceptar un RUC para un titular, los nombres viejos se limpian y revisás las partes antes de guardar.

## Revisión P2 posterior a b8097867
- PaymentAccounts ahora pasa explícitamente demo y empresaId de la sesión a ambas búsquedas de accountParties. DatosPrivados ya propaga ese mismo contexto en todas sus lecturas y escrituras; búsqueda dirigida confirmó que no quedan consumidores sin contexto. Se conserva el desmontaje por empresa y la cancelación de lecturas previas.
- Regresiones funcionales: crear titular y empresa ficticios en empresa-qa-498 (distinta de mobos-demo), abrir Cuentas, seleccionar la entidad registrada, guardar y reabrir la cuenta; se comprueba holderId/companyId correcto y ausencia de entidades en la otra empresa. Baseline titular rojo con «Sin resultados para esa búsqueda»; ambos verdes tras el fix.
- Editar manualmente el nombre comercial invalida nameOfficial igual que editar RUC. Baseline rojo: después de guardar «Nombre manual QA» persistía «SERVICIOS DEL ESTE S.R.L.» como fiscal; ahora guardar/reabrir conserva el nombre manual sin metadato fiscal obsoleto.
- Alcance real / #344: el nombre fiscal raw se conserva en estado frontend donde corresponde; los payloads reales siguen la whitelist actual. No existe nueva persistencia DB separada de nameOfficial para account/holders por este cambio. El endpoint inline orders mantiene su límite name≤200/trim y no admite nameOfficial separado; no se trunca ni normaliza en frontend para disimular esa limitación. Esto no acredita cumplimiento fiscal universal real.
- Cambio de alcance autorizado: la futura consulta demo real OwnData la implementa el integrador con su backend; este seguimiento no añade transporte ni credenciales. Las nuevas pruebas aíslan red y exigen cero escrituras de negocio, sin imponer una prohibición futura de consultas RUC.
- Verificación del ajuste: 7/7 navegador (cuenta y titular 390 claro/1440 oscuro, dos vinculaciones con guardar/reabrir y edición manual), 18/18 unitarios relacionados, lint sin errores (1 advertencia previa DeliveryOperations), build frontend correcto. Sin suite completa, DB ni capturas. Logs en /tmp/ruc498-{scope-baseline,name-baseline,config-final,review-unit,review-lint,review-build}.log.

## Fase #498: consulta real pública en demo (expectativas actualizadas)
- El pedido explícito posterior reemplaza la simulación de RUC: se conserva como evidencia histórica lo registrado en los bloques anteriores, no como expectativa vigente. Transporte del integrador f36e4f08 incorporado aquí como af50ab23, sin editar sus tres fuentes; copy b822c95b incorporada como 79c22675. No se modifica el piloto privado /api/ruc, permisos, credenciales ni módulos iOS.
- Mock común e2e/helpers/ruc-public.js: solo GET /api/public/ruc?ruc=… con query/result/source/reviewRequired mínimo y datos ficticios QA. Contabiliza HTTP y HTTPS antes del bloqueo de terceros; mantiene bloqueada toda API privada/escritura de negocio y conserva únicamente la excepción previa de métricas. Comprueba que no viajan cookie/Bearer/cuerpo, incluso con cookie QA presente.
- Cinco grupos adaptados: ruc-demo (CI general, 4), ruc-mobile (7), ruc498-config (7), ruc498-consumidores (6), ruc498-identidad (8 previos + 3 nuevos). Consulta y consentimiento ya no exigen «Simulada en demo» ni cero consultas API; sí ausencia de esa etiqueta, datos oficiales admitidos y ninguna escritura de negocio. Las aserciones de guardado/reapertura, IDs, revisión manual, 44px, temas y geometría de teclado se conservan.
- Las carreras de móvil/cambio de ficha usan respuestas HTTP deliberadamente retenidas y liberadas después de cambiar input/contexto, sin depender del antiguo temporizador de simulación. La carga pendiente tiene botón disabled y aria-busy=true. Casos nuevos 429/503 muestran error (incluido Retry-After), no ofrecen resultado ficticio y permiten completar/guardar/reabrir manualmente; respuesta 200 sin evidencia fiscal verificable tampoco aplica datos.
- 35/35 navegador PASS en una matriz relacionada (55,1s, puerto5313, un worker). Tras traer copy actual del integrador se verificaron solo los 3 casos afectados: 3/3 PASS, explicación OwnData real y ausencia de «RUC simulado» incluidas. 27/27 unitarios relacionados PASS (camposReglas, rucLookup, rucDemoRequest); lint del test modificado y diff-check PASS. Logs /tmp/ruc498-real-{browser,unit}.log y /tmp/ruc498-copy-loading.log.
- Límite: ejecución offline con interceptores de red. No prueba el proveedor real, su disponibilidad, cuotas o despliegue del backend público. No hubo red OwnData, DB, entorno productivo, capturas, suite completa, publicación ni nuevas escrituras reales. La persistencia oficial real separada y límite inline orders de #344 siguen pendientes según bloque anterior.
- Para reproducir sin backend/DB: MOBOS_QA_PORT=5313 npx playwright test --config=e2e/ruc-public.frontend.config.js --workers=1. Este config local no modifica el combo/CI del integrador. Los informes previos de consumidores simulados son históricos; los mismos flujos actuales ya se ejecutaron contra el contrato público mock.
