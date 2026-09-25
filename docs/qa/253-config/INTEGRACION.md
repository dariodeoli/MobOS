# #253 · Integración de la sección Configuración (lead PLT)

Verificación del conjunto de la sección con los grupos ya entregados, hecha
sobre una rama **local de integración** (`tmp/253-integracion`, no se pushea):
`main` (`9d750790`) + `slot/plataforma` + `slot/diseno` + `slot/pos` +
`slot/componentes`.

## Resultado

- Merge sin conflictos de **código**: solo chocaron `playwright.config.js` y
  `e2e/sharding.json` porque **cada rama nueva registra su spec**. Receta:
  unir los `testMatch` que agregan y regenerar con
  `node scripts/e2e-shards.mjs --generar` (quedó 156/156/156).
- **42 e2e verdes** en el conjunto: `qa-253-config-grupos` (DSN: estructura de
  los 7 grupos + AA + capturas), `qa-253-equipo-acceso` (POS), `ia-configuracion`
  (PLT: Mi perfil desde el avatar, Precios único, Documentación en Ayuda),
  `menu-ia`, `configuracion-lote5`, `config-guardado`, `dsn-241-a11y` (la
  paleta de la biblioteca **v0.28** mantiene los valores: el spec v0.27 sigue
  válido) y `permissions`.
- Build integrado OK: chunk del panel **48,9 KB** (sigue muy por debajo de los
  87 KB previos a #247); biblioteca `owncoding-ui` v0.28.0 instalada sin
  rupturas.

## Grupos pendientes al momento de esta verificación

- **INV** (Organización, Tiendas y sucursales), **CRM** (Mi cuenta/perfil),
  **FIN** (Comercial) y **PRN** (Dispositivos/Impresoras vs Sistema): sus ramas
  todavía no tenían commits de #253.

## Recordatorios de integración (ya publicados en el issue)

- Shell/rutas/metadata son de PLT; `Config.jsx` se edita **por sección**.
- Cuando CRM saque `<MiIdentidad />` de `Config.jsx`, actualizar
  `e2e/ia-configuracion.spec.js` (Mi cuenta hoy espera `Tu nombre de vendedor`)
  y `e2e/config-guardado.spec.js` (navega por `/configuracion/mi-cuenta`).
- `/mi-perfil` ya existe para el contenido del perfil (foto, nombre, correo).
