# Migración a multiempresa

Cómo pasar la base de "una sola tienda" a "varias empresas, cada una con sus
sucursales", sin perder datos.

## Qué cambia

```
Empresa                      aislamiento total: la tienda de otro nunca ve la tuya
  └─ Sucursal                comparten catálogo y precios; stock, ventas y equipo propios
       └─ Miembros           dueño / encargado / vendedor
```

Hoy la base tiene **una tabla abierta a cualquiera** que tenga la URL y la clave
pública. Eso alcanza para una tienda interna. Con otras empresas adentro, no:
sería que cada una lea los costos y márgenes de las demás. Por eso la migración
y el cierre de permisos van **juntos**, en el mismo momento.

## El orden importa

La app publicada en Vercel no manda `empresa_id` ni está autenticada. En el
instante en que se cierran los permisos, **deja de funcionar** hasta que se
deploye la versión nueva. No hay forma de evitarlo sin mantener dos versiones en
paralelo, que para una tienda no vale la pena.

Por eso: **de noche, después de las 21:00**, cuando ya nadie carga ventas.

## Pasos

1. **Backup.** Debe existir un `fono-backup-*.json` reciente en
   `~/Documents/fono-backups/`. Sin eso, no se sigue.

2. **Crear tu usuario.** Supabase → Authentication → Users → Add user. Poné tu
   correo y una contraseña. Copiá el UUID que queda.

3. **Correr la migración.** Supabase → SQL Editor → New query → pegar
   [`multiempresa.sql`](multiempresa.sql) entero → Run.

   Antes de correrlo, en el **paso 7** del archivo: descomentá el bloque y
   reemplazá `PEGA-ACA-TU-UUID` por el UUID del paso 2. Si no lo hacés, la
   migración pasa igual pero después no vas a poder entrar a tu propia base.

4. **Verificar.** Al final del archivo hay cuatro consultas comentadas. La que
   importa:

   ```sql
   select count(*) from public.entities where empresa_id is null;  -- tiene que dar 0
   ```

   Y que los totales por colección sigan siendo los mismos de antes:

   ```sql
   select collection, count(*) from public.entities group by 1 order by 2 desc;
   ```

   Referencia al 11/09/2026: auditoria 929 · ventas 758 · productos 144 ·
   comparadorImg 73 · gastos 56 · celulares 53 · ads 8 · ventasMay 7 ·
   vendedores 5 · mayoristas 1.

5. **Deployar la app nueva.** Commit + Push. Esperar que Vercel termine.

6. **Entrar** con el correo y contraseña del paso 2.

7. **Renombrar la sucursal.** La migración crea una sola, "Casa Central", con
   todos los datos actuales adentro. Desde la app le cambiás el nombre y agregás
   las otras.

## Si algo sale mal

Mientras **no hayas deployado** todavía, se vuelve atrás abriendo los permisos
de nuevo — el bloque comentado al final de `multiempresa.sql`. Los datos no se
tocan: la migración solo agrega columnas y llena `empresa_id`, nunca borra ni
reescribe contenido.

Si ya deployaste y querés volver, hay que revertir también el commit.

## Lo que queda global

La **cotización del dólar** pasa a su propia tabla (`cotizacion`), no se repite
por empresa: es el mismo número para cualquier tienda del país. La lee todo
usuario logueado; la escribe solo la Edge Function.

## Lo que hay que revisar después

Las dos Edge Functions asumen una sola empresa:

- `resumen-diario` — hoy junta todas las ventas y manda un correo. Tiene que
  recorrer empresa por empresa y mandarle a cada dueño el suyo.
- `actualizar-dolar` — pasa a escribir en `cotizacion` en vez del `kv` de config.
