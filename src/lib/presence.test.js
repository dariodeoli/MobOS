import assert from 'node:assert/strict'
import { alcanceDeRuta, estaEnLinea, etiquetaPresencia, VENTANA_EN_LINEA_MS } from './presence.js'

const ahora = Date.parse('2026-09-17T15:00:00.000Z')

assert.equal(estaEnLinea('2026-09-17T14:59:30.000Z', ahora), true, 'latido reciente');
assert.equal(estaEnLinea(new Date(ahora - VENTANA_EN_LINEA_MS).toISOString(), ahora), true, 'borde de la ventana');
assert.equal(estaEnLinea(new Date(ahora - VENTANA_EN_LINEA_MS - 1).toISOString(), ahora), false, 'fuera de la ventana');
assert.equal(estaEnLinea(null, ahora), false);

assert.equal(alcanceDeRuta('/inventario/12'), 'inventario');
assert.equal(alcanceDeRuta('/pedidos/0435'), 'pedidos/0435', 'un pedido abierto se presencia aparte');
assert.equal(alcanceDeRuta('/pedidos'), 'pedidos', 'el listado no cuenta como pedido');
assert.equal(alcanceDeRuta('/pos/pedidos/0435'), 'pedidos/0435', 'la URL vieja del pedido conserva el alcance');
assert.equal(alcanceDeRuta('/'), null);
assert.equal(alcanceDeRuta(''), null);

import { inicialesDe } from './iniciales.js';

assert.equal(inicialesDe('Dario De Oliveira'), 'DO');
assert.equal(inicialesDe('Rita'), 'R');
assert.equal(inicialesDe(''), '?');

assert.equal(etiquetaPresencia([{ name: 'Dario' }]), 'Dario · 1 en línea');
assert.equal(etiquetaPresencia([{ name: 'Dario' }, { name: 'Rita' }]), 'Dario, Rita · 2 en línea');

console.log('PASS: reglas puras de presencia del frontend')
