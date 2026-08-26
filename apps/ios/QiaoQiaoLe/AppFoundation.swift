import Foundation
import SwiftUI

/// Native counterpart of apps/h5/src/app/h5Routes.ts. Every H5 route receives a
/// stable, shareable route value before its feature screen is implemented.
enum HomeTab: String, CaseIterable, Hashable, Identifiable {
    case home, discover, messages, profile

    var id: String { rawValue }
    var title: String {
        switch self {
        case .home: "首页"
        case .discover: "发现"
        case .messages: "消息"
        case .profile: "我的"
        }
    }
    var symbol: String {
        switch self {
        case .home: "house"
        case .discover: "safari"
        case .messages: "bell"
        case .profile: "person"
        }
    }
}

enum AppRoute: Hashable, Identifiable {
    case home(HomeTab)
    case following
    case followers
    case communityPost(String)
    case authorProfile(String)
    case projects
    case projectEdit(String)
    case projectBeading(String)
    case warehouses
    case warehouseDetail(String)
    case split
    case splitCrop
    case splitPreview
    case canvas
    case beading
    case userAgreement
    case privacyPolicy

    var id: String { path }

    var path: String {
        switch self {
        case .home(.home): "/"
        case .home(.discover): "/discover"
        case .home(.messages): "/messages"
        case .home(.profile): "/profile"
        case .following: "/following"
        case .followers: "/followers"
        case .communityPost(let id): "/community/posts/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)"
        case .authorProfile(let id): "/community/users/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)"
        case .projects: "/projects"
        case .projectEdit(let id): "/projects/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)/edit"
        case .projectBeading(let id): "/projects/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)/beading"
        case .warehouses: "/warehouses"
        case .warehouseDetail(let id): "/warehouses/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)"
        case .split: "/split"
        case .splitCrop: "/split/crop"
        case .splitPreview: "/split/preview"
        case .canvas: "/canvas"
        case .beading: "/beading"
        case .userAgreement: "/user-agreement"
        case .privacyPolicy: "/privacy-policy"
        }
    }

    var requiresAuthentication: Bool {
        switch self {
        case .following, .followers, .projects, .projectEdit, .projectBeading, .warehouses, .warehouseDetail:
            true
        default:
            false
        }
    }

    init?(path rawPath: String) {
        let path = rawPath.hasPrefix("/") ? rawPath : "/\(rawPath)"
        let parts = path.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
        if parts.count == 3, parts[0] == "community", parts[1] == "posts", !parts[2].isEmpty {
            self = .communityPost(parts[2].removingPercentEncoding ?? parts[2]); return
        }
        if parts.count == 3, parts[0] == "community", parts[1] == "users", !parts[2].isEmpty {
            self = .authorProfile(parts[2].removingPercentEncoding ?? parts[2]); return
        }
        if parts.count == 3, parts[0] == "projects", parts[2] == "edit", !parts[1].isEmpty {
            self = .projectEdit(parts[1].removingPercentEncoding ?? parts[1]); return
        }
        if parts.count == 3, parts[0] == "projects", parts[2] == "beading", !parts[1].isEmpty {
            self = .projectBeading(parts[1].removingPercentEncoding ?? parts[1]); return
        }
        if parts.count == 2, parts[0] == "warehouses", !parts[1].isEmpty {
            self = .warehouseDetail(parts[1].removingPercentEncoding ?? parts[1]); return
        }
        switch parts {
        case []: self = .home(.home)
        case ["discover"]: self = .home(.discover)
        case ["messages"]: self = .home(.messages)
        case ["profile"]: self = .home(.profile)
        case ["following"]: self = .following
        case ["followers"]: self = .followers
        case ["projects"]: self = .projects
        case ["warehouses"]: self = .warehouses
        case ["split"]: self = .split
        case ["split", "crop"]: self = .splitCrop
        case ["split", "preview"]: self = .splitPreview
        case ["canvas"]: self = .canvas
        case ["beading"]: self = .beading
        case ["user-agreement"]: self = .userAgreement
        case ["privacy-policy"]: self = .privacyPolicy
        default: return nil
        }
    }
}

enum AppOverlay: Identifiable, Equatable {
    case login(returnTo: AppRoute?)
    case confirm(Confirmation)
    case saveProject
    case createProjectFolder
    case moveProject(ProjectSummary)
    case deleteProject(ProjectSummary)
    case deleteWarehouse(WarehouseSummary)
    case deleteProjectFolder(ProjectFolder)
    case renameProjectFolder(ProjectFolder)
    case shareProject(ProjectSummary)
    case editProjectTags(ProjectSummary)
    case deleteCommunityComment(CommunityCommentDeletion)
    case notice(Notice)

    var id: String {
        switch self {
        case .login: "login"
        case .confirm(let confirmation): "confirm-\(confirmation.id)"
        case .saveProject: "save-project"
        case .createProjectFolder: "create-project-folder"
        case .moveProject(let project): "move-project-\(project.id)"
        case .deleteProject(let project): "delete-project-\(project.id)"
        case .deleteWarehouse(let warehouse): "delete-warehouse-\(warehouse.id)"
        case .deleteProjectFolder(let folder): "delete-project-folder-\(folder.id)"
        case .renameProjectFolder(let folder): "rename-project-folder-\(folder.id)"
        case .shareProject(let project): "share-project-\(project.id)"
        case .editProjectTags(let project): "edit-project-tags-\(project.id)"
        case .deleteCommunityComment(let deletion): "delete-community-comment-\(deletion.commentID)"
        case .notice(let notice): "notice-\(notice.id)"
        }
    }
}

struct CommunityCommentDeletion: Equatable {
    let postID: String
    let commentID: String
}

struct Confirmation: Identifiable, Equatable {
    let id = UUID()
    let title: String
    let message: String
    let confirmTitle: String
    let isDestructive: Bool
}

struct Notice: Identifiable, Equatable {
    let id = UUID()
    let message: String
    let kind: Kind
    enum Kind: Equatable { case success, error }
}

enum AppTokens {
    static let ink = Color(hex: "171819")
    static let muted = Color(hex: "6F7478")
    static let soft = Color(hex: "F7F7F3")
    static let panel = Color.white
    static let line = Color(hex: "DEDED9")
    static let gridLine = Color(hex: "D9DCDA")
    static let blue = Color(hex: "208EDC")
    static let flowBrand = Color(hex: "146CFF")
    static let flowBrandDeep = Color(hex: "071C48")
    static let flowBrandSoft = Color(hex: "EAF2FF")
    static let flowBackground = Color(hex: "F4F7FC")
    static let flowText = Color(hex: "101828")
    static let flowMuted = Color(hex: "718096")
    static let flowLine = Color(hex: "E6EDF7")
    static let flowCardShadow = Color(hex: "1B3D65").opacity(0.08)
    static let flowActionShadow = flowBrand.opacity(0.25)
    static let sheetBackdrop = Color.black.opacity(0.38)
    static let sheetHandle = Color(hex: "D5E0F0")
    static let cardCorner: CGFloat = 18
    static let controlCorner: CGFloat = 14
    static let compactCorner: CGFloat = 10
    static let pagePadding: CGFloat = 20
    static let sheetWidth: CGFloat = 382
    static let sheetCorner: CGFloat = 22
    static let sheetHandleWidth: CGFloat = 38
    static let sheetHandleHeight: CGFloat = 4
    static let flowCardShadowRadius: CGFloat = 28
    static let flowActionShadowRadius: CGFloat = 30
    /// H5 --flow-content-max: 17.391rem at its 31.5px wide-screen root size.
    static let flowContentMax: CGFloat = 548
}

@MainActor
final class AppRouter: ObservableObject {
    @Published private(set) var selectedTab: HomeTab = .home
    @Published var path: [AppRoute] = []
    @Published var overlay: AppOverlay?
    @Published private(set) var isOverlaySubmitting = false
    @Published private(set) var isAuthenticated = false
    @Published private(set) var routeStatus: Notice?
    @Published private(set) var communityCommentRevision = 0
    @Published private(set) var warehouseRevision = 0

    private var pendingProtectedRoute: AppRoute?

    init() {
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-confirmation") {
            overlay = .confirm(Confirmation(
                title: "确认操作测试",
                message: "仅用于验证原生覆盖层不会触发背景导航。",
                confirmTitle: "确认测试",
                isDestructive: false
            ))
        }
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-beading-workspace") || ProcessInfo.processInfo.arguments.contains("-ui-testing-beading-warehouse-error") {
            path = [.beading]
        }
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-editor-workspace") {
            path = [.canvas]
        }
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-split-crop-workspace") {
            path = [.splitCrop]
        }
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-community-detail-workspace") {
            path = [.communityPost("community-detail-fixture")]
        }
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-author-workspace") {
            path = [.authorProfile("author-fixture")]
        }
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-following-workspace") {
            path = [.following]
        }
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-followers-workspace") {
            path = [.followers]
        }
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-projects-workspace") {
            path = [.projects]
        }
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-warehouses-workspace") {
            path = [.warehouses]
        }
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-warehouse-detail-workspace") {
            path = [.warehouseDetail("warehouse-detail-fixture")]
        }
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-profile-workspace") || ProcessInfo.processInfo.arguments.contains("-ui-testing-profile-summary-error") {
            selectedTab = .profile
        }
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-discover-workspace") {
            selectedTab = .discover
        }
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-messages-workspace") {
            selectedTab = .messages
        }
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-home-workspace") {
            selectedTab = .home
        }
    }

    var currentRoute: AppRoute { path.last ?? .home(selectedTab) }

    func select(tab: HomeTab) {
        selectedTab = tab
        path.removeAll()
        clearRouteStatus()
    }

    func navigate(to route: AppRoute) {
        guard route.requiresAuthentication, !isAuthenticated else {
            apply(route: route)
            return
        }
        pendingProtectedRoute = route
        overlay = .login(returnTo: route)
    }

    func requireLogin(returnTo route: AppRoute) {
        pendingProtectedRoute = route
        overlay = .login(returnTo: route)
    }

    /// Replaces the current deep-link route while preserving the normal login gate.
    /// This is used for legacy H5 paths which redirect to a canonical native route.
    func replace(with route: AppRoute) {
        clearRouteStatus()
        path.removeAll()
        guard route.requiresAuthentication, !isAuthenticated else {
            apply(route: route)
            return
        }
        pendingProtectedRoute = route
        overlay = .login(returnTo: route)
    }

    func open(url: URL) {
        let path: String
        if url.scheme?.lowercased() == "qiaoqiaole", let host = url.host, !host.isEmpty {
            path = "/\(host)\(url.path)"
        } else {
            path = url.path
        }
        guard let route = AppRoute(path: path) else {
            showNotice("无法打开此链接", kind: .error)
            return
        }
        navigate(to: route)
    }

    func loginSucceeded() {
        isAuthenticated = true
        isOverlaySubmitting = false
        overlay = nil
        if let pendingProtectedRoute { self.pendingProtectedRoute = nil; apply(route: pendingProtectedRoute) }
    }

    func restoreAuthenticatedSession() {
        isAuthenticated = true
    }

    func loginCancelled() {
        pendingProtectedRoute = nil
        overlay = nil
    }

    func logout() {
        isAuthenticated = false
        select(tab: .home)
        showNotice("已退出登录", kind: .success)
    }

    func presentConfirmation(title: String, message: String, confirmTitle: String = "确定", isDestructive: Bool = false) {
        overlay = .confirm(Confirmation(title: title, message: message, confirmTitle: confirmTitle, isDestructive: isDestructive))
    }

    func beginOverlaySubmission() { isOverlaySubmitting = true }

    func endOverlaySubmission() { isOverlaySubmitting = false }

    func dismissOverlay(force: Bool = false) {
        guard force || !isOverlaySubmitting else { return }
        overlay = nil
        isOverlaySubmitting = false
    }

    func showNotice(_ message: String, kind: Notice.Kind) {
        routeStatus = Notice(message: message, kind: kind)
    }

    func didDeleteCommunityComment() { communityCommentRevision &+= 1 }
    func didMutateWarehouse() { warehouseRevision &+= 1 }

    func clearRouteStatus() { routeStatus = nil }

    private func apply(route: AppRoute) {
        clearRouteStatus()
        if case .home(let tab) = route { select(tab: tab); return }
        path.append(route)
    }
}
