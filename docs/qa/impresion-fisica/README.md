# Prueba física de impresión (#17 launchd/CUPS · #96 USB) — salidas esperadas

Tickets de **ejemplo generados con los mismos builders que manda el agente**
(`ticketPruebaTipo`), para comparar contra el papel en la Mac del local. El
protocolo paso a paso, qué mirar en cada error y la plantilla para reportar
viven en [docs/IMPRESION-PRUEBA-FISICA.md](../../IMPRESION-PRUEBA-FISICA.md)
(con la guía de aplicación de #17 en
[docs/IMPRESION-17-LAUNCHD.md](../../IMPRESION-17-LAUNCHD.md)).

## Dónde está cada cosa en la app (IA #253)

- **Configuración → Dispositivos · Impresoras**: agregar/editar, **«Imprimir
  prueba»** (modal con los 6 tipos), comparativa y predeterminada.
- **Configuración → Dispositivos · Puentes**: vincular la Mac con el código de
  un solo uso.
- **Configuración → Dispositivos · Diagnóstico**: agente de esta computadora,
  **«Reparar conexión»**, **«Diagnóstico de red»** y **«Exportar diagnóstico»**
  (el JSON que se adjunta al issue), cobertura por sucursal.
- **Configuración → Dispositivos · Cola e historial**: trabajos pendientes y la
  **actividad** donde se confirma el número secreto del papel.
- **Configuración → Sistema · Estado del sistema**: monitoreo de la empresa y
  cancelación de la cola global.

## Archivos

| Archivo | Qué es |
| --- | --- |
| `prueba-corta-80mm.pdf` / `.jpg` | Prueba corta (la del día a día). |
| `prueba-corte-80mm.pdf` / `.jpg` | **Prueba de corte**: las 4 variantes (GS V 0, GS V 1, GS V 65 0 y GS V 66 0) con la sección etiquetada; sirve para saber cuál corta el rollo. |
| `prueba-qr-80mm.pdf` / `.jpg` | Ticket con QR y código de barras (para escanear y abrir `/prueba`). |
| `prueba-caracteres-80mm.pdf` / `.jpg` | Caracteres y acentos (CP850). |
| `prueba-pedido-80mm.pdf` / `.jpg` · `prueba-venta-80mm.pdf` / `.jpg` | Tickets completos de ejemplo. |
| `prueba-corta-58mm.pdf` / `.jpg` | El mismo ticket en rollo de 58 mm. |
| `datos-ejemplo.json` | Datos y el enlace `/prueba` del QR. |

En el JPG, los códigos salen como `[QR] <url>` y `[BARRA] <texto>`: en el papel
van dibujados; el QR abre `https://app.moboss.online/prueba?...` con el destino,
la validación, la fecha y el tipo (verificado en el QA de producción).

## Regenerar

```bash
npx vite --port 5276 --strictPort --host 127.0.0.1 &
QA_BASE_URL=http://127.0.0.1:5276 node scripts/ejemplo-prueba-fisica.mjs
```

## Criterio de cierre (igual que el protocolo)

La prueba figura exitosa **solo con entrega real y ticket verificado en papel**:
que salga completo, que el rollo **corte** y que el número de validación del
papel coincida con el de Cola e historial. «Aceptado» en la cola no alcanza.
