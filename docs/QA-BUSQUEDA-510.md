# #510 · Búsqueda global y fuentes autorizadas

Base00cec8b4, rama codex/busqueda-permisos-510. Alcancefrontend: sin cambios a auth/client, API, #502, permisos de servidor ni datos reales.

## Causa y solución

`GlobalSearch` filtraba los IDs visibles pero construía previamente un objeto de promesas iniciadas de todos los endpoints. Con VENDEDOR, `/api/warranties`, `/api/purchases` y `/api/suppliers` devolvían403; la invalidación de datos privados de #502 actuaba correctamente y las otras respuestas dejaban de ser vigentes. El trace del retest muestra cotización creada201/consultada200 pero buscador con aviso de conexión.

Vistas ausentes, null o no-array se normalizan a un array vacío: no conceden fuentes ni accesos de navegación. Las fuentes ahora son funciones y se invocan únicamente para los IDs habilitados por las vistas actuales. Ningún grupo básico se salta ese filtro. El rol VENDEDOR tampoco consulta compras/garantías aunque se entregue una lista de vistas incoherente. Proveedores elige su proyección antes de consultar: ADMIN/GERENTE nombres completos; otros roles, solo badges si esa vista está habilitada. Se elimina el sondeo403→badges. No se cambia el tratamiento401/402/403 del cliente ni se evita la purga de contexto.

## Evidencia

- RED antes de corregir: el caso frontend de vendedor encuentra cotización pero la aserción de peticiones negativas detecta consultas a fuentes fuera del menú (log `/tmp/mobos510-red.log`).
- GREEN `npx playwright test -c e2e/busqueda510.frontend.config.js`:5/5, con SesionProvider y PaletaComandos reales y API ficticia local. Vendedor busca/abre cotización sin consultas ajenas; ADMIN mantiene fuentes autorizadas; técnico no consulta módulos fuera de su navegación; null/undefined con ADMIN tampoco habilitan ninguna fuente. Se miden requests posteriores al bootstrap del proveedor, no se confunden con hidrataciones independientes. Sin DB, screenshots ni APIs reales.
- `node --test src/lib/busquedaGlobal.test.js`:3/3 PASS. `npx eslint src/components/app/GlobalSearch.jsx`:0errores/0warnings. `npm run build`:exit0. Sin repetir fullsuite mientras corre el gate integrado.
- `e2e/pos-busqueda-global.spec.js` mantiene su alta real de cotización y navegación; agrega aserción0requests a garantías/compras/proveedores/unidades fuera del menú vendedor. **Este caso con PG debe ejecutarlo el integrador en su arnés aislado**, no se afirma PASS local con DB. Las regresiones existentes #502 deben seguir verificando purga ante denegación real.

## Novedades para el dueño

- Buscar cotizaciones consulta solamente las secciones disponibles para tu usuario.
- El buscador ya no solicita compras o proveedores sin permiso y evita vaciar la pantalla del vendedor por esas consultas innecesarias.
