import XCTest
@testable import QiaoQiaoLe

final class ProjectAPITests: XCTestCase {
    @MainActor
    func testLogoutClearsUnreadNotificationBadgeState() {
        let session = AppSession()
        session.updateUnreadNotificationCount(3)
        XCTAssertEqual(session.unreadNotificationCount, 3)
        session.logout()
        XCTAssertEqual(session.unreadNotificationCount, 0)
    }

    func testProjectSummaryDoesNotRequireDetailPayload() throws {
        let data = Data(#"{"id":"p1","folderId":null,"name":"小熊","rows":12,"cols":16,"tone":"recent-bear","thumbnailImage":null,"sharedToCommunity":false,"sharedAt":null,"likesCount":0,"createdAt":"2026-01-01","updatedAt":"2026-01-02"}"#.utf8)
        let summary = try JSONDecoder().decode(ProjectSummary.self, from: data)
        XCTAssertEqual(summary.id, "p1")
        XCTAssertEqual(summary.cols, 16)
    }

    func testProjectPageProvidesProfileCountFromListSummaryOnly() throws {
        let data = Data(#"{"projects":[{"id":"p1","folderId":null,"name":"小熊","rows":12,"cols":16,"tone":"recent-bear","thumbnailImage":null,"sharedToCommunity":false,"sharedAt":null,"likesCount":0,"createdAt":"2026-01-01","updatedAt":"2026-01-02"}],"page":1,"pageSize":1,"hasMore":true,"total":28}"#.utf8)
        let page = try JSONDecoder().decode(ProjectPage.self, from: data)
        XCTAssertEqual(page.total, 28)
        XCTAssertEqual(page.projects.map(\.id), ["p1"])
    }

    func testLikedProjectPageUsesItsOwnFolderlessListProjection() throws {
        let data = Data(#"{"projects":[{"id":"liked-1","name":"喜欢的稿件","rows":12,"cols":16,"tone":"recent-bear","thumbnailImage":null,"sharedToCommunity":true,"sharedAt":"2026-08-25","likesCount":12,"createdAt":"2026-08-20","updatedAt":"2026-08-25","likedAt":"2026-08-25T10:00:00.000Z"}],"page":1,"pageSize":50,"hasMore":false,"total":1}"#.utf8)
        let page = try JSONDecoder().decode(LikedProjectPage.self, from: data)
        XCTAssertEqual(page.projects.first?.id, "liked-1")
        XCTAssertEqual(page.projects.first?.likedAt, "2026-08-25T10:00:00.000Z")
    }

    func testProjectDetailDecodesCanvasOnlyFromDetailResponse() throws {
        let data = Data(#"{"id":"p1","folderId":null,"name":"小熊","rows":12,"cols":16,"tone":"recent-bear","sourceImage":null,"thumbnailImage":null,"canvasData":"grid-payload","beadList":"[]","revision":3,"sharedToCommunity":false,"sharedAt":null,"likesCount":0,"createdAt":"2026-01-01","updatedAt":"2026-01-02"}"#.utf8)
        XCTAssertEqual(try JSONDecoder().decode(ProjectDetail.self, from: data).canvasData, "grid-payload")
    }
    func testSavePayloadOmitsLocalProjectIDAndKeepsCanvas() throws {
        let input = ProjectSaveInput(projectID: "p1", name: "作品", rows: 2, cols: 3, canvasData: "[]", beadList: [ProjectBeadCount(color: "B01", count: 2)], tone: "recent-flower", folderId: nil, sourceImagePath: nil, thumbnailImagePath: "asset")
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(input)) as? [String: Any]
        XCTAssertNil(json?["projectID"])
        XCTAssertEqual(json?["canvasData"] as? String, "[]")
        XCTAssertEqual((json?["beadList"] as? [[String: Any]])?.first?["color"] as? String, "B01")
        XCTAssertEqual(json?["thumbnailImagePath"] as? String, "asset")
    }
    func testUploadImageUsesAcceptedDataURLType() {
        let image = ProjectUploadImage.png(kind: "thumbnail", filename: "thumbnail.png", data: Data([1, 2, 3]))
        XCTAssertEqual(image.kind, "thumbnail")
        XCTAssertTrue(image.dataUrl.hasPrefix("data:image/png;base64,"))
        XCTAssertTrue(ProjectUploadImage.jpeg(kind: "source", filename: "source.jpg", data: Data([1])).dataUrl.hasPrefix("data:image/jpeg;base64,"))
    }
    func testShareResponseDecodesRequiredTagContract() throws {
        let data = Data(#"{"shared":true,"sharedAt":"2026-08-24","projectId":"p1","tags":["动物","新手"]}"#.utf8)
        let result = try JSONDecoder().decode(ProjectShareResult.self, from: data)
        XCTAssertTrue(result.shared)
        XCTAssertEqual(result.tags, ["动物", "新手"])
    }
    func testCommunityPostAndTagUpdateResponsesPreserveExistingTags() throws {
        let post = Data(#"{"post":{"tags":["游戏","新手"]}}"#.utf8)
        let update = Data(#"{"projectId":"p1","tags":["游戏","其他"]}"#.utf8)
        XCTAssertEqual(try JSONDecoder().decode(CommunityPostResponse.self, from: post).post.tags, ["游戏", "新手"])
        XCTAssertEqual(try JSONDecoder().decode(CommunityTagsUpdateResponse.self, from: update).tags, ["游戏", "其他"])
    }

    func testCommunityListSummaryDecodesWithoutCanvasOrSourceImage() throws {
        let data = Data(#"{"posts":[{"id":"post-1","name":"星空小熊","rows":18,"cols":20,"tone":"recent-bear","thumbnailImage":"https://example.test/thumb.png","sharedAt":"2026-08-24","likesCount":8,"commentsCount":2,"authorId":"u-1","author":"创作者","authorAvatar":null,"likedByMe":false,"isFollowing":false,"tags":["动物","新手"]}],"tagCounts":[{"tag":"动物","count":4}],"page":1,"pageSize":12}"#.utf8)
        let page = try JSONDecoder().decode(CommunityPostPage.self, from: data)
        XCTAssertEqual(page.posts.map(\.id), ["post-1"])
        XCTAssertEqual(page.posts.first?.tags, ["动物", "新手"])
        XCTAssertEqual(page.tagCounts, [CommunityTagCount(tag: "动物", count: 4)])
    }

    func testAssetURLResolvesRelativeAPIAssetAndKeepsAbsoluteCDNURL() {
        XCTAssertEqual(AppAssetURL.url(for: "/api/project-assets?path=abc")?.absoluteString, "http://127.0.0.1:3000/api/project-assets?path=abc")
        XCTAssertEqual(AppAssetURL.url(for: "https://cdn.example.test/thumbnail.webp")?.absoluteString, "https://cdn.example.test/thumbnail.webp")
    }

    func testAPIBaseURLConfigurationUsesOnlyValidConfiguredURLOrExplicitFallback() {
        let fallback = APIBaseURLConfiguration.localDevelopmentDefault
        XCTAssertEqual(APIBaseURLConfiguration.resolve(configured: " https://api.example.test/api ", fallback: fallback)?.absoluteString, "https://api.example.test/api")
        XCTAssertEqual(APIBaseURLConfiguration.resolve(configured: "", fallback: fallback), fallback)
        XCTAssertEqual(APIBaseURLConfiguration.resolve(configured: "not a url", fallback: nil), nil)
        XCTAssertEqual(APIBaseURLConfiguration.resolve(configured: "ftp://api.example.test", fallback: nil), nil)
    }

    func testMissingProductionBaseURLHasAnActionableClientError() async {
        let client = APIClient(baseURL: nil, session: .shared)
        do {
            let _: WarehouseInventory = try await client.request("warehouses/unknown/inventory", token: "token")
            XCTFail("A client without a configured production base URL must not issue a request")
        } catch let error as APIError {
            XCTAssertEqual(error.message, "未配置生产 API 地址")
        } catch {
            XCTFail("Expected APIError, received \(error)")
        }
    }


    func testAvatarDataURLDecoderAcceptsTrimmedImageBase64AndRejectsOtherValues() {
        XCTAssertEqual(AvatarImageData.decode(" data:image/jpeg;base64,AQID "), Data([1, 2, 3]))
        XCTAssertNil(AvatarImageData.decode("https://cdn.example.test/avatar.png"))
        XCTAssertNil(AvatarImageData.decode("data:text/plain;base64,AQID"))
        XCTAssertNil(AvatarImageData.decode("data:image/png,not-base64"))
    }

    func testCommunityDetailIncludesOnlyDetailSpecificFields() throws {
        let data = Data(#"{"post":{"id":"post-1","name":"星空小熊","rows":18,"cols":20,"tone":"recent-bear","sourceImage":"/api/source","thumbnailImage":"/api/thumb","beadList":[{"color":"F5","count":12}],"sharedAt":"2026-08-24","authorId":"u-1","author":"创作者","authorAvatar":null,"isFollowing":false,"likesCount":8,"commentsCount":2,"likedByMe":true,"tags":["动物"]}}"#.utf8)
        let detail = try JSONDecoder().decode(CommunityDetailResponse.self, from: data).post
        XCTAssertEqual(detail.beadList, [ProjectBeadCount(color: "F5", count: 12)])
        XCTAssertTrue(detail.likedByMe)
    }

    func testCommunityLikeResponsePreservesServerCount() throws {
        XCTAssertEqual(try JSONDecoder().decode(CommunityLikeResult.self, from: Data(#"{"liked":true,"likesCount":9}"#.utf8)), CommunityLikeResult(liked: true, likesCount: 9))
    }

    func testCommunityCopyUsesDedicatedProjectResponseContract() throws {
        let data = Data(#"{"project":{"id":"copy-1","userId":"me","name":"星空小熊（副本）","rows":18,"cols":20,"tone":"recent-bear","sourceImage":"/api/project-assets?path=source","thumbnailImage":"/api/project-assets?path=thumb","canvasData":"[]","revision":1,"createdAt":"2026-08-25","updatedAt":"2026-08-25"}}"#.utf8)
        let copied = try JSONDecoder().decode(CommunityProjectCopyResponse.self, from: data).project
        XCTAssertEqual(copied.id, "copy-1")
        XCTAssertEqual(copied.name, "星空小熊（副本）")
        XCTAssertEqual(copied.rows, 18)
        XCTAssertEqual(copied.cols, 20)
        XCTAssertEqual(copied.canvasData, "[]")
    }

    func testCommunityMessageTimeMatchesH5SameDayAndOlderMessageFormatting() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let now = ISO8601DateFormatter().date(from: "2026-08-25T12:00:00Z")!
        XCTAssertEqual(CommunityMessageTime.display("2026-08-25T09:30:00Z", now: now, calendar: calendar), "09:30")
        XCTAssertEqual(CommunityMessageTime.display("2026-08-24T11:00:00Z", now: now, calendar: calendar), "08-24")
        XCTAssertEqual(CommunityMessageTime.display("not-a-date", now: now, calendar: calendar), "")
    }

    func testCommunityPostPresentationMatchesH5TimeAndGridSize() {
        XCTAssertEqual(CommunityPostPresentation.publicationTime("2026-08-25T09:30:00Z"), "2026-08-25 17:30")
        XCTAssertEqual(CommunityPostPresentation.publicationTime("invalid"), "时间未知")
        XCTAssertEqual(CommunityPostPresentation.physicalSize(cols: 24, rows: 18), "6.24 × 4.68 cm")
    }

    func testWarehouseSummaryAndInventoryUseDedicatedContracts() throws {
        let list = Data(#"{"warehouses":[{"id":"w1","name":"主仓","remark":"常用","colorSystem":"MARD_221","createdAt":"2026-01-01","updatedAt":"2026-01-02","stockedColorCount":2,"totalWarehouseStock":15}]}"#.utf8)
        let inventory = Data(#"{"inventory":{"A14":12,"C8":3}}"#.utf8)
        XCTAssertEqual(try JSONDecoder().decode(WarehouseListResponse.self, from: list).warehouses.first?.totalWarehouseStock, 15)
        XCTAssertEqual(try JSONDecoder().decode(WarehouseInventory.self, from: inventory).inventory, ["A14": 12, "C8": 3])
    }

    func testWarehouseCreationUsesDedicatedCreateResponse() throws {
        let data = Data(#"{"warehouse":{"id":"w2","name":"旅行仓","remark":"备用","colorSystem":"MARD_221","createdAt":"2026-01-01","updatedAt":"2026-01-01"}}"#.utf8)
        let created = try JSONDecoder().decode(WarehouseCreationResponse.self, from: data).warehouse
        XCTAssertEqual(created.name, "旅行仓")
        XCTAssertEqual(created.colorSystem, "MARD_221")
    }

    func testWarehouseDeleteResponseKeepsDeletedWarehouseIdentity() throws {
        let data = Data(#"{"deleted":true,"warehouseId":"w2"}"#.utf8)
        XCTAssertEqual(try JSONDecoder().decode(WarehouseDeleteResponse.self, from: data), WarehouseDeleteResponse(deleted: true, warehouseId: "w2"))
    }

    func testWarehouseTransactionsKeepSummaryFieldsAndPagination() throws {
        let data = Data(#"{"transactions":[{"id":"t1","colorCode":"A14","type":"out","quantity":15,"inputUnit":"gram","inputValue":1,"source":"manual","projectId":null,"beadingSessionId":null,"projectName":null,"createdAt":"2026-08-24"}],"page":1,"pageSize":20,"hasMore":false,"total":1}"#.utf8)
        let page = try JSONDecoder().decode(WarehouseTransactionsPage.self, from: data)
        XCTAssertEqual(page.transactions.first?.colorCode, "A14")
        XCTAssertEqual(page.transactions.first?.inputUnit, "gram")
        XCTAssertFalse(page.hasMore)
    }

    func testWarehouseMutationEncodesMultiColorUnitAndQuantity() throws {
        let mutation = WarehouseInventoryMutation(codes: ["A14", "C8"], type: .in, quantity: 6, inputUnit: .gram, inputValue: 2.5)
        let payload = try JSONSerialization.jsonObject(with: JSONEncoder().encode(mutation)) as? [String: Any]
        XCTAssertEqual(payload?["codes"] as? [String], ["A14", "C8"])
        XCTAssertEqual(payload?["type"] as? String, "in")
        XCTAssertEqual(payload?["inputUnit"] as? String, "gram")
        XCTAssertEqual(payload?["quantity"] as? Int, 6)
    }

    func testBeadingSessionAndInventoryCheckDecodeServerContract() throws {
        let session = Data(#"{"session":{"id":"s1","projectId":"p1","projectName":"小熊","requirements":[{"colorCode":"A14","required":3}],"warehouseId":"w1","warehouseName":"主仓","status":"in_progress","completedColorCodes":[],"progress":{"completed":0,"total":1,"percent":0},"elapsedSeconds":20,"timerStartedAt":null,"inventoryDeducted":false,"version":2}}"#.utf8)
        let check = Data(#"{"warehouseId":"w1","warehouseName":"主仓","items":[{"colorCode":"A14","required":3,"available":2,"missing":1}],"summary":{"sufficient":false,"missingColorCount":1,"missingBeadCount":1}}"#.utf8)
        XCTAssertEqual(try JSONDecoder().decode(BeadingSessionEnvelope.self, from: session).session?.requirements, [BeadingRequirement(colorCode: "A14", required: 3)])
        XCTAssertFalse(try JSONDecoder().decode(InventoryCheck.self, from: check).summary.sufficient)
    }

    func testBeadingVersionConflictDecodesLatestServerSession() throws {
        let data = Data(#"{"error":"BEADING_VERSION_CONFLICT","message":"会话已在其他设备更新","session":{"id":"s1","projectId":"p1","projectName":"小熊","requirements":[],"warehouseId":null,"warehouseName":null,"status":"paused","completedColorCodes":["A14"],"progress":{"completed":1,"total":2,"percent":50},"elapsedSeconds":30,"timerStartedAt":null,"inventoryDeducted":false,"version":4}}"#.utf8)
        let payload = try JSONDecoder().decode(APIErrorPayload.self, from: data)
        XCTAssertEqual(payload.error, "BEADING_VERSION_CONFLICT")
        XCTAssertEqual(payload.session?.version, 4)
    }

    func testBeadingCompletionContractKeepsServerDeductionState() throws {
        let result = Data(#"{"session":{"id":"s1","projectId":"p1","projectName":"小熊","requirements":[],"warehouseId":"w1","warehouseName":"主仓","status":"completed_deducted","completedColorCodes":["A14"],"progress":{"completed":1,"total":1,"percent":100},"elapsedSeconds":20,"timerStartedAt":null,"inventoryDeducted":true,"version":4},"warehouseId":"w1","deducted":true,"replay":false}"#.utf8)
        let decoded = try JSONDecoder().decode(BeadingCompletionResult.self, from: result)
        XCTAssertTrue(decoded.deducted)
        XCTAssertTrue(decoded.session.inventoryDeducted)
        XCTAssertEqual(decoded.session.status, "completed_deducted")
    }

    func testBeadingLifecycleTransportSendsVersionWarehouseAndIdempotencyContracts() async throws {
        let recorder = HTTPRequestRecorder()
        MockURLProtocol.handler = { request in
            recorder.append(request)
            let path = request.url?.path ?? ""
            let body: String
            switch (request.httpMethod, path) {
            case ("POST", "/api/v1/projects/p1/beading-session"):
                body = Self.beadingSessionJSON(status: "in_progress", version: 1)
            case ("PATCH", "/api/v1/beading-sessions/s1"):
                body = Self.beadingSessionJSON(status: "in_progress", version: 2, completedCodes: ["A14"])
            case ("POST", "/api/v1/beading-sessions/s1/pause"):
                body = Self.beadingSessionJSON(status: "paused", version: 3, completedCodes: ["A14"])
            case ("POST", "/api/v1/beading-sessions/s1/resume"):
                body = Self.beadingSessionJSON(status: "in_progress", version: 4, completedCodes: ["A14"])
            case ("POST", "/api/v1/beading-sessions/s1/inventory-check"):
                body = #"{"warehouseId":"w1","warehouseName":"主仓","items":[{"colorCode":"A14","required":3,"available":5,"missing":0}],"summary":{"sufficient":true,"missingColorCount":0,"missingBeadCount":0}}"#
            case ("POST", "/api/v1/beading-sessions/s1/prepare-completion"):
                body = Self.beadingSessionJSON(status: "pending_completion", version: 5, completedCodes: ["A14"])
            case ("POST", "/api/v1/beading-sessions/s1/complete"):
                body = #"{"session":{"id":"s1","projectId":"p1","projectName":"小熊","requirements":[{"colorCode":"A14","required":3}],"warehouseId":"w1","warehouseName":"主仓","status":"completed_deducted","completedColorCodes":["A14"],"progress":{"completed":1,"total":1,"percent":100},"elapsedSeconds":12,"timerStartedAt":null,"inventoryDeducted":true,"version":6},"warehouseId":"w1","deducted":true,"replay":false}"#
            default:
                throw URLError(.badURL)
            }
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["content-type": "application/json"])!
            return (response, Data(body.utf8))
        }
        defer { MockURLProtocol.handler = nil }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockURLProtocol.self]
        let repository = ProjectRepository(client: APIClient(baseURL: URL(string: "https://api.example.test/api")!, session: URLSession(configuration: configuration)))

        let created = try await repository.createBeadingSession(projectID: "p1", warehouseID: "w1", token: "access-token")
        let patched = try await repository.patchBeadingSession(created, completedCodes: ["A14"], elapsedSeconds: 12, token: "access-token")
        let paused = try await repository.transitionBeadingSession(patched, action: .pause, token: "access-token")
        let resumed = try await repository.transitionBeadingSession(paused, action: .resume, token: "access-token")
        _ = try await repository.inventoryCheck(sessionID: resumed.id, warehouseID: "w1", token: "access-token")
        let pending = try await repository.transitionBeadingSession(resumed, action: .prepareCompletion, token: "access-token")
        let result = try await repository.completeBeadingSession(pending, deductInventory: true, warehouseID: "w1", idempotencyKey: "completion-key", token: "access-token")

        XCTAssertTrue(result.deducted)
        let requests = recorder.requests
        XCTAssertEqual(requests.map { $0.url?.path }, [
            "/api/v1/projects/p1/beading-session", "/api/v1/beading-sessions/s1", "/api/v1/beading-sessions/s1/pause", "/api/v1/beading-sessions/s1/resume", "/api/v1/beading-sessions/s1/inventory-check", "/api/v1/beading-sessions/s1/prepare-completion", "/api/v1/beading-sessions/s1/complete",
        ])
        XCTAssertTrue(requests.allSatisfy { $0.header("authorization") == "Bearer access-token" })
        XCTAssertEqual(try Self.jsonBody(requests[0])["warehouseId"] as? String, "w1")
        XCTAssertEqual(try Self.jsonBody(requests[1])["version"] as? Int, 1)
        XCTAssertEqual(try Self.jsonBody(requests[4])["warehouseId"] as? String, "w1")
        XCTAssertEqual(try Self.jsonBody(requests[5])["version"] as? Int, 4)
        XCTAssertEqual(try Self.jsonBody(requests[6])["idempotencyKey"] as? String, "completion-key")
        XCTAssertEqual(try Self.jsonBody(requests[6])["deductInventory"] as? Bool, true)
        XCTAssertEqual(try Self.jsonBody(requests[6])["warehouseId"] as? String, "w1")
    }

    func testCommunityCommentsPreserveThreadAndPaginationContract() throws {
        let data = Data(#"{"comments":[{"id":"c1","projectId":"p1","content":"好看","parentId":null,"replyToUserId":null,"replyToUserName":null,"createdAt":"2026-01-01","authorId":"u1","author":"小王","authorAvatar":null,"replies":[{"id":"c2","projectId":"p1","content":"谢谢","parentId":"c1","replyToUserId":"u1","replyToUserName":"小王","createdAt":"2026-01-02","authorId":"u2","author":"作者","authorAvatar":null,"replies":[]}]}],"page":1,"pageSize":20,"hasMore":false,"totalTopLevel":1,"totalComments":2}"#.utf8)
        let page = try JSONDecoder().decode(CommunityCommentsPage.self, from: data)
        XCTAssertEqual(page.totalComments, 2)
        XCTAssertEqual(page.comments.first?.replies.first?.parentId, "c1")
    }

    func testCommunityCommentDeletionKeepsRecursiveCountContract() throws {
        let data = Data(#"{"deletedCount":3}"#.utf8)
        XCTAssertEqual(try JSONDecoder().decode(CommunityCommentDeleteResult.self, from: data).deletedCount, 3)
    }

    func testAuthorProfileAndFollowResultPreserveCounts() throws {
        let data = Data(#"{"profile":{"id":"u1","name":"创作者","avatarUrl":null,"postsCount":3,"likesCount":9,"followersCount":2,"isFollowing":false},"posts":[],"page":1,"pageSize":20}"#.utf8)
        let follow = Data(#"{"following":true,"followersCount":3,"followingCount":8}"#.utf8)
        XCTAssertEqual(try JSONDecoder().decode(CommunityAuthorPage.self, from: data).profile.name, "创作者")
        XCTAssertEqual(try JSONDecoder().decode(CommunityFollowResult.self, from: follow).followersCount, 3)
    }

    func testSocialUserListKeepsOnlyUserSummaryFields() throws {
        let data = Data(#"{"users":[{"id":"u2","name":"关注的作者","avatarUrl":null}]}"#.utf8)
        let result = try JSONDecoder().decode(CommunityUserList.self, from: data)
        XCTAssertEqual(result.users, [CommunityUserSummary(id: "u2", name: "关注的作者", avatarUrl: nil)])
    }

    func testNotificationsKeepReadAndProjectNavigationFields() throws {
        let data = Data(#"{"notifications":[{"id":"n1","type":"comment","projectId":"p1","commentId":"c1","content":"评论了你的作品","createdAt":"2026-01-01","readAt":null,"senderId":"u2","senderName":"小李","senderAvatar":null,"isRead":false}],"unreadCount":1,"page":1,"pageSize":20}"#.utf8)
        let page = try JSONDecoder().decode(CommunityNotificationsPage.self, from: data)
        XCTAssertEqual(page.notifications.first?.projectId, "p1")
        XCTAssertFalse(page.notifications.first?.isRead ?? true)
    }

    func testAccountProfileAndProfileUpdateKeepUserContract() throws {
        let profile = Data(#"{"user":{"id":"u1","nickname":"小王","avatarUrl":null},"followersCount":2,"followingCount":3,"likesCount":8}"#.utf8)
        let update = Data(#"{"user":{"id":"u1","nickname":"新名字","avatarUrl":null}}"#.utf8)
        XCTAssertEqual(try JSONDecoder().decode(AccountProfile.self, from: profile).followingCount, 3)
        XCTAssertEqual(try JSONDecoder().decode(AccountProfileUpdate.self, from: update).user.nickname, "新名字")
    }

    func testPhoneLoginEnvelopeKeepsAccessTokenAndPhoneAuthUser() throws {
        let data = Data(#"{"code":"OK","message":"success","data":{"accessToken":"phone-access","expiresIn":7200,"user":{"id":"u-phone","nickname":"用户8000","avatarUrl":null}}}"#.utf8)
        let response = try JSONDecoder().decode(PhoneAuthEnvelope.self, from: data).data
        XCTAssertEqual(response.accessToken, "phone-access")
        XCTAssertEqual(response.user.nickname, "用户8000")
        XCTAssertEqual(response.expiresIn, 7200)
    }

    func testSmsChallengeAndCodeResponsesUseServerDataEnvelopes() throws {
        let challenge = Data(#"{"data":{"challengeId":"ch-1","seed":"seed","signVersion":"mobile-v1","serverTime":123,"expiresIn":300}}"#.utf8)
        let code = Data(#"{"data":{"smsRequestId":"sms-1","retryAfter":60}}"#.utf8)
        XCTAssertEqual(try JSONDecoder().decode(SmsChallengeEnvelope.self, from: challenge).data.signVersion, "mobile-v1")
        XCTAssertEqual(try JSONDecoder().decode(SmsCodeEnvelope.self, from: code).data, SmsCodeResponse(smsRequestId: "sms-1", retryAfter: 60))
    }

    func testMobileSmsSignatureMatchesServerSigningFixture() throws {
        let signature = try ProjectRepository.signedSmsRequest(phone: "+8613800138000", seed: "abcdefghijklmnopqrstuvwxyz0123456789", deviceID: "device-fixture", requestID: "123e4567-e89b-12d3-a456-426614174000", nonce: "abcdefghijklmnopqrstuvwx", challengeID: "ch-fixture", timestamp: 1_700_000_000_000)
        XCTAssertEqual(signature, "MCJC3WkY7GB9NUVVZXi9KIthcf0iYXoqEaLUNVOA9c4")
    }

    func testPhoneSessionRefreshAndMeUseStandardDataEnvelopes() throws {
        let refresh = Data(#"{"data":{"accessToken":"fresh-token","expiresIn":7200,"user":{"id":"u1","nickname":"用户8000","avatarUrl":null}}}"#.utf8)
        let me = Data(#"{"data":{"user":{"id":"u1","nickname":"用户8000","avatarUrl":null},"followersCount":0,"followingCount":0,"likesCount":0}}"#.utf8)
        XCTAssertEqual(try JSONDecoder().decode(PhoneAuthEnvelope.self, from: refresh).data.accessToken, "fresh-token")
        XCTAssertEqual(try JSONDecoder().decode(PhoneAuthMeEnvelope.self, from: me).data.user.id, "u1")
    }

    func testPhoneSessionSecurePayloadEncodesOnlyTokenAndUserSummary() throws {
        let expected = StoredPhoneSession(accessToken: "keychain-token", user: APIUser(id: "u-phone", nickname: "用户8000", avatarUrl: nil))
        let data = try JSONEncoder().encode(expected)
        XCTAssertEqual(try JSONDecoder().decode(StoredPhoneSession.self, from: data), expected)
        XCTAssertFalse(String(decoding: data, as: UTF8.self).contains("refreshToken"))
    }

    private static func beadingSessionJSON(status: String, version: Int, completedCodes: [String] = []) -> String {
        let completed = completedCodes.map { #""\#($0)""# }.joined(separator: ",")
        let progress = completedCodes.isEmpty ? #"{"completed":0,"total":1,"percent":0}"# : #"{"completed":1,"total":1,"percent":100}"#
        return #"{"session":{"id":"s1","projectId":"p1","projectName":"小熊","requirements":[{"colorCode":"A14","required":3}],"warehouseId":"w1","warehouseName":"主仓","status":"\#(status)","completedColorCodes":[\#(completed)],"progress":\#(progress),"elapsedSeconds":12,"timerStartedAt":null,"inventoryDeducted":false,"version":\#(version)}}"#
    }

    private static func jsonBody(_ request: HTTPRequestSnapshot) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: try XCTUnwrap(request.body)) as? [String: Any])
    }
}

private final class HTTPRequestRecorder {
    private let lock = NSLock()
    private var values: [HTTPRequestSnapshot] = []

    func append(_ request: URLRequest) {
        lock.lock()
        values.append(HTTPRequestSnapshot(request))
        lock.unlock()
    }

    var requests: [HTTPRequestSnapshot] {
        lock.lock()
        defer { lock.unlock() }
        return values
    }
}

private struct HTTPRequestSnapshot {
    let url: URL?
    let method: String?
    let headers: [String: String]
    let body: Data?

    init(_ request: URLRequest) {
        url = request.url
        method = request.httpMethod
        headers = request.allHTTPHeaderFields ?? [:]
        body = request.httpBody ?? Self.readBodyStream(request.httpBodyStream)
    }

    func header(_ name: String) -> String? {
        headers.first { $0.key.caseInsensitiveCompare(name) == .orderedSame }?.value
    }

    private static func readBodyStream(_ stream: InputStream?) -> Data? {
        guard let stream else { return nil }
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            guard count > 0 else { break }
            data.append(buffer, count: count)
        }
        return data.isEmpty ? nil : data
    }
}

private final class MockURLProtocol: URLProtocol {
    typealias Handler = (URLRequest) throws -> (HTTPURLResponse, Data)
    private static let handlerLock = NSLock()
    private static var currentHandler: Handler?

    static var handler: Handler? {
        get {
            handlerLock.lock()
            defer { handlerLock.unlock() }
            return currentHandler
        }
        set {
            handlerLock.lock()
            currentHandler = newValue
            handlerLock.unlock()
        }
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let handler = Self.handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }
        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}
