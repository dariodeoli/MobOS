// Datos fiscales de la demo: empresas/personas jurídicas y titulares/socios
// (Configuración → Negocio → Datos fiscales). Son la semilla de la memoria de
// la pestaña: la persona puede agregar, editar y desactivar, y al salir de la
// demo vuelve todo a esta lista. Ficticios, con RUC/CI de dígito verificador
// válido y coherentes con el resto de la demo (razón social y dirección de
// `EMPRESA_DEMO`, dueño y gerente de `EQUIPO_DEMO`, cuentas de cobro con el
// mismo RUC/CI). Sin dependencias para poder testearlos en node.
import { EMPRESA_DEMO } from './empresa.js'

export const EMPRESAS_FISCALES_DEMO = [
  {
    id: 'demo-empresa-aurora',
    legalName: EMPRESA_DEMO.razonSocial,
    ruc: EMPRESA_DEMO.ruc,
    legalAddress: 'Av. Ficticia 1234 c/ Calle Ejemplo, Asunción',
    notes: 'Sociedad titular de las cuentas de Itaú, Continental y Ueno. Datos ficticios de la demo.',
    isActive: true,
  },
  {
    id: 'demo-empresa-acosta-inversiones',
    legalName: 'Acosta Inversiones E.A.S.',
    ruc: '80098765-9',
    legalAddress: 'Calle Falsa 456, Villa Morra, Asunción',
    notes: 'Sociedad del dueño que alquila el local de Villa Morra.',
    isActive: true,
  },
]

export const TITULARES_FISCALES_DEMO = [
  { id: 'demo-titular-hernan', firstName: 'Hernán', middleName: 'José', otherName: '', lastName: 'Acosta', secondLastName: 'Benítez', document: '5215244-8', isActive: true },
  { id: 'demo-titular-ana', firstName: 'Ana', middleName: 'Lucía', otherName: '', lastName: 'Giménez', secondLastName: 'Ortiz', document: '4387612-9', isActive: true },
  { id: 'demo-titular-ruben', firstName: 'Rubén', middleName: 'Darío', otherName: '', lastName: 'Ortellado', secondLastName: 'Vera', document: '3672095-0', isActive: false },
]

/** Copias nuevas de la semilla (nadie comparte referencias con la constante). */
export const semillaEmpresasFiscalesDemo = () => EMPRESAS_FISCALES_DEMO.map((fila) => ({ ...fila }))
export const semillaTitularesFiscalesDemo = () => TITULARES_FISCALES_DEMO.map((fila) => ({ ...fila }))
