import Foundation
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
    @State private var canvasScale: CGFloat = ProcessInfo.processInfo.arguments.contains("-ui-testing-editor-zoomed") ? 2 : 1
    @State private var pinchStartScale: CGFloat?
    @State private var referencePickerItem: PhotosPickerItem?
    @State private var referenceImage: UIImage?
    @State private var isReferenceMinimized = false
    @State private var showPaletteSearch = false
    @State private var showBeadList = false
    @State private var backgroundRemovalStatus: String?
    @State private var isBackgroundProcessing = false
    @State private var viewportSize: CGSize = .zero
    @State private var artboardFrame: CGRect = .zero

    private var fittingCanvasScale: CGFloat {
        guard viewportSize.width > 0 else { return 1 }
        let artboardWidth = CGFloat(document.columns) * EditorCanvasMetrics.cellSide + EditorCanvasMetrics.rulerGutter
        return min(1, max(EditorCanvasMetrics.minimumScale, (viewportSize.width - 24) / artboardWidth))
    }

    private var rulerGeometry: EditorViewportRulerGeometry {
        EditorViewportRulerGeometry(
            viewportSize: viewportSize,
            artboardFrame: artboardFrame,
            rows: document.rows,
            columns: document.columns,
            scale: effectiveCanvasScale,
            minimumStickyScale: fittingCanvasScale
        )
    }

    /// H5 starts with the whole artboard visible, even when a 32×32 project is
    /// wider than a phone at the 14pt editor cell baseline. Keep that fit as a
    /// display transform; the document grid and user-requested zoom remain
    /// unchanged, so enlarged canvases still pan and expose sticky rulers.
    private var effectiveCanvasScale: CGFloat {
        canvasScale * fittingCanvasScale
    }

    var body: some View {
        VStack(spacing: 0) {
                editorToolbar
                GeometryReader { viewport in
                    ZStack(alignment: .topTrailing) {
                        EditorStageBackground()
                        ScrollView([.horizontal, .vertical]) {
                            GridCanvas(document: document, scale: effectiveCanvasScale, hidesStaticRulers: rulerGeometry.sticky, showsCodes: canvasScale >= 1.5)
                                .padding(.horizontal, 12)
                                .padding(.top, 28)
                                .padding(.bottom, 170)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .coordinateSpace(name: "editor-canvas-viewport")
                        .background(Color.clear)
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
                            H5ViewportRulers(geometry: rulerGeometry)
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
                        if let backgroundRemovalStatus {
                            Text(backgroundRemovalStatus)
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(AppTokens.flowText)
                                .padding(.horizontal, 12)
                                .frame(height: 30)
                                .background(Color.white.opacity(0.94))
                                .clipShape(RoundedRectangle(cornerRadius: 7))
                                .shadow(color: .black.opacity(0.08), radius: 5, y: 2)
                                .padding(.bottom, 158)
                                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                        }
                        zoomControls
                            .padding(.leading, 12)
                            .padding(.top, 12)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)

                        editorToolRail
                            .frame(height: 58)
                            .padding(.horizontal, 12)
                            .padding(.bottom, 88)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)

                        palette
                            .frame(height: 66)
                            .padding(.horizontal, 12)
                            .padding(.bottom, 12)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                    }
                }
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
            Button { dismiss() } label: { H5Icon(name: "lucide-arrow-left", size: 22).frame(width: 36, height: 42) }
                .accessibilityLabel("返回作品列表")
            Button { showSettings = true } label: { H5Icon(name: "lucide-sliders-horizontal", size: 21).frame(width: 34, height: 42) }
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
            Button { document.undo() } label: { H5Icon(name: "lucide-undo-2", size: 21).frame(width: 31, height: 42) }
                .disabled(!document.canUndo).accessibilityLabel("撤销")
            Button { document.redo() } label: { H5Icon(name: "lucide-redo-2", size: 21).frame(width: 31, height: 42) }
                .disabled(!document.canRedo).accessibilityLabel("重做")
            PhotosPicker(selection: $referencePickerItem, matching: .images) {
                H5Icon(name: "lucide-upload", size: 21).frame(width: 31, height: 42)
            }
            .accessibilityLabel("上传参考图")
            Menu {
                Button("导出 PNG 图纸", action: exportPNG)
                Button("导出 STL 模型", action: exportSTL)
            } label: {
                H5Icon(name: "lucide-file-down", size: 21).frame(width: 31, height: 42)
            }
            .accessibilityLabel("导出图纸或 STL")
            if let onRequestSave {
                Button { onRequestSave() } label: { H5Icon(name: "lucide-save", size: 21).frame(width: 31, height: 42) }
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
        .frame(width: 50)
        .padding(.vertical, 6)
        .background(Color.white.opacity(0.96))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color(hex: "DEE2E5"), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.10), radius: 8, y: 3)
    }

    private var editorToolRail: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(EditorTool.allCases) { tool in
                    Button { document.tool = tool } label: {
                        H5Icon(name: tool.h5Icon, size: 21)
                            .frame(width: 42, height: 42)
                            .background(document.tool == tool ? Color(hex: "146CFF") : Color.white)
                            .foregroundStyle(document.tool == tool ? .white : Color(hex: "171819"))
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    .accessibilityLabel(tool.rawValue + "工具")
                    .accessibilityAddTraits(document.tool == tool ? .isSelected : [])
                }
                Button { showBeadList = true } label: {
                    H5Icon(name: "lucide-list", size: 21).frame(width: 42, height: 42)
                        .background(showBeadList ? Color(hex: "146CFF") : Color.white)
                        .foregroundStyle(showBeadList ? .white : Color(hex: "171819"))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .accessibilityLabel("打开豆子清单")
                if document.canRemoveBackground {
                    Button { removeBackground() } label: {
                        Group {
                            if isBackgroundProcessing {
                                ProgressView().controlSize(.small)
                            } else {
                                H5Icon(name: "lucide-sparkles", size: 21)
                            }
                        }
                        .frame(width: 42, height: 42)
                        .background(Color.white)
                        .foregroundStyle(Color(hex: "171819"))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    .disabled(isBackgroundProcessing)
                    .accessibilityLabel(isBackgroundProcessing ? "背景处理中" : "去除背景")
                }
            }
            .padding(7)
        }
        .background(Color.white.opacity(0.96))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color(hex: "DEE2E5"), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .shadow(color: .black.opacity(0.14), radius: 12, y: 5)
        .accessibilityLabel("画布工具栏")
        .accessibilityIdentifier("画布工具栏")
    }

    private var palette: some View {
        let counts = document.beadCountsByCode()
        return HStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 7) {
                    ForEach(document.paletteColors(), id: \.self) { color in
                        EditorPaletteColorButton(color: color, count: counts[color.code, default: 0], isSelected: document.selectedColor == color) {
                            document.selectedColor = color
                        }
                    }
                }
                .padding(.leading, 12)
                .padding(.trailing, 8)
                .padding(.vertical, 8)
            }

            HStack(spacing: 2) {
                Button { showPaletteSearch = true } label: {
                    H5Icon(name: "h5-filter", size: 18)
                        .frame(width: 42, height: 48)
                }
                .accessibilityLabel("筛选色卡")
                Button { showBeadList = true } label: {
                    H5Icon(name: "lucide-list", size: 19)
                        .frame(width: 42, height: 48)
                }
                .accessibilityLabel("打开豆子清单")
            }
            .foregroundStyle(AppTokens.flowText)
            .background(Color.white)
        }
        .background(Color.white.opacity(0.96))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color(hex: "DEE2E5"), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: .black.opacity(0.10), radius: 10, y: 4)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("底部色卡，共 \(Mard221Palette.colors.count) 色")
    }

    private func removeBackground() {
        guard !isBackgroundProcessing else { return }
        isBackgroundProcessing = true
        Task { @MainActor in
            await Task.yield()
            let changed = document.removeGridEdgeBackground()
            backgroundRemovalStatus = changed ? "已去除边缘背景，可撤销恢复" : "未检测到可去除的边缘背景"
            isBackgroundProcessing = false
            try? await Task.sleep(for: .seconds(1.4))
            backgroundRemovalStatus = nil
        }
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


private struct EditorStageBackground: View {
    var body: some View {
        Canvas { context, size in
            context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Color(hex: "EEF5F8")))
            let tile: CGFloat = 24
            for row in 0...Int(size.height / tile) {
                for col in 0...Int(size.width / tile) where (row + col).isMultiple(of: 2) {
                    context.fill(Path(CGRect(x: CGFloat(col) * tile, y: CGFloat(row) * tile, width: tile, height: tile)), with: .color(Color(hex: "E3EDF1")))
                }
            }
        }
        .ignoresSafeArea()
    }
}

private struct EditorPaletteColorButton: View {
    let color: ColorToken
    let count: Int
    let isSelected: Bool
    let action: () -> Void

    private var usesDarkForeground: Bool {
        let value = Int(color.hex, radix: 16) ?? 0
        let red = Double((value >> 16) & 255)
        let green = Double((value >> 8) & 255)
        let blue = Double(value & 255)
        return red * 0.299 + green * 0.587 + blue * 0.114 > 160
    }

    private var foreground: Color { usesDarkForeground ? AppTokens.flowText : .white }

    var body: some View {
        Button(action: action) {
            ZStack(alignment: .bottom) {
                RoundedRectangle(cornerRadius: 9)
                    .fill(color.swiftUIColor)
                VStack(spacing: 2) {
                    Text(color.code)
                        .font(.system(size: 11, weight: .black, design: .rounded))
                    Text("\(count)")
                        .font(.system(size: 9, weight: .bold, design: .rounded))
                        .opacity(0.82)
                }
                .foregroundStyle(foreground)
                .shadow(color: usesDarkForeground ? .clear : .black.opacity(0.18), radius: 1)
                .padding(.bottom, 6)
                Capsule()
                    .fill(isSelected ? foreground : .clear)
                    .frame(width: 16, height: 2.5)
                    .padding(.bottom, 2)
            }
            .frame(width: 42, height: 48)
            .overlay(RoundedRectangle(cornerRadius: 9).stroke(isSelected ? AppTokens.flowBrand : Color.black.opacity(0.08), lineWidth: isSelected ? 2.5 : 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("选择色号 \(color.code)")
        .accessibilityValue("#\(color.hex)，\(count) 颗")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
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
            .searchable(text: $query, prompt: "输入色号，如 M15")
            .navigationTitle("MARD 221 色卡")
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
    private var total: Int { counts.reduce(0) { $0 + $1.count } }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Capsule()
                .fill(AppTokens.sheetHandle)
                .frame(width: 38, height: 4)
                .frame(maxWidth: .infinity)
                .padding(.top, 10)

            HStack {
                Text("豆子清单")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(AppTokens.flowText)
                Spacer()
                Button { dismiss() } label: {
                    H5Icon(name: "lucide-x", size: 18)
                        .frame(width: 38, height: 38)
                        .background(Color(hex: "F3F6FB"))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color(hex: "64748B"))
                .accessibilityLabel("关闭豆子清单")
            }
            .padding(.horizontal, 18)
            .padding(.top, 12)

            Text("按当前画布实时统计颜色和数量")
                .font(.system(size: 12))
                .foregroundStyle(Color(hex: "70819B"))
                .padding(.horizontal, 18)
                .padding(.top, 2)

            HStack(spacing: 10) {
                beadStat(title: "颜色种类", value: "\(counts.count)")
                beadStat(title: "总豆子数", value: total.formatted())
            }
            .padding(.horizontal, 18)
            .padding(.top, 14)

            HStack(spacing: 0) {
                Text("色号").frame(width: 54, alignment: .leading)
                Text("颜色").frame(maxWidth: .infinity, alignment: .leading)
                Text("数量").frame(width: 70, alignment: .trailing)
                Text("占比").frame(width: 54, alignment: .trailing)
            }
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(Color(hex: "718096"))
            .padding(.horizontal, 18)
            .padding(.top, 16)
            .padding(.bottom, 8)

            Divider().padding(.horizontal, 18)

            if counts.isEmpty {
                VStack(spacing: 8) {
                    Text("暂无豆子").font(.system(size: 15, weight: .bold)).foregroundStyle(AppTokens.flowText)
                    Text("画布中添加颜色后会自动统计").font(.system(size: 12)).foregroundStyle(AppTokens.flowMuted)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(counts, id: \.color) { item in
                            beadRow(item)
                            Divider().padding(.leading, 18)
                        }
                    }
                    .padding(.bottom, 22)
                }
            }
        }
        .background(Color.white)
        .presentationDetents([.fraction(0.72), .large])
        .presentationDragIndicator(.hidden)
        .presentationCornerRadius(28)
    }

    private func beadStat(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.system(size: 11, weight: .semibold)).foregroundStyle(Color(hex: "718096"))
            Text(value).font(.system(size: 20, weight: .black)).foregroundStyle(AppTokens.flowText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color(hex: "F7FAFE"))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private func beadRow(_ item: ProjectBeadCount) -> some View {
        let resolved = Mard221Palette.colors.first(where: { $0.code.caseInsensitiveCompare(item.color) == .orderedSame })
        let hex = resolved.map { "#\($0.hex.uppercased())" } ?? item.color
        let percent = total > 0 ? String(format: "%.1f%%", Double(item.count) / Double(total) * 100) : "0.0%"
        return HStack(spacing: 0) {
            Text(resolved?.code ?? item.color)
                .font(.system(size: 13, weight: .black))
                .foregroundStyle(Color(hex: "17283F"))
                .frame(width: 54, alignment: .leading)
            HStack(spacing: 8) {
                RoundedRectangle(cornerRadius: 6)
                    .fill(resolved?.swiftUIColor ?? AppTokens.muted)
                    .frame(width: 26, height: 26)
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.black.opacity(0.10), lineWidth: 1))
                Text(hex)
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundStyle(Color(hex: "52657F"))
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text("× \(item.count.formatted())")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(Color(hex: "52657F"))
                .frame(width: 70, alignment: .trailing)
            Text(percent)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Color(hex: "70819B"))
                .frame(width: 54, alignment: .trailing)
        }
        .padding(.horizontal, 18)
        .frame(minHeight: 48)
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
    static let rulerTopGutter: CGFloat = 20
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
        let leftGutter = EditorCanvasMetrics.rulerGutter * scale
        let topGutter = EditorCanvasMetrics.rulerTopGutter * scale
        let tolerance: CGFloat = 0.5
        let overflowing = scale > minimumStickyScale + 0.001 && validViewport && (
            artboardFrame.minX - leftGutter < tolerance ||
            artboardFrame.minY - topGutter < tolerance ||
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
        guard cellSize.isFinite, cellSize > 0, viewportSize.isFinite, viewportSize > 0 else { return [] }
        let interval = tickInterval(cellSize: cellSize)
        let regular = stride(from: 1, through: size, by: interval).map { tick in
            EditorViewportRulerTick(tick: tick, offset: artboardOffset + (CGFloat(tick) - 0.5) * cellSize)
        }.filter { $0.offset >= 0 && $0.offset <= viewportSize }
        if !regular.isEmpty { return regular }

        // Exact native port of H5 visibleRulerTicks: first prefer a cell whose
        // centre is visible, then fall back to a partially intersecting edge cell.
        let firstVisible = max(1, Int(ceil(0.5 - artboardOffset / cellSize)))
        let lastVisible = min(size, Int(floor(0.5 + (viewportSize - artboardOffset) / cellSize)))
        if firstVisible <= lastVisible {
            return [EditorViewportRulerTick(
                tick: firstVisible,
                offset: artboardOffset + (CGFloat(firstVisible) - 0.5) * cellSize
            )]
        }

        let firstIntersecting = max(1, Int(floor(-artboardOffset / cellSize)) + 1)
        let lastIntersecting = min(size, Int(ceil((viewportSize - artboardOffset) / cellSize)))
        guard firstIntersecting <= lastIntersecting else { return [] }
        let naturalOffset = artboardOffset + (CGFloat(firstIntersecting) - 0.5) * cellSize
        let edgeInset = min(7, viewportSize / 2)
        return [EditorViewportRulerTick(
            tick: firstIntersecting,
            offset: max(edgeInset, min(viewportSize - edgeInset, naturalOffset))
        )]
    }
}

private struct EditorArtboardFramePreferenceKey: PreferenceKey {
    static var defaultValue: CGRect = .zero
    static func reduce(value: inout CGRect, nextValue: () -> CGRect) { value = nextValue() }
}

struct H5ViewportRulers: View {
    let geometry: EditorViewportRulerGeometry

    var body: some View {
        let leftGutter = EditorCanvasMetrics.rulerGutter
        let topGutter = EditorCanvasMetrics.rulerTopGutter
        ZStack(alignment: .topLeading) {
            Color(hex: "F0F7FA").opacity(0.94)
                .frame(maxWidth: .infinity, alignment: .top)
                .frame(height: topGutter)
                .overlay(alignment: .bottom) { Rectangle().fill(Color(hex: "76818B").opacity(0.34)).frame(height: 1) }
            Color(hex: "F0F7FA").opacity(0.94)
                .frame(maxHeight: .infinity, alignment: .leading)
                .frame(width: leftGutter)
                .overlay(alignment: .trailing) { Rectangle().fill(Color(hex: "76818B").opacity(0.34)).frame(width: 1) }
            ForEach(geometry.columns, id: \.tick) { item in
                Text("\(item.tick)")
                    .font(.system(size: 7, weight: .bold, design: .monospaced))
                    .foregroundStyle(Color(hex: "65727D"))
                    .padding(.horizontal, 3)
                    .frame(minWidth: 14, minHeight: 13)
                    .background(Color(hex: "F5F9FB").opacity(0.88))
                    .clipShape(RoundedRectangle(cornerRadius: 4))
                    .position(x: item.offset, y: topGutter - 7)
            }
            ForEach(geometry.rows, id: \.tick) { item in
                Text("\(item.tick)")
                    .font(.system(size: 7, weight: .bold, design: .monospaced))
                    .foregroundStyle(Color(hex: "65727D"))
                    .padding(.horizontal, 3)
                    .frame(minWidth: 14, minHeight: 13)
                    .background(Color(hex: "F5F9FB").opacity(0.88))
                    .clipShape(RoundedRectangle(cornerRadius: 4))
                    .position(x: leftGutter - 8, y: item.offset)
            }
        }
    }
}

private struct GridCanvas: View {
    @ObservedObject var document: PatternDocument
    let scale: CGFloat
    let hidesStaticRulers: Bool
    let showsCodes: Bool
    @State private var activeStroke = Set<GridCoordinate>()
    @State private var previousStrokeCoordinate: GridCoordinate?

    var body: some View {
        let cellSide = EditorCanvasMetrics.cellSide * scale
        let leftGutter = EditorCanvasMetrics.rulerGutter * scale
        let topGutter = EditorCanvasMetrics.rulerTopGutter * scale
        let artboardWidth = CGFloat(document.columns) * cellSide
        let artboardHeight = CGFloat(document.rows) * cellSide
        let contentWidth = leftGutter + artboardWidth
        let contentHeight = topGutter + artboardHeight

        ZStack(alignment: .topLeading) {
            Canvas(rendersAsynchronously: true) { context, _ in
                draw(
                    context: &context,
                    cellSide: cellSide,
                    leftGutter: leftGutter,
                    topGutter: topGutter,
                    artboardWidth: artboardWidth,
                    artboardHeight: artboardHeight
                )
            }
            .frame(width: contentWidth, height: contentHeight)

            Color.clear
                .frame(width: artboardWidth, height: artboardHeight)
                .background(GeometryReader { proxy in
                    Color.clear.preference(
                        key: EditorArtboardFramePreferenceKey.self,
                        value: proxy.frame(in: .named("editor-canvas-viewport"))
                    )
                })
                .contentShape(Rectangle())
                .gesture(strokeGesture(cellSide: cellSide))
                .allowsHitTesting(document.tool != .pan)
                .accessibilityHidden(true)
                .offset(x: leftGutter, y: topGutter)
        }
        .frame(width: contentWidth, height: contentHeight, alignment: .topLeading)
        .background(AppTokens.flowBackground)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("拼豆编辑画布，缩放 \(Int(scale * 100))%")
        .accessibilityIdentifier("拼豆编辑画布")
    }

    private func draw(
        context: inout GraphicsContext,
        cellSide: CGFloat,
        leftGutter: CGFloat,
        topGutter: CGFloat,
        artboardWidth: CGFloat,
        artboardHeight: CGFloat
    ) {
        let artboard = CGRect(x: leftGutter, y: topGutter, width: artboardWidth, height: artboardHeight)
        context.fill(Path(artboard), with: .color(Color.white))

        if !hidesStaticRulers {
            drawStaticRulers(context: &context, cellSide: cellSide, leftGutter: leftGutter, topGutter: topGutter)
        }

        let gridLine = Color(hex: "AAB4BE").opacity(0.42)
        for (index, cell) in document.cells.enumerated() {
            let column = index % document.columns
            let row = index / document.columns
            let rect = CGRect(
                x: leftGutter + CGFloat(column) * cellSide,
                y: topGutter + CGFloat(row) * cellSide,
                width: cellSide,
                height: cellSide
            )
            if cell.color == Palette.empty {
                let checker = (row + column).isMultiple(of: 2) ? Color.white : Color(hex: "E8EFF2")
                context.fill(Path(rect), with: .color(checker))
            } else {
                context.fill(Path(rect), with: .color(cell.color.swiftUIColor))
            }
            context.stroke(Path(rect), with: .color(gridLine), lineWidth: 0.5)

            if showsCodes, cell.color != Palette.empty {
                let fontSize = cellSide * (cell.color.code.count >= 3 ? 0.50 : 0.52)
                let label = Text(cell.color.code)
                    .font(.system(size: max(6, fontSize), weight: .semibold, design: .monospaced))
                    .foregroundStyle(textColor(for: cell.color))
                context.draw(label, at: CGPoint(x: rect.midX, y: rect.midY), anchor: .center)
            }
        }
        context.stroke(Path(artboard), with: .color(Color(hex: "82909C").opacity(0.45)), lineWidth: 1)
    }

    private func drawStaticRulers(context: inout GraphicsContext, cellSide: CGFloat, leftGutter: CGFloat, topGutter: CGFloat) {
        let labelColor = Color(hex: "65727D")
        let fontSize = max(6, 7 * scale)
        for tick in stride(from: 1, through: max(1, document.columns), by: 5) {
            let label = Text("\(tick)").font(.system(size: fontSize, weight: .bold, design: .monospaced)).foregroundStyle(labelColor)
            context.draw(label, at: CGPoint(x: leftGutter + (CGFloat(tick) - 0.5) * cellSide, y: topGutter / 2), anchor: .center)
        }
        for tick in stride(from: 1, through: max(1, document.rows), by: 5) {
            let label = Text("\(tick)").font(.system(size: fontSize, weight: .bold, design: .monospaced)).foregroundStyle(labelColor)
            context.draw(label, at: CGPoint(x: leftGutter / 2, y: topGutter + (CGFloat(tick) - 0.5) * cellSide), anchor: .center)
        }
    }

    private func textColor(for color: ColorToken) -> Color {
        let value = Int(color.hex, radix: 16) ?? 0
        let red = Double((value >> 16) & 0xff)
        let green = Double((value >> 8) & 0xff)
        let blue = Double(value & 0xff)
        return red * 0.299 + green * 0.587 + blue * 0.114 > 155 ? Color(hex: "1E3048") : .white
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
