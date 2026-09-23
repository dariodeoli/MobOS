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
