import PhotosUI
import SwiftUI

@MainActor
struct SplitSettingsView: View {
    @EnvironmentObject private var router: AppRouter
    @ObservedObject var workflow: SplitWorkflow
    @State private var pickerItem: PhotosPickerItem?
    @State private var imageImportError: String?
    @State private var imageScale: CGFloat = 1
    @State private var imageOffset = CGPoint.zero

    var body: some View {
        GeometryReader { proxy in
            let metrics = H5SplitMetrics(viewportWidth: proxy.size.width)
            VStack(spacing: 0) {
                SplitH5TopBar(
                    title: workflow.splitMode == .quick ? "分割设置" : "对格子",
                    backLabel: "返回首页",
                    actionTitle: "下一步",
                    metrics: metrics,
                    canContinue: workflow.canContinue,
                    onBack: { router.navigate(to: .home(.home)) },
                    onNext: { router.navigate(to: .splitCrop) }
                )

                if let image = workflow.image {
                    ZStack(alignment: .bottom) {
                        SplitSetupCanvas(
                            image: image,
                            workflow: workflow,
                            imageScale: $imageScale,
                            imageOffset: $imageOffset,
                            metrics: metrics
                        )
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .padding(.bottom, metrics.controlsReservedHeight + proxy.safeAreaInsets.bottom)

                        VStack(spacing: metrics.controllerGap) {
                            SplitModeSegmentedControl(workflow: workflow, metrics: metrics)
                                .frame(width: metrics.segmentedWidth, height: metrics.segmentedHeight)

                            SplitSettingsControlCard(workflow: workflow, metrics: metrics)
                                .frame(width: metrics.controllerWidth, height: metrics.controllerHeight)
                        }
                        .padding(.bottom, proxy.safeAreaInsets.bottom)
                        .frame(maxWidth: .infinity)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.white)
                } else {
                    ScrollView {
                        imagePicker.padding(AppTokens.pagePadding)
                    }
                    .background(AppTokens.flowBackground)
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
            .background(Color.white)
        }
        .toolbar(.hidden, for: .navigationBar)
        .onChange(of: workflow.sourceName) { _, _ in
            imageScale = 1
            imageOffset = .zero
        }
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
            }
            .frame(maxWidth: .infinity, minHeight: 164)
            .background(AppTokens.panel)
            .overlay(RoundedRectangle(cornerRadius: AppTokens.cardCorner).stroke(AppTokens.line, style: StrokeStyle(lineWidth: 1, dash: [5])))
            .clipShape(RoundedRectangle(cornerRadius: AppTokens.cardCorner))
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
}

private struct SplitH5TopBar: View {
    let title: String
    let backLabel: String
    let actionTitle: String
    let metrics: H5SplitMetrics
    let canContinue: Bool
    let onBack: () -> Void
    let onNext: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            HStack {
                Button(action: onBack) {
                    H5Icon(name: "lucide-arrow-left", size: metrics.r(0.6984))
                        .foregroundStyle(Color(hex: "111315"))
                        .frame(width: metrics.r(1.2698), height: metrics.r(1.2698))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(backLabel)
                Spacer(minLength: 0)
            }
            .frame(width: metrics.r(2.65))

            Text(title)
                .font(.system(size: metrics.r(0.5397), weight: .heavy))
                .foregroundStyle(Color(hex: "101828"))
                .tracking(-0.1)
                .lineLimit(1)
                .frame(maxWidth: .infinity)
                .accessibilityIdentifier("split-page-title")

            HStack {
                Spacer(minLength: 0)
                Button(action: onNext) {
                    Text(actionTitle)
                        .font(.system(size: metrics.r(0.3968), weight: .semibold))
                        .foregroundStyle(Color.white)
                        .padding(.horizontal, metrics.r(0.508))
                        .frame(minWidth: 38, minHeight: 38, maxHeight: 38)
                        .background(H5SplitStyle.activeBlue)
                        .clipShape(RoundedRectangle(cornerRadius: metrics.r(0.508)))
                        .shadow(color: H5SplitStyle.activeBlue.opacity(0.24), radius: metrics.r(0.32), y: metrics.r(0.18))
                }
                .buttonStyle(H5PressButtonStyle())
                .disabled(!canContinue)
                .opacity(canContinue ? 1 : 0.46)
                .accessibilityLabel(actionTitle)
            }
            .frame(width: metrics.r(2.65))
        }
        .padding(.horizontal, metrics.r(0.4444))
        .frame(height: metrics.r(1.841))
        .background(Color.white)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Color(hex: "EEF2F7")).frame(height: metrics.r(0.0317))
        }
    }
}

private struct H5SplitMetrics {
    let viewportWidth: CGFloat
    let rem: CGFloat

    init(viewportWidth: CGFloat) {
        self.viewportWidth = max(1, viewportWidth)
        // H5: html { font-size: clamp(24.32px, 7.6087vw, 31.5px) }
        self.rem = min(31.5, max(24.32, viewportWidth * 0.076087))
    }

    func r(_ value: CGFloat) -> CGFloat { value * rem }

    var controllerHeight: CGFloat { r(7.05) }
    var controllerGap: CGFloat { r(0.19) }
    var segmentedHeight: CGFloat { 46 }
    var controlsReservedHeight: CGFloat { controllerHeight + controllerGap + segmentedHeight + r(0.254) }
    var controllerWidth: CGFloat { min(max(0, viewportWidth - r(1.016)), r(12.14)) }
    var segmentedWidth: CGFloat { min(max(0, viewportWidth - r(1.524)), r(11.63)) }
    var cardVerticalPadding: CGFloat { r(viewportWidth <= 360 ? 0.4444 : 0.286) }
    var quickHorizontalPadding: CGFloat { r(viewportWidth <= 360 ? 0.3175 : 0.444) }
    var cardRadius: CGFloat { r(0.6349) }
    var segmentedRadius: CGFloat { r(0.508) }
    var segmentedItemRadius: CGFloat { r(0.4127) }
    var alignLeftWidth: CGFloat {
        if viewportWidth <= 360 { return r(4.3175) }
        if viewportWidth <= 413 { return r(4.9524) }
        return r(5.7143)
    }
    var nudgeSide: CGFloat {
        // H5 uses 44px through the <=413px breakpoint and 52px above it.
        if viewportWidth <= 413 { return 44 }
        return 52
    }
    var nudgeGap: CGFloat { viewportWidth <= 360 ? r(0.0635) : r(0.127) }
}

private enum H5SplitStyle {
    static let activeBlue = Color(hex: "0A84FF")
    static let lineBlue = Color(.sRGB, red: 32 / 255, green: 142 / 255, blue: 220 / 255, opacity: 0.46)
    static let majorBlue = Color(.sRGB, red: 20 / 255, green: 105 / 255, blue: 180 / 255, opacity: 0.72)
    static let handleBlue = Color(hex: "208EDC")
    static let handleOrange = Color(hex: "F77D24")
    static let checkerDark = Color(hex: "1A1B1D")
    static let checkerLight = Color(hex: "222426")
    static let cardLine = Color(hex: "DFE7F2")
    static let controlFill = Color(hex: "F1F6FC")
    static let controlLine = Color(hex: "E2EAF4")
    static let controlText = Color(hex: "526175")
    static let secondaryText = Color(hex: "94A3B8")
}

private struct SplitModeSegmentedControl: View {
    @ObservedObject var workflow: SplitWorkflow
    let metrics: H5SplitMetrics

    var body: some View {
        HStack(spacing: 2) {
            ForEach(SplitMode.allCases) { mode in
                Button {
                    workflow.setSplitMode(mode)
                } label: {
                    Text(mode.title)
                        .font(.system(size: metrics.r(0.4444), weight: .bold))
                        .foregroundStyle(workflow.splitMode == mode ? Color.white : Color(hex: "475569"))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(workflow.splitMode == mode ? H5SplitStyle.activeBlue : Color.clear)
                        .clipShape(RoundedRectangle(cornerRadius: metrics.segmentedItemRadius))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(mode.title)
            }
        }
        .padding(1)
        .background(Color(hex: "F1F5F9"))
        .overlay(RoundedRectangle(cornerRadius: metrics.segmentedRadius).stroke(Color(hex: "E2E8F0"), lineWidth: metrics.r(0.0317)))
        .clipShape(RoundedRectangle(cornerRadius: metrics.segmentedRadius))
    }
}

private struct SplitSettingsControlCard: View {
    @ObservedObject var workflow: SplitWorkflow
    let metrics: H5SplitMetrics

    var body: some View {
        Group {
            if workflow.splitMode == .quick {
                SplitQuickControlCard(workflow: workflow, metrics: metrics)
                    .padding(.vertical, metrics.cardVerticalPadding)
                    .padding(.horizontal, metrics.quickHorizontalPadding)
            } else {
                SplitAlignmentControlCard(workflow: workflow, metrics: metrics)
                    .padding(.vertical, metrics.cardVerticalPadding)
                    .padding(.leading, metrics.r(0.3175))
                    .padding(.trailing, metrics.r(0.1587))
            }
        }
        .background(Color.white)
        .overlay(RoundedRectangle(cornerRadius: metrics.cardRadius).stroke(H5SplitStyle.cardLine, lineWidth: metrics.r(0.0317)))
        .clipShape(RoundedRectangle(cornerRadius: metrics.cardRadius))
    }
}

private struct SplitQuickControlCard: View {
    @ObservedObject var workflow: SplitWorkflow
    let metrics: H5SplitMetrics

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .topLeading) {
                Text("\(workflow.columns) × \(workflow.rows)")
                    .font(.system(size: metrics.r(0.952), weight: .heavy, design: .rounded))
                    .foregroundStyle(Color(hex: "172238"))
                    .monospacedDigit()
                    .offset(x: 0, y: metrics.r(1.778))

                H5SplitSlider(
                    value: Binding(
                        get: { Double(workflow.longSide) },
                        set: { workflow.updateLongSide(Int($0.rounded())) }
                    ),
                    range: 8...Double(workflow.maximumLongSide),
                    metrics: metrics
                )
                .frame(width: proxy.size.width, height: 44)
                .offset(x: 0, y: metrics.r(2.921))

                HStack {
                    Text("8")
                    Spacer()
                    Text("\(workflow.maximumLongSide)")
                }
                .font(.system(size: metrics.r(0.349)))
                .foregroundStyle(Color(hex: "94A0B1"))
                .frame(width: proxy.size.width)
                .offset(x: 0, y: metrics.r(4.160))
            }
        }
    }
}

private struct H5SplitSlider: View {
    @Binding var value: Double
    let range: ClosedRange<Double>
    let metrics: H5SplitMetrics

    var body: some View {
        GeometryReader { proxy in
            let thumb: CGFloat = metrics.r(0.763)
            let travel = max(1, proxy.size.width - thumb)
            let span = max(0.0001, range.upperBound - range.lowerBound)
            let progress = CGFloat((min(max(value, range.lowerBound), range.upperBound) - range.lowerBound) / span)
            let centerX = thumb / 2 + progress * travel
            ZStack(alignment: .leading) {
                Capsule().fill(Color(hex: "DBE6F5")).frame(height: metrics.r(0.159))
                Capsule().fill(H5SplitStyle.activeBlue)
                    .frame(width: max(0, centerX - thumb / 2), height: metrics.r(0.159))
                Circle()
                    .fill(H5SplitStyle.activeBlue)
                    .frame(width: thumb, height: thumb)
                    .overlay(Circle().stroke(Color.white, lineWidth: metrics.r(0.095)))
                    .shadow(color: H5SplitStyle.activeBlue.opacity(0.38), radius: 4, y: 2)
                    .position(x: centerX, y: proxy.size.height / 2)
            }
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0).onChanged { drag in
                let x = min(max(thumb / 2, drag.location.x), proxy.size.width - thumb / 2)
                let nextProgress = Double((x - thumb / 2) / travel)
                value = (range.lowerBound + nextProgress * span).rounded()
            })
        }
        .accessibilityLabel("长边格数")
        .accessibilityValue("\(Int(value))")
    }
}

private struct SplitAlignmentControlCard: View {
    @ObservedObject var workflow: SplitWorkflow
    let metrics: H5SplitMetrics

    var body: some View {
        GeometryReader { _ in
            let nudgeSide = metrics.nudgeSide
            let gap = metrics.nudgeGap

            HStack(spacing: metrics.viewportWidth <= 360 ? metrics.r(0.15875) : 0) {
                VStack(alignment: .leading, spacing: metrics.r(0.19)) {
                    // H5 centers only the section title. The 3×3 nudge pad itself
                    // uses `place-content: start`, so it begins at the left edge
                    // of the fixed-width nudge column rather than being centered.
                    Text("微移")
                        .font(.system(size: metrics.r(0.4444), weight: .bold))
                        .foregroundStyle(H5SplitStyle.secondaryText)
                        .frame(width: metrics.alignLeftWidth, height: metrics.r(0.572), alignment: .center)
                    ZStack(alignment: .topLeading) {
                        nudgeButton("⌃", x: nudgeSide + gap, y: 0, side: nudgeSide) { workflow.moveGridControlFrame(x: 0, y: -1) }.accessibilityLabel("上移网格")
                        nudgeButton("‹", x: 0, y: nudgeSide + gap, side: nudgeSide) { workflow.moveGridControlFrame(x: -1, y: 0) }.accessibilityLabel("左移网格")
                        alignmentReadout
                            .offset(x: nudgeSide + gap, y: nudgeSide + gap)
                        nudgeButton("›", x: (nudgeSide + gap) * 2, y: nudgeSide + gap, side: nudgeSide) { workflow.moveGridControlFrame(x: 1, y: 0) }.accessibilityLabel("右移网格")
                        nudgeButton("⌄", x: nudgeSide + gap, y: (nudgeSide + gap) * 2, side: nudgeSide) { workflow.moveGridControlFrame(x: 0, y: 1) }.accessibilityLabel("下移网格")
                    }
                    .frame(
                        width: nudgeSide * 3 + gap * 2,
                        height: nudgeSide * 3 + gap * 2,
                        alignment: .topLeading
                    )
                }
                .frame(width: metrics.alignLeftWidth, alignment: .leading)
                .frame(maxHeight: .infinity, alignment: .topLeading)

                Rectangle().fill(Color(hex: "E7EDF5")).frame(width: metrics.r(0.0317))

                VStack(spacing: 0) {
                    Text("调整格子大小")
                        .font(.system(size: metrics.r(0.4444), weight: .bold))
                        .foregroundStyle(H5SplitStyle.secondaryText)
                        .frame(height: metrics.r(0.572))
                    Spacer().frame(height: metrics.r(metrics.viewportWidth <= 360 ? 0.6984 : 0.508))
                    HStack(spacing: metrics.viewportWidth <= 360 ? 0 : metrics.r(0.1746)) {
                        squareAction("−") { workflow.updateAlignmentCellSize(workflow.alignmentCellSize - 1) }.accessibilityLabel("减小格距")
                        VStack(spacing: metrics.r(0.0952)) {
                            Text(workflow.alignmentCellSize, format: .number.precision(.fractionLength(2)))
                                .font(.system(size: metrics.r(0.7937), weight: .heavy, design: .rounded))
                                .foregroundStyle(Color(hex: "152238"))
                                .minimumScaleFactor(0.62)
                                .lineLimit(1)
                            Text("格 / PX")
                                .font(.system(size: metrics.r(0.3175), weight: .semibold))
                                .foregroundStyle(Color(hex: "8A97A8"))
                        }
                        .frame(maxWidth: .infinity)
                        squareAction("+") { workflow.updateAlignmentCellSize(workflow.alignmentCellSize + 1) }.accessibilityLabel("增大格距")
                    }
                    Text("调整网格线间距\n使其与图纸格线对齐")
                        .font(.system(size: metrics.r(metrics.viewportWidth <= 360 ? 0.3175 : 0.381)))
                        .foregroundStyle(Color(hex: "8A97A8"))
                        .multilineTextAlignment(.center)
                        .lineSpacing(max(0, metrics.r(0.6984) - metrics.r(metrics.viewportWidth <= 360 ? 0.3175 : 0.381)))
                        .padding(.top, metrics.r(metrics.viewportWidth <= 360 ? 0.4444 : 0.6984))
                }
                .padding(.horizontal, metrics.r(0.2222))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            }
        }
    }

    private var alignmentReadout: some View {
        let side = metrics.nudgeSide
        let radius = metrics.r(metrics.viewportWidth <= 360 ? 0.381 : 0.4444)
        let fontSize = metrics.r(metrics.viewportWidth <= 360 ? 0.3175 : 0.381)
        return VStack(spacing: 0) {
            Text(workflow.alignedGrid.offsetX, format: .number.precision(.fractionLength(1)))
            Text(workflow.alignedGrid.offsetY, format: .number.precision(.fractionLength(1)))
        }
        .font(.system(size: fontSize, weight: .bold))
        .foregroundStyle(H5SplitStyle.activeBlue)
        .multilineTextAlignment(.center)
        .frame(width: side, height: side)
        .background(Color(hex: "EAF4FF"))
        .overlay(
            RoundedRectangle(cornerRadius: radius)
                .stroke(Color(hex: "DBEAFF"), lineWidth: metrics.r(0.0317))
        )
        .clipShape(RoundedRectangle(cornerRadius: radius))
    }

    private func nudgeButton(_ text: String, x: CGFloat, y: CGFloat, side: CGFloat, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(text)
                .font(.system(size: metrics.r(metrics.viewportWidth <= 360 ? 0.8254 : 0.9524), weight: .medium))
                .foregroundStyle(H5SplitStyle.controlText)
                .frame(width: side, height: side)
                .background(H5SplitStyle.controlFill)
                .overlay(RoundedRectangle(cornerRadius: metrics.r(metrics.viewportWidth <= 360 ? 0.381 : 0.4444)).stroke(H5SplitStyle.controlLine, lineWidth: metrics.r(0.0317)))
                .clipShape(RoundedRectangle(cornerRadius: metrics.r(metrics.viewportWidth <= 360 ? 0.381 : 0.4444)))
        }
        .buttonStyle(H5PressButtonStyle())
        .offset(x: x, y: y)
    }

    private func squareAction(_ text: String, action: @escaping () -> Void) -> some View {
        let side: CGFloat = metrics.viewportWidth <= 360 ? 44 : 48
        return Button(action: action) {
            Text(text)
                .font(.system(size: metrics.r(0.8889), weight: .medium))
                .foregroundStyle(H5SplitStyle.controlText)
                .frame(width: side, height: side)
                .background(H5SplitStyle.controlFill)
                .overlay(RoundedRectangle(cornerRadius: metrics.r(metrics.viewportWidth <= 360 ? 0.381 : 0.4444)).stroke(H5SplitStyle.controlLine, lineWidth: metrics.r(0.0317)))
                .clipShape(RoundedRectangle(cornerRadius: metrics.r(metrics.viewportWidth <= 360 ? 0.381 : 0.4444)))
        }
        .buttonStyle(H5PressButtonStyle())
    }
}

private struct H5PressButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .opacity(configuration.isPressed ? 0.88 : 1)
    }
}

@MainActor
struct SplitCropView: View {
    @EnvironmentObject private var router: AppRouter
    @ObservedObject var workflow: SplitWorkflow
    @State private var zoom: CGFloat = 1

    var body: some View {
        GeometryReader { pageProxy in
            let metrics = H5SplitMetrics(viewportWidth: pageProxy.size.width)
            VStack(spacing: 0) {
                SplitH5TopBar(
                    title: "裁剪",
                    backLabel: "返回分割设置",
                    actionTitle: "确认裁剪",
                    metrics: metrics,
                    canContinue: workflow.canContinue,
                    onBack: { if !router.path.isEmpty { router.path.removeLast() } },
                    onNext: { router.navigate(to: .splitPreview) }
                )

                GeometryReader { proxy in
                    if let image = workflow.image {
                        CropEditorPreview(
                            image: image,
                            workflow: workflow,
                            zoom: $zoom,
                            metrics: metrics
                        )
                        .frame(width: proxy.size.width, height: proxy.size.height)
                    } else {
                        SplitCropWorkspaceBackground(metrics: metrics)
                    }
                }
                .background(SplitCropWorkspaceBackground(metrics: metrics))
                .clipped()

                Text("仅保留格子内容，裁掉清单、坐标轴等无关区域")
                    .font(.system(size: metrics.r(0.34), weight: .bold))
                    .foregroundStyle(Color(hex: "158467"))
                    .multilineTextAlignment(.center)
                    .lineSpacing(0)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, metrics.r(0.55))
                    .padding(.vertical, metrics.r(0.35))
                    .background(Color(hex: "E9FFF7"))
                    .accessibilityLabel("仅保留格子内容，裁掉清单、坐标轴等无关区域")

                HStack(spacing: 0) {
                    Button {
                        workflow.setCrop(CGRect(x: 0, y: 0, width: 1, height: 1))
                        zoom = 1
                    } label: {
                        Text("重置")
                            .font(.system(size: metrics.r(0.42), weight: .bold))
                            .foregroundStyle(Color(hex: "344054"))
                            .padding(.horizontal, metrics.r(0.48))
                            .frame(minWidth: 44, minHeight: 44)
                            .background(Color(hex: "F1F5FB"))
                            .clipShape(Capsule())
                    }
                    .buttonStyle(H5PressButtonStyle())
                    .accessibilityLabel("重置")

                    Spacer(minLength: 12)

                    HStack(spacing: metrics.r(0.24)) {
                        cropZoomButton("−", label: "缩小裁剪预览", metrics: metrics) {
                            zoom = min(4, max(0.5, zoom * 0.9))
                        }

                        Text("\(Int((zoom * 100).rounded()))%")
                            .font(.system(size: metrics.r(0.42), weight: .heavy, design: .rounded))
                            .foregroundStyle(Color(hex: "344054"))
                            .monospacedDigit()
                            .frame(minWidth: metrics.r(1.7))

                        cropZoomButton("+", label: "放大裁剪预览", metrics: metrics) {
                            zoom = min(4, max(0.5, zoom * 1.1))
                        }
                    }
                }
                .padding(.horizontal, metrics.r(0.55))
                .padding(.vertical, metrics.r(0.35))
                .frame(minHeight: metrics.r(2.05))
                .background(Color.white)
                .overlay(alignment: .top) {
                    Rectangle().fill(Color(hex: "EDF0F5")).frame(height: 1)
                }
            }
            .frame(width: pageProxy.size.width, height: pageProxy.size.height)
            .background(Color.white)
        }
        .toolbar(.hidden, for: .navigationBar)
    }

    private func cropZoomButton(_ text: String, label: String, metrics: H5SplitMetrics, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(text)
                .font(.system(size: metrics.r(0.42), weight: .bold))
                .foregroundStyle(Color(hex: "344054"))
                .frame(width: 44, height: 44)
                .background(Color(hex: "F1F5FB"))
                .clipShape(Circle())
        }
        .buttonStyle(H5PressButtonStyle())
        .accessibilityLabel(label)
    }
}

private struct CropEditorPreview: View {
    let image: UIImage
    @ObservedObject var workflow: SplitWorkflow
    @Binding var zoom: CGFloat
    let metrics: H5SplitMetrics
    @State private var dragStartCrop: CGRect?
    @State private var pinchStartZoom: CGFloat?

    var body: some View {
        GeometryReader { proxy in
            let imageRect = fittedImageRect(in: proxy.size)
            let selection = selectionRect(in: imageRect)

            ZStack(alignment: .topLeading) {
                Image(uiImage: image)
                    .resizable()
                    .interpolation(.high)
                    .frame(width: imageRect.width, height: imageRect.height)
                    .position(x: imageRect.midX, y: imageRect.midY)

                SplitAttachedGridOverlay(
                    imageRect: imageRect,
                    imageSize: image.size,
                    columns: workflow.columns,
                    rows: workflow.rows,
                    alignment: workflow.splitMode == .align ? workflow.alignedGrid : nil
                )

                CropWorkspaceDimMask(selectionRect: selection)
                    .fill(Color(red: 4 / 255, green: 8 / 255, blue: 14 / 255).opacity(0.58), style: FillStyle(eoFill: true))
                    .allowsHitTesting(false)

                cropSelection(selection: selection, imageRect: imageRect)

                Text("\(workflow.columns)列 × \(workflow.rows)行")
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundStyle(Color(hex: "22C7FF"))
                    .padding(.horizontal, 7)
                    .frame(height: 22)
                    .background(Color(hex: "07121E").opacity(0.76))
                    .clipShape(RoundedRectangle(cornerRadius: 5))
                    .frame(
                        width: max(1, selection.width - 12),
                        height: max(1, selection.height - 12),
                        alignment: .bottomTrailing
                    )
                    .offset(x: selection.minX + 6, y: selection.minY + 6)
                    .allowsHitTesting(false)

                Text("\(Int((zoom * 100).rounded()))%")
                    .font(.system(size: 14, weight: .heavy, design: .rounded))
                    .foregroundStyle(Color.white)
                    .monospacedDigit()
                    .padding(.horizontal, 12)
                    .frame(height: 32)
                    .background(Color.black.opacity(0.68))
                    .clipShape(Capsule())
                    .padding(.trailing, 18)
                    .padding(.bottom, 16)
                    .frame(width: proxy.size.width, height: proxy.size.height, alignment: .bottomTrailing)
                    .allowsHitTesting(false)
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
            .contentShape(Rectangle())
            .simultaneousGesture(
                MagnificationGesture()
                    .onChanged { value in
                        if pinchStartZoom == nil { pinchStartZoom = zoom }
                        zoom = min(4, max(0.5, (pinchStartZoom ?? zoom) * value))
                    }
                    .onEnded { _ in pinchStartZoom = nil }
            )
        }
        .clipped()
    }

    private func fittedImageRect(in viewport: CGSize) -> CGRect {
        let safeWidth = max(1, image.size.width)
        let safeHeight = max(1, image.size.height)
        let padding = min(24, max(12, min(viewport.width, viewport.height) * 0.05))
        let fit = min(
            max(1, viewport.width - padding * 2) / safeWidth,
            max(1, viewport.height - padding * 2) / safeHeight
        )
        let safeZoom = min(4, max(0.5, zoom))
        let width = safeWidth * fit * safeZoom
        let height = safeHeight * fit * safeZoom
        return CGRect(
            x: (viewport.width - width) / 2,
            y: (viewport.height - height) / 2,
            width: width,
            height: height
        )
    }

    private func selectionRect(in imageRect: CGRect) -> CGRect {
        let rect = workflow.cropRect
        return CGRect(
            x: imageRect.minX + imageRect.width * rect.minX,
            y: imageRect.minY + imageRect.height * rect.minY,
            width: imageRect.width * rect.width,
            height: imageRect.height * rect.height
        )
    }

    private func cropSelection(selection: CGRect, imageRect: CGRect) -> some View {
        ZStack(alignment: .topLeading) {
            Rectangle()
                .fill(.clear)
                .overlay(Rectangle().stroke(H5SplitStyle.activeBlue, lineWidth: 2))
                .frame(width: selection.width, height: selection.height)
                .offset(x: selection.minX, y: selection.minY)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { value in
                            if dragStartCrop == nil { dragStartCrop = workflow.cropRect }
                            guard let start = dragStartCrop else { return }
                            workflow.setCrop(CGRect(
                                x: start.minX + value.translation.width / max(1, imageRect.width),
                                y: start.minY + value.translation.height / max(1, imageRect.height),
                                width: start.width,
                                height: start.height
                            ))
                        }
                        .onEnded { _ in dragStartCrop = nil }
                )
                .accessibilityLabel("裁剪区域，可拖动")

            ForEach(CropHandle.allCases) { handle in
                CropHandleMarker()
                    .position(
                        x: selection.minX + selection.width * handle.x,
                        y: selection.minY + selection.height * handle.y
                    )
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { value in
                                if dragStartCrop == nil { dragStartCrop = workflow.cropRect }
                                resize(handle, start: dragStartCrop ?? workflow.cropRect, translation: value.translation, imageRect: imageRect)
                            }
                            .onEnded { _ in dragStartCrop = nil }
                    )
                    .accessibilityLabel(handle.label)
            }
        }
    }

    private func resize(_ handle: CropHandle, start: CGRect, translation: CGSize, imageRect: CGRect) {
        let dx = translation.width / max(1, imageRect.width)
        let dy = translation.height / max(1, imageRect.height)
        var minX = start.minX, maxX = start.maxX, minY = start.minY, maxY = start.maxY
        let minimum: CGFloat = 1 / 144
        if handle.x == 0 { minX = min(max(0, start.minX + dx), start.maxX - minimum) }
        if handle.x == 1 { maxX = max(min(1, start.maxX + dx), start.minX + minimum) }
        if handle.y == 0 { minY = min(max(0, start.minY + dy), start.maxY - minimum) }
        if handle.y == 1 { maxY = max(min(1, start.maxY + dy), start.minY + minimum) }
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
        RoundedRectangle(cornerRadius: 4)
            .fill(Color.white)
            .frame(width: 16, height: 16)
            .overlay(RoundedRectangle(cornerRadius: 4).stroke(H5SplitStyle.activeBlue, lineWidth: 3))
            .contentShape(Rectangle().inset(by: -16))
    }
}

private struct CropWorkspaceDimMask: Shape {
    let selectionRect: CGRect

    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.addRect(rect)
        path.addRect(selectionRect)
        return path
    }
}

private struct SplitCropWorkspaceBackground: View {
    let metrics: H5SplitMetrics

    var body: some View {
        Canvas { context, size in
            context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Color(hex: "111318")))
            let side = max(8, metrics.r(0.32))
            let subtle = Color.white.opacity(0.025)
            let rows = Int(ceil(size.height / side))
            let columns = Int(ceil(size.width / side))
            for row in 0..<rows {
                for column in 0..<columns where (row + column).isMultiple(of: 2) {
                    context.fill(
                        Path(CGRect(
                            x: CGFloat(column) * side,
                            y: CGFloat(row) * side,
                            width: side,
                            height: side
                        )),
                        with: .color(subtle)
                    )
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
            VStack(spacing: 14) {
                VStack(spacing: 12) {
                    if workflow.isGenerating {
                        ProgressView("正在生成像素图案…")
                            .frame(maxWidth: .infinity, minHeight: 220)
                    } else {
                        ColorGridView(colors: workflow.previewColors, columns: workflow.columns)
                            .frame(maxWidth: 360)
                            .aspectRatio(CGFloat(workflow.columns) / CGFloat(max(1, workflow.rows)), contentMode: .fit)
                    }
                    HStack {
                        Label("\(workflow.columns) × \(workflow.rows)", systemImage: "square.grid.3x3")
                        Spacer()
                        Text("\(workflow.beadList.count) 色 · \(totalBeads) 颗")
                    }
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Color(hex: "617086"))
                }
                .padding(16)
                .background(Color.white)
                .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color(hex: "E1E8F2"), lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 18))
                .shadow(color: Color.black.opacity(0.045), radius: 14, y: 6)

                if workflow.backgroundRemoved {
                    Label("已去背景 · 透明区域已标记", systemImage: "checkmark.circle.fill")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Color(hex: "16866D"))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 14)
                        .frame(height: 42)
                        .background(Color(hex: "EAF8F3"))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .accessibilityLabel("已去背景，透明区域已标记")
                }

                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("去杂色合并").font(.system(size: 16, weight: .bold))
                            Text("减少低用量颜色，成品更干净").font(.system(size: 12)).foregroundStyle(Color(hex: "8996A8"))
                        }
                        Spacer()
                        Text("≤ \(workflow.mergeThreshold)")
                            .font(.system(size: 14, weight: .bold, design: .rounded))
                            .foregroundStyle(H5SplitStyle.activeBlue)
                            .padding(.horizontal, 10)
                            .frame(height: 30)
                            .background(Color(hex: "EAF4FF"))
                            .clipShape(Capsule())
                    }
                    Slider(value: Binding(get: { Double(workflow.mergeThreshold) }, set: { workflow.updateMergeThreshold(Int($0.rounded())) }), in: 0...20, step: 1)
                        .tint(H5SplitStyle.activeBlue)
                }
                .padding(16)
                .background(Color.white)
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color(hex: "E1E8F2"), lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 16))

                VStack(alignment: .leading, spacing: 12) {
                    Button {
                        workflow.toggleBackgroundRemoval()
                    } label: {
                        HStack {
                            Image(systemName: workflow.backgroundRemoved ? "arrow.uturn.backward" : "person.crop.rectangle")
                            Text(workflow.isBackgroundProcessing ? "处理中…" : workflow.backgroundRemoved ? "恢复原图" : "去除背景")
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.system(size: 12, weight: .bold))
                                .opacity(workflow.backgroundRemoved ? 0 : 1)
                        }
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(workflow.backgroundRemoved ? Color(hex: "526175") : H5SplitStyle.activeBlue)
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.plain)
                    .disabled(workflow.isBackgroundProcessing)
                    .accessibilityLabel(workflow.isBackgroundProcessing ? "背景处理中" : workflow.backgroundRemoved ? "恢复原图" : "去除背景")

                    if workflow.backgroundRemoved {
                        Divider().overlay(Color(hex: "EDF1F6"))
                        HStack {
                            Text("去背景灵敏度").font(.system(size: 14, weight: .semibold))
                            Spacer()
                            Text("\(workflow.backgroundSensitivity)")
                                .font(.system(size: 13, weight: .bold, design: .rounded).monospacedDigit())
                                .foregroundStyle(H5SplitStyle.activeBlue)
                        }
                        Slider(value: Binding(get: { Double(workflow.backgroundSensitivity) }, set: { workflow.updateBackgroundSensitivity(Int($0.rounded())) }), in: 0...100, step: 1)
                            .tint(H5SplitStyle.activeBlue)
                            .accessibilityLabel("去背景灵敏度")
                        HStack { Text("保守"); Spacer(); Text("积极") }
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(Color(hex: "94A3B8"))
                    }
                }
                .padding(16)
                .background(Color.white)
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color(hex: "E1E8F2"), lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 16))

                Button { showBeadList = true } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "list.bullet.rectangle")
                            .foregroundStyle(H5SplitStyle.activeBlue)
                        Text("豆子清单").font(.system(size: 15, weight: .bold)).foregroundStyle(Color(hex: "172238"))
                        Spacer()
                        Text("\(workflow.beadList.count) 色 · \(totalBeads) 颗")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Color(hex: "708095"))
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(Color(hex: "94A3B8"))
                    }
                    .padding(.horizontal, 16)
                    .frame(height: 56)
                    .background(Color.white)
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color(hex: "E1E8F2"), lineWidth: 1))
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                }
                .buttonStyle(H5PressButtonStyle())
                .accessibilityLabel("查看豆子清单，\(workflow.beadList.count) 色，\(totalBeads) 颗")
            }
            .frame(maxWidth: 548)
            .padding(.horizontal, AppTokens.pagePadding)
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity)
        }
        .background(AppTokens.flowBackground)
        .navigationTitle("浏览")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: workflow.previewRevision) {
            if workflow.previewColors.isEmpty && !workflow.isGenerating { workflow.generatePreview() }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("导入画布") { workflow.importTo(document: document); router.navigate(to: .canvas) }
                    .fontWeight(.semibold)
                    .disabled(!workflow.canImport)
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

private struct SplitSetupCanvas: View {
    let image: UIImage
    @ObservedObject var workflow: SplitWorkflow
    @Binding var imageScale: CGFloat
    @Binding var imageOffset: CGPoint
    let metrics: H5SplitMetrics
    @State private var panStart: CGPoint?
    @State private var zoomStart: CGFloat?

    var body: some View {
        GeometryReader { proxy in
            let imageRect = splitImageRect(container: proxy.size)
            ZStack(alignment: .topLeading) {
                SplitCheckerboard()

                Image(uiImage: image)
                    .resizable()
                    .interpolation(.high)
                    .frame(width: imageRect.width, height: imageRect.height)
                    .position(x: imageRect.midX, y: imageRect.midY)

                SplitAttachedGridOverlay(
                    imageRect: imageRect,
                    imageSize: image.size,
                    columns: workflow.columns,
                    rows: workflow.rows,
                    alignment: workflow.splitMode == .align ? workflow.alignedGrid : nil
                )

                Rectangle()
                    .fill(.clear)
                    .contentShape(Rectangle())
                    .gesture(panGesture)
                    .simultaneousGesture(zoomGesture)
                    .onTapGesture {
                        imageScale = min(8, max(0.5, imageScale * 1.12))
                    }

                if workflow.splitMode == .align {
                    H5AlignmentControlOverlay(
                        workflow: workflow,
                        imageRect: imageRect,
                        imageSize: image.size,
                        metrics: metrics
                    )
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
            .clipped()
            .overlay(Rectangle().stroke(Color(hex: "E5EAF2"), lineWidth: 1))
        }
        .accessibilityLabel("切割画布预览")
    }

    private func splitImageRect(container: CGSize) -> CGRect {
        let safeWidth = max(1, image.size.width)
        let safeHeight = max(1, image.size.height)
        let fit = min(container.width / safeWidth, container.height / safeHeight) * 0.82
        let baseWidth = max(1, safeWidth * fit)
        let baseHeight = max(1, safeHeight * fit)
        let scale = min(8, max(0.5, imageScale))
        let width = baseWidth * scale
        let height = baseHeight * scale
        return CGRect(
            x: (container.width - width) / 2 + imageOffset.x,
            y: (container.height - height) / 2 + imageOffset.y,
            width: width,
            height: height
        )
    }

    private var panGesture: some Gesture {
        DragGesture(minimumDistance: 1)
            .onChanged { value in
                if panStart == nil { panStart = imageOffset }
                guard let start = panStart else { return }
                imageOffset = CGPoint(x: start.x + value.translation.width, y: start.y + value.translation.height)
            }
            .onEnded { _ in panStart = nil }
    }

    private var zoomGesture: some Gesture {
        MagnificationGesture()
            .onChanged { value in
                if zoomStart == nil { zoomStart = imageScale }
                imageScale = min(8, max(0.5, (zoomStart ?? imageScale) * value))
            }
            .onEnded { _ in zoomStart = nil }
    }
}

private struct SplitCheckerboard: View {
    var body: some View {
        Canvas { context, size in
            let tile: CGFloat = 16
            context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(H5SplitStyle.checkerDark))
            let rows = Int(ceil(size.height / tile))
            let columns = Int(ceil(size.width / tile))
            for row in 0..<rows {
                for column in 0..<columns where (row + column).isMultiple(of: 2) {
                    context.fill(
                        Path(CGRect(x: CGFloat(column) * tile, y: CGFloat(row) * tile, width: tile, height: tile)),
                        with: .color(H5SplitStyle.checkerLight)
                    )
                }
            }
        }
    }
}

private struct SplitAttachedGridOverlay: View {
    let imageRect: CGRect
    let imageSize: CGSize
    let columns: Int
    let rows: Int
    let alignment: AlignedSplitGrid?

    var body: some View {
        Canvas { context, _ in
            drawGrid(context: &context, majorEvery: 1, color: H5SplitStyle.lineBlue, width: 1)
            drawGrid(context: &context, majorEvery: 5, color: H5SplitStyle.majorBlue, width: 1.5)
        }
        .allowsHitTesting(false)
    }

    private func drawGrid(context: inout GraphicsContext, majorEvery: Int, color: Color, width: CGFloat) {
        var path = Path()
        if let alignment {
            let cropWidth = max(1, imageSize.width)
            let cropHeight = max(1, imageSize.height)
            let startX = imageRect.minX + alignment.offsetX / cropWidth * imageRect.width
            let startY = imageRect.minY + alignment.offsetY / cropHeight * imageRect.height
            let stepX = alignment.cellSize / cropWidth * imageRect.width
            let stepY = alignment.cellSize / cropHeight * imageRect.height
            appendAlignedLines(path: &path, startX: startX, startY: startY, stepX: stepX, stepY: stepY, majorEvery: majorEvery)
        } else {
            guard columns > 0, rows > 0 else { return }
            if columns > 1 {
                for column in 1..<columns where column.isMultiple(of: majorEvery) {
                    let x = imageRect.minX + CGFloat(column) / CGFloat(columns) * imageRect.width
                    path.move(to: CGPoint(x: x, y: imageRect.minY))
                    path.addLine(to: CGPoint(x: x, y: imageRect.maxY))
                }
            }
            if rows > 1 {
                for row in 1..<rows where row.isMultiple(of: majorEvery) {
                    let y = imageRect.minY + CGFloat(row) / CGFloat(rows) * imageRect.height
                    path.move(to: CGPoint(x: imageRect.minX, y: y))
                    path.addLine(to: CGPoint(x: imageRect.maxX, y: y))
                }
            }
        }
        context.stroke(path, with: .color(color), lineWidth: width)
    }

    private func appendAlignedLines(path: inout Path, startX: CGFloat, startY: CGFloat, stepX: CGFloat, stepY: CGFloat, majorEvery: Int) {
        guard stepX > 0, stepY > 0 else { return }
        var column = Int(ceil((imageRect.minX - startX) / stepX))
        var x = startX + CGFloat(column) * stepX
        while x <= imageRect.maxX + 0.01 {
            if column.isMultiple(of: majorEvery) {
                path.move(to: CGPoint(x: x, y: imageRect.minY))
                path.addLine(to: CGPoint(x: x, y: imageRect.maxY))
            }
            column += 1
            x += stepX
        }
        var row = Int(ceil((imageRect.minY - startY) / stepY))
        var y = startY + CGFloat(row) * stepY
        while y <= imageRect.maxY + 0.01 {
            if row.isMultiple(of: majorEvery) {
                path.move(to: CGPoint(x: imageRect.minX, y: y))
                path.addLine(to: CGPoint(x: imageRect.maxX, y: y))
            }
            row += 1
            y += stepY
        }
    }
}

private struct H5AlignmentControlOverlay: View {
    @ObservedObject var workflow: SplitWorkflow
    let imageRect: CGRect
    let imageSize: CGSize
    let metrics: H5SplitMetrics
    @State private var frameDragStart: CGPoint?
    @State private var scaleDragStart: CGFloat?

    var body: some View {
        let rect = controlFrameRect
        ZStack(alignment: .topLeading) {
            Rectangle()
                .fill(H5SplitStyle.handleBlue.opacity(0.14))
                .overlay(Rectangle().stroke(H5SplitStyle.handleBlue.opacity(0.68), lineWidth: metrics.r(0.0317)))
                .overlay(Rectangle().inset(by: metrics.r(0.0317)).stroke(Color.white.opacity(0.28), lineWidth: metrics.r(0.0317)))
                .frame(width: rect.width, height: rect.height)
                .offset(x: rect.minX, y: rect.minY)
                .contentShape(Rectangle())
                .gesture(moveGesture)
                .accessibilityLabel("按住移动网格")

            handleRing(color: H5SplitStyle.handleBlue, kind: .move)
                .position(x: rect.minX, y: rect.minY)
                .gesture(moveGesture)
                .accessibilityLabel("按住移动网格")

            handleLabel("移动", color: H5SplitStyle.handleBlue)
                .position(x: rect.minX + metrics.r(0.254), y: rect.minY)

            handleRing(color: H5SplitStyle.handleOrange, kind: .scale)
                .position(x: rect.maxX, y: rect.maxY)
                .gesture(scaleGesture)
                .accessibilityLabel("按住缩放网格")

            handleLabel("缩放", color: H5SplitStyle.handleOrange)
                .position(x: rect.maxX - metrics.r(0.254), y: rect.maxY)
        }
    }

    private enum HandleKind { case move, scale }

    private var controlFrameRect: CGRect {
        let safeWidth = max(1, imageSize.width)
        let safeHeight = max(1, imageSize.height)
        let origin = workflow.alignmentFrameOrigin
        return CGRect(
            x: imageRect.minX + origin.x / safeWidth * imageRect.width,
            y: imageRect.minY + origin.y / safeHeight * imageRect.height,
            width: workflow.alignmentCellSize * 3 / safeWidth * imageRect.width,
            height: workflow.alignmentCellSize * 3 / safeHeight * imageRect.height
        )
    }

    private var moveGesture: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                if frameDragStart == nil { frameDragStart = workflow.alignmentFrameOrigin }
                guard let start = frameDragStart else { return }
                let dx = imageRect.width > 0 ? value.translation.width / imageRect.width * imageSize.width : 0
                let dy = imageRect.height > 0 ? value.translation.height / imageRect.height * imageSize.height : 0
                workflow.setGridControlFrameOrigin(CGPoint(x: start.x + dx, y: start.y + dy))
            }
            .onEnded { _ in frameDragStart = nil }
    }

    private var scaleGesture: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                if scaleDragStart == nil { scaleDragStart = workflow.alignmentCellSize }
                let dx = imageRect.width > 0 ? value.translation.width / imageRect.width * imageSize.width : 0
                let dy = imageRect.height > 0 ? value.translation.height / imageRect.height * imageSize.height : 0
                workflow.updateAlignmentCellSize((scaleDragStart ?? workflow.alignmentCellSize) + (dx + dy) / 6)
            }
            .onEnded { _ in scaleDragStart = nil }
    }

    private func handleRing(color: Color, kind: HandleKind) -> some View {
        let ringSide = metrics.r(1.0159)
        let crossLong = metrics.r(kind == .move ? 0.4127 : 0.381)
        let crossThick = metrics.r(0.0635)
        return ZStack {
            Circle()
                .fill(Color.white.opacity(0.22))
                .overlay(Circle().stroke(color, lineWidth: metrics.r(0.0635)))
                .shadow(color: color.opacity(0.18), radius: metrics.r(0.0635), y: 0)
                .shadow(color: color.opacity(0.16), radius: metrics.r(0.3175), y: metrics.r(0.127))
            if kind == .move {
                Rectangle().fill(color.opacity(0.72)).frame(width: crossLong, height: crossThick)
                Rectangle().fill(color.opacity(0.72)).frame(width: crossThick, height: crossLong)
            } else {
                Rectangle().fill(color.opacity(0.78)).frame(width: crossLong, height: crossThick).rotationEffect(.degrees(45))
                Rectangle().fill(color.opacity(0.78)).frame(width: crossLong, height: crossThick).rotationEffect(.degrees(-45))
            }
        }
        .frame(width: ringSide, height: ringSide)
        .contentShape(Rectangle().inset(by: -(max(44, metrics.r(1.3968)) - ringSide) / 2))
    }

    private func handleLabel(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.system(size: metrics.r(0.2857), weight: .heavy))
            .foregroundStyle(Color.white)
            .padding(.horizontal, metrics.r(0.127))
            .padding(.vertical, metrics.r(0.0635))
            .background(color.opacity(0.96))
            .clipShape(Capsule())
            .shadow(color: color.opacity(0.22), radius: metrics.r(0.381), y: metrics.r(0.127))
            .allowsHitTesting(false)
    }
}


private struct ColorGridView: View {
    let colors: [ColorToken]
    let columns: Int
    var body: some View { GeometryReader { proxy in let side = proxy.size.width / CGFloat(max(1, columns)); LazyVGrid(columns: Array(repeating: GridItem(.fixed(side), spacing: 0), count: columns), spacing: 0) { ForEach(Array(colors.indices), id: \.self) { index in Rectangle().fill(colors[index].swiftUIColor).frame(width: side, height: side).overlay(Rectangle().stroke(AppTokens.gridLine, lineWidth: 0.2)) } } } }
}
