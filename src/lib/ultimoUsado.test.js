import assert from 'node:assert/strict'
import test from 'node:test'
import { EVENTO_ULTIMO_USADO, claveUltimo, leerUltimo, olvidarUltimo, recordarUltimo } from './ultimoUsado.js'

// #209: «último usado como predeterminado», namespace mobos:<área>:<dato>.
// Cubre también la compatibilidad con el primer namespace desplegado
// (`mobos:ultimo:`) y con los valores crudos viejos.

function storageFalso() {
  const datos = new Map()
  return {
    datos,
    getItem: (clave) => (datos.has(clave) ? datos.get(clave) : null),
    setItem: (clave, valor) => datos.set(clave, String(valor)),
    removeItem: (clave) => datos.delete(clave),
  }
}

function conStorage(prueba) {
  const anterior = globalThis.localStorage
  globalThis.localStorage = storageFalso()
  try {
    prueba(globalThis.localStorage)
  } finally {
    if (anterior === undefined) delete globalThis.localStorage
    else globalThis.localStorage = anterior
  }
}

test('la clave lleva el namespace y no lo duplica (incluido el primer deploy)', () => {
  assert.equal(claveUltimo('pos:vendedor'), 'mobos:pos:vendedor')
  assert.equal(claveUltimo('mobos:pos:vendedor'), 'mobos:pos:vendedor')
  assert.equal(claveUltimo('mobos:ultimo:inventario:orden'), 'mobos:inventario:orden')
  assert.equal(claveUltimo('  config:historial-filtro  '), 'mobos:config:historial-filtro')
  assert.equal(claveUltimo(''), null)
  assert.equal(claveUltimo(undefined), null)
})

test('sin nada guardado devuelve el default sensato (opciones o posicional)', () => {
  conStorage(() => {
    assert.equal(leerUltimo('pos:vendedor', { porDefecto: 'sin-asignar' }), 'sin-asignar')
    assert.equal(leerUltimo('inventario:motivo-baja', 'Daño'), 'Daño')
    assert.equal(leerUltimo('inventario:motivo-baja'), '')
  })
})

test('recuerda y devuelve el valor (texto, número, booleano y objeto)', () => {
  conStorage((storage) => {
    recordarUltimo('pos:vendedor', 'vendedor-1')
    assert.equal(leerUltimo('pos:vendedor', { porDefecto: '' }), 'vendedor-1')
    assert.equal(storage.datos.get('mobos:pos:vendedor'), '"vendedor-1"')

    recordarUltimo('pos:entrega', 3)
    assert.equal(leerUltimo('pos:entrega', { porDefecto: 1 }), 3)

    recordarUltimo('shell:menu-plegado', true)
    assert.equal(leerUltimo('shell:menu-plegado', { porDefecto: false }), true)

    recordarUltimo('shell:nav-plegados', { Vender: true })
    assert.deepEqual(leerUltimo('shell:nav-plegados', { porDefecto: {} }), { Vender: true })
  })
})

test('valida al leer: si la opción guardada ya no sirve, cae al default', () => {
  conStorage(() => {
    recordarUltimo('config:documentacion-modulo', 'Inventario')
    const modulo = leerUltimo('config:documentacion-modulo', {
      porDefecto: 'Todo',
      valido: (valor) => ['Todo', 'POS', 'Finanzas'].includes(valor),
    })
    assert.equal(modulo, 'Todo', 'una opción que ya no existe no se ofrece')
  })
})

test('lee valores viejos guardados crudos (sin JSON)', () => {
  conStorage((storage) => {
    storage.datos.set('mobos:sucursal-activa:emp-1', 'suc-2')
    assert.equal(leerUltimo('sucursal-activa:emp-1', { porDefecto: null }), 'suc-2')
  })
})

test('migra el namespace del primer deploy al namespace único y lo retira', () => {
  conStorage((storage) => {
    storage.datos.set('mobos:ultimo:inventario:orden', 'modelo-az')
    assert.equal(leerUltimo('inventario:orden', 'recientes'), 'modelo-az')
    assert.equal(storage.datos.get('mobos:inventario:orden'), '"modelo-az"')
    assert.equal(storage.datos.has('mobos:ultimo:inventario:orden'), false)
  })
})

test('migra claves legadas explícitas al leer (write-through) y las retira', () => {
  conStorage((storage) => {
    storage.datos.set('fono:ultimoVendedor', 'vendedor-9')
    const valor = leerUltimo('pos:vendedor', { porDefecto: '', legado: 'fono:ultimoVendedor' })
    assert.equal(valor, 'vendedor-9')
    assert.equal(storage.datos.get('mobos:pos:vendedor'), '"vendedor-9"', 'queda en el namespace nuevo')
    assert.equal(storage.datos.has('fono:ultimoVendedor'), false, 'la clave vieja se retira')
  })
})

test('el valor principal gana sobre el legado', () => {
  conStorage((storage) => {
    storage.datos.set('mobos:pos:vendedor', '"nuevo"')
    storage.datos.set('fono:ultimoVendedor', 'viejo')
    assert.equal(leerUltimo('pos:vendedor', { porDefecto: '', legado: 'fono:ultimoVendedor' }), 'nuevo')
  })
})

test('si el valor guardado no es válido, no cae al legado', () => {
  conStorage((storage) => {
    storage.datos.set('mobos:config:historial-filtro', '"vieja"')
    storage.datos.set('mobos:historial-filtro-legado', '"ventas"')
    const valor = leerUltimo('config:historial-filtro', {
      porDefecto: 'todas',
      valido: (v) => v === 'todas' || v === 'ventas',
      legado: 'mobos:historial-filtro-legado',
    })
    assert.equal(valor, 'todas')
  })
})

test('vaciar el valor olvida la clave', () => {
  conStorage((storage) => {
    recordarUltimo('inventario:motivo-baja', 'Daño')
    assert.equal(leerUltimo('inventario:motivo-baja'), 'Daño')
    recordarUltimo('inventario:motivo-baja', '')
    assert.equal(storage.datos.has('mobos:inventario:motivo-baja'), false)
    assert.equal(leerUltimo('inventario:motivo-baja', 'Otro'), 'Otro')
  })
})

test('olvidar vuelve al default y no rompe sin almacenamiento', () => {
  conStorage(() => {
    recordarUltimo('pos:cuenta', 'Caja')
    olvidarUltimo('pos:cuenta')
    assert.equal(leerUltimo('pos:cuenta', { porDefecto: 'sin-cuenta' }), 'sin-cuenta')
  })
  delete globalThis.localStorage
  assert.equal(leerUltimo('pos:cuenta', { porDefecto: 'sin-cuenta' }), 'sin-cuenta')
  assert.equal(recordarUltimo('pos:cuenta', 'Caja'), 'Caja', 'guardar no lanza sin storage')
})

test('guardar avisa a los controles sincronizados', () => {
  const anterior = globalThis.window
  const eventos = []
  globalThis.window = { dispatchEvent: (evento) => eventos.push(evento) }
  try {
    conStorage(() => recordarUltimo('pos:cuenta', 'Caja'))
    assert.equal(eventos.length, 1)
    assert.equal(eventos[0].type, EVENTO_ULTIMO_USADO)
    assert.deepEqual(eventos[0].detail, { clave: 'pos:cuenta' })
  } finally {
    if (anterior === undefined) delete globalThis.window
    else globalThis.window = anterior
  }
})
