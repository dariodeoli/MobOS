// Genera planillas .xlsx en memoria para los specs: el archivo se arma con
// datos únicos de cada corrida (la base e2e es persistente entre worktrees, así
// que un fixture con SKU fijos chocaría en la segunda pasada).
import writeXlsxFile from 'write-excel-file/node'

export async function xlsxBuffer(filas, { sheet = 'Productos' } = {}) {
  return writeXlsxFile(filas, { sheet }).toBuffer()
}
