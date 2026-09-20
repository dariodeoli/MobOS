import assert from 'node:assert/strict'
import test from 'node:test'
import { enviar, usbAplicaA } from '../transportes.mjs'
import { describirDispositivos, escribirEnDispositivo, estadoUsb, hex4, normalizarId, seleccionarDispositivo } from '../usb.mjs'

// USB directo (#96) sin hardware: detección por VID/PID con dispositivos
// simulados, escritura ESC/POS contra un endpoint falso y resolución del
// transporte usb → cups → lan con los transportes inyectados.

const ticket = () => Buffer.from([0x1b, 0x40, 0x1b, 0x64, 0x00])
const dispositivo = ({ vid = 0x0483, pid = 0x5743, clase = 7 } = {}) => ({
  deviceDescriptor: { idVendor: vid, idProduct: pid },
  configDescriptor: { interfaces: [{ interfaceNumber: 0, alternates: [{ bInterfaceClass: clase, endpoints: [] }] }] },
})

test('normalizarId acepta decimal, hex y rechaza lo inválido', () => {
  assert.equal(normalizarId(1234), 1234)
  assert.equal(normalizarId('1234'), 1234)
  assert.equal(normalizarId('0x04d2'), 1234)
  assert.equal(normalizarId('0X04D2'), 1234)
  assert.equal(normalizarId(''), null)
  assert.equal(normalizarId('nope'), null)
  assert.equal(normalizarId('0x10000'), null)
  assert.equal(hex4(0x0483), '0x0483')
})

test('la detección por VID/PID elige la impresora y no otro dispositivo', () => {
  const teclado = dispositivo({ vid: 0x05ac, pid: 0x024f, clase: 3 })
  const impresora = dispositivo({ vid: 0x0483, pid: 0x5743 })
  const detectada = seleccionarDispositivo([teclado, impresora], { vid: 0x0483, pid: 0x5743 })
  assert.equal(detectada.device, impresora)
  assert.equal(detectada.impresora, true)
  assert.equal(detectada.vid, 0x0483)
  // Con un PID que no coincide no se elige nada: nunca se manda a otro equipo.
  assert.equal(seleccionarDispositivo([teclado, impresora], { vid: 0x0483, pid: 0x1111 }), null)
  // Sin VID/PID configurados se usa la interfaz de clase printer.
  assert.equal(seleccionarDispositivo([teclado, impresora]).vid, 0x0483)
  assert.equal(seleccionarDispositivo([teclado]), null)
  assert.deepEqual(describirDispositivos([]), [])
})

test('sin la dependencia nativa el agente informa y no rompe', async () => {
  const estado = await estadoUsb({ activo: true, vid: '0x0483', pid: '0x5743' })
  // En el repo node-usb no es dependencia obligatoria: el módulo no está
  // instalado y el estado tiene que ser "no disponible" con motivo, no un throw.
  assert.equal(estado.disponible, false)
  assert.equal(estado.transporte, 'ninguno')
  assert.ok(estado.motivo.length > 0)
  const apagado = await estadoUsb({ activo: false })
  assert.equal(apagado.disponible, false)
  assert.match(apagado.motivo, /apagado/i)
})

test('los bytes ESC/POS van al endpoint de salida del dispositivo', async () => {
  const escritos = []
  const device = {
    open: () => {},
    close: () => {},
    interface: () => ({
      claim: () => {},
      endpoints: [
        { direction: 'in', transfer: () => { throw new Error('no debe usarse el endpoint de entrada') } },
        { direction: 'out', transfer: (datos, listo) => { escritos.push(Buffer.from(datos)); listo(null) } },
      ],
    }),
  }
  await escribirEnDispositivo(device, ticket())
  assert.equal(escritos.length, 1)
  assert.deepEqual([...escritos[0]], [...ticket()])
})

test('un endpoint sin salida o un error de escritura se rechazan', async () => {
  await assert.rejects(() => escribirEnDispositivo({ open: () => {}, close: () => {}, interface: () => ({ claim: () => {}, endpoints: [] }) }, ticket()), /endpoint de salida/i)
  const device = { open: () => {}, close: () => {}, interface: () => ({ claim: () => {}, endpoints: [{ direction: 'out', transfer: (_datos, listo) => listo(new Error('USB caído')) }] }) }
  await assert.rejects(() => escribirEnDispositivo(device, ticket()), /USB caído/)
  await assert.rejects(() => escribirEnDispositivo({}, ticket()), /API de escritura/i)
})

function espiaTransportes(extra = {}) {
  const llamadas = []
  return {
    llamadas,
    deps: {
      enviarLan: async () => { llamadas.push('lan'); return true },
      enviarUsb: async () => { llamadas.push('cups'); return true },
      colaLanDeCups: async () => 'MobOS_LAN',
      ...extra,
    },
  }
}

const usbQueFalla = (llamadas = []) => ({
  disponible: true,
  enviar: async () => { llamadas.push('usb'); throw new Error('USB ocupado') },
})

test('con USB disponible el trabajo sale por USB directo', async () => {
  const { llamadas, deps } = espiaTransportes()
  const usb = { disponible: true, enviar: async () => { llamadas.push('usb'); return true } }
  assert.equal(await enviar('lan:10.0.0.9:9100', ticket(), { usb, deps }), 'usb')
  assert.deepEqual(llamadas, ['usb'])
})

test('si el USB falla, el respaldo es la cola CUPS', async () => {
  const { llamadas, deps } = espiaTransportes()
  const usb = usbQueFalla(llamadas)
  assert.equal(await enviar('lan:10.0.0.9:9100', ticket(), { usb, deps }), 'cups')
  assert.deepEqual(llamadas, ['usb', 'cups'])
  assert.equal(usb.ultimoError, 'USB ocupado')
})

test('sin cola CUPS el respaldo es la LAN directa', async () => {
  const { llamadas, deps } = espiaTransportes({ colaLanDeCups: async () => '' })
  assert.equal(await enviar('lan:10.0.0.9:9100', ticket(), { usb: usbQueFalla(llamadas), deps }), 'directo')
  assert.deepEqual(llamadas, ['usb', 'lan'])
})

test('con la bandera USB encendida pero sin dispositivo, sale por CUPS', async () => {
  const { llamadas, deps } = espiaTransportes()
  assert.equal(await enviar('lan:10.0.0.9:9100', ticket(), { usb: { disponible: false }, deps }), 'cups')
  assert.deepEqual(llamadas, ['cups'])
})

test('sin bandera USB el camino histórico no cambia (LAN directa)', async () => {
  const { llamadas, deps } = espiaTransportes()
  assert.equal(await enviar('lan:10.0.0.9:9100', ticket(), { deps }), 'directo')
  assert.deepEqual(llamadas, ['lan'])
})

test('el USB directo solo aplica a la impresora configurada del agente', () => {
  assert.equal(usbAplicaA('usb:ZKP8008', 'usb:ZKP8008'), true)
  assert.equal(usbAplicaA('lan:192.168.1.23:9100', 'lan:192.168.1.23:9100'), true)
  assert.equal(usbAplicaA('lan:192.168.1.99:9100', 'usb:ZKP8008'), false)
  assert.equal(usbAplicaA('usb:ZKP8008', ''), false)
  assert.equal(usbAplicaA('', ''), false)
})

test('un destino de cola con USB activo igual intenta USB y cae a CUPS', async () => {
  const { llamadas, deps } = espiaTransportes()
  assert.equal(await enviar('usb:ZKP8008', ticket(), { usb: usbQueFalla(llamadas), deps }), 'cups')
  assert.deepEqual(llamadas, ['usb', 'cups'])
})
