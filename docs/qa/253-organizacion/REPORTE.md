# Verificación · #253 grupo Organización (capturas)

Verificación del grupo **Organización** entregado por el slot INV para #253,
corrida sobre `slot/inventario` (base `origin/main` v1.0.172; el grupo todavía no
está integrado ni desplegado: producción sigue con el layout anterior).

## Cómo se verificó

- Arnés e2e aislado del worktree (Playwright, proyecto `admin`, sesión real del
  arnés) con `QA_IA_CAPTURAS` apuntando a `docs/qa/253-organizacion/`.
- Unidad: `npm test` **751 ✓** y `backend test:unit` **75 ✓**.
- Capturas por bloque en `bloques/` (viewport 1440 px, claro) generadas por
  `e2e/ia-configuracion.spec.js` («Organización: capturas por bloque»).

## Resultado por bloque

| Bloque | Captura | Qué se ve / qué se verifica |
| --- | --- | --- |
| Datos generales | `bloques/datos-generales.png` | «Datos de la tienda» con nombre, correo, dirección, ciudad, teléfono y RUC (ficha + panel de edición a la derecha). Sin `ID de la tienda` duplicado acá. |
| Identidad visual | `bloques/logos.png` | «Logo de la empresa»: un logo por modo (oscuro para claro / claro para oscuro), vista previa sobre el fondo real, prompt para generar el logo, subir/reemplazar/quitar. |
| Datos legales | `bloques/legales.png` | «Empresas/personas jurídicas (privado)» + «Titulares/socios (privado)» con RUC/cédula y estados activo/inactivo. |
| Tiendas y sucursales | `bloques/tiendas-sucursales.png` | Tarjeta unificada `tiendas-sucursales`: bloque **Tiendas** (Actual, ID, Copiar ID, Crear otra tienda, Abandonar) + bloque **Sucursales** (lista, Editar/Desactivar) con el alta en el panel derecho. |
| Numeración | `bloques/numeracion.png` | «Identificador de pedidos»: prefijo 2-3 letras, número inicial, guardado con estado y ejemplo del próximo número. |
| Archivar | `bloques/archivar.png` | «Archivar empresa» (motivo 10+ y reautenticación) + «Eliminar empresa definitivamente»; un solo flujo de archivado. |

Capturas de contexto (top/mobile/oscuro) en `despues/`; el estado anterior de la
sección está en `antes/`.

## Aserciones de la corrida

- **e2e 24/24**: `ia-configuracion` 6/6 (7 secciones, deep links, capturas por
  bloque y del grupo), `inventario-unidades` 20/20, `informe-publico-checklist`
  1/1, `servicio-tecnico` 4/4.
- **Sin duplicaciones**: la tarjeta `tiendas-sucursales` es única; «Archivar
  tienda» no existe (0) y «Archivar empresa» queda en un solo lugar (1).
- **Deep links**: `/configuracion/negocio` y `/configuracion/sucursales`
  redirigen a `/configuracion/organizacion` (test de redirecciones en
  `ia-configuracion.spec.js`).
- **Sin desborde**: mobile 390×844 y tema oscuro sin scroll horizontal de
  página (`las secciones nuevas se ven en mobile y en oscuro sin desborde`).

## Pendiente de integración

PLT es el lead de la sección: al integrar, la única diferencia esperable es el
shell/navegación interna de los 7 grupos (DSN). Producción no muestra este
layout hasta el release posterior a la integración.
