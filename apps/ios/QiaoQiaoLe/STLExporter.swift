import Foundation
import UIKit

enum STLExporter {
    static func serialize(name: String, cells: [BeadCell], columns: Int, settings: PrintSettings) -> String {
        var lines = ["solid \(sanitized(name))"]
        for cell in cells where cell.color != Palette.empty {
            let x = Double(cell.id % columns) * settings.cellSize
            let y = Double(cell.id / columns) * settings.cellSize
            lines.append("  // peg-\(cell.id) \(cell.color.hex)")
            for triangle in ring(x: x, y: y, settings: settings) { append(triangle, to: &lines) }
        }
        lines.append("endsolid \(sanitized(name))")
        return lines.joined(separator: "\n") + "\n"
    }

    private typealias Vertex = (Double, Double, Double)
    private typealias Triangle = (Vertex, Vertex, Vertex)
    private static func ring(x: Double, y: Double, settings: PrintSettings) -> [Triangle] {
        let outer = settings.cellSize, t = min(settings.wallThickness, outer / 2), h = settings.pegHeight
        return box(x, y, outer, t, h) + box(x, y + outer - t, outer, t, h) + box(x, y + t, t, outer - 2 * t, h) + box(x + outer - t, y + t, t, outer - 2 * t, h)
    }
    private static func box(_ x: Double, _ y: Double, _ w: Double, _ d: Double, _ h: Double) -> [Triangle] {
        let a=(x,y,0.0), b=(x+w,y,0.0), c=(x+w,y+d,0.0), d0=(x,y+d,0.0), e=(x,y,h), f=(x+w,y,h), g=(x+w,y+d,h), h0=(x,y+d,h)
        return [(a,d0,c),(a,c,b),(e,f,g),(e,g,h0),(a,b,f),(a,f,e),(d0,h0,g),(d0,g,c),(a,e,h0),(a,h0,d0),(b,c,g),(b,g,f)]
    }
    private static func append(_ triangle: Triangle, to lines: inout [String]) {
        let n = normal(triangle); lines.append("  facet normal \(f(n.0)) \(f(n.1)) \(f(n.2))"); lines.append("    outer loop")
        for v in [triangle.0, triangle.1, triangle.2] { lines.append("      vertex \(f(v.0)) \(f(v.1)) \(f(v.2))") }
        lines.append("    endloop"); lines.append("  endfacet")
    }
    private static func normal(_ t: Triangle) -> Vertex { let u=(t.1.0-t.0.0,t.1.1-t.0.1,t.1.2-t.0.2), v=(t.2.0-t.0.0,t.2.1-t.0.1,t.2.2-t.0.2); let n=(u.1*v.2-u.2*v.1,u.2*v.0-u.0*v.2,u.0*v.1-u.1*v.0); let l=max((n.0*n.0+n.1*n.1+n.2*n.2).squareRoot(), 0.00001); return (n.0/l,n.1/l,n.2/l) }
    private static func f(_ value: Double) -> String { String(format: "%.5f", value) }
    private static func sanitized(_ name: String) -> String { let value = name.replacingOccurrences(of: " ", with: "_"); return value.isEmpty ? "model" : value }
}

enum PatternFileExportError: LocalizedError {
    case couldNotRenderPNG

    var errorDescription: String? {
        switch self {
        case .couldNotRenderPNG: "无法生成 PNG 图纸"
        }
    }
}

/// Writes shareable native files into the app container. The editor owns the
/// presentation of the system share sheet; this type owns only deterministic
/// file creation so it can be tested without a view hierarchy.
@MainActor
enum PatternFileExporter {
    static func writePNG(document: PatternDocument, directory: URL = FileManager.default.temporaryDirectory) throws -> URL {
        guard let data = document.projectThumbnailPNG() else { throw PatternFileExportError.couldNotRenderPNG }
        let url = outputURL(named: "qiaoqiaole-pattern", fileExtension: "png", directory: directory)
        try data.write(to: url, options: .atomic)
        return url
    }

    static func writeSTL(document: PatternDocument, directory: URL = FileManager.default.temporaryDirectory) throws -> URL {
        let url = outputURL(named: "qiaoqiaole-model", fileExtension: "stl", directory: directory)
        try document.stlText().write(to: url, atomically: true, encoding: .utf8)
        return url
    }

    private static func outputURL(named baseName: String, fileExtension: String, directory: URL) -> URL {
        directory
            .appendingPathComponent("\(baseName)-\(UUID().uuidString)")
            .appendingPathExtension(fileExtension)
    }
}
