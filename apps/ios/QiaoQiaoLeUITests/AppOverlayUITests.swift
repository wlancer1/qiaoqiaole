import XCTest

final class AppOverlayUITests: XCTestCase {
    private let app = XCUIApplication()

    override func setUpWithError() throws {
        continueAfterFailure = false
        app.launch()
    }

    func testCentralCreationEntryOpensNativeSplitRoute() {
        let creation = app.buttons["创建拼豆图纸"]
        XCTAssertTrue(creation.waitForExistence(timeout: 5))
        creation.tap()
        XCTAssertTrue(app.navigationBars["分割设置"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["选择参考图片"].exists)
    }

    func testAllPrimaryTabsKeepTheNativeCreationEntryAvailable() {
        let creation = app.buttons["创建拼豆图纸"]
        XCTAssertTrue(creation.waitForExistence(timeout: 5))

        for tab in ["发现", "消息", "我的", "首页"] {
            let tabButton = app.tabBars.buttons[tab]
            XCTAssertTrue(tabButton.waitForExistence(timeout: 5), "缺少 H5 对应的 \(tab) Tab")
            tabButton.tap()
            XCTAssertTrue(creation.waitForExistence(timeout: 3), "切换到 \(tab) 后不应丢失创建入口")
        }

        creation.tap()
        XCTAssertTrue(app.navigationBars["分割设置"].waitForExistence(timeout: 5))
    }

    func testSeededSplitImageFlowsFromSettingsToNativeEditor() {
        app.terminate()
        app.launchArguments = ["-ui-testing-split-fixture"]
        app.launch()

        let creation = app.buttons["创建拼豆图纸"]
        XCTAssertTrue(creation.waitForExistence(timeout: 5))
        creation.tap()

        XCTAssertFalse(app.staticTexts["选择或更换参考图片"].exists, "已有图片时不应在预览上方重复占用选择卡片")
        let enterCrop = app.buttons["进入裁剪"]
        XCTAssertTrue(enterCrop.waitForExistence(timeout: 5))
        XCTAssertTrue(enterCrop.isEnabled, "固定测试图片应生成可继续的原生网格预览")
        enterCrop.tap()

        let confirmCrop = app.buttons["确认裁剪"]
        XCTAssertTrue(confirmCrop.waitForExistence(timeout: 5))
        XCTAssertTrue(confirmCrop.isEnabled)
        XCTAssertTrue(app.buttons["缩小裁剪预览"].exists)
        XCTAssertTrue(app.buttons["放大裁剪预览"].exists)
        XCTAssertTrue(app.buttons["重置裁剪"].exists)
        confirmCrop.tap()

        let importToCanvas = app.buttons["导入到画布"]
        XCTAssertTrue(importToCanvas.waitForExistence(timeout: 5))
        XCTAssertTrue(importToCanvas.isEnabled)
        importToCanvas.tap()

        XCTAssertTrue(app.otherElements["画布编辑顶栏"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["保存作品"].exists)
    }

    func testBeadingWorkspaceFixtureUsesTheNativeH5EquivalentChrome() {
        app.terminate()
        app.launchArguments = ["-ui-testing-beading-workspace"]
        app.launch()

        XCTAssertTrue(app.buttons["检测库存"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["暂停计时"].exists)
        XCTAssertTrue(app.buttons["保存拼豆进度"].exists)
        XCTAssertTrue(app.staticTexts["20%"].exists)
        XCTAssertTrue(app.buttons["搜色"].exists)
        XCTAssertTrue(app.buttons["标记"].exists)
        XCTAssertTrue(app.buttons["高亮"].exists)
        XCTAssertTrue(app.buttons["锁定画布"].exists)
        XCTAssertTrue(app.buttons["适应"].exists)
        XCTAssertTrue(app.buttons["选择色号 H7，当前，603 颗"].exists)
        XCTAssertTrue(app.otherElements["拼豆工作画布，24 列 20 行"].exists)
        let completeCurrentColor = app.buttons["完成当前色"]
        XCTAssertTrue(completeCurrentColor.exists)
        XCTAssertEqual(completeCurrentColor.value as? String, "1/5")
        completeCurrentColor.tap()
        XCTAssertEqual(completeCurrentColor.value as? String, "2/5")
        XCTAssertTrue(app.buttons["选择色号 H7，已完成，603 颗"].exists)

        app.buttons["搜色"].tap()
        XCTAssertTrue(app.navigationBars["搜索色号"].waitForExistence(timeout: 5))
        let colorSearch = app.textFields["搜索色号"]
        XCTAssertTrue(colorSearch.exists)
        colorSearch.tap()
        colorSearch.typeText("C4")
        XCTAssertTrue(app.staticTexts["C4"].waitForExistence(timeout: 2))
        let searchResult = app.buttons["beading-search-result-C4"]
        XCTAssertTrue(searchResult.exists)
        searchResult.tap()
        XCTAssertTrue(app.buttons["选择色号 C4，当前，59 颗"].waitForExistence(timeout: 2))

        let sort = app.buttons["切换色号排序，当前按剩余数量排序"]
        XCTAssertTrue(sort.exists)
        sort.tap()
        XCTAssertTrue(app.buttons["切换色号排序，当前按色号排序"].exists)

        app.buttons["更多"].tap()
        XCTAssertTrue(app.staticTexts["更多工具"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.switches["显示色号"].exists)
        XCTAssertTrue(app.switches["显示网格"].exists)
        XCTAssertTrue(app.buttons["清除标记"].exists)
        XCTAssertTrue(app.buttons["重置工具"].exists)
        app.buttons["关闭更多工具"].tap()

        app.buttons["检测库存"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["检测豆子库存"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["库存明细"].exists)
        XCTAssertTrue(app.buttons["继续拼豆"].exists)
        app.buttons["继续拼豆"].tap()
        XCTAssertTrue(app.buttons["检测库存"].waitForExistence(timeout: 2))
        app.buttons["锁定画布"].tap()
        XCTAssertTrue(app.buttons["解除画布锁定"].exists)
    }

    func testBeadingStartDoesNotHideWarehouseListFailure() {
        app.terminate()
        app.launchArguments = ["-ui-testing-beading-warehouse-error"]
        app.launch()

        XCTAssertTrue(app.staticTexts["尚未开始拼豆"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["仓库列表读取失败，点此重新加载"].exists)
        XCTAssertTrue(app.buttons["重新加载拼豆仓库列表"].exists)
        XCTAssertTrue(app.buttons["开始拼豆"].exists)
    }

    func testBeadingWorkspaceAsksHowToExitBeforeLeavingTheSession() {
        app.terminate()
        app.launchArguments = ["-ui-testing-beading-workspace"]
        app.launch()

        let back = app.buttons["返回作品"]
        XCTAssertTrue(back.waitForExistence(timeout: 5))
        back.tap()

        XCTAssertTrue(app.staticTexts["保存拼豆进度？"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["继续拼豆"].exists)
        XCTAssertTrue(app.buttons["保存并退出"].exists)
        XCTAssertTrue(app.buttons["放弃会话"].exists)

        app.buttons["继续拼豆"].tap()
        XCTAssertTrue(app.buttons["检测库存"].waitForExistence(timeout: 2))
    }

    func testEditorWorkspaceFixtureUsesTheNativeH5EquivalentChrome() {
        app.terminate()
        app.launchArguments = ["-ui-testing-editor-workspace"]
        app.launch()

        XCTAssertTrue(app.otherElements["画布编辑顶栏"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["撤销"].exists)
        XCTAssertTrue(app.buttons["上传参考图"].exists)
        XCTAssertTrue(app.buttons["放大画布"].exists)
        XCTAssertTrue(app.buttons["重置画布视图"].exists)
        XCTAssertTrue(app.buttons["手抓移动工具"].exists)
        XCTAssertTrue(app.buttons["选择色号 A1"].exists)
        XCTAssertTrue(app.otherElements["拼豆编辑画布"].exists)
    }

    func testSplitCropWorkspaceFixtureExposesDirectManipulationControls() {
        app.terminate()
        app.launchArguments = ["-ui-testing-split-crop-workspace"]
        app.launch()

        XCTAssertTrue(app.buttons["确认裁剪"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["缩小裁剪预览"].exists)
        XCTAssertTrue(app.buttons["放大裁剪预览"].exists)
        XCTAssertTrue(app.buttons["重置裁剪"].exists)
    }

    func testProfileWorkspaceFixtureUsesTheNativeH5ProfileHierarchy() {
        app.terminate()
        app.launchArguments = ["-ui-testing-profile-workspace"]
        app.launch()

        XCTAssertTrue(app.staticTexts["管理你的拼豆世界"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.tabBars.buttons["我的"].exists)
        XCTAssertTrue(app.staticTexts["拼豆小王"].exists)
        XCTAssertTrue(app.staticTexts["作品"].exists)
        XCTAssertTrue(app.staticTexts["获赞"].exists)
        XCTAssertTrue(app.staticTexts["关注"].exists)
        XCTAssertTrue(app.staticTexts["粉丝"].exists)
        XCTAssertTrue(app.staticTexts["豆子仓库"].exists)
        XCTAssertTrue(app.staticTexts["已入库 68 / 221 色 · 共 4,560 颗"].exists)
    }

    func testProfileWorkspaceDoesNotPresentFailedSummariesAsZero() {
        app.terminate()
        app.launchArguments = ["-ui-testing-profile-summary-error"]
        app.launch()

        XCTAssertTrue(app.staticTexts["库存摘要暂不可用"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["部分个人中心统计读取失败，点此重新加载"].exists)
        XCTAssertTrue(app.buttons["重新加载个人中心统计"].exists)
        XCTAssertFalse(app.staticTexts["已入库 0 / 221 色 · 共 0 颗"].exists)
    }

    func testUnauthenticatedProfileAndMessagesUseH5GuestStates() {
        app.terminate()
        app.launchArguments = []
        app.launch()

        app.tabBars.buttons["我的"].tap()
        XCTAssertTrue(app.staticTexts["未登录"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["登录后同步项目与豆子库存"].exists)
        XCTAssertTrue(app.buttons["立即登录"].exists)
        XCTAssertTrue(app.staticTexts["登录后查看豆子仓库"].exists)
        XCTAssertTrue(app.staticTexts["设置"].exists)

        app.tabBars.buttons["消息"].tap()
        XCTAssertTrue(app.staticTexts["登录后查看消息"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["评论、关注和下载通知会显示在这里。"].exists)
        XCTAssertTrue(app.buttons["登录查看消息"].exists)
    }

    func testHomeWorkspaceFixtureUsesNativeRecentAndHotCards() {
        app.terminate()
        app.launchArguments = ["-ui-testing-home-workspace"]
        app.launch()

        XCTAssertTrue(app.staticTexts["超级拼"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["最近项目"].exists)
        XCTAssertTrue(app.staticTexts["热门图纸"].exists)
        XCTAssertTrue(app.staticTexts["草莓小熊"].exists)
        XCTAssertTrue(app.staticTexts["樱桃蛋糕"].exists)
        XCTAssertTrue(app.buttons["创建拼豆图纸"].exists)
    }

    func testCommunityDetailCopyUsesTheExistingLoginGate() {
        app.terminate()
        app.launchArguments = ["-ui-testing-community-detail-workspace"]
        app.launch()

        let copy = app.buttons["复制到仓库"]
        XCTAssertTrue(copy.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["关注星空创作者"].exists)
        XCTAssertTrue(app.buttons["分享图纸"].exists)
        XCTAssertTrue(app.staticTexts["图纸尺寸"].exists)
        XCTAssertTrue(app.staticTexts["格数"].exists)
        XCTAssertTrue(app.buttons["查看全部颜色"].exists)
        copy.tap()
        XCTAssertTrue(app.staticTexts["手机号登录"].waitForExistence(timeout: 5))
    }

    func testAuthorWorkspaceFixtureUsesNativeProfileStatsAndWorkGrid() {
        app.terminate()
        app.launchArguments = ["-ui-testing-author-workspace"]
        app.launch()

        XCTAssertTrue(app.navigationBars["作者主页"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["星空创作者"].exists)
        XCTAssertTrue(app.staticTexts["创作者"].exists)
        XCTAssertTrue(app.staticTexts["作品"].exists)
        XCTAssertTrue(app.staticTexts["获赞"].exists)
        XCTAssertTrue(app.staticTexts["粉丝"].exists)
        XCTAssertTrue(app.staticTexts["浏览"].exists)
        XCTAssertTrue(app.buttons["关注"].exists)
        XCTAssertTrue(app.staticTexts["草莓小熊"].exists)
    }

    func testFollowingWorkspaceFixtureUsesNativeSummaryAndUserRows() {
        app.terminate()
        app.launchArguments = ["-ui-testing-following-workspace"]
        app.launch()

        XCTAssertTrue(app.navigationBars["关注列表"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["我关注的人"].exists)
        XCTAssertTrue(app.staticTexts["拼豆小鹿"].exists)
        XCTAssertTrue(app.staticTexts["已关注"].exists)
        XCTAssertTrue(app.buttons["查看拼豆小鹿的主页"].exists)
    }

    func testFollowersWorkspaceFixtureUsesNativeSummaryAndUserRows() {
        app.terminate()
        app.launchArguments = ["-ui-testing-followers-workspace"]
        app.launch()

        XCTAssertTrue(app.navigationBars["粉丝列表"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["关注我的人"].exists)
        XCTAssertTrue(app.staticTexts["草莓小熊"].exists)
        XCTAssertTrue(app.staticTexts["粉丝"].exists)
        XCTAssertTrue(app.buttons["查看草莓小熊的主页"].exists)
    }

    func testWarehousesWorkspaceFixtureUsesNativeIntroCardsAndDeleteActions() {
        app.terminate()
        app.launchArguments = ["-ui-testing-warehouses-workspace"]
        app.launch()

        XCTAssertTrue(app.navigationBars["豆子仓库"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["我的仓库"].exists)
        XCTAssertTrue(app.staticTexts["家用拼豆柜"].exists)
        XCTAssertTrue(app.staticTexts["68 色在库"].exists)
        XCTAssertTrue(app.buttons["打开仓库 家用拼豆柜，68 色在库"].exists)
        XCTAssertTrue(app.buttons["删除仓库 家用拼豆柜"].exists)
    }

    func testWarehouseDetailWorkspaceFixtureUsesNativeNameLetterFiltersAndSelectionActions() {
        app.terminate()
        app.launchArguments = ["-ui-testing-warehouse-detail-workspace"]
        app.launch()

        XCTAssertTrue(app.navigationBars["家用拼豆柜"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["4"].exists)
        XCTAssertTrue(app.buttons["筛选色号字母A"].exists)
        XCTAssertTrue(app.buttons["全选"].exists)
        XCTAssertTrue(app.buttons["反选"].exists)
        XCTAssertTrue(app.buttons["A1 库存 120 颗"].exists)
    }

    func testProjectsWorkspaceFixtureUsesNativeSummaryFoldersAndWorkGrid() {
        app.terminate()
        app.launchArguments = ["-ui-testing-projects-workspace"]
        app.launch()
        XCTAssertTrue(app.navigationBars["我的作品"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["我的创作"].exists)
        XCTAssertTrue(app.staticTexts["文件夹"].exists)
        XCTAssertTrue(app.buttons["新建文件夹"].exists)
        XCTAssertTrue(app.staticTexts["草莓小熊"].exists)
        XCTAssertTrue(app.staticTexts["星空猫咪"].exists)
    }

    func testDiscoverWorkspaceFixtureUsesNativeSearchFiltersAndCommunityCards() {
        app.terminate()
        app.launchArguments = ["-ui-testing-discover-workspace"]
        app.launch()

        XCTAssertTrue(app.textFields["搜索图纸、作者、标签"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.tabBars.buttons["发现"].exists)
        XCTAssertTrue(app.buttons["筛选标签动物"].exists)
        XCTAssertTrue(app.segmentedControls["稿件排序"].exists)
        XCTAssertTrue(app.staticTexts["草莓小熊"].exists)
        XCTAssertTrue(app.staticTexts["星空猫咪"].exists)
    }

    func testMessagesWorkspaceFixtureUsesNativeUnreadNotificationList() {
        app.terminate()
        app.launchArguments = ["-ui-testing-messages-workspace"]
        app.launch()

        XCTAssertTrue(app.tabBars.buttons["消息"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["拼豆小猫"].exists)
        XCTAssertTrue(app.staticTexts["像素小屋"].exists)
        XCTAssertTrue(app.buttons["消息，评论了你的图纸：这个配色太可爱了！"].exists)
    }

    func testLoginOverlayDismissalReturnsToHomeWithoutNavigationLeak() {
        let login = app.buttons["立即登录"]
        XCTAssertTrue(login.waitForExistence(timeout: 5))
        login.tap()
        XCTAssertTrue(app.staticTexts["手机号登录"].waitForExistence(timeout: 5))
        app.buttons["关闭登录"].tap()
        XCTAssertTrue(app.staticTexts["最近项目"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["创建拼豆图纸"].exists)
    }

    func testLoginBackdropDismissesOverlayWithoutBackgroundNavigationLeak() {
        let login = app.buttons["立即登录"]
        XCTAssertTrue(login.waitForExistence(timeout: 5))
        login.tap()
        XCTAssertTrue(app.staticTexts["手机号登录"].waitForExistence(timeout: 5))

        let backdrop = app.buttons["关闭弹窗"]
        XCTAssertTrue(backdrop.waitForExistence(timeout: 5))
        backdrop.tap()

        XCTAssertTrue(app.staticTexts["最近项目"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["创建拼豆图纸"].exists)
        XCTAssertFalse(app.navigationBars["分割设置"].exists)
    }

    func testConfirmationActionDismissesOverlayWithoutBackgroundNavigationLeak() {
        app.terminate()
        app.launchArguments = ["-ui-testing-confirmation"]
        app.launch()

        XCTAssertTrue(app.staticTexts["确认操作测试"].waitForExistence(timeout: 5))
        app.buttons["确认测试"].tap()

        XCTAssertTrue(app.staticTexts["最近项目"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["创建拼豆图纸"].exists)
        XCTAssertFalse(app.navigationBars["分割设置"].exists)
    }

    func testLoginAgreementLinkOpensNativeLegalRoute() {
        let login = app.buttons["立即登录"]
        XCTAssertTrue(login.waitForExistence(timeout: 5))
        login.tap()
        let agreement = app.buttons["查看用户协议"]
        XCTAssertTrue(agreement.waitForExistence(timeout: 5))
        agreement.tap()
        XCTAssertTrue(app.navigationBars["用户协议"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["手机号登录"].exists)
    }

    func testRegistrationModeExposesPasswordConfirmationAndSmsControls() {
        let login = app.buttons["立即登录"]
        XCTAssertTrue(login.waitForExistence(timeout: 5))
        login.tap()
        let register = app.buttons["注册"]
        XCTAssertTrue(register.waitForExistence(timeout: 5))
        register.tap()
        XCTAssertTrue(app.secureTextFields["确认密码"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.textFields["验证码"].exists)
        XCTAssertTrue(app.buttons["获取验证码"].exists)
    }
}
