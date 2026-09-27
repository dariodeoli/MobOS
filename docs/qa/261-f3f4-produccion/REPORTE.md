# Verificación en producción · #261 + impresos F3/F4

- Base: https://app.moboss.online
- Fecha: 2026-09-27T00:50:31.607Z
- Versión desplegada: v1.0.188
- Método: demo como dueño (sin credenciales) → `/abastecimiento` y `/cotizaciones` + la página pública; capturas de pantalla.

| Ítem | Estado | Detalle | Captura |
| --- | --- | --- | --- |
| F3 · etiquetas desde la preparación | ⏳ pendiente | la versión desplegada todavía no trae el botón | `01-abastecimiento.jpg` |
| F4 · manifiesto desde la recepción | ⏳ pendiente | necesita una recepción activa / todavía no desplegado | `01-abastecimiento.jpg` |
| #261 · enviar por WhatsApp (texto + PDF) | ⏳ pendiente | la versión desplegada todavía no trae la acción | `03-cotizacion-enlace.jpg` |
| #261 · PDF de la cotización | ⏳ pendiente | la versión desplegada todavía no trae el PDF | `03-cotizacion-enlace.jpg` |
| #261 · PDF en la página pública | ⏳ pendiente | la versión desplegada todavía no trae el PDF público | `04-cotizacion-publica.jpg` |

## Pasos

- ✅ demo + versión: v1.0.188
- ✅ cotizaciones en la demo: la demo no listó cotizaciones

**Lectura**: los ítems «pendiente» son de la rama `slot/impresion` (todavía sin
integrar/desplegar al momento de esta corrida). Cuando el release los incluya, se
vuelve a correr este mismo script y los chequeos pasan a ✅ solos.
