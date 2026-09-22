-- #242: normaliza Product.category a claves controladas (inferidas del nombre).
UPDATE "Product" SET category = 'IPHONE' WHERE UPPER(category) NOT IN ('IPHONE','MACBOOK','IPAD','WATCH','AIRPODS','ACCESORIOS','SERVICIO','OTRO') AND (category ILIKE '%iphone%' OR category ILIKE '%celular%' OR name ILIKE '%iphone%');
UPDATE "Product" SET category = 'MACBOOK' WHERE UPPER(category) NOT IN ('IPHONE','MACBOOK','IPAD','WATCH','AIRPODS','ACCESORIOS','SERVICIO','OTRO') AND (category ILIKE '%macbook%' OR name ILIKE '%macbook%');
UPDATE "Product" SET category = 'IPAD' WHERE UPPER(category) NOT IN ('IPHONE','MACBOOK','IPAD','WATCH','AIRPODS','ACCESORIOS','SERVICIO','OTRO') AND (category ILIKE '%ipad%' OR name ILIKE '%ipad%');
UPDATE "Product" SET category = 'WATCH' WHERE UPPER(category) NOT IN ('IPHONE','MACBOOK','IPAD','WATCH','AIRPODS','ACCESORIOS','SERVICIO','OTRO') AND (category ILIKE '%watch%' OR name ILIKE '%watch%');
UPDATE "Product" SET category = 'AIRPODS' WHERE UPPER(category) NOT IN ('IPHONE','MACBOOK','IPAD','WATCH','AIRPODS','ACCESORIOS','SERVICIO','OTRO') AND (category ILIKE '%airpods%' OR category ILIKE '%audio%' OR name ILIKE '%airpods%');
UPDATE "Product" SET category = 'ACCESORIOS' WHERE UPPER(category) NOT IN ('IPHONE','MACBOOK','IPAD','WATCH','AIRPODS','ACCESORIOS','SERVICIO','OTRO') AND (category ILIKE '%accesorio%' OR category ILIKE '%funda%' OR category ILIKE '%protector%');
UPDATE "Product" SET category = 'OTRO' WHERE UPPER(category) NOT IN ('IPHONE','MACBOOK','IPAD','WATCH','AIRPODS','ACCESORIOS','SERVICIO','OTRO');
