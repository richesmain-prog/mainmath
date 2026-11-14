import Foundation
import PDFKit

var results: [[String: Any]] = []
for file in CommandLine.arguments.dropFirst() {
    guard let document = PDFDocument(url: URL(fileURLWithPath: file)) else { fatalError("Cannot open \(file)") }
    var pages: [[String: Any]] = []
    for index in 0..<document.pageCount {
        let text = document.page(at: index)?.string ?? ""
        pages.append(["page": index + 1, "characters": text.count, "text": text])
    }
    if (file.hasSuffix("-spec.pdf") || file.hasSuffix("-loi.pdf")), let page = document.page(at: 0) {
        let image = page.thumbnail(of: NSSize(width: 1224, height: 1584), for: .mediaBox)
        if let tiff = image.tiffRepresentation,
           let bitmap = NSBitmapImageRep(data: tiff), let png = bitmap.representation(using: .png, properties: [:]) {
            try png.write(to: URL(fileURLWithPath: file.replacingOccurrences(of: ".pdf", with: "-page1.png")))
        }
    }
    results.append(["file": file, "pages": pages, "pageCount": document.pageCount])
}
let data = try JSONSerialization.data(withJSONObject: results, options: [.prettyPrinted, .sortedKeys])
print(String(data: data, encoding: .utf8)!)
