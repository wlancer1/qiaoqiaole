import { HomeUploadHero } from '../../flow/H5FlowComponents';
import { AuthorProfilePage, PatternDetailPage, PatternDiscoverPage, PatternMessagesPage } from '../../patterns/H5PatternPages';
import { CommunityPatternCard } from '../../community/CommunityPatternCard';
import { Icon } from '../../shared/h5Icons';
import { UserAvatar } from '../../shared/UserAvatar';
import { Heart, LogOut, MessageCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { passwordValidationMessage } from '../../utils/passwordValidation';

type HomeShellPageProps = Record<string, any> & { actionSheet?: ReactNode };

export function PhoneLoginModal(props: Record<string, any>) {
  const {
    phoneNumber, setPhoneNumber, phonePassword, setPhonePassword, phoneConfirmPassword, setPhoneConfirmPassword, phoneCode, setPhoneCode, phoneAuthMode, setPhoneAuthMode, phoneAgreement, setPhoneAgreement,
    phoneAuthError, phoneSending, phoneVerifying, phoneCountdown, sendPhoneCode, submitPhoneLogin, submitPhoneRegister, closeLoginModal, logoutPhone,
  } = props;
  const passwordError = passwordValidationMessage(phonePassword);
  return (
    <div className="home-create-modal" role="dialog" aria-label="手机号登录">
      <div className="home-create-panel phone-login-panel">
        <div className="home-create-head">
          <strong>手机号{phoneAuthMode === 'register' ? '注册' : '登录'}</strong>
          <button aria-label="关闭登录" onClick={closeLoginModal}>关闭</button>
        </div>
        <div className="phone-auth-tabs" role="tablist" aria-label="账号操作">
          <button type="button" className={phoneAuthMode === 'login' ? 'active' : ''} onClick={() => setPhoneAuthMode('login')}>登录</button>
          <button type="button" className={phoneAuthMode === 'register' ? 'active' : ''} onClick={() => setPhoneAuthMode('register')}>注册</button>
        </div>
        <div className="login-form phone-login-form">
          <label>
            <span>手机号</span>
            <div className="phone-input-row">
              <b>+86</b>
              <input type="tel" inputMode="numeric" aria-label="手机号" placeholder="请输入手机号" maxLength={13} value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} />
            </div>
          </label>
          <label>
            <span>密码</span>
            <div className="phone-password-row">
              <input type="password" aria-label="密码" placeholder="请输入 8-128 位密码" maxLength={128} value={phonePassword} onChange={(event) => setPhonePassword(event.target.value)} />
            </div>
          </label>
          {passwordError ? <p className="phone-auth-error phone-password-error" role="alert">{passwordError}</p> : null}
          {phoneAuthMode === 'register' ? <label>
            <span>确认密码</span>
            <div className="phone-password-row">
              <input type="password" aria-label="确认密码" placeholder="请再次输入密码" maxLength={128} value={phoneConfirmPassword} onChange={(event) => setPhoneConfirmPassword(event.target.value)} />
            </div>
          </label> : null}
          {phoneAuthMode === 'register' ? <label>
            <span>验证码</span>
            <div className="phone-code-row">
              <input type="text" inputMode="numeric" aria-label="验证码" placeholder="6位验证码" maxLength={6} value={phoneCode} onChange={(event) => setPhoneCode(event.target.value.replace(/\D/g, '').slice(0, 6))} />
              <button type="button" className="phone-send-code" onClick={() => void sendPhoneCode()} disabled={phoneSending || phoneCountdown > 0}>
                {phoneSending ? '发送中' : phoneCountdown > 0 ? `${phoneCountdown}s 后重发` : '获取验证码'}
              </button>
            </div>
          </label> : null}
        </div>
        <label className="phone-agreement-row">
          <input type="checkbox" checked={phoneAgreement} onChange={(event) => setPhoneAgreement(event.target.checked)} />
          <span>我已阅读并同意用户协议和隐私政策</span>
        </label>
        {phoneAuthError ? <p className="phone-auth-error" role="alert">{phoneAuthError}</p> : null}
        <button className="home-create-submit phone-login-submit" onClick={() => void (phoneAuthMode === 'register' ? submitPhoneRegister() : submitPhoneLogin())} disabled={phoneVerifying || !phonePassword || (phoneAuthMode === 'register' && phoneCode.length !== 6)}>
          {phoneVerifying ? '处理中...' : phoneAuthMode === 'register' ? '注册' : '登录'}
        </button>
      </div>
    </div>
  );
}

export function ProfileEditModal(props: Record<string, any>) {
  const { profileEditName, setProfileEditName, profileEditAvatar, profileEditError, profileEditSaving, profileAvatarInputRef, chooseProfileAvatar, saveProfile, closeProfileEdit } = props;
  return (
    <div className="home-create-modal" role="presentation" onClick={closeProfileEdit}>
      <div className="home-create-panel profile-edit-panel" role="dialog" aria-modal="true" aria-labelledby="profile-edit-title" onClick={(event) => event.stopPropagation()}>
        <div className="home-create-head">
          <strong id="profile-edit-title">编辑资料</strong>
          <button type="button" aria-label="关闭编辑资料" onClick={closeProfileEdit}>关闭</button>
        </div>
        <input ref={profileAvatarInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void chooseProfileAvatar(event.target.files?.[0])} />
        <button type="button" className="profile-edit-avatar-picker" onClick={() => profileAvatarInputRef.current?.click()} aria-label="更换头像">
          <UserAvatar className="profile-avatar-content" avatarUrl={profileEditAvatar} />
          <em>更换头像</em>
        </button>
        <label className="profile-edit-name-field">
          <span>用户名</span>
          <input value={profileEditName} maxLength={32} placeholder="请输入用户名" onChange={(event) => setProfileEditName(event.target.value)} />
        </label>
        {profileEditError ? <p className="phone-auth-error" role="alert">{profileEditError}</p> : null}
        <button type="button" className="home-create-submit profile-edit-submit" onClick={() => void saveProfile()} disabled={profileEditSaving || !profileEditName.trim()}>
          {profileEditSaving ? '保存中...' : '保存资料'}
        </button>
      </div>
    </div>
  );
}

function LogoutConfirmModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="home-create-modal logout-confirm-backdrop" role="presentation" onClick={onCancel}>
      <div className="logout-confirm-panel" role="dialog" aria-modal="true" aria-labelledby="logout-confirm-title" onClick={(event) => event.stopPropagation()}>
        <div className="logout-confirm-icon" aria-hidden="true"><LogOut /></div>
        <h2 id="logout-confirm-title">确认退出登录？</h2>
        <p>退出后需要重新登录才能同步作品和豆子仓库。</p>
        <div className="logout-confirm-actions">
          <button type="button" className="logout-cancel-btn" onClick={onCancel}>取消</button>
          <button type="button" className="logout-confirm-btn" onClick={onConfirm}>确认退出</button>
        </div>
      </div>
    </div>
  );
}

export function HomeShellPage(props: HomeShellPageProps) {
  const {
    fileInputRef, handleUpload, status, activeTab, recentProjects, onOpenRecentProject, actionSheet,
    openUpload, isLoggedIn, loginName, setLoginName, loginPassword, setLoginPassword, submitLogin, isAuthenticating, showLoginModal,
    setShowLoginModal, showUploadModal, closeUploadModal, showXhsInput, setShowXhsInput, xhsLink, setXhsLink,
    xhsExtractedImages, isExtractingXhs, chooseLocalDrawing, extractXiaohongshuImage, importXhsImage,
    xhsPreviewSrc, usedColors, colorCodeOf, quickTools, showCreateCanvasModal, setShowCreateCanvasModal, openCreateCanvasModal,
    openBlankCanvasCreation,
    cfgCols, setCfgCols, cfgRows, setCfgRows, normalizeGridSize, parseGridSizeInput, createBlankCanvas, requireLogin,
    setStatus, patternListCards, homeTemplateCards, setActivePattern, setScreen, openAuthorProfile, warehouses, stockedColorCount, totalWarehouseStock,
    activeWarehouse, mardColors, openWarehouse, setActiveTab, communitySort, setCommunitySort, authRequestSeqRef, pendingAuthActionRef,
    setIsAuthenticating, logoutPhone, showLogoutConfirm, setShowLogoutConfirm, notifications, loadNotifications, openNotification,
    profileAvatarUrl, receivedLikesCount = 0, followingCount = 0, followersCount = 0, showProfileEditModal, openProfileEdit, profileEditModal, confirmDialog, requestConfirm, openMyWorks,
  } = props;
  const unreadNotificationCount = (notifications ?? []).filter((item: { isRead?: boolean }) => !item.isRead).length;
  return (
    <main className="h5-home-shell">
      {confirmDialog}
      <input ref={fileInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleUpload(event.target.files?.[0])} />
      {status ? (
        <p className="app-status" role="status" aria-live="polite">{status}</p>
      ) : null}
      {activeTab === 'home' ? (
        <section className="home-page">
          <div className="home-scroll-content">
            <header className="home-brand-hero">
              <div className="home-stars" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <div className="home-brand-planet" aria-hidden="true">
                <span className="home-planet-core" />
                <span className="home-planet-ring" />
              </div>
              <div className="home-brand-topline">
                <div className="home-brand-copy">
                  <h1>超级拼</h1>
                  <p>让拼豆创作更简单</p>
                </div>
              </div>
              <HomeUploadHero onUpload={() => openUpload('bead')} />
            </header>

            <section className="home-recent-projects" aria-labelledby="home-recent-title">
              <div className="home-section-heading">
                <h2 id="home-recent-title">最近项目</h2>
                {isLoggedIn && recentProjects.length > 0 ? (
                  <button type="button" aria-label="查看全部最近项目" onClick={() => openMyWorks ? openMyWorks('home') : setScreen('my-works')}>
                    全部
                    <span aria-hidden="true">›</span>
                  </button>
                ) : null}
              </div>
              {!isLoggedIn ? (
                <div className="home-recent-empty">
                  <div className="home-recent-empty-art" aria-hidden="true"><Icon name="folder" /></div>
                  <strong>登录后查看最近项目</strong>
                  <span>登录后会自动同步你的创作记录</span>
                  <button type="button" onClick={() => setShowLoginModal(true)}>立即登录</button>
                </div>
              ) : recentProjects.length > 0 ? (
                <div className="home-recent-row" aria-label="最近项目列表">
                  {recentProjects.slice(0, 4).map((project: any) => (
                    <button className={`home-recent-card ${project.tone || 'recent-flower'}`} key={project.id} data-project-card-id={project.id} type="button" onClick={() => onOpenRecentProject(project)}>
                      {(project.thumbnailImage || project.sourceImage) ? (
                        <img className="home-recent-thumb home-recent-thumb-image" src={project.thumbnailImage || project.sourceImage} alt="" />
                      ) : (
                        <div className="home-recent-thumb" aria-hidden="true"><span /><i /></div>
                      )}
                      <strong>{project.cols}×{project.rows}</strong>
                      <span>{project.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="home-recent-empty">
                  <div className="home-recent-empty-art" aria-hidden="true"><Icon name="folder" /></div>
                  <strong>还没有最近项目</strong>
                  <span>开始创作后，项目会显示在这里</span>
                </div>
              )}
            </section>

            <section className="home-template-section" aria-labelledby="home-template-title">
              <div className="home-section-heading">
                <h2 id="home-template-title">热门模板</h2>
                <button type="button" aria-label="查看更多热门模板" onClick={() => setActiveTab('discover')}>
                  更多
                  <span aria-hidden="true">›</span>
                </button>
              </div>
              <div className="home-template-row" aria-label="热门模板预览">
                {homeTemplateCards.map((template: any) => (
                  <CommunityPatternCard
                    key={template.id}
                    pattern={template}
                    className="home-template-card"
                    onOpen={(pattern) => {
                      setActivePattern(pattern);
                      setScreen('pattern-detail');
                    }}
                  />
                ))}
                {homeTemplateCards.length === 0 ? <p className="community-empty">还没有分享的作品</p> : null}
              </div>
            </section>
          </div>

          {showCreateCanvasModal ? (
            <div className="home-create-modal" role="dialog" aria-label="新建画布设置">
              <div className="home-create-panel">
                <div className="home-create-head">
                  <strong>新建空白画布</strong>
                  <button aria-label="关闭新建画布" onClick={() => setShowCreateCanvasModal(false)}>关闭</button>
                </div>
                <div className="home-create-presets" aria-label="画布尺寸快捷选项">
                  {[32, 52, 104].map((size) => (
                    <button
                      key={size}
                      type="button"
                      className={cfgCols === size && cfgRows === size ? 'active' : ''}
                      onClick={() => {
                        setCfgCols(size);
                        setCfgRows(size);
                      }}
                    >
                      {size}×{size}
                    </button>
                  ))}
                </div>
                <div className="home-create-form">
                  <label>
                    <span>宽度列数</span>
                    <input
                      type="number"
                      min={2}
                      max={120}
                      value={cfgCols}
                      aria-label="宽度列数"
                      onChange={(event) => setCfgCols(parseGridSizeInput(event.target.value))}
                      onBlur={() => setCfgCols(normalizeGridSize(cfgCols))}
                    />
                  </label>
                  <label>
                    <span>高度行数</span>
                    <input
                      type="number"
                      min={2}
                      max={120}
                      value={cfgRows}
                      aria-label="高度行数"
                      onChange={(event) => setCfgRows(parseGridSizeInput(event.target.value))}
                      onBlur={() => setCfgRows(normalizeGridSize(cfgRows))}
                    />
                  </label>
                </div>
                <button className="home-create-submit" onClick={createBlankCanvas}>创建画布</button>
              </div>
            </div>
          ) : null}
          {showUploadModal ? (
            <div className="home-create-modal" role="dialog" aria-label="上传图纸">
              <div className="home-create-panel upload-drawing-panel">
                <div className="home-create-head">
                  <span className="modal-sheet-handle" aria-hidden="true" />

                  <button
                    aria-label="关闭上传图纸"
                    onClick={closeUploadModal}
                  >
                    关闭
                  </button>
                </div>
                <div className="upload-source-list">
                  <button className="upload-source-option blank-canvas-source-option" type="button" onClick={openBlankCanvasCreation}>
                    <span className="upload-source-icon"><Icon name="brush" /></span>
                    <span>
                      <strong>新建空白画布</strong>
                      <small>选择尺寸，从空白网格开始创作</small>
                    </span>
                    <i className="upload-source-arrow" aria-hidden="true">›</i>
                  </button>
                  <button className="upload-source-option local-source-option" aria-label="选择图纸" onClick={chooseLocalDrawing}>
                    <span className="upload-source-icon"><Icon name="upload" /></span>
                    <span>
                      <strong>从相册或文件选择</strong>
                      <small>打开设备相册或文件选择器</small>
                    </span>
                    <i className="upload-source-arrow" aria-hidden="true">›</i>
                  </button>
                  <button
                    className={showXhsInput ? 'upload-source-option xhs-source-option active' : 'upload-source-option xhs-source-option'}
                    onClick={() => requireLogin(() => setShowXhsInput(true))}
                  >
                    <span className="upload-source-icon"><Icon name="spark" /></span>
                    <span>
                      <strong>小红书提取 <em>需登录</em></strong>
                      <small>粘贴笔记链接后提取图片</small>
                    </span>
                    <i className="upload-source-arrow" aria-hidden="true">›</i>
                  </button>
                </div>
                {showXhsInput ? (
                  <div className="xhs-extract-form">
                    <label>
                      <span>小红书链接</span>
                      <input
                        type="url"
                        aria-label="小红书链接"
                        placeholder="粘贴小红书笔记链接或分享口令"
                        value={xhsLink}
                        onChange={(event) => setXhsLink(event.target.value)}
                      />
                    </label>
                    <button className="home-create-submit" onClick={() => void extractXiaohongshuImage()} disabled={isExtractingXhs}>
                      {isExtractingXhs ? '提取中...' : '提取图片'}
                    </button>
                    {xhsExtractedImages.length > 1 ? (
                      <div className="xhs-image-picker">
                        <strong>选择笔记图片</strong>
                        <div className="xhs-image-grid">
                          {xhsExtractedImages.map((image: { imageDataUrl?: string; imageUrl?: string }, index: number) => (
                            <button
                              key={`${image.imageDataUrl || image.imageUrl}-${index}`}
                              aria-label={`选择第 ${index + 1} 张小红书图片`}
                              onClick={() => void importXhsImage(image)}
                            >
                              <img src={xhsPreviewSrc(image)} alt="" />
                              <span>{index + 1}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          {showLoginModal ? <PhoneLoginModal {...props} /> : null}
        </section>
      ) : activeTab === 'discover' ? (
        <PatternDiscoverPage
          patterns={patternListCards}
          activeSort={communitySort}
          onSortChange={setCommunitySort}
          query={props.communityQuery}
          onQueryChange={props.setCommunityQuery}
          selectedTags={props.communitySelectedTags}
          onTagsChange={props.setCommunitySelectedTags}
          availableTags={props.communityAvailableTags || []}
          onOpen={(pattern: any) => {
            setActivePattern(pattern);
            setScreen('pattern-detail');
          }}
          onOpenAuthor={(pattern: any) => {
            openAuthorProfile?.(pattern, 'discover');
          }}
        />
      ) : activeTab === 'messages' ? (
        <PatternMessagesPage
          isLoggedIn={isLoggedIn}
          notifications={notifications}
          onHome={() => setActiveTab('home')}
          onDiscover={() => setActiveTab('discover')}
          onUpload={() => openUpload('bead')}
          onProfile={() => setActiveTab('profile')}
          onLogin={() => setShowLoginModal(true)}
          onOpenNotification={openNotification}
        />
      ) : (
        <section className="profile-page">
          <header className="profile-hero">
            <div className="profile-orbit" aria-hidden="true" />
            <div>
              <h1>我的</h1>
              <p>管理你的拼豆世界</p>
            </div>
          </header>
          <section className={isLoggedIn ? 'profile-account-card' : 'profile-account-card is-guest'} aria-label="账号状态">
            <div className="profile-account-top">
              <div className="profile-avatar" aria-hidden="true">
                <UserAvatar className="profile-avatar-content" avatarUrl={isLoggedIn ? profileAvatarUrl : null} />
                {isLoggedIn ? <i>✓</i> : null}
              </div>
              <div className="profile-account-copy">
                <div className="profile-account-name">
                  <strong>{isLoggedIn ? loginName : '未登录'}</strong>
                </div>
                <span>{isLoggedIn ? 'ID 20260729' : '登录后同步项目与豆子库存'}</span>
              </div>
              <button className="profile-edit-btn" type="button" onClick={() => requireLogin(() => openProfileEdit())}>
                <Icon name="brush" />
                <span>{isLoggedIn ? '编辑资料' : '立即登录'}</span>
              </button>
            </div>
            {isLoggedIn ? (
              <div className="profile-account-stats" aria-label="账号统计">
                <button type="button" aria-label="查看我的作品" onClick={() => requireLogin(() => openMyWorks ? openMyWorks('profile') : setScreen('my-works'))}><strong>{recentProjects.length}</strong><span>作品</span></button>
                <button type="button" aria-label="查看获赞列表" onClick={() => requireLogin(() => setStatus('获赞列表功能即将开放。'))}><strong>{receivedLikesCount}</strong><span>获赞</span></button>
                <button type="button" aria-label="查看关注列表" onClick={() => requireLogin(() => setScreen('following'))}><strong>{followingCount}</strong><span>关注</span></button>
                <button type="button" aria-label="查看粉丝列表" onClick={() => requireLogin(() => setScreen('followers'))}><strong>{followersCount}</strong><span>粉丝</span></button>
              </div>
            ) : null}
          </section>
          {showProfileEditModal ? profileEditModal : null}
          <button className="profile-warehouse-card" onClick={openWarehouse}>
            <span className="profile-warehouse-icon"><Icon name="layers" /></span>
            <span className="profile-warehouse-copy">
              <strong>豆子仓库</strong>
              <small>{isLoggedIn ? `管理 ${activeWarehouse?.name ?? 'MARD 221 色库存'}` : '登录后查看豆子仓库'}</small>
              <span className="profile-progress-track" aria-hidden="true">
                <i style={{ width: `${Math.max(4, Math.min(100, (stockedColorCount / mardColors.length) * 100))}%` }} />
              </span>
              <span className="profile-warehouse-meta">
                <small>已入库 {stockedColorCount} / {mardColors.length} 色</small>
                <small>共 {totalWarehouseStock.toLocaleString()} 颗</small>
              </span>
            </span>
            <span className="profile-chevron" aria-hidden="true">›</span>
          </button>
          <section className="profile-menu-card" aria-label="个人中心菜单">
            <button className="profile-row" type="button" aria-label="打开设置" onClick={() => requireLogin(() => setStatus('设置功能即将开放。'))}><span className="profile-row-icon"><Icon name="settings" /></span><span><strong>设置</strong><small>账号、安全与偏好</small></span><em>›</em></button>
          </section>
          {isLoggedIn ? <button className="profile-logout-btn" type="button" onClick={() => requestConfirm({ title: '确认退出登录？', message: '退出后需要重新登录才能同步作品和豆子仓库。', confirmText: '确认退出', danger: true, onConfirm: logoutPhone })}><LogOut aria-hidden="true" /><span>退出登录</span></button> : null}
          {showLoginModal ? <PhoneLoginModal {...props} /> : null}
        </section>
      )}

      <nav className="bottom-tabs" aria-label="底部导航">
        <button className={activeTab === 'home' ? 'active' : ''} aria-label="首页" onClick={() => setActiveTab('home')}>
          <Icon name="home" />
          <span>首页</span>
        </button>
        <button className={activeTab === 'discover' ? 'active' : ''} aria-label="发现" onClick={() => setActiveTab('discover')}>
          <Icon name="discover" />
          <span>发现</span>
        </button>
        <button className="plus-tab" aria-label="创建" onClick={() => openUpload('bead')}>
          <Icon name="plus" />
        </button>
        <button className={activeTab === 'messages' ? 'active' : ''} aria-label="消息" onClick={() => { setActiveTab('messages'); void loadNotifications?.(); }}>
          <span className="pattern-message-tab-icon"><Icon name="message" />{unreadNotificationCount > 0 ? <i aria-label={`${unreadNotificationCount} 条未读`}>{unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}</i> : null}</span>
          <span>消息</span>
        </button>
        <button className={activeTab === 'profile' ? 'active' : ''} aria-label="我的" onClick={() => setActiveTab('profile')}>
          <Icon name="profile" />
          <span>我的</span>
        </button>
      </nav>
      {actionSheet}
    </main>
  );
}
