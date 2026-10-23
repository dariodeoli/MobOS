import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { desplazamientoParaMitadSuperior } from './enfoque.js'

describe('desplazamientoParaMitadSuperior', () => {
  const base = { visibleTop: 0, visibleHeight: 508 }

  it('no mueve un campo que ya está en la mitad superior', () => {
    assert.equal(desplazamientoParaMitadSuperior({ ...base, campoTop: 120, campoBottom: 164 }), 0)
  })

  it('sube un campo bajo hasta la zona alta del área visible', () => {
    const delta = desplazamientoParaMitadSuperior({ ...base, campoTop: 400, campoBottom: 444 })
    assert.ok(delta > 250)
    assert.ok(400 - delta < 508 / 2)
  })

  it('trae un campo que quedó arriba del área visible', () => {
    assert.ok(desplazamientoParaMitadSuperior({ ...base, campoTop: -30, campoBottom: 14 }) < 0)
  })

  it('respeta el borde superior cuando el teclado corre el área visible', () => {
    const delta = desplazamientoParaMitadSuperior({ visibleTop: 40, visibleHeight: 400, campoTop: 380, campoBottom: 424 })
    assert.ok(380 - delta >= 40)
  })
})
