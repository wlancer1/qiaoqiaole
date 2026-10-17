import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

enum AvatarImageData {
    static func decode(_ value: String?) -> Data? {
        guard let source = value?.trimmingCharacters(in: .whitespacesAndNewlines), !source.isEmpty,
              let comma = source.firstIndex(of: ",") else { return nil }
        let metadata = source[..<comma].lowercased()
        guard metadata.hasPrefix("data:image/"), metadata.contains(";base64") else { return nil }
        return Data(base64Encoded: String(source[source.index(after: comma)...]))
    }
}

struct AppRootView: View {
    @EnvironmentObject private var router: AppRouter
    @StateObject private var document = PatternDocument()
    @StateObject private var splitWorkflow = SplitWorkflow()
    @StateObject private var session = AppSession()
    @StateObject private var projectStore = ProjectListStore()

    var body: some View {
        ZStack {
            NavigationStack(path: $router.path) {
                Group {
                    if #available(iOS 18.0, *) {
                        tabs.tabViewStyle(.tabBarOnly)
                    } else {
                        tabs
                    }
                }
                .navigationDestination(for: AppRoute.self, destination: destination)
            }

            if router.path.isEmpty {
                H5BottomTabBar(
                    selected: router.selectedTab,
                    unreadCount: messagesFixture?.notifications.filter { !$0.isRead }.count ?? session.unreadNotificationCount,
                    onSelect: { router.select(tab: $0) },
                    onCreate: { router.overlay = .createDrawing }
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                .zIndex(1)
            }

            if let notice = router.routeStatus {
                StatusToast(notice: notice) { router.clearRouteStatus() }
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .zIndex(2)
            }

            if let overlay = router.overlay {
                AppOverlayHost(session: session, document: document, splitWorkflow: splitWorkflow, projectStore: projectStore, overlay: overlay)
                    .zIndex(3)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: router.overlay?.id)
        .animation(.easeInOut(duration: 0.2), value: router.routeStatus?.id)
        .onAppear {
            let launchArguments = ProcessInfo.processInfo.arguments
            if (launchArguments.contains("-ui-testing-split-fixture")
                || launchArguments.contains("-ui-testing-split-workspace")
                || launchArguments.contains("-ui-testing-split-align-workspace")
                || launchArguments.contains("-ui-testing-split-crop-workspace")), splitWorkflow.image == nil {
                splitWorkflow.load(image: SplitWorkflow.uiTestingFixtureImage(), name: "UI 自动化固定图")
                if launchArguments.contains("-ui-testing-split-align-workspace") {
                    splitWorkflow.setSplitMode(.align)
                }
            }
            if launchArguments.contains("-ui-testing-editor-workspace") {
                if launchArguments.contains("-ui-testing-editor-zoomed") {
                    let fixtureColors = (0..<(32 * 32)).map { index -> ColorToken in
                        let x = index % 32
                        let y = index / 32
                        return (x + y).isMultiple(of: 4) ? Mard221Palette.colors[(x / 3 + y / 3) % 8] : Palette.empty
                    }
                    document.replaceGrid(columns: 32, rows: 32, colors: fixtureColors)
                } else {
                    document.replaceGrid(columns: 32, rows: 32, colors: Array(repeating: Palette.empty, count: 32 * 32))
                }
            }
            if session.token != nil { router.restoreAuthenticatedSession() }
        }
        .task { await session.validateRestoredSession() }
    }

    private var tabs: some View {
        TabView(selection: Binding(get: { router.selectedTab }, set: { router.select(tab: $0) })) {
            HomeLandingView(session: session, fixture: homeFixture)
                .tabItem { Label(HomeTab.home.title, systemImage: HomeTab.home.symbol) }.tag(HomeTab.home)
            DiscoverLandingView(session: session, fixture: discoverFixture)
                .tabItem { Label(HomeTab.discover.title, systemImage: HomeTab.discover.symbol) }.tag(HomeTab.discover)
            MessagesLandingView(session: session, fixture: messagesFixture)
                .tabItem { Label(HomeTab.messages.title, systemImage: HomeTab.messages.symbol) }
                .badge(messagesFixture?.notifications.filter { !$0.isRead }.count ?? session.unreadNotificationCount)
                .tag(HomeTab.messages)
            ProfileLandingView(session: session, fixture: profileFixture)
                .tabItem { Label(HomeTab.profile.title, systemImage: HomeTab.profile.symbol) }.tag(HomeTab.profile)
        }
        .tint(AppTokens.flowBrand)
        // H5 keeps its primary navigation at the bottom on wide screens too.
        // Give the system tab container the compact navigation idiom while the
        // page itself retains its independently constrained wide layout.
        .environment(\.horizontalSizeClass, .compact)
        .toolbar(.hidden, for: .tabBar)
    }


private struct H5BottomTabBar: View {
    let selected: HomeTab
    let unreadCount: Int
    let onSelect: (HomeTab) -> Void
    let onCreate: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            tab(.home)
            tab(.discover)

            Button(action: onCreate) {
                Image(systemName: "plus")
                    .font(.system(size: 32, weight: .medium))
                    .foregroundStyle(.white)
                    .frame(width: 48, height: 48)
                    .background(AppTokens.flowBrand)
                    .clipShape(Circle())
                    .shadow(color: AppTokens.flowBrand.opacity(0.28), radius: 10, y: 4)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("创建")
            .frame(maxWidth: .infinity)
            .offset(y: -22)

            tab(.messages)
            tab(.profile)
        }
        .padding(.horizontal, 8)
        .padding(.top, 8)
        .padding(.bottom, 10)
        .frame(minHeight: 76)
        .background(Color.white)
    }

    @ViewBuilder
    private func tab(_ tab: HomeTab) -> some View {
        Button { onSelect(tab) } label: {
            VStack(spacing: 4) {
                ZStack(alignment: .topTrailing) {
                    Image(systemName: tab.symbol + (selected == tab ? ".fill" : ""))
                        .font(.system(size: 21, weight: selected == tab ? .semibold : .medium))
                    if tab == .messages && unreadCount > 0 {
                        Text(unreadCount > 9 ? "9+" : "\(unreadCount)")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 4)
                            .frame(minWidth: 16, minHeight: 16)
                            .background(Color.red)
                            .clipShape(Capsule())
                            .offset(x: 9, y: -7)
                    }
                }
                Text(tab.title)
                    .font(.system(size: 11, weight: selected == tab ? .bold : .semibold))
            }
            .foregroundStyle(selected == tab ? AppTokens.flowBrand : AppTokens.flowMuted)
            .frame(maxWidth: .infinity, minHeight: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(tab.title)
        .accessibilityAddTraits(selected == tab ? .isSelected : [])
    }
}

    private var profileFixture: ProfileVisualFixture? {
        let arguments = ProcessInfo.processInfo.arguments
        if arguments.contains("-ui-testing-profile-summary-error") { return .summaryError }
        return arguments.contains("-ui-testing-profile-workspace") ? .workspace : nil
    }

    private var homeFixture: HomeVisualFixture? {
        ProcessInfo.processInfo.arguments.contains("-ui-testing-home-workspace") ? .workspace : nil
    }

    private var discoverFixture: DiscoverVisualFixture? {
        ProcessInfo.processInfo.arguments.contains("-ui-testing-discover-workspace") ? .workspace : nil
    }

    private var messagesFixture: MessagesVisualFixture? {
        ProcessInfo.processInfo.arguments.contains("-ui-testing-messages-workspace") ? .workspace : nil
    }

    private var communityDetailFixture: CommunityPostDetailVisualFixture? {
        ProcessInfo.processInfo.arguments.contains("-ui-testing-community-detail-workspace") ? .workspace : nil
    }

    private var authorFixture: CommunityAuthorVisualFixture? {
        ProcessInfo.processInfo.arguments.contains("-ui-testing-author-workspace") ? .workspace : nil
    }

    private var followingFixture: SocialUsersVisualFixture? {
        ProcessInfo.processInfo.arguments.contains("-ui-testing-following-workspace") ? .following : nil
    }

    private var followersFixture: SocialUsersVisualFixture? {
        ProcessInfo.processInfo.arguments.contains("-ui-testing-followers-workspace") ? .followers : nil
    }

    private var projectsFixture: ProjectsVisualFixture? {
        ProcessInfo.processInfo.arguments.contains("-ui-testing-projects-workspace") ? .workspace : nil
    }

    private var warehousesFixture: WarehousesVisualFixture? {
        ProcessInfo.processInfo.arguments.contains("-ui-testing-warehouses-workspace") ? .workspace : nil
    }

    private var warehouseDetailFixture: WarehouseDetailVisualFixture? {
        ProcessInfo.processInfo.arguments.contains("-ui-testing-warehouse-detail-workspace") ? .workspace : nil
    }

    @ViewBuilder
    private func destination(_ route: AppRoute) -> some View {
        switch route {
        case .canvas:
            PatternEditorView(document: document, onRequestSave: { router.overlay = .saveProject })
        case .projectEdit(let id):
            ProjectEditorContainer(projectID: id, session: session, document: document)
        case .communityPost(let id):
            CommunityPostDetailView(session: session, postID: id, fixture: communityDetailFixture)
        case .authorProfile(let id):
            CommunityAuthorView(session: session, authorID: id, fixture: authorFixture)
        case .following:
            SocialUserListView(session: session, following: true, fixture: followingFixture)
        case .followers:
            SocialUserListView(session: session, following: false, fixture: followersFixture)
        case .home(let tab):
            switch tab {
            case .home: HomeLandingView(session: session, fixture: homeFixture)
            case .discover: DiscoverLandingView(session: session, fixture: discoverFixture)
            case .messages: MessagesLandingView(session: session, fixture: messagesFixture)
            case .profile: ProfileLandingView(session: session, fixture: profileFixture)
            }
        case .split:
            SplitSettingsView(workflow: splitWorkflow)
        case .splitCrop:
            SplitCropView(workflow: splitWorkflow)
        case .splitPreview:
            SplitPreviewView(workflow: splitWorkflow, document: document)
        case .projects:
            ProjectsView(session: session, store: projectStore, fixture: projectsFixture)
        case .warehouses:
            WarehouseListView(session: session, fixture: warehousesFixture)
        case .warehouseDetail(let id):
            WarehouseDetailView(session: session, warehouseID: id, fixture: warehouseDetailFixture)
        case .projectBeading(let id):
            BeadingSessionView(session: session, projectID: id)
        case .beading:
            if ProcessInfo.processInfo.arguments.contains("-ui-testing-beading-workspace") {
                BeadingSessionView(session: session, projectID: "visual-fixture", fixture: .workspace)
            } else if ProcessInfo.processInfo.arguments.contains("-ui-testing-beading-warehouse-error") {
                BeadingSessionView(session: session, projectID: "warehouse-error-fixture", fixture: .warehouseLoadError)
            } else {
                LegacyBeadingRedirectView()
            }
        case .userAgreement:
            LegalDocumentView(kind: .agreement)
        case .privacyPolicy:
            LegalDocumentView(kind: .privacy)
        }
    }
}

private struct LegacyBeadingRedirectView: View {
    @EnvironmentObject private var router: AppRouter
    var body: some View { ProgressView("正在返回我的作品…").task { router.replace(with: .projects) }.accessibilityLabel("正在返回我的作品") }
}

private struct LegalDocumentView: View {
    enum Kind { case agreement, privacy }
    let kind: Kind
    private var title: String { kind == .agreement ? "用户协议" : "隐私政策" }
    private var intro: String { kind == .agreement ? "欢迎使用超级拼。请在使用服务前仔细阅读本协议，注册或使用我们的服务即表示你理解并同意本协议内容。" : "我们重视你的个人信息和隐私。本政策说明我们在你使用超级拼时会收集哪些信息、如何使用以及你可以如何管理这些信息。" }
    private var sections: [(String, [String])] { kind == .agreement ? [("账号与服务", ["超级拼为你提供拼豆图纸创作、作品保存、分图、拼豆及社区交流等功能。你需要使用真实、有效的手机号注册账号，并妥善保管登录凭证。", "账号仅限本人使用。发现账号异常、被盗或存在未经授权的登录时，请及时联系我们。"]), ("内容与使用规范", ["你上传、创作或发布的内容应当由你合法拥有或已获得必要授权，不得侵犯他人的知识产权、隐私权或其他合法权益。", "不得利用本服务制作、发布违法违规、欺诈、骚扰、恶意攻击或破坏平台正常运行的内容。"]), ("作品与社区内容", ["你保留对原创作品的权利。为提供存储、展示、分享和处理功能，你授予超级拼在服务范围内使用相关内容的必要许可。", "公开发布到社区的内容可能被其他用户浏览、收藏、评论或分享，请在发布前确认内容适合公开展示。"]), ("服务变更与终止", ["我们会持续优化产品，可能对功能进行调整、升级或暂停，并尽量通过产品内提示告知重要变化。", "如你违反本协议或相关法律法规，我们可能采取限制功能、删除内容或停止服务等措施。"]), ("协议更新与联系我们", ["当服务或法律要求发生变化时，我们可能更新本协议。更新后的协议会在本页面公布，继续使用服务即视为接受更新内容。", "如对本协议有疑问，请通过产品提供的联系方式与我们联系。"])] : [("我们如何使用信息", ["为完成注册、登录和账号安全校验，我们会处理你的手机号、登录凭证及必要的设备和网络信息。", "为保存和同步你的创作，我们会处理你主动提交的作品名称、画布数据、图片、库存及社区互动内容。"]), ("信息存储与保护", ["我们会采取访问控制、加密传输和必要的安全措施保护个人信息，并仅在实现服务所需的期限内保存。", "你应妥善保管账号凭证。若发现个人信息或账号可能泄露，请及时联系我们。"]), ("第三方服务", ["部分功能可能依赖短信、对象存储、内容处理或登录安全等第三方服务。我们会要求服务提供方仅按照约定处理必要信息。", "除非获得你的授权、法律法规要求或为保护用户和平台安全，我们不会出售你的个人信息。"]), ("你的权利", ["你可以通过产品内功能查看、修改或删除部分账号和作品信息，也可以申请注销账号。", "在法律允许的范围内，你可以向我们询问个人信息处理情况，或要求更正、删除和限制处理相关信息。"]), ("未成年人保护与政策更新", ["未成年人应在监护人同意和指导下使用本服务。若我们发现未经监护人同意收集了未成年人信息，会依法采取删除等措施。", "我们会根据服务变化和法律要求更新本政策，并在本页面展示最新版本。"])] }
    var body: some View { ScrollView { VStack(alignment: .leading, spacing: 18) { Text("超级拼 · 服务条款").font(.caption.weight(.semibold)).foregroundStyle(AppTokens.flowBrand); Text(title).font(.largeTitle.bold()).foregroundStyle(AppTokens.flowText); Text("更新日期：2026 年 8 月 17 日").font(.caption).foregroundStyle(AppTokens.muted); VStack(alignment: .leading, spacing: 16) { Text(intro).font(.body).foregroundStyle(AppTokens.flowText); ForEach(Array(sections.enumerated()), id: \.offset) { index, section in VStack(alignment: .leading, spacing: 8) { Text("\(index + 1). \(section.0)").font(.headline); ForEach(section.1, id: \.self) { Text($0).font(.subheadline).foregroundStyle(AppTokens.muted).fixedSize(horizontal: false, vertical: true) } } } }.padding(18).background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: AppTokens.cardCorner)) }.padding(AppTokens.pagePadding) }.background(AppTokens.flowBackground).navigationTitle(title).navigationBarTitleDisplayMode(.inline).accessibilityLabel(title) }
}

private struct BeadingSessionVisualFixture {
    let session: BeadingSession?
    let canvas: BeadingCanvas?
    let inventory: InventoryCheck?
    let warehouseLoadError: String?

    static let workspace: BeadingSessionVisualFixture = {
        let codes = ["H7", "C4", "A4", "C3", "A7"]
        let colors = Dictionary(uniqueKeysWithValues: Mard221Palette.colors.map { ($0.code, $0) })
        let columns = 24
        let rows = 20
        let cells = (0..<(columns * rows)).map { index in
            let diagonal = (index / columns + index % columns) % codes.count
            return BeadCell(id: index, color: colors[codes[diagonal]] ?? Palette.empty)
        }
        let requirements = [
            BeadingRequirement(colorCode: "H7", required: 603),
            BeadingRequirement(colorCode: "C4", required: 59),
            BeadingRequirement(colorCode: "A4", required: 29),
            BeadingRequirement(colorCode: "C3", required: 11),
            BeadingRequirement(colorCode: "A7", required: 5),
        ]
        let session = BeadingSession(id: "visual-fixture-session", projectId: "visual-fixture", projectName: "拼豆工作区视觉夹具", requirements: requirements, warehouseId: "visual-fixture-warehouse", warehouseName: "视觉仓库", status: "in_progress", completedColorCodes: ["A7"], progress: BeadingProgress(completed: 1, total: 5, percent: 20), elapsedSeconds: 142, timerStartedAt: nil, inventoryDeducted: false, version: 1)
        let inventory = InventoryCheck(warehouseId: "visual-fixture-warehouse", warehouseName: "视觉仓库", items: [
            InventoryCheckItem(colorCode: "H7", required: 603, available: 700, missing: 0),
            InventoryCheckItem(colorCode: "C4", required: 59, available: 42, missing: 17),
            InventoryCheckItem(colorCode: "A4", required: 29, available: 31, missing: 0),
        ], summary: InventoryCheckSummary(sufficient: false, required: 691, available: 674, missing: 17))
        return BeadingSessionVisualFixture(session: session, canvas: BeadingCanvas(columns: columns, rows: rows, cells: cells), inventory: inventory, warehouseLoadError: nil)
    }()

    static let warehouseLoadError = BeadingSessionVisualFixture(session: nil, canvas: nil, inventory: nil, warehouseLoadError: "仓库列表读取失败，点此重新加载")
}

private struct BeadingSessionView: View {
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var ledBoard: LEDMatrixBluetoothController
    @ObservedObject var session: AppSession
    let projectID: String
    let fixture: BeadingSessionVisualFixture?
    @State private var beading: BeadingSession?
    @State private var inventory: InventoryCheck?
    @State private var showInventorySheet = false
    @State private var showMoreTools = false
    @State private var showColorSearch = false
    @State private var showClearMarksConfirmation = false
    @State private var colorSearchQuery = ""
    @State private var colorSortMode: BeadingColorSortMode = .remaining
    @State private var codesVisible = true
    @State private var gridVisible = true
    @State private var canvasLocked = false
    @State private var isLoading = true
    @State private var isSubmitting = false
    @State private var error: String?
    @State private var elapsed = 0
    @State private var timerTask: Task<Void, Never>?
    @State private var requestID = UUID()
    @State private var showCompletionChoice = false
    @State private var showExitChoice = false
    @State private var completionKey = UUID().uuidString
    @State private var warehouses: [WarehouseSummary] = []
    @State private var warehouseLoadError: String?
    @State private var selectedWarehouseID: String?
    @State private var canvas: BeadingCanvas?
    @State private var markedCellIndexes = Set<Int>()
    /// H5 keeps the selected color and highlight visibility as two independent states.
    @State private var highlightedColorCode: String?
    @State private var highlightEnabled = true
    @State private var markMode = false
    @State private var fitCanvasRequest = UUID()
    @State private var showLEDBoardSheet = false
    /// Forces a fresh viewport state whenever the beading workspace is entered.
    /// SwiftUI can preserve child @State when navigating back into the same project,
    /// which otherwise restores an old pan/zoom offset on "继续拼豆".
    @State private var workspaceEntryToken = UUID()

    init(session: AppSession, projectID: String, fixture: BeadingSessionVisualFixture? = nil) {
        let initialHighlight = fixture.flatMap { value -> String? in
            guard let session = value.session else { return nil }
            return session.requirements.first(where: { !session.completedColorCodes.contains($0.colorCode) })?.colorCode
        }
        self.session = session
        self.projectID = projectID
        self.fixture = fixture
        _beading = State(initialValue: fixture.flatMap(\.session))
        _isLoading = State(initialValue: fixture == nil)
        _elapsed = State(initialValue: fixture?.session?.elapsedSeconds ?? 0)
        _canvas = State(initialValue: fixture.flatMap(\.canvas))
        _inventory = State(initialValue: fixture.flatMap(\.inventory))
        _warehouseLoadError = State(initialValue: fixture?.warehouseLoadError)
        _highlightedColorCode = State(initialValue: initialHighlight)
    }

    var body: some View {
        Group {
            if isLoading {
                H5RouteLoadingView(label: "正在准备拼豆", description: "正在读取作品与库存")
            } else if let beading {
                sessionContent(beading)
            } else {
                H5RouteLoadingView(label: "正在检查豆子库存", description: "确认库存后即可开始拼豆")
            }
        }
        .navigationTitle("开始拼豆").navigationBarTitleDisplayMode(.inline)
        .task(id: projectID) { guard fixture == nil else { return }; await bootstrapWorkspace() }
        .onAppear {
            // Re-entering the same project can reuse this NavigationStack destination.
            // Force the canvas child to discard any previous pan/zoom @State.
            workspaceEntryToken = UUID()
            fitCanvasRequest = UUID()
            if ledBoard.isReady { syncLEDBoard() }
        }
        .onDisappear {
            timerTask?.cancel()
            ledBoard.clearBoardImmediately()
        }
        .onChange(of: canvas) { _, _ in syncLEDBoard() }
        .onChange(of: markedCellIndexes) { _, _ in persistToolDraft(); syncLEDBoard() }
        .onChange(of: highlightedColorCode) { _, _ in persistToolDraft(); syncLEDBoard() }
        .onChange(of: highlightEnabled) { _, _ in persistToolDraft(); syncLEDBoard() }
        .onChange(of: ledBoard.isReady) { _, ready in
            if ready { syncLEDBoard() }
        }
        .onChange(of: codesVisible) { _, _ in persistToolDraft() }
        .onChange(of: gridVisible) { _, _ in persistToolDraft() }
        .onChange(of: canvasLocked) { _, _ in persistToolDraft() }
        .onChange(of: colorSortMode) { _, _ in persistToolDraft() }
        .confirmationDialog("完成拼豆", isPresented: $showCompletionChoice, titleVisibility: .visible) {
            Button("完成并扣减仓库库存") { Task { await complete(deduct: true) } }
            Button("完成但不扣减库存") { Task { await complete(deduct: false) } }
            Button("取消", role: .cancel) { Task { await transition(.returnToProgress) } }
        } message: { Text("确认完成后会结束当前会话。扣减库存将由服务端原子执行，网络重试不会重复扣减。") }
        .alert("保存拼豆进度？", isPresented: $showExitChoice) {
            Button("继续拼豆", role: .cancel) {}
            Button("保存并退出") { Task { await saveAndExit() } }
            Button("放弃会话", role: .destructive) { Task { await abandon() } }
        } message: { Text("下次可以从当前色号继续。") }
        .sheet(isPresented: $showInventorySheet) {
            if let inventory {
                InventoryCheckSheetView(
                    check: inventory,
                    selectedWarehouseID: $selectedWarehouseID,
                    warehouses: warehouses,
                    onWarehouseChange: { warehouseID in
                        selectedWarehouseID = warehouseID
                        await refreshInventoryCheck()
                    },
                    onClose: {
                        showInventorySheet = false
                        if beading == nil { exitWorkspace() }
                    },
                    onStart: { await startFromInventoryCheck() }
                )
            }
        }
        .sheet(isPresented: $showMoreTools) {
            BeadingMoreToolsSheet(codesVisible: $codesVisible, gridVisible: $gridVisible, hasMarks: !markedCellIndexes.isEmpty, onClearMarks: { showMoreTools = false; showClearMarksConfirmation = true }, onReset: resetTools, onClose: { showMoreTools = false })
        }
        .sheet(isPresented: $showColorSearch) {
            BeadingColorSearchSheet(query: $colorSearchQuery, requirements: sortedRequirements(in: beading), completedColorCodes: beading?.completedColorCodes ?? [], color: color, onSelect: { code in
                selectColor(code)
                showColorSearch = false
            }, onClose: { showColorSearch = false })
        }
        .sheet(isPresented: $showLEDBoardSheet) {
            LEDMatrixBluetoothSheet(controller: ledBoard)
        }
        .confirmationDialog("清除单格标记？", isPresented: $showClearMarksConfirmation, titleVisibility: .visible) {
            Button("清除标记", role: .destructive) { markedCellIndexes = [] }
            Button("取消", role: .cancel) {}
        } message: { Text("将清除当前拼豆页面中的全部单格标记。") }
    }

    private func sessionContent(_ current: BeadingSession) -> some View {
        VStack(spacing: 0) {
            workspaceHeader(current)
            workspaceProgress(current)
            ZStack {
                if let canvas {
                    BeadingCanvasView(
                        canvas: canvas,
                        markedIndexes: markedCellIndexes,
                        highlightedColorCode: highlightEnabled ? highlightedColorCode : nil,
                        codesVisible: codesVisible,
                        gridVisible: gridVisible,
                        locked: canvasLocked,
                        markMode: markMode,
                        fitRequest: fitCanvasRequest,
                        onCellTap: handleCanvasCellTap
                    )
                    .id(workspaceEntryToken)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ProgressView("正在加载拼豆画布…")
                }
                if let error {
                    Text(error).font(.caption.weight(.medium)).foregroundStyle(.red).padding(9).background(AppTokens.panel).clipShape(Capsule()).frame(maxHeight: .infinity, alignment: .top)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .layoutPriority(1)
            workspaceControls(current)
        }
        .background(AppTokens.flowBackground)
        .toolbar(.hidden, for: .navigationBar)
    }

    private func workspaceHeader(_ current: BeadingSession) -> some View {
        HStack(spacing: 4) {
            Button { showExitChoice = true } label: {
                H5Icon(name: "lucide-arrow-left", size: 20)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .foregroundStyle(Color(hex: "52657F"))
            .accessibilityLabel("返回")

            Spacer(minLength: 0)

            HStack(spacing: 4) {
                Button { Task { await checkInventory() } } label: {
                    HStack(spacing: 5) {
                        H5Icon(name: "lucide-package", size: 18)
                        Text("库存")
                    }
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Color(hex: "52657F"))
                    .padding(.horizontal, 10)
                    .frame(height: 32)
                    .background(Color(hex: "F7F9FC"))
                    .clipShape(Capsule())
                    .overlay(Capsule().stroke(Color(hex: "DCE4EF"), lineWidth: 1))
                    .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .disabled(isSubmitting)
                .accessibilityLabel("查看库存")

                Button { Task { await current.status == "paused" ? transition(.resume) : transition(.pause) } } label: {
                    HStack(spacing: 5) {
                        Text(timeText).monospacedDigit()
                        H5Icon(name: current.status == "paused" ? "lucide-play" : "lucide-pause", size: 12)
                            .frame(width: 16, height: 16)
                            .background(Color(hex: "FFF3B3"))
                            .foregroundStyle(Color(hex: "6F4C00"))
                            .clipShape(RoundedRectangle(cornerRadius: 5))
                    }
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Color(hex: "34465F"))
                    .padding(.horizontal, 9)
                    .frame(minWidth: 82, minHeight: 32, maxHeight: 32)
                    .background(Color(hex: "F7F9FC"))
                    .clipShape(Capsule())
                    .overlay(Capsule().stroke(Color(hex: "DCE4EF"), lineWidth: 1))
                    .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .disabled(isSubmitting || current.status != "in_progress" && current.status != "paused")
                .accessibilityLabel(current.status == "paused" ? "继续计时" : "暂停计时")

                Button { Task { await saveProgress() } } label: {
                    HStack(spacing: 5) {
                        H5Icon(name: "lucide-save", size: 18)
                        Text("保存")
                    }
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Color(hex: "087058"))
                    .padding(.horizontal, 10)
                    .frame(height: 32)
                    .background(Color(hex: "EDFBF7"))
                    .clipShape(Capsule())
                    .overlay(Capsule().stroke(Color(hex: "9FE3D4"), lineWidth: 1))
                    .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .disabled(isSubmitting)
                .accessibilityLabel("保存")

                Button { showLEDBoardSheet = true } label: {
                    ZStack(alignment: .topTrailing) {
                        Image(systemName: "antenna.radiowaves.left.and.right")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(ledBoard.isReady ? Color(hex: "087058") : Color(hex: "52657F"))
                            .frame(width: 32, height: 32)
                            .background(ledBoard.isReady ? Color(hex: "EDFBF7") : Color(hex: "F7F9FC"))
                            .clipShape(RoundedRectangle(cornerRadius: 7))
                            .overlay(RoundedRectangle(cornerRadius: 7).stroke(ledBoard.isReady ? Color(hex: "9FE3D4") : Color(hex: "DCE4EF"), lineWidth: 1))
                        if ledBoard.isReady {
                            Circle().fill(Color.green).frame(width: 7, height: 7).offset(x: 2, y: -2)
                        }
                    }
                    .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(ledBoard.isReady ? "智能拼豆板已连接" : "连接智能拼豆板")

                Button { showMoreTools = true } label: {
                    H5Icon(name: "lucide-settings", size: 19)
                        .foregroundStyle(Color(hex: "52657F"))
                        .frame(width: 32, height: 32)
                        .background(Color(hex: "F7F9FC"))
                        .clipShape(RoundedRectangle(cornerRadius: 7))
                        .overlay(RoundedRectangle(cornerRadius: 7).stroke(Color(hex: "DCE4EF"), lineWidth: 1))
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .disabled(isSubmitting)
                .accessibilityLabel("设置")
            }
        }
        .padding(.horizontal, 8)
        .frame(minHeight: 52)
        .background(AppTokens.panel)
        .overlay(alignment: .bottom) { Rectangle().fill(Color(hex: "E8EDF5")).frame(height: 1) }
    }

    private func workspaceProgress(_ current: BeadingSession) -> some View {
        HStack(spacing: 10) {
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color(hex: "DCE4EF"))
                    Capsule().fill(LinearGradient(colors: [AppTokens.flowBrand, Color(hex: "2EB5BE"), Color(hex: "40BD67")], startPoint: .leading, endPoint: .trailing)).frame(width: proxy.size.width * CGFloat(current.progress.percent) / 100)
                }
            }.frame(height: 8)
            Text("\(current.progress.percent)%").font(.caption.weight(.bold)).foregroundStyle(AppTokens.flowBrand).frame(width: 38, alignment: .trailing)
        }
        .padding(.horizontal, 16).frame(height: 26).background(AppTokens.panel)
        .overlay(alignment: .bottom) { Rectangle().fill(AppTokens.flowLine).frame(height: 1) }
        .accessibilityElement(children: .ignore).accessibilityLabel("拼豆进度，\(current.progress.percent)%")
    }

    private func workspaceControls(_ current: BeadingSession) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                workspaceTool("lucide-search", title: "搜色", active: showColorSearch) { colorSearchQuery = ""; showColorSearch = true }
                workspaceTool("lucide-flag", title: "标记", active: markMode, disabled: canvasLocked || highlightedColorCode == nil) { markMode.toggle() }
                workspaceTool("lucide-lightbulb", title: "高亮", active: highlightEnabled) { highlightEnabled.toggle() }
                workspaceTool("lucide-lock", title: "锁定", active: canvasLocked) { canvasLocked.toggle() }
                workspaceTool("lucide-more-horizontal", title: "更多", active: showMoreTools) { showMoreTools = true }
                workspaceTool("lucide-maximize", title: "适应") { fitCanvasRequest = UUID() }
            }
            .padding(.horizontal, 3)
            .frame(height: 56)
            .background(AppTokens.panel)
            .overlay(alignment: .top) { Rectangle().fill(AppTokens.flowLine).frame(height: 1) }

            HStack(spacing: 4) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(sortedRequirements(in: current)) { item in
                            let selected = highlightedColorCode == item.colorCode
                            let done = current.completedColorCodes.contains(item.colorCode)
                            Button { selectColor(item.colorCode) } label: {
                                VStack(spacing: 4) {
                                    ZStack(alignment: .topTrailing) {
                                        RoundedRectangle(cornerRadius: 12)
                                            .fill(color(for: item.colorCode))
                                            .frame(width: 38, height: 38)
                                            .overlay {
                                                RoundedRectangle(cornerRadius: 12)
                                                    .stroke(selected ? Color(hex: "F0A517") : Color.black.opacity(0.10), lineWidth: selected ? 2.5 : 1)
                                            }
                                            .shadow(color: Color(hex: "2A3F60").opacity(0.10), radius: 4, y: 2)
                                            .overlay {
                                                Text(item.colorCode)
                                                    .font(.system(size: 14, weight: .black))
                                                    .foregroundStyle(colorText(for: item.colorCode))
                                            }
                                        if done {
                                            Circle().fill(Color(hex: "1268D7")).frame(width: 20, height: 20)
                                                .overlay(H5Icon(name: "lucide-check", size: 12).foregroundStyle(.white))
                                                .overlay(Circle().stroke(Color.white, lineWidth: 2))
                                                .offset(x: 6, y: -6)
                                        }
                                    }
                                    Text("\(item.required)")
                                        .font(.system(size: 12, weight: .bold))
                                        .foregroundStyle(Color(hex: "5B6472"))
                                }
                                .frame(width: 48)
                                .frame(minHeight: 58)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("选择色号 \(item.colorCode)\(selected ? "，当前" : "")\(done ? "，已完成" : "")")
                        }
                    }
                    .padding(.horizontal, 8)
                    .padding(.top, 6)
                    .padding(.bottom, 8)
                }

                HStack(spacing: 6) {
                    Button { colorSortMode = colorSortMode.next } label: {
                        VStack(spacing: 3) {
                            H5Icon(name: "lucide-sliders-horizontal", size: 18)
                            Text(colorSortMode == .code ? "色号" : "数量")
                                .font(.system(size: 10, weight: .bold))
                        }
                        .foregroundStyle(Color(hex: "52657F"))
                        .frame(width: 44, height: 44)
                        .background(Color(hex: "F5F8FE"))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(hex: "E0E7F1"), lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("切换排序，当前\(colorSortMode == .code ? "色号顺序" : "剩余数量")")

                    let terminal = current.progress.completed == current.progress.total
                    let currentDone = highlightedColorCode.map { current.completedColorCodes.contains($0) } ?? false
                    Button(terminal ? "确认完成" : "完成 \(current.progress.completed)/\(current.progress.total)") {
                        Task { await terminal ? prepareCompletion() : completeCurrentColor() }
                    }
                    .font(.system(size: 14, weight: .black))
                    .foregroundStyle(.white)
                    .frame(width: 82, height: 44)
                    .background(Color(hex: "1268D7"))
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .shadow(color: Color(hex: "1268D7").opacity(0.22), radius: 6, y: 3)
                    .disabled(isSubmitting || (!terminal && (highlightedColorCode == nil || currentDone)))
                    .accessibilityLabel(terminal ? "确认完成拼豆" : "完成当前色")
                    .accessibilityValue("\(current.progress.completed)/\(current.progress.total)")
                }
                .padding(.trailing, 8)
            }
            .background(AppTokens.panel)
            .overlay(alignment: .top) { Rectangle().fill(AppTokens.flowLine).frame(height: 1) }
        }
        .background(AppTokens.panel)
    }

    private func workspaceTool(_ icon: String, title: String, active: Bool = false, disabled: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 3) {
                H5Icon(name: icon, size: 21)
                Text(title).font(.system(size: 11, weight: active ? .bold : .semibold))
            }
            .foregroundStyle(active ? Color(hex: "8A5700") : Color(hex: "63738A"))
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(active ? Color(hex: "FFF8DF") : Color.white)
        }
        .buttonStyle(.plain)
        .disabled(disabled || isSubmitting)
        .opacity(disabled ? 0.45 : 1)
        .accessibilityLabel(title)
    }

    private func selectColor(_ code: String) {
        highlightedColorCode = code
        if !highlightEnabled { highlightEnabled = true }
    }

    private func handleCanvasCellTap(_ index: Int) {
        guard !canvasLocked, let canvas, canvas.cells.indices.contains(index) else { return }
        let cell = canvas.cells[index]
        guard cell.color != Palette.empty else { return }
        if markMode {
            guard let current = highlightedColorCode, cell.color.code == current else { return }
            toggleMark(index)
        } else {
            selectColor(cell.color.code)
        }
    }

    private func color(for code: String) -> Color { Mard221Palette.colors.first(where: { $0.code == code })?.swiftUIColor ?? Color(hex: "EEF2F7") }
    private func colorText(for code: String) -> Color { let token = Mard221Palette.colors.first(where: { $0.code == code }); guard let token else { return AppTokens.flowText }; let hex = token.hex; let value = Int(hex, radix: 16) ?? 0; let red = Double((value >> 16) & 0xff), green = Double((value >> 8) & 0xff), blue = Double(value & 0xff); return (red * 0.299 + green * 0.587 + blue * 0.114) > 155 ? AppTokens.flowText : .white }
    private func sortedRequirements(in current: BeadingSession?) -> [BeadingRequirement] {
        guard let current else { return [] }
        let originalOrder = Dictionary(uniqueKeysWithValues: current.requirements.enumerated().map { ($1.colorCode, $0) })
        let firstCellOrder = Dictionary(uniqueKeysWithValues: (canvas?.cells ?? []).enumerated().reduce(into: [(String, Int)]()) { result, pair in
            if pair.element.color != Palette.empty, !result.contains(where: { $0.0 == pair.element.color.code }) { result.append((pair.element.color.code, pair.offset)) }
        })
        return current.requirements.sorted { lhs, rhs in
            switch colorSortMode {
            case .remaining:
                let lhsRemaining = current.completedColorCodes.contains(lhs.colorCode) ? 0 : lhs.required
                let rhsRemaining = current.completedColorCodes.contains(rhs.colorCode) ? 0 : rhs.required
                return lhsRemaining == rhsRemaining ? (originalOrder[lhs.colorCode] ?? 0) < (originalOrder[rhs.colorCode] ?? 0) : lhsRemaining > rhsRemaining
            case .code:
                return lhs.colorCode.localizedStandardCompare(rhs.colorCode) == .orderedAscending
            case .canvas:
                return (firstCellOrder[lhs.colorCode] ?? .max) == (firstCellOrder[rhs.colorCode] ?? .max) ? (originalOrder[lhs.colorCode] ?? 0) < (originalOrder[rhs.colorCode] ?? 0) : (firstCellOrder[lhs.colorCode] ?? .max) < (firstCellOrder[rhs.colorCode] ?? .max)
            }
        }
    }

    private var timeText: String { String(format: "%02d:%02d", elapsed / 60, elapsed % 60) }
    private func bootstrapWorkspace() async {
        guard let token = session.token else { return }
        let id = UUID()
        requestID = id
        isLoading = true
        error = nil
        defer { if requestID == id { isLoading = false } }
        do {
            async let sessionValue = session.projects.beadingSession(projectID: projectID, token: token)
            async let detailValue = session.projects.detail(id: projectID, token: token)
            let (existing, project) = try await (sessionValue, detailValue)
            let availableWarehouses = (try? await session.projects.warehouses(token: token)) ?? []
            guard requestID == id else { return }
            warehouses = availableWarehouses
            warehouseLoadError = availableWarehouses.isEmpty ? "暂无可用仓库，可继续拼豆但不会关联库存" : nil
            guard let parsed = PatternDocument.parseH5Canvas(columns: project.cols, rows: project.rows, canvasData: project.canvasData) else {
                error = "作品画布数据无效"
                return
            }
            canvas = BeadingCanvas(columns: parsed.columns, rows: parsed.rows, cells: parsed.cells)

            if let existing {
                selectedWarehouseID = existing.warehouseId ?? availableWarehouses.first?.id
                apply(existing)
                return
            }

            // H5-aligned start flow: inventory check first, create the session only after confirmation.
            selectedWarehouseID = availableWarehouses.first?.id
            inventory = try await session.projects.projectInventoryCheck(projectID: projectID, warehouseID: selectedWarehouseID, token: token)
            guard requestID == id else { return }
            showInventorySheet = true
        } catch {
            guard requestID == id else { return }
            self.error = error.localizedDescription
        }
    }

    private func loadWarehouses() async {
        if let fixture {
            warehouseLoadError = fixture.warehouseLoadError
            return
        }
        guard let token = session.token else { return }
        warehouseLoadError = nil
        do {
            warehouses = try await session.projects.warehouses(token: token)
            if selectedWarehouseID == nil { selectedWarehouseID = warehouses.first?.id }
        } catch {
            warehouses = []
            warehouseLoadError = "仓库列表读取失败，点此重新加载"
        }
    }

    private func completeCurrentColor() async {
        guard let current = beading,
              let code = highlightedColorCode,
              !current.completedColorCodes.contains(code) else { return }

        // “下一个”严格按照用户当前看到的颜色排序往后走，
        // 不再回退到 requirements 的原始顺序，避免看起来随机跳色。
        let ordered = sortedRequirements(in: current)
        let nextCode: String? = {
            guard let currentIndex = ordered.firstIndex(where: { $0.colorCode == code }) else {
                return ordered.first(where: {
                    $0.colorCode != code && !current.completedColorCodes.contains($0.colorCode)
                })?.colorCode
            }

            let after = ordered.dropFirst(currentIndex + 1)
            if let item = after.first(where: {
                $0.colorCode != code && !current.completedColorCodes.contains($0.colorCode)
            }) {
                return item.colorCode
            }

            // 当前色已经在末尾时，从列表开头继续找尚未完成的颜色。
            return ordered.prefix(currentIndex).first(where: {
                !current.completedColorCodes.contains($0.colorCode)
            })?.colorCode
        }()

        await toggle(code, preferredHighlight: nextCode)
    }

    private func toggle(_ code: String, preferredHighlight: String? = nil) async {
        guard let current = beading else { return }
        var next = current.completedColorCodes
        if next.contains(code) { next.removeAll { $0 == code } } else { next.append(code) }

        if fixture != nil {
            let progress = BeadingProgress(completed: next.count, total: current.requirements.count, percent: current.requirements.isEmpty ? 0 : next.count * 100 / current.requirements.count)
            highlightedColorCode = preferredHighlight
            apply(BeadingSession(id: current.id, projectId: current.projectId, projectName: current.projectName, requirements: current.requirements, warehouseId: current.warehouseId, warehouseName: current.warehouseName, status: current.status, completedColorCodes: next, progress: progress, elapsedSeconds: elapsed, timerStartedAt: current.timerStartedAt, inventoryDeducted: current.inventoryDeducted, version: current.version + 1))
            return
        }

        guard let token = session.token else { return }
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            let updated = try await session.projects.patchBeadingSession(current, completedCodes: next, elapsedSeconds: elapsed, token: token)
            highlightedColorCode = preferredHighlight
            apply(updated)
        } catch {
            recoverConflict(error)
        }
    }
    private func saveProgress() async { guard let current = beading, let token = session.token else { return }; isSubmitting = true; defer { isSubmitting = false }; do { apply(try await session.projects.patchBeadingSession(current, completedCodes: current.completedColorCodes, elapsedSeconds: elapsed, token: token)); router.showNotice("拼豆进度已保存", kind: .success) } catch { recoverConflict(error) } }
    private func saveAndExit() async {
        guard let current = beading, let token = session.token else { return }
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            apply(try await session.projects.patchBeadingSession(current, completedCodes: current.completedColorCodes, elapsedSeconds: elapsed, token: token))
            router.showNotice("拼豆进度已保存", kind: .success)
            exitWorkspace()
        } catch {
            recoverConflict(error)
        }
    }
    private func transition(_ action: BeadingTransitionInput.Action) async { guard let current = beading, let token = session.token else { return }; isSubmitting = true; defer { isSubmitting = false }; do { apply(try await session.projects.transitionBeadingSession(current, action: action, token: token)) } catch { recoverConflict(error) } }
    private func prepareCompletion() async { guard let current = beading, let token = session.token else { return }; isSubmitting = true; defer { isSubmitting = false }; do { apply(try await session.projects.transitionBeadingSession(current, action: .prepareCompletion, token: token)); showCompletionChoice = true } catch { self.error = error.localizedDescription } }
    private func complete(deduct: Bool) async { guard let current = beading, let token = session.token else { return }; isSubmitting = true; defer { isSubmitting = false }; do { let result = try await session.projects.completeBeadingSession(current, deductInventory: deduct, warehouseID: selectedWarehouseID, idempotencyKey: completionKey, token: token); apply(result.session); router.showNotice(result.deducted ? "拼豆完成，库存已扣减" : "拼豆已完成", kind: .success) } catch { self.error = error.localizedDescription } }
    private func abandon() async {
        guard let current = beading, let token = session.token else { return }
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            _ = try await session.projects.transitionBeadingSession(current, action: .abandon, token: token)
            // 先发送熄屏指令，再离开页面，避免蓝牙控制器随页面释放导致最后一条指令来不及发出。
            ledBoard.clearBoardImmediately()
            try? await Task.sleep(for: .milliseconds(100))
            router.showNotice("已放弃当前拼豆会话", kind: .success)
            exitWorkspace()
        } catch {
            self.error = error.localizedDescription
        }
    }
    private func refreshInventoryCheck() async {
        if let fixture {
            inventory = fixture.inventory
            return
        }
        guard let token = session.token else { return }
        do {
            if let current = beading {
                inventory = try await session.projects.inventoryCheck(sessionID: current.id, warehouseID: selectedWarehouseID, token: token)
            } else {
                inventory = try await session.projects.projectInventoryCheck(projectID: projectID, warehouseID: selectedWarehouseID, token: token)
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func checkInventory() async {
        isSubmitting = true
        defer { isSubmitting = false }
        await refreshInventoryCheck()
        if inventory != nil { showInventorySheet = true }
    }

    private func startFromInventoryCheck() async {
        guard beading == nil else {
            showInventorySheet = false
            return
        }
        guard let token = session.token else { return }
        isSubmitting = true
        error = nil
        defer { isSubmitting = false }
        do {
            let created = try await session.projects.createBeadingSession(projectID: projectID, warehouseID: selectedWarehouseID, token: token)
            showInventorySheet = false
            inventory = nil
            apply(created)
        } catch {
            self.error = error.localizedDescription
        }
    }
    private func apply(_ value: BeadingSession?) {
        let changedSession = beading?.id != value?.id
        beading = value
        timerTask?.cancel()
        elapsed = value?.elapsedSeconds ?? 0
        if changedSession, let value, let ownerID = session.user?.id {
            let draft = BeadingDraftStore.read(ownerID: ownerID, sessionID: value.id)
            markedCellIndexes = draft.markedCellIndexes
            highlightedColorCode = draft.highlightedColorCode
            highlightEnabled = draft.highlightEnabled
            codesVisible = draft.codesVisible
            gridVisible = draft.gridVisible
            canvasLocked = draft.canvasLocked
            colorSortMode = draft.colorSortMode
        }
        if (changedSession || highlightedColorCode == nil || value?.completedColorCodes.contains(highlightedColorCode ?? "") == true), let value {
            highlightedColorCode = value.requirements.first(where: { !value.completedColorCodes.contains($0.colorCode) })?.colorCode
        }
        guard let value, value.status == "in_progress" else { return }
        timerTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                guard !Task.isCancelled else { return }
                await MainActor.run { elapsed += 1 }
            }
        }
    }
    private func exitWorkspace() {
        ledBoard.clearBoardImmediately()
        if !router.path.isEmpty {
            router.path.removeLast()
        } else {
            router.navigate(to: .projects)
        }
    }
    private func resetTools() { codesVisible = true; gridVisible = true; canvasLocked = false; markMode = false; highlightEnabled = true; colorSortMode = .remaining; colorSearchQuery = ""; markedCellIndexes = []; if let beading { highlightedColorCode = beading.requirements.first(where: { !beading.completedColorCodes.contains($0.colorCode) })?.colorCode }; fitCanvasRequest = UUID(); showMoreTools = false }
    private func toggleMark(_ index: Int) { if markedCellIndexes.contains(index) { markedCellIndexes.remove(index) } else { markedCellIndexes.insert(index) } }
    private func persistToolDraft() {
        guard fixture == nil, let ownerID = session.user?.id, let sessionID = beading?.id else { return }
        BeadingDraftStore.write(BeadingToolDraft(markedCellIndexes: markedCellIndexes, highlightedColorCode: highlightedColorCode, highlightEnabled: highlightEnabled, codesVisible: codesVisible, gridVisible: gridVisible, canvasLocked: canvasLocked, colorSortMode: colorSortMode), ownerID: ownerID, sessionID: sessionID)
    }
    private func syncLEDBoard() {
        guard ledBoard.isReady else { return }
        guard highlightEnabled, let canvas else {
            ledBoard.clearBoard()
            return
        }
        ledBoard.sendGuide(
            columns: canvas.columns,
            rows: canvas.rows,
            cells: canvas.cells,
            highlightedColorCode: highlightedColorCode,
            markedIndexes: markedCellIndexes
        )
    }
    private func recoverConflict(_ failure: Error) { if let api = failure as? APIError, api.status == 409, api.code == "BEADING_VERSION_CONFLICT", let latest = api.session { apply(latest); error = "会话已在其他设备更新，已恢复最新进度。" } else { error = failure.localizedDescription } }
}

private struct BeadingCanvas: Equatable { let columns: Int; let rows: Int; let cells: [BeadCell] }

enum BeadingColorSortMode: String, Equatable {
    case remaining
    case code
    case canvas

    var next: BeadingColorSortMode {
        switch self {
        case .remaining: return .code
        case .code: return .canvas
        case .canvas: return .remaining
        }
    }

    var title: String {
        switch self {
        case .remaining: return "按剩余数量排序"
        case .code: return "按色号排序"
        case .canvas: return "按画布顺序排序"
        }
    }

    var shortTitle: String {
        switch self {
        case .remaining: return "剩余"
        case .code: return "色号"
        case .canvas: return "画布"
        }
    }
}

struct BeadingViewportFit: Equatable {
    let x: CGFloat
    let y: CGFloat
    let scale: CGFloat
}

/// Mirrors H5 `calculateViewportFit()` exactly. `x`/`y` are the transformed
/// top-left coordinates of the artboard inside the viewport.
func calculateBeadingViewportFit(viewportSize: CGSize, artboardSize: CGSize) -> BeadingViewportFit? {
    let padding: CGFloat = 16
    let availableWidth = viewportSize.width - padding * 2
    let availableHeight = viewportSize.height - padding * 2
    guard viewportSize.width.isFinite, viewportSize.height.isFinite,
          artboardSize.width.isFinite, artboardSize.height.isFinite,
          availableWidth > 0, availableHeight > 0,
          artboardSize.width > 0, artboardSize.height > 0 else { return nil }

    let contentWidth = artboardSize.width + EditorCanvasMetrics.rulerGutter
    let contentHeight = artboardSize.height + EditorCanvasMetrics.rulerTopGutter
    let naturalScale = min(availableWidth / contentWidth, availableHeight / contentHeight)
    let scale = min(8, max(0.25, naturalScale))
    return BeadingViewportFit(
        x: padding + (availableWidth - contentWidth * scale) / 2 + EditorCanvasMetrics.rulerGutter * scale,
        y: padding + (availableHeight - contentHeight * scale) / 2 + EditorCanvasMetrics.rulerTopGutter * scale,
        scale: scale
    )
}

private struct BeadingCanvasView: View {
    private let naturalCellSize: CGFloat = 18
    let canvas: BeadingCanvas
    let markedIndexes: Set<Int>
    let highlightedColorCode: String?
    let codesVisible: Bool
    let gridVisible: Bool
    let locked: Bool
    let markMode: Bool
    let fitRequest: UUID
    let onCellTap: (Int) -> Void

    @State private var scale: CGFloat = 1
    @State private var storedScale: CGFloat = 1
    @State private var origin: CGPoint = .zero
    @State private var storedOrigin: CGPoint = .zero
    @State private var rulerBaselineScale: CGFloat = 1

    var body: some View {
        GeometryReader { proxy in
            let artboardSize = CGSize(
                width: CGFloat(max(1, canvas.columns)) * naturalCellSize,
                height: CGFloat(max(1, canvas.rows)) * naturalCellSize
            )
            let viewportCenter = CGPoint(x: proxy.size.width / 2, y: proxy.size.height / 2)
            let displayedSize = CGSize(width: artboardSize.width * scale, height: artboardSize.height * scale)
            let artboardFrame = CGRect(
                x: origin.x,
                y: origin.y,
                width: displayedSize.width,
                height: displayedSize.height
            )
            let rulerGeometry = EditorViewportRulerGeometry(
                viewportSize: proxy.size,
                artboardFrame: artboardFrame,
                rows: canvas.rows,
                columns: canvas.columns,
                scale: scale,
                minimumStickyScale: rulerBaselineScale
            )

            ZStack(alignment: .topLeading) {
                Color(hex: "F2F5FD")

                ZStack {
                    Canvas(rendersAsynchronously: true) { context, _ in
                        drawCanvas(context: &context)
                    }
                    .frame(width: artboardSize.width, height: artboardSize.height)
                    .background(Color.white)
                    if !rulerGeometry.sticky {
                        BeadingStaticRulers(rows: canvas.rows, columns: canvas.columns, cellSize: naturalCellSize)
                            .allowsHitTesting(false)
                    }
                }
                .frame(width: artboardSize.width, height: artboardSize.height)
                .shadow(color: Color(hex: "2A3F60").opacity(0.16), radius: 11, y: 5)
                .scaleEffect(scale, anchor: .topLeading)
                .offset(x: origin.x, y: origin.y)

                if rulerGeometry.sticky {
                    H5ViewportRulers(geometry: rulerGeometry)
                        .allowsHitTesting(false)
                }
            }
            .contentShape(Rectangle())
            .clipped()
            .onAppear {
                fit(to: proxy.size, artboardSize: artboardSize)
                // Run one layout-cycle later as well. This prevents a bottom-sheet
                // dismissal from leaving the newly inserted workspace with a stale viewport.
                Task { @MainActor in
                    await Task.yield()
                    fit(to: proxy.size, artboardSize: artboardSize)
                    // NavigationStack / sheet dismissal animations can settle the
                    // final viewport a little later on real devices. Re-fit once
                    // after that transition instead of preserving a stale offset.
                    try? await Task.sleep(for: .milliseconds(100))
                    guard !Task.isCancelled else { return }
                    fit(to: proxy.size, artboardSize: artboardSize)
                }
            }
            .onChange(of: proxy.size) { _, next in fit(to: next, artboardSize: artboardSize) }
            .onChange(of: fitRequest) { _, _ in fit(to: proxy.size, artboardSize: artboardSize) }
            .onChange(of: canvas) { _, _ in fit(to: proxy.size, artboardSize: artboardSize) }
            .simultaneousGesture(
                MagnifyGesture()
                    .onChanged { value in
                        guard !locked else { return }
                        let nextScale = min(8, max(0.25, storedScale * value.magnification))
                        let ratio = nextScale / max(storedScale, 0.001)
                        // Keep the viewport center stable while zooming. The fitted origin
                        // itself follows H5's explicit top-left transform model.
                        origin = CGPoint(
                            x: viewportCenter.x - (viewportCenter.x - storedOrigin.x) * ratio,
                            y: viewportCenter.y - (viewportCenter.y - storedOrigin.y) * ratio
                        )
                        scale = nextScale
                    }
                    .onEnded { _ in
                        storedScale = scale
                        storedOrigin = origin
                    }
            )
            .simultaneousGesture(
                DragGesture(minimumDistance: 4, coordinateSpace: .local)
                    .onChanged { value in
                        guard !locked, !markMode else { return }
                        origin = CGPoint(
                            x: storedOrigin.x + value.translation.width,
                            y: storedOrigin.y + value.translation.height
                        )
                    }
                    .onEnded { _ in
                        guard !locked, !markMode else { return }
                        storedOrigin = origin
                    }
            )
            .simultaneousGesture(
                SpatialTapGesture()
                    .onEnded { value in
                        guard !locked else { return }
                        if let index = cellIndex(at: value.location, artboardSize: artboardSize) {
                            onCellTap(index)
                        }
                    }
            )
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("拼豆工作画布，\(canvas.columns) 列 \(canvas.rows) 行")
    }

    private func fit(to viewport: CGSize, artboardSize: CGSize) {
        guard let fitted = calculateBeadingViewportFit(viewportSize: viewport, artboardSize: artboardSize) else { return }
        scale = fitted.scale
        storedScale = fitted.scale
        rulerBaselineScale = fitted.scale
        origin = CGPoint(x: fitted.x, y: fitted.y)
        storedOrigin = origin
    }

    private func cellIndex(at point: CGPoint, artboardSize: CGSize) -> Int? {
        let localX = (point.x - origin.x) / max(scale, 0.001)
        let localY = (point.y - origin.y) / max(scale, 0.001)
        guard localX >= 0, localY >= 0, localX < artboardSize.width, localY < artboardSize.height else { return nil }
        let col = Int(localX / naturalCellSize)
        let row = Int(localY / naturalCellSize)
        let index = row * canvas.columns + col
        return canvas.cells.indices.contains(index) ? index : nil
    }

    private func drawCanvas(context: inout GraphicsContext) {
        let visibleCode = highlightedColorCode
        let showCodes = codesVisible && naturalCellSize * scale >= 9
        let lineColor = Color.black.opacity(0.16)

        for cell in canvas.cells {
            let col = cell.id % canvas.columns
            let row = cell.id / canvas.columns
            let rect = CGRect(
                x: CGFloat(col) * naturalCellSize,
                y: CGFloat(row) * naturalCellSize,
                width: naturalCellSize,
                height: naturalCellSize
            )
            let isEmpty = cell.color == Palette.empty
            let matches = visibleCode == nil || cell.color.code == visibleCode
            if !isEmpty {
                context.fill(Path(rect), with: .color(cell.color.swiftUIColor.opacity(matches ? 1 : 0.16)))
            } else {
                context.fill(Path(rect), with: .color(Color.white.opacity(matches ? 1 : 0.16)))
            }

            if gridVisible {
                context.stroke(Path(rect), with: .color(lineColor), lineWidth: 0.35)
            }

            if markedIndexes.contains(cell.id) {
                context.stroke(Path(rect.insetBy(dx: 1, dy: 1)), with: .color(AppTokens.flowBrand), lineWidth: 2.2)
                let mark = Text("✓").font(.system(size: 10, weight: .black)).foregroundStyle(Color.white)
                context.draw(mark, at: CGPoint(x: rect.midX, y: rect.midY), anchor: .center)
            } else if showCodes && !isEmpty {
                let value = Int(cell.color.hex, radix: 16) ?? 0
                let red = Double((value >> 16) & 0xff)
                let green = Double((value >> 8) & 0xff)
                let blue = Double(value & 0xff)
                let textColor: Color = (red * 0.299 + green * 0.587 + blue * 0.114) > 155 ? Color(hex: "1E3048") : .white
                let text = Text(cell.color.code)
                    .font(.system(size: 6.8, weight: .bold, design: .rounded))
                    .foregroundStyle(textColor.opacity(matches ? 0.92 : 0.30))
                context.draw(text, at: CGPoint(x: rect.midX, y: rect.midY), anchor: .center)
            }
        }
    }
}

private struct BeadingStaticRulers: View {
    let rows: Int
    let columns: Int
    let cellSize: CGFloat

    private func ticks(_ size: Int) -> [Int] {
        guard size > 0 else { return [] }
        return Array(stride(from: 1, through: size, by: 5))
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            ForEach(ticks(columns), id: \.self) { tick in
                Text("\(tick)")
                    .font(.system(size: 7, weight: .bold, design: .monospaced))
                    .foregroundStyle(Color(hex: "65727D"))
                    .frame(minWidth: 14, minHeight: 13)
                    .background(Color(hex: "F5F9FB").opacity(0.78))
                    .clipShape(RoundedRectangle(cornerRadius: 4))
                    .position(x: (CGFloat(tick) - 0.5) * cellSize, y: -7)
            }
            ForEach(ticks(rows), id: \.self) { tick in
                Text("\(tick)")
                    .font(.system(size: 7, weight: .bold, design: .monospaced))
                    .foregroundStyle(Color(hex: "65727D"))
                    .frame(minWidth: 14, minHeight: 13)
                    .background(Color(hex: "F5F9FB").opacity(0.78))
                    .clipShape(RoundedRectangle(cornerRadius: 4))
                    .position(x: -8, y: (CGFloat(tick) - 0.5) * cellSize)
            }
        }
        .frame(width: CGFloat(max(1, columns)) * cellSize, height: CGFloat(max(1, rows)) * cellSize)
    }
}

struct BeadingToolDraft: Equatable {
    let markedCellIndexes: Set<Int>
    let highlightedColorCode: String?
    let highlightEnabled: Bool
    let codesVisible: Bool
    let gridVisible: Bool
    let canvasLocked: Bool
    let colorSortMode: BeadingColorSortMode

    init(markedCellIndexes: Set<Int> = [], highlightedColorCode: String? = nil, highlightEnabled: Bool = true, codesVisible: Bool = true, gridVisible: Bool = true, canvasLocked: Bool = false, colorSortMode: BeadingColorSortMode = .remaining) {
        self.markedCellIndexes = markedCellIndexes
        self.highlightedColorCode = highlightedColorCode
        self.highlightEnabled = highlightEnabled
        self.codesVisible = codesVisible
        self.gridVisible = gridVisible
        self.canvasLocked = canvasLocked
        self.colorSortMode = colorSortMode
    }
}

enum BeadingDraftStore {
    private struct Draft: Codable {
        let markedCellIndexes: [Int]
        let highlightedColorCode: String?
        let highlightEnabled: Bool?
        let codesVisible: Bool?
        let gridVisible: Bool?
        let canvasLocked: Bool?
        let colorSortMode: String?
    }
    static func key(ownerID: String, sessionID: String) -> String { "qiaoqiaole.beading-draft:\(ownerID):\(sessionID)" }
    static func read(ownerID: String, sessionID: String, defaults: UserDefaults = .standard) -> BeadingToolDraft {
        guard let data = defaults.data(forKey: key(ownerID: ownerID, sessionID: sessionID)), let draft = try? JSONDecoder().decode(Draft.self, from: data) else { return BeadingToolDraft() }
        return BeadingToolDraft(markedCellIndexes: Set(draft.markedCellIndexes.filter { $0 >= 0 }), highlightedColorCode: draft.highlightedColorCode, highlightEnabled: draft.highlightEnabled ?? true, codesVisible: draft.codesVisible ?? true, gridVisible: draft.gridVisible ?? true, canvasLocked: draft.canvasLocked ?? false, colorSortMode: BeadingColorSortMode(rawValue: draft.colorSortMode ?? "") ?? .remaining)
    }
    static func write(_ value: BeadingToolDraft, ownerID: String, sessionID: String, defaults: UserDefaults = .standard) {
        let draft = Draft(markedCellIndexes: value.markedCellIndexes.sorted(), highlightedColorCode: value.highlightedColorCode, highlightEnabled: value.highlightEnabled, codesVisible: value.codesVisible, gridVisible: value.gridVisible, canvasLocked: value.canvasLocked, colorSortMode: value.colorSortMode.rawValue)
        if let data = try? JSONEncoder().encode(draft) { defaults.set(data, forKey: key(ownerID: ownerID, sessionID: sessionID)) }
    }
}

private struct BeadingColorSearchSheet: View {
    @Binding var query: String
    let requirements: [BeadingRequirement]
    let completedColorCodes: [String]
    let color: (String) -> Color
    let onSelect: (String) -> Void
    let onClose: () -> Void

    private var matchingRequirements: [BeadingRequirement] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return requirements }
        return requirements.filter { $0.colorCode.localizedCaseInsensitiveContains(trimmed) }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    TextField("输入色号，如 H7", text: $query)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .accessibilityLabel("搜索色号")
                } header: {
                    Text("搜色")
                } footer: {
                    Text("选择色号后，画布会高亮对应格子。")
                }

                Section("搜索结果") {
                    if matchingRequirements.isEmpty {
                        ContentUnavailableView("未找到色号", systemImage: "magnifyingglass", description: Text("请检查输入的色号。"))
                    } else {
                        ForEach(matchingRequirements) { item in
                            Button { onSelect(item.colorCode) } label: {
                                HStack(spacing: 12) {
                                    Circle().fill(color(item.colorCode)).frame(width: 28, height: 28).overlay(Circle().stroke(Color.black.opacity(0.12)))
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(item.colorCode).font(.headline).foregroundStyle(AppTokens.flowText)
                                        Text("需要 \(item.required) 颗").font(.subheadline).foregroundStyle(AppTokens.muted)
                                    }
                                    Spacer()
                                    if completedColorCodes.contains(item.colorCode) {
                                        Label("已完成", systemImage: "checkmark.circle.fill").font(.caption.weight(.semibold)).foregroundStyle(AppTokens.flowBrand)
                                    } else {
                                        Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(AppTokens.muted)
                                    }
                                }
                            }
                            .accessibilityLabel("选择搜索结果色号 \(item.colorCode)，需要 \(item.required) 颗\(completedColorCodes.contains(item.colorCode) ? "，已完成" : "")")
                            .accessibilityIdentifier("beading-search-result-\(item.colorCode)")
                        }
                    }
                }
            }
            .navigationTitle("搜索色号")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("关闭", action: onClose).accessibilityLabel("关闭搜索色号")
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}

private struct BeadingMoreToolsSheet: View {
    @Binding var codesVisible: Bool
    @Binding var gridVisible: Bool
    let hasMarks: Bool
    let onClearMarks: () -> Void
    let onReset: () -> Void
    let onClose: () -> Void

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 14) {
                Text("更多工具").font(.title2.bold()).foregroundStyle(AppTokens.flowText)
                Toggle("显示色号", isOn: $codesVisible).accessibilityLabel("显示色号")
                Toggle("显示网格", isOn: $gridVisible).accessibilityLabel("显示网格")
                Divider()
                Button("清除标记", role: .destructive, action: onClearMarks).disabled(!hasMarks).accessibilityLabel("清除标记")
                Button("重置工具", action: onReset).accessibilityLabel("重置工具")
                Spacer()
            }
            .padding(AppTokens.pagePadding)
            .navigationTitle("更多工具")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("关闭", action: onClose).accessibilityLabel("关闭更多工具") } }
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }
}

private struct InventoryCheckSheetView: View {
    let check: InventoryCheck
    @Binding var selectedWarehouseID: String?
    let warehouses: [WarehouseSummary]
    let onWarehouseChange: (String?) async -> Void
    let onClose: () -> Void
    let onStart: () async -> Void
    @State private var changingWarehouse = false
    @State private var starting = false

    private var requiredTotal: Int { check.items.reduce(0) { $0 + $1.required } }
    private var availableTotal: Int { check.items.reduce(0) { $0 + min($1.available, $1.required) } }

    var body: some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(Color(hex: "CBD5E1"))
                .frame(width: 36, height: 4)
                .padding(.top, 12)
                .padding(.bottom, 14)

            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("开始拼豆前")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Color(hex: "6B7F9C"))
                    Text("检测豆子库存")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(Color(hex: "1E3048"))
                }
                Spacer()
                Button(action: onClose) {
                    H5Icon(name: "lucide-x", size: 20)
                        .frame(width: 44, height: 44)
                        .background(Color(hex: "F3F6FB"))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color(hex: "64748B"))
                .disabled(changingWarehouse || starting)
                .accessibilityLabel("关闭库存检测")
            }
            .padding(.horizontal, 18)

            HStack(spacing: 12) {
                Text("选择仓库")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Color(hex: "52657F"))
                Spacer()
                Picker("选择仓库", selection: $selectedWarehouseID) {
                    if warehouses.isEmpty { Text("不使用仓库").tag(String?.none) }
                    ForEach(warehouses) { warehouse in
                        Text(warehouse.name).tag(Optional(warehouse.id))
                    }
                }
                .pickerStyle(.menu)
                .disabled(changingWarehouse)
                .tint(Color(hex: "35506F"))
            }
            .padding(.horizontal, 18)
            .padding(.top, 12)
            .onChange(of: selectedWarehouseID) { _, value in
                guard !changingWarehouse else { return }
                changingWarehouse = true
                Task {
                    await onWarehouseChange(value)
                    changingWarehouse = false
                }
            }

            VStack(alignment: .leading, spacing: 5) {
                Text(check.summary.sufficient ? "库存充足，可以开始" : "有 \(check.summary.missingBeadCount) 颗豆子不足")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(check.summary.sufficient ? Color(hex: "20834C") : Color(hex: "A45B00"))
                Text("共需 \(requiredTotal) 颗 · 当前可用 \(availableTotal) 颗")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Color(hex: "70819B"))
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(check.summary.sufficient ? Color(hex: "EFFAF3") : Color(hex: "FFF7E8"))
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .padding(.horizontal, 18)
            .padding(.top, 14)

            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(check.items) { item in
                        HStack(spacing: 8) {
                            Text(item.colorCode)
                                .font(.system(size: 14, weight: .black))
                                .foregroundStyle(Color(hex: "17283F"))
                                .frame(width: 56, alignment: .leading)
                            Text("需要 \(item.required) 颗")
                                .font(.system(size: 14))
                                .foregroundStyle(Color(hex: "52657F"))
                            Spacer(minLength: 8)
                            Text(item.missing == 0 ? "库存 \(item.available)" : "缺 \(item.missing) 颗")
                                .font(.system(size: 14, weight: item.missing == 0 ? .medium : .bold))
                                .foregroundStyle(item.missing == 0 ? Color(hex: "258452") : Color(hex: "D95F42"))
                        }
                        .padding(.vertical, 12)
                        if item.id != check.items.last?.id {
                            Rectangle().fill(Color(hex: "EDF1F6")).frame(height: 1)
                        }
                    }
                }
                .padding(.horizontal, 18)
            }

            HStack(spacing: 10) {
                Button("返回", action: onClose)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Color(hex: "52657F"))
                    .frame(maxWidth: .infinity, minHeight: 46)
                    .background(Color(hex: "F7F9FC"))
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color(hex: "DCE4EF"), lineWidth: 1))
                Button(starting ? "正在开始…" : "仍然开始拼豆") {
                    starting = true
                    Task {
                        await onStart()
                        starting = false
                    }
                }
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 46)
                    .background(Color(hex: "246CF4"))
                    .clipShape(RoundedRectangle(cornerRadius: 14))
            }
            .buttonStyle(.plain)
            .disabled(changingWarehouse || starting)
            .padding(.horizontal, 18)
            .padding(.top, 12)
            .padding(.bottom, 18)
        }
        .background(Color.white)
        .presentationDetents([.fraction(0.72), .large])
        .presentationDragIndicator(.hidden)
        .presentationCornerRadius(24)
        .interactiveDismissDisabled(changingWarehouse || starting)
    }
}

private struct InventorySummaryView: View { let check: InventoryCheck; var body: some View { VStack(alignment: .leading, spacing: 6) { Text(check.summary.sufficient ? "库存充足" : "库存不足").font(.headline).foregroundStyle(check.summary.sufficient ? .green : .orange); Text(check.summary.sufficient ? "所选仓库可满足本次拼豆。" : "缺少 \(check.items.filter { $0.missing > 0 }.count) 色、\(check.summary.missingBeadCount) 颗；请补货或更换仓库。").font(.caption).foregroundStyle(AppTokens.muted); ForEach(check.items.filter { $0.missing > 0 }) { item in Text("\(item.colorCode)：缺 \(item.missing) 颗").font(.caption).foregroundStyle(.orange) } }.padding(12).frame(maxWidth: .infinity, alignment: .leading).background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner)) } }

private struct H5PageTopBar: View {
    let title: String
    let rightSymbol: String?
    let rightAccessibilityLabel: String?
    let onBack: () -> Void
    let onRight: (() -> Void)?

    init(
        title: String,
        rightSymbol: String? = nil,
        rightAccessibilityLabel: String? = nil,
        onBack: @escaping () -> Void,
        onRight: (() -> Void)? = nil
    ) {
        self.title = title
        self.rightSymbol = rightSymbol
        self.rightAccessibilityLabel = rightAccessibilityLabel
        self.onBack = onBack
        self.onRight = onRight
    }

    var body: some View {
        HStack(spacing: 0) {
            Button(action: onBack) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(Color(hex: "344054"))
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("返回上一页")

            Spacer(minLength: 0)
            Text(title)
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(AppTokens.flowText)
                .lineLimit(1)
            Spacer(minLength: 0)

            Group {
                if let rightSymbol, let onRight {
                    Button(action: onRight) {
                        Image(systemName: rightSymbol)
                            .font(.system(size: 18, weight: .medium))
                            .foregroundStyle(Color(hex: "344054"))
                            .frame(width: 44, height: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(rightAccessibilityLabel ?? title)
                } else {
                    Color.clear.frame(width: 44, height: 44)
                }
            }
        }
        .padding(.horizontal, 12)
        .frame(height: 58)
        .background(AppTokens.panel)
        .overlay(alignment: .bottom) { Rectangle().fill(AppTokens.flowLine).frame(height: 1) }
    }
}

private struct WarehousesVisualFixture {
    let warehouses: [WarehouseSummary]

    static let workspace = WarehousesVisualFixture(warehouses: [
        WarehouseSummary(id: "warehouse-fixture-1", name: "家用拼豆柜", remark: "常用色和补货清单", colorSystem: "MARD 221", createdAt: "2026-08-25", updatedAt: "2026-08-25", stockedColorCount: 68, totalWarehouseStock: 4_560),
        WarehouseSummary(id: "warehouse-fixture-2", name: "工作室库存", remark: nil, colorSystem: "MARD 221", createdAt: "2026-08-24", updatedAt: "2026-08-24", stockedColorCount: 124, totalWarehouseStock: 12_840)
    ])
}

private struct WarehouseListView: View {
    @EnvironmentObject private var router: AppRouter
    @ObservedObject var session: AppSession
    let fixture: WarehousesVisualFixture?
    @State private var warehouses: [WarehouseSummary] = []
    @State private var isLoading = false
    @State private var error: String?
    @State private var requestID = UUID()
    @State private var showingCreate = false

    init(session: AppSession, fixture: WarehousesVisualFixture? = nil) {
        self.session = session
        self.fixture = fixture
        _warehouses = State(initialValue: fixture?.warehouses ?? [])
    }

    var body: some View {
        VStack(spacing: 0) {
            H5PageTopBar(
                title: "豆子仓库",
                rightSymbol: "arrow.clockwise",
                rightAccessibilityLabel: "刷新仓库列表",
                onBack: { if !router.path.isEmpty { router.path.removeLast() } },
                onRight: { Task { await load() } }
            )
            Group {
                if isLoading && warehouses.isEmpty { ProgressView("正在读取仓库…").frame(maxWidth: .infinity, maxHeight: .infinity) }
                else { warehouseContent(error: error) }
            }
        }
        .background(AppTokens.flowBackground)
        .toolbar(.hidden, for: .navigationBar)
        .task(id: router.warehouseRevision) { if fixture == nil { await load() } }
        .sheet(isPresented: $showingCreate) { WarehouseCreateSheet(session: session, onCreated: { warehouse in warehouses.insert(WarehouseSummary(id: warehouse.id, name: warehouse.name, remark: warehouse.remark, colorSystem: warehouse.colorSystem, createdAt: warehouse.createdAt, updatedAt: warehouse.updatedAt, stockedColorCount: 0, totalWarehouseStock: 0), at: 0); showingCreate = false }) }
    }

    @ViewBuilder
    private func warehouseContent(error: String?) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("我的仓库").font(.title3.weight(.bold)).foregroundStyle(AppTokens.flowText)
                        Text("选择一个仓库管理拼豆库存").font(.subheadline).foregroundStyle(AppTokens.muted)
                    }
                    Spacer()
                    if !warehouses.isEmpty {
                        Button { showingCreate = true } label: { Label("新建", systemImage: "plus").font(.subheadline.weight(.semibold)) }
                            .buttonStyle(.borderedProminent).tint(AppTokens.flowBrand).accessibilityLabel("新建豆子仓库")
                    }
                }
                .padding(18).background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: AppTokens.cardCorner))
                if let error {
                    VStack(spacing: 10) { Text("仓库读取失败").font(.headline); Text(error).font(.caption).foregroundStyle(AppTokens.muted); Button("重新加载") { Task { await load() } }.buttonStyle(.bordered) }
                        .frame(maxWidth: .infinity).padding(28).background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: AppTokens.cardCorner))
                } else if warehouses.isEmpty {
                    VStack(spacing: 10) {
                        Image(systemName: "shippingbox.fill").font(.system(size: 38)).foregroundStyle(AppTokens.flowBrand)
                        Text("还没有豆子仓库").font(.headline)
                        Text("先创建一个仓库，之后就可以按色号管理库存和出入库记录。")
                            .font(.subheadline).foregroundStyle(AppTokens.muted).multilineTextAlignment(.center)
                        Button { showingCreate = true } label: { Label("新建豆子仓库", systemImage: "plus") }.buttonStyle(.borderedProminent).tint(AppTokens.flowBrand)
                    }
                    .frame(maxWidth: .infinity).padding(30).background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: AppTokens.cardCorner))
                } else {
                    VStack(spacing: 10) {
                        ForEach(warehouses) { warehouse in WarehouseListCard(warehouse: warehouse, onOpen: { router.navigate(to: .warehouseDetail(warehouse.id)) }, onDelete: { router.overlay = .deleteWarehouse(warehouse) }) }
                    }
                }
            }
            .padding(AppTokens.pagePadding).padding(.bottom, 32).frame(maxWidth: 548).frame(maxWidth: .infinity)
        }
        .background(AppTokens.flowBackground)
    }

    private func load() async {
        guard let token = session.token else { return }
        let id = UUID(); requestID = id; isLoading = true; error = nil
        defer { if requestID == id { isLoading = false } }
        do { let value = try await session.projects.warehouses(token: token); guard requestID == id else { return }; warehouses = value }
        catch { guard requestID == id else { return }; self.error = error.localizedDescription }
    }
}

private struct WarehouseListCard: View {
    let warehouse: WarehouseSummary
    let onOpen: () -> Void
    let onDelete: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onOpen) {
                HStack(spacing: 13) {
                    Image(systemName: "shippingbox.fill").font(.title3).foregroundStyle(AppTokens.flowBrand).frame(width: 42, height: 42).background(AppTokens.flowBrandSoft).clipShape(RoundedRectangle(cornerRadius: 12))
                    VStack(alignment: .leading, spacing: 5) {
                        Text(warehouse.name).font(.body.weight(.semibold)).foregroundStyle(AppTokens.flowText).lineLimit(1)
                        Text(warehouse.remark?.isEmpty == false ? warehouse.remark! : "MARD 221 色库存").font(.caption).foregroundStyle(AppTokens.muted).lineLimit(1)
                        HStack(spacing: 8) { Text("\(warehouse.stockedColorCount) 色在库"); Text("\(warehouse.totalWarehouseStock.formatted()) 颗") }.font(.caption.weight(.medium)).foregroundStyle(AppTokens.muted)
                    }
                    Spacer(minLength: 4)
                    Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(AppTokens.muted)
                }
            }
            .buttonStyle(.plain).accessibilityLabel("打开仓库 \(warehouse.name)，\(warehouse.stockedColorCount) 色在库")
            Button(action: onDelete) { Image(systemName: "trash").font(.subheadline.weight(.semibold)).frame(width: 34, height: 34) }
                .buttonStyle(.plain).foregroundStyle(.red).background(Color.red.opacity(0.08)).clipShape(Circle()).accessibilityLabel("删除仓库 \(warehouse.name)")
        }
        .padding(14).background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: AppTokens.cardCorner))
    }
}

private struct WarehouseCreateSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var session: AppSession
    let onCreated: (WarehouseCreated) -> Void
    @State private var name = ""
    @State private var remark = ""
    @State private var isSubmitting = false
    @State private var error: String?

    var body: some View {
        NavigationStack { Form {
            Section("仓库信息") { TextField("仓库名称", text: $name).accessibilityLabel("仓库名称"); TextField("备注（可选）", text: $remark, axis: .vertical).lineLimit(1...3).accessibilityLabel("仓库备注") }
            if let error { Text(error).foregroundStyle(.red) }
        }.navigationTitle("新建豆子仓库").toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() }.disabled(isSubmitting) }; ToolbarItem(placement: .confirmationAction) { Button(isSubmitting ? "创建中…" : "创建") { Task { await create() } }.disabled(isSubmitting || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) } } }
    }
    private func create() async {
        guard let token = session.token else { error = "请先登录"; return }
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanName.isEmpty, cleanName.count <= 40 else { error = "仓库名称需为 1–40 个字符"; return }
        isSubmitting = true; error = nil; defer { isSubmitting = false }
        do { onCreated(try await session.projects.createWarehouse(name: cleanName, remark: remark.trimmingCharacters(in: .whitespacesAndNewlines), token: token)) }
        catch { self.error = error.localizedDescription }
    }
}

private struct WarehouseDetailVisualFixture {
    let warehouse: WarehouseSummary
    let inventory: [String: Int]
    let transactions: [WarehouseTransaction]

    static let workspace = WarehouseDetailVisualFixture(
        warehouse: WarehouseSummary(id: "warehouse-detail-fixture", name: "家用拼豆柜", remark: "常用色和补货清单", colorSystem: "MARD_221", createdAt: "2026-08-25", updatedAt: "2026-08-25", stockedColorCount: 4, totalWarehouseStock: 455),
        inventory: ["A1": 120, "A2": 80, "B1": 140, "M15": 115],
        transactions: [WarehouseTransaction(id: "warehouse-record-1", colorCode: "A1", type: "in", quantity: 120, inputUnit: "count", inputValue: 120, source: "manual", projectId: nil, beadingSessionId: nil, projectName: nil, createdAt: "2026-08-25T08:00:00Z")]
    )
}

private struct WarehouseDetailView: View {
    @ObservedObject var session: AppSession
    let warehouseID: String
    let fixture: WarehouseDetailVisualFixture?
    @State private var inventory: [String: Int] = [:]
    @State private var transactions: [WarehouseTransaction] = []
    @State private var warehouse: WarehouseSummary?
    @State private var selectedCodes = Set<String>()
    @State private var query = ""
    @State private var selectedLetter = "全部"
    @State private var amountText = "1"
    @State private var unit: WarehouseInventoryMutation.Unit = .count
    @State private var isLoading = false
    @State private var isSubmitting = false
    @State private var error: String?
    @State private var requestID = UUID()

    init(session: AppSession, warehouseID: String, fixture: WarehouseDetailVisualFixture? = nil) {
        self.session = session
        self.warehouseID = warehouseID
        self.fixture = fixture
        _inventory = State(initialValue: fixture?.inventory ?? [:])
        _transactions = State(initialValue: fixture?.transactions ?? [])
        _warehouse = State(initialValue: fixture?.warehouse)
        _isLoading = State(initialValue: fixture == nil)
    }

    private var warehouseLetters: [String] { ["全部"] + Array(Set(Mard221Palette.colors.compactMap { $0.code.first.map(String.init) })).sorted() }
    private var colors: [ColorToken] { Mard221Palette.colors.filter { color in
        let matchesLetter = selectedLetter == "全部" || color.code.hasPrefix(selectedLetter)
        let matchesQuery = query.isEmpty || color.code.localizedCaseInsensitiveContains(query) || color.hex.localizedCaseInsensitiveContains(query.replacingOccurrences(of: "#", with: ""))
        return matchesLetter && matchesQuery
    } }
    private var total: Int { inventory.values.reduce(0, +) }
    private static let beadsPerGram = 15.0

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 0) {
                    WarehouseStat(value: total.formatted(), title: "总库存颗")
                    Divider().frame(height: 48)
                    WarehouseStat(value: inventory.values.filter { $0 > 0 }.count.formatted(), title: "有库存色")
                    Divider().frame(height: 48)
                    WarehouseStat(value: (Mard221Palette.colors.count - inventory.values.filter { $0 > 0 }.count).formatted(), title: "缺货色", isWarning: true)
                }
                .padding(.vertical, 10)
                .background(AppTokens.panel)
                .clipShape(RoundedRectangle(cornerRadius: AppTokens.cardCorner))
                .overlay(RoundedRectangle(cornerRadius: AppTokens.cardCorner).stroke(AppTokens.flowLine, lineWidth: 1))

                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(AppTokens.flowMuted)
                    TextField("搜索色号…", text: $query)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .font(.subheadline)
                }
                .padding(.horizontal, 15)
                .frame(height: 46)
                .background(AppTokens.panel)
                .clipShape(RoundedRectangle(cornerRadius: AppTokens.cardCorner))
                .overlay(RoundedRectangle(cornerRadius: AppTokens.cardCorner).stroke(AppTokens.flowLine, lineWidth: 1))
                .accessibilityElement(children: .contain)
                .accessibilityLabel("搜索仓库色号")

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 9) {
                        ForEach(warehouseLetters, id: \.self) { letter in
                            Button(letter) { selectedLetter = letter }
                                .font(.subheadline.weight(selectedLetter == letter ? .semibold : .medium))
                                .frame(minWidth: letter == "全部" ? 58 : 40, minHeight: 38)
                                .background(selectedLetter == letter ? AppTokens.flowBrand : AppTokens.panel)
                                .foregroundStyle(selectedLetter == letter ? .white : AppTokens.flowText)
                                .clipShape(Capsule())
                                .overlay(Capsule().stroke(selectedLetter == letter ? .clear : AppTokens.flowLine, lineWidth: 1))
                                .accessibilityLabel("筛选色号字母\(letter)")
                                .accessibilityAddTraits(selectedLetter == letter ? .isSelected : [])
                        }
                    }
                }

                VStack(spacing: 0) {
                    HStack(spacing: 0) {
                        Text("已选 ").foregroundStyle(AppTokens.flowMuted) + Text("\(selectedCodes.count)").fontWeight(.bold) + Text(" 色").foregroundStyle(AppTokens.flowMuted)
                        Spacer(minLength: 8)
                        WarehouseSelectionButton(title: "全选") { selectedCodes.formUnion(colors.map(\.code)) }
                        Divider().frame(height: 22)
                        WarehouseSelectionButton(title: "反选") {
                            let visible = Set(colors.map(\.code))
                            selectedCodes = Set(Mard221Palette.colors.map(\.code).filter { visible.contains($0) ? !selectedCodes.contains($0) : selectedCodes.contains($0) })
                        }
                        Divider().frame(height: 22)
                        WarehouseSelectionButton(title: "清除") { selectedCodes.removeAll() }
                    }
                    .font(.subheadline.weight(.medium))
                    .padding(.horizontal, 14)
                    .frame(minHeight: 48)

                    Divider()

                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 6), spacing: 13) {
                        ForEach(colors, id: \.self) { color in
                            WarehouseColorCard(
                                color: color,
                                stock: inventory[color.code, default: 0],
                                isSelected: selectedCodes.contains(color.code)
                            ) {
                                if selectedCodes.contains(color.code) { selectedCodes.remove(color.code) }
                                else { selectedCodes.insert(color.code) }
                            }
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 16)
                }
                .background(AppTokens.panel)
                .clipShape(RoundedRectangle(cornerRadius: AppTokens.cardCorner))
                .overlay(RoundedRectangle(cornerRadius: AppTokens.cardCorner).stroke(AppTokens.flowLine, lineWidth: 1))

                if !transactions.isEmpty {
                    InventoryHistoryCard(transactions: Array(transactions.prefix(8)))
                }
            }
            .frame(maxWidth: AppTokens.flowContentMax)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, AppTokens.pagePadding)
            .padding(.top, 14)
            .padding(.bottom, 24)
        }
        .safeAreaInset(edge: .bottom) { actionBar }
        .background(AppTokens.flowBackground).navigationTitle(warehouse?.name ?? "豆子仓库").navigationBarTitleDisplayMode(.inline)
        .toolbar { if let warehouse { ToolbarItem(placement: .topBarTrailing) { VStack(spacing: 0) { Text("\(warehouse.stockedColorCount)").font(.caption.weight(.bold)); Text("种在库").font(.caption2) }.foregroundStyle(AppTokens.muted).accessibilityLabel("\(warehouse.stockedColorCount) 种在库") } } }
        .task(id: warehouseID) { if fixture == nil { await load() } }
    }

    private var actionBar: some View {
        VStack(spacing: 9) {
            if let error { Text(error).font(.caption).foregroundStyle(.red).frame(maxWidth: .infinity, alignment: .leading) }
            HStack(spacing: 10) {
                Picker("库存单位", selection: $unit) { Text("按颗").tag(WarehouseInventoryMutation.Unit.count); Text("按克").tag(WarehouseInventoryMutation.Unit.gram) }
                    .pickerStyle(.segmented)
                TextField(unit == .gram ? "克数" : "颗数", text: $amountText)
                    .keyboardType(.decimalPad)
                    .frame(width: 74, height: 36)
                    .multilineTextAlignment(.center)
                    .background(AppTokens.flowBackground)
                    .clipShape(RoundedRectangle(cornerRadius: AppTokens.compactCorner))
                    .overlay(RoundedRectangle(cornerRadius: AppTokens.compactCorner).stroke(AppTokens.flowLine, lineWidth: 1))
                    .accessibilityLabel(unit == .gram ? "入出库克数" : "入出库颗数")
            }
            if unit == .gram { Text("1g ≈ 15 颗豆子；将按换算后的颗数入出库。 ").font(.caption).foregroundStyle(AppTokens.muted).frame(maxWidth: .infinity, alignment: .leading) }
            HStack(spacing: 10) {
                Text("已选 \(selectedCodes.count) 色").font(.subheadline.weight(.medium)).foregroundStyle(AppTokens.flowMuted)
                Spacer()
                Button("出库") { Task { await mutate(.out) } }
                    .font(.subheadline.weight(.semibold)).frame(width: 76, height: 40)
                    .foregroundStyle(Color.orange).background(Color.orange.opacity(0.1)).clipShape(RoundedRectangle(cornerRadius: 12))
                    .disabled(isLoading || isSubmitting || selectedCodes.isEmpty)
                Button("入库") { Task { await mutate(.in) } }
                    .font(.subheadline.weight(.semibold)).frame(width: 76, height: 40)
                    .foregroundStyle(.white).background(AppTokens.flowBrand).clipShape(RoundedRectangle(cornerRadius: 12))
                    .disabled(isLoading || isSubmitting || selectedCodes.isEmpty)
            }
        }
        .padding(.horizontal, AppTokens.pagePadding)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .background(AppTokens.panel)
        .clipShape(.rect(topLeadingRadius: AppTokens.cardCorner, topTrailingRadius: AppTokens.cardCorner))
        .shadow(color: AppTokens.flowCardShadow, radius: 14, y: -4)
    }

    private func load() async {
        guard let token = session.token else { return }; let id = UUID(); requestID = id; isLoading = true; error = nil
        defer { if requestID == id { isLoading = false } }
        do { async let value = session.projects.warehouseInventory(id: warehouseID, token: token); async let history = session.projects.warehouseTransactions(id: warehouseID, token: token); async let summaries = session.projects.warehouses(token: token); let (stock, records, availableWarehouses) = try await (value, history, summaries); guard requestID == id else { return }; inventory = stock; transactions = records.transactions; warehouse = availableWarehouses.first(where: { $0.id == warehouseID }) }
        catch { guard requestID == id else { return }; self.error = error.localizedDescription }
    }
    private func mutate(_ type: WarehouseInventoryMutation.Kind) async {
        guard let token = session.token, !selectedCodes.isEmpty else { return }
        let raw = Double(amountText.replacingOccurrences(of: ",", with: ".")) ?? 0
        guard raw > 0 else { error = "请输入有效的入库或出库数量"; return }
        let quantity = max(1, Int((unit == .gram ? raw * Self.beadsPerGram : raw).rounded()))
        isSubmitting = true; error = nil
        defer { isSubmitting = false }
        do { inventory = try await session.projects.mutateWarehouseInventory(id: warehouseID, codes: selectedCodes.sorted(), type: type, quantity: quantity, inputUnit: unit, inputValue: raw, token: token) }
        catch { self.error = error.localizedDescription }
    }
}

private struct WarehouseStat: View {
    let value: String
    let title: String
    var isWarning = false

    var body: some View {
        VStack(spacing: 5) {
            Text(value)
                .font(.title3.weight(.semibold))
                .foregroundStyle(isWarning ? Color.orange : Color(hex: "294267"))
            Text(title).font(.caption).foregroundStyle(AppTokens.flowMuted)
        }
        .frame(maxWidth: .infinity)
    }
}

private struct WarehouseSelectionButton: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(title, action: action)
            .font(.subheadline.weight(.medium))
            .foregroundStyle(AppTokens.flowBrand)
            .frame(minWidth: 50, minHeight: 36)
    }
}

private struct WarehouseColorCard: View {
    let color: ColorToken
    let stock: Int
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                RoundedRectangle(cornerRadius: 10)
                    .fill(color.swiftUIColor)
                    .aspectRatio(1, contentMode: .fit)
                    .opacity(stock > 0 ? 1 : 0.56)
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(isSelected ? AppTokens.flowBrand : Color.black.opacity(0.08), lineWidth: isSelected ? 2.5 : 1))
                    .overlay(alignment: .topTrailing) {
                        if isSelected {
                            Image(systemName: "checkmark")
                                .font(.system(size: 8, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(width: 18, height: 18)
                                .background(AppTokens.flowBrand)
                                .clipShape(Circle())
                                .overlay(Circle().stroke(.white, lineWidth: 1.5))
                                .offset(x: 5, y: -5)
                        }
                    }
                Text(color.code)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(AppTokens.flowText)
                    .lineLimit(1)
                Text(stock > 0 ? "\(stock)颗" : "—")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(stock > 0 ? AppTokens.flowMuted : Color.orange)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(color.code) 库存 \(stock) 颗")
    }
}

private struct InventoryHistoryCard: View {
    let transactions: [WarehouseTransaction]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("库存流水").font(.headline).foregroundStyle(AppTokens.flowText)
            ForEach(transactions) { item in
                HStack(spacing: 8) {
                    Text(item.type == "in" ? "入库" : "出库")
                        .foregroundStyle(item.type == "in" ? .green : .orange)
                        .font(.caption.weight(.semibold))
                    Text(item.colorCode).font(.caption.weight(.medium))
                    Spacer()
                    Text("\(item.type == "out" ? "−" : "+")\(item.quantity) 颗").font(.caption)
                    Text(item.createdAt.prefix(10)).font(.caption2).foregroundStyle(AppTokens.flowMuted)
                }
            }
        }
        .padding(16)
        .background(AppTokens.panel)
        .clipShape(RoundedRectangle(cornerRadius: AppTokens.cardCorner))
        .overlay(RoundedRectangle(cornerRadius: AppTokens.cardCorner).stroke(AppTokens.flowLine, lineWidth: 1))
    }
}

private struct ProjectEditorContainer: View {
    @EnvironmentObject private var router: AppRouter
    let projectID: String
    @ObservedObject var session: AppSession
    @ObservedObject var document: PatternDocument
    @State private var error: String?
    @State private var loading = true

    var body: some View {
        Group {
            if loading { ProgressView("正在加载作品…") }
            else if let error { ContentUnavailableView("作品无法打开", systemImage: "exclamationmark.triangle", description: Text(error)) }
            else { PatternEditorView(document: document, onRequestSave: { router.overlay = .saveProject }) }
        }
        .task(id: projectID) { await load() }
    }

    private func load() async {
        guard let token = session.token else { router.navigate(to: .projects); return }
        loading = true; error = nil
        do {
            let detail = try await session.projects.detail(id: projectID, token: token)
            guard document.loadProject(id: detail.id, name: detail.name, columns: detail.cols, rows: detail.rows, canvasData: detail.canvasData) else {
                error = "作品数据无效，无法安全打开。"; loading = false; return
            }
        } catch { self.error = error.localizedDescription }
        loading = false
    }
}

private struct ProjectsVisualFixture {
    let projects: [ProjectSummary]
    let folders: [ProjectFolder]
    static let workspace = ProjectsVisualFixture(
        projects: [
            ProjectSummary(id: "project-fixture-1", folderId: "folder-fixture-1", name: "草莓小熊", rows: 20, cols: 18, tone: "recent-bear", thumbnailImage: nil, sharedToCommunity: true, sharedAt: "2026-08-25", likesCount: 128, createdAt: "2026-08-25", updatedAt: "2026-08-25"),
            ProjectSummary(id: "project-fixture-2", folderId: "folder-fixture-1", name: "星空猫咪", rows: 18, cols: 18, tone: "recent-flower", thumbnailImage: nil, sharedToCommunity: false, sharedAt: nil, likesCount: 86, createdAt: "2026-08-24", updatedAt: "2026-08-24"),
            ProjectSummary(id: "project-fixture-3", folderId: nil, name: "向日葵花园", rows: 24, cols: 20, tone: "recent-flower", thumbnailImage: nil, sharedToCommunity: false, sharedAt: nil, likesCount: 64, createdAt: "2026-08-23", updatedAt: "2026-08-23")
        ], folders: [ProjectFolder(id: "folder-fixture-1", name: "我的收藏", projectCount: 2), ProjectFolder(id: "folder-fixture-2", name: "待完成", projectCount: 1)]
    )
}

private enum ProjectsContentTab: Hashable { case works, likes }

private struct ProjectsView: View {
    @EnvironmentObject private var router: AppRouter
    @ObservedObject var session: AppSession
    @ObservedObject var store: ProjectListStore
    let fixture: ProjectsVisualFixture?
    @State private var contentTab: ProjectsContentTab = .works
    @State private var likedProjects: [LikedProjectSummary] = []
    @State private var likedLoading = false
    @State private var likedError: String?
    @State private var likedHasMore = false
    @State private var likedPage = 1
    @State private var likedRequestID = UUID()
    @State private var receivedLikesCount = 0

    init(session: AppSession, store: ProjectListStore, fixture: ProjectsVisualFixture? = nil) { self.session = session; self.store = store; self.fixture = fixture }

    var body: some View {
        VStack(spacing: 0) {
            H5PageTopBar(
                title: "我的作品",
                onBack: { if !router.path.isEmpty { router.path.removeLast() } }
            )
            Group {
                if let fixture {
                    fixtureContent(fixture)
                } else if let token = session.token {
                    content(token: token)
                } else {
                    ContentUnavailableView("请先登录", systemImage: "person.crop.circle.badge.exclamationmark", description: Text("登录后可同步和管理你的作品。"))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
        }
        .background(AppTokens.flowBackground)
        .toolbar(.hidden, for: .navigationBar)
    }

    private func fixtureContent(_ fixture: ProjectsVisualFixture) -> some View {
        ScrollView { VStack(alignment: .leading, spacing: 15) {
            HStack(spacing: 12) { UserAvatarView(avatarURL: nil, size: 62, accessibilityLabel: "我的创作头像"); VStack(alignment: .leading, spacing: 5) { HStack(spacing: 6) { Text("我的创作").font(.title3.bold()); Text("作品").font(.caption2.weight(.semibold)).foregroundStyle(.white).padding(.horizontal, 6).padding(.vertical, 3).background(AppTokens.flowBrand).clipShape(Capsule()) }; Text("保存的拼豆图纸都会显示在这里").font(.caption).foregroundStyle(AppTokens.muted) }; Spacer(); Text("\(fixture.projects.count) 件").font(.subheadline.weight(.semibold)).foregroundStyle(AppTokens.muted) }.padding(16).background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: AppTokens.cardCorner))
            HStack(spacing: 0) { AuthorStat(value: "\(fixture.projects.count)", title: "作品"); AuthorStat(value: "278", title: "获赞"); AuthorStat(value: "0", title: "浏览") }.padding(.vertical, 14).background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: AppTokens.cardCorner))
            HStack { VStack(alignment: .leading, spacing: 6) { Text("作品").font(.headline).foregroundStyle(AppTokens.flowBrand); Capsule().fill(AppTokens.flowBrand).frame(width: 30, height: 3) }; Spacer(); Text("喜欢").font(.headline).foregroundStyle(AppTokens.muted) }
            HStack { Text("文件夹").font(.headline); Text("\(fixture.folders.count)").font(.caption.weight(.bold)).padding(5).background(AppTokens.soft).clipShape(Circle()); Spacer(); Button("新建") { router.overlay = .createProjectFolder }.buttonStyle(.bordered).controlSize(.small).accessibilityLabel("新建文件夹") }
            ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 10) { Text("全部  \(fixture.projects.count)").padding(.horizontal, 13).padding(.vertical, 9).background(AppTokens.flowBrand.opacity(0.12)).foregroundStyle(AppTokens.flowBrand).clipShape(RoundedRectangle(cornerRadius: 12)); ForEach(fixture.folders) { folder in Text("\(folder.name)  \(folder.projectCount)").padding(.horizontal, 13).padding(.vertical, 9).background(AppTokens.panel).foregroundStyle(AppTokens.flowText).clipShape(RoundedRectangle(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(AppTokens.line, lineWidth: 1)) } } }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3), spacing: 12) { ForEach(fixture.projects) { project in Button { router.navigate(to: .projectEdit(project.id)) } label: { ProjectVisualCard(project: project) }.buttonStyle(.plain).accessibilityLabel("打开作品\(project.name)") } }
        }.frame(maxWidth: 548).frame(maxWidth: .infinity).padding(AppTokens.pagePadding).padding(.bottom, 30) }.background(AppTokens.flowBackground)
    }

    @ViewBuilder
    private func content(token: String) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                VStack(spacing: 0) {
                    HStack(spacing: 12) {
                        UserAvatarView(avatarURL: nil, size: 62, accessibilityLabel: "我的创作头像")
                        VStack(alignment: .leading, spacing: 5) {
                            HStack(spacing: 6) {
                                Text("我的创作")
                                    .font(.system(size: 18, weight: .bold))
                                    .foregroundStyle(AppTokens.flowText)
                                Text("作品")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 7)
                                    .frame(height: 20)
                                    .background(AppTokens.flowBrand)
                                    .clipShape(Capsule())
                            }
                            Text("保存的拼豆图纸都会显示在这里")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(AppTokens.flowMuted)
                        }
                        Spacer()
                        Text("\(store.overallTotal) 件")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(AppTokens.flowMuted)
                    }
                    .padding(.horizontal, 13)
                    .padding(.vertical, 14)
                    .background(Color.white)

                    Rectangle().fill(Color(hex: "EDF1F6")).frame(height: 1)

                    HStack(spacing: 0) {
                        ProjectsStat(value: store.overallTotal, title: "作品")
                        ProjectsStatDivider()
                        ProjectsStat(value: receivedLikesCount, title: "获赞")
                        ProjectsStatDivider()
                        ProjectsStat(value: 0, title: "浏览")
                    }
                    .padding(.horizontal, 13)
                    .padding(.vertical, 14)
                    .background(Color.white)
                }
                .clipShape(RoundedRectangle(cornerRadius: 20))
                .overlay(RoundedRectangle(cornerRadius: 20).stroke(AppTokens.flowLine, lineWidth: 1))
                .shadow(color: Color(hex: "1B3D65").opacity(0.08), radius: 8, y: 4)
                .padding(.horizontal, 16)
                .padding(.top, 14)

                HStack(spacing: 0) {
                    projectTab(.works, title: "作品")
                    projectTab(.likes, title: "喜欢")
                }
                .frame(height: 45)
                .padding(.horizontal, 16)

                if contentTab == .works {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            HStack(spacing: 8) {
                                Text("文件夹").font(.system(size: 16, weight: .bold)).foregroundStyle(Color(hex: "344054"))
                                Text("\(store.folders.count)")
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundStyle(Color(hex: "667085"))
                                    .padding(.horizontal, 6)
                                    .frame(minWidth: 22, minHeight: 22)
                                    .background(Color(hex: "EDF1F7"))
                                    .clipShape(Capsule())
                            }
                            Spacer()
                            Button {
                                router.overlay = .createProjectFolder
                            } label: {
                                Label("新建", systemImage: "folder.badge.plus")
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundStyle(AppTokens.flowBrand)
                                    .padding(.horizontal, 11)
                                    .frame(minHeight: 36)
                                    .background(Color.white)
                                    .clipShape(RoundedRectangle(cornerRadius: 12))
                                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(AppTokens.flowBrand.opacity(0.38), lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                        }

                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 10) {
                                folderChip(id: "all", title: "全部", count: store.overallTotal, token: token)
                                ForEach(store.folders) { folder in
                                    folderChip(id: folder.id, title: folder.name, count: folder.projectCount, token: token)
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                }

                Group {
                    if contentTab == .works { worksContentH5(token: token) }
                    else { likedContentH5(token: token) }
                }
                .padding(.horizontal, 16)
                .padding(.top, 4)
                .padding(.bottom, 30)
            }
            .frame(maxWidth: 548)
            .frame(maxWidth: .infinity)
        }
        .background(AppTokens.flowBackground)
        .refreshable { if contentTab == .works { await store.load(repository: session.projects, token: token) } else { await loadLiked(token: token) } }
        .task(id: token) {
            async let list: Void = store.load(repository: session.projects, token: token)
            async let stats: Void = loadProjectProfileStats(token: token)
            _ = await (list, stats)
        }
        .onChange(of: contentTab) { _, tab in
            if tab == .likes, likedProjects.isEmpty, !likedLoading { Task { await loadLiked(token: token) } }
        }
    }

    private func projectTab(_ tab: ProjectsContentTab, title: String) -> some View {
        Button { contentTab = tab } label: {
            VStack(spacing: 5) {
                Spacer()
                Text(title)
                    .font(.system(size: 14, weight: contentTab == tab ? .bold : .semibold))
                    .foregroundStyle(contentTab == tab ? AppTokens.flowBrand : Color(hex: "667085"))
                Capsule()
                    .fill(contentTab == tab ? AppTokens.flowBrand : Color.clear)
                    .frame(width: 34, height: 3)
                Spacer().frame(height: 3)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .buttonStyle(.plain)
    }

    private func folderChip(id: String, title: String, count: Int, token: String) -> some View {
        let selected = store.selectedFolderID == id || (id == "all" && (store.selectedFolderID == nil || store.selectedFolderID == "all"))
        return Button {
            Task { await store.selectFolder(id, repository: session.projects, token: token) }
        } label: {
            HStack(spacing: 7) {
                Text(title).lineLimit(1)
                Text("\(count)")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(selected ? AppTokens.flowBrand : Color(hex: "738096"))
                    .padding(.horizontal, 5)
                    .frame(minHeight: 20)
                    .background(selected ? Color(hex: "DBE9FF") : Color(hex: "F1F3F7"))
                    .clipShape(Capsule())
            }
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(selected ? AppTokens.flowBrand : Color(hex: "526178"))
            .padding(.horizontal, 12)
            .frame(minHeight: 38)
            .background(selected ? Color(hex: "EDF4FF") : Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(selected ? Color(hex: "C8DAF9") : Color(hex: "E3E8F0"), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func worksContentH5(token: String) -> some View {
        if store.isLoading && store.projects.isEmpty {
            ProgressView("正在加载作品…").frame(maxWidth: .infinity).padding(.vertical, 48)
        } else if let error = store.error {
            H5InlineFailure(title: "作品读取失败", message: error) { Task { await store.load(repository: session.projects, token: token) } }
        } else if store.projects.isEmpty {
            VStack(spacing: 10) {
                Text(store.overallTotal > 0 ? "这个文件夹里还没有作品" : "还没有保存的作品")
                    .font(.system(size: 15, weight: .bold)).foregroundStyle(AppTokens.flowText)
                Text("保存作品后会显示在这里").font(.system(size: 12)).foregroundStyle(AppTokens.flowMuted)
            }
            .frame(maxWidth: .infinity, minHeight: 150)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 20))
        } else {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 7), count: 3), spacing: 8) {
                ForEach(store.projects) { project in
                    Button { router.overlay = .projectActions(project) } label: {
                        ProjectVisualCard(project: project)
                    }
                    .buttonStyle(.plain)
                    .contextMenu {
                        Button("移动到文件夹") { router.overlay = .moveProject(project) }
                        if project.sharedToCommunity { Button("编辑社区标签") { router.overlay = .editProjectTags(project) } }
                        else { Button("发布到社区") { router.overlay = .shareProject(project) } }
                        Button("删除作品", role: .destructive) { router.overlay = .deleteProject(project) }
                    }
                }
            }
            if store.hasMore {
                Button("加载更多") { Task { await store.load(repository: session.projects, token: token, reset: false) } }
                    .font(.system(size: 13, weight: .semibold)).foregroundStyle(AppTokens.flowBrand)
                    .frame(maxWidth: .infinity, minHeight: 42)
            }
        }
    }

    @ViewBuilder
    private func likedContentH5(token: String) -> some View {
        if likedLoading && likedProjects.isEmpty {
            ProgressView("正在加载喜欢的作品…").frame(maxWidth: .infinity).padding(.vertical, 48)
        } else if let likedError {
            H5InlineFailure(title: "喜欢的作品读取失败", message: likedError) { Task { await loadLiked(token: token) } }
        } else if likedProjects.isEmpty {
            VStack(spacing: 10) {
                Text("还没有喜欢的作品").font(.system(size: 15, weight: .bold)).foregroundStyle(AppTokens.flowText)
                Text("去发现页看看喜欢的作品吧").font(.system(size: 12)).foregroundStyle(AppTokens.flowMuted)
            }
            .frame(maxWidth: .infinity, minHeight: 150)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 20))
        } else {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 7), count: 3), spacing: 8) {
                ForEach(likedProjects) { project in
                    Button { router.navigate(to: .communityPost(project.id)) } label: {
                        LikedProjectVisualCard(project: project)
                    }
                    .buttonStyle(.plain)
                }
            }
            if likedHasMore {
                Button("加载更多喜欢的作品") { Task { await loadLiked(token: token, reset: false) } }
                    .font(.system(size: 13, weight: .semibold)).foregroundStyle(AppTokens.flowBrand)
                    .frame(maxWidth: .infinity, minHeight: 42)
            }
        }
    }

    private func loadProjectProfileStats(token: String) async {
        if let profile = try? await session.projects.accountProfile(token: token) {
            receivedLikesCount = profile.likesCount
        }
    }

    private func loadLiked(token: String, reset: Bool = true) async {
        let request = UUID(); likedRequestID = request; likedLoading = true; likedError = nil
        defer { if likedRequestID == request { likedLoading = false } }
        do { let page = try await session.projects.likedProjects(token: token, page: reset ? 1 : likedPage + 1); guard likedRequestID == request else { return }; likedProjects = reset ? page.projects : likedProjects + page.projects; likedPage = page.page; likedHasMore = page.hasMore }
        catch { guard likedRequestID == request else { return }; likedError = error.localizedDescription }
    }

    private func folderPicker(token: String) -> some View {
        Menu {
            Button("全部作品") { Task { await store.selectFolder("all", repository: session.projects, token: token) } }
            ForEach(store.folders) { folder in
                Button("\(folder.name)（\(folder.projectCount)）") { Task { await store.selectFolder(folder.id, repository: session.projects, token: token) } }
            }
            if let folder = store.folders.first(where: { $0.id == store.selectedFolderID }) {
                Divider()
                Button("重命名“\(folder.name)”") { router.overlay = .renameProjectFolder(folder) }
                Button("删除“\(folder.name)”", role: .destructive) { router.overlay = .deleteProjectFolder(folder) }
            }
        } label: {
            Label(currentFolderName, systemImage: "folder")
                .font(.subheadline.weight(.medium)).foregroundStyle(AppTokens.flowText)
                .padding(.horizontal, 12).padding(.vertical, 9).background(AppTokens.panel).clipShape(Capsule())
        }
    }

    private var currentFolderName: String {
        guard let id = store.selectedFolderID, id != "all" else { return "全部作品" }
        return store.folders.first(where: { $0.id == id })?.name ?? "全部作品"
    }
}

private struct ProjectsStat: View {
    let value: Int
    let title: String
    var body: some View {
        VStack(spacing: 5) {
            Text(value.formatted())
                .font(.system(size: 19, weight: .bold))
                .foregroundStyle(AppTokens.flowText)
            Text(title)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(AppTokens.flowMuted)
        }
        .frame(maxWidth: .infinity)
    }
}

private struct ProjectsStatDivider: View {
    var body: some View { Rectangle().fill(Color(hex: "EDF1F6")).frame(width: 1, height: 42) }
}

private struct H5InlineFailure: View {
    let title: String
    let message: String
    let retry: () -> Void
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 26, weight: .medium))
                .foregroundStyle(Color.orange)
            Text(title).font(.system(size: 15, weight: .bold)).foregroundStyle(AppTokens.flowText)
            Text(message).font(.system(size: 12)).foregroundStyle(AppTokens.flowMuted).multilineTextAlignment(.center)
            Button("重新加载", action: retry)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(AppTokens.flowBrand)
                .padding(.horizontal, 18)
                .frame(minHeight: 36)
                .background(AppTokens.flowBrandSoft)
                .clipShape(Capsule())
        }
        .frame(maxWidth: .infinity, minHeight: 160)
        .padding(18)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 20))
    }
}

private struct ProjectCard: View {
    let project: ProjectSummary
    let onOpen: () -> Void
    let onMove: () -> Void
    let onShare: () -> Void
    let onEditTags: () -> Void
    let onDelete: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 12).fill(AppTokens.soft)
                Image(systemName: "square.grid.3x3.fill").font(.title2).foregroundStyle(AppTokens.flowBrand.opacity(0.75))
            }.frame(maxWidth: .infinity).aspectRatio(1.25, contentMode: .fit)
            Text(project.name).lineLimit(1).font(.subheadline.weight(.semibold)).foregroundStyle(AppTokens.flowText)
            HStack {
                Text("\(project.cols) × \(project.rows) 格").lineLimit(1).font(.caption).foregroundStyle(AppTokens.muted)
                Spacer()
                Menu {
                    Button("打开编辑", action: onOpen)
                    Button("移动到文件夹", action: onMove)
                    if !project.sharedToCommunity { Button("发布到社区", action: onShare) }
                    else { Button("编辑社区标签", action: onEditTags) }
                    Button("删除作品", role: .destructive, action: onDelete)
                } label: { Image(systemName: "ellipsis.circle").font(.body).accessibilityLabel("作品操作") }
            }
        }.padding(10).background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner))
        .contentShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner)).onTapGesture(perform: onOpen)
    }
}

private struct ProjectVisualCard: View {
    let project: ProjectSummary
    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                Color(hex: "EDF5FF")
                if let url = AppAssetURL.url(for: project.thumbnailImage) {
                    AsyncImage(url: url) { phase in ThumbnailPhaseView(phase: phase) }
                } else {
                    Image(systemName: "square.grid.3x3.fill")
                        .font(.system(size: 22))
                        .foregroundStyle(AppTokens.flowBrand.opacity(0.60))
                }
            }
            .aspectRatio(1 / 0.92, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 5))
            .padding(7)
            .padding(.bottom, 0)

            Text(project.name.hasPrefix("wx") ? "未命名作品" : project.name)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Color(hex: "142647"))
                .lineLimit(1)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 7)
                .padding(.top, 3)
                .padding(.bottom, 7)
        }
        .frame(maxWidth: .infinity)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(hex: "E3EDFA"), lineWidth: 1))
        .shadow(color: Color(hex: "1B3D65").opacity(0.06), radius: 4, y: 2)
    }
}

private struct LikedProjectVisualCard: View {
    let project: LikedProjectSummary
    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                Color(hex: "EDF5FF")
                if let url = AppAssetURL.url(for: project.thumbnailImage) {
                    AsyncImage(url: url) { phase in ThumbnailPhaseView(phase: phase) }
                } else {
                    Image(systemName: "heart.fill")
                        .font(.system(size: 22))
                        .foregroundStyle(AppTokens.flowBrand.opacity(0.55))
                }
            }
            .aspectRatio(1 / 0.92, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 5))
            .padding(7)
            Text(project.name.hasPrefix("wx") ? "未命名作品" : project.name)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Color(hex: "142647"))
                .lineLimit(1)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 7)
                .padding(.bottom, 7)
        }
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(hex: "E3EDFA"), lineWidth: 1))
    }
}

private struct LikedProjectCard: View {
    let project: LikedProjectSummary
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack { RoundedRectangle(cornerRadius: 12).fill(Color(hex: "EDF5FF")); if let url = AppAssetURL.url(for: project.thumbnailImage) { AsyncImage(url: url) { phase in ThumbnailPhaseView(phase: phase) } } else { Image(systemName: "heart.fill").foregroundStyle(AppTokens.flowBrand.opacity(0.62)) } }
                .aspectRatio(CGFloat(max(1, project.cols)) / CGFloat(max(1, project.rows)), contentMode: .fit).clipShape(RoundedRectangle(cornerRadius: 12))
            Text(project.name).font(.subheadline.weight(.semibold)).foregroundStyle(AppTokens.flowText).lineLimit(1)
            HStack { Text("\(project.cols) × \(project.rows) 格").font(.caption2).foregroundStyle(AppTokens.muted); Spacer(); Label("\(project.likesCount)", systemImage: "heart").font(.caption2).foregroundStyle(AppTokens.muted) }
        }.padding(10).background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner))
    }
}

private struct HomeVisualFixture {
    let recentProjects: [ProjectSummary]
    let hotPosts: [CommunityPostSummary]

    static let workspace = HomeVisualFixture(
        recentProjects: [
            ProjectSummary(id: "home-project-1", folderId: nil, name: "草莓小熊", rows: 20, cols: 18, tone: "recent-bear", thumbnailImage: nil, sharedToCommunity: true, sharedAt: "2026-08-25", likesCount: 128, createdAt: "2026-08-25", updatedAt: "2026-08-25"),
            ProjectSummary(id: "home-project-2", folderId: nil, name: "星空猫咪", rows: 18, cols: 18, tone: "recent-flower", thumbnailImage: nil, sharedToCommunity: false, sharedAt: nil, likesCount: 86, createdAt: "2026-08-24", updatedAt: "2026-08-24")
        ],
        hotPosts: [
            CommunityPostSummary(id: "home-post-1", name: "樱桃蛋糕", rows: 20, cols: 18, tone: "recent-bear", thumbnailImage: nil, sharedAt: "2026-08-25", likesCount: 218, commentsCount: 12, authorId: "home-author-1", author: "草莓小熊", authorAvatar: nil, likedByMe: false, isFollowing: false, tags: ["可爱"]),
            CommunityPostSummary(id: "home-post-2", name: "星空猫咪", rows: 18, cols: 18, tone: "recent-flower", thumbnailImage: nil, sharedAt: "2026-08-24", likesCount: 164, commentsCount: 9, authorId: "home-author-2", author: "像素星球", authorAvatar: nil, likedByMe: false, isFollowing: false, tags: ["动物"])
        ]
    )
}

private struct HomeLandingView: View {
    @EnvironmentObject private var router: AppRouter
    @ObservedObject var session: AppSession
    @State private var recentProjects: [ProjectSummary] = []
    @State private var isLoadingRecents = false
    @State private var recentError: String?
    @State private var hotPosts: [CommunityPostSummary] = []
    @State private var isLoadingHotPosts = false
    @State private var hotPostsError: String?
    let fixture: HomeVisualFixture?

    init(session: AppSession, fixture: HomeVisualFixture? = nil) {
        self.session = session
        self.fixture = fixture
        _recentProjects = State(initialValue: fixture?.recentProjects ?? [])
        _hotPosts = State(initialValue: fixture?.hotPosts ?? [])
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HomeBrandHero(onUpload: { router.overlay = .createDrawing })
                VStack(alignment: .leading, spacing: 16) {
                    HomeSectionHeader(title: "最近项目", actionTitle: session.token == nil && fixture == nil ? nil : "全部") { router.navigate(to: .projects) }
                    recentContent
                    HomeSectionHeader(title: "热门图纸", actionTitle: "更多") { router.select(tab: .discover) }
                    hotPostsContent
                }
                .padding(.horizontal, AppTokens.pagePadding)
                .padding(.top, 95)
            }
            .frame(maxWidth: AppTokens.flowContentMax)
            .frame(maxWidth: .infinity)
            .padding(.bottom, 112)
        }
        .background(AppTokens.flowBackground)
        .navigationBarHidden(true)
        .ignoresSafeArea(edges: .top)
        .task(id: session.token) { if fixture == nil { await loadRecents() } }
        .task { if fixture == nil { await loadHotPosts() } }
    }

    @ViewBuilder
    private var recentContent: some View {
        if session.token == nil && fixture == nil {
            HomeRecentEmpty(title: "登录后查看最近项目", subtitle: "登录后会自动同步你的创作记录", actionTitle: "立即登录") { router.overlay = .login(returnTo: nil) }
        } else if isLoadingRecents {
            ProgressView("正在读取最近项目…").frame(maxWidth: .infinity).padding(.vertical, 38)
        } else if let recentError {
            HomeLoadFailure(message: recentError, onRetry: { Task { await loadRecents() } })
        } else if recentProjects.isEmpty {
            HomeRecentEmpty(title: "还没有最近项目", subtitle: "开始创作后，项目会显示在这里", actionTitle: nil, action: {})
        } else {
            HStack(alignment: .top, spacing: 10) {
                ForEach(recentProjects.prefix(4)) { project in
                    Button { router.overlay = .projectActions(project) } label: { RecentProjectCard(project: project) }
                        .buttonStyle(.plain).frame(maxWidth: .infinity)
                }
            }
        }
    }

    private func loadRecents() async {
        guard let token = session.token else { recentProjects = []; recentError = nil; return }
        isLoadingRecents = true
        recentError = nil
        defer { isLoadingRecents = false }
        do {
            recentProjects = try await session.projects.projects(token: token, page: 1, pageSize: 4).projects
        } catch {
            recentProjects = []
            recentError = error.localizedDescription
        }
    }

    @ViewBuilder
    private var hotPostsContent: some View {
        if isLoadingHotPosts { ProgressView("正在读取热门图纸…").frame(maxWidth: .infinity).padding(.vertical, 28) }
        else if let hotPostsError { HomeLoadFailure(message: hotPostsError, onRetry: { Task { await loadHotPosts() } }) }
        else if hotPosts.isEmpty { Text("还没有分享的作品").font(.subheadline).foregroundStyle(AppTokens.muted).frame(maxWidth: .infinity, alignment: .center).padding(.vertical, 30) }
        else {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], alignment: .center, spacing: 14) {
                ForEach(hotPosts) { post in
                    Button { router.navigate(to: .communityPost(post.id)) } label: { CommunityPostCard(post: post) }
                        .buttonStyle(.plain)
                }
            }
        }
    }

    private func loadHotPosts() async {
        isLoadingHotPosts = true
        hotPostsError = nil
        defer { isLoadingHotPosts = false }
        do {
            hotPosts = try await session.projects.communityPosts(token: session.token, pageSize: 6).posts
        } catch {
            hotPosts = []
            hotPostsError = error.localizedDescription
        }
    }
}

private struct HomeBrandHero: View {
    let onUpload: () -> Void
    var body: some View {
        ZStack(alignment: .bottom) {
            UnevenRoundedRectangle(bottomLeadingRadius: 30, bottomTrailingRadius: 30)
                .fill(LinearGradient(colors: [Color(hex: "051639"), Color(hex: "0E398A"), Color(hex: "092765")], startPoint: .topLeading, endPoint: .bottomTrailing))
            Circle().fill(RadialGradient(colors: [Color(hex: "58A0FF"), Color(hex: "1662D5")], center: .center, startRadius: 2, endRadius: 62))
                .frame(width: 124, height: 124).offset(x: 116, y: -19)
            Ellipse().stroke(Color(hex: "1D64DC"), lineWidth: 9).frame(width: 170, height: 42).rotationEffect(.degrees(-10)).offset(x: 118, y: -12)
            Circle().fill(.white.opacity(0.7)).frame(width: 4, height: 4).offset(x: 38, y: -97)
            Circle().fill(.white.opacity(0.45)).frame(width: 3, height: 3).offset(x: 138, y: -78)
            Image(systemName: "plus").font(.system(size: 34, weight: .light)).foregroundStyle(.white.opacity(0.75)).offset(x: 76, y: -68)
            VStack(alignment: .leading, spacing: 0) {
                Text("超级拼").font(.system(size: 34, weight: .black)).foregroundStyle(.white)
                Text("让拼豆创作更简单").font(.subheadline).foregroundStyle(.white.opacity(0.7)).padding(.top, 6)
                Spacer(minLength: 58)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, AppTokens.pagePadding).padding(.top, 92).padding(.bottom, 72)
            Button(action: onUpload) {
                HStack(spacing: 13) {
                    H5Icon(name: "lucide-image", size: 25).frame(width: 48, height: 48).background(.white.opacity(0.12)).clipShape(RoundedRectangle(cornerRadius: 14))
                    VStack(alignment: .leading, spacing: 5) {
                        Text("上传图片\n制作拼豆图纸").font(.headline.weight(.bold)).lineSpacing(2)
                        Text("支持 PNG / JPG / WebP").font(.footnote).foregroundStyle(.white.opacity(0.72))
                    }
                    Spacer(minLength: 0)
                    H5Icon(name: "lucide-arrow-right", size: 22).foregroundStyle(.white)
                }
                .foregroundStyle(.white).padding(15).background(LinearGradient(colors: [Color(hex: "2483FF"), AppTokens.flowBrand], startPoint: .topLeading, endPoint: .bottomTrailing)).clipShape(RoundedRectangle(cornerRadius: 18))
                .shadow(color: AppTokens.flowBrand.opacity(0.3), radius: 14, y: 8)
            }
            .buttonStyle(.plain).padding(.horizontal, AppTokens.pagePadding).offset(y: 38)
        }
        .frame(height: 250)
    }
}

private struct HomeSectionHeader: View {
    let title: String
    let actionTitle: String?
    let action: () -> Void
    var body: some View { HStack { Text(title).font(.headline.weight(.semibold)).foregroundStyle(AppTokens.flowText); Spacer(); if let actionTitle { Button(actionTitle, action: action).font(.subheadline.weight(.semibold)).foregroundStyle(AppTokens.muted).accessibilityLabel("查看全部\(title)") } } }
}

private struct HomeRecentEmpty: View {
    let title: String; let subtitle: String; let actionTitle: String?; let action: () -> Void
    var body: some View { VStack(spacing: 8) { Image(systemName: "folder.fill").font(.system(size: 34)).foregroundStyle(Color(hex: "8CAEFF")); Text(title).font(.subheadline.weight(.semibold)); Text(subtitle).font(.caption).foregroundStyle(AppTokens.muted); if let actionTitle { Button(actionTitle, action: action).buttonStyle(.borderedProminent).tint(AppTokens.flowBrand).padding(.top, 4) } }.frame(maxWidth: .infinity).padding(.vertical, 24).background(LinearGradient(colors: [Color.white, Color(hex: "F4F7FF")], startPoint: .topLeading, endPoint: .bottomTrailing)).clipShape(RoundedRectangle(cornerRadius: 18)) }
}

private struct HomeLoadFailure: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle").font(.title2).foregroundStyle(.orange)
            Text("内容读取失败").font(.subheadline.weight(.semibold)).foregroundStyle(AppTokens.flowText)
            Text(message).font(.caption).foregroundStyle(AppTokens.muted).multilineTextAlignment(.center)
            Button("重新加载", action: onRetry).buttonStyle(.bordered).tint(AppTokens.flowBrand).accessibilityLabel("重新加载首页内容")
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 22)
        .background(Color(hex: "FFF9F1"))
        .clipShape(RoundedRectangle(cornerRadius: 18))
    }
}

private struct RecentProjectCard: View {
    let project: ProjectSummary
    var body: some View { VStack(spacing: 6) { ZStack { RoundedRectangle(cornerRadius: 9).fill(Color(hex: "E9EEF5")); if let url = AppAssetURL.url(for: project.thumbnailImage) { AsyncImage(url: url) { phase in ThumbnailPhaseView(phase: phase) } } else { Image(systemName: "square.grid.3x3.fill").foregroundStyle(AppTokens.flowBrand.opacity(0.65)) } }.aspectRatio(3 / 4, contentMode: .fit).clipShape(RoundedRectangle(cornerRadius: 9)); Text("\(project.cols)×\(project.rows)").font(.caption2.weight(.bold)).foregroundStyle(AppTokens.flowText).lineLimit(1); Text(project.name).font(.caption2).foregroundStyle(AppTokens.muted).lineLimit(1) }.frame(maxWidth: .infinity) }
}

private struct CommunityPostCard: View {
    let post: CommunityPostSummary
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack {
                RoundedRectangle(cornerRadius: 13).fill(Color(hex: "EDF5FF"))
                if let url = AppAssetURL.url(for: post.thumbnailImage) {
                    AsyncImage(url: url) { phase in ThumbnailPhaseView(phase: phase) }
                } else {
                    Image(systemName: "square.grid.3x3.fill").font(.title).foregroundStyle(AppTokens.flowBrand.opacity(0.62))
                }
            }
            .aspectRatio(post.cols > 0 && post.rows > 0 ? CGFloat(post.cols) / CGFloat(post.rows) : 1, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 13))
            Text(post.name).font(.subheadline.weight(.semibold)).foregroundStyle(AppTokens.flowText).lineLimit(1)
            HStack(spacing: 5) {
                Text(post.author).lineLimit(1)
                Spacer(minLength: 2)
                Label("\(post.likesCount)", systemImage: "heart")
            }.font(.caption2).foregroundStyle(AppTokens.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("图纸 \(post.name)，作者 \(post.author)，\(post.likesCount) 个赞")
    }
}

private struct CommunityPostDetailVisualFixture {
    let post: CommunityPostDetail
    let comments: [CommunityComment]
    static let workspace = CommunityPostDetailVisualFixture(
        post: CommunityPostDetail(id: "community-detail-fixture", name: "星空小熊", rows: 20, cols: 18, tone: "recent-bear", sourceImage: nil, thumbnailImage: nil, beadList: [ProjectBeadCount(color: "H7", count: 603), ProjectBeadCount(color: "A1", count: 214)], sharedAt: "2026-08-25T09:30:00Z", authorId: "creator-fixture", author: "星空创作者", authorAvatar: nil, isFollowing: false, likesCount: 128, commentsCount: 1, likedByMe: false, tags: ["动物", "治愈"]),
        comments: [CommunityComment(id: "comment-fixture", projectId: "community-detail-fixture", content: "颜色搭配很好看！", parentId: nil, replyToUserId: nil, replyToUserName: nil, createdAt: "2026-08-25T10:00:00Z", authorId: "commenter-fixture", author: "拼豆小鹿", authorAvatar: nil, replies: [])]
    )
}

private struct CommunityPostDetailView: View {
    @EnvironmentObject private var router: AppRouter
    @ObservedObject var session: AppSession
    let postID: String
    let fixture: CommunityPostDetailVisualFixture?
    @State private var post: CommunityPostDetail?
    @State private var isLoading = true
    @State private var isLiking = false
    @State private var isCopying = false
    @State private var isTogglingFollow = false
    @State private var comments: [CommunityComment] = []
    @State private var commentText = ""
    @State private var replyTarget: CommunityComment?
    @State private var isLoadingComments = false
    @State private var isSubmittingComment = false
    @State private var commentsRequestID = UUID()
    @State private var error: String?
    @State private var requestID = UUID()

    init(session: AppSession, postID: String, fixture: CommunityPostDetailVisualFixture? = nil) {
        self.session = session
        self.postID = postID
        self.fixture = fixture
        _post = State(initialValue: fixture?.post)
        _isLoading = State(initialValue: fixture == nil)
        _comments = State(initialValue: fixture?.comments ?? [])
    }

    var body: some View {
        Group {
            if isLoading { ProgressView("正在读取图纸…") }
            else if let error { VStack(spacing: 12) { ContentUnavailableView("图纸无法打开", systemImage: "exclamationmark.triangle", description: Text(error)); Button("重新加载") { Task { await load() } }.buttonStyle(.bordered) } }
            else if let post { detail(post) }
            else { ContentUnavailableView("图纸不存在", systemImage: "square.grid.3x3") }
        }
        .background(Color(hex: "F8FBFF"))
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .tabBar)
        .task(id: "\(postID)-\(router.communityCommentRevision)") {
            guard fixture == nil else { return }
            await load()
            await loadComments()
        }
    }

    private func detail(_ post: CommunityPostDetail) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                ZStack {
                    Color(hex: "EDF5FF")
                    // Community thumbnails are generated from the pixel canvas;
                    // the original source photo is only a fallback. This keeps
                    // the detail hero consistent with the H5 pixel-effect view.
                    if let url = AppAssetURL.url(for: post.thumbnailImage ?? post.sourceImage) {
                        AsyncImage(url: url) { phase in ThumbnailPhaseView(phase: phase) }
                    } else {
                        Image(systemName: "square.grid.3x3.fill").font(.system(size: 46)).foregroundStyle(AppTokens.flowBrand.opacity(0.62))
                    }
                }
                .frame(maxWidth: .infinity)
                .aspectRatio(CGFloat(max(1, post.cols)) / CGFloat(max(1, post.rows)), contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner))
                .padding(10)
                .background(AppTokens.panel)
                .clipShape(RoundedRectangle(cornerRadius: AppTokens.cardCorner))
                .overlay(RoundedRectangle(cornerRadius: AppTokens.cardCorner).stroke(AppTokens.flowLine, lineWidth: 1))
                .shadow(color: AppTokens.flowCardShadow, radius: 12, y: 5)
                .accessibilityLabel("\(post.name)预览")

                VStack(alignment: .leading, spacing: 12) {
                    Text(post.name).font(.title2.weight(.bold)).foregroundStyle(AppTokens.flowText)
                    HStack(spacing: 12) {
                        Text("发布日期 \(CommunityPostPresentation.publicationTime(post.sharedAt ?? ""))")
                        Text("浏览次数 未统计")
                    }
                    .font(.caption).foregroundStyle(AppTokens.flowMuted)
                    if !post.tags.isEmpty { FlowReadOnlyTags(tags: post.tags) }
                    HStack(spacing: 10) {
                        CommunityDetailMetaCard(title: "图纸尺寸", value: CommunityPostPresentation.physicalSize(cols: post.cols, rows: post.rows), symbol: "ruler")
                        CommunityDetailMetaCard(title: "格数", value: "\(post.cols) × \(post.rows)", symbol: "square.grid.2x2")
                    }
                }
                .padding(16)
                .background(AppTokens.panel)
                .clipShape(RoundedRectangle(cornerRadius: AppTokens.cardCorner))
                .overlay(RoundedRectangle(cornerRadius: AppTokens.cardCorner).stroke(AppTokens.flowLine, lineWidth: 1))
                .shadow(color: AppTokens.flowCardShadow, radius: 10, y: 4)

                BeadSummaryCard(items: post.beadList)

                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 5) {
                        Text("评论").font(.headline).foregroundStyle(AppTokens.flowText)
                        Text("(\(post.commentsCount))").font(.subheadline).foregroundStyle(AppTokens.flowMuted)
                        Spacer()
                    }
                    if isLoadingComments {
                        ProgressView("评论加载中…").frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 8)
                    } else if comments.isEmpty {
                        Text("还没有评论，来留下第一条吧。").font(.footnote).foregroundStyle(AppTokens.flowMuted).padding(.vertical, 8)
                    } else {
                        VStack(spacing: 0) {
                            ForEach(comments) { comment in
                                CommentThreadView(comment: comment, currentUserID: session.user?.id, onReply: { replyTarget = $0 }, onDelete: requestCommentDeletion)
                                if comment.id != comments.last?.id { Divider().padding(.leading, 44) }
                            }
                        }
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 11) {
                            TextField(replyTarget == nil ? (session.token == nil ? "登录后参与评论" : "写下你的评论…") : "回复 @\(replyTarget?.author ?? "")…", text: $commentText)
                                .textInputAutocapitalization(.sentences)
                                .font(.system(size: 13))
                                .padding(.horizontal, 13)
                                .frame(height: 43)
                                .background(Color.white)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(hex: "DCE3EC"), lineWidth: 1))
                                .accessibilityLabel(replyTarget == nil ? "评论内容" : "回复内容")
                            Button(isSubmittingComment ? "发布中…" : "发布") { Task { await submitComment() } }
                                .font(.system(size: 13, weight: .bold)).foregroundStyle(.white)
                                .padding(.horizontal, 17)
                                .frame(minHeight: 43).background(Color(hex: "2F6CF6"))
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                                .disabled(commentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSubmittingComment)
                                .accessibilityLabel("发布评论")
                        }
                        if let replyTarget {
                            Button("取消回复") { self.replyTarget = nil }
                                .buttonStyle(.plain)
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(Color(hex: "4381D6"))
                                .accessibilityLabel("取消回复 \(replyTarget.author)")
                        }
                    }
                    .padding(.top, 4)
                }
                .padding(16)
                .background(AppTokens.panel)
                .clipShape(RoundedRectangle(cornerRadius: AppTokens.cardCorner))
                .overlay(RoundedRectangle(cornerRadius: AppTokens.cardCorner).stroke(AppTokens.flowLine, lineWidth: 1))
                .shadow(color: AppTokens.flowCardShadow, radius: 10, y: 4)
            }
            .frame(maxWidth: 390)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 0)
            .padding(.top, 12)
            .padding(.bottom, 92)
        }
        .safeAreaInset(edge: .top, spacing: 0) { detailHeader(post) }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            HStack(spacing: 10) {
                Button { Task { await toggleLike() } } label: {
                    HStack(spacing: 7) {
                        Image(systemName: post.likedByMe ? "heart.fill" : "heart")
                            .foregroundStyle(Color.red)
                        Text("\(post.likesCount)").font(.subheadline.weight(.semibold)).foregroundStyle(AppTokens.flowText)
                    }
                    .frame(minWidth: 92, minHeight: 44)
                    .background(AppTokens.panel)
                    .clipShape(Capsule())
                    .overlay(Capsule().stroke(Color(hex: "FFC2C2"), lineWidth: 1))
                }
                .buttonStyle(.plain).disabled(isLiking).accessibilityLabel(post.likedByMe ? "取消点赞" : "点赞")

                Button(isCopying ? "复制中…" : "复制到仓库") { Task { await copyToRepository() } }
                    .font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 44).background(AppTokens.flowBrand)
                    .clipShape(Capsule())
                    .disabled(isCopying).accessibilityLabel("复制到仓库")
            }
            .frame(maxWidth: 390)
            .padding(.horizontal, 0).padding(.vertical, 10)
            .frame(maxWidth: .infinity)
            .background(AppTokens.panel.opacity(0.98))
            .overlay(alignment: .top) { Divider().opacity(0.7) }
            .shadow(color: AppTokens.flowCardShadow, radius: 14, y: -4)
        }
    }

    private func detailHeader(_ post: CommunityPostDetail) -> some View {
        HStack(spacing: 9) {
            Button { if !router.path.isEmpty { router.path.removeLast() } } label: {
                Image(systemName: "chevron.left").font(.subheadline.weight(.bold)).foregroundStyle(AppTokens.flowText)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain).accessibilityLabel("返回发现")

            Button { router.navigate(to: .authorProfile(post.authorId)) } label: {
                HStack(spacing: 9) {
                    UserAvatarView(avatarURL: post.authorAvatar, size: 36, accessibilityLabel: post.author + "的头像")
                    VStack(alignment: .leading, spacing: 1) {
                        Text(post.author).font(.subheadline.weight(.semibold)).foregroundStyle(AppTokens.flowText).lineLimit(1)
                        Text("社区分享者").font(.caption2).foregroundStyle(AppTokens.flowMuted)
                    }
                }
            }
            .buttonStyle(.plain).accessibilityLabel("查看\(post.author)的作者主页")

            Spacer(minLength: 4)
            if post.authorId != session.user?.id {
                Button(post.isFollowing ? "已关注" : "关注") { Task { await toggleFollow() } }
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(post.isFollowing ? Color(hex: "8993A3") : .white)
                    .padding(.horizontal, 14).frame(minWidth: 68, minHeight: 30)
                    .background(post.isFollowing ? Color(hex: "EEF1F5") : AppTokens.flowBrand)
                    .clipShape(Capsule())
                    .overlay(Capsule().stroke(post.isFollowing ? Color(hex: "D8DEE8") : AppTokens.flowBrand, lineWidth: 1))
                    .disabled(isTogglingFollow)
                    .accessibilityLabel(post.isFollowing ? "取消关注\(post.author)" : "关注\(post.author)")
            }
            ShareLink(item: URL(string: "qiaoqiaole://community/posts/\(post.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? post.id)")!) {
                Image(systemName: "square.and.arrow.up").font(.subheadline.weight(.semibold)).foregroundStyle(AppTokens.flowText)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain).accessibilityLabel("分享图纸")
        }
        .frame(maxWidth: 390).frame(maxWidth: .infinity)
        .padding(.horizontal, 0).padding(.vertical, 8)
        .background(AppTokens.panel.opacity(0.98))
        .overlay(alignment: .bottom) { Divider().opacity(0.65) }
    }

    private func load() async {
        let id = UUID(); requestID = id; isLoading = true; error = nil
        defer { if requestID == id { isLoading = false } }
        do { let result = try await session.projects.communityPost(id: postID, token: session.token); guard requestID == id else { return }; post = result }
        catch { guard requestID == id else { return }; self.error = error.localizedDescription }
    }

    private func loadComments() async {
        let id = UUID(); commentsRequestID = id; isLoadingComments = true
        defer { if commentsRequestID == id { isLoadingComments = false } }
        do { let result = try await session.projects.communityComments(postID: postID, token: session.token); guard commentsRequestID == id else { return }; comments = result.comments }
        catch { guard commentsRequestID == id else { return }; self.error = error.localizedDescription }
    }

    private func submitComment() async {
        guard let token = session.token else { router.requireLogin(returnTo: .communityPost(postID)); return }
        let text = commentText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, text.count <= 300 else { error = "评论需为 1–300 个字符"; return }
        isSubmittingComment = true
        defer { isSubmittingComment = false }
        do { _ = try await session.projects.createCommunityComment(postID: postID, content: text, parentID: replyTarget?.id, token: token); commentText = ""; replyTarget = nil; await loadComments(); if let post { self.post = CommunityPostDetail(id: post.id, name: post.name, rows: post.rows, cols: post.cols, tone: post.tone, sourceImage: post.sourceImage, thumbnailImage: post.thumbnailImage, beadList: post.beadList, sharedAt: post.sharedAt, authorId: post.authorId, author: post.author, authorAvatar: post.authorAvatar, isFollowing: post.isFollowing, likesCount: post.likesCount, commentsCount: post.commentsCount + 1, likedByMe: post.likedByMe, tags: post.tags) } }
        catch { self.error = error.localizedDescription }
    }

    private func toggleLike() async {
        guard let token = session.token else { router.requireLogin(returnTo: .communityPost(postID)); return }
        guard let post, !isLiking else { return }
        isLiking = true
        defer { isLiking = false }
        do {
            let result = try await session.projects.setCommunityLike(id: postID, liked: !post.likedByMe, token: token)
            self.post = CommunityPostDetail(id: post.id, name: post.name, rows: post.rows, cols: post.cols, tone: post.tone, sourceImage: post.sourceImage, thumbnailImage: post.thumbnailImage, beadList: post.beadList, sharedAt: post.sharedAt, authorId: post.authorId, author: post.author, authorAvatar: post.authorAvatar, isFollowing: post.isFollowing, likesCount: result.likesCount, commentsCount: post.commentsCount, likedByMe: result.liked, tags: post.tags)
        } catch { self.error = error.localizedDescription }
    }
    private func copyToRepository() async {
        guard let token = session.token else { router.requireLogin(returnTo: .communityPost(postID)); return }
        guard !isCopying else { return }
        isCopying = true
        defer { isCopying = false }
        do {
            _ = try await session.projects.copyCommunityPost(id: postID, token: token)
            router.showNotice("已复制到仓库，可在我的作品中查看。", kind: .success)
            router.navigate(to: .projects)
        } catch { self.error = error.localizedDescription }
    }
    private func toggleFollow() async {
        guard let token = session.token else { router.requireLogin(returnTo: .communityPost(postID)); return }
        guard let post, !isTogglingFollow else { return }
        isTogglingFollow = true
        defer { isTogglingFollow = false }
        do {
            let result = try await session.projects.setFollow(authorID: post.authorId, following: !post.isFollowing, token: token)
            self.post = CommunityPostDetail(id: post.id, name: post.name, rows: post.rows, cols: post.cols, tone: post.tone, sourceImage: post.sourceImage, thumbnailImage: post.thumbnailImage, beadList: post.beadList, sharedAt: post.sharedAt, authorId: post.authorId, author: post.author, authorAvatar: post.authorAvatar, isFollowing: result.following, likesCount: post.likesCount, commentsCount: post.commentsCount, likedByMe: post.likedByMe, tags: post.tags)
        } catch { self.error = error.localizedDescription }
    }
    private func requestCommentDeletion(_ comment: CommunityComment) {
        router.overlay = .deleteCommunityComment(CommunityCommentDeletion(postID: postID, commentID: comment.id))
    }
}

private struct CommunityAuthorVisualFixture {
    let page: CommunityAuthorPage
    static let workspace = CommunityAuthorVisualFixture(page: CommunityAuthorPage(
        profile: CommunityAuthorProfile(id: "author-fixture", name: "星空创作者", avatarUrl: nil, postsCount: 12, likesCount: 1_286, followersCount: 328, isFollowing: false),
        posts: [
            CommunityPostSummary(id: "author-work-1", name: "草莓小熊", rows: 20, cols: 18, tone: "recent-bear", thumbnailImage: nil, sharedAt: "2026-08-25T09:30:00Z", likesCount: 128, commentsCount: 12, authorId: "author-fixture", author: "星空创作者", authorAvatar: nil, likedByMe: false, isFollowing: false, tags: ["动物"]),
            CommunityPostSummary(id: "author-work-2", name: "星空猫咪", rows: 18, cols: 18, tone: "recent-flower", thumbnailImage: nil, sharedAt: "2026-08-24T09:30:00Z", likesCount: 86, commentsCount: 5, authorId: "author-fixture", author: "星空创作者", authorAvatar: nil, likedByMe: false, isFollowing: false, tags: ["治愈"])
        ], page: 1, pageSize: 20
    ))
}

private struct CommunityAuthorView: View {
    @EnvironmentObject private var router: AppRouter
    @ObservedObject var session: AppSession
    let authorID: String
    let fixture: CommunityAuthorVisualFixture?
    @State private var page: CommunityAuthorPage?
    @State private var isLoading = true
    @State private var isFollowing = false
    @State private var isTogglingFollow = false
    @State private var error: String?
    @State private var requestID = UUID()

    init(session: AppSession, authorID: String, fixture: CommunityAuthorVisualFixture? = nil) {
        self.session = session
        self.authorID = authorID
        self.fixture = fixture
        _page = State(initialValue: fixture?.page)
        _isLoading = State(initialValue: fixture == nil)
        _isFollowing = State(initialValue: fixture?.page.profile.isFollowing ?? false)
    }

    var body: some View {
        Group {
            if isLoading { ProgressView("正在读取作者主页…") }
            else if let error { ContentUnavailableView("作者主页无法打开", systemImage: "exclamationmark.triangle", description: Text(error)) }
            else if let page { content(page) }
            else { ContentUnavailableView("作者不存在", systemImage: "person.crop.circle.badge.questionmark") }
        }
        .navigationTitle("作者主页").navigationBarTitleDisplayMode(.inline)
        .task(id: authorID) { if fixture == nil { await load() } }
    }

    private func content(_ page: CommunityAuthorPage) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 14) {
                    UserAvatarView(avatarURL: page.profile.avatarUrl, size: 72, accessibilityLabel: page.profile.name + "的头像")
                    VStack(alignment: .leading, spacing: 5) { HStack(spacing: 6) { Text(page.profile.name).font(.title3.bold()); Text("创作者").font(.caption2.weight(.semibold)).foregroundStyle(.white).padding(.horizontal, 6).padding(.vertical, 3).background(AppTokens.flowBrand).clipShape(Capsule()) }; Text("分享拼豆作品").font(.caption).foregroundStyle(AppTokens.muted) }
                    Spacer()
                    Button(isFollowing ? "已关注" : "关注") { Task { await toggleFollow() } }.buttonStyle(.borderedProminent).tint(isFollowing ? AppTokens.muted : AppTokens.flowBrand).disabled(isTogglingFollow)
                }.padding(16).background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: AppTokens.cardCorner))
                HStack(spacing: 0) { AuthorStat(value: "\(page.profile.postsCount)", title: "作品"); AuthorStat(value: "\(page.profile.likesCount)", title: "获赞"); AuthorStat(value: "\(page.profile.followersCount)", title: "粉丝"); AuthorStat(value: "—", title: "浏览") }.padding(.vertical, 14).background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: AppTokens.cardCorner))
                VStack(alignment: .leading, spacing: 7) { Text("作品").font(.headline).foregroundStyle(AppTokens.flowBrand); Capsule().fill(AppTokens.flowBrand).frame(width: 30, height: 3) }
                if page.posts.isEmpty { ContentUnavailableView("还没有公开图纸", systemImage: "square.grid.3x3") }
                else { LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) { ForEach(page.posts) { post in Button { router.navigate(to: .communityPost(post.id)) } label: { CommunityPostCard(post: post) }.buttonStyle(.plain) } } }
            }.frame(maxWidth: 390).frame(maxWidth: .infinity).padding(AppTokens.pagePadding).padding(.bottom, 28)
        }.background(AppTokens.flowBackground)
    }

    private func load() async { let id = UUID(); requestID = id; isLoading = true; error = nil; defer { if requestID == id { isLoading = false } }; do { let value = try await session.projects.communityAuthor(id: authorID, token: session.token); guard requestID == id else { return }; page = value; isFollowing = value.profile.isFollowing } catch { guard requestID == id else { return }; self.error = error.localizedDescription } }
    private func toggleFollow() async { guard let token = session.token else { router.requireLogin(returnTo: .authorProfile(authorID)); return }; guard let page, !isTogglingFollow else { return }; let target = !isFollowing; isTogglingFollow = true; defer { isTogglingFollow = false }; do { let result = try await session.projects.setFollow(authorID: authorID, following: target, token: token); guard self.page?.profile.id == authorID else { return }; self.page = CommunityAuthorPage(profile: CommunityAuthorProfile(id: page.profile.id, name: page.profile.name, avatarUrl: page.profile.avatarUrl, postsCount: page.profile.postsCount, likesCount: page.profile.likesCount, followersCount: result.followersCount, isFollowing: result.following), posts: page.posts, page: page.page, pageSize: page.pageSize); isFollowing = result.following } catch { self.error = error.localizedDescription } }
}

private struct AuthorStat: View {
    let value: String; let title: String
    var body: some View { VStack(spacing: 5) { Text(value).font(.headline.bold()); Text(title).font(.caption).foregroundStyle(AppTokens.muted) }.frame(maxWidth: .infinity) }
}

private struct CommentThreadView: View {
    let comment: CommunityComment
    let currentUserID: String?
    let onReply: (CommunityComment) -> Void
    let onDelete: (CommunityComment) -> Void
    @State private var repliesExpanded = false

    private var visibleReplies: [CommunityComment] {
        repliesExpanded ? comment.replies : Array(comment.replies.prefix(2))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            commentRow(comment)
            ForEach(visibleReplies) { reply in
                commentRow(reply)
                    .padding(.leading, 46)
            }
            if comment.replies.count > 2 {
                Button(repliesExpanded ? "收起回复" : "展开 \(comment.replies.count - visibleReplies.count) 条回复") {
                    repliesExpanded.toggle()
                }
                .buttonStyle(.plain)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(Color(hex: "4381D6"))
                .padding(.leading, 46)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .contain)
    }

    private func commentRow(_ item: CommunityComment) -> some View {
        HStack(alignment: .top, spacing: 10) {
            UserAvatarView(avatarURL: item.authorAvatar, size: 35, accessibilityLabel: "\(item.author)的头像")
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 5) {
                    Text(item.author)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color(hex: "1D2634"))
                        .lineLimit(1)
                    if let replyName = item.replyToUserName, !replyName.isEmpty {
                        Text("回复 @\(replyName)")
                            .font(.system(size: 10))
                            .foregroundStyle(Color(hex: "4381D6"))
                            .lineLimit(1)
                    }
                }
                Text(item.content)
                    .font(.system(size: 13))
                    .foregroundStyle(Color(hex: "3F4C5F"))
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 11) {
                    Text(CommunityPostPresentation.commentTime(item.createdAt))
                        .font(.system(size: 10))
                        .foregroundStyle(Color(hex: "7A8799"))
                    Button("回复") { onReply(item) }
                        .buttonStyle(.plain)
                        .font(.system(size: 10))
                        .foregroundStyle(Color(hex: "718096"))
                    if item.authorId == currentUserID {
                        Button("删除") { onDelete(item) }
                            .buttonStyle(.plain)
                            .font(.system(size: 10))
                            .foregroundStyle(Color(hex: "E46B6B"))
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct FlowReadOnlyTags: View {
    let tags: [String]
    var body: some View { HStack(spacing: 7) { ForEach(tags, id: \.self) { Text("#\($0)").font(.caption.weight(.medium)).foregroundStyle(AppTokens.flowBrand).padding(.horizontal, 9).padding(.vertical, 5).background(AppTokens.flowBrand.opacity(0.1)).clipShape(Capsule()) } } }
}

private struct CommunityDetailMetaCard: View {
    let title: String
    let value: String
    let symbol: String
    var body: some View {
        HStack(spacing: 9) {
            Image(systemName: symbol).foregroundStyle(AppTokens.flowBrand).frame(width: 32, height: 32).background(AppTokens.flowBrand.opacity(0.1)).clipShape(Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.caption2).foregroundStyle(AppTokens.muted)
                Text(value).font(.subheadline.weight(.semibold)).foregroundStyle(AppTokens.flowText).lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
        .padding(10)
        .overlay(RoundedRectangle(cornerRadius: AppTokens.compactCorner).stroke(AppTokens.line.opacity(0.72), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: AppTokens.compactCorner))
    }
}

private struct BeadSummaryCard: View {
    let items: [ProjectBeadCount]
    @State private var isShowingAllColors = false
    var body: some View {
        let total = items.reduce(0) { $0 + $1.count }
        return VStack(alignment: .leading, spacing: 10) {
            HStack { Text("豆子清单").font(.headline); Spacer(); Text("\(total) 颗 · \(items.count) 色").font(.caption).foregroundStyle(AppTokens.muted) }
            if items.isEmpty { Text("该稿件没有可统计的豆子。").font(.footnote).foregroundStyle(AppTokens.muted) }
            else {
                VStack(spacing: 0) {
                    ForEach(Array(items.prefix(5).enumerated()), id: \.element.color) { index, item in
                        let resolved = Mard221Palette.resolve(item.color)
                        HStack(spacing: 10) {
                            RoundedRectangle(cornerRadius: 5)
                                .fill(resolved?.swiftUIColor ?? AppTokens.muted)
                                .frame(width: 24, height: 24)
                                .overlay(RoundedRectangle(cornerRadius: 5).stroke(Color.black.opacity(0.1), lineWidth: 1))
                            Text(resolved?.code ?? item.color)
                                .font(.subheadline.weight(.medium)).foregroundStyle(AppTokens.flowText).lineLimit(1)
                            Spacer(minLength: 4)
                            Text("\(item.count)").font(.subheadline.weight(.semibold)).foregroundStyle(AppTokens.flowText)
                        }
                        .frame(maxWidth: .infinity, minHeight: 40)
                        if index < min(items.count, 5) - 1 { Divider().opacity(0.55) }
                    }
                }
                Button("查看全部颜色") { isShowingAllColors = true }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(AppTokens.flowBrand)
                    .accessibilityLabel("查看全部颜色")
            }
        }
        .padding(16).background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: AppTokens.cardCorner))
        .overlay(RoundedRectangle(cornerRadius: AppTokens.cardCorner).stroke(AppTokens.flowLine, lineWidth: 1))
        .shadow(color: AppTokens.flowCardShadow, radius: 10, y: 4)
        .sheet(isPresented: $isShowingAllColors) {
            NavigationStack {
                List(items, id: \.color) { item in
                    let resolved = Mard221Palette.resolve(item.color)
                    HStack(spacing: 10) { RoundedRectangle(cornerRadius: 6).fill(resolved?.swiftUIColor ?? AppTokens.muted).frame(width: 30, height: 30); Text(resolved?.code ?? item.color).font(.body.weight(.medium)); Spacer(); Text("\(item.count) 颗").foregroundStyle(AppTokens.muted) }
                }
                .navigationTitle("豆子清单")
                .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("完成") { isShowingAllColors = false }.accessibilityLabel("关闭豆子清单") } }
            }
            .presentationDetents([.medium, .large])
        }
    }
}

private struct ThumbnailPhaseView: View {
    let phase: AsyncImagePhase
    var body: some View {
        switch phase {
        case .success(let image): image.resizable().scaledToFit()
        case .failure: Image(systemName: "photo").font(.title2).foregroundStyle(AppTokens.muted)
        default: ProgressView().tint(AppTokens.flowBrand)
        }
    }
}

private struct UserAvatarView: View {
    let avatarURL: String?
    let size: CGFloat
    let accessibilityLabel: String

    var body: some View {
        ZStack {
            Circle().fill(LinearGradient(colors: [AppTokens.flowBrand, Color(hex: "071C48")], startPoint: .topLeading, endPoint: .bottomTrailing))
            H5Icon(name: "lucide-user-round", size: size * 0.48).foregroundStyle(.white)
            if let data = AvatarImageData.decode(avatarURL), let image = UIImage(data: data) {
                Image(uiImage: image).resizable().scaledToFill()
            } else if let url = AppAssetURL.url(for: avatarURL) {
                AsyncImage(url: url) { phase in
                    if case .success(let image) = phase { image.resizable().scaledToFill() }
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().stroke(Color.white, lineWidth: 2.5))
        .overlay(Circle().stroke(Color(hex: "DCE9FF"), lineWidth: 2).padding(-4))
        .shadow(color: AppTokens.flowBrand.opacity(0.24), radius: 6, y: 3)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
    }
}

private struct DiscoverVisualFixture {
    let posts: [CommunityPostSummary]
    let tags: [CommunityTagCount]

    static let workspace = DiscoverVisualFixture(
        posts: [
            CommunityPostSummary(id: "discover-fixture-1", name: "草莓小熊", rows: 24, cols: 20, tone: "recent-bear", thumbnailImage: nil, sharedAt: "2026-08-25", likesCount: 128, commentsCount: 16, authorId: "u-fixture-1", author: "拼豆小王", authorAvatar: nil, likedByMe: false, isFollowing: false, tags: ["动物", "新手"]),
            CommunityPostSummary(id: "discover-fixture-2", name: "星空猫咪", rows: 28, cols: 22, tone: "recent-cat", thumbnailImage: nil, sharedAt: "2026-08-24", likesCount: 86, commentsCount: 9, authorId: "u-fixture-2", author: "豆豆星球", authorAvatar: nil, likedByMe: true, isFollowing: true, tags: ["治愈", "动物"]),
            CommunityPostSummary(id: "discover-fixture-3", name: "向日葵花园", rows: 20, cols: 24, tone: "recent-flower", thumbnailImage: nil, sharedAt: "2026-08-23", likesCount: 64, commentsCount: 6, authorId: "u-fixture-3", author: "像素花匠", authorAvatar: nil, likedByMe: false, isFollowing: false, tags: ["花卉", "进阶"]),
            CommunityPostSummary(id: "discover-fixture-4", name: "海边小屋", rows: 18, cols: 26, tone: "recent-sea", thumbnailImage: nil, sharedAt: "2026-08-22", likesCount: 52, commentsCount: 4, authorId: "u-fixture-4", author: "蓝色海浪", authorAvatar: nil, likedByMe: false, isFollowing: false, tags: ["风景", "新手"])
        ],
        tags: [CommunityTagCount(tag: "动物", count: 84), CommunityTagCount(tag: "新手", count: 56), CommunityTagCount(tag: "治愈", count: 42), CommunityTagCount(tag: "花卉", count: 31)]
    )
}

private struct DiscoverLandingView: View {
    @EnvironmentObject private var router: AppRouter
    @ObservedObject var session: AppSession
    @State private var posts: [CommunityPostSummary] = []
    @State private var tags: [CommunityTagCount] = []
    @State private var selectedTags: [String] = []
    @State private var query = ""
    @State private var sort = "hot"
    @State private var page = 1
    @State private var hasMore = false
    @State private var isLoading = false
    @State private var isLoadingMore = false
    @State private var error: String?
    @State private var requestID = UUID()
    let fixture: DiscoverVisualFixture?

    init(session: AppSession, fixture: DiscoverVisualFixture? = nil) {
        self.session = session
        self.fixture = fixture
        _posts = State(initialValue: fixture?.posts ?? [])
        _tags = State(initialValue: fixture?.tags ?? [])
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 9) {
                    Image(systemName: "magnifyingglass").foregroundStyle(AppTokens.muted)
                    TextField("搜索图纸、作者、标签", text: $query).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .accessibilityLabel("搜索图纸、作者、标签")
                }.padding(.horizontal, 13).padding(.vertical, 11).background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner))
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        TagFilter(title: "全部", selected: selectedTags.isEmpty) { selectedTags = [] }
                        ForEach(tags, id: \.tag) { tag in TagFilter(title: tag.tag, selected: selectedTags.contains(tag.tag)) { toggle(tag.tag) } }
                    }.padding(.horizontal, 1)
                }
                HStack(alignment: .bottom, spacing: 38) {
                    DiscoverSortTab(title: "最新", value: "latest", selection: $sort)
                    DiscoverSortTab(title: "热门", value: "hot", selection: $sort)
                    Spacer(minLength: 0)
                }
                .accessibilityElement(children: .contain)
                .accessibilityLabel("稿件排序")
                content
            }
            .padding(AppTokens.pagePadding)
            // H5 reserves roughly 3rem below tab pages so their last action
            // can scroll above the fixed navigation bar and centre create button.
            .padding(.bottom, 92)
            .frame(maxWidth: AppTokens.flowContentMax)
            .frame(maxWidth: .infinity)
        }
        .background(AppTokens.flowBackground).navigationTitle("发现").navigationBarTitleDisplayMode(.inline)
        .task { if fixture == nil { await load(reset: true) } }
        .onChange(of: sort) { _, _ in if fixture == nil { Task { await load(reset: true) } } }
        .onChange(of: selectedTags) { _, _ in if fixture == nil { Task { await load(reset: true) } } }
        .onChange(of: query) { _, _ in if fixture == nil { Task { await load(reset: true) } } }
    }

    @ViewBuilder
    private var content: some View {
        if isLoading && posts.isEmpty { ProgressView("正在读取社区图纸…").frame(maxWidth: .infinity).padding(.vertical, 48) }
        else if let error { VStack(spacing: 12) { ContentUnavailableView("图纸读取失败", systemImage: "exclamationmark.triangle", description: Text(error)); Button("重新加载") { Task { await load(reset: true) } }.buttonStyle(.bordered) } }
        else if posts.isEmpty { ContentUnavailableView("还没有分享的作品", systemImage: "square.grid.3x3", description: Text("创作者发布图纸后会显示在这里。")) }
        else {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 16) {
                ForEach(posts) { post in Button { router.navigate(to: .communityPost(post.id)) } label: { CommunityPostCard(post: post) }.buttonStyle(.plain) }
            }
            if hasMore { Button(isLoadingMore ? "正在加载…" : "加载更多作品") { Task { await load(reset: false) } }.frame(maxWidth: .infinity).buttonStyle(.bordered).disabled(isLoadingMore) }
        }
    }

    private func toggle(_ tag: String) { if selectedTags.contains(tag) { selectedTags.removeAll { $0 == tag } } else { selectedTags.append(tag) } }

    private func load(reset: Bool) async {
        if reset { isLoading = true } else { guard hasMore, !isLoadingMore else { return }; isLoadingMore = true }
        let id = UUID(); requestID = id
        let targetPage = reset ? 1 : page + 1
        defer { if requestID == id { isLoading = false; isLoadingMore = false } }
        do {
            let result = try await session.projects.communityPosts(token: session.token, sort: sort, page: targetPage, pageSize: 12, query: query, tags: selectedTags)
            guard requestID == id else { return }
            posts = reset ? result.posts : posts + result.posts
            tags = result.tagCounts.filter { $0.count > 0 }
            page = result.page; hasMore = result.posts.count == result.pageSize; error = nil
        } catch {
            guard requestID == id else { return }
            if reset { posts = []; hasMore = false }
            self.error = error.localizedDescription
        }
    }
}

private struct DiscoverSortTab: View {
    let title: String
    let value: String
    @Binding var selection: String

    private var selected: Bool { selection == value }

    var body: some View {
        Button {
            selection = value
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.system(size: 14, weight: selected ? .semibold : .regular))
                    .foregroundStyle(selected ? AppTokens.flowBrand : Color(hex: "617A9E"))
                Capsule()
                    .fill(selected ? AppTokens.flowBrand : Color.clear)
                    .frame(width: 36, height: 3)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

private struct TagFilter: View {
    let title: String; let selected: Bool; let action: () -> Void
    var body: some View { Button(title, action: action).font(.caption.weight(.semibold)).padding(.horizontal, 12).padding(.vertical, 8).background(selected ? AppTokens.flowBrand : AppTokens.panel).foregroundStyle(selected ? Color.white : AppTokens.flowText).clipShape(Capsule()).accessibilityLabel("筛选标签\(title)").accessibilityAddTraits(selected ? .isSelected : []) }
}

private struct MessagesVisualFixture {
    let notifications: [CommunityNotification]
    static let workspace = MessagesVisualFixture(notifications: [
        CommunityNotification(id: "message-fixture-1", type: "comment", projectId: "discover-fixture-1", commentId: "comment-1", content: "评论了你的图纸：这个配色太可爱了！", createdAt: "2026-08-25T09:30:00Z", readAt: nil, senderId: "message-user-1", senderName: "拼豆小猫", senderAvatar: nil, isRead: false),
        CommunityNotification(id: "message-fixture-2", type: "like", projectId: "discover-fixture-2", commentId: nil, content: "赞了你的作品《星空猫咪》", createdAt: "2026-08-24T11:00:00Z", readAt: nil, senderId: "message-user-2", senderName: "像素小屋", senderAvatar: nil, isRead: false),
        CommunityNotification(id: "message-fixture-3", type: "follow", projectId: nil, commentId: nil, content: "关注了你，快去看看对方的作品吧。", createdAt: "2026-08-23T08:15:00Z", readAt: "2026-08-23T08:30:00Z", senderId: "message-user-3", senderName: "蓝色海浪", senderAvatar: nil, isRead: true)
    ])
}

private struct MessagesLandingView: View {
    @EnvironmentObject private var router: AppRouter
    @ObservedObject var session: AppSession
    @State private var items: [CommunityNotification] = []
    @State private var unreadCount = 0
    @State private var isLoading = false
    @State private var error: String?
    @State private var requestID = UUID()
    let fixture: MessagesVisualFixture?
    init(session: AppSession, fixture: MessagesVisualFixture? = nil) {
        self.session = session; self.fixture = fixture
        _items = State(initialValue: fixture?.notifications ?? [])
        _unreadCount = State(initialValue: fixture?.notifications.filter { !$0.isRead }.count ?? 0)
    }
    var body: some View {
        Group {
            if fixture != nil { messageList }
            else if session.token == nil { MessagesGuestLandingView(onLogin: { router.overlay = .login(returnTo: .home(.messages)) }) }
            else if isLoading && items.isEmpty { ProgressView("正在读取消息…") }
            else if let error { VStack(spacing: 12) { ContentUnavailableView("消息读取失败", systemImage: "exclamationmark.triangle", description: Text(error)); Button("重新加载") { Task { await load() } }.buttonStyle(.bordered) } }
            else if items.isEmpty { ContentUnavailableView("暂时没有消息", systemImage: "bell", description: Text("点赞、评论和关注动态会显示在这里。")) }
            else { messageList }
        }
        .navigationTitle(unreadCount > 0 ? "消息（\(unreadCount)）" : "消息").navigationBarTitleDisplayMode(.inline)
        .toolbar { if session.token != nil { ToolbarItem(placement: .topBarTrailing) { Button("刷新") { Task { await load() } }.accessibilityLabel("刷新消息") } } }
        .task { if fixture == nil { await load() } }
    }

    private var messageList: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline) {
                    Text("消息").font(.title2.weight(.bold)).foregroundStyle(AppTokens.flowText)
                    Spacer()
                    Text(unreadCount > 0 ? "\(unreadCount) 条未读" : "全部已读").font(.caption).foregroundStyle(AppTokens.muted)
                        .accessibilityLabel(unreadCount > 0 ? "\(unreadCount) 条未读" : "全部已读")
                }
                .padding(.bottom, 14)
                ForEach(items) { notification in
                    Button { Task { await open(notification) } } label: {
                        HStack(spacing: 12) {
                            UserAvatarView(avatarURL: notification.senderAvatar, size: 46, accessibilityLabel: "\(notification.senderName)头像")
                            VStack(alignment: .leading, spacing: 4) {
                                Text(notification.senderName).font(.subheadline.weight(.semibold)).foregroundStyle(AppTokens.flowText).lineLimit(1)
                                Text(notification.content).font(.subheadline).foregroundStyle(AppTokens.muted).lineLimit(1)
                            }
                            Spacer(minLength: 4)
                            VStack(alignment: .trailing, spacing: 8) {
                                Text(CommunityMessageTime.display(notification.createdAt)).font(.caption2).foregroundStyle(AppTokens.muted)
                                if !notification.isRead { Text("1").font(.caption2.weight(.bold)).foregroundStyle(.white).frame(width: 20, height: 20).background(Color(hex: "FF4D5E")).clipShape(Circle()).accessibilityLabel("未读") }
                            }
                        }
                        .padding(.vertical, 12)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("消息，\(notification.content)")
                    Divider().overlay(Color(hex: "EDF1F7"))
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 24)
            .padding(.bottom, 120)
            .frame(maxWidth: 620, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .center)
        }
        .background(AppTokens.panel)
    }

    private func load() async { guard let token = session.token else { return }; let id = UUID(); requestID = id; isLoading = true; error = nil; defer { if requestID == id { isLoading = false } }; do { let result = try await session.projects.notifications(token: token); guard requestID == id else { return }; items = result.notifications; unreadCount = result.unreadCount; session.updateUnreadNotificationCount(result.unreadCount) } catch { guard requestID == id else { return }; self.error = error.localizedDescription } }
    private func open(_ notification: CommunityNotification) async { guard let token = session.token else { return }; if !notification.isRead { do { try await session.projects.markNotificationRead(id: notification.id, token: token); guard let index = items.firstIndex(where: { $0.id == notification.id }) else { return }; let old = items[index]; items[index] = CommunityNotification(id: old.id, type: old.type, projectId: old.projectId, commentId: old.commentId, content: old.content, createdAt: old.createdAt, readAt: old.readAt ?? "now", senderId: old.senderId, senderName: old.senderName, senderAvatar: old.senderAvatar, isRead: true); unreadCount = max(0, unreadCount - 1); session.updateUnreadNotificationCount(unreadCount) } catch { self.error = error.localizedDescription; return } }; if let projectID = notification.projectId { router.navigate(to: .communityPost(projectID)) } }
}

private struct MessagesGuestLandingView: View {
    let onLogin: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            ZStack {
                Circle().fill(AppTokens.flowBrand.opacity(0.10)).frame(width: 116, height: 116)
                Circle().fill(AppTokens.flowBrand.opacity(0.16)).frame(width: 84, height: 84)
                Image(systemName: "bubble.left.and.bubble.right.fill")
                    .font(.system(size: 39, weight: .medium))
                    .foregroundStyle(AppTokens.flowBrand)
                Circle().fill(Color(hex: "FFD763")).frame(width: 9, height: 9).offset(x: 49, y: -37)
                Circle().fill(Color(hex: "81D5FF")).frame(width: 7, height: 7).offset(x: -45, y: 33)
            }
            .accessibilityHidden(true)
            Text("登录后查看消息").font(.title3.weight(.bold)).foregroundStyle(AppTokens.flowText)
            Text("评论、关注和下载通知会显示在这里。")
                .font(.subheadline).foregroundStyle(AppTokens.muted).multilineTextAlignment(.center)
            Button("去登录", action: onLogin)
                .buttonStyle(.borderedProminent).tint(AppTokens.flowBrand)
                .accessibilityLabel("登录查看消息")
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, AppTokens.pagePadding)
        .background(AppTokens.panel)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("消息，登录后查看消息")
    }
}

private struct ProfileVisualFixture {
    let profile: AccountProfile; let projects: Int?; let stockedColors: Int?; let totalStock: Int?; let summaryError: String?
    static let workspace = ProfileVisualFixture(profile: AccountProfile(user: APIUser(id: "profile-fixture", nickname: "拼豆小王", avatarUrl: nil), followersCount: 128, followingCount: 36, likesCount: 942), projects: 24, stockedColors: 68, totalStock: 4_560, summaryError: nil)
    static let summaryError = ProfileVisualFixture(profile: AccountProfile(user: APIUser(id: "profile-summary-error-fixture", nickname: "拼豆小王", avatarUrl: nil), followersCount: 128, followingCount: 36, likesCount: 942), projects: nil, stockedColors: nil, totalStock: nil, summaryError: "部分个人中心统计读取失败，点此重新加载")
}

private struct ProfileLandingView: View {
    @EnvironmentObject private var router: AppRouter
    @ObservedObject var session: AppSession
    @State private var profile: AccountProfile?
    @State private var isLoading = false
    @State private var error: String?
    @State private var showingEditor = false
    @State private var name = ""
    @State private var isSaving = false
    @State private var projectCount: Int?
    @State private var stockedColorCount: Int?
    @State private var totalWarehouseStock: Int?
    @State private var summaryError: String?
    let fixture: ProfileVisualFixture?
    init(session: AppSession, fixture: ProfileVisualFixture? = nil) { self.session = session; self.fixture = fixture; _projectCount = State(initialValue: fixture?.projects); _stockedColorCount = State(initialValue: fixture?.stockedColors); _totalWarehouseStock = State(initialValue: fixture?.totalStock); _summaryError = State(initialValue: fixture?.summaryError) }
    var body: some View {
        Group {
            if let fixture { content(fixture.profile) }
            else if session.token == nil { ProfileGuestLandingView(onLogin: { router.overlay = .login(returnTo: .home(.profile)) }) }
            else if isLoading && profile == nil { ProgressView("正在读取个人资料…") }
            else if let profile { content(profile) }
            else { ContentUnavailableView("资料读取失败", systemImage: "person.crop.circle.badge.exclamationmark", description: Text(error ?? "请重试")) }
        }
        .navigationTitle("我的").navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
        .task { if fixture == nil { await load() } }
        .sheet(isPresented: $showingEditor) { ProfileEditor(name: $name, currentAvatarURL: profile?.user.avatarUrl, isSaving: isSaving, error: error, onSave: { name, avatar in Task { await save(name: name, avatarURL: avatar) } }) }
    }
    private func content(_ profile: AccountProfile) -> some View {
        ScrollView {
            VStack(spacing: 16) {
                ZStack(alignment: .top) {
                    ProfileGuestHero()
                    ProfileSignedInAccountCard(
                        profile: profile,
                        projectCount: projectCount,
                        onEdit: {
                            name = profile.user.nickname
                            showingEditor = true
                        },
                        onProjects: { router.navigate(to: .projects) },
                        onFollowing: { router.navigate(to: .following) },
                        onFollowers: { router.navigate(to: .followers) }
                    )
                    .padding(.horizontal, ProfileH5Metrics.pageInset)
                    .padding(.top, ProfileH5Metrics.accountTop)
                }
                .frame(height: ProfileH5Metrics.signedHeroStackHeight)

                Button { router.navigate(to: .warehouses) } label: {
                    HStack(alignment: .top, spacing: 14) {
                        H5Icon(name: "lucide-layers-3", size: 22)
                            .foregroundStyle(AppTokens.flowBrand)
                            .frame(width: 44, height: 44)
                            .background(AppTokens.flowBrandSoft)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                        VStack(alignment: .leading, spacing: 7) {
                            Text("豆子仓库")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(AppTokens.flowText)
                            Text(stockedColorCount == nil ? "库存摘要暂不可用" : "管理 MARD 221 色库存")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(AppTokens.flowMuted)
                            if let stockedColorCount, let totalWarehouseStock {
                                GeometryReader { proxy in
                                    ZStack(alignment: .leading) {
                                        Capsule().fill(Color(hex: "E7EDF6"))
                                        Capsule().fill(LinearGradient(colors: [AppTokens.flowBrand, Color(hex: "58A6FF")], startPoint: .leading, endPoint: .trailing))
                                            .frame(width: max(4, proxy.size.width * min(1, CGFloat(stockedColorCount) / 221)))
                                    }
                                }
                                .frame(height: 6)
                                HStack {
                                    Text("已入库 \(stockedColorCount) / 221 色")
                                    Spacer()
                                    Text("共 \(totalWarehouseStock.formatted()) 颗")
                                }
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(Color(hex: "51627B"))
                            }
                        }
                        Spacer(minLength: 4)
                        H5Icon(name: "lucide-chevron-right", size: 18)
                            .foregroundStyle(Color(hex: "9AA8BD"))
                            .padding(.top, 14)
                    }
                    .padding(ProfileH5Metrics.warehousePadding)
                    .frame(minHeight: ProfileH5Metrics.warehouseHeight, alignment: .top)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: ProfileH5Metrics.cardCorner))
                    .overlay(RoundedRectangle(cornerRadius: ProfileH5Metrics.cardCorner).stroke(AppTokens.flowLine, lineWidth: 1))
                    .shadow(color: Color(hex: "2C4A80").opacity(0.10), radius: 17, y: 6)
                }
                .buttonStyle(.plain)
                .padding(.horizontal, ProfileH5Metrics.pageInset)

                if let summaryError {
                    Button { Task { await load() } } label: {
                        Label(summaryError, systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote)
                            .foregroundStyle(Color.orange)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(12)
                            .background(Color.orange.opacity(0.1))
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, ProfileH5Metrics.pageInset)
                }

                Button {
                    router.showNotice("设置功能即将开放。", kind: .success)
                } label: {
                    HStack(spacing: 14) {
                        H5Icon(name: "lucide-settings", size: 20)
                            .foregroundStyle(AppTokens.flowBrand)
                            .frame(width: ProfileH5Metrics.menuIconSide, height: ProfileH5Metrics.menuIconSide)
                            .background(AppTokens.flowBrandSoft)
                            .clipShape(RoundedRectangle(cornerRadius: ProfileH5Metrics.menuIconCorner))
                        VStack(alignment: .leading, spacing: 4) {
                            Text("设置").font(.system(size: 15, weight: .bold)).foregroundStyle(AppTokens.flowText)
                            Text("账号、安全与偏好").font(.system(size: 12, weight: .medium)).foregroundStyle(AppTokens.flowMuted)
                        }
                        Spacer()
                        H5Icon(name: "lucide-chevron-right", size: 18).foregroundStyle(Color(hex: "9AA8BD"))
                    }
                    .padding(.horizontal, ProfileH5Metrics.menuHorizontalPadding)
                    .frame(minHeight: ProfileH5Metrics.menuHeight)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: ProfileH5Metrics.cardCorner))
                    .overlay(RoundedRectangle(cornerRadius: ProfileH5Metrics.cardCorner).stroke(AppTokens.flowLine, lineWidth: 1))
                    .shadow(color: Color(hex: "2C4A80").opacity(0.08), radius: 17, y: 5)
                }
                .buttonStyle(.plain)
                .padding(.horizontal, ProfileH5Metrics.pageInset)

                Button(role: .destructive) {
                    session.logout()
                    router.logout()
                } label: {
                    HStack(spacing: 7) {
                        H5Icon(name: "lucide-log-out", size: 14)
                        Text("退出登录")
                    }
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Color(hex: "D6455D"))
                    .frame(maxWidth: .infinity, minHeight: ProfileH5Metrics.logoutHeight)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color(hex: "F1D8DC"), lineWidth: 1))
                }
                .buttonStyle(.plain)
                .padding(.horizontal, ProfileH5Metrics.pageInset)
            }
            .padding(.bottom, 112)
            .frame(maxWidth: 548)
            .frame(maxWidth: .infinity)
        }
        .background(AppTokens.flowBackground)
    }
    private func load() async {
        guard let token = session.token else { return }
        isLoading = true
        error = nil
        summaryError = nil
        defer { isLoading = false }

        do {
            profile = try await session.projects.accountProfile(token: token)

            async let projects = session.projects.projects(token: token, pageSize: 1)
            async let warehouses = session.projects.warehouses(token: token)

            do {
                projectCount = try await projects.total
            } catch {
                projectCount = nil
                summaryError = "作品统计读取失败，点此重新加载"
            }

            do {
                let warehouseSummaries = try await warehouses
                stockedColorCount = warehouseSummaries.reduce(0) { $0 + $1.stockedColorCount }
                totalWarehouseStock = warehouseSummaries.reduce(0) { $0 + $1.totalWarehouseStock }
            } catch {
                stockedColorCount = nil
                totalWarehouseStock = nil
                summaryError = summaryError == nil
                    ? "库存摘要读取失败，点此重新加载"
                    : "部分个人中心统计读取失败，点此重新加载"
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
    private func save(name: String, avatarURL: String?) async { guard let token = session.token else { return }; let clean = name.trimmingCharacters(in: .whitespacesAndNewlines); guard !clean.isEmpty, clean.count <= 32 else { error = "用户名需为 1–32 个字符"; return }; isSaving = true; defer { isSaving = false }; do { let user = try await session.projects.updateProfile(nickname: clean, avatarUrl: avatarURL ?? profile?.user.avatarUrl, token: token); if let profile { self.profile = AccountProfile(user: user, followersCount: profile.followersCount, followingCount: profile.followingCount, likesCount: profile.likesCount) }; showingEditor = false } catch { self.error = error.localizedDescription } }
}

private struct ProfileSignedInAccountCard: View {
    let profile: AccountProfile
    let projectCount: Int?
    let onEdit: () -> Void
    let onProjects: () -> Void
    let onFollowing: () -> Void
    let onFollowers: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            HStack(spacing: ProfileH5Metrics.accountGap) {
                UserAvatarView(avatarURL: profile.user.avatarUrl, size: 64, accessibilityLabel: "我的头像")
                    .overlay(Circle().stroke(Color.white, lineWidth: 2.5))
                    .overlay(Circle().stroke(Color(hex: "DCE9FF"), lineWidth: 2.5).padding(-2.5))
                    .shadow(color: AppTokens.flowBrand.opacity(0.24), radius: 6, y: 2)
                    .overlay(Circle().stroke(Color.white, lineWidth: 2.5))
                    .overlay(Circle().stroke(Color(hex: "DCE9FF"), lineWidth: 2.5).padding(-2.5))
                    .shadow(color: AppTokens.flowBrand.opacity(0.24), radius: 6, y: 2)
                VStack(alignment: .leading, spacing: 5) {
                    Text(profile.user.nickname)
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(AppTokens.flowText)
                        .lineLimit(1)
                    Text("ID 20260729")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(AppTokens.flowMuted)
                }
                Spacer(minLength: 4)
                Button(action: onEdit) {
                    HStack(spacing: 5) {
                        H5Icon(name: "lucide-brush", size: 13)
                        Text("编辑资料")
                    }
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Color(hex: "35588E"))
                    .padding(.horizontal, 12)
                    .frame(minHeight: 26)
                    .background(Color.white)
                    .clipShape(Capsule())
                    .overlay(Capsule().stroke(Color(hex: "D9E2F2"), lineWidth: 1))
                }
                .buttonStyle(.plain)
            }

            Rectangle().fill(Color(hex: "E8EDF5")).frame(height: 1)

            HStack(spacing: 0) {
                ProfileMetric(value: projectCount, title: "作品", action: onProjects)
                ProfileMetricDivider()
                ProfileMetric(value: profile.likesCount, title: "获赞", action: onProjects)
                ProfileMetricDivider()
                ProfileMetric(value: profile.followingCount, title: "关注", action: onFollowing)
                ProfileMetricDivider()
                ProfileMetric(value: profile.followersCount, title: "粉丝", action: onFollowers)
            }
        }
        .padding(.horizontal, ProfileH5Metrics.accountHorizontalPadding)
        .padding(.vertical, ProfileH5Metrics.accountVerticalPadding)
        .frame(minHeight: ProfileH5Metrics.signedAccountMinHeight)
        .background(Color.white.opacity(0.98))
        .clipShape(RoundedRectangle(cornerRadius: ProfileH5Metrics.accountCorner))
        .overlay(RoundedRectangle(cornerRadius: ProfileH5Metrics.accountCorner).stroke(Color.white.opacity(0.78), lineWidth: 1))
        .shadow(color: Color(hex: "1B3D65").opacity(0.12), radius: 20, y: 9)
    }
}

private struct ProfileMetric: View {
    let value: Int?
    let title: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            VStack(spacing: 5) {
                Text(value?.formatted() ?? "—")
                    .font(.system(size: 19, weight: .bold))
                    .foregroundStyle(AppTokens.flowBrand)
                Text(title)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Color(hex: "536989"))
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }
}

private struct ProfileMetricDivider: View {
    var body: some View { Rectangle().fill(Color(hex: "E1E8F3")).frame(width: 1, height: 34) }
}

private struct ProfileGuestLandingView: View {
    let onLogin: () -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                ZStack(alignment: .top) {
                    ProfileGuestHero()
                    ProfileGuestAccountCard(onLogin: onLogin)
                        .padding(.horizontal, ProfileH5Metrics.pageInset)
                        .padding(.top, ProfileH5Metrics.accountTop)
                }
                .frame(height: ProfileH5Metrics.guestHeroStackHeight)

                Button(action: onLogin) {
                    HStack(alignment: .top, spacing: 14) {
                        H5Icon(name: "lucide-layers-3", size: 22)
                            .foregroundStyle(AppTokens.flowBrand)
                            .frame(width: 44, height: 44)
                            .background(AppTokens.flowBrandSoft)
                            .clipShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner))
                        VStack(alignment: .leading, spacing: 6) {
                            Text("豆子仓库").font(.headline).foregroundStyle(AppTokens.flowText)
                            Text("登录后查看豆子仓库").font(.caption).foregroundStyle(AppTokens.flowMuted)
                            ProgressView(value: 4, total: 100)
                                .tint(AppTokens.flowBrand)
                                .scaleEffect(x: 1, y: 0.72, anchor: .center)
                            HStack {
                                Text("已入库 0 / 221 色")
                                Spacer()
                                Text("共 0 颗")
                            }
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(AppTokens.flowMuted)
                        }
                        Spacer(minLength: 4)
                        H5Icon(name: "lucide-chevron-right", size: 18)
                            .foregroundStyle(AppTokens.flowMuted)
                            .padding(.top, 4)
                    }
                    .padding(ProfileH5Metrics.warehousePadding)
                    .frame(minHeight: ProfileH5Metrics.warehouseHeight, alignment: .top)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: ProfileH5Metrics.cardCorner))
                    .overlay(RoundedRectangle(cornerRadius: ProfileH5Metrics.cardCorner).stroke(AppTokens.flowLine, lineWidth: 1))
                    .shadow(color: Color(hex: "2C4A80").opacity(0.10), radius: 17, y: 6)
                }
                .buttonStyle(.plain)
                .padding(.horizontal, ProfileH5Metrics.pageInset)
                .accessibilityLabel("登录后查看豆子仓库")

                Button(action: onLogin) {
                    HStack(spacing: 14) {
                        H5Icon(name: "lucide-settings", size: 18)
                            .foregroundStyle(AppTokens.flowBrand)
                            .frame(width: ProfileH5Metrics.menuIconSide, height: ProfileH5Metrics.menuIconSide)
                            .background(AppTokens.flowBrandSoft)
                            .clipShape(RoundedRectangle(cornerRadius: ProfileH5Metrics.menuIconCorner))
                        VStack(alignment: .leading, spacing: 3) {
                            Text("设置").font(.body.weight(.semibold)).foregroundStyle(AppTokens.flowText)
                            Text("账号、安全与偏好").font(.caption).foregroundStyle(AppTokens.flowMuted)
                        }
                        Spacer()
                        H5Icon(name: "lucide-chevron-right", size: 18).foregroundStyle(AppTokens.flowMuted)
                    }
                    .padding(.horizontal, ProfileH5Metrics.menuHorizontalPadding)
                    .frame(minHeight: ProfileH5Metrics.menuHeight)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: ProfileH5Metrics.cardCorner))
                    .overlay(RoundedRectangle(cornerRadius: ProfileH5Metrics.cardCorner).stroke(AppTokens.flowLine, lineWidth: 1))
                    .shadow(color: Color(hex: "2C4A80").opacity(0.08), radius: 17, y: 5)
                }
                .buttonStyle(.plain)
                .padding(.horizontal, ProfileH5Metrics.pageInset)
                .accessibilityLabel("打开设置，需要登录")
            }
            .padding(.bottom, 112)
            .frame(maxWidth: 548)
            .frame(maxWidth: .infinity)
        }
        .background(AppTokens.flowBackground)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("我的，未登录")
    }
}

private enum ProfileH5Metrics {
    static let pageInset: CGFloat = 20
    static let sectionGap: CGFloat = 16
    static let heroHeight: CGFloat = 212
    static let accountTop: CGFloat = 120
    static let guestHeroStackHeight: CGFloat = 256
    static let signedHeroStackHeight: CGFloat = 296
    static let accountHorizontalPadding: CGFloat = 20
    static let accountVerticalPadding: CGFloat = 22
    static let accountGap: CGFloat = 18
    static let guestAccountHeight: CGFloat = 136
    static let signedAccountMinHeight: CGFloat = 168
    static let accountCorner: CGFloat = 24
    static let warehouseHeight: CGFloat = 136
    static let warehousePadding: CGFloat = 18
    static let warehouseIconCorner: CGFloat = 14
    static let cardCorner: CGFloat = 22
    static let menuHeight: CGFloat = 69
    static let menuHorizontalPadding: CGFloat = 23
    static let menuIconSide: CGFloat = 29
    static let menuIconCorner: CGFloat = 10
    static let logoutHeight: CGFloat = 43
}

private struct ProfileGuestHero: View {
    var body: some View {
        ZStack(alignment: .topLeading) {
            LinearGradient(
                colors: [Color(hex: "051639"), Color(hex: "071C48"), Color(hex: "092765")],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            Circle()
                .fill(Color(hex: "3A84FF").opacity(0.34))
                .frame(width: 190, height: 190)
                .blur(radius: 18)
                .offset(x: 246, y: -72)

            Circle()
                .stroke(Color.white.opacity(0.22), lineWidth: 1)
                .frame(width: 76, height: 76)
                .overlay(Circle().fill(Color.white.opacity(0.12)).padding(22))
                .shadow(color: Color(hex: "5B9DFF").opacity(0.55), radius: 20)
                .offset(x: 272, y: 50)

            VStack(alignment: .leading, spacing: 7) {
                Text("我的")
                    .font(.system(size: 38, weight: .black))
                    .foregroundStyle(.white)
                Text("管理你的拼豆世界")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(.white.opacity(0.70))
            }
            .padding(.leading, 24)
            .padding(.top, 48)

            LinearGradient(
                stops: [
                    .init(color: Color(hex: "081F4A").opacity(0), location: 0),
                    .init(color: Color(hex: "4087F2").opacity(0.46), location: 0.38),
                    .init(color: Color(hex: "CCE2FF").opacity(0.82), location: 0.72),
                    .init(color: AppTokens.flowBackground, location: 1),
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(height: 96)
            .frame(maxHeight: .infinity, alignment: .bottom)
            .allowsHitTesting(false)
        }
        .frame(maxWidth: .infinity, minHeight: ProfileH5Metrics.heroHeight, maxHeight: ProfileH5Metrics.heroHeight, alignment: .topLeading)
        .clipShape(UnevenRoundedRectangle(bottomLeadingRadius: 30, bottomTrailingRadius: 30))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("我的，管理你的拼豆世界")
    }
}

private struct ProfileGuestAccountCard: View {
    let onLogin: () -> Void

    var body: some View {
        HStack(spacing: ProfileH5Metrics.accountGap) {
            UserAvatarView(avatarURL: nil, size: 64, accessibilityLabel: "未登录头像")
                .overlay(Circle().stroke(Color.white, lineWidth: 2.5))
                .overlay(Circle().stroke(Color(hex: "DCE9FF"), lineWidth: 2.5).padding(-2.5))
                .shadow(color: AppTokens.flowBrand.opacity(0.24), radius: 6, y: 2)
                .overlay(Circle().stroke(Color.white, lineWidth: 2.5))
                .overlay(Circle().stroke(Color(hex: "DCE9FF"), lineWidth: 2.5).padding(-2.5))
                .shadow(color: AppTokens.flowBrand.opacity(0.24), radius: 6, y: 2)
            VStack(alignment: .leading, spacing: 3) {
                Text("未登录").font(.title3.weight(.bold)).foregroundStyle(AppTokens.flowText)
                Text("登录后同步项目与豆子库存").font(.caption).foregroundStyle(AppTokens.flowMuted)
            }
            Spacer(minLength: 4)
            Button(action: onLogin) {
                HStack(spacing: 6) {
                    H5Icon(name: "lucide-brush", size: 14)
                    Text("立即登录")
                }
                .font(.system(size: 11, weight: .semibold))
                .padding(.horizontal, 12)
                .frame(minHeight: 26)
                .foregroundStyle(Color(hex: "35588E"))
                .background(Color.white)
                .clipShape(Capsule())
                .overlay(Capsule().stroke(Color(hex: "D9E2F2"), lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("立即登录")
        }
        .padding(.horizontal, ProfileH5Metrics.accountHorizontalPadding)
        .padding(.vertical, ProfileH5Metrics.accountVerticalPadding)
        .frame(minHeight: ProfileH5Metrics.guestAccountHeight)
        .background(Color.white.opacity(0.98))
        .clipShape(RoundedRectangle(cornerRadius: ProfileH5Metrics.accountCorner))
        .overlay(RoundedRectangle(cornerRadius: ProfileH5Metrics.accountCorner).stroke(Color.white.opacity(0.78), lineWidth: 1))
        .shadow(color: Color(hex: "1B3D65").opacity(0.12), radius: 20, y: 9)
    }
}

private struct ProfileStat: View { let value: Int?; let title: String; var action: (() -> Void)? = nil; var body: some View { Button(action: { action?() }) { VStack(spacing: 5) { Text(value?.formatted() ?? "—").font(.headline.bold()); Text(title).font(.caption).foregroundStyle(AppTokens.muted) }.frame(maxWidth: .infinity).padding(.vertical, 14) }.buttonStyle(.plain).disabled(action == nil).accessibilityLabel(value == nil ? "\(title)统计暂不可用" : "\(title) \(value ?? 0)") } }
private struct ProfileRow: View { let title: String; let symbol: String; let action: () -> Void; var body: some View { Button(action: action) { HStack { Image(systemName: symbol).foregroundStyle(AppTokens.flowBrand).frame(width: 25); Text(title).foregroundStyle(AppTokens.flowText); Spacer(); Image(systemName: "chevron.right").font(.caption).foregroundStyle(AppTokens.muted) }.padding(15) }.buttonStyle(.plain).accessibilityLabel(title) } }
private struct ProfileEditor: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var name: String
    let currentAvatarURL: String?
    let isSaving: Bool
    let error: String?
    let onSave: (String, String?) -> Void
    @State private var avatarItem: PhotosPickerItem?
    @State private var avatarDataURL: String?
    @State private var preview: UIImage?
    @State private var avatarError: String?
    var body: some View { NavigationStack { Form { Section("头像") { HStack { Group { if let preview { Image(uiImage: preview).resizable().scaledToFill().frame(width: 58, height: 58).clipShape(Circle()) } else { UserAvatarView(avatarURL: currentAvatarURL, size: 58, accessibilityLabel: "当前头像") } }; PhotosPicker(selection: $avatarItem, matching: .images) { Text("更换头像") }.accessibilityLabel("更换头像") } }; Section("个人资料") { TextField("用户名", text: $name).textInputAutocapitalization(.never).accessibilityLabel("用户名") }; if let avatarError { Text(avatarError).foregroundStyle(.red) }; if let error { Text(error).foregroundStyle(.red) } }.navigationTitle("编辑资料").toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() }.disabled(isSaving) }; ToolbarItem(placement: .confirmationAction) { Button(isSaving ? "保存中…" : "保存") { onSave(name, avatarDataURL) }.disabled(isSaving || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || avatarError != nil) } }.onChange(of: avatarItem) { _, item in Task { await loadAvatar(item) } } } }
    private func loadAvatar(_ item: PhotosPickerItem?) async { guard let item else { return }; guard let raw = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: raw) else { avatarError = "无法读取头像图片"; return }; var quality: CGFloat = 0.82; var data = image.jpegData(compressionQuality: quality); while (data?.count ?? 0) > 1024 * 1024, quality > 0.2 { quality -= 0.12; data = image.jpegData(compressionQuality: quality) }; guard let data, data.count <= 1024 * 1024 else { avatarError = "头像不能超过 1MB"; return }; preview = image; avatarDataURL = "data:image/jpeg;base64,\(data.base64EncodedString())"; avatarError = nil }
}

private struct SocialUsersVisualFixture {
    let users: [CommunityUserSummary]
    static let following = SocialUsersVisualFixture(users: [CommunityUserSummary(id: "follow-1", name: "拼豆小鹿", avatarUrl: nil), CommunityUserSummary(id: "follow-2", name: "治愈花园", avatarUrl: nil), CommunityUserSummary(id: "follow-3", name: "像素星球", avatarUrl: nil)])
    static let followers = SocialUsersVisualFixture(users: [CommunityUserSummary(id: "follower-1", name: "草莓小熊", avatarUrl: nil), CommunityUserSummary(id: "follower-2", name: "云朵手作", avatarUrl: nil), CommunityUserSummary(id: "follower-3", name: "像素柠檬", avatarUrl: nil)])
}

private struct SocialUserListView: View {
    @EnvironmentObject private var router: AppRouter
    @ObservedObject var session: AppSession
    let following: Bool
    let fixture: SocialUsersVisualFixture?
    @State private var users: [CommunityUserSummary] = []
    @State private var isLoading = true
    @State private var error: String?
    @State private var requestID = UUID()

    init(session: AppSession, following: Bool, fixture: SocialUsersVisualFixture? = nil) {
        self.session = session; self.following = following; self.fixture = fixture
        _users = State(initialValue: fixture?.users ?? [])
        _isLoading = State(initialValue: fixture == nil)
    }

    var body: some View {
        Group {
            ScrollView { VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) { Text(following ? "我关注的人" : "关注我的人").font(.headline); Text(following ? "关注喜欢的创作者，随时查看他们的作品" : "关注你的人会出现在这里，点击头像查看主页").font(.subheadline).foregroundStyle(AppTokens.muted) }.frame(maxWidth: .infinity, alignment: .leading).padding(18).background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: AppTokens.cardCorner))
                if isLoading { ProgressView("正在读取\(title)…").frame(maxWidth: .infinity).padding(.vertical, 36) }
                else if let error { VStack(spacing: 12) { Text(error).font(.headline); Button("重新加载") { Task { await load() } }.buttonStyle(.borderedProminent) }.frame(maxWidth: .infinity).padding(28).background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: AppTokens.cardCorner)) }
                else if users.isEmpty { VStack(spacing: 8) { Text(following ? "还没有关注任何人" : "还没有粉丝").font(.headline); Text(following ? "去发现页看看喜欢的创作者吧" : "有人关注你后会显示在这里").font(.subheadline).foregroundStyle(AppTokens.muted) }.frame(maxWidth: .infinity).padding(28).background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: AppTokens.cardCorner)) }
                else { VStack(spacing: 0) { ForEach(users) { user in Button { router.navigate(to: .authorProfile(user.id)) } label: { HStack(spacing: 12) { UserAvatarView(avatarURL: user.avatarUrl, size: 42, accessibilityLabel: "\(user.name)的头像"); Text(user.name).font(.headline).foregroundStyle(AppTokens.flowText); Spacer(); Text(following ? "已关注" : "粉丝").font(.caption.weight(.semibold)).foregroundStyle(AppTokens.flowBrand).padding(.horizontal, 9).padding(.vertical, 5).background(AppTokens.flowBrand.opacity(0.08)).clipShape(Capsule()) }.padding(14) }.buttonStyle(.plain).accessibilityLabel("查看\(user.name)的主页"); if user.id != users.last?.id { Divider() } } }.background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: AppTokens.cardCorner)) }
            }.frame(maxWidth: 548).frame(maxWidth: .infinity).padding(AppTokens.pagePadding).padding(.bottom, 30) }
            .background(AppTokens.flowBackground)
        }
        .navigationTitle(title).navigationBarTitleDisplayMode(.inline)
        .task(id: following) { if fixture == nil { await load() } }
    }

    private var title: String { following ? "关注列表" : "粉丝列表" }
    private func load() async {
        guard let token = session.token else { router.requireLogin(returnTo: following ? .following : .followers); return }
        let id = UUID(); requestID = id; isLoading = true; error = nil
        defer { if requestID == id { isLoading = false } }
        do {
            let result = try await session.projects.socialUsers(following: following, token: token)
            guard requestID == id else { return }
            users = result
        } catch {
            guard requestID == id else { return }
            self.error = error.localizedDescription
        }
    }
}

private struct RouteListPage: View {
    let title: String
    let subtitle: String
    let actionTitle: String
    let action: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(title).font(.largeTitle.bold()).foregroundStyle(AppTokens.flowText)
            Text(subtitle).foregroundStyle(AppTokens.muted)
            Button(actionTitle, action: action).buttonStyle(.borderedProminent).tint(AppTokens.flowBrand)
            Spacer()
        }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading).padding(AppTokens.pagePadding).background(AppTokens.flowBackground)
    }
}

private struct AppOverlayHost: View {
    @EnvironmentObject private var router: AppRouter
    @ObservedObject var session: AppSession
    @ObservedObject var document: PatternDocument
    @ObservedObject var splitWorkflow: SplitWorkflow
    @ObservedObject var projectStore: ProjectListStore
    let overlay: AppOverlay
    var body: some View {
        ZStack {
            Button(action: { router.dismissOverlay() }) { AppTokens.sheetBackdrop.ignoresSafeArea() }
                .buttonStyle(.plain).accessibilityLabel("关闭弹窗")
                .disabled(router.isOverlaySubmitting)
            switch overlay {
            case .createDrawing:
                DrawingSourceDialog(session: session, document: document, workflow: splitWorkflow)
            case .login:
                LoginDialog(onLogin: { phone, password in
                    if await session.login(phone: phone, password: password) {
                        router.loginSucceeded()
                        return nil
                    }
                    return session.loginError ?? "登录失败，请稍后重试"
                }, onRegister: { phone, password, code, requestID in
                    if await session.register(phone: phone, password: password, code: code, smsRequestID: requestID) {
                        router.loginSucceeded()
                        return nil
                    }
                    return session.loginError ?? "注册失败，请稍后重试"
                }, onRequestCode: { phone in try await session.requestSmsCode(phone: phone) }, onCancel: router.loginCancelled)
            case .confirm(let confirmation):
                ConfirmationDialog(confirmation: confirmation, onConfirm: { router.dismissOverlay() }, onCancel: { router.dismissOverlay() })
            case .saveProject:
                SaveProjectDialog(session: session, document: document, splitWorkflow: splitWorkflow, onSaved: { message in
                    router.dismissOverlay(force: true); router.showNotice(message, kind: .success)
                }, onCancel: { router.dismissOverlay() })
            case .createProjectFolder:
                CreateFolderDialog(session: session, onCreated: { message in
                    router.dismissOverlay(); router.showNotice(message, kind: .success)
                    if let token = session.token { Task { await projectStore.load(repository: session.projects, token: token) } }
                }, onCancel: { router.dismissOverlay() })
            case .projectActions(let project):
                ProjectActionDialog(session: session, project: project)
            case .moveProject(let project):
                MoveProjectDialog(project: project, session: session, onCompleted: completeMutation, onCancel: { router.dismissOverlay() })
            case .deleteProject(let project):
                DeleteProjectDialog(project: project, session: session, onCompleted: completeMutation, onCancel: { router.dismissOverlay() })
            case .deleteWarehouse(let warehouse):
                ConfirmationDialog(confirmation: Confirmation(title: "删除仓库", message: "确定删除“\(warehouse.name)”吗？仓库里的库存和记录也会被删除。", confirmTitle: "删除仓库", isDestructive: true), onConfirm: { Task { await deleteWarehouse(warehouse) } }, onCancel: { router.dismissOverlay() })
            case .deleteProjectFolder(let folder):
                DeleteFolderDialog(folder: folder, session: session, onCompleted: completeMutation, onCancel: { router.dismissOverlay() })
            case .renameProjectFolder(let folder):
                RenameFolderDialog(folder: folder, session: session, onCompleted: completeMutation, onCancel: { router.dismissOverlay() })
            case .shareProject(let project):
                ShareProjectDialog(project: project, session: session, onCompleted: completeMutation, onCancel: { router.dismissOverlay() })
            case .editProjectTags(let project):
                EditCommunityTagsDialog(project: project, session: session, onCompleted: completeMutation, onCancel: { router.dismissOverlay() })
            case .deleteCommunityComment(let deletion):
                ConfirmationDialog(confirmation: Confirmation(title: "删除评论", message: "删除后将一并删除该评论下的所有回复，无法恢复。", confirmTitle: "删除", isDestructive: true), onConfirm: {
                    Task { await deleteCommunityComment(deletion) }
                }, onCancel: { router.dismissOverlay() })
            case .notice:
                EmptyView()
            }
        }
        .accessibilityAddTraits(.isModal)
    }

    private func completeMutation(_ message: String) {
        router.dismissOverlay(force: true); router.showNotice(message, kind: .success)
        if let token = session.token { Task { await projectStore.load(repository: session.projects, token: token) } }
    }

    private func deleteCommunityComment(_ deletion: CommunityCommentDeletion) async {
        guard let token = session.token else { router.dismissOverlay(force: true); router.requireLogin(returnTo: .communityPost(deletion.postID)); return }
        router.beginOverlaySubmission()
        defer { router.endOverlaySubmission() }
        do {
            let result = try await session.projects.deleteCommunityComment(postID: deletion.postID, commentID: deletion.commentID, token: token)
            router.dismissOverlay(force: true)
            router.didDeleteCommunityComment()
            router.showNotice("已删除 \(result.deletedCount) 条评论", kind: .success)
        } catch {
            router.dismissOverlay(force: true)
            router.showNotice(error.localizedDescription, kind: .error)
        }
    }

    private func deleteWarehouse(_ warehouse: WarehouseSummary) async {
        guard let token = session.token else { router.dismissOverlay(force: true); router.requireLogin(returnTo: .warehouses); return }
        router.beginOverlaySubmission(); defer { router.endOverlaySubmission() }
        do { try await session.projects.deleteWarehouse(id: warehouse.id, token: token); router.dismissOverlay(force: true); router.didMutateWarehouse(); router.showNotice("已删除仓库", kind: .success) }
        catch { router.dismissOverlay(force: true); router.showNotice(error.localizedDescription, kind: .error) }
    }
}

private struct DrawingSourceDialog: View {
    @EnvironmentObject private var router: AppRouter
    @ObservedObject var session: AppSession
    @ObservedObject var document: PatternDocument
    @ObservedObject var workflow: SplitWorkflow
    @State private var localImageItem: PhotosPickerItem?
    @State private var isImportingLocalImage = false
    @State private var showLocalChoices = false
    @State private var isFileImporterPresented = false
    @State private var showBlankCanvas = false
    @State private var blankColumns = "32"
    @State private var blankRows = "32"
    @State private var showXiaohongshuInput = false
    @State private var xiaohongshuLink = ""
    @State private var xiaohongshuTitle = "小红书图纸"
    @State private var xiaohongshuImages: [XiaohongshuExtractedImage] = []
    @State private var isShowingXiaohongshuImagePicker = false
    @State private var isExtractingXiaohongshu = false
    @State private var importingXiaohongshuID: String?
    @State private var isCreatingBlankCanvas = false
    @State private var error: String?

    private var isBusy: Bool { isImportingLocalImage || isExtractingXiaohongshu || importingXiaohongshuID != nil || isCreatingBlankCanvas }

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 28)
            VStack(alignment: .leading, spacing: 10) {
                Capsule().fill(AppTokens.sheetHandle).frame(width: AppTokens.sheetHandleWidth, height: AppTokens.sheetHandleHeight).frame(maxWidth: .infinity)
                ZStack {
                    VStack(spacing: 3) {
                        Text("上传图纸").font(.title3.weight(.bold)).foregroundStyle(AppTokens.flowText)
                        Text("选择一种方式开始创作").font(.caption).foregroundStyle(AppTokens.flowMuted)
                    }
                    HStack {
                        Spacer()
                        Button { router.dismissOverlay() } label: {
                            H5Icon(name: "lucide-x", size: 19)
                                .frame(width: 36, height: 36)
                        }
                        .buttonStyle(.plain).foregroundStyle(AppTokens.flowMuted)
                        .disabled(isBusy).accessibilityLabel("关闭上传图纸")
                    }
                }

                VStack(spacing: 10) {
                    DrawingSourceRow(icon: "lucide-brush", title: "新建空白画布", subtitle: "选择尺寸，从空白网格开始创作", highlighted: showBlankCanvas) {
                        withAnimation(.easeInOut(duration: 0.18)) { showBlankCanvas.toggle(); showLocalChoices = false; showXiaohongshuInput = false; xiaohongshuImages = []; error = nil }
                    }
                    .disabled(isBusy)

                    if showBlankCanvas { blankCanvasControls.transition(.opacity.combined(with: .move(edge: .top))) }

                    DrawingSourceRow(icon: "lucide-upload", title: isImportingLocalImage ? "正在读取图片…" : "从相册或文件选择", subtitle: isImportingLocalImage ? "正在解析图片尺寸与像素" : "打开设备相册或文件选择器", highlighted: showLocalChoices) {
                        withAnimation(.easeInOut(duration: 0.18)) { showLocalChoices.toggle(); showBlankCanvas = false; showXiaohongshuInput = false; xiaohongshuImages = []; error = nil }
                    }
                    .disabled(isBusy)
                    if showLocalChoices {
                        HStack(spacing: 10) {
                            PhotosPicker(selection: $localImageItem, matching: .images) {
                                Label("照片图库", systemImage: "photo.on.rectangle").font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 42)
                            }
                            .buttonStyle(.bordered).tint(AppTokens.flowBrand).disabled(isBusy)
                            .onChange(of: localImageItem) { _, item in Task { await importLocalImage(item) } }
                            Button { isFileImporterPresented = true } label: {
                                Label("系统文件", systemImage: "folder").font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 42)
                            }
                            .buttonStyle(.bordered).tint(AppTokens.flowBrand).disabled(isBusy)
                        }
                        .transition(.opacity.combined(with: .move(edge: .top)))
                    }

                    DrawingSourceRow(icon: "lucide-sparkles", title: session.token == nil ? "小红书提取 · 需登录" : "小红书提取", subtitle: "粘贴笔记链接后提取图片", highlighted: showXiaohongshuInput, iconTint: Color(hex: "FF526D"), iconBackground: Color(hex: "FFF1F3")) {
                        guard session.token != nil else { router.requireLoginForDrawing(); return }
                        withAnimation(.easeInOut(duration: 0.18)) { showXiaohongshuInput = true; showBlankCanvas = false; showLocalChoices = false; error = nil }
                    }
                    .disabled(isBusy)

                    if showXiaohongshuInput { xiaohongshuControls.transition(.opacity.combined(with: .move(edge: .top))) }
                }

                if let error { Text(error).font(.caption).foregroundStyle(.red).frame(maxWidth: .infinity, alignment: .leading) }
                Text("本地图片最大 20MB；生成时统一匹配 MARD 221 标准色号。")
                    .font(.caption2).foregroundStyle(AppTokens.flowMuted)
            }
            .padding(.horizontal, 18).padding(.top, 10).padding(.bottom, 22)
            .frame(maxWidth: AppTokens.sheetWidth)
            .background(AppTokens.panel)
            .clipShape(UnevenRoundedRectangle(topLeadingRadius: AppTokens.sheetCorner, topTrailingRadius: AppTokens.sheetCorner))
            .shadow(color: Color.black.opacity(0.16), radius: 24, y: -4)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .accessibilityElement(children: .contain).accessibilityLabel("上传图纸")
        .fileImporter(isPresented: $isFileImporterPresented, allowedContentTypes: [.image], allowsMultipleSelection: false) { result in
            Task { await importFileResult(result) }
        }
        .sheet(isPresented: $isShowingXiaohongshuImagePicker) {
            NavigationStack {
                ScrollView {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                        ForEach(Array(xiaohongshuImages.enumerated()), id: \.element.id) { index, image in
                            Button { Task { await importXiaohongshuImage(image) } } label: {
                                VStack(alignment: .leading, spacing: 7) {
                                    XiaohongshuCandidatePreview(image: image)
                                        .frame(maxWidth: .infinity).aspectRatio(1, contentMode: .fill)
                                        .clipShape(RoundedRectangle(cornerRadius: 12))
                                    Text(importingXiaohongshuID == image.id ? "读取中…" : "第 \(index + 1) 张")
                                        .font(.caption.weight(.semibold)).foregroundStyle(AppTokens.flowText)
                                }
                            }
                            .buttonStyle(.plain)
                            .disabled(importingXiaohongshuID != nil)
                            .accessibilityLabel("选择第 \(index + 1) 张小红书图片")
                        }
                    }
                    .padding(16)
                }
                .background(AppTokens.flowBackground)
                .navigationTitle("选择笔记图片")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("关闭") { isShowingXiaohongshuImagePicker = false }
                            .disabled(importingXiaohongshuID != nil)
                    }
                }
            }
            .presentationDetents([.medium, .large])
        }
    }

    private var blankCanvasControls: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                DrawingNumberField(title: "宽度列数", value: $blankColumns)
                DrawingNumberField(title: "高度行数", value: $blankRows)
            }
            Button {
                createBlankCanvas()
            } label: {
                HStack(spacing: 8) {
                    if isCreatingBlankCanvas {
                        ProgressView().controlSize(.small).tint(.white)
                    }
                    Text(isCreatingBlankCanvas ? "正在创建…" : "创建画布")
                        .font(.subheadline.weight(.semibold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .background(AppTokens.flowBrand)
            .clipShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner))
            .disabled(isBusy)
            .accessibilityLabel(isCreatingBlankCanvas ? "正在创建空白画布" : "创建空白画布")
        }
        .padding(12).background(AppTokens.flowBackground).clipShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner))
    }

    @MainActor
    private func createBlankCanvas() {
        guard !isCreatingBlankCanvas else { return }
        let columns = min(max(Int(blankColumns.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 32, 2), 120)
        let rows = min(max(Int(blankRows.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 32, 2), 120)
        isCreatingBlankCanvas = true
        error = nil
        document.startBlankProject(columns: columns, rows: rows)

        // Push the editor while the bottom overlay is still mounted, then dismiss the
        // overlay on the next main-actor turn. Real devices can otherwise coalesce an
        // overlay removal with a NavigationStack mutation and silently lose the push.
        router.navigate(to: .canvas)
        Task { @MainActor in
            await Task.yield()
            router.dismissOverlay(force: true)
            isCreatingBlankCanvas = false
        }
    }

    private var xiaohongshuControls: some View {
        VStack(alignment: .leading, spacing: 10) {
            TextField("粘贴小红书笔记链接或分享口令", text: $xiaohongshuLink, axis: .vertical)
                .lineLimit(1...3).textInputAutocapitalization(.never).autocorrectionDisabled()
                .padding(.horizontal, 12).padding(.vertical, 10).background(AppTokens.panel)
                .clipShape(RoundedRectangle(cornerRadius: AppTokens.compactCorner))
                .overlay(RoundedRectangle(cornerRadius: AppTokens.compactCorner).stroke(AppTokens.flowLine, lineWidth: 1))
                .accessibilityLabel("小红书链接")
            Button(isExtractingXiaohongshu ? "提取中…" : "提取图片") { Task { await extractXiaohongshu() } }
                .font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 42).background(AppTokens.flowBrand)
                .clipShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner))
                .disabled(isBusy || xiaohongshuLink.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(12).background(AppTokens.flowBackground).clipShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner))
    }

    private func importFileResult(_ result: Result<[URL], Error>) async {
        do {
            guard let url = try result.get().first else { return }
            isImportingLocalImage = true; error = nil; router.beginOverlaySubmission()
            defer { isImportingLocalImage = false; router.endOverlaySubmission() }
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            let data = try Data(contentsOf: url, options: .mappedIfSafe)
            let image = try Self.validateLocalDrawing(data)
            workflow.load(image: image, data: data, name: url.lastPathComponent)
            router.dismissOverlay(force: true); router.navigate(to: .split)
        } catch { self.error = error.localizedDescription }
    }

    private func importLocalImage(_ item: PhotosPickerItem?) async {
        guard let item else { return }
        isImportingLocalImage = true; error = nil; router.beginOverlaySubmission()
        defer { isImportingLocalImage = false; router.endOverlaySubmission(); localImageItem = nil }
        do {
            guard let data = try await item.loadTransferable(type: Data.self) else { throw APIError(message: "无法读取这张图片，请选择其他图片后重试。") }
            let image = try Self.validateLocalDrawing(data)
            workflow.load(image: image, data: data, name: item.itemIdentifier ?? "参考图片")
            router.dismissOverlay(force: true); router.navigate(to: .split)
        } catch { self.error = error.localizedDescription }
    }

    private func extractXiaohongshu() async {
        guard let token = session.token else { router.requireLoginForDrawing(); return }
        guard let link = Self.extractSupportedXiaohongshuURL(from: xiaohongshuLink) else { error = "未识别到支持的小红书链接。"; return }
        isExtractingXiaohongshu = true; error = nil; xiaohongshuImages = []; router.beginOverlaySubmission()
        defer { isExtractingXiaohongshu = false; router.endOverlaySubmission() }
        do {
            let result = try await session.projects.extractXiaohongshu(link: link.absoluteString, token: token)
            let images = result.availableImages
            guard !images.isEmpty else { throw APIError(message: "未找到可用图片") }
            xiaohongshuTitle = result.title?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? result.title! : "小红书图纸"
            xiaohongshuImages = images
            isShowingXiaohongshuImagePicker = true
        } catch { self.error = error.localizedDescription }
    }

    private func importXiaohongshuImage(_ candidate: XiaohongshuExtractedImage) async {
        guard let token = session.token else { router.requireLoginForDrawing(); return }
        importingXiaohongshuID = candidate.id; error = nil; router.beginOverlaySubmission()
        defer { importingXiaohongshuID = nil; router.endOverlaySubmission() }
        do {
            let dataURL: String
            if let embedded = candidate.imageDataUrl, !embedded.isEmpty { dataURL = embedded }
            else if let remote = candidate.imageUrl, !remote.isEmpty { dataURL = try await session.projects.downloadXiaohongshuImage(imageURL: remote, token: token) }
            else { throw APIError(message: "未找到可用图片。") }
            guard let data = Self.imageData(from: dataURL), data.count <= 20 * 1024 * 1024, let image = UIImage(data: data) else { throw APIError(message: "小红书图片读取失败，请换一张图片。") }
            workflow.load(image: image, data: data, name: Self.safeImageName(xiaohongshuTitle))
            isShowingXiaohongshuImagePicker = false
            router.dismissOverlay(force: true); router.navigate(to: .split)
        } catch { self.error = error.localizedDescription }
    }

    private static func validateLocalDrawing(_ data: Data) throws -> UIImage {
        guard data.count <= 20 * 1024 * 1024 else { throw APIError(message: "图片不能超过 20MB。") }
        guard isPNG(data) || isJPEG(data) || isWebP(data), let image = UIImage(data: data) else {
            throw APIError(message: "请上传 PNG、JPG 或 WebP 图片。")
        }
        return image
    }

    private static func isPNG(_ data: Data) -> Bool {
        let signature: [UInt8] = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
        return data.count >= signature.count && Array(data.prefix(signature.count)) == signature
    }

    private static func isJPEG(_ data: Data) -> Bool {
        let bytes = Array(data.prefix(3))
        return bytes.count == 3 && bytes == [0xFF, 0xD8, 0xFF]
    }

    private static func isWebP(_ data: Data) -> Bool {
        guard data.count >= 12 else { return false }
        let bytes = Array(data.prefix(12))
        return String(bytes: bytes[0..<4], encoding: .ascii) == "RIFF"
            && String(bytes: bytes[8..<12], encoding: .ascii) == "WEBP"
    }

    private static func extractSupportedXiaohongshuURL(from text: String) -> URL? {
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue),
              let match = detector.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              let url = match.url, let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https",
              let host = url.host?.lowercased() else { return nil }
        if host == "xhslink.cn" { return url.port == nil ? url : nil }
        let allowed = host == "xiaohongshu.com" || host.hasSuffix(".xiaohongshu.com") || host == "xhslink.com" || host.hasSuffix(".xhslink.com")
        return allowed ? url : nil
    }

    fileprivate static func imageData(from dataURL: String) -> Data? {
        guard let comma = dataURL.firstIndex(of: ","), dataURL[..<comma].lowercased().contains(";base64") else { return nil }
        return Data(base64Encoded: String(dataURL[dataURL.index(after: comma)...]))
    }

    private static func safeImageName(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "小红书图纸" : String(trimmed.prefix(60))
    }
}

private struct DrawingSourceRow: View {
    let icon: String
    let title: String
    let subtitle: String
    let highlighted: Bool
    var iconTint: Color = AppTokens.flowBrand
    var iconBackground: Color = AppTokens.flowBrandSoft
    let action: () -> Void
    var body: some View { Button(action: action) { DrawingSourceRowLabel(icon: icon, title: title, subtitle: subtitle, highlighted: highlighted, iconTint: iconTint, iconBackground: iconBackground) }.buttonStyle(.plain) }
}

private struct DrawingSourceRowLabel: View {
    let icon: String
    let title: String
    let subtitle: String
    let highlighted: Bool
    let iconTint: Color
    let iconBackground: Color
    var body: some View {
        HStack(spacing: 12) {
            H5Icon(name: icon, size: 20).foregroundStyle(iconTint)
                .frame(width: 40, height: 40).background(iconBackground).clipShape(RoundedRectangle(cornerRadius: 11))
            VStack(alignment: .leading, spacing: 3) { Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(AppTokens.flowText); Text(subtitle).font(.caption).foregroundStyle(AppTokens.flowMuted).lineLimit(2) }
            Spacer(minLength: 4)
            Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(AppTokens.flowBrand)
        }
        .padding(.horizontal, 13).frame(minHeight: 66)
        .background(highlighted ? AppTokens.flowBrandSoft : AppTokens.panel)
        .clipShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner))
        .overlay(RoundedRectangle(cornerRadius: AppTokens.controlCorner).stroke(highlighted ? AppTokens.flowBrand.opacity(0.42) : AppTokens.flowLine, lineWidth: 1))
    }
}

private struct DrawingNumberField: View {
    let title: String
    @Binding var value: String
    var body: some View { VStack(alignment: .leading, spacing: 5) { Text(title).font(.caption).foregroundStyle(AppTokens.flowMuted); TextField("32", text: $value).keyboardType(.numberPad).multilineTextAlignment(.center).frame(height: 38).background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: AppTokens.compactCorner)).overlay(RoundedRectangle(cornerRadius: AppTokens.compactCorner).stroke(AppTokens.flowLine, lineWidth: 1)) }.frame(maxWidth: .infinity) }
}

private struct XiaohongshuCandidatePreview: View {
    let image: XiaohongshuExtractedImage
    var body: some View {
        ZStack {
            AppTokens.flowBrandSoft
            if let dataURL = image.imageDataUrl, let data = DrawingSourceDialog.imageData(from: dataURL), let uiImage = UIImage(data: data) {
                Image(uiImage: uiImage).resizable().scaledToFill()
            } else if let raw = image.imageUrl, let url = URL(string: raw) {
                AsyncImage(url: url) { phase in
                    if case .success(let rendered) = phase { rendered.resizable().scaledToFill() }
                    else if case .failure = phase { Image(systemName: "photo").foregroundStyle(AppTokens.flowMuted) }
                    else { ProgressView() }
                }
            } else { Image(systemName: "photo").foregroundStyle(AppTokens.flowMuted) }
        }
    }
}

private struct LoginDialog: View {
    @EnvironmentObject private var router: AppRouter
    let onLogin: (String, String) async -> String?
    let onRegister: (String, String, String, String) async -> String?
    let onRequestCode: (String) async throws -> SmsCodeResponse
    let onCancel: () -> Void
    @State private var phone = ""
    @State private var password = ""
    @State private var acceptedAgreement = false
    @State private var rememberPassword = false
    @State private var isRegistering = false
    @State private var confirmPassword = ""
    @State private var code = ""
    @State private var smsRequestID = ""
    @State private var countdown = 0
    @State private var isSendingCode = false
    @State private var isSubmitting = false
    @State private var error: String?

    private enum AuthFocus: Hashable { case phone, password, confirmPassword, code }
    @FocusState private var focusedField: AuthFocus?

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 13) {
            Capsule()
                .fill(AppTokens.sheetHandle)
                .frame(width: 38, height: 4)
                .frame(maxWidth: .infinity)
                .padding(.top, -6)

            ZStack {
                Text("手机号\(isRegistering ? "注册" : "登录")")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(AppTokens.flowText)
                    .frame(maxWidth: .infinity)
                HStack {
                    Spacer()
                    Button(action: onCancel) {
                        H5Icon(name: "lucide-x", size: 18)
                            .frame(width: 30, height: 30)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Color(hex: "8B9AAF"))
                    .disabled(isSubmitting)
                    .accessibilityLabel("关闭登录")
                }
            }

            HStack(spacing: 4) {
                authTab("登录", selected: !isRegistering) { isRegistering = false; error = nil }
                authTab("注册", selected: isRegistering) { isRegistering = true; error = nil }
            }
            .padding(3)
            .background(Color(hex: "EEF4FF"))
            .clipShape(RoundedRectangle(cornerRadius: 11))
            .disabled(isSubmitting || isSendingCode)

            VStack(alignment: .leading, spacing: 12) {
                authFieldTitle("手机号")
                HStack(spacing: 0) {
                    Text("+86")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Color(hex: "344054"))
                        .padding(.leading, 13)
                    TextField("请输入手机号", text: $phone)
                        .focused($focusedField, equals: .phone)
                        .keyboardType(.phonePad)
                        .textContentType(.telephoneNumber)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .font(.system(size: 13))
                        .padding(.horizontal, 10)
                        .frame(height: 44)
                        .accessibilityLabel("手机号")
                }
                .background(Color(hex: "F8FBFF"))
                .clipShape(RoundedRectangle(cornerRadius: 13))
                .overlay(RoundedRectangle(cornerRadius: 13).stroke(AppTokens.flowLine, lineWidth: 1))

                authFieldTitle("密码")
                SecureField("请输入 8-128 位密码", text: $password)
                    .focused($focusedField, equals: .password)
                    .textContentType(isRegistering ? .newPassword : .password)
                    .font(.system(size: 13))
                    .padding(.horizontal, 13)
                    .frame(height: 44)
                    .background(Color(hex: "F8FBFF"))
                    .clipShape(RoundedRectangle(cornerRadius: 13))
                    .overlay(RoundedRectangle(cornerRadius: 13).stroke(AppTokens.flowLine, lineWidth: 1))

                if isRegistering {
                    authFieldTitle("确认密码")
                    SecureField("请再次输入密码", text: $confirmPassword)
                        .focused($focusedField, equals: .confirmPassword)
                        .textContentType(.newPassword)
                        .font(.system(size: 13))
                        .padding(.horizontal, 13)
                        .frame(height: 44)
                        .background(Color(hex: "F8FBFF"))
                        .clipShape(RoundedRectangle(cornerRadius: 13))
                        .overlay(RoundedRectangle(cornerRadius: 13).stroke(AppTokens.flowLine, lineWidth: 1))
                        .accessibilityLabel("确认密码")

                    authFieldTitle("验证码")
                    HStack(spacing: 8) {
                        TextField("6位验证码", text: $code)
                            .focused($focusedField, equals: .code)
                            .keyboardType(.numberPad)
                            .font(.system(size: 13))
                            .onChange(of: code) { _, next in
                                let digits = next.filter(\.isNumber)
                                if digits != next || digits.count > 6 { code = String(digits.prefix(6)) }
                            }
                            .padding(.leading, 13)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .accessibilityLabel("验证码")
                        Button(isSendingCode ? "发送中" : (countdown > 0 ? "\(countdown)s 后重发" : "获取验证码")) {
                            Task { await sendCode() }
                        }
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12)
                        .frame(minWidth: 92, minHeight: 34)
                        .background(AppTokens.flowBrand)
                        .clipShape(RoundedRectangle(cornerRadius: 9))
                        .padding(.trailing, 5)
                        .disabled(isSendingCode || countdown > 0 || phone.isEmpty)
                    }
                    .background(Color(hex: "F8FBFF"))
                    .clipShape(RoundedRectangle(cornerRadius: 13))
                    .overlay(RoundedRectangle(cornerRadius: 13).stroke(AppTokens.flowLine, lineWidth: 1))
                }
            }

            if !isRegistering {
                authCheckRow(isOn: $rememberPassword) {
                    Text("记住手机号和密码")
                        .font(.system(size: 11))
                        .foregroundStyle(Color(hex: "718096"))
                }
            }

            authCheckRow(isOn: $acceptedAgreement) {
                HStack(spacing: 0) {
                    Text("我已阅读并同意")
                    Button("《用户协议》") { openLegal(.userAgreement) }
                        .foregroundStyle(AppTokens.flowBrand)
                    Text("和")
                    Button("《隐私政策》") { openLegal(.privacyPolicy) }
                        .foregroundStyle(AppTokens.flowBrand)
                }
                .font(.system(size: 10))
                .foregroundStyle(Color(hex: "718096"))
            }

            if let error {
                Text(error)
                    .font(.system(size: 11))
                    .foregroundStyle(Color(hex: "D6455D"))
                    .fixedSize(horizontal: false, vertical: true)
            }

            Button {
                Task { @MainActor in
                    isSubmitting = true; router.beginOverlaySubmission()
                    error = isRegistering ? await onRegister(phone, password, code, smsRequestID) : await onLogin(phone, password)
                    isSubmitting = false; router.endOverlaySubmission()
                }
            } label: {
                Text(isSubmitting ? "处理中..." : (isRegistering ? "注册" : "登录"))
                    .font(.system(size: 15, weight: .bold))
                    .frame(maxWidth: .infinity, minHeight: 48)
            }
            .foregroundStyle(.white)
            .background(canSubmit ? AppTokens.flowBrand : Color(hex: "9BBCF5"))
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .disabled(!canSubmit)
        }
            .padding(.horizontal, 20)
            .padding(.top, 14)
            .padding(.bottom, 28)
        }
        .scrollDismissesKeyboard(.interactively)
        // H5 uses a scrollable bottom panel. Login stays compact; registration may grow,
        // while the keyboard can shrink the proposal and the form remains scrollable.
        .frame(maxHeight: isRegistering ? 620 : 470)
        .frame(maxWidth: AppTokens.sheetWidth)
        .background(Color.white)
        .clipShape(UnevenRoundedRectangle(topLeadingRadius: 28, topTrailingRadius: 28))
        .overlay(UnevenRoundedRectangle(topLeadingRadius: 28, topTrailingRadius: 28).stroke(AppTokens.flowLine, lineWidth: 1))
        .shadow(color: Color(hex: "1B3D65").opacity(0.18), radius: 24, y: -4)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        // Ignore only the container safe area. The keyboard safe area remains active, so the
        // H5-style bottom panel lifts above the real keyboard instead of being covered by it.
        .ignoresSafeArea(.container, edges: .bottom)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("完成") { focusedField = nil }
                    .font(.system(size: 14, weight: .semibold))
            }
        }
        .onChange(of: isRegistering) { _, _ in focusedField = nil }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("手机号登录")
    }

    private var canSubmit: Bool {
        !phone.isEmpty && !password.isEmpty && acceptedAgreement && !isSubmitting &&
        (!isRegistering || (password == confirmPassword && password.count >= 8 && code.count == 6 && !smsRequestID.isEmpty))
    }

    private func authTab(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(selected ? AppTokens.flowBrand : Color(hex: "667085"))
                .frame(maxWidth: .infinity, minHeight: 32)
                .background(selected ? Color.white : Color.clear)
                .clipShape(RoundedRectangle(cornerRadius: 9))
                .shadow(color: selected ? AppTokens.flowBrand.opacity(0.10) : .clear, radius: 3, y: 1)
        }
        .buttonStyle(.plain)
    }

    private func authFieldTitle(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(Color(hex: "52657F"))
            .padding(.bottom, -7)
    }

    private func authCheckRow<Content: View>(isOn: Binding<Bool>, @ViewBuilder content: () -> Content) -> some View {
        HStack(spacing: 7) {
            Button { isOn.wrappedValue.toggle() } label: {
                ZStack {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(isOn.wrappedValue ? AppTokens.flowBrand : Color.white)
                        .overlay(RoundedRectangle(cornerRadius: 3).stroke(isOn.wrappedValue ? AppTokens.flowBrand : Color(hex: "AAB5C4"), lineWidth: 1.3))
                    if isOn.wrappedValue {
                        H5Icon(name: "lucide-check", size: 11).foregroundStyle(.white)
                    }
                }
                .frame(width: 16, height: 16)
            }
            .buttonStyle(.plain)
            content()
        }
    }

    private func sendCode() async {
        isSendingCode = true; error = nil
        defer { isSendingCode = false }
        do {
            let result = try await onRequestCode(phone)
            smsRequestID = result.smsRequestId
            countdown = result.retryAfter
            while countdown > 0 { try? await Task.sleep(for: .seconds(1)); guard !Task.isCancelled else { return }; countdown -= 1 }
        } catch { self.error = error.localizedDescription }
    }

    private func openLegal(_ route: AppRoute) {
        guard !isSubmitting else { return }
        router.dismissOverlay()
        router.navigate(to: route)
    }
}

private struct SaveProjectDialog: View {
    @EnvironmentObject private var router: AppRouter
    @ObservedObject var session: AppSession
    @ObservedObject var document: PatternDocument
    @ObservedObject var splitWorkflow: SplitWorkflow
    let onSaved: (String) -> Void
    let onCancel: () -> Void
    @State private var name = ""
    @State private var folders: [ProjectFolder] = []
    @State private var folderID: String?
    @State private var shareToCommunity = false
    @State private var activeProjectShared = false
    @State private var isSaving = false
    @State private var error: String?
    @State private var folderLoadError: String?
    @State private var isLoadingFolders = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ZStack {
                Text("保存作品")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(Color(hex: "172238"))
                    .frame(maxWidth: .infinity)
                HStack {
                    Spacer()
                    Button(action: onCancel) {
                        H5Icon(name: "lucide-x", size: 17)
                            .foregroundStyle(Color(hex: "667284"))
                            .frame(width: 35, height: 35)
                            .background(Color(hex: "F0F2F6"))
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .disabled(isSaving)
                    .accessibilityLabel("关闭保存作品")
                }
            }
            .padding(.bottom, 4)

            VStack(alignment: .leading, spacing: 7) {
                Text("作品名称")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Color(hex: "52657F"))
                HStack(spacing: 4) {
                    TextField("作品名称", text: $name)
                        .font(.system(size: 14))
                        .textInputAutocapitalization(.never)
                        .onChange(of: name) { _, value in
                            if value.count > 30 { name = String(value.prefix(30)) }
                        }
                        .padding(.leading, 13)
                        .frame(minHeight: 50)
                    if !name.isEmpty {
                        Button { name = "" } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(width: 27, height: 27)
                                .background(Color(hex: "E4E9F0"))
                                .clipShape(Circle())
                        }
                        .buttonStyle(.plain)
                        .padding(.trailing, 7)
                    }
                }
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color(hex: "CBD9EE"), lineWidth: 2))
                Text("\(name.count)/30")
                    .font(.system(size: 11))
                    .foregroundStyle(Color(hex: "7A8799"))
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }

            HStack(alignment: .bottom, spacing: 10) {
                VStack(alignment: .leading, spacing: 7) {
                    Text("文件夹")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Color(hex: "687588"))
                    Menu {
                        Button("未分类") { folderID = nil }
                        ForEach(folders) { folder in
                            Button(folder.name) { folderID = folder.id }
                        }
                    } label: {
                        HStack {
                            Text(folderName)
                                .font(.system(size: 14))
                                .foregroundStyle(Color(hex: "172238"))
                                .lineLimit(1)
                            Spacer()
                            Image(systemName: "chevron.down")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(Color(hex: "7A8799"))
                        }
                        .padding(.horizontal, 13)
                        .frame(minHeight: 50)
                        .background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color(hex: "CBD9EE"), lineWidth: 2))
                    }
                    .disabled(isSaving || isLoadingFolders)
                }
                Button {
                    router.overlay = .createProjectFolder
                } label: {
                    Text("新建")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(Color(hex: "2F6CF6"))
                        .padding(.horizontal, 14)
                        .frame(minHeight: 50)
                        .background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color(hex: "2F74F5"), lineWidth: 2))
                }
                .buttonStyle(.plain)
                .disabled(isSaving)
            }

            if let folderLoadError {
                Button(folderLoadError) { Task { await loadFolders() } }
                    .font(.system(size: 11))
                    .foregroundStyle(Color.orange)
                    .buttonStyle(.plain)
            }

            Button {
                if !activeProjectShared { shareToCommunity.toggle() }
            } label: {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: (shareToCommunity || activeProjectShared) ? "checkmark.circle.fill" : "circle.fill")
                        .font(.system(size: 24, weight: .bold))
                        .foregroundStyle((shareToCommunity || activeProjectShared) ? Color(hex: "2F74F5") : Color(hex: "DBE4F0"))
                    VStack(alignment: .leading, spacing: 3) {
                        Text(activeProjectShared ? "已分享到社区" : "分享到社区")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(Color(hex: "25324A"))
                        Text(activeProjectShared ? "保存不会重复分享或刷新分享时间" : "分享后会出现在发现和热门图纸")
                            .font(.system(size: 10))
                            .foregroundStyle(Color(hex: "7A8799"))
                    }
                    Spacer()
                }
                .padding(14)
                .background((shareToCommunity || activeProjectShared) ? Color(hex: "F2F7FF") : Color(hex: "F4F7FC"))
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color(hex: "DCE8FB"), lineWidth: 1))
            }
            .buttonStyle(.plain)
            .disabled(isSaving || activeProjectShared)

            if let error {
                Text(error)
                    .font(.system(size: 11))
                    .foregroundStyle(Color(hex: "D6455D"))
                    .fixedSize(horizontal: false, vertical: true)
            }

            Button { Task { await save(startBeading: false) } } label: {
                Label(isSaving ? "保存中…" : "保存到作品", systemImage: "square.and.arrow.down")
                    .font(.system(size: 15, weight: .bold))
                    .frame(maxWidth: .infinity, minHeight: 50)
            }
            .foregroundStyle(.white)
            .background(LinearGradient(colors: [Color(hex: "2474F4"), AppTokens.flowBrand], startPoint: .topLeading, endPoint: .bottomTrailing))
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .shadow(color: AppTokens.flowBrand.opacity(0.24), radius: 10, y: 5)
            .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving)

            Button { Task { await save(startBeading: true) } } label: {
                Label("保存并开始拼豆", systemImage: "square.and.arrow.down")
                    .font(.system(size: 15, weight: .bold))
                    .frame(maxWidth: .infinity, minHeight: 50)
            }
            .foregroundStyle(Color(hex: "2F74F5"))
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color(hex: "2F74F5"), lineWidth: 2))
            .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving)
        }
        .padding(.horizontal, 24)
        .padding(.top, 28)
        .padding(.bottom, 24)
        .frame(maxWidth: 390)
        .background(Color.white.opacity(0.99))
        .clipShape(RoundedRectangle(cornerRadius: 30))
        .overlay(RoundedRectangle(cornerRadius: 30).stroke(Color(hex: "DDE4EF"), lineWidth: 1))
        .shadow(color: Color(hex: "1B3D65").opacity(0.22), radius: 28, y: 10)
        .padding(20)
        .task {
            name = document.projectName
            await loadFolders()
            await loadActiveProjectState()
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("保存作品")
    }

    private var folderName: String {
        guard let folderID else { return "未分类" }
        return folders.first(where: { $0.id == folderID })?.name ?? "未分类"
    }

    private func loadFolders() async {
        guard let token = session.token else { return }
        isLoadingFolders = true; folderLoadError = nil
        defer { isLoadingFolders = false }
        do { folders = try await session.projects.folders(token: token) }
        catch { folders = []; folderLoadError = "文件夹列表读取失败，点此重新加载" }
    }

    private func loadActiveProjectState() async {
        guard let token = session.token, let id = document.activeProjectID else { return }
        if let detail = try? await session.projects.detail(id: id, token: token) {
            folderID = detail.folderId
            activeProjectShared = detail.sharedToCommunity
            if activeProjectShared { shareToCommunity = true }
        }
    }

    private func save(startBeading: Bool) async {
        guard let token = session.token else { error = "请先登录后再保存"; return }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= 30 else { error = "作品名称需为 1–30 个字符"; return }
        isSaving = true; router.beginOverlaySubmission(); error = nil
        defer { isSaving = false; router.endOverlaySubmission() }
        do {
            let isNewProject = document.activeProjectID == nil
            guard let thumbnail = document.projectThumbnailPNG() else { error = "无法生成作品缩略图"; return }
            var uploads = [ProjectUploadImage.png(kind: "thumbnail", filename: "thumbnail.png", data: thumbnail)]
            if let source = splitWorkflow.image?.jpegData(compressionQuality: 0.84), source.count <= 20 * 1024 * 1024 {
                uploads.insert(ProjectUploadImage.jpeg(kind: "source", filename: "source.jpg", data: source), at: 0)
            }
            let paths = try await session.projects.uploadProjectImages(uploads, token: token)
            let detail = try await session.projects.save(ProjectSaveInput(
                projectID: document.activeProjectID, name: trimmed, rows: document.rows, cols: document.columns,
                canvasData: document.projectCanvasData(), beadList: document.projectBeadList(), tone: splitWorkflow.image == nil ? "recent-flower" : "recent-dog", folderId: folderID,
                sourceImagePath: paths.sourceImagePath, thumbnailImagePath: paths.thumbnailImagePath
            ), token: token)
            document.markSaved(id: detail.id, name: detail.name)
            let summary = ProjectSummary(id: detail.id, folderId: detail.folderId, name: detail.name, rows: detail.rows, cols: detail.cols, tone: detail.tone, thumbnailImage: detail.thumbnailImage, sharedToCommunity: detail.sharedToCommunity, sharedAt: detail.sharedAt, likesCount: detail.likesCount, createdAt: detail.createdAt, updatedAt: detail.updatedAt)
            onSaved(isNewProject ? "作品已保存" : "作品已更新")
            if shareToCommunity && !detail.sharedToCommunity {
                router.overlay = .shareProject(summary)
            } else if startBeading {
                router.navigate(to: .projectBeading(detail.id))
            }
        } catch { self.error = error.localizedDescription }
    }
}

private struct CreateFolderDialog: View {
    @EnvironmentObject private var router: AppRouter
    @ObservedObject var session: AppSession
    let onCreated: (String) -> Void
    let onCancel: () -> Void
    @State private var name = ""
    @State private var isSubmitting = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack { Text("新建文件夹").font(.headline); Spacer(); Button("关闭", action: onCancel).accessibilityLabel("关闭新建文件夹").disabled(isSubmitting) }
            TextField("文件夹名称", text: $name).padding(12).background(AppTokens.soft).clipShape(RoundedRectangle(cornerRadius: AppTokens.compactCorner))
                .accessibilityLabel("文件夹名称")
            if let error { Text(error).font(.caption).foregroundStyle(.red) }
            Button(isSubmitting ? "创建中…" : "创建") { Task { await create() } }
                .frame(maxWidth: .infinity).padding(.vertical, 13).background(AppTokens.flowBrand).foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner)).disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSubmitting)
        }.padding(22).frame(maxWidth: 360).background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: 28)).padding(20)
        .accessibilityElement(children: .contain).accessibilityLabel("新建文件夹")
    }

    private func create() async {
        guard let token = session.token else { error = "请先登录后再创建"; return }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= 30 else { error = "文件夹名称需为 1–30 个字符"; return }
        isSubmitting = true; router.beginOverlaySubmission(); error = nil
        defer { isSubmitting = false; router.endOverlaySubmission() }
        do { _ = try await session.projects.createFolder(name: trimmed, token: token); onCreated("文件夹已创建") }
        catch { self.error = error.localizedDescription }
    }
}

private struct ProjectActionDialog: View {
    @EnvironmentObject private var router: AppRouter
    @ObservedObject var session: AppSession
    let project: ProjectSummary
    @State private var hasSession = false

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 80)
            VStack(alignment: .leading, spacing: 10) {
                Capsule()
                    .fill(AppTokens.sheetHandle)
                    .frame(width: 38, height: 4)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 2)

                ZStack(alignment: .topTrailing) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("我的作品")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Color(hex: "667085"))
                        Text(project.name)
                            .font(.system(size: 22, weight: .bold))
                            .foregroundStyle(AppTokens.flowText)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    Button { router.dismissOverlay() } label: {
                        H5Icon(name: "lucide-x", size: 18)
                            .frame(width: 34, height: 34)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Color(hex: "6B7280"))
                    .accessibilityLabel("关闭作品操作")
                }

                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    actionTile(icon: "lucide-play-circle", title: hasSession ? "继续拼豆" : "开始拼豆", primary: true) {
                        router.dismissOverlay(force: true)
                        router.navigate(to: .projectBeading(project.id))
                    }
                    actionTile(icon: "lucide-pencil", title: "编辑作品") {
                        router.dismissOverlay(force: true)
                        router.navigate(to: .projectEdit(project.id))
                    }
                    actionTile(icon: "lucide-folder-input", title: "移动到文件夹") {
                        router.overlay = .moveProject(project)
                    }
                    actionTile(icon: "lucide-share-2", title: project.sharedToCommunity ? "编辑标签" : "分享作品") {
                        router.overlay = project.sharedToCommunity ? .editProjectTags(project) : .shareProject(project)
                    }
                    actionTile(icon: "lucide-trash-2", title: "删除作品", danger: true) {
                        router.overlay = .deleteProject(project)
                    }
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 10)
            .padding(.bottom, 18)
            .frame(maxWidth: AppTokens.sheetWidth)
            .background(Color.white)
            .clipShape(UnevenRoundedRectangle(topLeadingRadius: 28, topTrailingRadius: 28))
            .overlay(UnevenRoundedRectangle(topLeadingRadius: 28, topTrailingRadius: 28).stroke(AppTokens.flowLine, lineWidth: 1))
            .shadow(color: Color(hex: "1B3D65").opacity(0.18), radius: 24, y: -4)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .ignoresSafeArea(edges: .bottom)
        .task { await resolveSessionState() }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("作品操作")
    }

    private func actionTile(icon: String, title: String, primary: Bool = false, danger: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 7) {
                H5Icon(name: icon, size: 18)
                Text(title)
                    .font(.system(size: 14, weight: .bold))
            }
            .foregroundStyle(primary ? Color.white : danger ? Color(hex: "D6455D") : Color(hex: "171819"))
            .frame(maxWidth: .infinity, minHeight: 72)
            .background(primary ? AppTokens.flowBrand : danger ? Color(hex: "FFF5F6") : Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(primary ? AppTokens.flowBrand : danger ? Color(hex: "ED8C9A") : Color(hex: "E1E5EA"), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func resolveSessionState() async {
        guard let token = session.token else { return }
        hasSession = (try? await session.projects.beadingSession(projectID: project.id, token: token)) != nil
    }
}

private struct MoveProjectDialog: View {
    @EnvironmentObject private var router: AppRouter
    let project: ProjectSummary
    @ObservedObject var session: AppSession
    let onCompleted: (String) -> Void
    let onCancel: () -> Void
    @State private var folders: [ProjectFolder] = []
    @State private var folderID: String?
    @State private var isSubmitting = false
    @State private var error: String?
    @State private var folderLoadError: String?
    @State private var isLoadingFolders = false
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack { Text("移动作品").font(.headline); Spacer(); Button("关闭", action: onCancel).accessibilityLabel("关闭移动作品").disabled(isSubmitting) }
            Text("将“\(project.name)”移动到").font(.subheadline).foregroundStyle(AppTokens.muted)
            Picker("目标文件夹", selection: $folderID) {
                Text("未分类").tag(String?.none)
                ForEach(folders) { folder in Text(folder.name).tag(Optional(folder.id)) }
            }.pickerStyle(.inline).labelsHidden().accessibilityLabel("目标文件夹").disabled(isSubmitting || isLoadingFolders)
            if let folderLoadError {
                Button(folderLoadError) { Task { await loadFolders() } }
                    .font(.caption).foregroundStyle(Color.orange)
                    .accessibilityLabel("重新加载移动作品文件夹")
            }
            if let error { Text(error).font(.caption).foregroundStyle(.red) }
            HStack {
                Button("取消", action: onCancel).frame(maxWidth: .infinity).padding(.vertical, 12).background(AppTokens.soft).clipShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner))
                Button(isSubmitting ? "移动中…" : "移动") { Task { await move() } }.frame(maxWidth: .infinity).padding(.vertical, 12).background(AppTokens.flowBrand).foregroundStyle(.white).clipShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner)).disabled(isSubmitting || folderID == project.folderId)
            }
        }.padding(22).frame(maxWidth: 360).background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: 28)).padding(20)
        .task { folderID = project.folderId; await loadFolders() }
        .accessibilityElement(children: .contain).accessibilityLabel("移动作品")
    }
    private func move() async {
        guard let token = session.token else { error = "请先登录后再移动"; return }
        isSubmitting = true; router.beginOverlaySubmission(); error = nil
        defer { isSubmitting = false; router.endOverlaySubmission() }
        do { try await session.projects.moveProject(id: project.id, folderID: folderID, token: token); onCompleted("作品已移动") }
        catch { self.error = error.localizedDescription }
    }
    private func loadFolders() async {
        guard let token = session.token else { return }
        isLoadingFolders = true
        folderLoadError = nil
        defer { isLoadingFolders = false }
        do {
            folders = try await session.projects.folders(token: token)
        } catch {
            folders = []
            folderLoadError = "文件夹列表读取失败，点此重新加载"
        }
    }
}

private struct DeleteProjectDialog: View {
    @EnvironmentObject private var router: AppRouter
    let project: ProjectSummary
    @ObservedObject var session: AppSession
    let onCompleted: (String) -> Void
    let onCancel: () -> Void
    @State private var isSubmitting = false
    @State private var error: String?
    var body: some View {
        DestructiveDialog(title: "删除“\(project.name)”？", message: "删除后将同时放弃未完成的拼豆会话，且无法恢复。", actionTitle: "删除作品", isSubmitting: isSubmitting, error: error, onConfirm: { Task { await delete() } }, onCancel: onCancel)
    }
    private func delete() async {
        guard let token = session.token else { error = "请先登录后再删除"; return }
        isSubmitting = true; router.beginOverlaySubmission(); error = nil
        defer { isSubmitting = false; router.endOverlaySubmission() }
        do { try await session.projects.deleteProject(id: project.id, token: token); onCompleted("作品已删除") }
        catch { self.error = error.localizedDescription }
    }
}

private struct DeleteFolderDialog: View {
    @EnvironmentObject private var router: AppRouter
    let folder: ProjectFolder
    @ObservedObject var session: AppSession
    let onCompleted: (String) -> Void
    let onCancel: () -> Void
    @State private var isSubmitting = false
    @State private var error: String?
    var body: some View {
        DestructiveDialog(title: "删除“\(folder.name)”？", message: "文件夹中的作品会保留，并移到未分类。", actionTitle: "删除文件夹", isSubmitting: isSubmitting, error: error, onConfirm: { Task { await delete() } }, onCancel: onCancel)
    }
    private func delete() async {
        guard let token = session.token else { error = "请先登录后再删除"; return }
        isSubmitting = true; router.beginOverlaySubmission(); error = nil
        defer { isSubmitting = false; router.endOverlaySubmission() }
        do { try await session.projects.deleteFolder(id: folder.id, token: token); onCompleted("文件夹已删除") }
        catch { self.error = error.localizedDescription }
    }
}

private struct RenameFolderDialog: View {
    @EnvironmentObject private var router: AppRouter
    let folder: ProjectFolder
    @ObservedObject var session: AppSession
    let onCompleted: (String) -> Void
    let onCancel: () -> Void
    @State private var name = ""
    @State private var isSubmitting = false
    @State private var error: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack { Text("重命名文件夹").font(.headline); Spacer(); Button("关闭", action: onCancel).accessibilityLabel("关闭重命名文件夹").disabled(isSubmitting) }
            TextField("文件夹名称", text: $name).padding(12).background(AppTokens.soft).clipShape(RoundedRectangle(cornerRadius: AppTokens.compactCorner)).accessibilityLabel("文件夹名称")
            if let error { Text(error).font(.caption).foregroundStyle(.red) }
            HStack {
                Button("取消", action: onCancel).frame(maxWidth: .infinity).padding(.vertical, 12).background(AppTokens.soft).clipShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner)).disabled(isSubmitting)
                Button(isSubmitting ? "保存中…" : "保存") { Task { await rename() } }.frame(maxWidth: .infinity).padding(.vertical, 12).background(AppTokens.flowBrand).foregroundStyle(.white).clipShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner)).disabled(isSubmitting || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }.padding(22).frame(maxWidth: 360).background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: 28)).padding(20)
        .onAppear { name = folder.name }.accessibilityElement(children: .contain).accessibilityLabel("重命名文件夹")
    }
    private func rename() async {
        guard let token = session.token else { error = "请先登录后再重命名"; return }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= 30 else { error = "文件夹名称需为 1–30 个字符"; return }
        isSubmitting = true; router.beginOverlaySubmission(); error = nil
        defer { isSubmitting = false; router.endOverlaySubmission() }
        do { _ = try await session.projects.renameFolder(id: folder.id, name: trimmed, token: token); onCompleted("文件夹已重命名") }
        catch { self.error = error.localizedDescription }
    }
}

private struct ShareProjectDialog: View {
    @EnvironmentObject private var router: AppRouter
    private static let availableTags = ["动物", "人物", "植物", "食物", "风景", "动漫", "游戏", "节日", "文字", "新手", "其他"]
    let project: ProjectSummary
    @ObservedObject var session: AppSession
    let onCompleted: (String) -> Void
    let onCancel: () -> Void
    @State private var selectedTags: [String] = []
    @State private var isSubmitting = false
    @State private var error: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 15) {
            HStack { Text("发布到社区").font(.headline); Spacer(); Button("关闭", action: onCancel).accessibilityLabel("关闭发布到社区").disabled(isSubmitting) }
            VStack(alignment: .leading, spacing: 4) {
                Text(project.name).font(.subheadline.weight(.semibold))
                Text("\(project.cols) × \(project.rows) 格").font(.caption).foregroundStyle(AppTokens.muted)
            }.padding(12).frame(maxWidth: .infinity, alignment: .leading).background(AppTokens.soft).clipShape(RoundedRectangle(cornerRadius: AppTokens.compactCorner))
            Text("发布后，所有用户都可以浏览、点赞和评论。").font(.footnote).foregroundStyle(AppTokens.muted)
            HStack { Text("选择标签").font(.subheadline.weight(.semibold)); Spacer(); Text("1–3 个").font(.caption).foregroundStyle(AppTokens.muted) }
            FlowTagPicker(tags: Self.availableTags, selection: $selectedTags, disabled: isSubmitting)
            if let error { Text(error).font(.caption).foregroundStyle(.red) }
            else if selectedTags.isEmpty { Text("请至少选择一个标签").font(.caption).foregroundStyle(AppTokens.muted) }
            HStack {
                Button("取消", action: onCancel).frame(maxWidth: .infinity).padding(.vertical, 12).background(AppTokens.soft).clipShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner)).disabled(isSubmitting)
                Button(isSubmitting ? "处理中…" : "确认发布") { Task { await publish() } }.frame(maxWidth: .infinity).padding(.vertical, 12).background(AppTokens.flowBrand).foregroundStyle(.white).clipShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner)).disabled(isSubmitting || selectedTags.isEmpty || selectedTags.count > 3)
            }
        }.padding(22).frame(maxWidth: 360).background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: 28)).padding(20)
        .accessibilityElement(children: .contain).accessibilityLabel("发布到社区")
    }
    private func publish() async {
        guard let token = session.token else { error = "请先登录后再发布"; return }
        guard (1...3).contains(selectedTags.count) else { error = "请选择 1–3 个标签"; return }
        isSubmitting = true; router.beginOverlaySubmission(); error = nil
        defer { isSubmitting = false; router.endOverlaySubmission() }
        do {
            _ = try await session.projects.shareProject(id: project.id, tags: selectedTags, token: token)
            onCompleted("作品已发布到社区")
        } catch { self.error = error.localizedDescription }
    }
}

private struct FlowTagPicker: View {
    let tags: [String]
    @Binding var selection: [String]
    let disabled: Bool
    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 62), spacing: 8)], alignment: .leading, spacing: 8) {
            ForEach(tags, id: \.self) { tag in
                let selected = selection.contains(tag)
                Button(tag) {
                    if selected { selection.removeAll { $0 == tag } }
                    else if selection.count < 3 { selection.append(tag) }
                }
                .font(.caption.weight(.medium)).padding(.horizontal, 10).padding(.vertical, 8).frame(maxWidth: .infinity)
                .background(selected ? AppTokens.flowBrand : AppTokens.soft).foregroundStyle(selected ? Color.white : AppTokens.flowText)
                .clipShape(Capsule()).disabled(disabled || (!selected && selection.count >= 3)).accessibilityLabel("选择标签\(tag)").accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
    }
}

private struct EditCommunityTagsDialog: View {
    @EnvironmentObject private var router: AppRouter
    private static let availableTags = ["动物", "人物", "植物", "食物", "风景", "动漫", "游戏", "节日", "文字", "新手", "其他"]
    let project: ProjectSummary
    @ObservedObject var session: AppSession
    let onCompleted: (String) -> Void
    let onCancel: () -> Void
    @State private var selectedTags: [String] = []
    @State private var isLoading = true
    @State private var isSubmitting = false
    @State private var error: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 15) {
            HStack { Text("编辑社区标签").font(.headline); Spacer(); Button("关闭", action: onCancel).accessibilityLabel("关闭编辑社区标签").disabled(isSubmitting) }
            Text(project.name).font(.subheadline.weight(.semibold))
            if isLoading { ProgressView("正在读取标签…").frame(maxWidth: .infinity).padding(.vertical, 22) }
            else {
                HStack { Text("选择标签").font(.subheadline.weight(.semibold)); Spacer(); Text("1–3 个").font(.caption).foregroundStyle(AppTokens.muted) }
                FlowTagPicker(tags: Self.availableTags, selection: $selectedTags, disabled: isSubmitting)
                if let error { Text(error).font(.caption).foregroundStyle(.red) }
                HStack {
                    Button("取消", action: onCancel).frame(maxWidth: .infinity).padding(.vertical, 12).background(AppTokens.soft).clipShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner)).disabled(isSubmitting)
                    Button(isSubmitting ? "保存中…" : "保存社区标签") { Task { await save() } }.frame(maxWidth: .infinity).padding(.vertical, 12).background(AppTokens.flowBrand).foregroundStyle(.white).clipShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner)).disabled(isSubmitting || !(1...3).contains(selectedTags.count))
                }
            }
        }.padding(22).frame(maxWidth: 360).background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: 28)).padding(20)
        .task { await load() }.accessibilityElement(children: .contain).accessibilityLabel("编辑社区标签")
    }
    private func load() async {
        isLoading = true; error = nil
        do { selectedTags = try await session.projects.communityTags(id: project.id) }
        catch { self.error = error.localizedDescription }
        isLoading = false
    }
    private func save() async {
        guard let token = session.token else { error = "请先登录后再保存"; return }
        guard (1...3).contains(selectedTags.count) else { error = "请选择 1–3 个标签"; return }
        isSubmitting = true; router.beginOverlaySubmission(); error = nil
        defer { isSubmitting = false; router.endOverlaySubmission() }
        do { _ = try await session.projects.updateCommunityTags(id: project.id, tags: selectedTags, token: token); onCompleted("社区标签已更新") }
        catch { self.error = error.localizedDescription }
    }
}

private struct DestructiveDialog: View {
    let title: String
    let message: String
    let actionTitle: String
    let isSubmitting: Bool
    let error: String?
    let onConfirm: () -> Void
    let onCancel: () -> Void
    var body: some View {
        VStack(spacing: 14) {
            Text(title).font(.headline)
            Text(message).font(.subheadline).multilineTextAlignment(.center).foregroundStyle(AppTokens.muted)
            if let error { Text(error).font(.caption).foregroundStyle(.red) }
            HStack(spacing: 10) {
                Button("取消", action: onCancel).frame(maxWidth: .infinity).padding(.vertical, 12).background(AppTokens.soft).clipShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner)).disabled(isSubmitting)
                Button(isSubmitting ? "处理中…" : actionTitle, action: onConfirm).frame(maxWidth: .infinity).padding(.vertical, 12).background(Color.red).foregroundStyle(.white).clipShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner)).disabled(isSubmitting)
            }
        }.padding(22).frame(maxWidth: 320).background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: 24)).padding(20).accessibilityElement(children: .contain).accessibilityLabel(title)
    }
}

private struct ConfirmationDialog: View {
    let confirmation: Confirmation
    let onConfirm: () -> Void
    let onCancel: () -> Void
    var body: some View {
        VStack(spacing: 14) {
            Text(confirmation.title).font(.headline)
            Text(confirmation.message).font(.subheadline).multilineTextAlignment(.center).foregroundStyle(AppTokens.muted)
            HStack(spacing: 10) {
                Button("取消", action: onCancel).frame(maxWidth: .infinity).padding(.vertical, 12).background(AppTokens.soft).clipShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner))
                Button(confirmation.confirmTitle, action: onConfirm).frame(maxWidth: .infinity).padding(.vertical, 12).background(confirmation.isDestructive ? Color.red : AppTokens.flowBrand).foregroundStyle(.white).clipShape(RoundedRectangle(cornerRadius: AppTokens.controlCorner))
            }
        }.padding(22).frame(maxWidth: 320).background(AppTokens.panel).clipShape(RoundedRectangle(cornerRadius: 24)).padding(20).accessibilityElement(children: .contain).accessibilityLabel(confirmation.title)
    }
}

private struct StatusToast: View {
    let notice: Notice
    let onDismiss: () -> Void
    var body: some View {
        HStack(spacing: 9) {
            Image(systemName: notice.kind == .success ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
            Text(notice.message).font(.subheadline)
            Button("关闭", action: onDismiss).font(.caption).accessibilityLabel("关闭提示")
        }.foregroundStyle(.white).padding(.horizontal, 14).padding(.vertical, 11).background(notice.kind == .success ? Color.green : Color.red).clipShape(Capsule()).padding(.top, 10).frame(maxWidth: .infinity, alignment: .top)
    }
}
