import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

// Índices pg_trgm (#84): verifica que la migración dejó los cuatro índices GIN
// de búsqueda difusa y mide el antes/después en una tabla temporal (no toca
// datos reales): ILIKE '%texto%' y costo de inserción con/sin índice.
// Uso: node pg-trgm.mjs <databaseUrl> <pgBin>

const [databaseUrl, pgBin = '/opt/homebrew/bin'] = process.argv.slice(2)
if (!databaseUrl) throw new Error('Uso: pg-trgm.mjs <databaseUrl> <pgBin>')

const psql = (sql) => execFileSync(`${pgBin}/psql`, ['-X', '-v', 'ON_ERROR_STOP=1', '-At', databaseUrl], { input: sql, encoding: 'utf8' })

const ESPERADOS = ['Product_name_trgm_idx', 'Customer_name_trgm_idx', 'Order_orderNumber_trgm_idx', 'OrderItemSerial_serial_trgm_idx']
const salidaIndices = psql(`SELECT indexname || '=' || (indexdef ILIKE '%USING gin%' AND indexdef ILIKE '%gin_trgm_ops%')::text FROM pg_indexes WHERE indexname IN ('${ESPERADOS.join("','")}') ORDER BY indexname;`)
const encontrados = new Map(salidaIndices.split('\n').filter(Boolean).map((linea) => linea.split('=')))
for (const nombre of ESPERADOS) {
  assert.equal(encontrados.get(nombre), 'true', `Falta el índice GIN pg_trgm ${nombre}. Aplicá la migración 20261025000000_pg_trgm_indexes.`)
}

const salida = psql(`
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TEMP TABLE bench_prod (id serial primary key, name text);
INSERT INTO bench_prod (name) SELECT 'Producto ' || g || ' modelo ' || (g % 997) FROM generate_series(1, 20000) g;
EXPLAIN (ANALYZE, TIMING OFF) SELECT id FROM bench_prod WHERE name ILIKE '%modelo 321%';
CREATE INDEX bench_prod_name_trgm ON bench_prod USING gin (name gin_trgm_ops);
EXPLAIN (ANALYZE, TIMING OFF) SELECT id FROM bench_prod WHERE name ILIKE '%modelo 321%';
CREATE TEMP TABLE bench_sin (id serial primary key, name text);
\\timing on
INSERT INTO bench_sin (name) SELECT 'Nuevo ' || g FROM generate_series(1, 20000) g;
\\timing off
CREATE TEMP TABLE bench_con (id serial primary key, name text);
CREATE INDEX bench_con_name_trgm ON bench_con USING gin (name gin_trgm_ops);
\\timing on
INSERT INTO bench_con (name) SELECT 'Nuevo ' || g FROM generate_series(1, 20000) g;
\\timing off
`)
const lecturas = [...salida.matchAll(/Execution Time: ([\d.]+) ms/g)].map((m) => Number(m[1]))
const inserciones = [...salida.matchAll(/^Time: ([\d.]+) ms$/gm)].map((m) => Number(m[1]))
assert.equal(lecturas.length, 2, 'No se pudieron medir las dos consultas EXPLAIN ANALYZE.')
assert.equal(inserciones.length, 2, 'No se pudieron medir las dos inserciones.')
const [sinIndice, conIndice] = lecturas
const [insertSin, insertCon] = inserciones
assert.ok(conIndice <= sinIndice, `El índice no debe empeorar la lectura difusa (${sinIndice} ms -> ${conIndice} ms).`)
console.log(`pg-trgm: 4 índices GIN aplicados · lectura ILIKE '%modelo 321%' 20.000 filas: ${sinIndice.toFixed(3)} ms sin índice -> ${conIndice.toFixed(3)} ms con índice · INSERT 20.000 filas: ${insertSin.toFixed(1)} ms sin índice -> ${insertCon.toFixed(1)} ms con índice.`)
