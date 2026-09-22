// Lector de QR para verificar la evidencia impresa (#240).
//
//   swift scripts/decode-qr.swift imagen1.png [imagen2.png ...]
//
// Imprime «ruta<TAB>contenido» por cada QR encontrado y sale con código 1 si
// alguna imagen no tiene QR legible. Usa Vision (macOS), sin dependencias: es
// el control de que el QR del PDF realmente se lee y a dónde apunta.
import Foundation
import Vision
import AppKit

let rutas = Array(CommandLine.arguments.dropFirst())
guard !rutas.isEmpty else {
  FileHandle.standardError.write("uso: swift scripts/decode-qr.swift <imagen.png> [...]\n".data(using: .utf8)!)
  exit(2)
}

var huboError = false
for ruta in rutas {
  guard let imagen = NSImage(contentsOfFile: ruta), let cg = imagen.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    print("ERROR\t\(ruta)\tno se pudo abrir la imagen")
    huboError = true
    continue
  }
  let pedido = VNDetectBarcodesRequest()
  pedido.symbologies = [.qr]
  do {
    try VNImageRequestHandler(cgImage: cg, options: [:]).perform([pedido])
    let valores = (pedido.results ?? []).compactMap { $0.payloadStringValue }
    if valores.isEmpty {
      print("ERROR\t\(ruta)\tsin QR legible")
      huboError = true
    } else {
      for valor in valores { print("OK\t\(ruta)\t\(valor)") }
    }
  } catch {
    print("ERROR\t\(ruta)\t\(error.localizedDescription)")
    huboError = true
  }
}
exit(huboError ? 1 : 0)
