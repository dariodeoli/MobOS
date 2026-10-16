# #350-A — infraestructura de contexto demo cerrado

Base local aprobada b0d834a5, rama codex/demo-scope-350. No selector visible, segunda empresa operable, nuevos datos/catálogos, sesión/OAuth, impresión/agent/templates, backend ni permisos del API. #350 continúa PARCIAL.

## Contrato implementado

- `demo/contexto.js`: fábrica pura con registro cerrado y tokens congelados por identidad/revisión; empresa/sucursal/usuario cambian token. A→B→A no reactiva el token del primerA. Instancia usada por la app registra SOLOmobos-demo; Horizonte/IDs arbitrarios se rechazan antes de alterar contexto/cache. La fábrica A/B de tests no se instala como escenario en la app.
- `demo/memoria.js`: almacén de claves por empresa y cache de colecciones clonadas, exclusivamente Map en memoria. Un token/fachada viejo no puede leer/escribir/borrar; guardar snapshot viejo no modifica el nuevo. Leer un snapshot devuelve copia para no compartir referencias mutables.
- `demoStorage`: contrato getItem/setItem/removeItem y delegación fuera de demo preservados. En demo usa namespace de empresa; `opciones.contexto` permite pasar token capturado antes de await. Limpiar memoria invalida también fachadas retenidas. No añade localStorage/IDB ni persistencia a la demo.
- `storage.setContexto`: rama demo guarda/restaura su cache local ENMEMORIA antes/después de cambiar usuario/sucursal; si cambian solo rol/permisos/fuente retira igualmente el token anterior. Contexto vacío limpia memoria/cache demo. Aurora mantiene todos sus IDs/60unidades/importes/fechas; prepararDatosDemo y oráculos existentes siguen iguales.
- La rama real API502 conserva su invalidación e hidratación previas. Solo se evita llamar invalidarSnapshotsPrivados desde una transición demo: el navegador demostró que ese llamado abría IDB privada aunque la demostración debía permanecer en memoria.

## Verificación y límites precisos

-67/67unitarios relacionados: nueva fábrica/contexto/cache, demoStorage, inventario/perfiles/coherencia/datosConsistentes/historial120, snapshot y requestCache. Incluye hash original de24unidades y seed60, mismas claves/IDs enA/B, borradoBsinA, A→B→A con promesa diferida, copias independientes, reset que no permite repoblar mediante fachada vieja y cero acceso a localStorage/IDB en fábrica.
-1/1Chromium en navegador real con módulos de la app: acceso normal demoDueño→Miembros→edición de nombre porUI; harness invoca storage.setContexto para variar usuario/sucursal/permisos y volverAurora. Conserva nombre editado y JSONcatálogo idéntico; tokens antiguos no escriben; Horizonte rechazado, sin alterar empresa actual. Después reload restaura nombre del seed, como exige#204. No se presenta como selector multiempresa ni sesión autenticada de segunda empresa.
-RED navegador antes del guard!isDemoRuntime: IndexedDB.open>0 al cambiar contexto demo. GREEN después:0aperturasIDBprivada y0cambioslocalStorage durante esas transiciones. Trackingpúblico/api/public/track está interceptado503; cero peticiones privadas/OwnData y HTTPSexterno abortado. No existe DBservidor ni dato real en esta prueba.
-FullFE una sola ejecución:1555/1555PASS; se ejecutó antes del último refuerzo de revisión por cambios solo de rol/permisos, del helperpermite del registro y de1testnuevo de reset. Los67unitarios y Chromium finales sí cubren esos cambios. No se afirma fullposterior; el integrador ejecutará su gate del árbol unido.
-Lint global:0errores/1warning previo DeliveryOperations; ESLint selectivo final0. BuildFE finalexit0, advertencias previas de chunks/importmixto; diffcheckPASS. Sin buildBE/DB/papel/Apple/nuevo release.
-Config aislado e2e/demo350-scope.frontend.config.js: puerto5375, retries0, forbidOnlytrue, sin capturas/trace/video. Resultados/tmp/mobos-demo350-scope/results y logs/tmp/mobos-demo350A-*.log. Servidor propio cerrado por el harness.

## Lo que NO completa esta unidad

-No existe segunda empresa seleccionable: el registro activo la impide. A/B es prueba sintética del mecanismo; no afirmación de aislamiento de todos los módulos demo aún fijos aAurora.
-Los singletons/fábricas de Cotizaciones/Proofs/Políticas/Servicio/Delivery/Impresión y adaptadores de recursos aún requieren350-B antes de permitir otra empresa. No se tocaron mientras513está activo.
-Un callback async que llame guardarDemo después de un await SINtoken explícito seguirá resolviendo el contexto actual: los consumidores deberán capturar/pasar token durante la adaptación, o retener una fachada. No se promete protección universal de todos los callbacks por añadir el motor.
-Logo/impresión/avatares/consultasRUC y remount global de sesión no se modifican; pertenecen a la integración futura descrita en outputs/Contrato-demo-multiempresa-350.md. No se añaden empresas/deudas/ventas/marcas a los fixtures deAurora.
-Para350-B: fábrica independiente con marcas propias y adaptación de consumidores; luego350-C selectorSPA/guardas visibles. Nunca habilitar un ID futuro en el registro activo antes de que su escenario y adaptadores estén completos.

## Novedades para el dueño

- La demo conserva las fichas que editaste al preparar otro usuario o sucursal dentro de la misma sesión.
- Cambiar el contexto demo utiliza solo memoria y deja de abrir el almacenamiento privado para esa transición.
- La base de la segunda tienda ya separa almacenes y rechaza resultados viejos; todavía no aparece un selector incompleto.
- Recargar o salir sigue reiniciando la demostración, sin guardar sus operaciones en una tienda real.
