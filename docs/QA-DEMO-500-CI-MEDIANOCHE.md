# #500/#451 · Oráculo de conciliación al cambiar el día

Base 4299db63; rama aislada codex/conciliacion-medianoche-500. Cambio exclusivo de pruebas, sin modificar cálculos, semillas, API, negocio real ni candidato229.

## Causa acreditada

El escenario451-5 declara siempre9.900.000+3.050.000+30.000+3.250.000=16.230.000Gs. Esos conteos pertenecen a las semillas del15/10/2026. El historial demo cambia legítimamente con el calendario America/Asuncion. A2026-10-16T03:24Z (00:24PY) los pagos del nuevo día son10.110.000+719.000+30.000+3.250.000=14.109.000Gs; además cambia la cuenta histórica del grupo. Declarar los valores del15 para el16 debe dar Con diferencia: no evidencia un fallo del cálculo.

RED reproducido fijando exactamente2026-10-16T03:24Z antes de entrar: manteniendo el oráculo original falla Verificado/Con diferencia en la misma aserción de CI. Evidencia scratch work/500-red.log. La corrección congela ese escenario al15/10 antes de crear cualquier semilla, conserva el oráculo16.230.000, falta inicial1Gs, motivo obligatorio, estado exactoVerificado y delta0.

## Regresión nueva independiente

Cinco instantes:15/10 23:59:59Z;16/10 00:00Z;16/10 02:59:59Z;16/10 03:00Z;16/10 03:24Z. Navegador UTC, calendario explícito America/Asuncion. Los primeros tres deben conservar el15; los dos últimos usan el16.

El test suma pagos crudos de listVentas por medio/cuenta y fecha convertida con Intl IANA, sin importar ni llamar funciones de conciliación ni copiar montos del panel. Compara con conteos explícitos, exige IDs únicos, declara por nombre de cuenta, conserva assertion exacta Verificado y compara JSON completo de ventas antes/después. Crédito de tienda no se trata como dinero recibido. La etiqueta correcta de la cuenta del15 es Ueno · Caja de ahorro (3050000), según el seed canónico; una transcripción inicial como Tarjeta se corrigió sin modificar ningún monto.

## Evidencia y límites de ejecución

Servidor propio5366, un worker; todas las rutas API y HTTPS externas bloqueadas por el arnés existente. Sin DB/prod/capturas ni suites globales. Configuración scratch replica demo461.frontend.config.js, variando solo puerto/output.

PASS acreditado: bordes16/10 03:00 y03:24, cada uno14.109.000Gs, estadoVerificado y ventas idénticas/delta0. Primera pasada de6casos tuvo navegación/carga de shell agotada antes de negocio en algunos casos, más el error de transcripción de cuenta señalado arriba; no se relajaron asserts.

El integrador ordenó detener la corrida13 por carga extrema (loadaverage380); al enviar Ctrl-C la sesión ya había terminado exit1 y su servidor propio ya estaba cerrado. Resultado real6PASS/7FAIL:4timeouts de arranque antes del negocio y3bordes15 ejecutados con la etiqueta de cuenta antigua capturada al inicio de la corrida. El diff final ya corrige esa etiqueta a Caja de ahorro, sin cambiar montos, pero esos3casos requieren retest en CI. Sí quedó GREENbrowser del original15:16.230.000Gs, diferencia inicial-1, Verificado final y delta0 (30.4s). También PASS ambos bordes16, historial y otros2recorridos. No se declara13PASS ni se cambiaron tiempos/aserciones. No se diagnostican los timeouts como bug; no se hicieron nuevos retries. El integrador completará la matriz en CI remoto antes de merge; el diff test-only recibió revisión independiente sin hallazgos.

## Novedades para el dueño

- La prueba de conciliación declara importes correspondientes al día que está verificando.
- Los bordes UTC y medianoche de Paraguay quedan cubiertos con conteos independientes, sin alterar cobros ni las semillas de la demo.

## Revalidación del integrador
Después de bajar la carga y con la etiqueta final correcta, el integrador ejecutó únicamente los seis escenarios afectados en su árbol unido: original451-5 más cinco bordes UTC/PY. **6/6PASS**, puerto5345, salidaúnica /tmp/mobos-demo500-final-artifacts, log /tmp/mobos-demo500-root-final.log. Acreditados16.230.000 para15 y14.109.000 para16, Verificado y ventas sin cambios en todos los bordes; la corrida anterior6/7fallida se conserva como historial, ya no quedan esos tres casos sin revalidación local. CI completo del nuevo SHA sigue siendo obligatorio. QA independiente estática APPROVE exacto29e9b99a/cherryeb61d6fd.
