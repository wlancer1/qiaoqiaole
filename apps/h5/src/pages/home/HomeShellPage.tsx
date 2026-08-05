import { HomeUploadHero } from '../../flow/H5FlowComponents';
import { AuthorProfilePage, PatternDetailPage, PatternDiscoverPage, PatternMessagesPage } from '../../patterns/H5PatternPages';
import { Icon } from '../../shared/h5Icons';
import { Heart } from 'lucide-react';

type HomeShellPageProps = Record<string, any>;

export function HomeShellPage(props: HomeShellPageProps) {
  const {
    fileInputRef, handleUpload, status, activeTab, recentProjects, homeTemplateFilters, onOpenRecentProject,
    openUpload, isLoggedIn, loginName, setLoginName, loginPassword, setLoginPassword, submitLogin, isAuthenticating, showLoginModal,
    setShowLoginModal, showUploadModal, closeUploadModal, showXhsInput, setShowXhsInput, xhsLink, setXhsLink,
    xhsExtractedImages, isExtractingXhs, chooseLocalDrawing, extractXiaohongshuImage, importXhsImage,
    xhsPreviewSrc, usedColors, colorCodeOf, quickTools, showCreateCanvasModal, setShowCreateCanvasModal, openCreateCanvasModal,
    cfgCols, setCfgCols, cfgRows, setCfgRows, normalizeGridSize, createBlankCanvas, requireLogin,
    setStatus, patternListCards, homeTemplateCards, setActivePattern, setScreen, warehouses, stockedColorCount, totalWarehouseStock,
    activeWarehouse, mardColors, openWarehouse, setActiveTab, communitySort, setCommunitySort, authRequestSeqRef, pendingAuthActionRef,
    setIsAuthenticating,
  } = props;
  return (
    <main className="h5-home-shell">
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
                  <button type="button" aria-label="查看全部最近项目" onClick={() => setScreen('my-works')}>
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
                    <button className={`home-recent-card ${project.tone || 'recent-flower'}`} key={project.id} type="button" onClick={() => onOpenRecentProject(project)}>
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
              <div className="home-template-filters" aria-label="模板分类">
                {homeTemplateFilters.map((filter: string) => (
                  <span key={filter}>{filter}</span>
                ))}
              </div>
              <div className="home-template-row" aria-label="热门模板预览">
                {homeTemplateCards.map((template: any) => (
                  <button className={`home-template-card ${template.tone}`} key={template.id} type="button" onClick={() => {
                    setActivePattern(template);
                    setScreen('pattern-detail');
                  }}>
                    {template.image ? <img src={template.image} alt="" /> : <div className="home-template-art-empty" aria-hidden="true" />}
                    <strong>{template.title}</strong>
                    <small><Heart aria-hidden="true" /> {template.likes}</small>
                  </button>
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
                <div className="home-create-form">
                  <label>
                    <span>宽度列数</span>
                    <input
                      type="number"
                      min={2}
                      max={120}
                      value={cfgCols}
                      aria-label="宽度列数"
                      onChange={(event) => setCfgCols(normalizeGridSize(parseInt(event.target.value) || 32))}
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
                      onChange={(event) => setCfgRows(normalizeGridSize(parseInt(event.target.value) || 32))}
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
                  <button className="upload-source-option" aria-label="选择图纸" onClick={chooseLocalDrawing}>
                    <span className="upload-source-icon"><Icon name="upload" /></span>
                    <span>
                      <strong>从相册或文件选择</strong>
                      <small>打开设备相册或文件选择器</small>
                    </span>
                    <i className="upload-source-arrow" aria-hidden="true">›</i>
                  </button>
                  <button
                    className={showXhsInput ? 'upload-source-option active' : 'upload-source-option'}
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
                        placeholder="粘贴 xiaohongshu.com 或 xhslink.com 链接"
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
                <div className="upload-format-note" aria-label="支持的图片格式">
                  <span>PNG / JPG / WebP</span>
                  <span>最大 20MB</span>
                </div>
              </div>
            </div>
          ) : null}
          {showLoginModal ? (
            <div className="home-create-modal" role="dialog" aria-label="登录面板">
              <div className="home-create-panel">
                <div className="home-create-head">
                  <strong>登录</strong>
                  <button aria-label="关闭登录" onClick={() => {
                    authRequestSeqRef.current += 1;
                    setIsAuthenticating(false);
                    pendingAuthActionRef.current = null;
                    setShowLoginModal(false);
                  }}>关闭</button>
                </div>
                <div className="login-form">
                  <label>
                    <span>用户名</span>
                    <input
                      type="text"
                      aria-label="用户名"
                      placeholder="输入用户名"
                      value={loginName}
                      onChange={(event) => setLoginName(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>密码</span>
                    <input
                      type="password"
                      aria-label="密码"
                      placeholder="输入密码"
                      value={loginPassword}
                      onChange={(event) => setLoginPassword(event.target.value)}
                    />
                  </label>
                </div>
                <button className="home-create-submit" onClick={() => void submitLogin()} disabled={isAuthenticating}>
                  {isAuthenticating ? '处理中...' : '登录并继续'}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : activeTab === 'discover' ? (
        <PatternDiscoverPage
          patterns={patternListCards}
          activeSort={communitySort}
          onSortChange={setCommunitySort}
          onOpen={(pattern: any) => {
            setActivePattern(pattern);
            setScreen('pattern-detail');
          }}
          onOpenAuthor={() => setScreen('author-profile')}
        />
      ) : activeTab === 'messages' ? (
        <PatternMessagesPage
          isLoggedIn={isLoggedIn}
          onHome={() => setActiveTab('home')}
          onDiscover={() => setActiveTab('discover')}
          onUpload={() => openUpload('bead')}
          onProfile={() => setActiveTab('profile')}
          onLogin={() => setShowLoginModal(true)}
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
          <section className="profile-account-card" aria-label="账号状态">
            <div className="profile-account-top">
              <div className="profile-avatar" aria-hidden="true">
                <span>拼</span>
                {isLoggedIn ? <i>✓</i> : null}
              </div>
              <div className="profile-account-copy">
                <div className="profile-account-name">
                  <strong>{isLoggedIn ? loginName : '未登录'}</strong>
                  {isLoggedIn ? <em>LV5</em> : null}
                </div>
                <span>{isLoggedIn ? 'ID 20260729' : '登录后同步项目与豆子库存'}</span>
              </div>
              <button className="profile-edit-btn" type="button" onClick={() => isLoggedIn ? setStatus('个人资料编辑暂未开放') : setShowLoginModal(true)}>
                <Icon name="brush" />
                <span>{isLoggedIn ? '编辑资料' : '立即登录'}</span>
              </button>
            </div>
            <div className="profile-account-stats" aria-label="账号统计">
              <div><strong>{isLoggedIn ? recentProjects.length : 0}</strong><span>作品</span></div>
              <div><strong>0</strong><span>获赞</span></div>
              <div><strong>0</strong><span>关注</span></div>
              <div><strong>0</strong><span>粉丝</span></div>
            </div>
          </section>
          <button className="profile-warehouse-card" onClick={openWarehouse}>
            <span className="profile-warehouse-icon"><Icon name="layers" /></span>
            <span className="profile-warehouse-copy">
              <strong>豆子仓库</strong>
              <small>{isLoggedIn ? `管理 ${activeWarehouse?.name ?? 'MARD 221 色库存'}` : '登录后查看豆子仓库'}</small>
              <span className="profile-swatch-row" aria-hidden="true">
                {mardColors.slice(0, 5).map((color: { code: string; hex: string }) => (
                  <i key={color.code} style={{ background: color.hex }} />
                ))}
                <em>+{Math.max(0, mardColors.length - 5)}</em>
              </span>
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
            <button className="profile-row"><span className="profile-row-icon"><Icon name="folder" /></span><span><strong>历史记录</strong><small>查看最近编辑与导出</small></span><em>›</em></button>
            <button className="profile-row"><span className="profile-row-icon"><Icon name="help" /></span><span><strong>帮助中心</strong><small>常见问题与使用指南</small></span><em>›</em></button>
            <button className="profile-row"><span className="profile-row-icon"><Icon name="settings" /></span><span><strong>设置</strong><small>账号、安全与偏好</small></span><em>›</em></button>
          </section>
          {showLoginModal ? (
            <div className="home-create-modal" role="dialog" aria-label="登录面板">
              <div className="home-create-panel">
                <div className="home-create-head">
                  <strong>登录</strong>
                  <button aria-label="关闭登录" onClick={() => {
                    authRequestSeqRef.current += 1;
                    setIsAuthenticating(false);
                    pendingAuthActionRef.current = null;
                    setShowLoginModal(false);
                  }}>关闭</button>
                </div>
                <div className="login-form">
                  <label>
                    <span>用户名</span>
                    <input
                      type="text"
                      aria-label="用户名"
                      placeholder="输入用户名"
                      value={loginName}
                      onChange={(event) => setLoginName(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>密码</span>
                    <input
                      type="password"
                      aria-label="密码"
                      placeholder="输入密码"
                      value={loginPassword}
                      onChange={(event) => setLoginPassword(event.target.value)}
                    />
                  </label>
                </div>
                <button className="home-create-submit" onClick={() => void submitLogin()} disabled={isAuthenticating}>
                  {isAuthenticating ? '处理中...' : '登录并继续'}
                </button>
              </div>
            </div>
          ) : null}
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
        <button className="plus-tab" aria-label="上传" onClick={() => openUpload('bead')}>
          <Icon name="plus" />
        </button>
        <button className={activeTab === 'messages' ? 'active' : ''} aria-label="消息" onClick={() => setActiveTab('messages')}>
          <Icon name="message" />
          <span>消息</span>
        </button>
        <button className={activeTab === 'profile' ? 'active' : ''} aria-label="我的" onClick={() => setActiveTab('profile')}>
          <Icon name="profile" />
          <span>我的</span>
        </button>
      </nav>
    </main>
  );
}
