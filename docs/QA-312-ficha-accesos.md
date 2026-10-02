# #312 · Ficha del cliente — acciones y pestañas siempre visibles

Parte de la auditoría del demo v1.0.209 (02/10/2026): la ficha era demasiado
alta y, al scrollear, las acciones de la cabecera y las pestañas quedaban fuera
de pantalla (las pestañas, además, vivían **al final** del resumen: había que
recorrer toda la ficha para descubrirlas).

## Entregado

- La cabecera de la ficha y la barra de pestañas ahora son **una zona fija**
  (`position: sticky`) dentro del modal: al scrollear cualquier contenido
  siguen a la vista.
- Las pestañas **se movieron del final del resumen a la cabecera**, junto a las
  acciones (Portal del cliente, WhatsApp y, fuera de demo, Unificar).
- El borde inferior de la zona fija marca dónde termina y las solapas scrollean
  en horizontal cuando no entran a lo ancho (móvil).

Alcance: `src/components/customers/CustomerProfile.jsx` (ficha usada desde
Clientes y desde el resumen rápido). No se tocaron fixtures de demo: las
contradicciones de datos del demo (p. ej. «1 compra» vs «30 compras por mes»)
se resuelven en #324 (PLT).

## Medición (antes → después)

«Visible» = el control entra completo en el recuadro visible del modal,
medido con Playwright en la ficha demo de Lucía Fernández.

| Escenario | Antes | Después |
|---|---|---|
| Escritorio 1440×900 · al abrir | Acciones ✓ · **pestañas fuera (a 1135 px)** | Acciones ✓ · pestañas ✓ |
| Escritorio 1440×900 · scroll al medio | **Acciones fuera · pestañas fuera** | Acciones ✓ · pestañas ✓ |
| Escritorio 1440×900 · scroll al fondo | **Acciones fuera** · pestañas ✓ (solo al final) | Acciones ✓ · pestañas ✓ |
| Oscuro 1440×900 (mismos estados) | igual que claro | Acciones ✓ · pestañas ✓ |
| Móvil 390×844 · al abrir | Acciones ✓ · **pestañas fuera (a 1515 px)** | Acciones ✓ · pestañas ✓ |
| Móvil 390×844 · scroll al medio | **Acciones fuera · pestañas fuera** | Acciones ✓ · pestañas ✓ |
| Móvil 390×844 · scroll al fondo | **Acciones fuera** · pestañas ✓ (solo al final) | Acciones ✓ · pestañas ✓ |

## Evidencia

| Captura | Qué muestra |
|---|---|
| `antes/claro-01-inicial.png` · `antes/claro-02-scroll-medio.png` | **Antes** (escritorio claro): sin pestañas al abrir; al scrollear desaparecen acciones y pestañas |
| `antes/oscuro-01-inicial.png` · `antes/oscuro-02-scroll-medio.png` | **Antes** (escritorio oscuro): mismo comportamiento |
| `antes/movil-01-inicial.png` · `antes/movil-02-scroll-medio.png` | **Antes** (390×844): pestañas recién al final del resumen |
| `claro-01-inicial.png` … `claro-04-otra-pestana.png` | Después (claro): al abrir, al medio, al fondo y con pestaña cambiada |
| `oscuro-01-inicial.png` … `oscuro-04-otra-pestana.png` | Después (oscuro): los mismos cuatro estados |
| `movil-01-inicial.png` … `movil-04-otra-pestana.png` | Después (móvil 390×844): los mismos cuatro estados |

Gate reproducible (abre la ficha demo, scrollea al medio y al fondo, cambia de
pestaña y falla si acciones o pestañas salen del recuadro del modal):

```bash
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-MOS-CRM MOBOS_E2E_PGPORT=5510 \
  MOBOS_E2E_API_PORT=3110 MOBOS_E2E_WEB_PORT=5210 \
  npx playwright test e2e/qa-312-ficha-accesos.spec.js
```

Capturas: `MOBOS_CAPTURAS=docs/QA-312-ficha-accesos npx playwright test e2e/qa-312-ficha-accesos.spec.js`.

## Checks de esta entrega

`npm run lint` 0 errores (2 warnings preexistentes en `Precios.jsx`/otro) ·
`npm run build` ✓ · `npm --prefix backend run build` ✓ con
`backend/.next/BUILD_ID` (`a6dSkP35hocItyz4lio5T`) ·
`npm --prefix backend run prisma:validate` ✓ · `npm test` 868/868 ·
`npm --prefix backend run test:unit` 138/138 · `rg "<<<<<<<" src backend e2e`
sin resultados · `npm run db:check` «la base coincide con prisma/schema.prisma» ·
`npm run test:e2e:smoke` 19/19 · `e2e/qa-312-ficha-accesos.spec.js` 3/3 ·
specs del dominio sin regresiones (25/25 en `demo-crm`, `qa-236-clientes`,
`qa-160-perfil`, `qa-268-unificar-clientes`, `qa-241-clientes-v2`,
`qa-241-ficha-paso6` —incluye AA v2 en claro/oscuro 1280 y 390— y
`modales-tamanos`).
