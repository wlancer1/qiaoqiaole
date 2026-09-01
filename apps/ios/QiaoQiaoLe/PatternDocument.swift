import Foundation
import SwiftUI
import UIKit

struct BeadCell: Identifiable, Equatable, Sendable, Codable {
    let id: Int
    var color: ColorToken
}

struct ColorToken: Equatable, Hashable, Sendable, Codable {
    let hex: String
    let code: String

    var swiftUIColor: Color { Color(hex: hex) }
}

extension Color {
    init(hex: String) {
        let value = UInt64(hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted), radix: 16) ?? 0
        self.init(.sRGB, red: Double((value >> 16) & 0xff) / 255, green: Double((value >> 8) & 0xff) / 255, blue: Double(value & 0xff) / 255, opacity: 1)
    }
}

enum EditorTool: String, CaseIterable, Identifiable {
    case pan = "手抓移动"
    case brush = "画笔"
    case eraser = "橡皮擦"
    case fill = "填充"
    case picker = "吸管"
    var id: String { rawValue }
    var h5Icon: String {
        switch self {
        case .pan: "lucide-hand"
        case .brush: "lucide-brush"
        case .eraser: "lucide-eraser"
        case .picker: "lucide-pipette"
        case .fill: "lucide-paint-bucket"
        }
    }
}

struct PrintSettings: Equatable, Sendable {
    var cellSize: Double = 10
    var wallThickness: Double = 1.2
    var pegHeight: Double = 4
}

@MainActor
final class PatternDocument: ObservableObject {
    @Published private(set) var columns = 16
    @Published private(set) var rows = 16
    @Published private(set) var cells: [BeadCell] = []
    @Published var selectedColor = Palette.default[0]
    // The H5 canvas opens in pan mode so an initial drag never paints cells.
    @Published var tool: EditorTool = .pan
    @Published var settings = PrintSettings()
    @Published private(set) var activeProjectID: String?
    @Published private(set) var projectName = "未命名作品"

    private struct Snapshot: Equatable {
        let columns: Int
        let rows: Int
        let cells: [BeadCell]
    }
    private var undoStack: [Snapshot] = []
    private var redoStack: [Snapshot] = []

    init() { resetPattern() }

    var canUndo: Bool { !undoStack.isEmpty }
    var canRedo: Bool { !redoStack.isEmpty }

    func cell(at row: Int, _ column: Int) -> BeadCell { cells[row * columns + column] }

    func applyTool(at row: Int, _ column: Int) {
        applyTool(to: [GridCoordinate(row: row, column: column)])
    }

    /// Applies one logical editor action to several cells. A drag stroke is kept
    /// as one undo step, matching the H5 editor rather than recording every
    /// pointer-move event independently.
    func applyTool(to coordinates: [GridCoordinate]) {
        let indexes: [Int] = Array(Set<Int>(coordinates.compactMap { coordinate -> Int? in
            guard coordinate.row >= 0, coordinate.row < rows, coordinate.column >= 0, coordinate.column < columns else { return nil }
            return coordinate.row * columns + coordinate.column
        })).sorted()
        guard !indexes.isEmpty else { return }
        switch tool {
        case .pan: return
        case .picker:
            let sampled = cells[indexes[0]].color
            // H5 eyedropper leaves the selection intact for a transparent cell.
            guard sampled != Palette.empty else { return }
            selectedColor = sampled
        case .brush:
            let changed = indexes.filter { cells[$0].color != selectedColor }
            guard !changed.isEmpty else { return }
            commit { changed.forEach { cells[$0].color = selectedColor } }
        case .eraser:
            let changed = indexes.filter { cells[$0].color != Palette.empty }
            guard !changed.isEmpty else { return }
            commit { changed.forEach { cells[$0].color = Palette.empty } }
        case .fill:
            let source = cells[indexes[0]].color
            guard source != selectedColor else { return }
            commit { floodFill(&cells, start: indexes[0], replacing: source, with: selectedColor, columns: columns, rows: rows) }
        }
    }

    func undo() {
        guard let previous = undoStack.popLast() else { return }
        redoStack.append(snapshot); restore(previous)
    }

    func redo() {
        guard let next = redoStack.popLast() else { return }
        undoStack.append(snapshot); restore(next)
    }

    func resize(columns: Int, rows: Int) {
        let newColumns = min(max(columns, 2), 120)
        let newRows = min(max(rows, 2), 120)
        guard newColumns != self.columns || newRows != self.rows else { return }
        let oldCells = cells, oldColumns = self.columns, oldRows = self.rows
        commit {
            self.columns = newColumns; self.rows = newRows
            cells = (0..<(newColumns * newRows)).map { index in
                let x = index % newColumns, y = index / newColumns
                let color = x < oldColumns && y < oldRows ? oldCells[y * oldColumns + x].color : Palette.empty
                return BeadCell(id: index, color: color)
            }
        }
    }

    func replaceGrid(columns: Int, rows: Int, colors: [ColorToken]) {
        let safeColumns = min(max(columns, 2), 120)
        let safeRows = min(max(rows, 2), 120)
        let requiredCount = safeColumns * safeRows
        guard colors.count >= requiredCount else { return }
        let nextCells = colors.prefix(requiredCount).enumerated().map { BeadCell(id: $0.offset, color: $0.element) }
        commit {
            self.columns = safeColumns; self.rows = safeRows; cells = nextCells
        }
    }

    func startNewProject(columns: Int, rows: Int, colors: [ColorToken]) {
        let safeColumns = min(max(columns, 2), 120)
        let safeRows = min(max(rows, 2), 120)
        let requiredCount = safeColumns * safeRows
        guard colors.count >= requiredCount else { return }
        self.columns = safeColumns
        self.rows = safeRows
        self.cells = colors.prefix(requiredCount).enumerated().map { BeadCell(id: $0.offset, color: $0.element) }
        activeProjectID = nil
        projectName = "未命名作品"
        undoStack.removeAll()
        redoStack.removeAll()
    }

    func startBlankProject(columns: Int, rows: Int) {
        let safeColumns = min(max(columns, 2), 120)
        let safeRows = min(max(rows, 2), 120)
        startNewProject(columns: safeColumns, rows: safeRows, colors: Array(repeating: Palette.empty, count: safeColumns * safeRows))
    }

    /// Reads the H5 `serializeProjectCells` payload. Invalid or incomplete input
    /// is rejected so a malformed detail response never silently overwrites a canvas.
    @discardableResult
    func loadProject(id: String, name: String, columns: Int, rows: Int, canvasData: String) -> Bool {
        guard let parsed = Self.parseH5Canvas(columns: columns, rows: rows, canvasData: canvasData) else { return false }
        let safeColumns = parsed.columns, safeRows = parsed.rows, colors = parsed.cells.map(\.color)
        self.columns = safeColumns; self.rows = safeRows
        self.cells = colors.enumerated().map { BeadCell(id: $0.offset, color: $0.element) }
        self.activeProjectID = id; self.projectName = name.isEmpty ? "未命名作品" : name
        undoStack.removeAll(); redoStack.removeAll()
        return true
    }

    static func parseH5Canvas(columns: Int, rows: Int, canvasData: String) -> (columns: Int, rows: Int, cells: [BeadCell])? {
        let safeColumns = min(max(columns, 2), 120), safeRows = min(max(rows, 2), 120)
        guard let snapshots = try? JSONDecoder().decode([H5ProjectCell].self, from: Data(canvasData.utf8)), snapshots.count == safeColumns * safeRows else { return nil }
        var colors = Array(repeating: Palette.empty, count: safeColumns * safeRows)
        var occupied = Set<Int>()
        for snapshot in snapshots {
            guard snapshot.x >= 0, snapshot.x < safeColumns, snapshot.y >= 0, snapshot.y < safeRows, !snapshot.color.isEmpty else { return nil }
            let index = snapshot.y * safeColumns + snapshot.x
            guard occupied.insert(index).inserted else { return nil }
            colors[index] = snapshot.transparent ? Palette.empty : Palette.token(for: snapshot.color)
        }
        return (safeColumns, safeRows, colors.enumerated().map { BeadCell(id: $0.offset, color: $0.element) })
    }

    func stlText() -> String { STLExporter.serialize(name: "qiaoqiaole", cells: cells, columns: columns, settings: settings) }

    func projectCanvasData() -> String {
        let payload = cells.enumerated().map { index, cell in
            H5ProjectCellPayload(x: index % columns, y: index / columns, color: "#\(cell.color.hex)", transparent: cell.color == Palette.empty)
        }
        return (try? String(data: JSONEncoder().encode(payload), encoding: .utf8)) ?? "[]"
    }

    func projectBeadList() -> [ProjectBeadCount] {
        let counts = cells.filter { $0.color != Palette.empty }.reduce(into: [ColorToken: Int]()) { $0[$1.color, default: 0] += 1 }
        return counts.map { ProjectBeadCount(color: $0.key.code, count: $0.value) }.sorted { $0.color < $1.color }
    }

    /// Mirrors H5 `filterPaletteByUsage`: used MARD colors come first by
    /// descending count, ties retain the canonical MARD order, then a code or
    /// hexadecimal query narrows that ordered list.
    func paletteColors(matching rawQuery: String = "") -> [ColorToken] {
        let counts = cells.filter { $0.color != Palette.empty }
            .reduce(into: [String: Int]()) { $0[$1.color.hex.uppercased(), default: 0] += 1 }
        let ordered = Mard221Palette.colors.enumerated().sorted { left, right in
            let leftCount = counts[left.element.hex.uppercased(), default: 0]
            let rightCount = counts[right.element.hex.uppercased(), default: 0]
            if (leftCount > 0) != (rightCount > 0) { return leftCount > 0 }
            if leftCount > 0, leftCount != rightCount { return leftCount > rightCount }
            return left.offset < right.offset
        }.map(\.element)
        let query = rawQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return ordered }
        return ordered.filter { $0.code.lowercased().contains(query) || "#\($0.hex)".lowercased().contains(query) }
    }

    func projectThumbnailPNG(maxSide: CGFloat = 480) -> Data? {
        let side = min(maxSide / CGFloat(max(columns, rows)), 24)
        let size = CGSize(width: CGFloat(columns) * side, height: CGFloat(rows) * side)
        let format = UIGraphicsImageRendererFormat(); format.opaque = true; format.scale = 1
        let image = UIGraphicsImageRenderer(size: size, format: format).image { context in
            UIColor(AppTokens.soft).setFill(); context.fill(CGRect(origin: .zero, size: size))
            for (index, cell) in cells.enumerated() {
                UIColor(cell.color.swiftUIColor).setFill()
                context.fill(CGRect(x: CGFloat(index % columns) * side, y: CGFloat(index / columns) * side, width: side, height: side))
            }
        }
        return image.pngData()
    }

    func markSaved(id: String, name: String) { activeProjectID = id; projectName = name }

    private func resetPattern() {
        cells = (0..<(columns * rows)).map { index in
            let x = index % columns, y = index / columns
            let color = (x + y) % 5 == 0 ? Palette.default[(x / 3 + y / 3) % Palette.default.count] : Palette.empty
            return BeadCell(id: index, color: color)
        }
    }

    private var snapshot: Snapshot { Snapshot(columns: columns, rows: rows, cells: cells) }

    private func restore(_ value: Snapshot) {
        columns = value.columns; rows = value.rows; cells = value.cells
    }

    private func commit(_ change: () -> Void) {
        let old = snapshot; change()
        guard old != snapshot else { return }
        undoStack.append(old); redoStack.removeAll()
    }
}

struct GridCoordinate: Hashable, Sendable {
    let row: Int
    let column: Int
}

private struct H5ProjectCell: Decodable {
    let x: Int
    let y: Int
    let color: String
    let transparent: Bool
}

private struct H5ProjectCellPayload: Encodable {
    let x: Int
    let y: Int
    let color: String
    let transparent: Bool
}

struct ProjectBeadCount: Codable, Equatable, Sendable {
    let color: String
    let count: Int
}

private func floodFill(_ cells: inout [BeadCell], start: Int, replacing source: ColorToken, with destination: ColorToken, columns: Int, rows: Int) {
    var queue = [start], head = 0
    while head < queue.count {
        let index = queue[head]; head += 1
        guard cells[index].color == source else { continue }
        cells[index].color = destination
        let x = index % columns, y = index / columns
        if x > 0 { queue.append(index - 1) }; if x + 1 < columns { queue.append(index + 1) }
        if y > 0 { queue.append(index - columns) }; if y + 1 < rows { queue.append(index + columns) }
    }
}

enum Palette {
    static let empty = ColorToken(hex: "F7F7F3", code: "空白")
    static let `default` = Array(Mard221Palette.colors.prefix(6))
    static func token(for hex: String) -> ColorToken {
        let normalized = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")).uppercased()
        return Mard221Palette.resolve(normalized) ?? ColorToken(hex: normalized, code: "自定义")
    }
}
