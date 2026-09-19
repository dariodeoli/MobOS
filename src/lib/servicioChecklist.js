// Checklist de recepción para Servicio Técnico: un solo lugar para los puntos
// por tipo de equipo, el estado físico (SI/NO) y las pruebas ejecutadas. Las
// claves son las que se guardan en `ServiceOrder.checklist`, así que no se
// renombran: las órdenes ya cargadas conservan lo marcado.

export const CHECKLISTS = {
  iPhone: [
    'Enciende',
    'Cámara frontal',
    'Sensor de proximidad / Face ID',
    'Volumen',
    'Pantalla',
    'Home / Touch ID',
    'Micrófono / Audífono',
    'Conector de carga',
    'Altavoz',
    'Cámara posterior',
    'Flash',
    'Botón de encendido',
    'Wi-Fi / Bluetooth',
    'Batería',
  ],
  iPad: [
    'Enciende',
    'Cámara frontal',
    'Botón superior',
    'Botones de volumen',
    'Botón de inicio / Touch ID / Face ID',
    'Cámara trasera',
    'Conector de auriculares',
    'Conector Lightning / USB-C',
    'Wi-Fi / Bluetooth',
    'Batería',
  ],
  'Apple Watch': [
    'Enciende',
    'Digital Crown',
    'Micrófono',
    'Botón lateral',
    'Botón para retirar la correa',
    'Sensor cardíaco eléctrico',
    'Bocina / salida de aire',
    'Sensor de oxígeno y cardíaco óptico',
    'Batería',
  ],
  MacBook: [
    'Enciende',
    'Pantalla',
    'Teclado',
    'Trackpad',
    'Puertos',
    'Conector de carga',
    'Wi-Fi / Bluetooth',
    'Batería',
  ],
  AirPods: ['Enciende', 'Carga', 'Audio', 'Micrófono', 'Cancelación de ruido', 'Estado físico'],
  Otros: ['Enciende', 'Funciona', 'Carga', 'Pantalla', 'Botones', 'Estado físico'],
}

// Estado físico declarado al recibir (tabla SI/NO de la nota de recepción).
export const ESTADO_FISICO = [
  'Enciende',
  'Chip / tarjeta SIM',
  'Sistema de carga',
  'Memoria externa',
  'Altavoz',
  'Auricular',
  'Micrófono',
  'Batería',
  'Tornillos completos',
]

// Pruebas que se ejecutan en el taller y quedan en el informe técnico.
export const PRUEBAS_EJECUTADAS = [
  'Serie / IMEI',
  'Corriente y alimentación',
  'Funcionamiento general',
  'Cámara y sensores',
  'Audio y micrófono',
  'Conectividad (Wi-Fi / Bluetooth / datos)',
]

export const TIPOS_EQUIPO = ['iPhone', 'iPad', 'Apple Watch', 'MacBook', 'AirPods', 'Otros']

export function puntosDeTipo(tipo) {
  return CHECKLISTS[tipo] || CHECKLISTS.Otros
}

// El desbloqueo se guarda como PIN y/o patrón de 3×3 (secuencia de puntos 1-9).
export function patronValido(secuencia) {
  if (!Array.isArray(secuencia)) return []
  return secuencia.map(Number).filter((punto) => Number.isInteger(punto) && punto >= 1 && punto <= 9).slice(0, 9)
}

export const TEXTO_LEGAL_RECEPCION = 'VERIFIQUE ATENTAMENTE EL DISEÑO. LA EMPRESA NO SE HACE RESPONSABLE A RECLAMOS POSTERIORES UNA VEZ CONFIRMADO EL FUNCIONAMIENTO.'

export const TEXTO_LEGAL_DESLINDE = 'SI EL DISPOSITIVO NO SE ENCIENDE, IMPOSIBILITANDO LA PRUEBA DE SUS FUNCIONES, EL CLIENTE DECLARA HABER ENTREGADO EL EQUIPO EN ESE ESTADO Y AUTORIZA SU REVISIÓN.'

export const TEXTO_LEGAL_CONFORMIDAD = 'DECLARO HABER ENTREGADO MI DISPOSITIVO EN LAS CONDICIONES DESCRIPTAS Y ACEPTO LAS CONDICIONES DEL SERVICIO.'
