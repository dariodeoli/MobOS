# Integración POS 1.0.236

Fuente funcional aprobada: `880ebc1126b649fd1332b7357acc05d19e9862ad`.
Base publicada: `2845521a7234df8b1fe90c09daf8653892d3d40f` (1.0.235).

## Corrección durante la integración

`fff79114` restaura el registro directo de `PasoCobro`: los contenedores del
escritorio quedan fuera de `pos('cobro', ...)`, de modo que el clon móvil recibe
`modoMovil` y el formulario de Otros medios y entrega deja de quedar vacío.
Las reglas de pago, IMEI e identidad permanecen verificadas por las pruebas.

## Validación local

- Frontend: 1598 pruebas unitarias PASS; lint sin errores y un warning previo en
  DeliveryOperations; build PASS.
- Frontend POS/crédito/layout: 34/34 PASS, incluyendo ticket de cinco filas sin
  mini scroll, desplazamiento del documento, acciones alcanzables, USD, pagos,
  crédito y variantes móviles y de escritorio, claras y oscuras.
- Navegación del escritorio y manejadores reales F2: 2/2 PASS.
- Focal POS/API de 69 casos: 65 PASS en la segunda corrida; cuatro casos de
  navegación antigua fallaron (dos móviles de #241 y split/retiro de #173).
  Corregidos y repetidos: los cuatro PASS. No se afirma una única corrida 69/69.
- Extras: cinco contratos fiscales, elección explícita con id de cliente
  persistido, dos cuentas distintas con acceso al canje, IMEI y targets móviles.
  Repetición de 14 casos: 12 PASS; dos etiquetas del menú móvil corregidas;
  repetición final de esos dos casos: 2/2 PASS, incluyendo contraste AA.
- Auditoría de los cuatro shards del CI anterior: cinco casos adicionales de
  venta sin stock (#148§11) adaptados a Cobrar. Sus comprobaciones de stock,
  pedido pendiente, selección de IMEI y unidad vendida se conservan. Focal
  adicional:5/6PASS, caso de500unidades corregido y repetido1/1PASS. El total
  del ticket se distingue de Facturación del día para evitar colisiones de monto.
- La regresión móvil se observó fallando antes y pasando después. Un solo submit
  visible y barra duplicada oculta se verifican dentro de Otros medios.

## Baseline y límites

Sobre frontend 235 limpio se reprodujeron los cuatro fallos previos de densidad,
teléfono, altura inicial y miniatura desktop; sus umbrales no fueron alterados.
Los 34 casos focales excluyen los cinco casos comparados (miniatura móvil pasa).

La cabecera apretada de la cuenta de transferencia móvil también se reproduce
con los mismos datos en 235. Sigue pendiente en [#632](https://github.com/dariodeoli/MobOS/issues/632).
No se presenta esa cabecera como visualmente resuelta en esta versión.

No hubo consultas OwnData ni QA con escrituras de producción. El piloto fiscal
real de #344 sigue abierto. Schema, migraciones y archivos de storage/Docker no
cambian contra 235. La publicación exige CI del PR y de main, procedencia de
build, una única invocación de release:publish y verificación posterior.

Evidencia local completa: `outputs/mobos-236-pos-validation/` en el workspace de
coordinación, con logs de baseline, focal y repeticiones y PNG comparativos.
