import PhotosUI
import SwiftUI

@MainActor
struct SplitSettingsView: View {
    @EnvironmentObject private var router: AppRouter
    @ObservedObject var workflow: SplitWorkflow
    @State private var pickerItem: PhotosPickerItem?
    @State private var imageImportError: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                if workflow.image == nil {
                    imagePicker
                } else {
                    gridPreview
                    Picker("分割模式", selection: Binding(get: { workflow.splitMode }, set: { workflow.setSplitMode($0) })) {
                        ForEach(SplitMode.allCases) { mode in Text(mode.title).tag(mode) }
                    }
                    .pickerStyle(.segmented).accessibilityLabel("分割模式")
                    if workflow.splitMode == .quick {
                        quickControls
                    } else {
                        alignmentControls
                    }
                }
            }.padding(AppTokens.pagePadding)
        }
        .background(AppTokens.flowBackground)
        .navigationTitle("分割设置").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("下一步") { router.navigate(to: .splitCrop) }.disabled(!workflow.canContinue).accessibilityLabel("进入裁剪") } }
        .alert("图片导入失败", isPresented: Binding(get: { imageImportError != nil }, set: { if !$0 { imageImportError = nil } })) {
            Button("知道了", role: .cancel) { imageImportError = nil }
        } message: {
            Text(imageImportError ?? "无法读取这张图片，请选择其他图片后重试。")
        }
    }

    private var imagePicker: some View {
        PhotosPicker(selection: $pickerItem, matching: .images) {
            VStack(spacing: 12) {
                Image(systemName: "photo.badge.plus").font(.system(size: 34)).foregroundStyle(AppTokens.flowBrand)
                Text("选择或更换参考图片").font(.headline).foregroundStyle(AppTokens.flowText)
                Text("支持从系统相册选择图片").font(.subheadline).foregroundStyle(AppTokens.muted)
            }.frame(maxWidth: .infinity, minHeight: 164).background(AppTokens.panel).overlay(RoundedRectangle(cornerRadius: AppTokens.cardCorner).stroke(AppTokens.line, style: StrokeStyle(lineWidth: 1, dash: [5]))).clipShape(RoundedRectangle(cornerRadius: AppTokens.cardCorner))
        }
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task {
                guard let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) else {
                    imageImportError = "无法读取这张图片，请选择其他图片后重试。"
                    return
                }
                await MainActor.run { workflow.load(image: image, data: data, name: item.itemIdentifier ?? "参考图片") }
            }
        }
        .accessibilityLabel("选择参考图片")
    }

    private var gridPreview: some View {
        Group {
            if workflow.splitMode == .align, let image = workflow.image {
                InteractiveAlignedGridPreview(image: image, workflow: workflow)
            } else {
                ZStack {
                    if let image = workflow.image { Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 280).clipShape(RoundedRectangle(cornerRadius: AppTokens.cardCorner)) }
                    GridOverlay(columns: workflow.columns, rows: workflow.rows).clipShape(RoundedRectangle(cornerRadius: AppTokens.cardCorner))
                }
                .frame(maxWidth: .infinity)
            }
        }
    }

    private var quickControls: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack { Text("长边格数").font(.headline); Spacer(); Text("\(workflow.columns) × \(workflow.rows)").foregroundStyle(AppTokens.flowBrand).font(.subheadline.weight(.semibold)) }
            Slider(value: Binding(get: { Double(workflow.longSide) }, set: { workflow.updateLongSide(Int($0.rounded())) }), in: 8...120, step: 1)
            HStack { Text("8"); Spacer(); Text("120") }.font(.caption).foregroundStyle(AppTokens.muted)
        }.padding(16).background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner))
    }

    private var alignmentControls: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack { Text("对格子").font(.headline); Spacer(); Text("\(workflow.columns) × \(workflow.rows)").foregroundStyle(AppTokens.flowBrand).font(.subheadline.weight(.semibold)) }
            Text("拖动下方控制或微调网格，使其与原图中的方格对齐。对格子会按格距和偏移分别取样。")
                .font(.footnote).foregroundStyle(AppTokens.muted)
            HStack(spacing: 12) {
                VStack(spacing: 7) {
                    Button("上移网格") { workflow.moveAlignment(x: 0, y: -1) }
                    HStack(spacing: 7) {
                        Button("左移网格") { workflow.moveAlignment(x: -1, y: 0) }
                        Text("\(Int(workflow.alignmentOffset.x)), \(Int(workflow.alignmentOffset.y))").font(.caption.monospacedDigit()).frame(minWidth: 74)
                        Button("右移网格") { workflow.moveAlignment(x: 1, y: 0) }
                    }
                    Button("下移网格") { workflow.moveAlignment(x: 0, y: 1) }
                }
                .buttonStyle(.bordered)
                VStack(alignment: .leading, spacing: 6) {
                    Text("格距 \(workflow.alignmentCellSize, specifier: "%.1f") px").font(.subheadline.weight(.medium))
                    HStack {
                        Button("减小格距") { workflow.updateAlignmentCellSize(workflow.alignmentCellSize - 1) }
                        Button("增大格距") { workflow.updateAlignmentCellSize(workflow.alignmentCellSize + 1) }
                    }.buttonStyle(.bordered)
                }
            }
        }.padding(16).background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner))
    }
}

@MainActor
struct SplitCropView: View {
    @EnvironmentObject private var router: AppRouter
    @ObservedObject var workflow: SplitWorkflow
    @State private var zoom: CGFloat = 1
    var body: some View {
        VStack(spacing: 0) {
            GeometryReader { proxy in
                if let image = workflow.image {
                    CropEditorPreview(image: image, workflow: workflow, zoom: zoom)
                        .frame(width: proxy.size.width, height: proxy.size.height)
                }
            }
            .background(CropCheckerboard())
            Text("仅保留格子内容，裁掉清单、坐标轴等无关区域")
                .font(.footnote.weight(.medium)).foregroundStyle(Color(hex: "16866D"))
                .frame(maxWidth: .infinity).padding(.vertical, 13)
                .background(Color(hex: "E6FAF3"))
            HStack {
                Button("重置") { workflow.setCrop(CGRect(x: 0, y: 0, width: 1, height: 1)); zoom = 1 }
                    .accessibilityLabel("重置裁剪")
                Spacer()
                Button("−") { zoom = max(0.6, zoom - 0.1) }.accessibilityLabel("缩小裁剪预览")
                Text("\(Int(zoom * 100))%").font(.headline.monospacedDigit()).frame(minWidth: 64)
                Button("+") { zoom = min(3, zoom + 0.1) }.accessibilityLabel("放大裁剪预览")
            }
            .buttonStyle(.bordered)
            .padding(.horizontal, AppTokens.pagePadding).padding(.vertical, 12)
            .background(AppTokens.panel)
        }
        .background(AppTokens.flowBackground)
        .navigationTitle("裁剪").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("确认裁剪") { router.navigate(to: .splitPreview) }.disabled(!workflow.canContinue).accessibilityLabel("确认裁剪") } }
    }
}

private struct CropEditorPreview: View {
    let image: UIImage
    @ObservedObject var workflow: SplitWorkflow
    let zoom: CGFloat
    @State private var startCrop = CGRect(x: 0, y: 0, width: 1, height: 1)

    var body: some View {
        GeometryReader { proxy in
            let aspect = max(0.01, image.size.width / max(1, image.size.height))
            let baseWidth = proxy.size.width
            let baseHeight = baseWidth / aspect
            let width = baseWidth * zoom
            let height = baseHeight * zoom
            ZStack(alignment: .topLeading) {
                Image(uiImage: image).resizable().frame(width: width, height: height)
                Color.black.opacity(0.22)
                cropSelection(width: width, height: height)
            }
            .frame(width: width, height: height)
            .position(x: proxy.size.width / 2, y: proxy.size.height / 2)
            .clipped()
        }
        .onAppear { startCrop = workflow.cropRect }
    }

    private func cropSelection(width: CGFloat, height: CGFloat) -> some View {
        let rect = workflow.cropRect
        return ZStack(alignment: .topLeading) {
            Image(uiImage: image).resizable().frame(width: width, height: height)
                .clipShape(Rectangle())
                .frame(width: width * rect.width, height: height * rect.height)
                .offset(x: width * rect.minX, y: height * rect.minY)
            Rectangle().fill(.clear).overlay(Rectangle().stroke(AppTokens.flowBrand, lineWidth: 3))
                .frame(width: width * rect.width, height: height * rect.height)
                .offset(x: width * rect.minX, y: height * rect.minY)
                .gesture(DragGesture().onChanged { value in
                    workflow.setCrop(CGRect(x: startCrop.minX + value.translation.width / width, y: startCrop.minY + value.translation.height / height, width: startCrop.width, height: startCrop.height))
                }.onEnded { _ in startCrop = workflow.cropRect })
                .accessibilityLabel("裁剪区域，可拖动")
            ForEach(CropHandle.allCases) { handle in
                CropHandleMarker()
                    .position(x: width * (rect.minX + rect.width * handle.x), y: height * (rect.minY + rect.height * handle.y))
                    .gesture(DragGesture().onChanged { value in resize(handle, translation: value.translation, width: width, height: height) }
                        .onEnded { _ in startCrop = workflow.cropRect })
                    .accessibilityLabel(handle.label)
            }
        }
    }

    private func resize(_ handle: CropHandle, translation: CGSize, width: CGFloat, height: CGFloat) {
        let minimum: CGFloat = 0.08
        let dx = translation.width / max(1, width), dy = translation.height / max(1, height)
        var minX = startCrop.minX, maxX = startCrop.maxX, minY = startCrop.minY, maxY = startCrop.maxY
        if handle.x == 0 { minX = min(max(0, startCrop.minX + dx), startCrop.maxX - minimum) }
        if handle.x == 1 { maxX = max(min(1, startCrop.maxX + dx), startCrop.minX + minimum) }
        if handle.y == 0 { minY = min(max(0, startCrop.minY + dy), startCrop.maxY - minimum) }
        if handle.y == 1 { maxY = max(min(1, startCrop.maxY + dy), startCrop.minY + minimum) }
        workflow.setCrop(CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY))
    }
}

private enum CropHandle: CaseIterable, Identifiable {
    case topLeft, top, topRight, left, right, bottomLeft, bottom, bottomRight
    var id: Self { self }
    var x: CGFloat { switch self { case .topLeft, .left, .bottomLeft: 0; case .top, .bottom: 0.5; case .topRight, .right, .bottomRight: 1 } }
    var y: CGFloat { switch self { case .topLeft, .top, .topRight: 0; case .left, .right: 0.5; case .bottomLeft, .bottom, .bottomRight: 1 } }
    var label: String { switch self { case .topLeft: "调整裁剪左上角"; case .top: "调整裁剪上边"; case .topRight: "调整裁剪右上角"; case .left: "调整裁剪左边"; case .right: "调整裁剪右边"; case .bottomLeft: "调整裁剪左下角"; case .bottom: "调整裁剪下边"; case .bottomRight: "调整裁剪右下角" } }
}

private struct CropHandleMarker: View {
    var body: some View {
        RoundedRectangle(cornerRadius: 5).fill(AppTokens.panel)
            .frame(width: 26, height: 26)
            .overlay(RoundedRectangle(cornerRadius: 5).stroke(AppTokens.flowBrand, lineWidth: 4))
            .contentShape(Rectangle())
    }
}

private struct CropCheckerboard: View {
    var body: some View {
        Canvas { context, size in
            let side: CGFloat = 20
            for row in 0...Int(size.height / side) {
                for column in 0...Int(size.width / side) {
                    let color = (row + column).isMultiple(of: 2) ? Color(hex: "14181D") : Color(hex: "1E2429")
                    context.fill(Path(CGRect(x: CGFloat(column) * side, y: CGFloat(row) * side, width: side, height: side)), with: .color(color))
                }
            }
        }
    }
}

@MainActor
struct SplitPreviewView: View {
    @EnvironmentObject private var router: AppRouter
    @ObservedObject var workflow: SplitWorkflow
    @ObservedObject var document: PatternDocument
    @State private var showBeadList = false

    private var totalBeads: Int { workflow.beadList.reduce(0) { $0 + $1.count } }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                if workflow.isGenerating { ProgressView("正在生成像素图案…") } else { ColorGridView(colors: workflow.previewColors, columns: workflow.columns).frame(maxWidth: 340).aspectRatio(CGFloat(workflow.columns) / CGFloat(max(1, workflow.rows)), contentMode: .fit) }
                if workflow.backgroundRemoved {
                    Label("已去背景 · 透明区域已标记", systemImage: "checkmark.circle.fill")
                        .font(.footnote.weight(.medium)).foregroundStyle(.green)
                        .accessibilityLabel("已去背景，透明区域已标记")
                }
                VStack(alignment: .leading, spacing: 8) {
                    HStack { Text("去杂色合并").font(.headline); Spacer(); Text("≤ \(workflow.mergeThreshold)").foregroundStyle(AppTokens.flowBrand) }
                    Slider(value: Binding(get: { Double(workflow.mergeThreshold) }, set: { workflow.mergeThreshold = Int($0.rounded()); workflow.generatePreview() }), in: 0...20, step: 1)
                    Text("低用量颜色会自动并入最接近的常用色，减少成品杂点。")
                        .font(.footnote).foregroundStyle(AppTokens.muted)
                }.padding(16).background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner))
                VStack(alignment: .leading, spacing: 10) {
                    Button {
                        workflow.toggleBackgroundRemoval()
                    } label: {
                        Label(workflow.isBackgroundProcessing ? "处理中…" : workflow.backgroundRemoved ? "恢复原图" : "去除背景", systemImage: workflow.backgroundRemoved ? "arrow.uturn.backward" : "person.crop.rectangle")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered).disabled(workflow.isBackgroundProcessing)
                    .accessibilityLabel(workflow.isBackgroundProcessing ? "背景处理中" : workflow.backgroundRemoved ? "恢复原图" : "去除背景")
                    if workflow.backgroundRemoved {
                        HStack { Text("去背景灵敏度").font(.subheadline.weight(.medium)); Spacer(); Text("\(workflow.backgroundSensitivity)").font(.caption.monospacedDigit()).foregroundStyle(AppTokens.flowBrand) }
                        Slider(value: Binding(get: { Double(workflow.backgroundSensitivity) }, set: { workflow.updateBackgroundSensitivity(Int($0.rounded())) }), in: 0...100, step: 1)
                            .accessibilityLabel("去背景灵敏度")
                        HStack { Text("保守"); Spacer(); Text("积极") }.font(.caption).foregroundStyle(AppTokens.muted)
                    }
                }.padding(16).background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner))
                Button { showBeadList = true } label: {
                    HStack {
                        Text("豆子清单").font(.headline)
                        Spacer()
                        Text("\(workflow.beadList.count) 色 · \(totalBeads) 颗").font(.subheadline.weight(.medium)).foregroundStyle(AppTokens.flowBrand)
                        Image(systemName: "chevron.right").font(.footnote.weight(.bold)).foregroundStyle(AppTokens.flowBrand)
                    }.padding(16).background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("查看豆子清单，\(workflow.beadList.count) 色，\(totalBeads) 颗")
            }.padding(AppTokens.pagePadding)
        }
        .background(AppTokens.flowBackground)
        .navigationTitle("浏览").navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("导入画布") { workflow.importTo(document: document); router.navigate(to: .canvas) }
                    .disabled(!workflow.canContinue)
                    .accessibilityLabel("导入到画布")
            }
        }
        .sheet(isPresented: $showBeadList) { SplitBeadListSheet(items: workflow.beadList, total: totalBeads) }
    }
}

private struct SplitBeadListSheet: View {
    @Environment(\.dismiss) private var dismiss
    let items: [ProjectBeadCount]
    let total: Int

    var body: some View {
        NavigationStack {
            List {
                Section("共 \(total) 颗") {
                    ForEach(items, id: \.color) { item in
                        HStack {
                            Circle().fill(Mard221Palette.colors.first(where: { $0.code == item.color })?.swiftUIColor ?? AppTokens.muted).frame(width: 22, height: 22)
                            Text(item.color).font(.body.weight(.medium))
                            Spacer()
                            Text("\(item.count) 颗").foregroundStyle(AppTokens.muted)
                        }
                    }
                }
            }
            .navigationTitle("豆子清单").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("关闭") { dismiss() } } }
        }
    }
}

private struct GridOverlay: View {
    let columns: Int
    let rows: Int
    var body: some View { GeometryReader { proxy in Path { path in for column in 0...columns { let x = proxy.size.width * CGFloat(column) / CGFloat(columns); path.move(to: CGPoint(x: x, y: 0)); path.addLine(to: CGPoint(x: x, y: proxy.size.height)) }; for row in 0...rows { let y = proxy.size.height * CGFloat(row) / CGFloat(rows); path.move(to: CGPoint(x: 0, y: y)); path.addLine(to: CGPoint(x: proxy.size.width, y: y)) } }.stroke(.white.opacity(0.8), lineWidth: 0.6) } }
}

private struct AlignedGridOverlay: View {
    let grid: AlignedSplitGrid
    let imageSize: CGSize
    var body: some View {
        GeometryReader { proxy in
            Path { path in
                let scaleX = proxy.size.width / max(1, imageSize.width)
                let scaleY = proxy.size.height / max(1, imageSize.height)
                let cellX = grid.cellSize * scaleX, cellY = grid.cellSize * scaleY
                let startX = grid.offsetX * scaleX, startY = grid.offsetY * scaleY
                for column in 0...grid.columns {
                    let x = startX + CGFloat(column) * cellX
                    path.move(to: CGPoint(x: x, y: startY)); path.addLine(to: CGPoint(x: x, y: startY + CGFloat(grid.rows) * cellY))
                }
                for row in 0...grid.rows {
                    let y = startY + CGFloat(row) * cellY
                    path.move(to: CGPoint(x: startX, y: y)); path.addLine(to: CGPoint(x: startX + CGFloat(grid.columns) * cellX, y: y))
                }
            }.stroke(AppTokens.flowBrand.opacity(0.9), lineWidth: 1)
        }
    }
}

private struct InteractiveAlignedGridPreview: View {
    let image: UIImage
    @ObservedObject var workflow: SplitWorkflow
    @State private var initialOffset = CGPoint.zero
    @State private var initialCellSize: CGFloat = 1

    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            let height = width / max(0.01, image.size.width / max(1, image.size.height))
            ZStack {
                Image(uiImage: image)
                    .resizable()
                    .frame(width: width, height: height)
                AlignedGridOverlay(grid: workflow.alignedGrid, imageSize: image.size)
                    .frame(width: width, height: height)
                Rectangle()
                    .fill(.clear)
                    .contentShape(Rectangle())
                    .gesture(DragGesture(minimumDistance: 0)
                        .onChanged { value in
                            let offset = CGPoint(
                                x: initialOffset.x + value.translation.width * image.size.width / max(1, width),
                                y: initialOffset.y + value.translation.height * image.size.height / max(1, height)
                            )
                            workflow.setAlignmentOffset(offset)
                        }
                        .onEnded { _ in initialOffset = workflow.alignmentOffset }
                    )
                    .simultaneousGesture(MagnificationGesture()
                        .onChanged { value in workflow.updateAlignmentCellSize(initialCellSize * value) }
                        .onEnded { _ in initialCellSize = workflow.alignmentCellSize }
                    )
                    .accessibilityLabel("对格子控制框，可拖动网格或双指缩放格距")
            }
            .frame(width: width, height: height)
            .clipShape(RoundedRectangle(cornerRadius: AppTokens.cardCorner))
        }
        .aspectRatio(image.size.width / max(1, image.size.height), contentMode: .fit)
        .frame(maxHeight: 280)
        .onAppear { initialOffset = workflow.alignmentOffset; initialCellSize = workflow.alignmentCellSize }
    }
}

private struct ColorGridView: View {
    let colors: [ColorToken]
    let columns: Int
    var body: some View { GeometryReader { proxy in let side = proxy.size.width / CGFloat(max(1, columns)); LazyVGrid(columns: Array(repeating: GridItem(.fixed(side), spacing: 0), count: columns), spacing: 0) { ForEach(Array(colors.indices), id: \.self) { index in Rectangle().fill(colors[index].swiftUIColor).frame(width: side, height: side).overlay(Rectangle().stroke(AppTokens.gridLine, lineWidth: 0.2)) } } } }
}
