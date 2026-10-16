# Validacion integrada de 1.0.231

Preparacion local; aun no es una publicacion. Base de 230: `0331b606`, cuyo CI fallo y cuyo merge permanece detenido. Antes de entregar 231 se debe incorporar el arreglo revisado de 230 y actualizar la base al main protegido, sin resolver conflictos silenciosamente.

## Cambios

- #403: marca en garantia y remito publicos, con resolucion segura y proteccion contra respuestas tardias.
- #396: tipografia y contraste de controles pequenos en movil/escritorio.
- #515: invalidacion inmediata de fotos privadas al cambiar empresa, sesion, sucursal o permisos; conserva la deduplicacion de solicitudes validas.
- #404: encuadre explicito por foto y derivados servidor WebP800/160 desde la misma imagen validada. Perfil mantiene su contrato anterior.

## Gates de la composicion

Ejecutados con runtime combinado de `3d8515f5`; `f7d09f04` posterior agrega solamente tests/config/docs de integracion de fotos.

- Frontend: 1563/1563 PASS.
- Backend: 332 PASS, un salto SQL condicional previo.
- Lint: exit0; se conserva advertencia previa, no errores.
- Builds frontend y backend: exit0. BUILD_ID backend `rilC8XsDuaqRoSMkV4XCk` presente.
- Prisma validate: PASS.
- Integracion HTTP completa: exit0, cluster propio descartable y limpieza completa; incluye migraciones, conciliacion de esquema, auth/tenant, imagenes, pedidos, pagos, reportes, cola y portal. Ninguna consulta OwnData real.
- El primer intento de unitarios backend encontro cliente Prisma no generado tras npmci local; se genero y se repitio la suite completa con resultado verde. No se modifico codigo para eludirlo.
- Browser de composicion: marca publica10, responsive12, privacidad de fotos13 PASS. Recorte19 y derivados51 HTTP por autores con revisiones independientes APPROVE.
- Nueva integracion real de fotos: dos recorridos Next/PostgreSQL y uno de perfil PASS; ver `QA-FOTOS-404-INTEGRACION.md`.

Logs en carpeta de coordinacion `work/release231-full-*`, `release231-public-brand403.log`, `release231-responsive396.log` y `release231-images515.log`.

### Registro de las nuevas pruebas integradas

La corrida completa anterior fue previa a agregar `fotos-producto.spec.js`. Al componer la nueva prueba, ciHarness detecto que faltaba asignarla a un shard. Ademas su importacion inmediata de Sharp dependia de instalar backend/node_modules, algo que el job Frontend no hace. Se conserva el fallo: `release231-ciHarness-red.log` (4/5, archivo sin asignar), mas el fallo root-only observado por los autores de las unidades siguientes. No se cuenta instalar backend como arreglo del job Frontend.

Se asigna exclusivamente el nuevo spec al shard4, que tenia la menor carga calculada; se preservan todos los demas archivos y el limite de balance. Sharp se carga solo dentro de la ejecucion de los helpers de imagen, conservando los oraculos reales de pixeles. `release231-ciHarness-green.log`: 5/5 PASS. La misma prueba con un hook que rechaza cualquier carga de Sharp durante el listado tambien pasa (`release231-ciHarness-root-only-green.log`). Los siguientes cambios de producto deben acreditar su composicion final antes de publicar; estos resultados no son CI remoto.

## Limites

Faltan rebase final, CI protegido, merge, deploy y nuevo build nativo. No se afirma cierre completo de #403/#404 ni pruebas fisicas de camara, impresoras, OAuth o VoiceOver. TestFlight1.0(3) conserva la publicacion anterior verificada229.

## Composicion final ampliada antes del PR

Se incorporaron dos unidades del reporte original despues de su revision cruzada, antes de publicar el PR de 231: `b7f372a6` comprobante rapido de Vendidos y `6f30c8b7` fotos en resumen de cotizacion/ficha protegida. No se modifico el candidato230 ni se considero publicado este trabajo. Se agrupan para evitar distribuir otro build con ese camino de comprobante todavia antiguo. Ver `QA-COMPROBANTE-RAPIDO-513.md` y `QA-PRODUCT-CONSUMERS-404.md`.

Root repitio la composicion final: frontend1563/1563, backend332PASS+1skip condicional, lint0errores, buildsFE/BE0 y Prisma0. Integracion HTTP completa exit0, limpieza de cluster/servidor propios, BUILD_ID `z13b75lUHaNGkJu5b3i7G`. Browser nuevos sobre el arbol combinado: consumers19/19 y QuickReceipt9/9 PASS. Logs `work/release231-composed-final-*`. Fuente de producto congelada en `6f30c8b7`; cambios posteriores de este cierre son workflow/notas/documentacion.

El nuevo pedido #516 (paridad visual webmovil/iOS) se audita en otras ramas. No se atribuye a 231 ningun cambio aun no revisado de esa tarea.

## Novedades para el dueño

- Se puede elegir el encuadre de cada foto antes de subirla y cancelar sin cargar archivos.
- Foto y miniatura guardadas conservan el mismo encuadre.
- Las fotos privadas se ocultan al cambiar de sesion, empresa o permisos.
- Garantias y remitos muestran la marca correspondiente; mejoran textos pequenos y contraste.
