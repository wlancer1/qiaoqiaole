import { ArrowLeft, Download, Grid2X2, Heart, MessageCircle, Ruler, Search, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Icon } from '../shared/h5Icons';
import { BeadListDrawer, type BeadColorItem } from '../flow/H5FlowComponents';
import type { CommunityComment } from '../community/communityData';
import type { PatternListCard, RecentProject } from '../shared/h5Types';

export function AuthorProfilePage({ patterns, onBack, onOpen }: { patterns: PatternListCard[]; onBack: () => void; onOpen: (pattern: PatternListCard) => void }) {
  const authorWorkTitles = ['纸杯蛋糕', '小熊咖啡', '向日葵', '可爱猫', '草莓蛋糕', '樱花树'];

  return (
    <main className="author-profile-page" aria-label="作者主页">
      <header className="author-profile-header">
        <button type="button" aria-label="返回发现" onClick={onBack}><ArrowLeft aria-hidden="true" /></button>
        <h1>作者主页</h1>
        <span aria-hidden="true" />
      </header>
      <section className="author-profile-summary" aria-label="作者资料">
        <div className="author-profile-avatar" aria-hidden="true">晴</div>
        <div className="author-profile-copy">
          <div className="author-profile-name"><h2>晴</h2><em>LV5</em></div>
          <p>拼豆爱好者 · 分享可爱图纸</p>
        </div>
        <button className="author-follow-btn" type="button">关注</button>
      </section>
      <section className="author-profile-stats" aria-label="作者统计">
        <div><strong>86</strong><span>作品</span></div>
        <div><strong>1.2w</strong><span>获赞</span></div>
        <div><strong>5.6w</strong><span>粉丝</span></div>
        <div><strong>38.2w</strong><span>浏览</span></div>
      </section>
      <nav className="author-profile-tabs" aria-label="作者内容分类">
        <button className="active" type="button">作品</button>
        <button type="button">收藏</button>
        <button type="button">喜欢</button>
      </nav>
      <section className="author-work-grid" aria-label="作者作品">
        {Array.from({ length: 6 }, (_, index) => patterns[index % patterns.length]).map((card, index) => (
          <button className="author-work-card" key={`${card.title}-${index}`} type="button" onClick={() => onOpen(card)}>
            <div className={`author-work-art ${card.tone}`} aria-hidden="true">
              <div className="pattern-art-grid">
                {card.beads.map((color, beadIndex) => <i key={`${index}-${beadIndex}`} style={{ backgroundColor: color }} />)}
              </div>
            </div>
            <strong>{authorWorkTitles[index]}</strong>
          </button>
        ))}
      </section>
    </main>
  );
}

export function MyWorksPage({
  projects,
  onBack,
  onOpen,
  onShare,
  sharingProjectId = '',
  shareFailedProjectIds = new Set<string>(),
}: {
  projects: RecentProject[];
  onBack: () => void;
  onOpen: (project: RecentProject) => void;
  onShare?: (project: RecentProject) => void;
  sharingProjectId?: string;
  shareFailedProjectIds?: Set<string>;
}) {
  const thumbColors = [
    ['#dcecff', '#f6bf38', '#67bd65', '#f18d9d'],
    ['#dcecff', '#9edb72', '#e6a546', '#f7d9b5'],
    ['#fde4ec', '#e85b94', '#f7d9b5', '#d87855'],
    ['#cfe7ff', '#146cff', '#8bc34a', '#f9c640'],
  ];

  return (
    <main className="author-profile-page my-works-page" aria-label="我的作品">
      <header className="author-profile-header">
        <button type="button" aria-label="返回首页" onClick={onBack}><ArrowLeft aria-hidden="true" /></button>
        <h1>我的作品</h1>
        <span aria-hidden="true" />
      </header>
      <section className="author-profile-summary" aria-label="个人资料">
        <div className="author-profile-avatar" aria-hidden="true">拼</div>
        <div className="author-profile-copy">
          <div className="author-profile-name"><h2>我的创作</h2><em>作品</em></div>
          <p>保存的拼豆图纸都会显示在这里</p>
        </div>
        <span className="my-works-count">{projects.length} 件</span>
      </section>
      <section className="author-profile-stats" aria-label="作品统计">
        <div><strong>{projects.length}</strong><span>作品</span></div>
        <div><strong>0</strong><span>获赞</span></div>
        <div><strong>0</strong><span>收藏</span></div>
        <div><strong>0</strong><span>浏览</span></div>
      </section>
      <nav className="author-profile-tabs" aria-label="作品分类">
        <button className="active" type="button">作品</button>
        <button type="button">收藏</button>
        <button type="button">喜欢</button>
      </nav>
      {projects.length > 0 ? (
        <section className="author-work-grid" aria-label="我的作品列表">
          {projects.map((project, index) => (
            <article
              className="author-work-card my-work-card"
              key={project.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpen(project)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onOpen(project);
                }
              }}
            >
              {(project.thumbnailImage || project.sourceImage) ? (
                <img className="author-work-art my-work-thumb-image" src={project.thumbnailImage || project.sourceImage} alt="" />
              ) : (
                <div className={`author-work-art ${project.tone || 'recent-flower'}`} aria-hidden="true">
                  <div className="my-work-thumb-grid">
                    {Array.from({ length: 24 }, (_, colorIndex) => (
                      <i key={colorIndex} style={{ backgroundColor: thumbColors[index % thumbColors.length][colorIndex % 4] }} />
                    ))}
                  </div>
                </div>
              )}
              <strong>{project.name.startsWith('wx') ? '未命名作品' : project.name}</strong>
              <small>{project.cols}×{project.rows}</small>
              <button
                className={project.sharedToCommunity ? 'my-work-share-state shared' : shareFailedProjectIds.has(project.id) ? 'my-work-share-state failed' : 'my-work-share-state'}
                type="button"
                disabled={project.sharedToCommunity || sharingProjectId === project.id}
                onClick={(event) => {
                  event.stopPropagation();
                  onShare?.(project);
                }}
              >
                {project.sharedToCommunity ? '已分享到社区' : sharingProjectId === project.id ? '分享中...' : shareFailedProjectIds.has(project.id) ? '重试分享' : '分享到社区'}
              </button>
            </article>
          ))}
        </section>
      ) : (
        <section className="author-work-empty" aria-label="暂无作品">
          <strong>还没有保存的作品</strong>
          <span>完成创作并保存后，作品会显示在这里</span>
        </section>
      )}
    </main>
  );
}

export function PatternDiscoverPage({ patterns, activeSort = 'hot', onSortChange, onOpen, onOpenAuthor }: {
  patterns: PatternListCard[];
  activeSort?: 'hot' | 'latest';
  onSortChange?: (sort: 'hot' | 'latest') => void;
  onOpen: (pattern: PatternListCard) => void;
  onOpenAuthor: () => void;
}) {
  const sortTabs: Array<{ label: string; sort: 'hot' | 'latest'; active: boolean }> = [
    { label: '最新', sort: 'latest', active: activeSort === 'latest' },
    { label: '热门', sort: 'hot', active: activeSort === 'hot' },
  ];
  return (
    <section className="pattern-list-page">
      <div className="pattern-list-content">
        <header className="pattern-list-head" aria-label="稿件列表页">
          <label className="pattern-search">
            <Search aria-hidden="true" />
            <input type="search" placeholder="搜索图纸、作者、标签" aria-label="搜索图纸、作者、标签" />
          </label>

          <div className="pattern-tabs" role="tablist" aria-label="稿件排序">
            {sortTabs.map((tab) => (
              <button key={tab.label} className={tab.active ? 'active' : ''} type="button" role="tab" aria-selected={tab.active} onClick={() => onSortChange?.(tab.sort)}>
                {tab.label}
              </button>
            ))}
          </div>

        </header>

        <section className="pattern-masonry" aria-label="社区稿件列表">
          {[patterns.filter((_, index) => index % 2 === 0), patterns.filter((_, index) => index % 2 === 1)].map((column, columnIndex) => (
            <div className="pattern-masonry-column" key={`pattern-column-${columnIndex}`}>
              {column.map((card) => (
                <button className="pattern-card" data-card-index={patterns.indexOf(card)} key={card.title} type="button" onClick={() => onOpen(card)}>
              <div className={`pattern-art ${card.tone}`} aria-hidden="true">
                {card.image ? <img className="pattern-card-image" src={card.image} alt="" /> : <div className="pattern-card-empty">暂无预览图</div>}
              </div>
              <div className="pattern-card-body">
                <h2>{card.title}</h2>
                <div className="pattern-card-info-row">
                  <div className="pattern-author-row">
                    <span
                      className={`pattern-avatar ${card.tone}`}
                      role="link"
                      tabIndex={0}
                      aria-label={`查看${card.author}的作者主页`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenAuthor();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          event.stopPropagation();
                          onOpenAuthor();
                        }
                      }}
                    />
                    <strong>{card.author}</strong>
                  </div>
                  <div className="pattern-card-meta">
                    <span><Heart aria-hidden="true" /> {formatPatternCount(card.likes)}</span>
                    <span><MessageCircle aria-hidden="true" /> {formatPatternCount(card.comments)}</span>
                  </div>
                  </div>
                </div>
                </button>
              ))}
            </div>
          ))}
        </section>
      </div>
    </section>
  );
}

export function PatternMessagesPage({ isLoggedIn, onHome, onDiscover, onUpload, onProfile, onLogin }: {
  isLoggedIn: boolean;
  onHome: () => void;
  onDiscover: () => void;
  onUpload: () => void;
  onProfile: () => void;
  onLogin: () => void;
}) {
  return (
    <main className="pattern-message-page" aria-label="消息">
      <div className="pattern-message-card">
        <div className="pattern-message-illustration" aria-hidden="true">
          <span className="pattern-message-spark spark-one" />
          <span className="pattern-message-spark spark-two" />
          <span className="pattern-message-spark spark-three" />
          <Icon name="message" />
        </div>
        <strong>暂无消息</strong>
        <p>评论、关注和下载通知会显示在这里。</p>
        {!isLoggedIn ? <button type="button" onClick={onLogin}>去登录</button> : null}
      </div>
      <nav className="bottom-tabs pattern-message-tabs" aria-label="底部导航">
        <button type="button" aria-label="首页" onClick={onHome}><Icon name="home" /><span>首页</span></button>
        <button type="button" aria-label="发现" onClick={onDiscover}><Icon name="discover" /><span>发现</span></button>
        <button className="plus-tab" type="button" aria-label="上传" onClick={onUpload}><Icon name="plus" /></button>
        <button className="active" type="button" aria-label="消息"><Icon name="message" /><span>消息</span></button>
        <button type="button" aria-label="我的" onClick={onProfile}><Icon name="profile" /><span>我的</span></button>
      </nav>
    </main>
  );
}

export function PatternDetailPage({ pattern, onBack, isLoggedIn, comments, isLoadingComments, onLoadComments, onLike, onComment, onLogin }: {
  pattern: PatternListCard;
  onBack: () => void;
  isLoggedIn: boolean;
  comments: CommunityComment[];
  isLoadingComments: boolean;
  onLoadComments: () => void;
  onLike: () => void;
  onComment: (content: string) => void;
  onLogin: () => void;
}) {
  const [commentDraft, setCommentDraft] = useState('');
  const [showFullBeadList, setShowFullBeadList] = useState(false);
  useEffect(() => { onLoadComments(); }, [pattern.id]);

  const submitComment = () => {
    if (!isLoggedIn) return onLogin();
    const content = limitCommentContent(commentDraft.trim());
    if (!content) return;
    onComment(content);
    setCommentDraft('');
  };

  const beadItems = pattern.beadList ?? [];
  const totalBeads = beadItems.reduce((total, item) => total + item.count, 0);
  const drawerColors: BeadColorItem[] = beadItems.map((item) => ({ color: item.color, code: item.color.toUpperCase(), count: item.count }));

  return (
    <main className="pattern-detail-page" aria-label="图纸详情页">
      <div className="pattern-detail-content">
        <div className="pattern-detail-header-shell">
          <header className="pattern-detail-header">
            <button className="pattern-detail-back" type="button" aria-label="返回发现" onClick={onBack}><Icon name="arrow-left" /></button>
            <div className="pattern-detail-author">
              <span className="detail-author-avatar" aria-hidden="true" />
              <div>
                <div className="pattern-detail-author-name">
                  <strong>{pattern.author}</strong>
                </div>
                <small>社区分享者</small>
              </div>
            </div>
            <button className="detail-follow-btn" type="button">关注</button>
            <button className="detail-share-btn" type="button" aria-label="分享"><Share2 aria-hidden="true" /></button>
          </header>
        </div>

        <section className="detail-main-card" aria-label="图纸主信息">
          <div className="detail-hero-art" aria-label={`${pattern.title}预览`}>
            {(pattern.detailImage || pattern.image) ? <img src={pattern.detailImage || pattern.image} alt="" /> : <div className="detail-art-empty">暂无预览图</div>}
          </div>
        </section>

        <section className="detail-info-card" aria-label="图纸信息">
          <h1>{pattern.title}</h1>
          <div className="detail-title-meta">
            <span>发布日期 {pattern.meta}</span>
            <span>浏览次数 未统计</span>
          </div>
          <div className="detail-meta-grid" aria-label="图纸信息">
            <div className="detail-meta-card">
              <span className="detail-meta-icon"><Ruler aria-hidden="true" /></span>
              <span><small>图纸尺寸</small><strong>{pattern.physicalSize || '未记录'}</strong></span>
            </div>
            <div className="detail-meta-card">
              <span className="detail-meta-icon"><Grid2X2 aria-hidden="true" /></span>
              <span><small>格数</small><strong>{pattern.size}</strong></span>
            </div>
          </div>
        </section>

        <section className="detail-beads-card" aria-label="豆子清单">
          <div className="detail-section-title">
            <h2>豆子清单</h2>
          <span>{totalBeads} 颗 · {beadItems.length} 色</span>
        </div>
          {beadItems.length ? (
            <div className="detail-bead-list">
              {beadItems.slice(0, 5).map((item) => (
                <div className="detail-bead-item" key={item.color}>
                  <i style={{ backgroundColor: item.color }} aria-hidden="true" />
                  <span>{item.color.toUpperCase()}</span>
                  <strong>{item.count}</strong>
                </div>
              ))}
              <button type="button" className="detail-bead-more" onClick={() => setShowFullBeadList(true)}>查看全部颜色</button>
            </div>
          ) : <p className="community-empty">该稿件没有可统计的豆子。</p>}
        </section>

        <section className="detail-comments-card" aria-label="部分评论">
          <div className="detail-section-title"><h2>评论</h2><span>({comments.length})</span></div>
          <div className="detail-comment-list">
            {isLoadingComments ? <p className="community-empty">评论加载中…</p> : null}
            {!isLoadingComments && comments.length === 0 ? <p className="community-empty">还没有评论，来留下第一条吧。</p> : null}
            {comments.map((comment) => (
              <article className="detail-comment" key={comment.id}>
                <span className="detail-comment-avatar">{comment.author[0]}</span>
                <div>
                  <div className="detail-comment-head"><strong>{comment.author}</strong></div>
                  <p>{comment.content}</p>
                  <small>{new Date(comment.createdAt).toLocaleString('zh-CN')}</small>
                </div>
              </article>
            ))}
          </div>
          <div className="detail-comment-compose">
            <input value={commentDraft} onChange={(event) => setCommentDraft(limitCommentContent(event.target.value))} onFocus={() => { if (!isLoggedIn) onLogin(); }} placeholder={isLoggedIn ? '写下你的评论…' : '登录后参与评论'} aria-label="评论内容" />
            <button type="button" onClick={submitComment} disabled={!commentDraft.trim()}>发布</button>
          </div>
        </section>
      </div>

      <div className="detail-bottom-actions">
        <div className="detail-bottom-actions-inner">
          <button className={pattern.likedByMe ? 'detail-like-action active' : 'detail-like-action'} type="button" onClick={onLike}><Heart aria-hidden="true" /> {formatPatternCount(pattern.likes)}</button>
          <button className="detail-download-action" type="button"><Download aria-hidden="true" /> 下载图纸</button>
        </div>
      </div>
      {showFullBeadList ? <BeadListDrawer colors={drawerColors} totalBeads={totalBeads} description="按作品实时统计颜色和数量" onClose={() => setShowFullBeadList(false)} /> : null}
    </main>
  );
}

function CupcakeArt() {
  return <div className="cupcake-art"><span className="cupcake-cherry" /><span className="cupcake-top" /><span className="cupcake-cream" /><span className="cupcake-band" /><span className="cupcake-cup" /></div>;
}

function formatPatternCount(value: string) {
  const normalized = value.trim().toLowerCase().replace(/,/g, '');
  const suffixMultiplier = normalized.endsWith('k') ? 1000 : normalized.endsWith('m') ? 1000000 : 1;
  const numericPart = suffixMultiplier === 1 ? normalized : normalized.slice(0, -1);
  const numericValue = Number(numericPart) * suffixMultiplier;
  return Number.isFinite(numericValue) && numericValue >= 100 ? '99+' : value;
}

export function limitCommentContent(value: string, maxLength = 300) {
  return [...value].slice(0, maxLength).join('');
}
