# Conciliación diaria por sucursal — #451

## Criterios de producto

- «Verificar día por sucursal» abre un formulario aparte de los filtros y lotes del período. Día de Paraguay y sucursal concreta son obligatorios.
- Cada medio/cuenta/moneda compara cobros confirmados del sistema con una declaración independiente de lo recibido, expresada en guaraníes enteros. Los campos empiezan vacíos; cero se ingresa explícitamente. No se obtiene ni se simula un saldo bancario.
- Pendiente es naranja; con diferencia es rojo; verificado es verde. Al guardar se evalúan todos los grupos del día. Dos diferencias opuestas no se compensan para aprobar. Cualquier diferencia requiere motivo.
- Se pueden declarar importes de una cuenta sin cobros registrados para detectar dinero recibido que falta cargar. Los cobros pendientes de reparto se verifican mediante su rendición, no mediante este cierre.

## Contrato y trazabilidad

GET /api/finance/reconciliation?view=day&day=YYYY-MM-DD&branchId=... devuelve estado actual, grupos, versión, última declaración y hasta 20 revisiones. Cada grupo tiene key, method, accountId, currency, expectedPyg, receivedPyg, differencePyg y count. receivedPyg y differencePyg son null mientras falte declarar. Todos los importes son Gs completos; currency identifica la moneda original del grupo, no cambia la unidad de los importes declarados. El responsable obtiene el equivalente en Gs de su conteo o comprobantes; la aplicación no inventa cotizaciones.

POST en la misma URL recibe action: day, day, branchId, expectedVersion, requestId (UUID), declarations [{method, accountId, currency, receivedPyg}], note. requestId es idempotente por empresa: repetir la misma solicitud no crea otra revisión y reutilizarlo con otros datos da 409. expectedVersion evita sobreescribir el trabajo concurrente de otra persona. Un candado de PostgreSQL por empresa/sucursal/día serializa la escritura; los pagos del día se bloquean durante la foto. La consulta posterior usa una lectura consistente.

ReconciliationDay identifica empresa/sucursal/día y ReconciliationDayRevision conserva declaraciones, foto de la evaluación, IDs/importes/medio/cuenta/moneda de los pagos, motivo, actor, fecha y versión. Las revisiones son inmutables; el evento RECONCILIATION_DAY_DECLARED agrega trazabilidad en Auditoría. La migración 20270204120000_reconciliation_day es aditiva e idempotente.

El estado vigente se calcula en cada consulta contra los pagos confirmados actuales. Se excluyen crédito, saldo a favor, pagos pendientes y ambos lados de una corrección (original revertido y reversión); se incluye el pago nuevo vigente. Después de una corrección puede cambiar el estado o faltar declarar una nueva cuenta. changedSinceDeclaration advierte el cambio; el historial conserva la foto anterior, nunca se reescribe.

Declarar/verificar el día no crea, confirma ni reconcilia Payment, no cambia deuda del pedido y no agrega ingresos ni CashMovement. Los lotes manuales siguen separados; se endurece su autorización de sucursal y se rechaza usar un cobro pendiente del repartidor en un lote bancario. Cuenta, tenant y sucursal se validan en servidor; los identificadores enviados por el navegador no amplían el alcance de la sesión. Las cuentas declaradas deben pertenecer a la empresa.

El modo demo implementa el mismo comportamiento con revisiones locales y datos ficticios, sin llamadas de escritura a la API ni cambios de las ventas. El diálogo invalida cargas y finalizaciones al cambiar empresa, perfil, sucursal o día, y no permite dobles envíos. Escape cierra el diálogo, los controles móviles conservan 44px y los montos no se recortan.

## Novedades para el dueño

- Verificá todos los cobros de un día y una sucursal con una sola declaración.
- Compará lo recibido según caja y comprobantes con lo registrado, sin cargar saldos ni credenciales bancarias.
- Identificá pendientes en naranja, diferencias en rojo y coincidencias en verde; las diferencias quedan con su motivo.
- Consultá quién declaró cada día, cuándo y qué cambió después de una corrección.
