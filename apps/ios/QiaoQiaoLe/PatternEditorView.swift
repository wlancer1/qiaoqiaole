import SwiftUI
import PhotosUI

struct PatternEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var document: PatternDocument
    var onRequestSave: (() -> Void)?
    @State private var showSettings = false
    @State private var showShare = false
    @State private var exportURL: URL?
    @State private var exportError: String?
    @State private var referenceImportError: String?
    @State private var canvasScale: CGFloat = 1
    @State private var pinchStartScale: CGFloat?
    @State private var referencePickerItem: PhotosPickerItem?
    @State private var referenceImage: UIImage?
    @State private var isReferenceMinimized = false
    @State private var showPaletteSearch = false
    @State private var showBeadList = false
    @State private var viewportSize: CGSize = .zero
    @State private var artboardFrame: CGRect = .zero

    private var rulerGeometry: EditorViewportRulerGeometry {
        EditorViewportRulerGeometry(
            viewportSize: viewportSize,
            artboardFrame: artboardFrame,
            rows: document.rows,
            columns: document.columns,
            scale: effectiveCanvasScale
        )
    }

    /// H5 starts with the whole artboard visible, even when a 32×32 project is
    /// wider than a phone at the 14pt editor cell baseline. Keep that fit as a
    /// display transform; the document grid and user-requested zoom remain
    /// unchanged, so enlarged canvases still pan and expose sticky rulers.
    private var effectiveCanvasScale: CGFloat {
        guard viewportSize.width > 0 else { return canvasScale }
        let artboardWidth = CGFloat(document.columns) * EditorCanvasMetrics.cellSide + EditorCanvasMetrics.rulerGutter
        let fittingScale = min(1, max(EditorCanvasMetrics.minimumScale, (viewportSize.width - 24) / artboardWidth))
        return canvasScale * fittingScale
    }

    var body: some View {
        VStack(spacing: 0) {
                editorToolbar
                Divider()
                GeometryReader { viewport in
                    ZStack(alignment: .topTrailing) {
                        ScrollView([.horizontal, .vertical]) {
                            GridCanvas(document: document, scale: effectiveCanvasScale, hidesStaticRulers: rulerGeometry.sticky)
                                .padding(12)
                        }
                        .coordinateSpace(name: "editor-canvas-viewport")
                        .background(Color(hex: "F4F7FC"))
                        .simultaneousGesture(MagnificationGesture()
                            .onChanged { value in
                                let base = pinchStartScale ?? canvasScale
                                pinchStartScale = base
                                canvasScale = EditorCanvasMetrics.clampedScale(base * value)
                            }
                            .onEnded { _ in pinchStartScale = nil }
                        )
                        .accessibilityLabel(document.tool == .pan ? "画布工作区，手抓移动模式" : "画布工作区")
                        .onAppear { viewportSize = viewport.size }
                        .onChange(of: viewport.size) { _, value in viewportSize = value }
                        .onPreferenceChange(EditorArtboardFramePreferenceKey.self) { artboardFrame = $0 }
                        if rulerGeometry.sticky {
                            EditorViewportRulers(geometry: rulerGeometry, scale: effectiveCanvasScale)
                                .allowsHitTesting(false)
                                .accessibilityHidden(true)
                        }
                        if let referenceImage {
                            ReferenceImageWindow(
                                image: referenceImage,
                                isMinimized: $isReferenceMinimized,
                                onClose: { self.referenceImage = nil; referencePickerItem = nil }
                            )
                            .padding(12)
                        }
                        HStack(alignment: .bottom, spacing: 10) {
                            editorToolRail
                                .frame(maxWidth: .infinity, alignment: .leading)
                            zoomControls
                        }
                        .padding(12)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                    }
                }
                Divider()
                palette
            }
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $showSettings) { SettingsSheet(document: document) }
            .sheet(isPresented: $showShare) {
                if let exportURL { ShareSheet(items: [exportURL]) }
            }
            .alert("导出失败", isPresented: Binding(get: { exportError != nil }, set: { if !$0 { exportError = nil } })) {
                Button("知道了", role: .cancel) { exportError = nil }
            } message: {
                Text(exportError ?? "无法生成导出文件，请稍后重试。")
            }
            .alert("参考图导入失败", isPresented: Binding(get: { referenceImportError != nil }, set: { if !$0 { referenceImportError = nil } })) {
                Button("知道了", role: .cancel) { referenceImportError = nil }
            } message: {
                Text(referenceImportError ?? "无法读取这张图片，请选择其他图片后重试。")
            }
            .sheet(isPresented: $showPaletteSearch) { PaletteSearchSheet(document: document) { color in document.selectedColor = color } }
            .sheet(isPresented: $showBeadList) { EditorBeadListSheet(document: document) }
            .onChange(of: referencePickerItem) { _, item in
                guard let item else { return }
                Task {
                    guard let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) else {
                        referenceImportError = "无法读取这张图片，请选择其他图片后重试。"
                        return
                    }
                    referenceImage = image
                    isReferenceMinimized = false
                }
        }
    }

    private var editorToolbar: some View {
        HStack(spacing: 4) {
            Button { dismiss() } label: { Image(systemName: "chevron.left").frame(width: 36, height: 42) }
                .accessibilityLabel("返回作品列表")
            Button { showSettings = true } label: { Image(systemName: "slider.horizontal.3").frame(width: 34, height: 42) }
                .accessibilityLabel("画布设置")
            Text("\(document.columns)×\(document.rows)")
                .font(.caption.weight(.semibold))
                .foregroundStyle(AppTokens.muted)
                .padding(.horizontal, 10).frame(height: 34)
                .background(AppTokens.panel)
                .clipShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner))
                .overlay(RoundedRectangle(cornerRadius: AppTokens.controlCorner).stroke(AppTokens.line, lineWidth: 1))
                .accessibilityLabel("画布尺寸 \(document.columns) × \(document.rows)")
            Spacer(minLength: 2)
            Button { document.undo() } label: { Image(systemName: "arrow.uturn.backward").frame(width: 31, height: 42) }
                .disabled(!document.canUndo).accessibilityLabel("撤销")
            Button { document.redo() } label: { Image(systemName: "arrow.uturn.forward").frame(width: 31, height: 42) }
                .disabled(!document.canRedo).accessibilityLabel("重做")
            PhotosPicker(selection: $referencePickerItem, matching: .images) {
                Image(systemName: "square.and.arrow.up").frame(width: 31, height: 42)
            }
            .accessibilityLabel("上传参考图")
            Menu {
                Button("导出 PNG 图纸", action: exportPNG)
                Button("导出 STL 模型", action: exportSTL)
            } label: {
                Image(systemName: "doc.badge.arrow.up").frame(width: 31, height: 42)
            }
            .accessibilityLabel("导出图纸或 STL")
            if let onRequestSave {
                Button { onRequestSave() } label: { Image(systemName: "externaldrive.badge.checkmark").frame(width: 31, height: 42) }
                    .accessibilityLabel("保存作品")
            }
            Circle().fill(document.selectedColor.swiftUIColor).frame(width: 28, height: 28)
                .overlay(Circle().stroke(AppTokens.line, lineWidth: 2))
                .accessibilityLabel("当前色号 \(document.selectedColor.code)")
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(Color.white)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("画布编辑顶栏")
    }

    private var zoomControls: some View {
        VStack(spacing: 1) {
            Button("+") { canvasScale = EditorCanvasMetrics.clampedScale(canvasScale + 0.35) }.accessibilityLabel("放大画布")
            Button("−") { canvasScale = EditorCanvasMetrics.clampedScale(canvasScale - 0.35) }.accessibilityLabel("缩小画布")
            Button("1:1") { canvasScale = 1 }.font(.caption2.weight(.semibold)).accessibilityLabel("重置画布视图")
        }
        .buttonStyle(.plain)
        .padding(7)
        .background(AppTokens.panel)
        .clipShape(RoundedRectangle(cornerRadius: AppTokens.compactCorner))
        .shadow(color: .black.opacity(0.12), radius: 5, y: 2)
    }

    private var editorToolRail: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(EditorTool.allCases) { tool in
                    Button { document.tool = tool } label: {
                        Label(tool.rawValue, systemImage: tool.symbol).labelStyle(.iconOnly)
                            .frame(width: 42, height: 42)
                            .background(document.tool == tool ? Color(hex: "146CFF") : Color.white)
                            .foregroundStyle(document.tool == tool ? .white : Color(hex: "171819"))
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    .accessibilityLabel(tool.rawValue + "工具")
                    .accessibilityAddTraits(document.tool == tool ? .isSelected : [])
                }
                Button { showBeadList = true } label: {
                    Image(systemName: "list.bullet").frame(width: 42, height: 42)
                        .background(showBeadList ? Color(hex: "146CFF") : Color.white)
                        .foregroundStyle(showBeadList ? .white : Color(hex: "171819"))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .accessibilityLabel("打开豆子清单")
            }
            .padding(7)
        }
        .background(AppTokens.panel.opacity(0.96))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: .black.opacity(0.12), radius: 7, y: 3)
        .accessibilityLabel("画布工具栏")
        .accessibilityIdentifier("画布工具栏")
    }

    private var palette: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(Array(document.paletteColors().prefix(8)), id: \.self) { color in
                    Button { document.selectedColor = color } label: {
                        VStack(spacing: 3) {
                            Circle().fill(color.swiftUIColor).frame(width: 30, height: 30)
                                .overlay(Circle().stroke(document.selectedColor == color ? Color(hex: "171819") : .clear, lineWidth: 2))
                            Text(color.code).font(.caption2).foregroundStyle(Color(hex: "6F7478"))
                        }.frame(width: 42)
                    }.accessibilityLabel("选择色号 \(color.code)")
                }
                Button { showPaletteSearch = true } label: {
                    Label("筛选色卡", systemImage: "magnifyingglass")
                        .labelStyle(.iconOnly).frame(width: 42, height: 42)
                }
                .accessibilityLabel("筛选色卡")
                Button { showBeadList = true } label: {
                    Label("豆子清单", systemImage: "list.bullet")
                        .labelStyle(.iconOnly).frame(width: 42, height: 42)
                }
                .accessibilityLabel("打开豆子清单")
            }.padding(.horizontal, 16).padding(.vertical, 9)
        }.background(Color.white)
    }

    private func exportSTL() {
        do {
            exportURL = try PatternFileExporter.writeSTL(document: document)
            showShare = true
        } catch {
            exportURL = nil
            exportError = error.localizedDescription
        }
    }

    private func exportPNG() {
        do {
            exportURL = try PatternFileExporter.writePNG(document: document)
            showShare = true
        } catch {
            exportURL = nil
            exportError = error.localizedDescription
        }
    }
}

private struct PaletteSearchSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var document: PatternDocument
    let onSelect: (ColorToken) -> Void
    @State private var query = ""

    var body: some View {
        NavigationStack {
            List(document.paletteColors(matching: query), id: \.self) { color in
                Button {
                    onSelect(color); dismiss()
                } label: {
                    HStack(spacing: 12) {
                        Circle().fill(color.swiftUIColor).frame(width: 28, height: 28)
                            .overlay(Circle().stroke(AppTokens.line, lineWidth: 1))
                        Text(color.code).font(.body.weight(.semibold))
                        Text("#\(color.hex)").font(.caption).foregroundStyle(AppTokens.muted)
                        Spacer()
                        if document.selectedColor == color { Image(systemName: "checkmark").foregroundStyle(AppTokens.flowBrand) }
                    }
                }
                .accessibilityLabel("选择色号 \(color.code)，#\(color.hex)")
            }
            .searchable(text: $query, prompt: "输入色号或颜色值")
            .navigationTitle("筛选色卡")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("关闭") { dismiss() } } }
        }
    }
}

private struct EditorBeadListSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var document: PatternDocument

    private var counts: [ProjectBeadCount] {
        document.projectBeadList().sorted { $0.count == $1.count ? $0.color < $1.color : $0.count > $1.count }
    }

    var body: some View {
        NavigationStack {
            List {
                Section("共 \(counts.reduce(0) { $0 + $1.count }) 颗") {
                    if counts.isEmpty { ContentUnavailableView("暂无豆子", systemImage: "circle.grid.3x3") }
                    ForEach(counts, id: \.color) { count in
                        HStack {
                            Circle().fill(Mard221Palette.colors.first(where: { $0.code == count.color })?.swiftUIColor ?? AppTokens.muted).frame(width: 22, height: 22)
                            Text(count.color).font(.body.weight(.medium))
                            Spacer()
                            Text("\(count.count) 颗").foregroundStyle(AppTokens.muted)
                        }
                    }
                }
            }
            .navigationTitle("豆子清单")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("关闭") { dismiss() } } }
        }
    }
}

private struct ReferenceImageWindow: View {
    let image: UIImage
    @Binding var isMinimized: Bool
    let onClose: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Text("参考图").font(.subheadline.weight(.bold))
                Spacer()
                Button(isMinimized ? "展开" : "最小化") { isMinimized.toggle() }
                    .font(.caption.weight(.semibold))
                    .accessibilityLabel(isMinimized ? "展开参考图" : "最小化参考图")
                Button("关闭", action: onClose)
                    .font(.caption.weight(.semibold))
                    .accessibilityLabel("关闭参考图")
            }
            .padding(.horizontal, 10).frame(height: 38)
            if !isMinimized {
                Image(uiImage: image)
                    .resizable().scaledToFit()
                    .frame(width: 156, height: 156)
                    .padding(8)
                    .accessibilityLabel("参考图预览")
            }
        }
        .frame(width: 190)
        .background(AppTokens.panel)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.16), radius: 12, y: 5)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("参考图")
    }
}

enum EditorCanvasMetrics {
    static let cellSide: CGFloat = 14
    static let rulerGutter: CGFloat = 22
    static let minimumScale: CGFloat = 0.2
    static let maximumScale: CGFloat = 12

    static func clampedScale(_ value: CGFloat) -> CGFloat {
        min(maximumScale, max(minimumScale, value))
    }
}

struct EditorViewportRulerTick: Equatable {
    let tick: Int
    let offset: CGFloat
}

/// Native equivalent of H5CanvasPreview.getViewportRulerGeometry.  The artboard
/// frame is measured from the scroll viewport, so every label remains centred on
/// the cell that is actually visible on screen.
struct EditorViewportRulerGeometry: Equatable {
    let sticky: Bool
    let columns: [EditorViewportRulerTick]
    let rows: [EditorViewportRulerTick]

    init(viewportSize: CGSize, artboardFrame: CGRect, rows: Int, columns: Int, scale: CGFloat, minimumStickyScale: CGFloat = 1) {
        let safeRows = max(1, rows)
        let safeColumns = max(1, columns)
        let validViewport = viewportSize.width > 0 && viewportSize.height > 0
        let cellWidth = artboardFrame.width / CGFloat(safeColumns)
        let cellHeight = artboardFrame.height / CGFloat(safeRows)
        let gutter = EditorCanvasMetrics.rulerGutter * scale
        let tolerance: CGFloat = 0.5
        let overflowing = scale > minimumStickyScale && validViewport && (
            artboardFrame.minX - gutter < tolerance ||
            artboardFrame.minY - gutter < tolerance ||
            artboardFrame.maxX > viewportSize.width - tolerance ||
            artboardFrame.maxY > viewportSize.height - tolerance
        )
        sticky = overflowing
        self.columns = overflowing ? Self.visibleTicks(size: safeColumns, cellSize: cellWidth, artboardOffset: artboardFrame.minX, viewportSize: viewportSize.width) : []
        self.rows = overflowing ? Self.visibleTicks(size: safeRows, cellSize: cellHeight, artboardOffset: artboardFrame.minY, viewportSize: viewportSize.height) : []
    }

    static func tickInterval(cellSize: CGFloat) -> Int {
        min(5, max(1, Int(ceil(24 / max(1, cellSize)))))
    }

    private static func visibleTicks(size: Int, cellSize: CGFloat, artboardOffset: CGFloat, viewportSize: CGFloat) -> [EditorViewportRulerTick] {
        guard cellSize > 0, viewportSize > 0 else { return [] }
        let interval = tickInterval(cellSize: cellSize)
        let regular = stride(from: 1, through: size, by: interval).map { tick in
            EditorViewportRulerTick(tick: tick, offset: artboardOffset + (CGFloat(tick) - 0.5) * cellSize)
        }.filter { $0.offset >= 0 && $0.offset <= viewportSize }
        if !regular.isEmpty { return regular }

        let firstVisible = max(1, min(size, Int(floor((-artboardOffset) / cellSize)) + 1))
        let naturalOffset = artboardOffset + (CGFloat(firstVisible) - 0.5) * cellSize
        let edgeInset = min(7, viewportSize / 2)
        return [EditorViewportRulerTick(tick: firstVisible, offset: max(edgeInset, min(viewportSize - edgeInset, naturalOffset)))]
    }
}

private struct EditorArtboardFramePreferenceKey: PreferenceKey {
    static var defaultValue: CGRect = .zero
    static func reduce(value: inout CGRect, nextValue: () -> CGRect) { value = nextValue() }
}

private struct EditorViewportRulers: View {
    let geometry: EditorViewportRulerGeometry
    let scale: CGFloat

    var body: some View {
        let gutter = EditorCanvasMetrics.rulerGutter * scale
        ZStack(alignment: .topLeading) {
            AppTokens.flowBackground.opacity(0.96).frame(maxWidth: .infinity, alignment: .top).frame(height: gutter)
            AppTokens.flowBackground.opacity(0.96).frame(maxHeight: .infinity, alignment: .leading).frame(width: gutter)
            ForEach(geometry.columns, id: \.tick) { item in
                Text("\\(item.tick)")
                    .font(.system(size: max(7, 8 * scale), weight: .medium, design: .monospaced))
                    .foregroundStyle(AppTokens.muted)
                    .position(x: item.offset, y: gutter / 2)
            }
            ForEach(geometry.rows, id: \.tick) { item in
                Text("\\(item.tick)")
                    .font(.system(size: max(7, 8 * scale), weight: .medium, design: .monospaced))
                    .foregroundStyle(AppTokens.muted)
                    .position(x: gutter / 2, y: item.offset)
            }
        }
    }
}

private struct GridCanvas: View {
    @ObservedObject var document: PatternDocument
    let scale: CGFloat
    let hidesStaticRulers: Bool
    @State private var activeStroke = Set<GridCoordinate>()
    @State private var previousStrokeCoordinate: GridCoordinate?

    var body: some View {
        let cellSide = EditorCanvasMetrics.cellSide * scale
        let gutter = EditorCanvasMetrics.rulerGutter * scale
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                Color.clear.frame(width: gutter, height: gutter)
                HStack(spacing: 0) {
                    ForEach(0..<document.columns, id: \.self) { column in
                        Text("\(column + 1)").font(.system(size: max(7, 8 * scale), weight: .medium, design: .monospaced))
                            .foregroundStyle(AppTokens.muted).frame(width: cellSide, height: gutter, alignment: .center)
                            .opacity(hidesStaticRulers ? 0 : 1)
                    }
                }
            }
            HStack(spacing: 0) {
                VStack(spacing: 0) {
                    ForEach(0..<document.rows, id: \.self) { row in
                        Text("\(row + 1)").font(.system(size: max(7, 8 * scale), weight: .medium, design: .monospaced))
                            .foregroundStyle(AppTokens.muted).frame(width: gutter, height: cellSide, alignment: .center)
                            .opacity(hidesStaticRulers ? 0 : 1)
                    }
                }
                VStack(spacing: 0) {
                    ForEach(0..<document.rows, id: \.self) { row in
                        HStack(spacing: 0) {
                            ForEach(0..<document.columns, id: \.self) { column in
                                let cell = document.cell(at: row, column)
                                Rectangle().fill(cell.color.swiftUIColor)
                                    .overlay(Rectangle().stroke(AppTokens.gridLine, lineWidth: max(0.35, 0.5 * scale)))
                                    .frame(width: cellSide, height: cellSide)
                                    .contentShape(Rectangle())
                                    .accessibilityLabel("第 \(row + 1) 行第 \(column + 1) 列，\(cell.color.code)")
                                    .accessibilityAddTraits(.isButton)
                                    .accessibilityAction { document.applyTool(at: row, column) }
                            }
                        }
                    }
                }
                .background(AppTokens.panel)
                .overlay(Rectangle().stroke(AppTokens.line, lineWidth: 1))
                .background(GeometryReader { proxy in
                    Color.clear.preference(key: EditorArtboardFramePreferenceKey.self, value: proxy.frame(in: .named("editor-canvas-viewport")))
                })
                .overlay(alignment: .bottomTrailing) {
                    Color.clear
                        .contentShape(Rectangle())
                        .frame(width: CGFloat(document.columns) * cellSide, height: CGFloat(document.rows) * cellSide)
                        .gesture(strokeGesture(cellSide: cellSide))
                        .allowsHitTesting(document.tool != .pan)
                        .accessibilityHidden(true)
                }
            }
        }
        .background(AppTokens.flowBackground)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("拼豆编辑画布，缩放 \(Int(scale * 100))%")
        .accessibilityIdentifier("拼豆编辑画布")
    }

    private func strokeGesture(cellSide: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                let column = Int(value.location.x / cellSide)
                let row = Int(value.location.y / cellSide)
                guard row >= 0, row < document.rows, column >= 0, column < document.columns else { return }
                let next = GridCoordinate(row: row, column: column)
                if let previousStrokeCoordinate {
                    activeStroke.formUnion(EditorStrokeGeometry.points(from: previousStrokeCoordinate, to: next))
                } else {
                    activeStroke.insert(next)
                }
                previousStrokeCoordinate = next
            }
            .onEnded { _ in
                document.applyTool(to: Array(activeStroke))
                activeStroke.removeAll()
                previousStrokeCoordinate = nil
            }
    }
}

/// Uses the same dominant-axis rounded interpolation as H5 pointerMove so a
/// quick drag cannot leave gaps between delivered gesture events.
enum EditorStrokeGeometry {
    static func points(from start: GridCoordinate, to end: GridCoordinate) -> [GridCoordinate] {
        let steps = max(abs(end.column - start.column), abs(end.row - start.row))
        guard steps > 0 else { return [start] }
        let rowDelta = end.row - start.row
        let columnDelta = end.column - start.column
        var result: [GridCoordinate] = []
        result.reserveCapacity(steps + 1)
        for step in 0...steps {
            let ratio = Double(step) / Double(steps)
            let row = Int((Double(start.row) + Double(rowDelta) * ratio).rounded())
            let column = Int((Double(start.column) + Double(columnDelta) * ratio).rounded())
            result.append(GridCoordinate(row: row, column: column))
        }
        return result
    }
}

private struct SettingsSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var document: PatternDocument
    @State private var columns: Int
    @State private var rows: Int
    init(document: PatternDocument) { self.document = document; _columns = State(initialValue: document.columns); _rows = State(initialValue: document.rows) }
    var body: some View {
        NavigationStack {
            Form {
                Section("画布尺寸") { Stepper("列数：\(columns)", value: $columns, in: 2...120); Stepper("行数：\(rows)", value: $rows, in: 2...120) }
                Section("打印参数") { Stepper("格子尺寸：\(document.settings.cellSize, specifier: "%.1f") mm", value: $document.settings.cellSize, in: 4...20, step: 0.5); Stepper("墙体厚度：\(document.settings.wallThickness, specifier: "%.1f") mm", value: $document.settings.wallThickness, in: 0.5...4, step: 0.1); Stepper("豆高：\(document.settings.pegHeight, specifier: "%.1f") mm", value: $document.settings.pegHeight, in: 1...10, step: 0.5) }
            }
            .navigationTitle("画布参数").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button("确定") { document.resize(columns: columns, rows: rows); dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }
}

private struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: items, applicationActivities: nil) }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
