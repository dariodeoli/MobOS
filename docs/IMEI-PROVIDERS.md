# Proveedores IMEI (#585)

MobOS usa un contrato común para mostrar y habilitar proveedores de IMEI sin
exponer credenciales al navegador. El catálogo vive en
`backend/lib/imei-providers.ts` y actualmente registra:

- `imeicheck.net`: adaptador existente. En modo simulado por defecto; pasa a
  `configured` únicamente con `IMEICHECK_LIVE=1` y `IMEICHECK_TOKEN` en el
  servidor.
- `imei.info`: `coming_soon`. No ejecuta consultas hasta contar con contrato,
  sandbox, documentación de respuesta y `IMEI_INFO_TOKEN` en el servidor.

La ruta `/api/imei` acepta opcionalmente `proveedor`. Proveedores desconocidos
responden `400`; un proveedor próximo responde `409` y no consume créditos ni
crea consultas. No existe fallback silencioso: el usuario debe elegir otro
proveedor o esperar su habilitación.

Cada proveedor declara capacidades normalizadas: blacklist actual e histórica,
operador/SIM, Find My/iCloud, MDM, garantía y modelo. La respuesta del
proveedor se normaliza al contrato existente (`CampoVerificacion`) y cualquier
estado pendiente, timeout o error permanece `No verificado`/`A conciliar`.

Para activar un proveedor real se requieren, antes de cambiar flags:

1. contrato y lista de precios vigente;
2. sandbox o prueba no facturable;
3. credencial únicamente en el entorno de servidor;
4. adaptador que implemente timeout, redacción de errores, idempotencia y
   auditoría;
5. pruebas de blacklist, operador, Find My, SIM, MDM y garantía;
6. validación de consentimiento y costo antes de cada consulta.

La demo nunca llama a proveedores externos y usa solamente escenarios
ficticios deterministas.
