# Verificación de PDFs y QR · informe y certificado (#240)

- Fecha: 2026-09-22T14:39:18.657Z
- Enlace esperado del informe público: `https://app.moboss.online/u/351500000000004`
- Unidad: demo `demo-unit-5` (iPhone 15 Pro Max, seminuevo) con IMEI ficticio válido `351500000000004`
- Método: PDFs generados con el código de impresión de la app → PNG (sips) → QR decodificado con Vision (`scripts/decode-qr.swift`).

| Documento | Páginas | QR decodificado | Resultado |
| --- | --- | --- | --- |
| informe-inv-80mm-escpos | 1 | `https://app.moboss.online/u/351500000000004` | ✅ enlace verificado en los bytes ESC/POS |
| informe-dsn-80mm-escpos | 1 | `https://app.moboss.online/u/351500000000004` | ✅ enlace verificado en los bytes ESC/POS |
| informe-inv-a4 | 1 | `https://app.moboss.online/u/351500000000004` | ✅ |
| informe-inv-80mm | 1 | `https://app.moboss.online/u/351500000000004` | ✅ |
| certificado-inv-a4 | 1 | `https://app.moboss.online/u/351500000000004` | ✅ |
| informe-dsn-a4 | 2 | `https://app.moboss.online/u/351500000000004` | ✅ |
| informe-dsn-80mm | 1 | `https://app.moboss.online/u/351500000000004` | ✅ |
| certificado-dsn-a4 | 1 | `https://app.moboss.online/u/351500000000004` | ✅ |

**Qué cubre**: el QR de los PDFs (A4 y 80 mm) y de los ESC/POS apunta al informe público
(`/u/<serial>`); el IMEI va enmascarado (nunca el completo); el checklist se imprime con los
dos vocabularios (INV: 10 ítems con observación; DSN: 23 ítems con estados pasa/falla/na,
notas y batería salud → grado B).

**Pendiente de DSN**: la página pública sin sesión. Hoy la ruta existe en la app (pide sesión);
cuando DSN defina la URL pública, se pasa `enlace` y el QR apunta ahí sin tocar el diseño.
