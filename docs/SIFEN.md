# SIFEN — Facturación electrónica (Fase 1, sin certificado)

Estado: **Fase 1 (fundamentos)**. La emisión real llega en la Fase 2 con el
certificado y el timbrado. Mientras el flag esté apagado, el comprobante del
pedido sigue siendo el mismo **documento no fiscal** de siempre.

Issue: [#130](https://github.com/dariodeoli/MobOS/issues/130).

## Qué hay en Fase 1

- Módulo aislado `backend/lib/sifen/` con contratos tipados, configuración por
  entorno y cliente SOAP de SIFEN. No se importa desde ningún flujo de pedidos:
  nada cambia en producción.
- Mapeo de `Order` / `Customer` / ítems a los campos fiscales del DE
  (tipo de documento, condición de pago, IVA, RUC + DV, totales).
- Modelo `SifenDocument` (migración aditiva e idempotente) con XML, CDC y
  estado por pedido: `DRAFT` → `SENT` → `APPROVED` / `REJECTED`.
- Feature flag por entorno: sin flag, sin RUC, sin timbrado o sin certificado,
  `prepararBorrador()` devuelve `NO_FISCAL` (comportamiento actual intacto).
- Tests unitarios con payloads de ejemplo (sin credenciales ni red real).

## Módulo

| Archivo | Qué hace |
|---|---|
| `backend/lib/sifen/contracts.ts` | Tipos del DE y tablas de códigos del Manual v150 (tipos de documento, IVA, medios de pago, etc.) |
| `backend/lib/sifen/config.ts` | Configuración por entorno y feature flag; endpoints oficiales test/prod |
| `backend/lib/sifen/cdc.ts` | Estructura del CDC de 44 dígitos, dígito verificador módulo 11, código de seguridad |
| `backend/lib/sifen/mapping.ts` | `Order` + `Customer` → campos fiscales, con la lista de datos que faltan del negocio |
| `backend/lib/sifen/xml.ts` | Serialización del `rDE` v150 (sin firma: Fase 2) |
| `backend/lib/sifen/client.ts` | Sobres SOAP de recepción (`rEnviDe`) y consulta (`rEnviConsDE`), parseo de respuestas |
| `backend/lib/sifen/service.ts` | Decide `NO_FISCAL` / borrador, arma y persiste `SifenDocument` |

## Feature flag y variables de entorno

El módulo se enciende solo cuando **todas** están presentes. Sin valores reales
en el repositorio: se configuran en el entorno del backend (Coolify o
`backend/.env` local, que está *gitignored*).

| Variable | Para qué | Default |
|---|---|---|
| `MOBOS_SIFEN_ENABLED` | Flag maestro (`1`/`true`) | apagado |
| `MOBOS_SIFEN_AMBIENTE` | `test` (homologación) o `prod` | `test` |
| `MOBOS_SIFEN_RUC` | RUC del emisor, con o sin DV (`80012345-6`); sin DV se calcula | — |
| `MOBOS_SIFEN_RAZON_SOCIAL` | Razón social del emisor (encabeza el DE) | — |
| `MOBOS_SIFEN_TIPO_CONTRIBUYENTE` | `2` persona jurídica, `1` física | `2` |
| `MOBOS_SIFEN_TIMBRADO` | Número de timbrado vigente | — |
| `MOBOS_SIFEN_ESTABLECIMIENTO` | Código de establecimiento (3 dígitos) | `001` |
| `MOBOS_SIFEN_PUNTO_EXPEDICION` | Punto de expedición (3 dígitos) | `001` |
| `MOBOS_SIFEN_CERT_PATH` | Ruta al certificado PKCS#12 | — |
| `MOBOS_SIFEN_CERT_PASSWORD` | Clave del certificado | — |
| `MOBOS_SIFEN_DIRECCION`, `MOBOS_SIFEN_CIUDAD`, `MOBOS_SIFEN_DEPARTAMENTO`, `MOBOS_SIFEN_TELEFONO`, `MOBOS_SIFEN_EMAIL` | Datos del emisor para el DE | vacío |
| `MOBOS_SIFEN_TIMEOUT_MS` | Tiempo máximo por llamada al WS | `15000` |
| `MOBOS_SIFEN_RECIBE_URL`, `MOBOS_SIFEN_CONSULTA_URL` | Override de endpoints (sandbox propio) | endpoints oficiales |

Con el flag apagado, `estadoSifen()` devuelve `{ habilitado: false, motivo }`
con el dato que falta, sin exponer credenciales.

### Comportamiento sin certificado

1. La pantalla de comprobantes sigue imprimiendo **"Documento no fiscal · No
   válido como factura"** (`OrderReceipt`, tickets, comisiones).
2. `prepararBorrador()` responde `{ estado: 'NO_FISCAL', motivo }` y no escribe
   nada: `SifenDocument` queda vacía.
3. Ningún endpoint ni flujo de pedidos importa el módulo todavía: el enganche
   en la confirmación de la venta es Fase 2.

## CDC (Código de Control)

44 dígitos según el Manual Técnico v150 §10.1, compuestos por el emisor:

```
01-02 iTiDE       tipo de documento (01 FE, 04 AFE, 05 NCE, 06 NDE, 07 NRE)
03-10 dRucEm      RUC del emisor sin DV (8, con ceros a la izquierda)
11    dDVEmi      dígito verificador del RUC
12-14 dEst        establecimiento
15-17 dPunExp     punto de expedición
18-24 dNumDoc     número del documento
25    iTipCont    tipo de contribuyente del emisor
26-33 dFeEmiDE    fecha de emisión AAAAMMDD
34    iTipEmi     tipo de emisión (1 normal, 2 contingencia)
35-43 dCodSeg     código de seguridad aleatorio de 9 dígitos
44    dDVId       verificador módulo 11 sobre los 43 dígitos previos
```

El test `backend/tests/sifen-cdc.test.ts` reproduce el ejemplo oficial del
manual (`01444444017001001001452822017012515873260988`), así que cualquier
cambio en la composición queda anclado a la fuente.

## Modelo y migración

`SifenDocument` (una fila por pedido y ambiente):

- `status`: `DRAFT` (borrador), `SENT` (enviado), `APPROVED` (aprobado),
  `REJECTED` (rechazado).
- `cdc`, `xml`, `respuesta` (JSON con código/mensaje de SIFEN), `error`.
- `ambiente`, `tipoDocumento`, `establecimiento`, `puntoExpedicion`, `numero`,
  `timbrado`, `enviadoAt`, `resueltoAt`.
- Índice único `[orderId, ambiente]`: reintentos y correcciones reutilizan la
  fila en lugar de duplicar el DE.

Migración: `backend/prisma/migrations/20261105000000_sifen_documents/`
(aditiva, idempotente y re-ejecutable). Verificar con `npm run db:check`.

## Alta del certificado (paso a paso, para Dario)

La Fase 2 necesita un certificado digital y el timbrado vigente. El trámite se
hace ante la SET (e-Kuatia). Los pasos generales:

1. **Ambiente de test (homologación).** Solicitar en el portal de SIFEN el
   certificado de prueba de la empresa. Sirve para emitir sin valor fiscal y
   validar todo el circuito (firma, envío, KuDE).
2. **RUC y timbrado.** Confirmar el RUC del emisor con su dígito verificador y
   el número de timbrado vigente con su fecha de inicio y rango de numeración
   (establecimiento y punto de expedición).
3. **Certificado de producción.** Gestionar un certificado digital de empresa
   emitido por un prestador de servicios de certificación autorizado por la
   SET. Guardar el PKCS#12 y su clave en el gestor de secretos del servidor
   (nunca en el repositorio).
4. **Cargar las variables** `MOBOS_SIFEN_*` en el entorno del backend (Coolify
   → variables de la API) y encender `MOBOS_SIFEN_ENABLED=1`.
5. **Verificar el estado** con `estadoSifen()` (o el diagnóstico que exponga la
   Fase 2); si falta algo, el motivo lo dice sin filtrar valores.
6. **Prueba de punta a punta en test** antes de tocar producción: emitir un DE
   de un pedido de prueba y consultarlo por CDC.

Notas:

- El WS de SIFEN exige **mTLS con el certificado del emisor**; el cliente de
  Fase 1 no lo usa todavía (no hay llamadas reales).
- Los endpoints oficiales están en `config.ts`
  (`sifen-test.set.gov.py` y `sifen.set.gov.py`).
- El certificado de test y el de producción son distintos: no se reutilizan
  entre ambientes.

## Datos que faltan del negocio

La lista viva está en `mapearDocumentoFiscal().faltantes`:

- **Tipo de IVA por producto**: hoy todo se mapea gravado 10% con IVA incluido
  en el precio; falta capturar 5% / exento / exonerado por producto.
- **Tipo de documento del cliente (RUC vs cédula)**: se infiere por formato;
  conviene un campo en la ficha.
- **Tipo de contribuyente del emisor y datos fiscales**: vienen por entorno;
  `Tenant` solo guarda RUC, dirección y ciudad.
- **Unidad de medida y código interno por ítem**: requieren el SKU del producto
  en la línea del pedido.
- **Numeración del timbrado** por establecimiento y punto de expedición.
- **Tarjeta crédito vs débito** en los pagos con tarjeta.
- **Condición a crédito** con cuotas y vencimientos detallados.
- **Zona horaria** de la fecha de emisión (hoy se usa la hora local del
  servidor).

## Plan de Fase 2 (emisión real)

1. **Firma digital**: firmar el `rDE` con XMLDSig RSA-SHA256 usando el PKCS#12
   y validarlo contra `DE_v150.xsd` antes de enviar.
2. **Numeración y timbrado**: secuencia por establecimiento/punto con control
   de rango y fecha de vigencia del timbrado.
3. **Envío**: conectar `prepararBorrador()` + `guardarBorrador()` +
   `enviarDe()` en la confirmación del pedido (o en un botón explícito del
   dueño), con `SENT`/`APPROVED`/`REJECTED` y reintentos.
4. **Consultas y conciliación**: `consultarDe()` por CDC para reintentos y
   estado; job de conciliación por si se corta la respuesta.
5. **Eventos**: cancelación, inutilización de números y notas de crédito/débito
   (`TIPO_DOCUMENTO` ya contempla los códigos).
6. **KuDE y QR**: comprobante legal imprimible con el CDC en grupos de cuatro
   (`formatearCdc`), QR oficial y envío por correo al cliente.
7. **UI**: estado fiscal del pedido en el panel y en el comprobante, con el
   XML descargable y el motivo cuando SIFEN rechaza.
8. **Reportes**: libro de IVA ventas y exportación para el contador.

## Cómo correr los tests

```sh
npm --prefix backend run test:unit
```

Los tests de SIFEN (`backend/tests/sifen-*.test.ts`) no necesitan base, ni
certificado, ni red: simulan las respuestas de SIFEN con `fetch` falso.
