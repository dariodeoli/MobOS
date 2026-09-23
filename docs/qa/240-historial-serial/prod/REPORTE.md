# Historial del serial (#240) · verificación en producción
- Producción: https://app.moboss.online · versión v1.0.145 · 5/5 pasos OK
- Ronda del historial del serial (consultas IMEI + reparaciones + certificaciones): **desplegada**
## Marcas en los assets desplegados
- ✅ `Cronología` (base) — la ficha de la unidad
- ✅ `Consultas IMEI` (base) — el modal de consultas del serial
- ✅ `Informe de dispositivo` (base) — el informe público
- ✅ `Consulta IMEI` (extension) — evento de consulta IMEI en la cronología
- ✅ `Reparación` (extension) — evento de reparación en la cronología
- ✅ `Certificaciones PhoneCheck` (extension) — el tablero de certificaciones
- ✅ `Repuestos no-OEM` (extension) — los repuestos en el informe público
## Pasos
- ✅ **demo: entrar y leer la versión desplegada** — v1.0.145 · capturas: 01-demo-panel.jpg
- ✅ **producción: marcas del historial del serial en los assets** — 9 assets · base presente · extensión presente: Consulta IMEI, Reparación, Certificaciones PhoneCheck, Repuestos no-OEM
- ✅ **demo: cronología del serial en la ficha de la unidad** — serial AUR0020000000000 · 1 evento(s): S · 18-sept. 10:30 a. m.Venta · Vendida en la demo · capturas: 02-cronologia-serial.jpg, 03-cronologia-eventos.jpg
- ✅ **demo: consultas IMEI del serial (historial de consultas)** — modal disponible (sin consultas del serial en la demo) · capturas: 04-consultas-imei.jpg
- ✅ **demo: informe público por serial (/u/<serial>)** — HTTP 200 · AUR0020000000000 · capturas: 05-informe-publico.jpg
## Notas
- El historial del serial de la cuenta real sale de `GET /api/inventory-units/:id/history`; en la demo se arma con los eventos de la unidad + consultas IMEI + servicio técnico del navegador.
- La página pública (`/u/<serial>`) muestra el serial y el IMEI enmascarados y no incluye datos del cliente.
- Errores de consola durante la corrida: 0.
