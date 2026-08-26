import SwiftUI

@main
struct QiaoQiaoLeApp: App {
    @StateObject private var router = AppRouter()

    var body: some Scene {
        WindowGroup {
            AppRootView()
                .environmentObject(router)
                .onOpenURL { router.open(url: $0) }
        }
    }
}
