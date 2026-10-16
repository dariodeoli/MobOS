# Seguimiento RUC498 — teclado y consumidores

## Reapertura nativa: modo body-only

La QA nativa de ea09d668 NO aprobó el teclado; el PASS browser anterior no lo sustituye. No se confirmó portal/montaje diferido: Modal devuelve markup síncrono y el reproducer body-only mostró el observador montado con data-teclado-visible=false.

El código instalado de Capacitor Keyboard.m cambia document.body.style.height y emite eventos window. Nueva prueba causal mantiene innerHeight/visualViewport intactos y reduce solo body: RED con helper anterior y PASS con observación de style y eventos DOM síncronos. Se elimina el import/registro asíncrono del proxy del plugin; el montaje síncrono del Modal y su ref quedan conservados. Se conserva la altura previa al teclado y se prueba innerHeight ya reducido para no restar dos veces.

Verificación focalizada actual:3 unitarios de teclado y3 geométricos (375/390 y body-only), sin capturas. Los valores internos del runtime nativo no pudieron leerse mediante AX; la hipótesis del mecanismo no se presenta como medición nativa. Requiere nueva QA del bundle de esta fuente.
