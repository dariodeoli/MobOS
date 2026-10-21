// Las entradas del rediseño (fade/translate/scale) mueven la geometría unos
// milisegundos. Las mediciones de layout (targets 44, cortes, aire entre
// bloques) esperan a que terminen las animaciones finitas; las infinitas
// (flotar, pulso) no tienen fin y se ignoran.
export async function esperarAnimaciones(page) {
  await page.evaluate(async () => {
    const finitas = document.getAnimations().filter((animacion) => {
      const tiempos = animacion.effect?.getComputedTiming?.()
      return tiempos && Number.isFinite(tiempos.endTime)
    })
    await Promise.all(finitas.map((animacion) => animacion.finished.catch(() => {})))
  })
}
