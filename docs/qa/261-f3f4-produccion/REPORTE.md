# Verificación en producción · #261 + impresos del abastecimiento

- Base: https://app.moboss.online
- Fecha: 2026-09-27T04:10:06.476Z
- Versión desplegada: v1.0.190
- Método: demo como dueño (sin credenciales) para las pantallas + **JS servido**
  por producción para los marcadores de cada acción (las pantallas con sesión no
  se pueden recorrer en la demo; la función la cubren los e2e).

| Ítem | Estado | Detalle |
| --- | --- | --- |
| F3 · etiquetas desde la preparación (tira + individual) | ✅ desplegado | en la versión servida (/preparacion (necesita una compra de una cuenta real)) |
| F4 · manifiesto desde la recepción | ✅ desplegado | en la versión servida (/recepcion (necesita una llegada de una cuenta real)) |
| #261 · enviar por WhatsApp (texto + PDF) | ✅ desplegado | en la versión servida (Cotizaciones → Enlace/QR (oculto en la demo)) |
| #261 · PDF de la cotización (ventas) | ✅ desplegado | en la versión servida (Cotizaciones → Enlace/QR (oculto en la demo)) |
| #261 · PDF en la página pública | ✅ desplegado | en la versión servida (/cotizacion/<token> (el cliente real)) |
| F3/F4 · manifiesto y etiquetas del lote (rama PRN) | ⏳ pendiente | no está en la versión servida; se verifica en Preparar lote → abrir un lote |

## Pasos

- ✅ demo + versión: v1.0.190
- ✅ pantalla pública de la cotización: sirve en producción (demo)
- ✅ JS servido analizado: 4335 KB de scripts

**Lectura**: 5/6 ítems están en la versión servida.
Los «pendiente» son de la rama `slot/impresion` (todavía sin integrar al momento
de esta corrida); al desplegarse, este mismo script los pasa a ✅ sin tocar nada.

## Estado al 27/09 (v1.0.190)

Los 5 ítems ✅ son lo que la versión servida ya trae (etiquetas F3 de INV, botón
«Manifiesto» de la recepción, enviar por WhatsApp, PDF de la cotización y PDF de
la página pública). El ⏳ son los impresos del lote de esta rama
(`slot/impresion`): manifiesto y etiquetas `N de M` con PDF compartible.

Dos aclaraciones honestas:

- La demo pública no tiene compras ni cotizaciones con sesión, así que los
  flujos con datos no se recorren ahí: el **despliegue** se verifica por
  marcadores en el JS servido y la **función** por e2e (informe A4 como PDF
  real, manifiesto/etiquetas del lote, cotización por WhatsApp/PDF).
- El botón «Manifiesto» de la recepción viajó en v1.0.190 pero **fallaba en
  runtime** por un bloque `supplyShipments` duplicado en `lib/api` (la última
  clave pisaba `manifest`). El fix viaja en esta rama: al desplegarse queda
  operativo (el e2e hace el click real y lo cubre).
