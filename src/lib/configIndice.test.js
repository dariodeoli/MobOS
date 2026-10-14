import { describe, expect, it } from 'vitest'
import { INDICE_CONFIG, buscarAjustes, destinoAjuste, migasAjuste, normalizarTexto } from './configIndice'

const ids = (consulta, opciones = { esOwner: true }) => buscarAjustes(consulta, opciones).map(e => e.id)

describe('índice de ajustes (#410)', () => {
  it('normaliza acentos y mayúsculas', () => {
    expect(normalizarTexto('  Cotización DÓLAR ')).toBe('cotizacion dolar')
  })

  it('encuentra los ajustes pedidos por sus sinónimos', () => {
    expect(ids('impresora')).toContain('impresoras')
    expect(ids('ticket')).toContain('ticket')
    expect(ids('etiquetas')).toContain('etiquetas')
    expect(ids('costos vendedor')[0]).toBe('costos-vendedor')
    expect(ids('dolar')).toContain('cotizacion-dolar')
    expect(ids('COTIZACION')).toContain('cotizacion-dolar')
    expect(ids('ruc')).toContain('datos-fiscales')
    expect(ids('timbrado')).toContain('datos-fiscales')
    expect(ids('numeracion')).toContain('numeracion')
    expect(ids('contraseña')).toContain('contrasena-reauth')
    expect(ids('sesiones')).toContain('sesiones')
    expect(ids('deposito')).toContain('ubicaciones-deposito')
    expect(ids('colores')).toContain('logo-colores')
    expect(ids('sucursal')).toContain('sucursales')
    expect(ids('facturacion')).toContain('plan-facturacion')
    expect(ids('whatsapp')).toContain('whatsapp-plantillas')
    expect(ids('invitar')).toContain('equipo-invitar')
  })

  it('acepta coincidencia parcial', () => {
    expect(ids('impres')).toContain('impresoras')
    expect(ids('cotiz')).toContain('cotizacion-dolar')
  })

  it('un rol sin administración solo ve lo personal', () => {
    const vendedor = { esOwner: false }
    expect(ids('impresora', vendedor)).toEqual([])
    expect(ids('costos', vendedor)).toEqual([])
    expect(ids('ruc', vendedor)).toEqual([])
    expect(ids('sesiones', vendedor)).toEqual(['sesiones'])
  })

  it('arma el camino y el destino', () => {
    const impresoras = INDICE_CONFIG.find(e => e.id === 'impresoras')
    expect(migasAjuste(impresoras)).toEqual(['Configuración', 'Impresión y dispositivos'])
    expect(destinoAjuste(impresoras, { esOwner: true })).toEqual({
      vista: 'equipo',
      opciones: { subtab: 'dispositivos', ajuste: 'impresoras' },
    })
    const sesiones = INDICE_CONFIG.find(e => e.id === 'sesiones')
    expect(destinoAjuste(sesiones, { esOwner: false }).vista).toBe('mi-cuenta')
  })

  it('los ids son únicos y cada entrada tiene roles', () => {
    expect(new Set(INDICE_CONFIG.map(e => e.id)).size).toBe(INDICE_CONFIG.length)
    for (const e of INDICE_CONFIG) expect(e.roles.length).toBeGreaterThan(0)
  })
})
