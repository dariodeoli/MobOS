// Ciudades y departamentos de Paraguay para autocompletado de clientes.
// Fuente estática curada (capitales departamentales y distritos principales).
// Cuando MobOS obtenga credenciales AEX (clave pública/privada), este módulo
// puede convertirse en un adaptador de POST /api/v1/envios/ciudades, que
// devuelve denominacion + departamento_denominacion por ciudad con cobertura.

const DEPARTMENTS: [string, string[]][] = [
  ['Asunción', ['Asunción']],
  ['Concepción', ['Concepción', 'Belén', 'Horqueta', 'San Lázaro', 'Yby Yaú', 'Loreto', 'San Carlos del Apa', 'Paso Barreto']],
  ['San Pedro', ['San Pedro de Ycuamandiyú', 'San Estanislao', 'Santa Rosa del Aguaray', 'Capiibary', 'Lima', 'General Elizardo Aquino', 'Guayaibí', 'Nueva Germania', 'Antequera', 'Villa del Rosario', 'Yataity del Norte']],
  ['Cordillera', ['Caacupé', 'San Bernardino', 'Altos', 'Atyrá', 'Tobatí', 'Piribebuy', 'Eusebio Ayala', 'Itacurubí de la Cordillera', 'Arroyos y Esteros', 'Emboscada', 'Caraguatay', 'Isla Pucú', 'Santa Elena']],
  ['Guairá', ['Villarrica', 'Colonia Independencia', 'Itapé', 'Mbocayaty del Yhaguy', 'Coronel Martínez', 'Félix Pérez Cardozo', 'Paso Yobái', 'San Salvador', 'Tebicuary', 'Natalicio Talavera', 'Iturbe']],
  ['Caaguazú', ['Coronel Oviedo', 'Caaguazú', 'Repatriación', 'J. Eulogio Estigarribia', 'Doctor Juan Manuel Frutos', 'Raúl Arsenio Oviedo', 'San José de los Arroyos', 'Nueva Londres', 'Vaquería', 'Yhú', 'Carayaó', 'Doctor Cecilio Báez']],
  ['Caazapá', ['Caazapá', 'San Juan Nepomuceno', 'Abaí', 'Buena Vista', 'General Higinio Morínigo', 'Yuty', 'Tavaí', 'Maciel', 'Doctor Moisés Bertoni']],
  ['Itapúa', ['Encarnación', 'Carmen del Paraná', 'Fram', 'San Cosme y Damián', 'Coronel Bogado', 'General Artigas', 'Hohenau', 'Obligado', 'Bella Vista', 'Cambyretá', 'Natalio', 'Capitán Meza', 'San Pedro del Paraná', 'General Delgado', 'Edelira', 'Trinidad']],
  ['Misiones', ['San Juan Bautista', 'Santa Rosa', 'Santa María', 'San Ignacio', 'San Miguel', 'Villa Florida', 'Ayolas', 'Santiago', 'San Patricio', 'Yabebyry']],
  ['Paraguarí', ['Paraguarí', 'Yaguarón', 'Carapeguá', 'Quiindy', 'Ybycuí', 'La Colmena', 'Sapucai', 'Acahay', 'Escobar', 'Quyquyhó', 'Caballero', 'Mbuyapey', 'Pirayú', 'Caapucú', 'Ybytimí', 'Roque González de Santa Cruz']],
  ['Alto Paraná', ['Ciudad del Este', 'Presidente Franco', 'Hernandarias', 'Minga Guazú', 'Santa Rita', 'Minga Porá', 'Naranjal', 'San Alberto', 'Iruña', 'Los Cedrales', 'Santa Rosa del Monday', 'Itakyry', 'Doctor Juan León Mallorquín', 'Ñacunday', 'Yguazú', 'Tavapy']],
  ['Central', ['Areguá', 'Luque', 'San Lorenzo', 'Capiatá', 'Limpio', 'Fernando de la Mora', 'Villa Elisa', 'Lambaré', 'Ñemby', 'Itauguá', 'Itá', 'Guarambaré', 'Ypacaraí', 'Villeta', 'Julián Augusto Saldívar', 'Ypané', 'Nueva Italia', 'Mariano Roque Alonso', 'San Antonio']],
  ['Ñeembucú', ['Pilar', 'Alberdi', 'Cerrito', 'Humaitá', 'General Díaz', 'Laureles', 'Paso de Patria', 'San Juan Bautista de Ñeembucú', 'Villa Oliva', 'Villalbín', 'Isla Umbú', 'Mayor José Martínez']],
  ['Amambay', ['Pedro Juan Caballero', 'Bella Vista Norte', 'Capitán Bado', 'Zanja Pytá', 'Karapaí']],
  ['Canindeyú', ['Salto del Guairá', 'Curuguaty', 'Corpus Christi', 'La Paloma del Espíritu Santo', 'Katueté', 'Villa Ygatimí', 'Itanará', 'Yasy Cañy', 'Nueva Esperanza', 'Yby Pytá']],
  ['Presidente Hayes', ['Villa Hayes', 'Benjamín Aceval', 'Nanawa', 'Pozo Colorado', 'Puerto Pinasco', 'José Falcón', 'Teniente Esteban Martínez', 'General José María Bruguez']],
  ['Alto Paraguay', ['Fuerte Olimpo', 'Bahía Negra', 'Puerto Casado', 'Mayor Pablo Lagerenza', 'Capitán Carmelo Peralta']],
  ['Boquerón', ['Filadelfia', 'Loma Plata', 'Neuland', 'Mariscal Estigarribia', 'Doctor Pedro P. Peña']],
]

export const CITIES = DEPARTMENTS.flatMap(([department, cities]) => cities.map(city => ({ city, department })))

// Normaliza para comparar sin acentos, mayúsculas ni espacios extra.
const norm = (value: string) => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

export function searchCities(query: string, limit = 10) {
  const q = norm(query)
  if (q.length < 2) return []
  return CITIES
    .filter(({ city, department }) => norm(city).includes(q) || norm(department).includes(q))
    .sort((a, b) => {
      const aStart = norm(a.city).startsWith(q) ? 0 : 1
      const bStart = norm(b.city).startsWith(q) ? 0 : 1
      return aStart - bStart || a.city.localeCompare(b.city)
    })
    .slice(0, limit)
}
