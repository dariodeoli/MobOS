# MobOS — mapa integral de trabajo

## 1. Decisión de producto

MobOS será un sistema operativo para tiendas de celulares, accesorios y asistencia técnica.

La experiencia debe sentirse como un POS móvil rápido, pero el núcleo debe registrar inventario, IMEI, sucursales, pagos, garantías, reparaciones, importaciones, clientes y posventa.

Nombre corto actual: `MobOS`.

Nombre completo provisional: `MobOS Retail`.

El nombre completo y la identidad visual deben continuar configurables por entorno y organización.

## 2. Principios no negociables

- Cada empresa ve únicamente sus datos.
- Cada sucursal controla su stock, caja y usuarios habilitados.
- Cada vendedor ingresa con PIN individual.
- El vendedor activo queda vinculado automáticamente a la operación.
- Descuentos, anulaciones, devoluciones y precios especiales requieren permiso o aprobación.
- Los movimientos financieros históricos nunca se recalculan por cambiar la cotización actual.
- Una venta se modela como una orden con líneas y pagos, no como ventas sueltas por producto.
- El stock se reserva y mueve mediante operaciones auditables.
- IMEI/serial, lote, garantía y reparación conservan trazabilidad completa.
- La capa JSON actual funciona solo como puente de migración.

## 3. Mapa de módulos

```text
MobOS
├── Identidad y configuración
│   ├── Marca configurable
│   ├── Empresas
│   ├── Sucursales
│   ├── Usuarios y PIN
│   ├── Roles y permisos
│   ├── Horarios y sesiones
│   └── Auditoría
├── POS
│   ├── Smart Grid
│   ├── Buscador de productos
│   ├── Carrito y borradores
│   ├── Cliente/RUC/CI
│   ├── Descuentos y aprobaciones
│   ├── Pagos parciales
│   ├── Entrega/retiro/encomienda
│   └── Recibos
├── Inventario
│   ├── Productos y variantes
│   ├── IMEI/serial
│   ├── Lotes y vencimientos
│   ├── Ubicaciones
│   ├── Reservas
│   ├── Transferencias
│   ├── Kits y compatibilidades
│   └── Conteos y ajustes
├── Finanzas
│   ├── Cuentas bancarias y cajas
│   ├── Métodos de pago
│   ├── Plantillas de cobro
│   ├── Multidivisa
│   ├── Cotizaciones
│   ├── Cuentas por cobrar/pagar
│   ├── Conciliación
│   └── Cierres de caja
├── Compra e importación
│   ├── Proveedores
│   ├── Órdenes de compra
│   ├── Anticipos
│   ├── Flete y aduana
│   ├── Costo puesto
│   ├── Recepción por lote/IMEI
│   └── Importación CSV/Excel
├── Asistencia técnica
│   ├── Órdenes de servicio
│   ├── Checklist de recepción
│   ├── Fotos y diagnóstico
│   ├── Presupuesto y aprobación
│   ├── Técnico responsable
│   ├── Piezas consumidas
│   ├── Garantía por pieza/servicio
│   └── RMA
├── CRM y posventa
│   ├── Historial del cliente
│   ├── WhatsApp/Instagram
│   ├── Seguimiento de leads
│   ├── Cumpleaños y recompra
│   ├── Upgrade
│   ├── Recordatorios de garantía
│   └── Portal público del cliente
└── Inteligencia y reportes
    ├── Ventas y margen
    ├── Rotación y stock lento
    ├── Comisiones
    ├── Comparación de períodos
    ├── Forecast de reposición
    ├── Exportación PDF/CSV/Excel
    └── Asistente operativo
```

## 4. Orden de implementación

### Fase 0 — Fundación y seguridad

Objetivo: dejar lista la base segura antes de migrar operaciones.

- [ ] Verificar disponibilidad de `MobOS`/`MobOS Retail` en dominio y marca.
- [ ] Centralizar nombre, logo, favicon, colores, tipografías y metadatos.
- [ ] Crear `organizations`, `branches`, `organization_users` y membresías.
- [ ] Implementar Supabase Auth.
- [ ] Implementar PIN individual con hash, intentos fallidos y bloqueo temporal.
- [ ] Crear roles y permisos por acción.
- [ ] Crear policies RLS por empresa y sucursal.
- [ ] Registrar sesiones, último acceso, dispositivo y auditoría.
- [ ] Cerrar el acceso `anon` abierto a `entities` y `kv`.

Salida: una persona solo puede entrar a las empresas y sucursales autorizadas.

### Fase 1 — POS operativo

Objetivo: vender rápido y con datos correctos.

- [ ] Reemplazar el selector manual de vendedor por la sesión PIN.
- [ ] Crear Smart Grid configurable por usuario/sucursal.
- [ ] Cambiar `<select>` por buscador parcial con imágenes.
- [ ] Crear carrito persistente y borradores recuperables.
- [ ] Buscar cliente por nombre, teléfono, email, RUC o CI.
- [ ] Crear cliente automáticamente cuando no existe.
- [ ] Integrar consulta RUC/CI con caché, fuente y revisión manual.
- [ ] Permitir precio base, precio especial y descuento.
- [ ] Solicitar aprobación para descuentos fuera del límite.
- [ ] Crear orden única con múltiples líneas.
- [ ] Registrar retiro, delivery, encomienda y dirección.
- [ ] Crear pagos parciales y combinados.
- [ ] Generar recibo PDF, imagen y enlace de WhatsApp.

Salida: una venta completa queda vinculada a vendedor, sucursal, cliente, stock, pagos y auditoría.

### Fase 2 — Inventario y sucursales

Objetivo: que el stock real coincida con el sistema.

- [ ] Crear ubicaciones: tienda, depósito, reparación y tránsito.
- [ ] Separar stock físico, reservado, disponible y defectuoso.
- [ ] Registrar unidades con IMEI/serial.
- [ ] Registrar lotes con vencimiento y trazabilidad sanitaria.
- [ ] Crear movimientos inmutables de inventario.
- [ ] Crear reservas con vencimiento.
- [ ] Crear transferencias entre sucursales con aprobación.
- [ ] Crear conteos rápidos con cámara/barcode.
- [ ] Importar IMEI masivamente por CSV/Excel.
- [ ] Crear kits y combos que descuenten componentes.
- [ ] Agregar compatibilidades de fundas, películas y repuestos.

Salida: cada equipo y lote tiene ubicación, estado, costo y responsable.

### Fase 3 — Finanzas y multidivisa

Objetivo: manejar cobros reales sin mezclar monedas ni cuentas.

- [ ] Crear monedas PYG, USD, BRL, EUR y USDT.
- [ ] Definir moneda de reporte por empresa.
- [ ] Guardar monto original, moneda, cotización y equivalente de reporte.
- [ ] Crear cuentas bancarias, caja, POS, QR y billeteras.
- [ ] Crear métodos de pago configurables.
- [ ] Crear plantillas rápidas de cobro.
- [ ] Permitir que una venta tenga una moneda y sus pagos otra.
- [ ] Congelar la cotización al registrar cada pago.
- [ ] Crear cuentas por cobrar y fechas prometidas.
- [ ] Crear cierre y arqueo de caja por sucursal.
- [ ] Registrar comisiones de tarjetas/POS.
- [ ] Crear conciliación manual e importación bancaria posterior.

Salida: reportes consolidados en PYG sin alterar los movimientos originales.

### Fase 4 — Compras e importaciones

Objetivo: conocer el costo real antes y después de importar.

- [ ] Crear proveedores y condiciones comerciales.
- [ ] Crear órdenes de compra.
- [ ] Registrar anticipos.
- [ ] Registrar FOB, flete, seguro, aduana, impuestos y costos bancarios.
- [ ] Calcular costo puesto por lote y unidad.
- [ ] Recibir por lote o IMEI.
- [ ] Vincular costo puesto al margen real.
- [ ] Crear simulador de importación por peso/volumen.
- [ ] Comparar escenarios marítimo, aéreo y courier.

Salida: cada producto importado tiene costo histórico defendible.

### Fase 5 — Asistencia técnica, garantía y RMA

Objetivo: controlar el ciclo completo después de la venta.

- [ ] Crear órdenes de servicio.
- [ ] Registrar IMEI, contraseña/patrón solo cuando sea necesario y de forma protegida.
- [ ] Crear checklist de recepción y fotos.
- [ ] Registrar diagnóstico, prioridad y técnico.
- [ ] Crear presupuesto con aprobación por enlace temporal.
- [ ] Descontar piezas del inventario al ejecutar el servicio.
- [ ] Crear garantía por equipo, pieza y mano de obra.
- [ ] Crear devoluciones, cambios y reembolsos autorizados.
- [ ] Crear RMA con proveedor.
- [ ] Crear portal público de seguimiento.
- [ ] Enviar avisos de estado por WhatsApp/email.

Salida: venta, reparación, garantía y devolución quedan en una sola ficha de equipo.

### Fase 6 — CRM y crecimiento

Objetivo: convertir ventas en recompra.

- [ ] Integrar WhatsApp e Instagram mediante conectores autorizados.
- [ ] Crear embudo de leads.
- [ ] Crear seguimientos automáticos.
- [ ] Crear campañas de upgrade.
- [ ] Crear recordatorios de cumpleaños y garantía.
- [ ] Crear segmentos por valor, frecuencia y última compra.
- [ ] Crear catálogo online con el mismo stock.
- [ ] Crear pedidos online en el mismo flujo del POS.
- [ ] Crear códigos QR de producto.
- [ ] Crear referidos y beneficios.

Salida: el CRM comparte clientes, stock, ventas y garantías con el POS.

### Fase 7 — Inteligencia y optimización

Objetivo: usar datos para decidir compras y acciones comerciales.

- [ ] Dashboard de ventas, margen, ticket y comisiones.
- [ ] Comparación 7/30/90 días, año y rango personalizado.
- [ ] Ranking de vendedores, productos y clientes.
- [ ] Alertas de stock crítico y productos lentos.
- [ ] Sugerencias de reposición.
- [ ] Alertas de garantía y cobranzas vencidas.
- [ ] Asistente que explique datos y proponga acciones.
- [ ] Exportación PDF, CSV y Excel.
- [ ] Preferencias por usuario: vista, moneda, filtros y orden.

Salida: el sistema recomienda qué comprar, a quién contactar y qué margen corregir.

## 5. Modelo de datos definitivo

```text
organization
 ├── branches
 │    ├── branch_memberships
 │    ├── inventory_locations
 │    ├── cash_sessions
 │    └── payment_method_accounts
 ├── products
 │    ├── product_prices
 │    ├── inventory_units
 │    ├── inventory_lots
 │    ├── product_assets
 │    └── product_compatibilities
 ├── customers
 ├── orders
 │    ├── order_items
 │    ├── payments
 │    ├── shipments
 │    └── warranties
 ├── purchase_orders
 ├── service_orders
 ├── financial_accounts
 ├── financial_entries
 ├── exchange_rates
 ├── crm_conversations
 └── audit_log
```

## 6. Reglas para no romper la operación

- No migrar datos directamente a producción sin copia y conciliación.
- No retirar `entities`/`kv` hasta comparar ventas, clientes, stock y saldos.
- No descontar inventario desde el navegador sin transacción del servidor.
- No permitir que un vendedor escriba manualmente su identidad.
- No borrar ventas; usar anulación, devolución o nota de crédito.
- No convertir movimientos históricos con la cotización actual.
- No guardar secretos, hashes de PIN ni tokens en frontend/localStorage.
- No ejecutar integraciones fiscales o de IMEI de Brasil como si fueran válidas para Paraguay.
- Cada conector de país debe tener configuración propia por organización.

## 7. Criterios de aceptación del MVP

El MVP de MobOS está listo cuando pueda demostrar, con datos de prueba aislados:

1. Dos empresas no pueden ver datos entre sí.
2. Dos sucursales comparten catálogo, pero no confunden stock.
3. Dos vendedores ingresan con PIN distinto y cada venta queda atribuida automáticamente.
4. Un vendedor no puede aplicar un descuento fuera de su permiso.
5. Una venta puede tener tres pagos en monedas/cuentas distintas.
6. El stock se reserva, entrega y revierte sin duplicarse.
7. El cliente se encuentra por RUC/CI/teléfono y se crea si no existe.
8. Un IMEI permite ver compra, cliente, garantía y reparaciones.
9. Un pedido puede retirarse, enviarse o quedar pendiente sin perder su historial.
10. Los reportes muestran monto original y equivalente en moneda de reporte.
11. Cada acción sensible queda auditada con persona, sucursal, fecha y hora.
12. La app sigue funcionando en móvil y el POS tiene recuperación ante corte de internet.

## 8. Orden inmediato de ejecución

1. Cerrar identidad y nombre: `MobOS` / `MobOS Retail`.
2. Crear migración de organizaciones, sucursales, roles, PIN y RLS.
3. Implementar autenticación real y vendedor automático.
4. Convertir el POS actual a orden, líneas y pagos.
5. Implementar stock por ubicación y movimientos transaccionales.
6. Implementar cuentas, métodos, plantillas y multidivisa.
7. Migrar datos históricos y conciliar.
8. Implementar asistencia técnica y garantías.
9. Implementar CRM y posventa.
10. Implementar catálogo, offline y analítica avanzada.
