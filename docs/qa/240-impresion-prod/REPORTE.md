# Verificación de impresión en producción · informe, certificado, constancia, etiquetas y taller en serie (#240/#220)

- Base: https://app.moboss.online
- Fecha: 2026-09-26T08:48:51.312Z
- Versión desplegada: v1.0.178
- Método: camino real de la app (demo → ficha → «Informe/Certificado/Constancia» → formato → «Descargar PDF»), el PNG del certificado por «Compartir imagen», las etiquetas y la serie del taller («Hoja de estación», «Hojas por estación» y «Certificados») desde la demo, la página /prueba del QR físico, el modal de prueba de Dispositivos y el manifest del agente publicado; PDFs armados con el HTML que manda la app y QR decodificado con Vision.

| Documento | Páginas | QR decodificado | Resultado |
| --- | --- | --- | --- |
| informe-80mm | 1 | `https://app.moboss.online/u/AUR0001000000000` | ✅ |
| informe-a4 | 1 | `https://app.moboss.online/u/AUR0001000000000` | ✅ |
| constancia-a4 | 1 | `https://app.moboss.online/u/AUR0001000000000` | ✅ |
| constancia-80mm | 1 | `https://app.moboss.online/u/AUR0001000000000` | ✅ |
| certificado-a4 | 1 | `https://app.moboss.online/u/AUR0001000000000` | ✅ |
| certificado-80mm | 1 | `https://app.moboss.online/u/AUR0001000000000` | ✅ |
| certificado-png | — | `` | ✅ |
| etiquetas-unidad-80mm | 3 | `` | ✅ |
| etiquetas-gondola-80mm | 1 | `` | ✅ |

## Pasos

- ✅ demo + versión: v1.0.178
- ✅ botón Informe en la ficha: presente
- ✅ botón Certificado en la ficha: presente (ronda con la etiqueta)
- ✅ impresión directa en la demo: aviso honesto del demo
- ✅ certificado como imagen: 180 KB · certificado-phonecheck-0000.png
- ✅ taller en serie (hoja/certificados): Hoja ✓ · Hojas por estación ✓ · Certificados ✓
- ✅ hoja de estación (demo): aviso honesto del demo
- ✅ página /prueba del QR (prueba física): destino, validación y tipo visibles
- ✅ modal de prueba (tipos): 6 tipo(s) disponibles
- ✅ agente publicado (#17/#96): v1.7.3 · sha256 y tamaño coinciden
- ✅ PDF 80 mm generado desde la app: 106462 bytes

**Lectura**: la ronda desplegada trae informe, certificado, constancia, el **certificado como PNG**
(«Compartir imagen»), las **etiquetas de unidad** y la **serie del taller** (hojas de estación y
certificados en serie, que en la demo se bloquean con el aviso honesto; sus PDFs de ejemplo viven en
docs/taller-impresos-ejemplo/). Si una fila figura ausente o en ❌, esa ronda no está desplegada o hay
una regresión. Se re-corre con el mismo comando (demo, sin credenciales).
