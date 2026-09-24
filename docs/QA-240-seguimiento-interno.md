# #240 → Seguimiento interno: lo que el cliente todavía no abrió

El portal ya avisa al cliente (mensajes de la tienda, informe visto/no visto),
pero el **equipo** no tenía dónde ver quién quedó sin abrir lo que se le envió.
Esta entrega lleva los avisos internos a las tres superficies del CRM.

## Entregado

| Superficie | Qué muestra |
|---|---|
| **Lista de clientes** (`/api/customers`) | `stats.sinVer` por cliente: mensajes de la tienda sin ver (activos) e informes compartidos sin ver. Se calcula con dos `groupBy` más sobre los ids ya paginados |
| **Resumen rápido (ojito)** | Aviso ámbar **«Sin ver: N mensajes y M informes de la tienda»** cuando hay algo pendiente (no aparece si no hay nada) |
| **Ficha → Resumen** | Tarjeta **«Sin ver todavía»** con el detalle: el último mensaje (fecha + texto) y los informes compartidos sin abrir (fecha + equipo), y el recordatorio de avisarle por WhatsApp desde la cabecera |
| **Demo** | Los seeds ya traían un mensaje sin ver de Lucía; el listado demo calcula el `sinVer` desde el navegador (misma lógica, sin atajos) |

## Decisiones (documentadas)

- **Solo lo accionable**: los informes sin ver cuentan únicamente si hubo un
  **envío** (`sharedAt`), y los mensajes solo si están **activos** (sin vencer).
- **Se apaga solo**: cuando el cliente abre su cuenta (mensaje/informe), el
  aviso desaparece de la lista, del ojito y de la ficha: es el mismo visto/no
  visto que ya se viene siguiendo.
- **Sin columnas nuevas**: el aviso entra en el resumen rápido y el Resumen de
  la ficha (la tabla de Clientes quedó sin más ancho tras los fixes de #249).

## Evidencia

| Evidencia | Qué cubre |
|---|---|
| `docs/QA-240-mensajes-tienda/05-ficha-seguimiento.png` | Ficha → Resumen con «Sin ver todavía» y el detalle del mensaje |
| `docs/QA-240-mensajes-tienda/06-popup-sin-ver.png` | Resumen rápido (ojito) con «Sin ver: 1 mensaje de la tienda» |
| `e2e/qa-240-mensajes-tienda.spec.js` | **2/2**: publicar → aviso en ojito/Resumen → el cliente abre el portal → el aviso se apaga |
| `backend/tests/customer-portal.mjs` | `stats.sinVer.mensajes = 1` antes de que el cliente abra la cuenta, 0 informes sin envío |

## Checks

`npm run lint` 0 errores · builds FE/BE con `BUILD_ID` ✓ · `npm test` ✓ ·
backend `test:unit` ✓ · `test:e2e:smoke` ✓ · mini arnés HTTP PASS.
