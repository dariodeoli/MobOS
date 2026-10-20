# RUC: contrato OwnData sin estado fiscal (#641)

La integración consulta `GET https://app.controlaria.online/api/v1/ruc/{ruc}` exclusivamente desde el servidor. La única credencial es `RUC_API_KEY` del entorno backend; el transporte omite credenciales, no envía Cookie/Authorization y no sigue redirecciones. No hay sesión de OwnData ni claves en el navegador.

La identidad admitida requiere `ruc`, `dv`, `fullRuc` coherentes con el número solicitado y `nameOfficial` no vacío. `equivalenceRaw` y `sourcePartition` son opcionales; la equivalencia debe ser una cadena y la partición un entero entre 0 y 9, conservados sin transformación. `status`, `stateRaw` y cualquier alias de estado se descartan aunque el proveedor los envíe. El cliente proyecta la misma identidad explícitamente. No se cambia ni inventa el nombre oficial.

El éxito requiere `meta.environment` test/live, cuota numérica coherente y procedencia del snapshot oficial con página HTTPS sin credenciales/query/fragmento, fecha de publicación, fecha de importación y SHA-256. La ruta pública valida esa evidencia en servidor y conserva su proyección mínima, sin publicar cuotas comerciales ni metadatos internos.

Los errores del proveedor se leen con el mismo límite de 64 KiB y timeout. Sólo códigos conocidos con HTTP concordante se preservan; mensajes y diagnósticos del proveedor nunca se reflejan. `COMMERCIAL_API_DISABLED` queda como 503 con ese código. `API_KEY_EXPIRED`, `API_KEY_REVOKED`, `API_KEY_INVALID` y demás fallos 401/403 del proveedor conservan el código pero responden 503 local: la credencial afectada pertenece al servidor, y devolver 401 invalidaría injustificadamente la sesión MobOS. Los 401/403 de sesión/piloto MobOS se mantienen. Un RUC no encontrado conserva 404 y una cuota agotada 429.

Las cuotas privadas rechazan configuración no finita, no entera o no positiva antes de acceder a la base. Los presupuestos de cuenta e instalación se serializan con locks transaccionales PostgreSQL en orden determinista, reloj posterior al lock y rollback conjunto. Una falla de DB/lock no habilita consultas. No se cambiaron los límites normales, el piloto privado, los permisos ni las guardas públicas.

## Verificación

Todo QA usa datos sintéticos y proveedor simulado. Los tests cubren cuatro valores de status, stateRaw y ausencia de ambos; identidad/DV/nombre inválidos; campos opcionales; metadata/procedencia/cuota inválidas; códigos de configuración; cuerpos malformados o grandes; reflexión de claves; proyección exacta pública/privada; transporte sin cookies y cuotas concurrentes con PostgreSQL descartable.

## Novedades para el dueño

- La consulta acepta los datos actuales de OwnData sin depender del estado fiscal.
- El formulario muestra la identidad oficial y permite confirmar antes de aplicarla.
- Los problemas de configuración del proveedor no cierran la sesión de MobOS.
- Las cuotas se respetan también al recibir varias consultas simultáneas.
