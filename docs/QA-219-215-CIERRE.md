# Cierre #219 / #215 — evidencia de verificaciones demo/inventario en producción

Paquete de evidencia para cerrar los trackers **#219** (demo funcional y
usuarios demo) y **#215** (Inventario/Stock + demo funcional), verificado sobre
**producción v1.0.175** el 26/09 y con la última pieza pendiente viajando en
`slot/inventario`.

## #219 — Demo funcional y usuarios demo

| Criterio | Evidencia | Estado |
| --- | --- | --- |
| Verificación funcional en la demo (no fake de UI) | `e2e/prod/219-215-inventario.mjs` **7/7**: tránsito → recepción (depósito + reimpresión) deja la unidad fuera del listado; checklist se marca, guarda y calcula grado/puntaje; persiste al reabrir; la verificación física queda firmada por el usuario demo. Capturas `docs/qa/219-215-produccion/`. | ✅ producción |
| Reservas y acciones de inventario por usuarios demo | `e2e/prod/187-inventario.mjs` **13/13** (reservas con cliente/vencimiento, alta con costo diferido, acciones masivas, recepción en tránsito, conteo). Capturas `docs/qa/187-inventario/`. | ✅ producción |
| Sin llamadas pagas / session-only | El recorrido de producción registra **0 llamadas de impresión/inventario** y la demo no toca la base; el barrido de storage sigue verde en la suite. | ✅ producción |
| Nombres ficticios, correo que empieza con `35` y sin la palabra «demo» | Paso nuevo del script de producción: **6 integrantes**, correos `358001xx@correo.com.py`, ninguna fila menciona «demo» (`09-equipo-demo.jpg`). | ✅ producción |
| Foto de perfil (aleatoria) de los usuarios demo | Rama `slot/inventario`: retratos ficticios locales por id (`src/lib/demo/avatares.js`), visibles en Equipo y en la firma de verificación; e2e nuevo en `demo-anonimo` con capturas `docs/qa/219-demo-fotos/` y doc `docs/QA-219-demo-usuarios.md`. | 🟡 en rama (post-deploy) |

## #215 — Inventario/Stock + demo funcional

| Módulo | Evidencia | Estado |
| --- | --- | --- |
| Compactación, columnas, costo USD, editar/acciones, estados visuales (#216) | `187-inventario` 13/13 incluye listado de una línea, costo diferido USD/Gs y acciones; `246` **4/4**: 23 filas de 44 px parejas, capacidad una sola vez, sin columna «Modelo / variante». | ✅ producción |
| Acciones masivas y orden (#217) | `187-inventario`: acciones por lote, copiar IMEIs, CSV; orden por modelo. | ✅ producción |
| Tránsito: recepción, ubicaciones con color, reimpresión (#218) | `187-inventario` (tránsito + recepción con depósito y reimpresión) y `219-215` (la unidad sale del tránsito al recibir). ETA/despachó/recibió viajan en `main` desde v1.0.167+. | ✅ producción |
| Vendidos con filtros y comprobante (#215 §10) | `187-inventario`: vendidos con estados de entrega, UBI y comprobante rápido. | ✅ producción |
| Checklist PhoneCheck, informe público y certificado (#240, dentro de #215) | `219-215` (checklist con grado/puntaje y persistencia) e informes públicos en producción (rondas .144–.175). | ✅ producción |
| Usuarios demo del equipo (foto) | Igual que #219: en rama, post-deploy. | 🟡 en rama (post-deploy) |
| Barrido de «demo» con guardia (#222) | `src/lib/demoBarrido.test.js` en verde en `npm test` (758). | ✅ main |

## Reproducir

```bash
node e2e/prod/219-215-inventario.mjs   # 7/7 — tránsito, checklist, verificación, equipo demo
node e2e/prod/246-fila-unica.mjs       # 4/4 — tabla de inventario
node e2e/prod/187-inventario.mjs       # 13/13 — recorrido completo
npm test && npm --prefix backend run test:unit
```

## Pendiente de deploy (una sola pieza)

La **foto de perfil de los usuarios demo** (más los dos arreglos de consistencia
de la demo: `getVendedores` y `lastVerifiedAt`) viaja en `slot/inventario`. Con
el release, la verificación post-deploy es automática:

```bash
node e2e/prod/219-215-inventario.mjs   # el paso «equipo demo» debe mostrar fotos
node e2e/prod/219-215-inventario.mjs   # y la firma de verificación en la ficha
```

## Novedades para el dueño

- La **demo publicada** permite probar de punta a punta la **recepción de un
  equipo en tránsito** (con su depósito y reimpresión de etiqueta) y el
  **checklist de inspección** con grado y puntaje, sin tocar datos reales.
- El **equipo demo** tiene nombres y correos ficticios (empiezan con 35, sin la
  palabra «demo»), y desde el próximo release también **fotos de perfil**.
- La **verificación física** del inventario queda firmada por el usuario demo:
  con el release, la ficha muestra quién verificó y su foto.
- Los recorridos automáticos de inventario en producción quedan documentados y
  re-ejecutables (`docs/qa/219-215-produccion/`, `docs/qa/246-fila-unica/`,
  `docs/qa/187-inventario/`).
