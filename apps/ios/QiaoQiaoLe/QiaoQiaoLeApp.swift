import SwiftUI

@main
struct QiaoQiaoLeApp: App {
    @StateObject private var router = AppRouter()
    @StateObject private var smartBeadingBoard = LEDMatrixBluetoothController()

    var body: some Scene {
        WindowGroup {
            AppRootView()
                .environmentObject(router)
                .environmentObject(smartBeadingBoard)
                .onOpenURL { router.open(url: $0) }
        }
    }
}
