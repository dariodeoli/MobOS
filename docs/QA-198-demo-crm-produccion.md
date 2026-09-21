# QA #198 — Demo público de Clientes/Servicio en producción

**Estado: ✅ verificado post-deploy (v1.0.129).** Corrida headless del
`2026-09-21` contra `app.moboss.online/demo` y `clientes.moboss.online`:
salida **0**, sin hallazgos.

## Spec reutilizable

```bash
node e2e/prod/187-clientes.mjs          # capturas en QA198_SHOTS (por defecto /tmp/qa198)
```

- Entra a la demo (perfil Dueño o acceso anónimo, lo que esté deployado) y
  verifica la ficha con datos ficticios, WhatsApp, portal por token demo,
  `?cliente=` y Servicio Técnico, sin llamadas al API real.
- Verifica los públicos con token inválido (mensaje genérico + 404 de la API).
- **Salida:** `0` = todo verificado; `3` = demo completo todavía sin deployar.
- Entornos alternativos: `QA_APP`, `QA_PORTAL`, `QA_API`, `QA198_SHOTS`.

## Resultado de la corrida (v1.0.129)

| Punto | Resultado | Captura |
|---|---|---|
| Seeds ficticios visibles (Lucía con deuda, mayorista, final) | ✅ | — |
| Aviso “Modo demo” en la ficha | ✅ | — |
| **Deuda:** `Saldo pendiente: Gs 1.500.000` y últimas órdenes (MOB-#0008) | ✅ | `03-ficha-deuda.png` |
| **Cronología** con eventos (“Pedido creado”, comentario del equipo) | ✅ | `04-ficha-cronologia.png` |
| **Seguro** activo con **12,5%** (interruptor tomado y deshabilitado) | ✅ | `05-ficha-seguro.png` |
| **WhatsApp** con plantilla demo (“Pedido listo para retirar”) | ✅ | `06-whatsapp-plantilla.png` |
| **Portal por token demo** · `/cuenta` con saldo y pedidos | ✅ | `07-portal-cuenta.png` |
| **Portal por token demo** · vitrina con pedidos | ✅ | `08-portal-vitrina.png` |
| **`?cliente=`** abre la ficha demo | ✅ | `09-cliente-param.png` |
| **Servicio Técnico** con OS-#0001/OS-#0002 | ✅ | `10-servicio-demo.png` |
| **Cero llamadas al API real** durante el recorrido | ✅ (`apiReal: []`) | — |
| Públicos con token inválido (cuenta, vitrina, garantía) | ✅ genérico + API 404 | `11-publico-*.png` |

`resumen.json` de la corrida: `pendienteDeploy = false`, `hallazgos = []`.

## Hallazgos

Ninguno del dominio CRM. Observaciones ya conocidas fuera del alcance:

- En demo quedan 401 de otros dominios (presence, créditos, impresoras,
  avatar): ruido conocido, no bloquea.
- El agente de impresión local (`127.0.0.1:17890`) no responde en headless: es
  el comportamiento esperado (sin agente instalado).
