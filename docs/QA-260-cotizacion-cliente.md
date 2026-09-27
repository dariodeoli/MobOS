# Cotización: buscar cliente existente o crear uno nuevo (#260)

En **Cotizaciones**, el cliente se busca con el **mismo buscador del POS** y se
puede **crear la ficha sin salir de la cotización**, o cotizar a **Consumidor
final**. Al guardar, la cotización queda **ligada a la ficha** (o sin ficha, en
el caso de consumidor final).

## Qué cambió

- **Buscador** (`src/components/ventas/SellerQuotes.jsx`): por nombre, teléfono,
  CI/RUC o correo (placeholder explícito). Los resultados muestran **nombre,
  teléfono, CI/RUC y última compra** (`stats.lastOrderAt`), con el texto
  truncado para no desbordar.
- **Consumidor final**: botón rápido que completa el nombre y deja la
  cotización **sin ficha** («Sin ficha: se guarda solo el nombre»).
- **Alta rápida**: la opción «＋ Crear ficha «…»» abre
  `src/components/customers/FichaClienteModal.jsx`, que **reutiliza
  `CheckoutCustomer`** (el buscador/formulario del POS). Si el teléfono o el
  CI/RUC ya existen, devuelve la ficha existente. Al crearla, la cotización
  queda vinculada (`customerId` + nombre).
- El backend ya soportaba `customerId` en `POST /api/quotes` (sin cambios).
- **Resto de Servicio/Taller** (`TableroServicioGarantias.jsx`): la vista
  **Tablero** ahora usa `BarraModulo` (`barra-tablero`, con el selector
  órdenes/garantías en el contexto) y su descripción única, cerrando la
  composición compacta del dominio.

## Verificación

- e2e `e2e/qa-260-cotizacion-cliente.spec.js` (proyecto admin, **1/1**):
  1) busca una ficha con última compra y la vincula; 2) crea una ficha nueva
  desde la cotización; 3) cotiza a Consumidor final. Comprueba por API que las
  dos primeras cotizaciones quedan con `customerId` y la tercera sin ficha.
- Regresión: `qa-241-servicio-v2` + `qa-241-servicio-pipeline` + `qa-256-composicion`
  en la misma corrida (**19/19** con #260) — el Tablero no rompe AA ni
  composición.
- `npm run lint` 0 errores · `npm test` **820 ✓** · backend `test:unit` **114 ✓** ·
  `prisma:validate` ✓ · `test:e2e:smoke` **19/19** · FE build ✓.

## Capturas (`docs/QA-260-cotizacion-cliente/`)

| Captura | Qué muestra |
|---|---|
| `00-antes.png` | El buscador anterior (dropdown sin última compra ni alta rápida) |
| `01-resultados.png` | Resultados con teléfono/CI-RUC/última compra y la opción de crear ficha |
| `02-crear-ficha.png` | Alta rápida con el formulario del POS, sin salir de la cotización |
| `03-cotizacion-guardada.png` | La cotización guardada con su cliente |

## Notas

- No hubo cambios de backend ni migraciones.
- La búsqueda sigue siendo la de `/api/customers?q=`, la misma que usa el POS;
  el modal de alta reutiliza el componente compartido.

## Cierre (barrido del dominio)

Con el **Tablero** ya en composición compacta, se barrió todo el dominio
Servicio/Taller + Garantías en una corrida: `servicio-tecnico`,
`qa-241-servicio-v2`, `qa-241-servicio-pipeline`, `qa-fin-repuestos-taller` y
`qa-240-garantia-portal` → **21/21 verde**. No quedan restos rojos.
