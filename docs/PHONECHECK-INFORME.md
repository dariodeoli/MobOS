# Informe público PhoneCheck (contrato DSN/PRN — #240)

`informePublicoInspection(payloadInterno, { enlace })` (en `src/lib/phonecheck.js`)
produce el JSON **sin datos personales** que Diseño/Impresión usan para el informe y
la etiqueta **Certificado**.

## Contrato

```json
{
  "tipo": "certificado-phonecheck", "version": 1, "titulo": "Certificado PhoneCheck",
  "grado": "A", "puntaje": 100,
  "producto": "iPhone 15", "capacidad": "128GB", "condicion": "USED", "cosmetico": "buen estado",
  "serial": "••••7518",
  "bateria": { "porcentaje": "89", "ciclos": "310" },
  "controles": [{ "label": "iCloud", "ok": true }],
  "repuestosNoOem": "",
  "repuestosNoOemNota": "Cambio de módulo no original en el servicio",
  "items": [{ "grupo": "Pantalla", "label": "Pantalla / táctil", "estado": "falla", "nota": "Rayón profundo" }],
  "verificado": "2026-09-21T23:09:00.000Z",
  "fuente": { "proveedor": "imeicheck.net", "fecha": "…", "etiqueta": "Verificado" },
  "aviso": "iCloud/US Block clean no equivalen a blacklist mundial.",
  "enlace": "https://app.moboss.online/informe/…",
  "qr": "CERT|••••7518|A|100|2026-09-21T23:09:00.000Z"
}
```

- **Serial enmascarado** (últimos 4) y **sin cliente, teléfono ni RUC**: apto para
  compartir con el comprador.
- Las **notas solo se incluyen en ítems no OK**; el resto viaja sin texto.
- **`repuestosNoOemNota`** acompaña a `repuestosNoOem` (detalle de la reparación);
  el informe público de la app también los muestra cuando la inspección los tiene.
- El **QR** usa la cadena compacta `CERT|serial|grado|puntaje|fecha` (o el `enlace`
  cuando exista una ruta pública del informe).
- El aviso de blacklist mundial es obligatorio en el render.

Referencia de uso: etiqueta “Certificado” (`certificadoPhoneCheck`) y el informe
interno (`payloadInformeInspection`).

## Constancia de preparación (contrato para PRN — #240 ítem 6)

Adaptación local del «certificate of erasure»: la constancia de que el equipo se
formateó y se desvinculó (iCloud/MDM/ESN/carrier) antes de entregarse, firmada.
**Este documento es el contrato de datos**; el layout y la firma son de PRN.

```json
{
  "tipo": "constancia-preparacion", "version": 1,
  "titulo": "Constancia de preparación",
  "equipo": { "modelo": "iPhone 15 Pro 256GB", "serial": "••••7518", "imei": "••••7518" },
  "desvinculacion": {
    "icloud":  { "ok": true, "valor": "Off",                     "fuente": "imeicheck.net", "hora": "2026-09-21T23:09:00.000Z" },
    "mdm":     { "ok": true, "valor": "Sin MDM",                  "fuente": "imeicheck.net", "hora": "2026-09-21T23:09:00.000Z" },
    "esn":     { "ok": true, "valor": "Sin reportes actuales",    "fuente": "imeicheck.net", "hora": "2026-09-21T23:09:00.000Z" },
    "carrier": { "ok": true, "valor": "Unlocked",                 "fuente": "imeicheck.net", "hora": "2026-09-21T23:09:00.000Z" }
  },
  "checklist": { "grado": "A", "puntaje": 95, "aprobados": 9, "evaluados": 10,
                 "items": [{ "label": "Pantalla / táctil", "estado": "ok", "nota": "" }] },
  "preparadoPor": "Hernán Acosta",
  "preparadoAt": "2026-09-23T14:05:00.000Z",
  "nota": "Equipo formateado, desvinculado de iCloud/MDM y probado.",
  "enlace": "https://app.moboss.online/u/…",
  "qr": "CERT|••••7518|A|95|2026-09-23T14:05:00.000Z",
  "aviso": "iCloud/US Block clean no equivalen a blacklist mundial."
}
```

**Quién llena cada campo**

| Campo | Fuente (INV) |
|---|---|
| `equipo` | `unit` (modelo) + serial/IMEI enmascarados (`enmascarar`) |
| `desvinculacion` | los **controles** de la última consulta IMEI (`controlesPublicos` / `locksDeVerificacion`): `ok` = limpio |
| `checklist`, `grado`, `puntaje` | la inspección persistida (`items` + `resumenInspection`) |
| `preparadoPor` / `preparadoAt` | `inspeccionadoPor` / `inspeccionadoAt` (o el usuario y la fecha del cierre) |
| `nota` | campo libre del cierre de preparación (queda en la inspección) |
| `enlace` / `qr` | ruta pública del informe (DSN) o la cadena `CERT|…` como respaldo |

**Reglas**

- Solo se firma con **todos** los controles limpios (`ok: true`); si algún lock
  está activo o sin dato, la constancia sale como **pendiente** con el detalle
  (nunca como constancia válida).
- Serial/IMEI siempre enmascarados; sin cliente, teléfono ni RUC.
- La línea de **firma del cliente/tienda** y el cargo son de PRN (no viajan en el
  payload).
- Reusa `certificadoPhoneCheck(datosCertificado(unit, …))` como base (mismo QR y
  mismos controles que el certificado); la constancia agrega la firma y el título.

**PRN**: el payload se puede armar con lo que la app ya tiene (`unit.inspection`
+ la última consulta de `GET /api/imei`), igual que el certificado; cuando lo
necesiten desde la API pública, se agrega `constancia` al JSON de
`/api/public/units/:serial` (hoy viaja `unit` con `checklist` y `controles`).
