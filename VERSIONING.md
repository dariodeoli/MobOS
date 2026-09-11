# Regla de versión visible

Cada actualización publicada debe incrementar el último punto de la versión visible:

`MobOS 0.2.1` → `MobOS 0.2.2` → `MobOS 0.2.3`

La fuente única es `src/lib/brand.js`, mediante `APP_VERSION`. Los pies de la aplicación deben leer esa constante y mostrar también `Coding by OwnCoding` enlazado a `https://owncoding.dev/`. No escribir versiones fijas en nuevos módulos.
