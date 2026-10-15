# Cuentas reales de cada empresa (#486)

La causa no era una caché del iPhone: GET /api/payment-accounts creaba siete cuentas predeterminadas cuando la empresa no tenía ninguna. Se elimina esa siembra. El POS sin cuentas ofrece únicamente medios genéricos (efectivo, transferencia y tarjeta), sin marcas ni bancos supuestos. El catálogo de bancos sigue disponible al configurar una cuenta real.

La migración retira únicamente esqueletos con AuditLog PAYMENT_ACCOUNT_CREATED y seeded=true del mismo tenant e identificador, nombre/banco/tipo/moneda idénticos a la creación, datos opcionales vacíos, importes de configuración en cero y ningún evento de edición. Una cuenta manual con el mismo nombre, una personalizada, una editada y un evento de otra empresa no se retiran.

Las cuentas retiradas quedan inactivas y fuera de todos los listados, también para administradores; no se pueden reactivar por PATCH. Sus filas y movimientos históricos se conservan, junto a un respaldo completo en AuditLog PAYMENT_ACCOUNT_DEFAULT_RETIRED. Mantener la fila impide que un contenedor viejo la vuelva a sembrar durante el despliegue gradual. Se pueden crear cuentas reales nuevas, incluso del mismo banco, con los datos de la empresa.

Validación: migración aplicada dos veces en PostgreSQL temporal con dos empresas, cuenta usada por un movimiento, cuentas manual/personalizada/editada y marcador de empresa ajena; respaldo único y movimiento intacto. Integración HTTP verifica lecturas vacías simultáneas sin siembra y configuración/validación de cuentas reales. No se aplicó SQL manual en producción.

Novedades para el dueño
- Cada empresa ve sus propias cuentas de cobro y ya no recibe bancos de ejemplo al abrir Pagos.
- Las cuentas de ejemplo sin personalizar dejan de ofrecerse; los cobros y movimientos anteriores conservan su historial.
