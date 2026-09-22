# QA #222 — Barrido de "demo"/"DEMO" en datos visibles

Búsqueda documentada:

```bash
grep -rn "[Dd][Ee][Mm][Oo]" src/lib src/components \
  | grep -E "'[^']*[Dd][Ee][Mm][Oo][^']*'|\"[^\"]*[Dd][Ee][Mm][Oo][^\"]*\"" \
  | grep -viE "mobos:demo|demo-|Demo[A-Z]|demo[A-Z]|import |require\(|@/lib/printing/demo|/demo'|/demo\"|DEMO_MODE|isDemoRuntime|demoSession"
```

Guardia automática (corre en `npm test`): `src/lib/demoBarrido.test.js` recorre
equipo, catálogo, empresa, sucursales, clientes, inventario y ajustes demo y falla
si un valor visible contiene "demo" (ignora ids/claves/storage, que son internos).

## Resultado

**Datos visibles: limpios.** Tienda y razón social *Aurora Móviles / Aurora Móviles S.A.*,
prefijo de pedidos **AUR**, equipo con nombres reales ficticios y emails que empiezan
con **35**, catálogo con SKU reales y seriales **AUR**, proveedores, cuentas, notas,
direcciones, clientes e inventario sin "demo".

## Se conservan (a propósito, no son datos)

- Ruta `/demo`, claves `mobos:demo-*`, ids de seeds (`demo-iphone-*`) y módulos
  (`demoMode.js`, `demoStorage.js`).
- Mensajes de sistema que explican el modo: banner “Modo demo…”, “Cómo funciona la
  demo”, toasts “Cambio simulado en la demo”, marcas de simulación en impresión y
  copys de pantallas de Configuración/Servicio que aclaran que el guardado es local.
