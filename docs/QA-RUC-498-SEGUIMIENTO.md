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
