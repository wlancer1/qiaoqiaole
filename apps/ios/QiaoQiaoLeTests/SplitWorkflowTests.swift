import UIKit
import XCTest
@testable import QiaoQiaoLe

@MainActor
final class SplitWorkflowTests: XCTestCase {
    func testImageCreatesAspectMatchedGridAndImportsIntoEditor() async {
        let workflow = SplitWorkflow()
        workflow.load(image: solidImage(width: 8, height: 4, color: .red), name: "fixture")
        workflow.updateLongSide(8)

        XCTAssertEqual(workflow.columns, 8)
        XCTAssertEqual(workflow.rows, 4)
        XCTAssertTrue(workflow.previewColors.isEmpty, "H5 defers pixel sampling until preview")
        XCTAssertTrue(workflow.canContinue)
        XCTAssertFalse(workflow.canImport)
        workflow.generatePreview()
        await waitForPreview(workflow)
        XCTAssertEqual(workflow.previewColors.count, 32)
        XCTAssertEqual(workflow.previewColors.first?.code, "F5")
        XCTAssertEqual(workflow.beadList, [ProjectBeadCount(color: "F5", count: 32)])
        XCTAssertTrue(workflow.canImport)

        let document = PatternDocument()
        workflow.importTo(document: document)
        XCTAssertEqual(document.columns, 8)
        XCTAssertEqual(document.rows, 4)
        XCTAssertEqual(document.cells.count, 32)
    }

    func testImportNormalizesExifOrientationBeforeDerivingGridGeometry() {
        let upright = solidImage(width: 4, height: 8, color: .red)
        guard let cgImage = upright.cgImage else { return XCTFail("Expected a test CGImage") }
        let rotated = UIImage(cgImage: cgImage, scale: 1, orientation: .right)
        let workflow = SplitWorkflow()
        workflow.load(image: rotated, name: "rotated")

        XCTAssertEqual(workflow.image?.imageOrientation, .up)
        XCTAssertEqual(workflow.image?.size, CGSize(width: 8, height: 4))
        XCTAssertEqual(workflow.columns, 8)
        XCTAssertEqual(workflow.rows, 4)
    }

    func testSplitUsesCompleteMard221Palette() {
        XCTAssertEqual(Mard221Palette.colors.count, 221)
        XCTAssertEqual(Mard221Palette.colors.first, ColorToken(hex: "FAF4C8", code: "A1"))
        XCTAssertEqual(Mard221Palette.colors.last, ColorToken(hex: "757D78", code: "M15"))
        XCTAssertEqual(Mard221Palette.nearest(red: 250, green: 2, blue: 0).code, "F5")
    }

    func testMard221ResolverMatchesH5HexAndCodeBehavior() {
        XCTAssertEqual(Mard221Palette.resolve("A1"), ColorToken(hex: "FAF4C8", code: "A1"))
        XCTAssertEqual(Mard221Palette.resolve("#faf4c8")?.code, "A1")
        XCTAssertEqual(Mard221Palette.resolve("#146cff")?.code, "C7")
        XCTAssertNil(Mard221Palette.resolve("not-a-color"))
    }

    func testEachCellUsesItsDominantMappedColorInsteadOfCenterPixel() {
        let image = mixedImage(width: 4, height: 4)
        guard let cgImage = image.cgImage else {
            return XCTFail("Expected a test CGImage")
        }

        let colors = ImageGridSampler.sample(
            cgImage: cgImage,
            columns: 1,
            rows: 1,
            crop: CGRect(x: 0, y: 0, width: 1, height: 1),
            mergeThreshold: 0
        )

        XCTAssertEqual(colors.map(\.code), ["F5"])
    }

    func testAlignedGridClampsOffsetAndDerivesItsOwnSize() {
        let grid = AlignedSplitGeometry.grid(cropWidth: 20, cropHeight: 12, cellSize: 5, offsetX: 3, offsetY: 4)
        XCTAssertEqual(grid, AlignedSplitGrid(columns: 3, rows: 1, cellSize: 5, offsetX: 3, offsetY: 4))

        let clamped = AlignedSplitGeometry.grid(cropWidth: 20, cropHeight: 12, cellSize: 5, offsetX: 99, offsetY: -3)
        XCTAssertEqual(clamped, AlignedSplitGrid(columns: 3, rows: 2, cellSize: 5, offsetX: 4, offsetY: 2))
    }

    func testDirectAlignmentOffsetUsesSameClampingAsFineAdjustment() {
        let workflow = SplitWorkflow()
        workflow.load(image: solidImage(width: 20, height: 12, color: .red), name: "fixture")
        workflow.setSplitMode(.align)
        workflow.updateAlignmentCellSize(5)
        let effectiveCellSize = workflow.alignmentCellSize
        let expected = AlignedSplitGeometry.grid(
            cropWidth: 20,
            cropHeight: 12,
            cellSize: effectiveCellSize,
            offsetX: 99,
            offsetY: -4
        )
        workflow.setAlignmentOffset(CGPoint(x: 99, y: -4))
        XCTAssertEqual(workflow.alignmentOffset.x, expected.offsetX, accuracy: 0.0001)
        XCTAssertEqual(workflow.alignmentOffset.y, expected.offsetY, accuracy: 0.0001)
        XCTAssertEqual(workflow.alignedGrid.columns, expected.columns)
        XCTAssertEqual(workflow.alignedGrid.rows, expected.rows)
        XCTAssertEqual(workflow.alignedGrid.cellSize, expected.cellSize, accuracy: 0.0001)
    }

    func testAlignmentControlFrameMovesGridWithoutGeneratingPreview() {
        let workflow = SplitWorkflow()
        workflow.load(image: solidImage(width: 100, height: 75, color: .red), name: "fixture")
        workflow.updateLongSide(10)
        workflow.setSplitMode(.align)

        let origin = workflow.alignmentFrameOrigin
        let offset = workflow.alignedGrid
        workflow.moveGridControlFrame(x: 1, y: 1)

        XCTAssertEqual(workflow.alignmentFrameOrigin.x, origin.x + 1, accuracy: 0.001)
        XCTAssertEqual(workflow.alignmentFrameOrigin.y, origin.y + 1, accuracy: 0.001)
        XCTAssertEqual(workflow.alignedGrid.offsetX, offset.offsetX + 1, accuracy: 0.001)
        XCTAssertEqual(workflow.alignedGrid.offsetY, offset.offsetY + 1, accuracy: 0.001)
        XCTAssertTrue(workflow.previewColors.isEmpty, "对格子拖动只应更新几何，不应同步重新取色")
    }

    func testAlignmentScalingUsesThreeByThreeControlFrameAsAnchor() {
        let workflow = SplitWorkflow()
        workflow.load(image: solidImage(width: 100, height: 75, color: .red), name: "fixture")
        workflow.updateLongSide(10)
        workflow.setSplitMode(.align)

        let origin = workflow.alignmentFrameOrigin
        let originalCellSize = workflow.alignmentCellSize
        workflow.updateAlignmentCellSize(originalCellSize + 1)

        XCTAssertEqual(workflow.alignmentFrameOrigin.x, origin.x, accuracy: 0.001)
        XCTAssertEqual(workflow.alignmentFrameOrigin.y, origin.y, accuracy: 0.001)
        XCTAssertEqual(workflow.alignmentOffset.x, origin.x, accuracy: 0.001)
        XCTAssertEqual(workflow.alignmentOffset.y, origin.y, accuracy: 0.001)
        XCTAssertGreaterThan(workflow.alignmentCellSize, originalCellSize)
        XCTAssertTrue(workflow.previewColors.isEmpty)
    }

    func testAlignedSamplingStartsAtConfiguredGridOffset() {
        let image = twoColorImage(width: 8, height: 4)
        guard let cgImage = image.cgImage else { return XCTFail("Expected a test CGImage") }
        let colors = ImageGridSampler.sample(
            cgImage: cgImage,
            columns: 1,
            rows: 1,
            crop: CGRect(x: 0, y: 0, width: 1, height: 1),
            alignment: AlignedSplitGrid(columns: 1, rows: 1, cellSize: 4, offsetX: 4, offsetY: 0),
            mergeThreshold: 0
        )
        XCTAssertEqual(colors.map(\.code), ["C8"])
    }

    func testMajorityTransparentAlignedCellRemainsEmpty() {
        let image = majorityTransparentImage()
        guard let cgImage = image.cgImage else { return XCTFail("Expected a test CGImage") }
        let colors = ImageGridSampler.sample(
            cgImage: cgImage,
            columns: 1,
            rows: 1,
            crop: CGRect(x: 0, y: 0, width: 1, height: 1),
            alignment: AlignedSplitGrid(columns: 1, rows: 1, cellSize: 5, offsetX: 0, offsetY: 0),
            mergeThreshold: 0
        )
        XCTAssertEqual(colors, [Palette.empty])
    }

    func testBackgroundRemovalClearsOnlyEdgeConnectedBackground() {
        let renderer = pixelRenderer(width: 7, height: 7)
        let image = renderer.image { context in
            UIColor.white.setFill(); context.fill(CGRect(x: 0, y: 0, width: 7, height: 7))
            UIColor(red: 231 / 255, green: 0, blue: 47 / 255, alpha: 1).setFill(); context.fill(CGRect(x: 3, y: 3, width: 1, height: 1))
        }
        guard let cgImage = image.cgImage, let result = BackgroundRemovalProcessor.remove(cgImage: cgImage, sensitivity: 20) else {
            return XCTFail("Expected a processed image")
        }
        let pixels = rgba(of: result)
        XCTAssertEqual(pixels[(0 * 7 + 0) * 4 + 3], 0)
        XCTAssertEqual(pixels[(3 * 7 + 3) * 4 + 3], 255)
    }

    func testBackgroundRemovalFeathersTheEdgeNextToAProtectedSubject() {
        let renderer = pixelRenderer(width: 9, height: 9)
        let image = renderer.image { context in
            UIColor.white.setFill(); context.fill(CGRect(x: 0, y: 0, width: 9, height: 9))
            UIColor(red: 24 / 255, green: 72 / 255, blue: 196 / 255, alpha: 1).setFill()
            context.fill(CGRect(x: 3, y: 3, width: 3, height: 3))
        }
        guard let cgImage = image.cgImage, let result = BackgroundRemovalProcessor.remove(cgImage: cgImage, sensitivity: 30) else {
            return XCTFail("Expected a processed image")
        }
        let pixels = rgba(of: result)
        let alpha = pixels[(3 * 9 + 2) * 4 + 3]
        // Shared with packages/core/src/domain/grid.test.ts: its one-cell
        // feather changes a full removal mask (255) to 192, so an opaque
        // source pixel retains exactly 63 alpha.
        XCTAssertEqual(alpha, 63)
        XCTAssertEqual(pixels[(3 * 9 + 3) * 4 + 3], 255)
    }

    func testBackgroundRemovalMatchesTheSharedTwoToneEdgeFixture() {
        let renderer = pixelRenderer(width: 13, height: 13)
        let image = renderer.image { context in
            UIColor(red: 248 / 255, green: 248 / 255, blue: 246 / 255, alpha: 1).setFill()
            context.fill(CGRect(x: 0, y: 0, width: 6, height: 13))
            UIColor(red: 128 / 255, green: 205 / 255, blue: 120 / 255, alpha: 1).setFill()
            context.fill(CGRect(x: 6, y: 0, width: 7, height: 13))
            UIColor(red: 30 / 255, green: 70 / 255, blue: 190 / 255, alpha: 1).setFill()
            context.fill(CGRect(x: 6, y: 0, width: 1, height: 13))
        }
        guard let cgImage = image.cgImage, let result = BackgroundRemovalProcessor.remove(cgImage: cgImage, sensitivity: 35) else {
            return XCTFail("Expected a processed image")
        }
        let pixels = rgba(of: result)
        XCTAssertEqual(pixels[(5 * 13 + 2) * 4 + 3], 0)
        XCTAssertEqual(pixels[(5 * 13 + 10) * 4 + 3], 0)
        XCTAssertEqual(pixels[(5 * 13 + 6) * 4 + 3], 255)
    }

    func testBackgroundRemovalMatchesSharedCrossPlatformFixtureFile() throws {
        let fixtures = try sharedBackgroundFixtures()

        for fixture in fixtures {
            let renderer = pixelRenderer(width: fixture.width, height: fixture.height)
            let image = renderer.image { context in
                UIColor(red: CGFloat(fixture.background[0]) / 255, green: CGFloat(fixture.background[1]) / 255, blue: CGFloat(fixture.background[2]) / 255, alpha: CGFloat(fixture.background[3]) / 255).setFill()
                context.fill(CGRect(x: 0, y: 0, width: fixture.width, height: fixture.height))
                for rectangle in fixture.rectangles {
                    UIColor(red: CGFloat(rectangle.rgba[0]) / 255, green: CGFloat(rectangle.rgba[1]) / 255, blue: CGFloat(rectangle.rgba[2]) / 255, alpha: CGFloat(rectangle.rgba[3]) / 255).setFill()
                    context.fill(CGRect(x: rectangle.x, y: rectangle.y, width: rectangle.width, height: rectangle.height))
                }
            }
            guard let cgImage = image.cgImage, let result = BackgroundRemovalProcessor.remove(cgImage: cgImage, sensitivity: fixture.sensitivity) else {
                return XCTFail("Expected a processed image for \(fixture.id)")
            }
            let pixels = rgba(of: result)
            for expected in fixture.expectedAlpha {
                XCTAssertEqual(pixels[(expected.y * fixture.width + expected.x) * 4 + 3], expected.value, fixture.id)
            }
        }
    }

    func testBackgroundRemovalUsesSoftSourceSizedMaskAfterBoundedAnalysis() {
        let renderer = pixelRenderer(width: 512, height: 512)
        let image = renderer.image { context in
            UIColor.white.setFill(); context.fill(CGRect(x: 0, y: 0, width: 512, height: 512))
            UIColor(red: 36 / 255, green: 76 / 255, blue: 188 / 255, alpha: 1).setFill()
            context.fill(CGRect(x: 180, y: 180, width: 152, height: 152))
        }
        guard let cgImage = image.cgImage, let result = BackgroundRemovalProcessor.remove(cgImage: cgImage, sensitivity: 30) else {
            return XCTFail("Expected a processed image")
        }
        let pixels = rgba(of: result)
        let softAlphaCount = stride(from: 3, to: pixels.count, by: 4).filter { pixels[$0] > 0 && pixels[$0] < 255 }.count
        XCTAssertGreaterThan(softAlphaCount, 0)
        XCTAssertEqual(result.width, 512)
        XCTAssertEqual(result.height, 512)
    }

    func testCropChangesGridAspectAndIsClampedToImage() async {
        let workflow = SplitWorkflow()
        workflow.load(image: solidImage(width: 8, height: 4, color: .red), name: "fixture")
        workflow.updateLongSide(8)
        workflow.setCrop(CGRect(x: 0.5, y: 0, width: 0.5, height: 1))
        XCTAssertEqual(workflow.cropRect, CGRect(x: 0.5, y: 0, width: 0.5, height: 1))
        XCTAssertEqual(workflow.columns, 8)
        XCTAssertEqual(workflow.rows, 8)
        XCTAssertTrue(workflow.previewColors.isEmpty, "Cropping must not synchronously resample the source image")
        workflow.generatePreview()
        await waitForPreview(workflow)
        XCTAssertEqual(workflow.previewColors.count, 64)
        workflow.setCrop(CGRect(x: -1, y: -1, width: 2, height: 2))
        XCTAssertEqual(workflow.cropRect, CGRect(x: 0, y: 0, width: 1, height: 1))
    }

    func testQuickGeometryMatchesH5LongSideRulesWithoutGeneratingPixels() {
        let workflow = SplitWorkflow()
        workflow.load(image: solidImage(width: 300, height: 150, color: .red), name: "large")
        XCTAssertEqual(workflow.longSide, 144)
        XCTAssertEqual(workflow.maximumLongSide, 144)
        XCTAssertEqual(workflow.columns, 144)
        XCTAssertEqual(workflow.rows, 72)
        XCTAssertTrue(workflow.previewColors.isEmpty)

        workflow.updateLongSide(80)
        XCTAssertEqual(workflow.columns, 80)
        XCTAssertEqual(workflow.rows, 40)
        XCTAssertTrue(workflow.previewColors.isEmpty)
    }

    func testAlignedGridNormalizesOffsetModuloCellSizeLikeH5() {
        let grid = AlignedSplitGeometry.grid(cropWidth: 20, cropHeight: 12, cellSize: 5, offsetX: 99, offsetY: -4)
        XCTAssertEqual(grid, AlignedSplitGrid(columns: 3, rows: 2, cellSize: 5, offsetX: 4, offsetY: 1))
    }

    private func waitForPreview(_ workflow: SplitWorkflow, timeoutNanoseconds: UInt64 = 2_000_000_000) async {
        let started = DispatchTime.now().uptimeNanoseconds
        while workflow.isGenerating || workflow.previewColors.isEmpty {
            if DispatchTime.now().uptimeNanoseconds - started > timeoutNanoseconds {
                XCTFail("Timed out waiting for split preview")
                return
            }
            try? await Task.sleep(nanoseconds: 5_000_000)
        }
    }

    private func solidImage(width: Int, height: Int, color: UIColor) -> UIImage {
        let renderer = pixelRenderer(width: width, height: height)
        return renderer.image { context in color.setFill(); context.fill(CGRect(x: 0, y: 0, width: width, height: height)) }
    }

    private func mixedImage(width: Int, height: Int) -> UIImage {
        let renderer = pixelRenderer(width: width, height: height)
        return renderer.image { context in
            UIColor(red: 231 / 255, green: 0, blue: 47 / 255, alpha: 1).setFill()
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
            UIColor(red: 15 / 255, green: 84 / 255, blue: 192 / 255, alpha: 1).setFill()
            context.fill(CGRect(x: 1, y: 1, width: 1, height: 1))
        }
    }

    private func twoColorImage(width: Int, height: Int) -> UIImage {
        let renderer = pixelRenderer(width: width, height: height)
        return renderer.image { context in
            UIColor(red: 231 / 255, green: 0, blue: 47 / 255, alpha: 1).setFill()
            context.fill(CGRect(x: 0, y: 0, width: width / 2, height: height))
            UIColor(red: 15 / 255, green: 84 / 255, blue: 192 / 255, alpha: 1).setFill()
            context.fill(CGRect(x: width / 2, y: 0, width: width / 2, height: height))
        }
    }

    private func majorityTransparentImage() -> UIImage {
        let renderer = pixelRenderer(width: 5, height: 5)
        return renderer.image { context in
            UIColor.clear.setFill(); context.fill(CGRect(x: 0, y: 0, width: 5, height: 5))
            UIColor(red: 231 / 255, green: 0, blue: 47 / 255, alpha: 1).setFill()
            context.fill(CGRect(x: 0, y: 3, width: 5, height: 2))
            context.fill(CGRect(x: 0, y: 2, width: 2, height: 1))
        }
    }

    private func rgba(of image: CGImage) -> [UInt8] {
        var bytes = [UInt8](repeating: 0, count: image.width * image.height * 4)
        let context = CGContext(data: &bytes, width: image.width, height: image.height, bitsPerComponent: 8, bytesPerRow: image.width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
        return bytes
    }

    private func pixelRenderer(width: Int, height: Int) -> UIGraphicsImageRenderer {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format)
    }

    private func sharedBackgroundFixtures() throws -> [BackgroundRemovalFixture] {
        let bundle = Bundle(for: Self.self)
        let url = try XCTUnwrap(bundle.url(forResource: "background-removal-fixtures", withExtension: "json"))
        return try JSONDecoder().decode(BackgroundRemovalFixtureFile.self, from: Data(contentsOf: url)).fixtures
    }
}

private struct BackgroundRemovalFixtureFile: Decodable {
    let fixtures: [BackgroundRemovalFixture]
}

private struct BackgroundRemovalFixture: Decodable {
    let id: String
    let width: Int
    let height: Int
    let sensitivity: Int
    let background: [UInt8]
    let rectangles: [BackgroundRemovalFixtureRectangle]
    let expectedAlpha: [BackgroundRemovalFixtureExpectedAlpha]
}

private struct BackgroundRemovalFixtureRectangle: Decodable {
    let x: Int
    let y: Int
    let width: Int
    let height: Int
    let rgba: [UInt8]
}

private struct BackgroundRemovalFixtureExpectedAlpha: Decodable {
    let x: Int
    let y: Int
    let value: UInt8
}
