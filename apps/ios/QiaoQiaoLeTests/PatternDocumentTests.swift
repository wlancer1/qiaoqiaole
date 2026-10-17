import XCTest
@testable import QiaoQiaoLe

@MainActor
final class PatternDocumentTests: XCTestCase {
    func testEditorUsesH5CanvasMetrics() {
        XCTAssertEqual(EditorCanvasMetrics.cellSide, 14)
        XCTAssertEqual(EditorCanvasMetrics.rulerGutter, 22)
    }

    func testCanvasScaleUsesTwentyToTwelveHundredPercentBounds() {
        XCTAssertEqual(EditorCanvasMetrics.clampedScale(-2), 0.2)
        XCTAssertEqual(EditorCanvasMetrics.clampedScale(1.75), 1.75)
        XCTAssertEqual(EditorCanvasMetrics.clampedScale(20), 12)
    }

    func testBeadingViewportFitMatchesH5TransformMath() {
        let fit = calculateBeadingViewportFit(
            viewportSize: CGSize(width: 400, height: 300),
            artboardSize: CGSize(width: 180, height: 90)
        )
        XCTAssertNotNil(fit)
        let expectedScale = CGFloat(368) / CGFloat(180 + 22)
        XCTAssertEqual(fit?.scale ?? 0, expectedScale, accuracy: 0.0001)
        XCTAssertEqual(fit?.x ?? 0, 16 + 22 * expectedScale, accuracy: 0.0001)
        XCTAssertEqual(
            fit?.y ?? 0,
            16 + (268 - CGFloat(90 + 20) * expectedScale) / 2 + 20 * expectedScale,
            accuracy: 0.0001
        )
    }

    func testBeadingViewportFitScalesSmallArtboardLikeH5() {
        let fit = calculateBeadingViewportFit(
            viewportSize: CGSize(width: 212, height: 212),
            artboardSize: CGSize(width: 18, height: 18)
        )
        XCTAssertEqual(fit?.scale ?? 0, 4.5, accuracy: 0.0001)
        XCTAssertEqual(fit?.x ?? 0, 115, accuracy: 0.0001)
        XCTAssertEqual(fit?.y ?? 0, 110.5, accuracy: 0.0001)
    }

    func testViewportRulerKeepsLabelsOnActualVisibleCellCenters() {
        let geometry = EditorViewportRulerGeometry(
            viewportSize: CGSize(width: 200, height: 140),
            artboardFrame: CGRect(x: -28, y: -14, width: 448, height: 224),
            rows: 16,
            columns: 16,
            scale: 2
        )
        XCTAssertTrue(geometry.sticky)
        XCTAssertEqual(geometry.columns.first, EditorViewportRulerTick(tick: 2, offset: 14))
        XCTAssertEqual(geometry.rows.first, EditorViewportRulerTick(tick: 3, offset: 21))
        XCTAssertEqual(geometry.columns.map(\.tick), [2, 3, 4, 5, 6, 7, 8])
    }


    func testViewportRulerKeepsEdgeLabelWhenOnlyPartOfZoomedCellIntersects() {
        let geometry = EditorViewportRulerGeometry(
            viewportSize: CGSize(width: 100, height: 100),
            artboardFrame: CGRect(x: -150, y: -150, width: 400, height: 400),
            rows: 2,
            columns: 2,
            scale: 4
        )
        XCTAssertTrue(geometry.sticky)
        XCTAssertEqual(geometry.columns, [EditorViewportRulerTick(tick: 1, offset: 7)])
        XCTAssertEqual(geometry.rows, [EditorViewportRulerTick(tick: 1, offset: 7)])
    }

    func testViewportRulerIsHiddenWhenCanvasIsUnzoomedAndFullyVisible() {
        let geometry = EditorViewportRulerGeometry(
            viewportSize: CGSize(width: 400, height: 400),
            artboardFrame: CGRect(x: 40, y: 40, width: 224, height: 224),
            rows: 16,
            columns: 16,
            scale: 1
        )
        XCTAssertFalse(geometry.sticky)
        XCTAssertTrue(geometry.columns.isEmpty)
        XCTAssertTrue(geometry.rows.isEmpty)
    }
    func testImportedProjectStartsWithEmptyUndoHistory() {
        let document = PatternDocument()
        document.tool = .brush
        document.selectedColor = Palette.default[1]
        document.applyTool(at: 0, 0)
        XCTAssertTrue(document.canUndo)

        let imported = [Palette.default[2], Palette.default[3], Palette.default[4], Palette.default[5]]
        document.startImportedProject(columns: 2, rows: 2, colors: imported)

        XCTAssertEqual(document.columns, 2)
        XCTAssertEqual(document.rows, 2)
        XCTAssertEqual(document.cells.map(\.color), imported)
        XCTAssertTrue(document.sourceImagePresent)
        XCTAssertFalse(document.canUndo, "导入图像本身必须成为编辑历史基准，不能撤销回默认画布")
        XCTAssertFalse(document.canRedo)
    }

    func testGridBackgroundRemovalMatchesH5EdgeConnectedRuleAndIsUndoable() {
        let document = PatternDocument()
        let background = Palette.token(for: "#FFFFFF")
        let foreground = Palette.token(for: "#FF0000")
        var colors = (0..<25).map { index -> ColorToken in
            let x = index % 5
            let y = index / 5
            return (x == 0 || x == 4 || y == 0 || y == 4) ? background : foreground
        }
        colors[12] = background
        document.startImportedProject(columns: 5, rows: 5, colors: colors)

        XCTAssertTrue(document.removeGridEdgeBackground())
        XCTAssertEqual(document.cells.filter { $0.color == Palette.empty }.count, 16)
        XCTAssertEqual(document.cell(at: 2, 2).color, background, "内部不与边缘连通的同色像素必须保留")
        XCTAssertTrue(document.canUndo)

        document.undo()
        XCTAssertEqual(document.cells.map(\.color), colors)
        XCTAssertFalse(document.canUndo)
    }

    func testGridBackgroundRemovalRequiresStrictEdgeMajorityLikeH5() {
        let document = PatternDocument()
        let white = Palette.token(for: "#FFFFFF")
        let red = Palette.token(for: "#FF0000")
        document.startImportedProject(columns: 2, rows: 2, colors: [white, red, white, red])

        XCTAssertFalse(document.removeGridEdgeBackground())
        XCTAssertFalse(document.canUndo)
        XCTAssertEqual(document.cells.map(\.color), [white, red, white, red])
    }

    func testBrushRecordsHistoryAndUndoRestoresCell() {
        let document = PatternDocument()
        document.tool = .brush
        let initial = document.cell(at: 0, 0).color
        document.selectedColor = Palette.default[1]
        document.applyTool(at: 0, 0)
        XCTAssertEqual(document.cell(at: 0, 0).color, Palette.default[1])
        XCTAssertTrue(document.canUndo)
        document.undo()
        XCTAssertEqual(document.cell(at: 0, 0).color, initial)
    }
    func testEraserClearsCellAndUndoRestoresIt() {
        let document = PatternDocument()
        let initial = document.cell(at: 0, 0).color
        document.tool = .eraser
        document.applyTool(at: 0, 0)
        XCTAssertEqual(document.cell(at: 0, 0).color, Palette.empty)
        document.undo()
        XCTAssertEqual(document.cell(at: 0, 0).color, initial)
    }
    func testPanToolNeverMutatesCanvasOrHistory() {
        let document = PatternDocument()
        let initial = document.cell(at: 0, 0).color
        document.tool = .pan
        document.selectedColor = Palette.default[1]
        document.applyTool(at: 0, 0)
        XCTAssertEqual(document.cell(at: 0, 0).color, initial)
        XCTAssertFalse(document.canUndo)
    }
    func testPickerIgnoresEmptyCellLikeH5Eyedropper() {
        let document = PatternDocument()
        document.tool = .eraser
        document.applyTool(at: 0, 0)
        document.selectedColor = Palette.default[2]
        document.tool = .picker
        document.applyTool(at: 0, 0)
        XCTAssertEqual(document.selectedColor, Palette.default[2])
    }
    func testPickerSelectsOpaqueCellWithoutCreatingHistory() {
        let document = PatternDocument()
        document.selectedColor = Palette.default[2]
        document.tool = .picker

        document.applyTool(at: 0, 0)

        XCTAssertEqual(document.selectedColor, Palette.default[0])
        XCTAssertFalse(document.canUndo)
    }
    func testFillChangesOnlyConnectedMatchingCellsAndUndoRestoresThem() {
        let document = PatternDocument()
        let payload = ##"[{"x":0,"y":0,"color":"#146CFF","transparent":false},{"x":1,"y":0,"color":"#146CFF","transparent":false},{"x":2,"y":0,"color":"#F04B4C","transparent":false},{"x":0,"y":1,"color":"#146CFF","transparent":false},{"x":1,"y":1,"color":"#F04B4C","transparent":false},{"x":2,"y":1,"color":"#146CFF","transparent":false}]"##
        XCTAssertTrue(document.loadProject(id: "fill", name: "填充", columns: 3, rows: 2, canvasData: payload))
        document.selectedColor = Palette.default[2]
        document.tool = .fill

        document.applyTool(at: 0, 0)

        XCTAssertEqual(document.cell(at: 0, 0).color, Palette.default[2])
        XCTAssertEqual(document.cell(at: 0, 1).color, Palette.default[2])
        XCTAssertEqual(document.cell(at: 1, 0).color, Palette.default[2])
        XCTAssertEqual(document.cell(at: 0, 2).color, Palette.token(for: "#F04B4C"))
        XCTAssertEqual(document.cell(at: 1, 1).color, Palette.token(for: "#F04B4C"))
        XCTAssertEqual(document.cell(at: 1, 2).color, Palette.token(for: "#146CFF"))

        document.undo()
        XCTAssertEqual(document.cell(at: 0, 0).color, Palette.token(for: "#146CFF"))
        XCTAssertEqual(document.cell(at: 0, 1).color, Palette.token(for: "#146CFF"))
        XCTAssertEqual(document.cell(at: 1, 0).color, Palette.token(for: "#146CFF"))
    }
    func testNoopBrushAndEraserDoNotCreateHistory() {
        let document = PatternDocument()
        document.selectedColor = document.cell(at: 0, 0).color
        document.applyTool(at: 0, 0)
        XCTAssertFalse(document.canUndo)
        let emptyDocument = PatternDocument()
        XCTAssertTrue(emptyDocument.loadProject(id: "empty", name: "空", columns: 2, rows: 2, canvasData: ##"[{"x":0,"y":0,"color":"#ffffff","transparent":true},{"x":1,"y":0,"color":"#ffffff","transparent":true},{"x":0,"y":1,"color":"#ffffff","transparent":true},{"x":1,"y":1,"color":"#ffffff","transparent":true}]"##))
        emptyDocument.tool = .eraser
        emptyDocument.applyTool(at: 0, 0)
        XCTAssertFalse(emptyDocument.canUndo)
    }
    func testBrushStrokeUsesOneUndoStep() {
        let document = PatternDocument()
        document.tool = .brush
        let first = document.cell(at: 0, 0).color
        let second = document.cell(at: 0, 1).color
        document.selectedColor = Palette.default[1]
        document.applyTool(to: [GridCoordinate(row: 0, column: 0), GridCoordinate(row: 0, column: 1)])
        XCTAssertEqual(document.cell(at: 0, 0).color, Palette.default[1])
        XCTAssertEqual(document.cell(at: 0, 1).color, Palette.default[1])
        document.undo()
        XCTAssertEqual(document.cell(at: 0, 0).color, first)
        XCTAssertEqual(document.cell(at: 0, 1).color, second)
        XCTAssertFalse(document.canUndo)
    }
    func testFastStrokeInterpolatesCellsUsingH5DominantAxisRule() {
        XCTAssertEqual(
            EditorStrokeGeometry.points(from: GridCoordinate(row: 0, column: 0), to: GridCoordinate(row: 3, column: 6)),
            [
                GridCoordinate(row: 0, column: 0), GridCoordinate(row: 1, column: 1), GridCoordinate(row: 1, column: 2),
                GridCoordinate(row: 2, column: 3), GridCoordinate(row: 2, column: 4), GridCoordinate(row: 3, column: 5),
                GridCoordinate(row: 3, column: 6),
            ]
        )
    }
    func testResizeUndoAndRedoRestoreBothDimensionsAndCells() {
        let document = PatternDocument()
        let original = document.cell(at: 0, 0).color
        document.resize(columns: 3, rows: 2)
        XCTAssertEqual(document.columns, 3)
        XCTAssertEqual(document.rows, 2)
        XCTAssertEqual(document.cells.count, 6)
        document.undo()
        XCTAssertEqual(document.columns, 16)
        XCTAssertEqual(document.rows, 16)
        XCTAssertEqual(document.cells.count, 256)
        XCTAssertEqual(document.cell(at: 0, 0).color, original)
        document.redo()
        XCTAssertEqual(document.columns, 3)
        XCTAssertEqual(document.rows, 2)
        XCTAssertEqual(document.cells.count, 6)
    }
    func testStlExportContainsFacetForColoredCell() {
        let document = PatternDocument()
        XCTAssertTrue(document.stlText().hasPrefix("solid qiaoqiaole"))
        XCTAssertTrue(document.stlText().contains("facet normal"))
        XCTAssertTrue(document.stlText().hasSuffix("endsolid qiaoqiaole\n"))
    }
    func testLoadsH5SerializedProjectCells() {
        let document = PatternDocument()
        let payload = ##"[{"x":0,"y":0,"color":"#146CFF","transparent":false},{"x":1,"y":0,"color":"#ffffff","transparent":true},{"x":0,"y":1,"color":"#F04B4C","transparent":false},{"x":1,"y":1,"color":"#31A36A","transparent":false}]"##
        XCTAssertTrue(document.loadProject(id: "p1", name: "旧作品", columns: 2, rows: 2, canvasData: payload))
        XCTAssertEqual(document.activeProjectID, "p1")
        XCTAssertEqual(document.projectName, "旧作品")
        XCTAssertEqual(document.cell(at: 0, 0).color, Palette.token(for: "#146CFF"))
        XCTAssertEqual(document.cell(at: 0, 1).color, Palette.empty)
    }
    func testSharedH5CanvasParserKeepsCoordinatesAndTransparency() {
        let payload = ##"[{"x":1,"y":0,"color":"#F04B4C","transparent":false},{"x":0,"y":0,"color":"#ffffff","transparent":true},{"x":0,"y":1,"color":"#31A36A","transparent":false},{"x":1,"y":1,"color":"#146CFF","transparent":false}]"##
        let parsed = PatternDocument.parseH5Canvas(columns: 2, rows: 2, canvasData: payload)
        XCTAssertEqual(parsed?.cells.map(\.color), [Palette.empty, Palette.token(for: "#F04B4C"), Palette.token(for: "#31A36A"), Palette.token(for: "#146CFF")])
    }
    func testBeadingDraftsAreIsolatedByAccountAndSession() {
        let suite = "BeadingDraftStoreTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let draft = BeadingToolDraft(markedCellIndexes: [1, 3], highlightedColorCode: "H7", codesVisible: false, gridVisible: false, canvasLocked: true, colorSortMode: .canvas)
        BeadingDraftStore.write(draft, ownerID: "u1", sessionID: "s1", defaults: defaults)
        XCTAssertEqual(BeadingDraftStore.read(ownerID: "u1", sessionID: "s1", defaults: defaults), draft)
        XCTAssertEqual(BeadingDraftStore.read(ownerID: "u2", sessionID: "s1", defaults: defaults), BeadingToolDraft())
        XCTAssertEqual(BeadingDraftStore.read(ownerID: "u1", sessionID: "s2", defaults: defaults), BeadingToolDraft())

        defaults.set(#"{"markedCellIndexes":[4]}"#.data(using: .utf8), forKey: BeadingDraftStore.key(ownerID: "legacy", sessionID: "s1"))
        XCTAssertEqual(BeadingDraftStore.read(ownerID: "legacy", sessionID: "s1", defaults: defaults), BeadingToolDraft(markedCellIndexes: [4]))
    }
    func testSerializesH5CompatibleProjectCellsAndBeadList() throws {
        let document = PatternDocument()
        let payload = try JSONSerialization.jsonObject(with: Data(document.projectCanvasData().utf8)) as? [[String: Any]]
        XCTAssertEqual(payload?.count, document.rows * document.columns)
        XCTAssertEqual(payload?.first?["x"] as? Int, 0)
        XCTAssertEqual(payload?.first?["y"] as? Int, 0)
        XCTAssertNotNil(payload?.first?["transparent"] as? Bool)
        XCTAssertEqual(document.projectBeadList().reduce(0) { $0 + $1.count }, document.cells.filter { $0.color != Palette.empty }.count)
    }
    func testPaletteSearchAndUsageOrderingMatchH5Rules() {
        let document = PatternDocument()
        let a1 = Mard221Palette.colors[0]
        let c8 = Mard221Palette.colors.first { $0.code == "C8" }!
        document.replaceGrid(columns: 2, rows: 2, colors: [c8, a1, c8, Palette.empty])

        XCTAssertEqual(document.paletteColors().prefix(2).map(\.code), ["C8", "A1"])
        let matchingC8 = document.paletteColors(matching: "c8")
        XCTAssertEqual(matchingC8.first?.code, "C8")
        XCTAssertTrue(matchingC8.allSatisfy { $0.code.lowercased().contains("c8") || "#\($0.hex)".lowercased().contains("c8") })
        XCTAssertEqual(document.paletteColors(matching: "#FAF4").map(\.code), ["A1"])
        XCTAssertEqual(document.beadCountsByCode()["C8"], 2)
        XCTAssertEqual(document.beadCountsByCode()["A1"], 1)
        XCTAssertNil(document.beadCountsByCode()["空白"])
    }
    func testStartingBlankProjectClearsExistingProjectIdentity() {
        let document = PatternDocument()
        let payload = ##"[{"x":0,"y":0,"color":"#faf4c8","transparent":false},{"x":1,"y":0,"color":"#ffffff","transparent":true},{"x":0,"y":1,"color":"#ffffff","transparent":true},{"x":1,"y":1,"color":"#ffffff","transparent":true}]"##
        XCTAssertTrue(document.loadProject(id: "old", name: "旧作品", columns: 2, rows: 2, canvasData: payload))
        document.startBlankProject(columns: 24, rows: 18)
        XCTAssertNil(document.activeProjectID)
        XCTAssertEqual(document.projectName, "未命名作品")
        XCTAssertEqual(document.columns, 24)
        XCTAssertEqual(document.rows, 18)
        XCTAssertTrue(document.cells.allSatisfy { $0.color == Palette.empty })
    }

    func testRendersProjectThumbnail() {
        XCTAssertFalse(PatternDocument().projectThumbnailPNG()?.isEmpty ?? true)
    }
    func testExportsPNGAndSTLFilesIntoTheProvidedAppContainerDirectory() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("qiaoqiaole-export-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let document = PatternDocument()
        document.applyTool(at: 0, 0)

        let pngURL = try PatternFileExporter.writePNG(document: document, directory: directory)
        let stlURL = try PatternFileExporter.writeSTL(document: document, directory: directory)

        XCTAssertEqual(pngURL.deletingLastPathComponent(), directory)
        XCTAssertEqual(stlURL.deletingLastPathComponent(), directory)
        XCTAssertEqual(try Data(contentsOf: pngURL).prefix(8), Data([137, 80, 78, 71, 13, 10, 26, 10]))
        XCTAssertTrue(try String(contentsOf: stlURL, encoding: .utf8).contains("facet normal"))
    }
    func testRejectsDuplicateCoordinatesInSavedH5Payload() {
        let document = PatternDocument()
        let payload = #"[{"x":0,"y":0,"color":"red","transparent":false},{"x":0,"y":0,"color":"red","transparent":false},{"x":1,"y":0,"color":"red","transparent":false},{"x":1,"y":1,"color":"red","transparent":false}]"#
        XCTAssertFalse(document.loadProject(id: "p1", name: "坏数据", columns: 2, rows: 2, canvasData: payload))
    }
}
