import Foundation
import UIKit

enum SplitMode: String, CaseIterable, Identifiable {
    case quick
    case align

    var id: String { rawValue }
    var title: String { self == .quick ? "快速分割" : "对格子" }
}

struct AlignedSplitGrid: Equatable {
    let columns: Int
    let rows: Int
    let cellSize: CGFloat
    let offsetX: CGFloat
    let offsetY: CGFloat
}

enum AlignedSplitGeometry {
    static func grid(cropWidth: CGFloat, cropHeight: CGFloat, cellSize: CGFloat, offsetX: CGFloat, offsetY: CGFloat) -> AlignedSplitGrid {
        let safeCellSize = max(1, cellSize)
        let safeOffsetX = min(max(0, offsetX), max(0, cropWidth - safeCellSize))
        let safeOffsetY = min(max(0, offsetY), max(0, cropHeight - safeCellSize))
        return AlignedSplitGrid(
            columns: max(1, Int(floor((cropWidth - safeOffsetX) / safeCellSize))),
            rows: max(1, Int(floor((cropHeight - safeOffsetY) / safeCellSize))),
            cellSize: safeCellSize,
            offsetX: safeOffsetX,
            offsetY: safeOffsetY
        )
    }
}

@MainActor
final class SplitWorkflow: ObservableObject {
    @Published var image: UIImage?
    @Published private(set) var sourceImageData: Data?
    @Published var sourceName = ""
    @Published var longSide = 32
    @Published private(set) var columns = 32
    @Published private(set) var rows = 32
    @Published private(set) var previewColors: [ColorToken] = []
    @Published private(set) var isGenerating = false
    @Published var mergeThreshold = 0
    @Published var backgroundRemoved = false
    @Published private(set) var isBackgroundProcessing = false
    @Published var backgroundSensitivity = 0
    @Published private(set) var cropRect = CGRect(x: 0, y: 0, width: 1, height: 1)
    @Published var splitMode: SplitMode = .quick
    @Published private(set) var alignmentCellSize: CGFloat = 1
    @Published private(set) var alignmentOffset = CGPoint.zero
    private var originalImage: UIImage?
    private var sourceRevision = UUID()

    /// Deterministic image used only when the app is launched by the UI test
    /// target. It makes the native settings → crop → preview → editor path
    /// testable without attempting to drive the system photo picker.
    static func uiTestingFixtureImage() -> UIImage {
        let size = CGSize(width: 64, height: 32)
        return UIGraphicsImageRenderer(size: size).image { context in
            let canvas = CGRect(origin: .zero, size: size)
            context.cgContext.setFillColor(UIColor(red: 0.96, green: 0.29, blue: 0.30, alpha: 1).cgColor)
            context.cgContext.fill(canvas)
            context.cgContext.setFillColor(UIColor(red: 0.19, green: 0.64, blue: 0.42, alpha: 1).cgColor)
            context.cgContext.fill(CGRect(x: size.width / 2, y: 0, width: size.width / 2, height: size.height))
        }
    }

    var canContinue: Bool { image != nil && !previewColors.isEmpty && !isGenerating }
    var beadList: [ProjectBeadCount] {
        previewColors.filter { $0 != Palette.empty }.reduce(into: [String: Int]()) { $0[$1.code, default: 0] += 1 }
            .map { ProjectBeadCount(color: $0.key, count: $0.value) }
            .sorted { $0.count == $1.count ? $0.color < $1.color : $0.count > $1.count }
    }

    func load(image: UIImage, data: Data? = nil, name: String) {
        sourceRevision = UUID()
        let normalizedImage = image.normalizedForSplitWorkflow()
        self.image = normalizedImage
        originalImage = normalizedImage
        sourceImageData = data
        sourceName = name.isEmpty ? "参考图片" : name
        cropRect = CGRect(x: 0, y: 0, width: 1, height: 1)
        splitMode = .quick
        backgroundRemoved = false
        backgroundSensitivity = 0
        updateGridSize()
        resetAlignmentFromQuickGrid()
        generatePreview()
    }

    func updateLongSide(_ value: Int) {
        longSide = min(max(value, 8), 120)
        updateGridSize()
        generatePreview()
    }

    func generatePreview() {
        guard let cgImage = image?.cgImage else { previewColors = []; return }
        isGenerating = true
        let alignment = splitMode == .align ? alignedGrid : nil
        let colors = ImageGridSampler.sample(cgImage: cgImage, sourceSize: image?.size, columns: columns, rows: rows, crop: cropRect, alignment: alignment, mergeThreshold: mergeThreshold)
        previewColors = colors
        isGenerating = false
    }

    func importTo(document: PatternDocument) {
        guard canContinue else { return }
        document.replaceGrid(columns: columns, rows: rows, colors: previewColors)
    }

    func setCrop(_ rect: CGRect) {
        let minimum: CGFloat = 0.08
        let width = min(max(rect.width, minimum), 1)
        let height = min(max(rect.height, minimum), 1)
        cropRect = CGRect(x: min(max(rect.origin.x, 0), 1 - width), y: min(max(rect.origin.y, 0), 1 - height), width: width, height: height)
        updateGridSize()
        if splitMode == .align { clampAlignment() }
        generatePreview()
    }

    func setSplitMode(_ mode: SplitMode) {
        splitMode = mode
        if mode == .align { resetAlignmentFromQuickGrid() }
        updateGridSize(); generatePreview()
    }

    func updateAlignmentCellSize(_ value: CGFloat) {
        alignmentCellSize = max(1, value)
        clampAlignment(); updateGridSize(); generatePreview()
    }

    func moveAlignment(x: CGFloat, y: CGFloat) {
        alignmentOffset = CGPoint(x: alignmentOffset.x + x, y: alignmentOffset.y + y)
        clampAlignment(); updateGridSize(); generatePreview()
    }

    func setAlignmentOffset(_ offset: CGPoint) {
        alignmentOffset = offset
        clampAlignment(); updateGridSize(); generatePreview()
    }

    func toggleBackgroundRemoval() {
        guard !isBackgroundProcessing else { return }
        guard backgroundRemoved else {
            applyBackgroundRemoval()
            return
        }
        guard let originalImage else { return }
        image = originalImage
        backgroundRemoved = false
        updateGridSize(); generatePreview()
    }

    func updateBackgroundSensitivity(_ value: Int) {
        backgroundSensitivity = min(max(value, 0), 100)
        guard backgroundRemoved else { return }
        applyBackgroundRemoval()
    }

    var alignedGrid: AlignedSplitGrid {
        let size = croppedImageSize
        return AlignedSplitGeometry.grid(cropWidth: size.width, cropHeight: size.height, cellSize: alignmentCellSize, offsetX: alignmentOffset.x, offsetY: alignmentOffset.y)
    }

    private func updateGridSize() {
        guard let image else { columns = longSide; rows = longSide; return }
        let size = image.size
        guard size.width > 0, size.height > 0 else { columns = longSide; rows = longSide; return }
        let croppedWidth = size.width * cropRect.width, croppedHeight = size.height * cropRect.height
        if splitMode == .align {
            let grid = AlignedSplitGeometry.grid(cropWidth: croppedWidth, cropHeight: croppedHeight, cellSize: alignmentCellSize, offsetX: alignmentOffset.x, offsetY: alignmentOffset.y)
            columns = grid.columns; rows = grid.rows
            return
        }
        if croppedWidth >= croppedHeight {
            columns = longSide
            rows = max(2, Int((CGFloat(longSide) * croppedHeight / croppedWidth).rounded()))
        } else {
            rows = longSide
            columns = max(2, Int((CGFloat(longSide) * croppedWidth / croppedHeight).rounded()))
        }
    }

    private var croppedImageSize: CGSize {
        guard let image else { return .zero }
        return CGSize(width: image.size.width * cropRect.width, height: image.size.height * cropRect.height)
    }

    private func resetAlignmentFromQuickGrid() {
        let size = croppedImageSize
        guard size.width > 0, size.height > 0 else { return }
        alignmentCellSize = max(1, min(size.width / CGFloat(max(1, columns)), size.height / CGFloat(max(1, rows))))
        alignmentOffset = .zero
    }

    private func clampAlignment() {
        let grid = alignedGrid
        alignmentCellSize = grid.cellSize
        alignmentOffset = CGPoint(x: grid.offsetX, y: grid.offsetY)
    }

    private func applyBackgroundRemoval() {
        guard let originalImage, let cgImage = originalImage.cgImage else { return }
        isBackgroundProcessing = true
        let sensitivity = backgroundSensitivity
        let revision = sourceRevision
        Task { [weak self] in
            let processed = await Task.detached(priority: .userInitiated) {
                BackgroundRemovalProcessor.remove(cgImage: cgImage, sensitivity: sensitivity)
            }.value
            guard let self else { return }
            guard self.sourceRevision == revision else { return }
            self.image = processed.map { UIImage(cgImage: $0, scale: originalImage.scale, orientation: .up) } ?? originalImage
            self.backgroundRemoved = processed != nil
            self.isBackgroundProcessing = false
            self.updateGridSize(); self.generatePreview()
        }
    }
}

private extension UIImage {
    /// Canvas/ImageData on H5 is already oriented for display.  Normalize once
    /// at the native import boundary so crop, alignment and background removal
    /// all operate in that same visual coordinate space.
    func normalizedForSplitWorkflow() -> UIImage {
        guard imageOrientation != .up else { return self }
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = scale
        format.opaque = false
        // UIImage.size already represents the display-oriented dimensions for
        // rotated assets. Swapping it again would turn a portrait import back
        // into its encoded raster orientation.
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            draw(in: CGRect(origin: .zero, size: size))
        }
    }
}

enum BackgroundRemovalProcessor {
    private struct Cluster {
        let red: Double
        let green: Double
        let blue: Double
        let weight: Int
    }

    static func remove(cgImage: CGImage, sensitivity: Int) -> CGImage? {
        let sourceWidth = cgImage.width, sourceHeight = cgImage.height
        guard sourceWidth >= 3, sourceHeight >= 3,
              var source = rgba(cgImage: cgImage, width: sourceWidth, height: sourceHeight) else { return nil }
        let scale = min(1, 256 / Double(max(sourceWidth, sourceHeight)))
        let analysisWidth = max(1, Int((Double(sourceWidth) * scale).rounded()))
        let analysisHeight = max(1, Int((Double(sourceHeight) * scale).rounded()))
        guard let analysis = rgba(cgImage: cgImage, width: analysisWidth, height: analysisHeight) else { return nil }
        let samples = edgeSamples(width: analysisWidth, height: analysisHeight, pixels: analysis)
        let clusters = clusters(from: analysis, samples: samples)
        guard !clusters.isEmpty else { return cgImage }
        let confidence = Double(clusters[0].weight) / Double(max(1, samples.count))
        let threshold = (12 + Double(min(max(sensitivity, 0), 100)) * 0.68) * (confidence < 0.35 ? 0.62 : 1)
        let analysisMask = floodFill(pixels: analysis, width: analysisWidth, height: analysisHeight, clusters: clusters, threshold: threshold)
        var mask = analysisWidth == sourceWidth && analysisHeight == sourceHeight
            ? analysisMask
            : upscaleMaskBilinear(analysisMask, sourceWidth: analysisWidth, sourceHeight: analysisHeight, targetWidth: sourceWidth, targetHeight: sourceHeight)
        feather(mask: &mask, width: sourceWidth, height: sourceHeight)
        guard !mask.isEmpty else { return cgImage }
        for index in 0..<(sourceWidth * sourceHeight) {
            let offset = index * 4
            guard source[offset + 3] >= 16, mask[index] > 0 else { continue }
            var removed = mask[index]
            if source[offset + 3] < 255, nearestDistance(pixels: source, index: index, clusters: clusters) <= threshold * 1.5 {
                removed = max(removed, 224)
            }
            mask[index] = removed
            source[offset + 3] = UInt8((Double(source[offset + 3]) * (1 - Double(removed) / 255)).rounded())
        }
        return image(from: source, width: sourceWidth, height: sourceHeight)
    }

    private static func rgba(cgImage: CGImage, width: Int, height: Int) -> [UInt8]? {
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        let bitmapInfo = CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue
        guard let context = CGContext(data: &bytes, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: bitmapInfo) else { return nil }
        context.interpolationQuality = .medium
        context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
        return bytes
    }

    private static func image(from bytes: [UInt8], width: Int, height: Int) -> CGImage? {
        let bitmapInfo = CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue
        guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: bitmapInfo), let destination = context.data else { return nil }
        bytes.withUnsafeBytes { source in
            guard let sourceAddress = source.baseAddress else { return }
            destination.copyMemory(from: sourceAddress, byteCount: bytes.count)
        }
        return context.makeImage()
    }

    private static func edgeSamples(width: Int, height: Int, pixels: [UInt8]) -> [Int] {
        let horizontalStep = max(1, Int(ceil(Double(width - 1) / 31)))
        let verticalStep = max(1, Int(ceil(Double(max(1, height - 3)) / 30)))
        var indices = Set<Int>()
        for x in stride(from: 0, to: width, by: horizontalStep) { indices.insert(x); indices.insert((height - 1) * width + x) }
        indices.insert(width - 1); indices.insert(width * height - 1)
        if height > 2 { for y in stride(from: 1, to: height - 1, by: verticalStep) { indices.insert(y * width); indices.insert(y * width + width - 1) } }
        return indices.filter { pixels[$0 * 4 + 3] >= 16 }
    }

    private static func clusters(from pixels: [UInt8], samples: [Int]) -> [Cluster] {
        var buckets: [Int: (red: Int, green: Int, blue: Int, weight: Int)] = [:]
        for index in samples {
            let offset = index * 4
            let key = (Int(pixels[offset]) >> 4) << 8 | (Int(pixels[offset + 1]) >> 4) << 4 | (Int(pixels[offset + 2]) >> 4)
            let old = buckets[key] ?? (0, 0, 0, 0)
            buckets[key] = (old.red + Int(pixels[offset]), old.green + Int(pixels[offset + 1]), old.blue + Int(pixels[offset + 2]), old.weight + 1)
        }
        return buckets.values.sorted { $0.weight > $1.weight }.prefix(3).compactMap {
            guard $0.weight >= 3 else { return nil }
            return Cluster(red: Double($0.red) / Double($0.weight), green: Double($0.green) / Double($0.weight), blue: Double($0.blue) / Double($0.weight), weight: $0.weight)
        }
    }

    private static func floodFill(pixels: [UInt8], width: Int, height: Int, clusters: [Cluster], threshold: Double) -> [UInt8] {
        var mask = [UInt8](repeating: 0, count: width * height)
        var queue = [Int](); queue.reserveCapacity(width * height)
        func distance(_ index: Int, _ other: Int? = nil) -> Double {
            let offset = index * 4
            if let other {
                let otherOffset = other * 4
                let red = Double(Int(pixels[offset]) - Int(pixels[otherOffset])), green = Double(Int(pixels[offset + 1]) - Int(pixels[otherOffset + 1])), blue = Double(Int(pixels[offset + 2]) - Int(pixels[otherOffset + 2]))
                return sqrt(red * red * 0.299 + green * green * 0.587 + blue * blue * 0.114)
            }
            return clusters.map { cluster in
                let red = Double(pixels[offset]) - cluster.red, green = Double(pixels[offset + 1]) - cluster.green, blue = Double(pixels[offset + 2]) - cluster.blue
                return sqrt(red * red * 0.299 + green * green * 0.587 + blue * blue * 0.114)
            }.min() ?? .infinity
        }
        func push(_ index: Int, parent: Int?) {
            guard mask[index] == 0, pixels[index * 4 + 3] >= 16 else { return }
            let x = index % width, y = index / width
            let centerFactor = x >= Int(Double(width) * 0.2) && x < Int(Double(width) * 0.8) && y >= Int(Double(height) * 0.2) && y < Int(Double(height) * 0.8) ? 0.65 : 1.0
            let nearest = distance(index)
            let accepted = nearest <= threshold * centerFactor || (parent != nil && nearest <= threshold * 1.45 * centerFactor && distance(index, parent) <= threshold * 0.9)
            guard accepted else { return }
            mask[index] = 255; queue.append(index)
        }
        for index in edgeSamples(width: width, height: height, pixels: pixels) { push(index, parent: nil) }
        var head = 0
        while head < queue.count {
            let index = queue[head]; head += 1; let x = index % width
            if index >= width { push(index - width, parent: index) }
            if index < width * (height - 1) { push(index + width, parent: index) }
            if x > 0 { push(index - 1, parent: index) }
            if x < width - 1 { push(index + 1, parent: index) }
        }
        return mask
    }

    private static func nearestDistance(pixels: [UInt8], index: Int, clusters: [Cluster]) -> Double {
        let offset = index * 4
        return clusters.map { cluster in
            let red = Double(pixels[offset]) - cluster.red
            let green = Double(pixels[offset + 1]) - cluster.green
            let blue = Double(pixels[offset + 2]) - cluster.blue
            return sqrt(red * red * 0.299 + green * green * 0.587 + blue * blue * 0.114)
        }.min() ?? .infinity
    }

    private static func upscaleMaskBilinear(_ mask: [UInt8], sourceWidth: Int, sourceHeight: Int, targetWidth: Int, targetHeight: Int) -> [UInt8] {
        var result = [UInt8](repeating: 0, count: targetWidth * targetHeight)
        for y in 0..<targetHeight {
            let sourceY = (Double(y) + 0.5) * Double(sourceHeight) / Double(targetHeight) - 0.5
            let top = min(max(0, Int(floor(sourceY))), sourceHeight - 1)
            let bottom = min(top + 1, sourceHeight - 1)
            let yWeight = sourceY - floor(sourceY)
            for x in 0..<targetWidth {
                let sourceX = (Double(x) + 0.5) * Double(sourceWidth) / Double(targetWidth) - 0.5
                let left = min(max(0, Int(floor(sourceX))), sourceWidth - 1)
                let right = min(left + 1, sourceWidth - 1)
                let xWeight = sourceX - floor(sourceX)
                let topValue = Double(mask[top * sourceWidth + left]) * (1 - xWeight) + Double(mask[top * sourceWidth + right]) * xWeight
                let bottomValue = Double(mask[bottom * sourceWidth + left]) * (1 - xWeight) + Double(mask[bottom * sourceWidth + right]) * xWeight
                result[y * targetWidth + x] = UInt8((topValue * (1 - yWeight) + bottomValue * yWeight).rounded())
            }
        }
        return result
    }

    private static func feather(mask: inout [UInt8], width: Int, height: Int) {
        let original = mask
        for index in mask.indices where original[index] == 255 && hasSubjectNeighbour(original, index: index, width: width, height: height) {
            mask[index] = 192
        }
    }

    private static func hasSubjectNeighbour(_ mask: [UInt8], index: Int, width: Int, height: Int) -> Bool {
        let x = index % width
        return (index >= width && mask[index - width] == 0)
            || (index < width * (height - 1) && mask[index + width] == 0)
            || (x > 0 && mask[index - 1] == 0)
            || (x < width - 1 && mask[index + 1] == 0)
    }
}

enum ImageGridSampler {
    static func sample(cgImage: CGImage, sourceSize: CGSize? = nil, columns: Int, rows: Int, crop: CGRect, alignment: AlignedSplitGrid? = nil, mergeThreshold: Int) -> [ColorToken] {
        let width = cgImage.width, height = cgImage.height
        guard width > 0, height > 0, columns > 0, rows > 0 else { return [] }
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        let bitmapInfo = CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue
        guard let context = CGContext(data: &bytes, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: bitmapInfo) else { return [] }
        context.interpolationQuality = .none
        context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))

        var colors = (0..<(columns * rows)).map { index in
            let x = index % columns, y = index / columns
            let minX: Int, maxX: Int, minY: Int, maxY: Int
            if let alignment {
                // Alignment values are expressed in UIImage points, whereas a CGImage
                // may be retina-scaled. Convert them to raster pixels only here.
                let fallbackSize = CGSize(width: max(1, alignment.offsetX + CGFloat(columns) * alignment.cellSize), height: max(1, alignment.offsetY + CGFloat(rows) * alignment.cellSize))
                let logicalSize = sourceSize ?? fallbackSize
                let rasterScaleX = CGFloat(width) / max(1, logicalSize.width)
                let rasterScaleY = CGFloat(height) / max(1, logicalSize.height)
                minX = max(0, min(width - 1, Int(floor((crop.minX * logicalSize.width + alignment.offsetX + CGFloat(x) * alignment.cellSize) * rasterScaleX))))
                maxX = max(minX + 1, min(width, Int(ceil((crop.minX * logicalSize.width + alignment.offsetX + CGFloat(x + 1) * alignment.cellSize) * rasterScaleX))))
                minY = max(0, min(height - 1, Int(floor((crop.minY * logicalSize.height + alignment.offsetY + CGFloat(y) * alignment.cellSize) * rasterScaleY))))
                maxY = max(minY + 1, min(height, Int(ceil((crop.minY * logicalSize.height + alignment.offsetY + CGFloat(y + 1) * alignment.cellSize) * rasterScaleY))))
            } else {
                minX = max(0, min(width - 1, Int(floor((crop.minX + CGFloat(x) / CGFloat(columns) * crop.width) * CGFloat(width)))))
                maxX = max(minX + 1, min(width, Int(ceil((crop.minX + CGFloat(x + 1) / CGFloat(columns) * crop.width) * CGFloat(width)))))
                minY = max(0, min(height - 1, Int(floor((crop.minY + CGFloat(y) / CGFloat(rows) * crop.height) * CGFloat(height)))))
                maxY = max(minY + 1, min(height, Int(ceil((crop.minY + CGFloat(y + 1) / CGFloat(rows) * crop.height) * CGFloat(height)))))
            }
            var counts: [ColorToken: Int] = [:]
            var transparentPixels = 0
            var sampledPixels = 0
            for py in minY..<maxY where py < height {
                for px in minX..<maxX where px < width {
                    let offset = (py * width + px) * 4
                    sampledPixels += 1
                    guard bytes[offset + 3] >= 128 else {
                        transparentPixels += 1
                        continue
                    }
                    let token = Mard221Palette.nearest(red: bytes[offset], green: bytes[offset + 1], blue: bytes[offset + 2])
                    counts[token, default: 0] += 1
                }
            }
            guard transparentPixels <= sampledPixels / 2 else { return Palette.empty }
            return counts.max { left, right in
                left.value == right.value ? left.key.code > right.key.code : left.value < right.value
            }?.key ?? Palette.empty
        }
        if mergeThreshold > 0 { colors = mergeLowUsage(colors, threshold: mergeThreshold) }
        return colors
    }

    private static func mergeLowUsage(_ cells: [ColorToken], threshold: Int) -> [ColorToken] {
        let count = cells.filter { $0 != Palette.empty }.reduce(into: [ColorToken: Int]()) { $0[$1, default: 0] += 1 }
        let stable = count.filter { $0.value > threshold }.map(\.key)
        guard !stable.isEmpty else { return cells }
        return cells.map { cell in
            guard cell != Palette.empty, (count[cell] ?? 0) <= threshold else { return cell }
            return stable.min { Mard221Palette.distance(cell, $0) < Mard221Palette.distance(cell, $1) } ?? cell
        }
    }
}

enum Mard221Palette {
    private static let encoded = "A1:faf4c8,A2:ffffd5,A3:feff8b,A4:fbed56,A5:f4d738,A6:feac4c,A7:fe8b4c,A8:ffda45,A9:ff995b,A10:f77c31,A11:ffdd99,A12:fe9f72,A13:ffc365,A14:fd543d,A15:fff365,A16:ffff9f,A17:ffe36e,A18:febe7d,A19:fd7c72,A20:ffd568,A21:ffe395,A22:f4f57d,A23:e6c9b7,A24:f7f8a2,A25:ffd67d,A26:ffc830,B1:e6ee31,B2:63f347,B3:9ef780,B4:5de035,B5:35e352,B6:65e2a6,B7:3daf80,B8:1c9c4f,B9:27523a,B10:95d3c2,B11:5d722a,B12:166f41,B13:caeb7b,B14:ade946,B15:2e5132,B16:c5ed9c,B17:9bb13a,B18:e6ee49,B19:24b88c,B20:c2f0cc,B21:156a6b,B22:0b3c43,B23:303a21,B24:eefca5,B25:4e846d,B26:8d7a35,B27:cce1af,B28:9ee5b9,B29:c5e254,B30:e2fcb1,B31:b0e792,B32:9cab5a,C1:e8ffe7,C2:a9f9fc,C3:a0e2fb,C4:41ccff,C5:01aceb,C6:50aaf0,C7:3677d2,C8:0f54c0,C9:324bca,C10:3ebce2,C11:28ddde,C12:1c334d,C13:cde8ff,C14:d5fdff,C15:22c4c6,C16:1557a8,C17:04d1f6,C18:1d3344,C19:1887a2,C20:176daf,C21:beddff,C22:67b4be,C23:c8e2ff,C24:7cc4ff,C25:a9e5e5,C26:3caed8,C27:d3dffa,C28:bbcfed,C29:34488e,D1:aeb4f2,D2:858edd,D3:2f54af,D4:182a84,D5:b843c5,D6:ac7bde,D7:8854b3,D8:e2d3ff,D9:d5b9f8,D10:361851,D11:b9bae1,D12:de9ad4,D13:b90095,D14:8b279b,D15:2f1f90,D16:e3e1ee,D17:c4d4f6,D18:a45ec7,D19:d8c3d7,D20:9c32b2,D21:9a009b,D22:333a95,D23:ebdafc,D24:7786e5,D25:494fc7,D26:dfc2f8,E1:fdd3cc,E2:fec0df,E3:ffb7e7,E4:e8649e,E5:f551a2,E6:f13d74,E7:c63478,E8:ffdbe9,E9:e970cc,E10:d33793,E11:fcddd2,E12:f78fc3,E13:b5006d,E14:ffd1ba,E15:f8c7c9,E16:fff3eb,E17:ffe2ea,E18:ffc7db,E19:febad5,E20:d8c7d1,E21:bd9da1,E22:b785a1,E23:937a8d,E24:e1bce8,F1:fd957b,F2:fc3d46,F3:f74941,F4:fc283c,F5:e7002f,F6:943630,F7:971937,F8:bc0028,F9:e2677a,F10:8a4526,F11:5a2121,F12:fd4e6a,F13:f35744,F14:ffa9ad,F15:d30022,F16:fec2a6,F17:e69c79,F18:d37c46,F19:c1444a,F20:cd9391,F21:f7b4c6,F22:fdc0d0,F23:f67e66,F24:e698aa,F25:e54b4f,G1:ffe2ce,G2:ffc4aa,G3:f4c3a5,G4:e1b383,G5:edb045,G6:e99c17,G7:9d5b3e,G8:753832,G9:e6b483,G10:d98c39,G11:e0c593,G12:ffc890,G13:b7714a,G14:8d614c,G15:fcf9e0,G16:f2d9ba,G17:78524b,G18:ffe4cc,G19:e07935,G20:a94023,G21:b88558,H1:fdfbff,H2:feffff,H3:b6b1ba,H4:89858c,H5:48464e,H6:2f2b2f,H7:000000,H8:e7d6db,H9:ededed,H10:eee9ea,H11:cecdd5,H12:fff5ed,H13:f5ecd2,H14:cfd7d3,H15:98a6a8,H16:1d1414,H17:f1eded,H18:fffdf0,H19:f6efe2,H20:949fa3,H21:fffbe1,H22:cacad4,H23:9a9d94,M1:bcc6b8,M2:8aa386,M3:697d80,M4:e3d2bc,M5:d0ccaa,M6:b0a782,M7:b4a497,M8:b38281,M9:a58767,M10:c5b2bc,M11:9f7594,M12:644749,M13:d19066,M14:c77362,M15:757d78"
    static let colors: [ColorToken] = encoded.split(separator: ",").compactMap { part in
        let values = part.split(separator: ":", maxSplits: 1); guard values.count == 2 else { return nil }
        return ColorToken(hex: String(values[1]).uppercased(), code: String(values[0]))
    }
    static func nearest(red: UInt8, green: UInt8, blue: UInt8) -> ColorToken {
        colors.min { rgbDistance(red, green, blue, $0) < rgbDistance(red, green, blue, $1) } ?? Palette.empty
    }
    static func distance(_ lhs: ColorToken, _ rhs: ColorToken) -> Int {
        let a = rgb(lhs), b = rgb(rhs); return (a.0 - b.0) * (a.0 - b.0) + (a.1 - b.1) * (a.1 - b.1) + (a.2 - b.2) * (a.2 - b.2)
    }
    private static func rgbDistance(_ r: UInt8, _ g: UInt8, _ b: UInt8, _ color: ColorToken) -> Int { let value = rgb(color); return (Int(r) - value.0) * (Int(r) - value.0) + (Int(g) - value.1) * (Int(g) - value.1) + (Int(b) - value.2) * (Int(b) - value.2) }
    private static func rgb(_ color: ColorToken) -> (Int, Int, Int) { let value = Int(color.hex, radix: 16) ?? 0; return ((value >> 16) & 255, (value >> 8) & 255, value & 255) }
}
