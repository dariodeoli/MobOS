# RUC: proveedores, cuentas y empresa privada — #498

Base `dbefa557`; pruebas separadas, sin cambios de producto ni permisos. Se usa la interfaz normal: entrada demo como Dueño y navegación a Compras, Bancos y cuentas, y Organización → Datos fiscales. No se inyectan registros ni se simulan componentes.

| Criterio | Resultado |
|---|---|
| Proveedor: extraer → preview → aceptar → guardar → editar nuevamente | PASS a 390 claro y 1440 oscuro; nombre y RUC conservados. |
| Cuenta existente de transferencia: mismo recorrido | PASS en ambos anchos; titular y documento conservados. No se crea ni reactiva una cuenta seed. |
| Empresa privada: mismo recorrido | PASS en ambos anchos; nombre legal y RUC conservados. |
| Consentimiento | PASS: el nombre anterior no cambia mientras se muestra el resultado simulado. |
| Sin API de datos ni errores React | PASS: toda ruta `/api/` interceptada, cero llamadas de datos. Solo se permite contabilizar separadamente el tracking anónimo de la demo. URLs HTTPS abortadas. |
| Permisos y aislamiento | Perfil demo Dueño por entrada normal; sin ampliar módulos, roles, piloto ni proveedor real. Una página/contexto nuevo por caso. |

Corrida final: `MOBOS_QA_PORT=5317 MOBOS_QA_OUT=/tmp/mobos-ruc498-consumidores-qa npx playwright test -c e2e/ruc498-consumidores.frontend.config.js`: **6/6 PASS, 14.0 s**. Log local `/tmp/mobos-ruc498-consumidores-qa-temas.log`; cero capturas, traces y video. ESLint selectivo y diffcheck aprobados.

La spec se registra también en `e2e/nav-v2.frontend.config.js`. El workflow CI actual ejecuta los proyectos whitelist del config raíz, no la matriz frontend; el integrador debe invocar el config dedicado para acreditarla en CI. No se modifican aquí workflow ni sharding.

Límites: navegador Chromium y demo; no teclado nativo, simulador, TestFlight, consulta OwnData real ni persistencia fiscal en backend. Los pendientes de Información comercial y titular privado son otra unidad de #498, fuera de estos tres recorridos.

Novedades para el dueño

- En la demo, proveedor, cuenta y empresa privada conservan el RUC y el nombre aceptados al guardar y volver a abrir.
- Extraer muestra primero una sugerencia simulada y solo la aplica cuando la confirmás.
