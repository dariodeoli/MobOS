# AEX — envíos: flujo, estados y conciliación

Referencia: doc AEX v1.5.4. Adaptador único: `backend/lib/aex.ts`.

## Flujo

1. `autorizacion-acceso/generar` → token (10 min, cacheado 9).
2. `envios/ciudades` → códigos de origen/destino.
3. `envios/calcular` → cotización (para mostrar opciones).
4. `envios/solicitar_servicio` → **respuesta JSON Array**: `id_solicitud` + `condiciones`.
5. `envios/confirmar_servicio` → confirmación con `remitente`, `pickup`, `destinatario`
   y `entrega` (direcciones con `calle_principal`, `calle_transversal_1`, `codigo_ciudad`);
   la guía se lee del arreglo (`numero_guia`, `guia` o anidada).
6. `envios/tracking` → seguimiento por `numero_guia` **o** `codigo_operacion` (solo lectura).

## Estados y regla de oro

- **Respuesta clara con guía** → envío creado; se guarda y se sigue.
- **Respuesta sin guía interpretable = AMBIGUA** (`codigo: 'ambiguo'`): pudo haberse
  creado. **Jamás reintentar a ciegas**: primero **conciliar**.
- **Conciliación (sin crear nada)**: `POST /envios/tracking` con
  `{ codigo_operacion: 'MOBOS-SANDBOX-…' }` (solo lectura) y/o revisar el panel
  sandbox de AEX con soporte. Ejemplo del harness:
  `npm run aex:sandbox -- --consulta MOBOS-SANDBOX-80da2bde`.
- **Rechazo explícito** (código ≠ 0 con mensaje) → se informa etapa + código + mensaje
  y no se crea nada.

## Caso #231

`confirmar_servicio` respondió sin `numero_guia` interpretable (referencia
`MOBOS-SANDBOX-80da2bde`). No se repitió. La consulta de seguimiento por operación
fue aceptada y sin movimientos: **queda pendiente conciliar con AEX** (panel/soporte)
antes de cualquier nuevo intento. El parser tolera `numero_guia`, `guia`, `nro_guia`
y variantes anidadas; sin guía devuelve `ambiguo`, nunca una guía inventada.
