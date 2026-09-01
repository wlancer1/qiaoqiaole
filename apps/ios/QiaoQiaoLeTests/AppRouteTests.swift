import XCTest
@testable import QiaoQiaoLe

@MainActor
final class AppRouteTests: XCTestCase {
    func testH5PathsMapToNativeRoutes() {
        XCTAssertEqual(AppRoute(path: "/"), .home(.home))
        XCTAssertEqual(AppRoute(path: "/discover"), .home(.discover))
        XCTAssertEqual(AppRoute(path: "/messages"), .home(.messages))
        XCTAssertEqual(AppRoute(path: "/profile"), .home(.profile))
        XCTAssertEqual(AppRoute(path: "/projects/hello%20world/edit"), .projectEdit("hello world"))
        XCTAssertEqual(AppRoute(path: "/projects/p1/beading"), .projectBeading("p1"))
        XCTAssertEqual(AppRoute(path: "/community/posts/cat"), .communityPost("cat"))
        XCTAssertEqual(AppRoute(path: "/warehouses/w1"), .warehouseDetail("w1"))
        XCTAssertEqual(AppRoute(path: "/split/preview"), .splitPreview)
        XCTAssertEqual(AppRoute(path: "/beading"), .beading)
        XCTAssertEqual(AppRoute(path: "/user-agreement"), .userAgreement)
        XCTAssertEqual(AppRoute(path: "/privacy-policy"), .privacyPolicy)
    }

    func testEveryStaticH5RouteHasANativeRoute() {
        let expected: [(String, AppRoute)] = [
            ("/", .home(.home)),
            ("/discover", .home(.discover)),
            ("/messages", .home(.messages)),
            ("/profile", .home(.profile)),
            ("/following", .following),
            ("/followers", .followers),
            ("/projects", .projects),
            ("/warehouses", .warehouses),
            ("/split", .split),
            ("/split/crop", .splitCrop),
            ("/split/preview", .splitPreview),
            ("/canvas", .canvas),
            ("/beading", .beading),
            ("/user-agreement", .userAgreement),
            ("/privacy-policy", .privacyPolicy),
        ]
        for (path, route) in expected {
            XCTAssertEqual(AppRoute(path: path), route, "H5 path \(path) must remain navigable in the native app")
        }
    }

    func testH5FlowAndSheetTokensKeepTheSharedDesignMeasurements() {
        XCTAssertEqual(AppTokens.flowContentMax, 548)
        XCTAssertEqual(AppTokens.sheetWidth, 382)
        XCTAssertEqual(AppTokens.sheetCorner, 22)
        XCTAssertEqual(AppTokens.sheetHandleWidth, 38)
        XCTAssertEqual(AppTokens.sheetHandleHeight, 4)
        XCTAssertEqual(AppTokens.flowCardShadowRadius, 28)
        XCTAssertEqual(AppTokens.flowActionShadowRadius, 30)
    }

    func testProtectedRoutesOpenLoginThenResume() {
        let router = AppRouter()
        router.navigate(to: .projects)
        XCTAssertEqual(router.overlay, .login(returnTo: .projects))
        XCTAssertEqual(router.currentRoute, .home(.home))

        router.loginSucceeded()
        XCTAssertTrue(router.isAuthenticated)
        XCTAssertEqual(router.currentRoute, .projects)
    }

    func testSelectTabClearsPreviousNavigationAndStatus() {
        let router = AppRouter()
        router.navigate(to: .canvas)
        router.showNotice("已保存", kind: .success)
        router.select(tab: .discover)
        XCTAssertEqual(router.currentRoute, .home(.discover))
        XCTAssertNil(router.routeStatus)
    }
    func testCustomURLSchemeMapsHostAndPathToH5Route() {
        let router = AppRouter()
        router.open(url: URL(string: "qiaoqiaole://projects/p1/edit")!)
        XCTAssertEqual(router.overlay, .login(returnTo: .projectEdit("p1")))
        router.loginSucceeded()
        XCTAssertEqual(router.currentRoute, .projectEdit("p1"))
    }
    func testCustomURLSchemeOpensPublicCanvasRoute() {
        let router = AppRouter()
        router.open(url: URL(string: "qiaoqiaole://canvas")!)
        XCTAssertEqual(router.currentRoute, .canvas)
        XCTAssertNil(router.overlay)
    }

    func testSubmittingOverlayCannotBeDismissedUntilItsRequestEnds() {
        let router = AppRouter()
        router.overlay = .saveProject
        router.beginOverlaySubmission()
        router.dismissOverlay()
        XCTAssertEqual(router.overlay, .saveProject)

        router.endOverlaySubmission()
        router.dismissOverlay()
        XCTAssertNil(router.overlay)
    }

    func testPublicRouteCanRequestLoginAndResumeItsReturnTarget() {
        let router = AppRouter()
        router.requireLogin(returnTo: .communityPost("post-1"))
        XCTAssertEqual(router.overlay, .login(returnTo: .communityPost("post-1")))
        router.loginSucceeded()
        XCTAssertEqual(router.currentRoute, .communityPost("post-1"))
    }

    func testLegacyBeadingRedirectPreservesProtectedProjectsGate() {
        let router = AppRouter()
        router.path = [.beading]
        router.replace(with: .projects)
        XCTAssertEqual(router.overlay, .login(returnTo: .projects))
        XCTAssertEqual(router.currentRoute, .home(.home))
        router.loginSucceeded()
        XCTAssertEqual(router.currentRoute, .projects)
    }
    func testDrawingLoginGateReopensCreationSheetAfterSuccess() {
        let router = AppRouter()
        router.requireLoginForDrawing()
        XCTAssertEqual(router.overlay?.id, "login")
        router.loginSucceeded()
        XCTAssertEqual(router.overlay, .createDrawing)
    }

}
