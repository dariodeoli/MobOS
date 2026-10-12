# Publicación protegida de MobOS

El despliegue continúa siendo exclusivo de `MOBOS_INTEGRATOR=1 npm run release:publish`.
El comando publica la versión **ya integrada y verificada**: no incrementa la versión,
no crea commits y no ejecuta pushes. No existe un modo de bypass.

## Preparar la versión para revisión

1. En una rama de entrega distinta de `main`, agregar a `docs/NOVEDADES.md` la sección
   `## vX — fecha` de la próxima versión, con novedades de producto por módulo.
2. Ejecutar `npm run release:prepare-version`. Incrementa el patch de `version.json`,
   ambos paquetes y ambos lockfiles, y deja esos archivos y NOVEDADES en staging.
   No compila, no crea commits, no pushea y no consulta credenciales ni proveedores.
   Rechaza cambios pendientes ajenos a NOVEDADES y no funciona sobre `main` o HEAD detached.
3. Revisar y crear el commit de la rama mediante el procedimiento habitual; abrir el
   PR protegido. Esperar los cuatro checks obligatorios, los cuatro shards E2E y
   los demás gates del integrador. Integrar mediante merge commit con el SHA del PR
   fijado, sin `--admin`, force-push ni cambios a la protección.

Estos pasos son un procedimiento operativo; la preparación del parche no autoriza
su aplicación, un commit, un merge o un despliegue.

## Publicar el SHA integrado

1. Sincronizar el checkout del integrador por fast-forward, en `main`, limpio y sin
   archivos no ignorados pendientes. `HEAD`, `origin/main` y el main vivo de GitHub
   deben coincidir. Esperar el CI de **push a main** de ese SHA.
2. Ejecutar `npm run release:build-current`. Compila frontend y backend sin bump;
   exige BUILD_ID y escribe `dist/mobos-release-build.json`, artefacto ignorado que
   vincula SHA, versión, BUILD_ID y hashes del contenido de ambos builds. Excluye
   la caché de Next y el propio archivo de metadatos. Un build anterior sin esta
   procedencia no se acepta; conservar sus pruebas independientes antes de compilar.
3. Ejecutar `MOBOS_INTEGRATOR=1 npm run release:publish`. Valida identidad y notas,
   versiones de paquetes/lockfiles, procedencia y contenido de los builds, protección
   strict y exactamente los cuatro checks de GitHub Actions (`app_id=15368`):
   - `Frontend (lint + build)`
   - `Backend (typecheck + build)`
   - `Integration (backend harness, isolated Postgres)`
   - `E2E (Playwright + self-hosted backend/Postgres)`

   Cada check más reciente debe estar completo y exitoso para el SHA actual; también
   debe estar exitoso el CI más reciente de push a main. Ausencias, checks pendientes,
   errores, respuestas inválidas o reglas adicionales detienen la publicación.
   Los checks se consultan por API con paginación. No se escriben estados/checks.
   Después de los gates se obtiene la configuración privada existente de despliegue
   y se vuelve a comprobar la identidad. Se envía **una sola solicitud** al webhook.

4. Registrar la identidad del deploy y verificar el commit desplegado. Ejecutar el
   smoke incluyendo `MOBOS_API_URL`, verificar los flujos afectados y completar
   conciliación de esquema e issues según las reglas del integrador.

No se genera ni imprime configuración privada. Si el webhook falla, devuelve 429 o
su resultado es incierto, no hay reintentos automáticos: inspeccionar primero el
estado de la operación. Ejecutar el comando de nuevo sería una nueva solicitud
manual para la misma versión, no un bump; no debe hacerse a ciegas. El webhook no
fija por sí mismo el commit que selecciona el proveedor: verificarlo después.

## Compatibilidad

`npm run release:prepare` conserva el comportamiento local anterior: incrementa
el patch y compila ambos proyectos sin publicar. **No es un dry-run sin cambios**
y no es el paso de preparación de un PR protegido.

La invocación antigua `--publish --deploy` queda bloqueada; usar el comando de paquete
actualizado, que incorpora `--deploy-current`. `--check-deploy-config` sigue disponible
como comprobación explícita de la configuración privada, separada de la publicación.
Los resúmenes anteriores que describen release:publish como bump + commit + push
corresponden al flujo sustituido; no seguir esos pasos para la publicación protegida.

## Verificación dirigida

`npm run test:release` prueba los gates y efectos con GitHub/webhook simulados y
regresiones de CLI/Git en repositorios temporales descartables, sin red ni credenciales reales. Las pruebas también se incluyen en `npm test`, por lo
que el check Frontend de CI las ejecuta. No reemplazan los gates HTTP/E2E, de base de
datos ni el smoke de producción.
