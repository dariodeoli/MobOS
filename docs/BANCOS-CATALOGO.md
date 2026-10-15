# Catálogo bancario compartido · #363

La biblioteca owncoding-ui v0.68.11 ofrece 32 instituciones y sus logos. Abrir o editar un campo conserva el nombre guardado; elegir otra institución es una acción expresa. La resolución visual de El Comercio o Finexpar no autoriza cambiar la identidad de una cuenta.

La migración `20270202100000_bank_catalog_labels` normaliza únicamente siete alias exactos: Banco Interfisa → Interfisa Banco; Banco Itaú Paraguay → Itaú; Banco Sudameris → Sudameris; Citibank Paraguay → Citi; Cooperativa Medalla Milagrosa → Medalla Milagrosa; Cooperativa San Cristóbal → San Cristóbal; Cooperativa Universitaria → Universitaria. No cambia números, titulares, tenants, saldos ni pagos/snapshots históricos. Los demás nombres permanecen intactos.

## Previsualización del integrador

Ejecutar solo contra la base autorizada. Este SELECT solo devuelve conteos por empresa, nunca claves, números, titulares ni datos de cuentas:

```sql
SELECT "tenantId", count(*) AS cuentas_a_normalizar
FROM "PaymentAccount"
WHERE "bank" IN ('Banco Interfisa', 'Banco Itaú Paraguay', 'Banco Sudameris', 'Citibank Paraguay', 'Cooperativa Medalla Milagrosa', 'Cooperativa San Cristóbal', 'Cooperativa Universitaria')
GROUP BY "tenantId" ORDER BY "tenantId";
```

La migración guarda primero por cuenta y empresa un registro `AuditLog` con acción `PAYMENT_ACCOUNT_BANK_CATALOG_NORMALIZED`, entidad `PaymentAccount` y metadata `before`/`after`/`migration`. Ese registro es el respaldo del campo anterior; la actualización y el respaldo son atómicos. Volver a ejecutar no cambia nombres ya normalizados ni duplica auditoría. La comprobación posterior del mismo SELECT debe dar cero filas; revisar el conteo de auditoría por tenant, sin imprimir metadata ni identificadores de cuentas:

```sql
SELECT "tenantId", count(*) AS cuentas_normalizadas
FROM "AuditLog"
WHERE "action" = 'PAYMENT_ACCOUNT_BANK_CATALOG_NORMALIZED'
  AND "metadata"->>'migration' = '20270202100000_bank_catalog_labels'
GROUP BY "tenantId" ORDER BY "tenantId";
```

Ante una corrección aprobada, el integrador puede restaurar solo el campo `bank` usando el respaldo, cotejando antes el valor actual con `after` para no pisar una edición posterior. No ejecutar restauraciones automáticas ni interpretar nombres por coincidencias parciales.
