import Foundation
import Security
import CryptoKit

/// Transport and DTOs deliberately separate project summaries from the editable
/// document response. This mirrors the API's list/detail contract and prevents
/// a project list from accidentally retaining canvas payloads in memory.
struct ProjectSummary: Codable, Identifiable, Equatable, Sendable {
    let id: String
    let folderId: String?
    let name: String
    let rows: Int
    let cols: Int
    let tone: String
    let thumbnailImage: String?
    let sharedToCommunity: Bool
    let sharedAt: String?
    let likesCount: Int
    let createdAt: String
    let updatedAt: String
}

struct ProjectDetail: Codable, Identifiable, Equatable, Sendable {
    let id: String
    let folderId: String?
    let name: String
    let rows: Int
    let cols: Int
    let tone: String
    let sourceImage: String?
    let thumbnailImage: String?
    let canvasData: String
    let beadList: String?
    let revision: Int?
    let sharedToCommunity: Bool
    let sharedAt: String?
    let likesCount: Int
    let createdAt: String
    let updatedAt: String
}

struct ProjectFolder: Codable, Identifiable, Equatable, Sendable {
    let id: String
    let name: String
    let projectCount: Int
}

struct WarehouseSummary: Codable, Identifiable, Equatable, Sendable {
    let id: String
    let name: String
    let remark: String?
    let colorSystem: String
    let createdAt: String
    let updatedAt: String
    let stockedColorCount: Int
    let totalWarehouseStock: Int
}

struct WarehouseInventory: Codable, Equatable, Sendable { let inventory: [String: Int] }
struct WarehouseTransaction: Codable, Equatable, Sendable, Identifiable { let id: String; let colorCode: String; let type: String; let quantity: Int; let inputUnit: String; let inputValue: Double; let source: String; let projectId: String?; let beadingSessionId: String?; let projectName: String?; let createdAt: String }
struct WarehouseTransactionsPage: Codable, Equatable, Sendable { let transactions: [WarehouseTransaction]; let page: Int; let pageSize: Int; let hasMore: Bool; let total: Int }

struct BeadingRequirement: Codable, Equatable, Sendable, Identifiable {
    let colorCode: String
    let required: Int
    var id: String { colorCode }
}

struct BeadingProgress: Codable, Equatable, Sendable { let completed: Int; let total: Int; let percent: Int }

struct BeadingSession: Codable, Equatable, Sendable, Identifiable {
    let id: String
    let projectId: String?
    let projectName: String
    let requirements: [BeadingRequirement]
    let warehouseId: String?
    let warehouseName: String?
    let status: String
    let completedColorCodes: [String]
    let progress: BeadingProgress
    let elapsedSeconds: Int
    let timerStartedAt: String?
    let inventoryDeducted: Bool
    let version: Int
}

struct InventoryCheck: Codable, Equatable, Sendable {
    let warehouseId: String?
    let warehouseName: String?
    let items: [InventoryCheckItem]
    let summary: InventoryCheckSummary
}
struct InventoryCheckItem: Codable, Equatable, Sendable, Identifiable { let colorCode: String; let required: Int; let available: Int; let missing: Int; var id: String { colorCode } }
struct InventoryCheckSummary: Codable, Equatable, Sendable { let sufficient: Bool; let missingColorCount: Int; let missingBeadCount: Int }

struct ProjectPage: Codable, Equatable, Sendable {
    let projects: [ProjectSummary]
    let page: Int
    let pageSize: Int
    let hasMore: Bool
    let total: Int
}

/// `/projects/liked` is a separate list projection: the source project folder
/// is intentionally not exposed to the viewer, while `likedAt` determines its
/// ordering. Do not decode it as `ProjectSummary`.
struct LikedProjectSummary: Codable, Identifiable, Equatable, Sendable {
    let id: String
    let name: String
    let rows: Int
    let cols: Int
    let tone: String
    let thumbnailImage: String?
    let sharedToCommunity: Bool
    let sharedAt: String?
    let likesCount: Int
    let createdAt: String
    let updatedAt: String
    let likedAt: String
}
struct LikedProjectPage: Codable, Equatable, Sendable { let projects: [LikedProjectSummary]; let page: Int; let pageSize: Int; let hasMore: Bool; let total: Int }

/// Community list projection. It intentionally excludes canvasData, beadList,
/// sourceImage and other detail-only fields returned by GET /community/posts/:id.
struct CommunityPostSummary: Codable, Identifiable, Equatable, Sendable {
    let id: String
    let name: String
    let rows: Int
    let cols: Int
    let tone: String
    let thumbnailImage: String?
    let sharedAt: String?
    let likesCount: Int
    let commentsCount: Int
    let authorId: String
    let author: String
    let authorAvatar: String?
    let likedByMe: Bool
    let isFollowing: Bool
    let tags: [String]
}

struct CommunityPostPage: Codable, Equatable, Sendable {
    let posts: [CommunityPostSummary]
    let tagCounts: [CommunityTagCount]
    let page: Int
    let pageSize: Int
}

struct CommunityTagCount: Codable, Equatable, Sendable { let tag: String; let count: Int }

struct CommunityPostDetail: Codable, Equatable, Sendable {
    let id: String
    let name: String
    let rows: Int
    let cols: Int
    let tone: String
    let sourceImage: String?
    let thumbnailImage: String?
    let beadList: [ProjectBeadCount]
    let sharedAt: String?
    let authorId: String
    let author: String
    let authorAvatar: String?
    let isFollowing: Bool
    let likesCount: Int
    let commentsCount: Int
    let likedByMe: Bool
    let tags: [String]
}

struct CommunityLikeResult: Codable, Equatable, Sendable { let liked: Bool; let likesCount: Int }
/// The copy endpoint intentionally returns a small creation result rather than
/// reusing a list summary or requiring the caller to decode unrelated detail
/// fields. The editor re-fetches the complete project only when it is opened.
struct CommunityCopiedProject: Codable, Equatable, Sendable {
    let id: String
    let name: String
    let rows: Int
    let cols: Int
    let tone: String
    let sourceImage: String?
    let thumbnailImage: String?
    let canvasData: String
    let revision: Int
    let createdAt: String
    let updatedAt: String
}
struct CommunityProjectCopyResponse: Codable, Equatable, Sendable { let project: CommunityCopiedProject }
struct CommunityComment: Codable, Equatable, Sendable, Identifiable {
    let id: String
    let projectId: String
    let content: String
    let parentId: String?
    let replyToUserId: String?
    let replyToUserName: String?
    let createdAt: String
    let authorId: String
    let author: String
    let authorAvatar: String?
    let replies: [CommunityComment]
}
struct CommunityCommentsPage: Codable, Equatable, Sendable { let comments: [CommunityComment]; let page: Int; let pageSize: Int; let hasMore: Bool; let totalTopLevel: Int; let totalComments: Int }
struct CommunityAuthorProfile: Codable, Equatable, Sendable, Identifiable { let id: String; let name: String; let avatarUrl: String?; let postsCount: Int; let likesCount: Int; let followersCount: Int; let isFollowing: Bool }
struct CommunityAuthorPage: Codable, Equatable, Sendable { let profile: CommunityAuthorProfile; let posts: [CommunityPostSummary]; let page: Int; let pageSize: Int }
struct CommunityFollowResult: Codable, Equatable, Sendable { let following: Bool; let followersCount: Int; let followingCount: Int }
struct CommunityUserSummary: Codable, Equatable, Sendable, Identifiable { let id: String; let name: String; let avatarUrl: String? }
struct CommunityUserList: Codable, Equatable, Sendable { let users: [CommunityUserSummary] }
struct CommunityCommentDeleteResult: Codable, Equatable, Sendable { let deletedCount: Int }
struct CommunityNotification: Codable, Equatable, Sendable, Identifiable { let id: String; let type: String; let projectId: String?; let commentId: String?; let content: String; let createdAt: String; let readAt: String?; let senderId: String; let senderName: String; let senderAvatar: String?; let isRead: Bool }
struct CommunityNotificationsPage: Codable, Equatable, Sendable { let notifications: [CommunityNotification]; let unreadCount: Int; let page: Int; let pageSize: Int }

enum CommunityMessageTime {
    static func display(_ value: String, now: Date = .now, calendar: Calendar = .current) -> String {
        let formatter = ISO8601DateFormatter()
        guard let date = formatter.date(from: value) else { return "" }
        let output = DateFormatter()
        output.locale = Locale(identifier: "zh_CN")
        output.calendar = calendar
        output.timeZone = calendar.timeZone
        output.dateFormat = calendar.isDate(date, inSameDayAs: now) ? "HH:mm" : "MM-dd"
        return output.string(from: date)
    }
}

enum CommunityPostPresentation {
    static func publicationTime(_ value: String) -> String {
        let parser = ISO8601DateFormatter()
        guard let date = parser.date(from: value) else { return "时间未知" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.timeZone = TimeZone(identifier: "Asia/Shanghai")
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        return formatter.string(from: date)
    }

    static func physicalSize(cols: Int, rows: Int) -> String {
        func centimeters(_ cells: Int) -> String {
            let value = (Double(max(0, cells)) * 2.6 / 10 * 100).rounded() / 100
            return value.rounded() == value ? String(Int(value)) : String(value)
        }
        return "\(centimeters(cols)) × \(centimeters(rows)) cm"
    }
}

struct APIUser: Codable, Equatable, Sendable {
    let id: String
    let nickname: String
    let avatarUrl: String?
}
struct PhoneAuthResponse: Decodable, Equatable, Sendable {
    let accessToken: String
    let user: APIUser
    let expiresIn: Int
}
struct PhoneAuthEnvelope: Decodable { let data: PhoneAuthResponse }
struct PhoneAuthMe: Decodable, Equatable, Sendable { let user: APIUser }
struct PhoneAuthMeEnvelope: Decodable { let data: PhoneAuthMe }
struct SmsChallenge: Decodable, Equatable, Sendable { let challengeId: String; let seed: String; let signVersion: String; let serverTime: Int64; let expiresIn: Int }
struct SmsCodeResponse: Decodable, Equatable, Sendable { let smsRequestId: String; let retryAfter: Int }
struct SmsChallengeEnvelope: Decodable { let data: SmsChallenge }
struct SmsCodeEnvelope: Decodable { let data: SmsCodeResponse }

struct StoredPhoneSession: Codable, Equatable, Sendable { let accessToken: String; let user: APIUser }

enum SecureSessionStore {
    private static let service = "com.qiaoqiaole.ios.auth"
    private static let account = "phone-session"

    static func load() -> StoredPhoneSession? {
        let query: [CFString: Any] = [kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: account, kSecReturnData: true, kSecMatchLimit: kSecMatchLimitOne]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(StoredPhoneSession.self, from: data)
    }

    static func save(_ session: StoredPhoneSession) throws {
        let data = try JSONEncoder().encode(session)
        let query: [CFString: Any] = [kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: account]
        let attributes: [CFString: Any] = [kSecValueData: data, kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var insert = query
            attributes.forEach { insert[$0.key] = $0.value }
            let insertStatus = SecItemAdd(insert as CFDictionary, nil)
            guard insertStatus == errSecSuccess else { throw APIError(message: "无法安全保存登录状态") }
        } else if status != errSecSuccess {
            throw APIError(message: "无法安全保存登录状态")
        }
    }

    static func clear() {
        let query: [CFString: Any] = [kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: account]
        SecItemDelete(query as CFDictionary)
    }
}
struct AccountProfile: Codable, Equatable, Sendable { let user: APIUser; let followersCount: Int; let followingCount: Int; let likesCount: Int }

struct APIError: LocalizedError, Equatable {
    let message: String
    let status: Int?
    let code: String?
    let session: BeadingSession?
    init(message: String, status: Int? = nil, code: String? = nil, session: BeadingSession? = nil) { self.message = message; self.status = status; self.code = code; self.session = session }
    var errorDescription: String? { message }
}

struct APIErrorPayload: Decodable { let error: String?; let message: String?; let session: BeadingSession? }

enum APIBaseURLConfiguration {
    static let localDevelopmentDefault = URL(string: "http://127.0.0.1:3000/api")!

    static func resolve(configured: String?, fallback: URL?) -> URL? {
        let value = configured?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !value.isEmpty, let url = URL(string: value), let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https", url.host != nil else {
            return fallback
        }
        return url
    }

    static var applicationBaseURL: URL? {
        let configured = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String
        #if DEBUG
        return resolve(configured: configured, fallback: localDevelopmentDefault)
        #else
        return resolve(configured: configured, fallback: nil)
        #endif
    }
}

actor APIClient {
    static let localDefault = APIBaseURLConfiguration.localDevelopmentDefault
    private let baseURL: URL?
    private let session: URLSession

    init(baseURL: URL? = APIBaseURLConfiguration.applicationBaseURL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func request<Response: Decodable>(_ path: String, method: String = "GET", token: String? = nil, body: (any Encodable)? = nil, headers: [String: String] = [:]) async throws -> Response {
        let url = try url(for: path)
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "accept")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization") }
        headers.forEach { request.setValue($0.value, forHTTPHeaderField: $0.key) }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "content-type")
            request.httpBody = try JSONEncoder().encode(AnyEncodable(body))
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError(message: "服务器响应无效") }
        guard (200...299).contains(http.statusCode) else {
            let payload = try? JSONDecoder().decode(APIErrorPayload.self, from: data)
            throw APIError(message: payload?.message ?? Self.errorMessage(data) ?? "请求失败（\(http.statusCode)）", status: http.statusCode, code: payload?.error, session: payload?.session)
        }
        do { return try JSONDecoder().decode(Response.self, from: data) }
        catch { throw APIError(message: "服务器数据格式无效") }
    }

    private func url(for path: String) throws -> URL {
        guard let baseURL else { throw APIError(message: "未配置生产 API 地址") }
        guard let url = URL(string: path.trimmingCharacters(in: CharacterSet(charactersIn: "/")), relativeTo: baseURL.appendingPathComponent("/")) else {
            throw APIError(message: "接口地址无效")
        }
        return url
    }

    private static func errorMessage(_ data: Data) -> String? {
        (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["message"] as? String
    }
}

enum AppAssetURL {
    static func url(for value: String?) -> URL? {
        guard let raw = value?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else { return nil }
        if let absolute = URL(string: raw), absolute.scheme != nil { return absolute }
        guard let apiBase = APIBaseURLConfiguration.applicationBaseURL else { return nil }
        guard var origin = URLComponents(url: apiBase, resolvingAgainstBaseURL: false) else { return nil }
        origin.path = ""; origin.query = nil; origin.fragment = nil
        return URL(string: raw, relativeTo: origin.url)
    }
}

struct ProjectRepository {
    let client: APIClient

    func login(phone: String, password: String, deviceID: String) async throws -> PhoneAuthResponse {
        let response: PhoneAuthEnvelope = try await client.request("v1/auth/sms/login", method: "POST", body: PhoneLoginInput(phone: phone, password: password, agreementVersion: "privacy-2026-08-01", device: PhoneAuthDevice(platform: "ios", deviceId: deviceID, appVersion: "1.0.0")))
        return response.data
    }

    func requestSmsCode(phone: String, deviceID: String) async throws -> SmsCodeResponse {
        let challenge: SmsChallengeEnvelope = try await client.request("v1/auth/sms/challenge", method: "POST", body: SmsChallengeInput(platform: "ios", deviceId: deviceID))
        let challengeData = challenge.data
        guard challengeData.signVersion == "mobile-v1" else { throw APIError(message: "认证签名版本不匹配") }
        let body = SmsSendInput(phone: phone, scene: "REGISTER", captchaTicket: "", captchaRandstr: "", deviceId: deviceID)
        let requestID = UUID().uuidString
        let nonce = Self.base64URL(Data((0..<24).map { _ in UInt8.random(in: .min ... .max) }))
        let signature = try Self.signedSmsRequest(phone: phone, seed: challengeData.seed, deviceID: deviceID, requestID: requestID, nonce: nonce, challengeID: challengeData.challengeId, timestamp: challengeData.serverTime)
        let response: SmsCodeEnvelope = try await client.request("v1/auth/sms/send", method: "POST", body: body, headers: ["x-client-platform": "ios", "x-client-version": "1.0.0", "x-sign-version": "mobile-v1", "x-request-id": requestID, "x-timestamp": String(challengeData.serverTime), "x-nonce": nonce, "x-challenge-id": challengeData.challengeId, "x-signature": signature])
        return response.data
    }

    func register(phone: String, password: String, code: String, smsRequestID: String, deviceID: String) async throws -> PhoneAuthResponse {
        let response: PhoneAuthEnvelope = try await client.request("v1/auth/sms/register", method: "POST", body: PhoneRegisterInput(phone: phone, password: password, confirmPassword: password, smsRequestId: smsRequestID, code: code, agreementVersion: "privacy-2026-08-01", device: PhoneAuthDevice(platform: "ios", deviceId: deviceID, appVersion: "1.0.0")))
        return response.data
    }

    func refreshPhoneSession() async throws -> PhoneAuthResponse {
        let response: PhoneAuthEnvelope = try await client.request("v1/auth/token/refresh", method: "POST", body: EmptyRequest())
        return response.data
    }

    func phoneCurrentUser(token: String) async throws -> APIUser {
        let response: PhoneAuthMeEnvelope = try await client.request("v1/auth/me", token: token)
        return response.data.user
    }

    static func signedSmsRequest(phone: String, seed: String, deviceID: String, requestID: String, nonce: String, challengeID: String, timestamp: Int64) throws -> String {
        let normalized = "{\"captchaRandstr\":\"\",\"captchaTicket\":\"\",\"deviceId\":\"\(deviceID)\",\"phone\":\"\(phone)\",\"scene\":\"REGISTER\"}"
        let bodyHash = SHA256.hash(data: Data(normalized.utf8)).map { String(format: "%02x", $0) }.joined()
        let canonical = ["SMS_SEND", "POST", "/api/v1/auth/sms/send", "ios", "mobile-v1", String(timestamp), requestID, nonce, challengeID, bodyHash].joined(separator: "\n")
        let rotatedSeed = String(seed.dropFirst(7)) + String(seed.prefix(7))
        let keyMaterial = "\(rotatedSeed)|\(deviceID)|\(String(requestID.reversed()))|M1|qiaoqiaole-h5"
        let key = SymmetricKey(data: SHA256.hash(data: Data(keyMaterial.utf8)))
        return base64URL(Data(HMAC<SHA256>.authenticationCode(for: Data(canonical.utf8), using: key)))
    }

    private static func base64URL(_ data: Data) -> String { data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") }

    func accountProfile(token: String) async throws -> AccountProfile { try await client.request("me", token: token) }

    func updateProfile(nickname: String, avatarUrl: String?, token: String) async throws -> APIUser {
        let response: AccountProfileUpdate = try await client.request("profile", method: "PATCH", token: token, body: AccountProfileUpdateInput(nickname: nickname, avatarUrl: avatarUrl))
        return response.user
    }

    func projects(token: String, page: Int = 1, pageSize: Int = 12, folderID: String? = nil) async throws -> ProjectPage {
        var components = URLComponents()
        components.queryItems = [URLQueryItem(name: "page", value: String(page)), URLQueryItem(name: "pageSize", value: String(min(max(pageSize, 1), 50)))]
        if let folderID, folderID != "all" { components.queryItems?.append(URLQueryItem(name: "folder", value: folderID)) }
        return try await client.request("projects?\(components.percentEncodedQuery ?? "")", token: token)
    }

    func likedProjects(token: String, page: Int = 1, pageSize: Int = 50) async throws -> LikedProjectPage {
        try await client.request("projects/liked?page=\(max(1, page))&pageSize=\(min(max(pageSize, 1), 50))", token: token)
    }

    func folders(token: String) async throws -> [ProjectFolder] {
        let response: FolderResponse = try await client.request("project-folders", token: token)
        return response.folders
    }

    func detail(id: String, token: String) async throws -> ProjectDetail {
        let response: DetailResponse = try await client.request("projects/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)", token: token)
        return response.project
    }

    func save(_ input: ProjectSaveInput, token: String) async throws -> ProjectDetail {
        let response: DetailResponse = try await client.request(
            input.projectID.map { "projects/\($0.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? $0)" } ?? "projects",
            method: input.projectID == nil ? "POST" : "PUT", token: token, body: input
        )
        return response.project
    }

    func createFolder(name: String, token: String) async throws -> ProjectFolder {
        let response: CreateFolderResponse = try await client.request("project-folders", method: "POST", token: token, body: FolderNameInput(name: name))
        return response.folder
    }

    func moveProject(id: String, folderID: String?, token: String) async throws {
        let _: MoveProjectResponse = try await client.request("projects/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)/folder", method: "PATCH", token: token, body: MoveProjectInput(folderId: folderID))
    }

    func deleteProject(id: String, token: String) async throws {
        let _: DeleteProjectResponse = try await client.request("projects/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)", method: "DELETE", token: token)
    }

    func deleteFolder(id: String, token: String) async throws {
        let _: DeleteFolderResponse = try await client.request("project-folders/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)", method: "DELETE", token: token)
    }

    func renameFolder(id: String, name: String, token: String) async throws -> ProjectFolder {
        let response: CreateFolderResponse = try await client.request("project-folders/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)", method: "PATCH", token: token, body: FolderNameInput(name: name))
        return response.folder
    }

    func uploadProjectImages(_ images: [ProjectUploadImage], token: String) async throws -> ProjectImagePaths {
        let response: ProjectImagePaths = try await client.request("uploads/projects", method: "POST", token: token, body: ProjectUploadRequest(images: images))
        return response
    }

    func shareProject(id: String, tags: [String], token: String) async throws -> ProjectShareResult {
        try await client.request("projects/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)/share", method: "POST", token: token, body: CommunityTagsInput(tags: tags))
    }

    func communityTags(id: String) async throws -> [String] {
        let response: CommunityPostResponse = try await client.request("community/posts/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)")
        return response.post.tags
    }

    func communityPosts(token: String?, sort: String = "hot", page: Int = 1, pageSize: Int = 12, query: String? = nil, tags: [String] = []) async throws -> CommunityPostPage {
        var components = URLComponents()
        components.queryItems = [
            URLQueryItem(name: "sort", value: sort == "latest" ? "latest" : "hot"),
            URLQueryItem(name: "page", value: String(max(1, page))),
            URLQueryItem(name: "pageSize", value: String(min(max(pageSize, 1), 50))),
        ]
        if let query = query?.trimmingCharacters(in: .whitespacesAndNewlines), !query.isEmpty { components.queryItems?.append(URLQueryItem(name: "q", value: String(query.prefix(60)))) }
        if !tags.isEmpty { components.queryItems?.append(URLQueryItem(name: "tags", value: tags.joined(separator: ","))) }
        let queryString = components.percentEncodedQuery ?? ""
        return try await client.request("community/posts?" + queryString, token: token)
    }

    func communityPost(id: String, token: String? = nil) async throws -> CommunityPostDetail {
        let response: CommunityDetailResponse = try await client.request("community/posts/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)", token: token)
        return response.post
    }

    func setCommunityLike(id: String, liked: Bool, token: String) async throws -> CommunityLikeResult {
        try await client.request("community/posts/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)/like", method: liked ? "POST" : "DELETE", token: token)
    }

    func copyCommunityPost(id: String, token: String) async throws -> CommunityCopiedProject {
        let response: CommunityProjectCopyResponse = try await client.request("projects/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)/copy", method: "POST", token: token)
        return response.project
    }

    func communityComments(postID: String, page: Int = 1, pageSize: Int = 20, token: String? = nil) async throws -> CommunityCommentsPage {
        try await client.request("community/posts/\(postID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? postID)/comments?page=\(max(1, page))&pageSize=\(min(max(pageSize, 1), 50))", token: token)
    }

    func createCommunityComment(postID: String, content: String, parentID: String? = nil, token: String) async throws -> CommunityComment {
        let response: CommunityCommentResponse = try await client.request("community/posts/\(postID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? postID)/comments", method: "POST", token: token, body: CommunityCommentInput(content: content, parentId: parentID))
        return response.comment
    }

    func deleteCommunityComment(postID: String, commentID: String, token: String) async throws -> CommunityCommentDeleteResult {
        try await client.request("community/posts/\(postID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? postID)/comments/\(commentID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? commentID)", method: "DELETE", token: token)
    }

    func communityAuthor(id: String, page: Int = 1, token: String? = nil) async throws -> CommunityAuthorPage {
        try await client.request("community/users/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)/profile?page=\(max(1, page))&pageSize=20", token: token)
    }

    func setFollow(authorID: String, following: Bool, token: String) async throws -> CommunityFollowResult {
        try await client.request("community/users/\(authorID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? authorID)/follow", method: following ? "POST" : "DELETE", token: token)
    }

    func socialUsers(following: Bool, token: String) async throws -> [CommunityUserSummary] {
        let response: CommunityUserList = try await client.request(following ? "community/following" : "community/followers", token: token)
        return response.users
    }

    func notifications(token: String, page: Int = 1, pageSize: Int = 20) async throws -> CommunityNotificationsPage {
        try await client.request("notifications?page=\(max(1, page))&pageSize=\(min(max(pageSize, 1), 50))", token: token)
    }

    func markNotificationRead(id: String, token: String) async throws {
        let _: NotificationReadResponse = try await client.request("notifications/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)/read", method: "PATCH", token: token)
    }

    func updateCommunityTags(id: String, tags: [String], token: String) async throws -> [String] {
        let response: CommunityTagsUpdateResponse = try await client.request("projects/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)/community-tags", method: "PATCH", token: token, body: CommunityTagsInput(tags: tags))
        return response.tags
    }

    func warehouses(token: String) async throws -> [WarehouseSummary] {
        let response: WarehouseListResponse = try await client.request("warehouses", token: token)
        return response.warehouses
    }

    func createWarehouse(name: String, remark: String, token: String) async throws -> WarehouseCreated {
        let response: WarehouseCreationResponse = try await client.request("warehouses", method: "POST", token: token, body: WarehouseCreateInput(name: name, remark: remark))
        return response.warehouse
    }

    func deleteWarehouse(id: String, token: String) async throws {
        let _: WarehouseDeleteResponse = try await client.request("warehouses/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)", method: "DELETE", token: token)
    }

    func warehouseInventory(id: String, token: String) async throws -> [String: Int] {
        let response: WarehouseInventory = try await client.request("warehouses/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)/inventory", token: token)
        return response.inventory
    }

    func warehouseTransactions(id: String, token: String, page: Int = 1, pageSize: Int = 20) async throws -> WarehouseTransactionsPage {
        try await client.request("warehouses/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)/transactions?page=\(max(1, page))&pageSize=\(min(max(1, pageSize), 50))", token: token)
    }

    func mutateWarehouseInventory(id: String, codes: [String], type: WarehouseInventoryMutation.Kind, quantity: Int, inputUnit: WarehouseInventoryMutation.Unit = .count, inputValue: Double? = nil, token: String) async throws -> [String: Int] {
        let response: WarehouseInventory = try await client.request(
            "warehouses/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)/inventory",
            method: "POST", token: token,
            body: WarehouseInventoryMutation(codes: codes, type: type, quantity: quantity, inputUnit: inputUnit, inputValue: inputValue ?? Double(quantity))
        )
        return response.inventory
    }

    func beadingSession(projectID: String, token: String) async throws -> BeadingSession? {
        let response: BeadingSessionEnvelope = try await client.request("v1/projects/\(projectID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? projectID)/beading-session", token: token)
        return response.session
    }

    func createBeadingSession(projectID: String, warehouseID: String?, token: String) async throws -> BeadingSession {
        let response: BeadingSessionEnvelope = try await client.request("v1/projects/\(projectID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? projectID)/beading-session", method: "POST", token: token, body: BeadingSessionStartInput(warehouseId: warehouseID))
        guard let session = response.session else { throw APIError(message: "服务端未返回拼豆会话") }
        return session
    }

    func inventoryCheck(sessionID: String, warehouseID: String? = nil, token: String) async throws -> InventoryCheck {
        let response: InventoryCheck = try await client.request("v1/beading-sessions/\(sessionID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? sessionID)/inventory-check", method: "POST", token: token, body: BeadingInventoryCheckInput(warehouseId: warehouseID))
        return response
    }

    func patchBeadingSession(_ session: BeadingSession, completedCodes: [String], elapsedSeconds: Int, token: String) async throws -> BeadingSession {
        let response: BeadingSessionEnvelope = try await client.request("v1/beading-sessions/\(session.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? session.id)", method: "PATCH", token: token, body: BeadingPatchInput(completedColorCodes: completedCodes, elapsedSeconds: elapsedSeconds, version: session.version))
        guard let session = response.session else { throw APIError(message: "服务端未返回拼豆会话") }; return session
    }

    func transitionBeadingSession(_ session: BeadingSession, action: BeadingTransitionInput.Action, token: String) async throws -> BeadingSession {
        let response: BeadingSessionEnvelope = try await client.request("v1/beading-sessions/\(session.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? session.id)/\(action.path)", method: "POST", token: token, body: BeadingTransitionInput(version: session.version, action: action))
        guard let session = response.session else { throw APIError(message: "服务端未返回拼豆会话") }; return session
    }

    func completeBeadingSession(_ session: BeadingSession, deductInventory: Bool, warehouseID: String?, idempotencyKey: String, token: String) async throws -> BeadingCompletionResult {
        try await client.request(
            "v1/beading-sessions/\(session.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? session.id)/complete",
            method: "POST", token: token,
            body: BeadingCompletionInput(idempotencyKey: idempotencyKey, deductInventory: deductInventory, warehouseId: warehouseID)
        )
    }
}

struct ProjectSaveInput: Encodable {
    let projectID: String?
    let name: String
    let rows: Int
    let cols: Int
    let canvasData: String
    let beadList: [ProjectBeadCount]
    let tone: String
    let folderId: String?
    let sourceImagePath: String?
    let thumbnailImagePath: String?
    enum CodingKeys: String, CodingKey { case name, rows, cols, canvasData, beadList, tone, folderId, sourceImagePath, thumbnailImagePath }
}

struct ProjectUploadImage: Encodable {
    let kind: String
    let filename: String
    let dataUrl: String
    static func png(kind: String, filename: String, data: Data) -> ProjectUploadImage {
        ProjectUploadImage(kind: kind, filename: filename, dataUrl: "data:image/png;base64,\(data.base64EncodedString())")
    }
    static func jpeg(kind: String, filename: String, data: Data) -> ProjectUploadImage {
        ProjectUploadImage(kind: kind, filename: filename, dataUrl: "data:image/jpeg;base64,\(data.base64EncodedString())")
    }
}

private struct ProjectUploadRequest: Encodable { let images: [ProjectUploadImage] }
struct ProjectImagePaths: Decodable { let sourceImagePath: String?; let thumbnailImagePath: String? }
struct ProjectShareResult: Decodable { let shared: Bool; let sharedAt: String?; let projectId: String; let tags: [String] }
struct CommunityPostResponse: Decodable { let post: CommunityPostTags }
struct CommunityPostTags: Decodable { let tags: [String] }
struct CommunityDetailResponse: Decodable { let post: CommunityPostDetail }
struct CommunityTagsUpdateResponse: Decodable { let projectId: String; let tags: [String] }
struct WarehouseListResponse: Decodable { let warehouses: [WarehouseSummary] }
struct WarehouseCreated: Decodable, Equatable { let id: String; let name: String; let remark: String?; let colorSystem: String; let createdAt: String; let updatedAt: String }
struct WarehouseCreationResponse: Decodable { let warehouse: WarehouseCreated }
struct WarehouseDeleteResponse: Decodable, Equatable { let deleted: Bool; let warehouseId: String }
private struct WarehouseCreateInput: Encodable { let name: String; let remark: String }
struct WarehouseInventoryMutation: Encodable {
    enum Kind: String, Encodable { case `in`, out }
    enum Unit: String, Encodable { case count, gram }
    let codes: [String]
    let type: Kind
    let quantity: Int
    let inputUnit: Unit
    let inputValue: Double
}
struct BeadingSessionEnvelope: Decodable { let session: BeadingSession? }
private struct BeadingSessionStartInput: Encodable { let warehouseId: String? }
private struct BeadingInventoryCheckInput: Encodable { let warehouseId: String? }
private struct BeadingPatchInput: Encodable { let completedColorCodes: [String]; let elapsedSeconds: Int; let version: Int }
struct BeadingTransitionInput: Encodable {
    enum Action: String { case pause, resume, prepareCompletion = "prepare-completion", returnToProgress = "return-to-progress", abandon
        var path: String { rawValue }
    }
    let version: Int
    let action: Action
    enum CodingKeys: String, CodingKey { case version }
}
struct BeadingCompletionResult: Decodable { let session: BeadingSession; let warehouseId: String?; let deducted: Bool; let replay: Bool? }
private struct BeadingCompletionInput: Encodable { let idempotencyKey: String; let deductInventory: Bool; let warehouseId: String? }
private struct CommunityTagsInput: Encodable { let tags: [String] }
private struct CommunityCommentResponse: Decodable { let comment: CommunityComment }
private struct CommunityCommentInput: Encodable { let content: String; let parentId: String? }
private struct NotificationReadResponse: Decodable { let read: Bool; let notificationId: String }

@MainActor
final class AppSession: ObservableObject {
    @Published private(set) var token: String?
    @Published private(set) var user: APIUser?
    @Published private(set) var loginError: String?
    @Published private(set) var unreadNotificationCount = 0
    let projects: ProjectRepository

    init(repository: ProjectRepository = ProjectRepository(client: APIClient())) {
        self.projects = repository
        if let stored = SecureSessionStore.load() { token = stored.accessToken; user = stored.user }
    }

    func login(phone: String, password: String) async -> Bool {
        loginError = nil
        do {
            let result = try await projects.login(phone: try Self.normalizedPhone(phone), password: password, deviceID: Self.deviceID)
            try SecureSessionStore.save(StoredPhoneSession(accessToken: result.accessToken, user: result.user))
            token = result.accessToken; user = result.user
            return true
        } catch {
            loginError = error.localizedDescription
            return false
        }
    }

    func requestSmsCode(phone: String) async throws -> SmsCodeResponse {
        try await projects.requestSmsCode(phone: try Self.normalizedPhone(phone), deviceID: Self.deviceID)
    }

    func updateUnreadNotificationCount(_ count: Int) {
        unreadNotificationCount = max(0, count)
    }

    func register(phone: String, password: String, code: String, smsRequestID: String) async -> Bool {
        loginError = nil
        do {
            let result = try await projects.register(phone: try Self.normalizedPhone(phone), password: password, code: code, smsRequestID: smsRequestID, deviceID: Self.deviceID)
            try SecureSessionStore.save(StoredPhoneSession(accessToken: result.accessToken, user: result.user))
            token = result.accessToken; user = result.user
            return true
        } catch {
            loginError = error.localizedDescription
            return false
        }
    }

    func validateRestoredSession() async {
        guard let currentToken = token else { return }
        do {
            let currentUser = try await projects.phoneCurrentUser(token: currentToken)
            user = currentUser
            try SecureSessionStore.save(StoredPhoneSession(accessToken: currentToken, user: currentUser))
        } catch let error as APIError where error.status == 401 {
            do {
                let refreshed = try await projects.refreshPhoneSession()
                try SecureSessionStore.save(StoredPhoneSession(accessToken: refreshed.accessToken, user: refreshed.user))
                token = refreshed.accessToken; user = refreshed.user
            } catch { logout() }
        } catch {
            // Preserve the cached session when the device is offline.
        }
    }

    func logout() { SecureSessionStore.clear(); token = nil; user = nil; loginError = nil; unreadNotificationCount = 0 }

    private static var deviceID: String {
        let key = "qiaoqiaole.phone-auth.device-id"
        if let existing = UserDefaults.standard.string(forKey: key), !existing.isEmpty { return existing }
        let next = UUID().uuidString
        UserDefaults.standard.set(next, forKey: key)
        return next
    }

    private static func normalizedPhone(_ value: String) throws -> String {
        let compact = value.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: "-", with: "")
        let digits = compact.hasPrefix("+86") ? String(compact.dropFirst(3)) : (compact.hasPrefix("86") ? String(compact.dropFirst(2)) : compact)
        guard digits.range(of: "^1[3-9]\\d{9}$", options: .regularExpression) != nil else { throw APIError(message: "请输入正确的手机号") }
        return "+86\(digits)"
    }
}

@MainActor
final class ProjectListStore: ObservableObject {
    @Published private(set) var projects: [ProjectSummary] = []
    @Published private(set) var folders: [ProjectFolder] = []
    @Published private(set) var isLoading = false
    @Published private(set) var hasMore = false
    @Published private(set) var error: String?
    @Published var selectedFolderID: String? = "all"
    private var page = 1
    private var requestID = UUID()

    func load(repository: ProjectRepository, token: String, reset: Bool = true) async {
        let id = UUID(); requestID = id
        isLoading = true; error = nil
        let targetPage = reset ? 1 : page + 1
        do {
            async let pageResult = repository.projects(token: token, page: targetPage, folderID: selectedFolderID)
            async let foldersResult = repository.folders(token: token)
            let (result, folderResult) = try await (pageResult, foldersResult)
            guard requestID == id else { return }
            projects = reset ? result.projects : projects + result.projects
            folders = folderResult; page = result.page; hasMore = result.hasMore
        } catch {
            guard requestID == id else { return }
            self.error = error.localizedDescription
            if reset { projects = []; hasMore = false }
        }
        if requestID == id { isLoading = false }
    }

    func selectFolder(_ id: String?, repository: ProjectRepository, token: String) async {
        guard selectedFolderID != id else { return }
        selectedFolderID = id
        await load(repository: repository, token: token)
    }
}

private struct PhoneLoginInput: Encodable { let phone: String; let password: String; let agreementVersion: String; let device: PhoneAuthDevice }
private struct PhoneRegisterInput: Encodable { let phone: String; let password: String; let confirmPassword: String; let smsRequestId: String; let code: String; let agreementVersion: String; let device: PhoneAuthDevice }
private struct PhoneAuthDevice: Encodable { let platform: String; let deviceId: String; let appVersion: String }
private struct SmsChallengeInput: Encodable { let platform: String; let deviceId: String }
private struct SmsSendInput: Encodable { let phone: String; let scene: String; let captchaTicket: String; let captchaRandstr: String; let deviceId: String }
private struct EmptyRequest: Encodable {}
private struct AccountProfileUpdateInput: Encodable { let nickname: String; let avatarUrl: String? }
struct AccountProfileUpdate: Decodable { let user: APIUser }
struct FolderResponse: Decodable { let folders: [ProjectFolder] }
struct DetailResponse: Decodable { let project: ProjectDetail }
struct CreateFolderResponse: Decodable { let folder: ProjectFolder }
struct MoveProjectResponse: Decodable { let project: ProjectMoveResult }
struct ProjectMoveResult: Decodable { let id: String; let folderId: String?; let updatedAt: String }
private struct DeleteProjectResponse: Decodable { let deleted: Bool; let projectId: String }
private struct DeleteFolderResponse: Decodable { let deleted: Bool; let folderId: String }
private struct FolderNameInput: Encodable { let name: String }
private struct MoveProjectInput: Encodable { let folderId: String? }
private struct AnyEncodable: Encodable {
    private let encodeBody: (Encoder) throws -> Void
    init(_ value: any Encodable) { encodeBody = value.encode }
    func encode(to encoder: Encoder) throws { try encodeBody(encoder) }
}
