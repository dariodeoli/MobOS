# Verificación y recepción de unidades

La recepción rápida admite ciclos de carga enteros entre 0 y 5000. Vacío deja el dato ausente; 0 es un dato válido. La ficha, planilla y etiqueta comparten el valor; las etiquetas muestran los ciclos también al imprimir un lote. No se agregan campos ni migraciones: batteryCycles ya existe.

En Unidades → Planilla → Personalizar planilla, «Verificación de stock» consulta la política de la empresa. Solo la cuenta propietaria vinculada al perfil activo puede guardar los roles autorizados y los datos adicionales que quedarán como foto: condición, batería/ciclos y nota del equipo. Las preferencias personales no cambian esta política. La demo muestra la configuración inicial, sin fingir un cambio auditado.

GET /api/tenant/stock-verification devuelve { policy: { roles, records }, canConfigure, canVerify }. PUT recibe { roles, records }, valida los valores y audita actor, fecha y política anterior/nueva. La configuración vive en Tenant.settings.stockVerification, separada de stockDisplay. Ausencia mantiene los roles anteriores; roles: [] deshabilita nuevos checks. records admite condition, battery y notes; no incluye costos. ADMIN o GERENTE no acreditan por sí solos propiedad: se exige cuenta, tenant, perfil activo y membership OWNER vigente.

POST inventory-units/verify (individual/lote), inicio de conteo y escaneos de stock-verifications comprueban la política en servidor, además del aislamiento de empresa y sucursal existente. La recepción IN_TRANSIT conserva su autorización y movimiento de stock aunque el rol no pueda hacer checks independientes. Deshacer conserva el límite de un minuto y solo quien hizo el check; no borra el historial. Actor, fecha, hora, serial, ubicación e historial anterior siempre se auditan; la política no permite desactivarlos. El conteo rápido informa un rechazo del servidor, no lo oculta.

Lo vendido se archiva de Unidades al cambiar el día de America/Asuncion y se conserva en Vendidos. La consulta SQL usa esa zona; la pantalla abierta recarga al cambiar el día y al volver de segundo plano. No cambia ventas ni estados persistidos.

En celular, Unidades concentra la navegación y el aviso demo en la barra superior; el acceso Demo abre la guía y el perfil conserva Salir. La primera tarjeta medida a 375px queda en y=154 (objetivo ≤168), con controles de 44px y sin scroll horizontal. No cambia el escritorio.

## Novedades para el dueño

- Cargá ciclos de batería, incluido cero, al recibir una unidad y consultalos en su etiqueta.
- Elegí qué roles pueden verificar físicamente el stock y qué datos adicionales quedan registrados.
- Cada check conserva siempre quién lo hizo y cuándo, con historial auditable.
- En celular ves la primera unidad antes; las ventas del día pasan a Vendidos al llegar medianoche de Paraguay.
