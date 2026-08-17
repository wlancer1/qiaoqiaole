import { ArrowLeft, Copy, FolderPlus, Grid2X2, Heart, Ruler, Search, Share2 } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Icon } from '../shared/h5Icons';
import { BeadListDrawer, type BeadColorItem } from '../flow/H5FlowComponents';
import { colorCodeOf } from '../utils/h5AppUtils';
import type { CommunityComment, CommunityNotification } from '../community/communityData';
import type { FollowingUser, PatternListCard, RecentProject } from '../shared/h5Types';
import { ImageWithSkeleton } from '../shared/ImageWithSkeleton';
import { UserAvatar } from '../shared/UserAvatar';
import { CommentAvatar } from './CommentAvatar';
import { CommunityPatternCard } from '../community/CommunityPatternCard';
import type { ProjectFolder } from '../projects/projectFolders';
import { CompositionSafeInput } from '../shared/CompositionSafeInput';
import { PageLoadBoundary } from '../loading/H5LoadingStates';

function LoadMoreSentinel({ hasMore, loadingMore, onLoadMore }: { hasMore: boolean; loadingMore: boolean; onLoadMore?: () => void }) {
  const sentinelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || loadingMore || !onLoadMore || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
    }, { rootMargin: '0px 0px 240px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

  if (!hasMore) return null;
  return <button ref={sentinelRef} className="community-load-more" type="button" onClick={onLoadMore} disabled={loadingMore}>{loadingMore ? '加载中…' : '加载更多作品'}</button>;
}

export function AuthorProfilePage({ patterns, authorPattern, authorProfile, loading = false, error = '', currentUserId = '', onBack, onOpen, onFollow, onRetry, hasMore = false, loadingMore = false, onLoadMore }: { patterns: PatternListCard[]; authorPattern?: PatternListCard; authorProfile?: { id: string; name: string; avatarUrl?: string | null; postsCount: number; likesCount: number; followersCount: number; isFollowing: boolean }; loading?: boolean; error?: string; currentUserId?: string; onBack: () => void; onOpen: (pattern: PatternListCard) => void; onFollow?: () => void; onRetry?: () => void; hasMore?: boolean; loadingMore?: boolean; onLoadMore?: () => void }) {
  const authorName = authorProfile?.name || authorPattern?.author || '作者';
  const authorAvatar = authorProfile?.avatarUrl ?? authorPattern?.authorAvatar;
  const isSelf = Boolean(authorProfile?.id && authorProfile.id === currentUserId);
  const isFollowing = authorProfile?.isFollowing ?? Boolean(authorPattern?.isFollowing);

  return (
    <main className="author-profile-page my-works-page public-author-profile-page" aria-label="作者主页">
      <header className="author-profile-header">
        <button type="button" aria-label="返回上一页" onClick={onBack}><ArrowLeft aria-hidden="true" /></button>
        <h1>作者主页</h1>
        <span aria-hidden="true" />
      </header>
      <section className="author-profile-summary" aria-label="作者资料">
        <UserAvatar className="author-profile-avatar" avatarUrl={authorAvatar} />
        <div className="author-profile-copy">
          <div className="author-profile-name"><h2>{authorName}</h2><em>创作者</em></div>
          <p>分享拼豆作品</p>
        </div>
        {!isSelf && authorProfile?.id ? <button className={`author-follow-btn${isFollowing ? ' is-following' : ''}`} type="button" aria-pressed={isFollowing} onClick={onFollow}>{isFollowing ? '已关注' : '关注'}</button> : null}
      </section>
      <section className="author-profile-stats" aria-label="作者统计">
        <div><strong>{authorProfile?.postsCount ?? patterns.length}</strong><span>作品</span></div>
        <div><strong>{authorProfile?.likesCount ?? 0}</strong><span>获赞</span></div>
        <div><strong>{authorProfile?.followersCount ?? 0}</strong><span>粉丝</span></div>
        <div><strong>—</strong><span>浏览</span></div>
      </section>
      <nav className="author-profile-tabs" aria-label="作者内容分类">
        <button className="active" type="button">作品</button>
      </nav>
      {loading ? <section className="author-work-empty" aria-label="作者主页加载中"><strong>正在加载作者主页...</strong></section> : error ? <section className="author-work-empty" aria-label="作者主页加载失败"><strong>{error}</strong><button type="button" onClick={onRetry}>重新加载</button></section> : patterns.length > 0 ? <section className="author-work-grid" aria-label="作者已分享作品">
        {patterns.map((card) => (
          <button className="author-work-card" key={card.id} type="button" onClick={() => onOpen(card)}>
            <div className={`author-work-art ${card.tone}`} aria-hidden="true">
              <ImageWithSkeleton src={card.image} alt="" fallback={<div className="pattern-art-grid">{card.beads.map((color, beadIndex) => <i key={`${card.id}-${beadIndex}`} style={{ backgroundColor: color }} />)}</div>} />
            </div>
            <strong>{card.title}</strong>
          </button>
        ))}
      </section> : <section className="author-work-empty" aria-label="暂无已分享作品"><strong>还没有分享作品</strong><span>作者分享作品后会显示在这里</span></section>}
      {!loading && !error ? <LoadMoreSentinel hasMore={hasMore} loadingMore={loadingMore} onLoadMore={onLoadMore} /> : null}
    </main>
  );
}

export function MyWorksPage({
  projects,
  likedProjects = [],
  likedLoading = false,
  receivedLikesCount = 0,
  onOpenLiked,
  onBack,
  onOpen,
  actionSheet,
  folders = [],
  activeFolderId = 'all',
  onFolderChange,
  onCreateFolder,
  onDeleteFolder,
  hasMore = false,
  loading = false,
  loadingMore = false,
  onLoadMore,
  page = 1,
  total = projects.length,
  onLoadPrevious,
}: {
  projects: RecentProject[];
  likedProjects?: RecentProject[];
  likedLoading?: boolean;
  receivedLikesCount?: number;
  onOpenLiked?: (project: RecentProject) => void;
  onBack: () => void;
  onOpen: (project: RecentProject) => void;
  actionSheet?: ReactNode;
  folders?: ProjectFolder[];
  activeFolderId?: string | null | 'all';
  onFolderChange?: (folderId: string | null | 'all') => void;
  onCreateFolder?: () => void;
  onDeleteFolder?: (folder: ProjectFolder) => void;
  hasMore?: boolean;
  loading?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  page?: number;
  total?: number;
  onLoadPrevious?: () => void;
}) {
  const visibleProjects = activeFolderId === 'all'
    ? projects
    : projects.filter((project) => (activeFolderId === null ? !project.folderId : project.folderId === activeFolderId));
  const [activeContentTab, setActiveContentTab] = useState<'works' | 'likes'>('works');
  const displayedProjects = activeContentTab === 'likes' ? likedProjects : visibleProjects;
  const [folderMenuTarget, setFolderMenuTarget] = useState<ProjectFolder | null>(null);
  const folderLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressFolderClickRef = useRef(false);
  const clearFolderLongPress = () => {
    if (folderLongPressTimerRef.current === null) return;
    clearTimeout(folderLongPressTimerRef.current);
    folderLongPressTimerRef.current = null;
  };
  const openFolderMenu = (folder: ProjectFolder) => setFolderMenuTarget(folder);
  const handleFolderKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, folder: ProjectFolder) => {
    if (!onDeleteFolder || !['Enter', ' ', 'ContextMenu'].includes(event.key) && !(event.shiftKey && event.key === 'F10')) return;
    event.preventDefault();
    openFolderMenu(folder);
  };

  useEffect(() => () => clearFolderLongPress(), []);

  return (
    <PageLoadBoundary loading={loading} loadingLabel="正在加载作品" loadingDescription="正在读取你的作品和文件夹">
    <main className="author-profile-page my-works-page" aria-label="我的作品">
      <header className="author-profile-header">
        <button type="button" aria-label="返回首页" onClick={onBack}><ArrowLeft aria-hidden="true" /></button>
        <h1>我的作品</h1>
        <span aria-hidden="true" />
      </header>
      <section className="author-profile-summary" aria-label="个人资料">
        <UserAvatar className="author-profile-avatar" />
        <div className="author-profile-copy">
          <div className="author-profile-name"><h2>我的创作</h2><em>作品</em></div>
          <p>保存的拼豆图纸都会显示在这里</p>
        </div>
        <span className="my-works-count">{total} 件</span>
      </section>
      <section className="author-profile-stats my-works-stats" aria-label="作品统计">
        <div><strong>{total}</strong><span>作品</span></div>
        <div><strong>{receivedLikesCount}</strong><span>获赞</span></div>
        <div><strong>0</strong><span>浏览</span></div>
      </section>
      <nav className="author-profile-tabs" aria-label="作品分类">
        <button className={activeContentTab === 'works' ? 'active' : ''} type="button" onClick={() => setActiveContentTab('works')}>作品</button>
        <button className={activeContentTab === 'likes' ? 'active' : ''} type="button" onClick={() => setActiveContentTab('likes')}>喜欢</button>
      </nav>
      {activeContentTab === 'works' ? <section className="my-works-folder-filter" aria-label="作品文件夹">
        <div className="my-works-folder-header">
          <div className="my-works-folder-title"><strong>文件夹</strong><span>{folders.length}</span></div>
          {onCreateFolder ? <button type="button" className="my-works-create-folder" onClick={() => { setFolderMenuTarget(null); onCreateFolder(); }}><FolderPlus aria-hidden="true" />新建</button> : null}
        </div>
        <div className="my-works-folder-scroll">
          <button type="button" className={activeFolderId === 'all' ? 'active' : ''} onClick={() => { setFolderMenuTarget(null); onFolderChange?.('all'); }}>全部 <span>{total}</span></button>
          {folders.map((folder) => <button key={folder.id} type="button" className={activeFolderId === folder.id ? 'active' : ''} aria-label={onDeleteFolder ? `打开文件夹 ${folder.name} 操作` : undefined} aria-haspopup={onDeleteFolder ? 'menu' : undefined} aria-expanded={onDeleteFolder ? folderMenuTarget?.id === folder.id : undefined} onClick={() => { if (suppressFolderClickRef.current) { suppressFolderClickRef.current = false; return; } onFolderChange?.(folder.id); setFolderMenuTarget(null); }} onKeyDown={onDeleteFolder ? (event) => handleFolderKeyDown(event, folder) : undefined} onContextMenu={onDeleteFolder ? (event) => { event.preventDefault(); openFolderMenu(folder); } : undefined} onPointerDown={onDeleteFolder ? (event) => { if (event.pointerType === 'touch') { suppressFolderClickRef.current = false; folderLongPressTimerRef.current = setTimeout(() => { suppressFolderClickRef.current = true; openFolderMenu(folder); folderLongPressTimerRef.current = null; }, 500); } } : undefined} onPointerUp={clearFolderLongPress} onPointerCancel={clearFolderLongPress} onPointerLeave={clearFolderLongPress}>{folder.name} <span>{folder.projectCount ?? 0}</span></button>)}
        </div>
        {folderMenuTarget && onDeleteFolder ? <div className="my-works-folder-menu" role="menu" aria-label={`${folderMenuTarget.name} 文件夹操作`}><button type="button" role="menuitem" aria-label={`删除文件夹 ${folderMenuTarget.name}`} onClick={() => { onDeleteFolder(folderMenuTarget); setFolderMenuTarget(null); }}>删除文件夹</button><button type="button" role="menuitem" onClick={() => setFolderMenuTarget(null)}>取消</button></div> : null}
      </section> : null}
      {activeContentTab === 'likes' && likedLoading ? <section className="author-work-empty" aria-label="喜欢的作品加载中"><strong>正在加载喜欢的作品...</strong></section> : activeContentTab === 'works' && visibleProjects.length > 0 || activeContentTab === 'likes' && displayedProjects.length > 0 ? (
        <section className="author-work-grid" aria-label="我的作品列表">
          {displayedProjects.map((project, projectIndex) => (
            <article
              className="author-work-card my-work-card"
              key={project.id}
              data-project-card-id={project.id}
              role="button"
              tabIndex={0}
              onClick={() => activeContentTab === 'likes' && onOpenLiked ? onOpenLiked(project) : onOpen(project)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  if (activeContentTab === 'likes' && onOpenLiked) onOpenLiked(project);
                  else onOpen(project);
                }
              }}
            >
              {(project.thumbnailImage || project.sourceImage) ? (
                <ImageWithSkeleton
                  className="author-work-art"
                  imageClassName="my-work-thumb-image"
                  src={project.thumbnailImage || project.sourceImage}
                  alt=""
                  loading={projectIndex < 6 ? 'eager' : 'lazy'}
                  loadTimeoutMs={projectIndex < 6 ? 10_000 : 0}
                  fallback={<div className="my-work-thumb-placeholder" aria-hidden="true" />}
                />
              ) : (
                <div className="author-work-art my-work-thumb-placeholder" aria-hidden="true" />
              )}
              <strong>{project.name.startsWith('wx') ? '未命名作品' : project.name}</strong>
              <small>{project.cols}×{project.rows}</small>
            </article>
          ))}
        </section>
      ) : (
        <section className="author-work-empty" aria-label="暂无作品">
          <strong>{activeContentTab === 'likes' ? '还没有喜欢的作品' : projects.length ? '这个文件夹里还没有作品' : '还没有保存的作品'}</strong>
          <span>{activeContentTab === 'likes' ? '去发现页看看喜欢的作品吧' : projects.length ? '把作品移动到这里后会显示在这里' : '完成创作并保存后，作品会显示在这里'}</span>
        </section>
      )}
      {activeContentTab === 'works' && (hasMore || loadingMore || page > 1) ? <div className="project-page-controls" aria-label="作品分页">
        <button type="button" onClick={onLoadPrevious} disabled={page <= 1 || loadingMore}>上一页作品</button>
        <button type="button" onClick={onLoadMore} disabled={loadingMore || !hasMore}>{loadingMore ? '加载中…' : '下一页作品'}</button>
      </div> : null}
      {actionSheet}
    </main>
    </PageLoadBoundary>
  );
}

type FollowListPageProps = { users: FollowingUser[]; loading: boolean; error: string; onBack: () => void; onRetry: () => void; onOpenUser?: (user: FollowingUser) => void; mode?: 'following' | 'followers' };

export function FollowingPage({ users, loading, error, onBack, onRetry, onOpenUser, mode = 'following' }: FollowListPageProps) {
  const isFollowers = mode === 'followers';
  const title = isFollowers ? '粉丝列表' : '关注列表';
  return (
    <main className="author-profile-page following-list-page" aria-label={title}>
      <header className="author-profile-header">
        <button type="button" aria-label="返回我的页面" onClick={onBack}><ArrowLeft aria-hidden="true" /></button>
        <h1>{title}</h1>
        <span aria-hidden="true" />
      </header>
      <section className="following-list-summary" aria-label="关注说明">
        <strong>{isFollowers ? '关注我的人' : '我关注的人'}</strong>
        <span>{isFollowers ? '关注你的人会出现在这里，点击头像查看主页' : '关注喜欢的创作者，随时查看他们的作品'}</span>
      </section>
      {loading ? <p className="following-list-state" role="status">正在读取关注列表...</p> : error ? (
        <div className="following-list-state"><strong>{error}</strong><button type="button" onClick={onRetry}>重新加载</button></div>
      ) : users.length > 0 ? (
        <section className="following-user-list" aria-label={isFollowers ? '粉丝用户' : '已关注用户'}>
          {users.map((user) => <button className="following-user-row" key={user.id} type="button" aria-label={`查看${user.name}的主页`} onClick={() => onOpenUser?.(user)}>
            <UserAvatar className="following-user-avatar" avatarUrl={user.avatarUrl} />
            <strong>{user.name}</strong>
            <span className="following-user-status" aria-hidden="true">{isFollowers ? '粉丝' : '已关注'}</span>
          </button>)}
        </section>
      ) : <div className="following-list-state"><strong>{isFollowers ? '还没有粉丝' : '还没有关注任何人'}</strong><span>{isFollowers ? '有人关注你后会显示在这里' : '去发现页看看喜欢的创作者吧'}</span></div>}
    </main>
  );
}

export function FollowersPage(props: Omit<FollowListPageProps, 'mode'>) {
  return <FollowingPage {...props} mode="followers" />;
}

export function PatternDiscoverPage({ patterns, activeSort = 'hot', query = '', selectedTags = [], availableTags = [], onSortChange, onQueryChange, onTagsChange, onOpen, onOpenAuthor, hasMore = false, loadingMore = false, onLoadMore }: {
  patterns: PatternListCard[];
  activeSort?: 'hot' | 'latest';
  query?: string;
  selectedTags?: string[];
  availableTags?: string[];
  onSortChange?: (sort: 'hot' | 'latest') => void;
  onQueryChange?: (query: string) => void;
  onTagsChange?: (tags: string[]) => void;
  onOpen: (pattern: PatternListCard) => void;
  onOpenAuthor: (pattern: PatternListCard) => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
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
            <CompositionSafeInput type="search" value={query} onValueChange={(nextValue) => onQueryChange?.(nextValue)} placeholder="搜索图纸、作者、标签" aria-label="搜索图纸、作者、标签" />
          </label>
          <div className="pattern-tag-filter" aria-label="标签筛选">
            <button type="button" className={selectedTags.length === 0 ? 'active' : ''} onClick={() => onTagsChange?.([])}>全部</button>
            {availableTags.map((tag) => <button type="button" key={tag} className={selectedTags.includes(tag) ? 'active' : ''} onClick={() => onTagsChange?.(selectedTags.includes(tag) ? selectedTags.filter((item) => item !== tag) : [...selectedTags, tag])}>{tag}</button>)}
          </div>

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
                <CommunityPatternCard
                  key={card.title}
                  pattern={card}
                  dataCardIndex={patterns.indexOf(card)}
                  onOpen={onOpen}
                  onOpenAuthor={onOpenAuthor}
                />
              ))}
            </div>
          ))}
        </section>
        <LoadMoreSentinel hasMore={hasMore} loadingMore={loadingMore} onLoadMore={onLoadMore} />
      </div>
    </section>
  );
}

export function PatternMessagesPage({ isLoggedIn, notifications = [], onLogin, onOpenNotification }: {
  isLoggedIn: boolean;
  notifications?: CommunityNotification[];
  onLogin: () => void;
  onOpenNotification?: (notification: CommunityNotification) => void;
}) {
  const unreadCount = notifications.filter((item) => !item.isRead).length;
  const hasMessages = isLoggedIn && notifications.length > 0;

  return (
    <main className={hasMessages ? 'pattern-message-page' : 'pattern-message-page is-empty'} aria-label="消息">
      {hasMessages ? (
        <section className="pattern-message-list" aria-label="消息列表">
          <header><h1>消息</h1><span aria-label={unreadCount > 0 ? `${unreadCount} 条未读` : '全部已读'}>{unreadCount > 0 ? `${unreadCount} 条未读` : '全部已读'}</span></header>
          {notifications.map((notification) => (
            <button
              className={notification.isRead ? 'pattern-message-item is-read' : 'pattern-message-item'}
              key={notification.id}
              type="button"
              onClick={() => onOpenNotification?.(notification)}
            >
              <UserAvatar className="pattern-message-item-icon" avatarUrl={notification.senderAvatar} />
              <span className="pattern-message-item-copy">
                <strong>{notification.senderName}</strong>
                <span>{notification.content}</span>
              </span>
              <time dateTime={notification.createdAt}>{formatMessageTime(notification.createdAt)}</time>
              {!notification.isRead ? <i aria-label="未读">{unreadCount > 9 ? '9+' : '1'}</i> : null}
            </button>
          ))}
        </section>
      ) : (
        <div className="pattern-message-card">
          <div className="pattern-message-illustration" aria-hidden="true">
            <span className="pattern-message-spark spark-one" />
            <span className="pattern-message-spark spark-two" />
            <span className="pattern-message-spark spark-three" />
            <Icon name="message" />
          </div>
          <strong>{isLoggedIn ? '暂无消息' : '登录后查看消息'}</strong>
          <p>评论、关注和下载通知会显示在这里。</p>
          {!isLoggedIn ? <button type="button" onClick={onLogin}>去登录</button> : null}
        </div>
      )}
    </main>
  );
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
}

export function PatternDetailPage({ pattern, currentUserId = '', onBack, onOpenAuthor, isLoggedIn, comments, isLoadingComments, onLoadComments, onLike, onFollow, onShare, onCopyToRepository, copyingToRepository = false, onComment, onReply, onDeleteComment, commentSubmitting = false, commentReplyPendingId = '', commentDeletePendingId = '', onLogin }: {
  pattern: PatternListCard;
  currentUserId?: string;
  onBack: () => void;
  onOpenAuthor?: () => void;
  isLoggedIn: boolean;
  comments: CommunityComment[];
  isLoadingComments: boolean;
  onLoadComments: () => void;
  onLike: () => void;
  onFollow?: () => void;
  onShare?: () => void;
  onCopyToRepository?: () => void;
  copyingToRepository?: boolean;
  onComment: (content: string) => void;
  onReply?: (commentId: string, content: string) => void;
  onDeleteComment?: (commentId: string) => void;
  commentSubmitting?: boolean;
  commentReplyPendingId?: string;
  commentDeletePendingId?: string;
  onLogin: () => void;
}) {
  const [commentDraft, setCommentDraft] = useState('');
  const [replyTarget, setReplyTarget] = useState<CommunityComment | null>(null);
  const [expandedReplyCommentIds, setExpandedReplyCommentIds] = useState<Set<string>>(() => new Set());
  const [showFullBeadList, setShowFullBeadList] = useState(false);
  useEffect(() => { onLoadComments(); }, [pattern.id]);
  useEffect(() => {
    if (typeof window === 'undefined' || window.location.hash !== '#comments') return undefined;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('comments')?.scrollIntoView({ block: 'start', behavior: 'auto' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pattern.id]);

  const submitComment = () => {
    if (!isLoggedIn) return onLogin();
    const content = limitCommentContent(commentDraft.trim());
    if (!content) return;
    if (replyTarget && onReply) onReply(replyTarget.id, content);
    else onComment(content);
    setCommentDraft('');
    setReplyTarget(null);
  };

  const beadItems = pattern.beadList ?? [];
  const totalBeads = beadItems.reduce((total, item) => total + item.count, 0);
  const drawerColors: BeadColorItem[] = beadItems.map((item) => ({ color: item.color, code: colorCodeOf(item.color), count: item.count }));

  return (
    <main className="pattern-detail-page" aria-label="图纸详情页">
      <div className="pattern-detail-content">
        <div className="pattern-detail-header-shell">
          <header className="pattern-detail-header">
            <button className="pattern-detail-back" type="button" aria-label="返回发现" onClick={onBack}><Icon name="arrow-left" /></button>
            <div className="pattern-detail-author">
              <UserAvatar className="detail-author-avatar" avatarUrl={pattern.authorAvatar} role="button" tabIndex={0} aria-label={`查看${pattern.author}的作者主页`} onClick={onOpenAuthor} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenAuthor?.(); } }} />
              <div>
                <div className="pattern-detail-author-name">
                  <strong>{pattern.author}</strong>
                </div>
                <small>社区分享者</small>
              </div>
            </div>
            {pattern.authorId && pattern.authorId !== currentUserId ? <button className={`detail-follow-btn${pattern.isFollowing ? ' is-following' : ''}`} type="button" aria-pressed={Boolean(pattern.isFollowing)} onClick={onFollow}>{pattern.isFollowing ? '已关注' : '关注'}</button> : null}
            <button className="detail-share-btn" type="button" aria-label="分享" onClick={onShare}><Share2 aria-hidden="true" /></button>
          </header>
        </div>

        <section className="detail-main-card" aria-label="图纸主信息">
          <div className="detail-hero-art" aria-label={`${pattern.title}预览`}>
            <ImageWithSkeleton src={pattern.detailImage || pattern.image} alt="" fallback={<div className="detail-art-empty">暂无预览图</div>} />
          </div>
        </section>

        <section className="detail-info-card" aria-label="图纸信息">
          <h1>{pattern.title}</h1>
          <div className="detail-title-meta">
            <span>发布日期 {pattern.meta}</span>
            <span>浏览次数 未统计</span>
          </div>
          {pattern.tags?.length ? <div className="detail-pattern-tags" aria-label="作品标签">{pattern.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div> : null}
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
                  <span>{colorCodeOf(item.color)}</span>
                  <strong>{item.count}</strong>
                </div>
              ))}
              <button type="button" className="detail-bead-more" onClick={() => setShowFullBeadList(true)}>查看全部颜色</button>
            </div>
          ) : <p className="community-empty">该稿件没有可统计的豆子。</p>}
        </section>

        <section id="comments" className="detail-comments-card" aria-label="部分评论">
          <div className="detail-section-title"><h2>评论</h2><span>({pattern.commentsCount})</span></div>
          <div className="detail-comment-list">
            {isLoadingComments ? <p className="community-empty">评论加载中…</p> : null}
            {!isLoadingComments && comments.length === 0 ? <p className="community-empty">还没有评论，来留下第一条吧。</p> : null}
            {comments.map((comment) => {
              const replies = comment.replies ?? [];
              const isRepliesExpanded = expandedReplyCommentIds.has(comment.id);
              const visibleReplies = isRepliesExpanded ? replies : replies.slice(0, 2);
              const hiddenReplyCount = replies.length - visibleReplies.length;
              const renderComment = (item: CommunityComment, isReply = false) => (
                <article className={isReply ? 'detail-comment detail-comment-reply' : 'detail-comment'} key={item.id}>
                  <CommentAvatar avatarUrl={item.authorAvatar} />
                  <div>
                    <div className="detail-comment-head"><strong>{item.author}</strong>{item.replyToUserName ? <span> 回复 @{item.replyToUserName}</span> : null}</div>
                    <p>{item.content}</p>
                    <div className="detail-comment-actions">
                      <small>{new Date(item.createdAt).toLocaleString('zh-CN')}</small>
                      {onReply ? <button className="detail-comment-reply-action" type="button" disabled={Boolean(commentReplyPendingId) || commentSubmitting} onClick={() => { if (!isLoggedIn) return onLogin(); setReplyTarget(item); }}>{commentReplyPendingId === item.id ? '回复中…' : '回复'}</button> : null}
                      {isLoggedIn && Boolean(item.authorId) && item.authorId === currentUserId && onDeleteComment ? <button className="detail-comment-delete-action" type="button" aria-label={`删除评论：${item.author}`} disabled={commentDeletePendingId === item.id} onClick={() => onDeleteComment(item.id)}>{commentDeletePendingId === item.id ? '删除中…' : '删除'}</button> : null}
                    </div>
                  </div>
                </article>
              );
              return <div className="detail-comment-thread" key={comment.id}>
                {renderComment(comment)}
                {visibleReplies.map((reply) => renderComment(reply, true))}
                {replies.length > 2 ? (
                  <button
                    className="detail-comment-toggle-replies"
                    type="button"
                    aria-expanded={isRepliesExpanded}
                    onClick={() => setExpandedReplyCommentIds((expandedIds) => {
                      const next = new Set(expandedIds);
                      if (next.has(comment.id)) next.delete(comment.id);
                      else next.add(comment.id);
                      return next;
                    })}
                  >
                    {isRepliesExpanded ? '收起回复' : `展开 ${hiddenReplyCount} 条回复`}
                  </button>
                ) : null}
              </div>;
            })}
          </div>
          <div className="detail-comment-compose">
            <CompositionSafeInput value={commentDraft} onValueChange={(nextValue) => setCommentDraft(limitCommentContent(nextValue))} onFocus={() => { if (!isLoggedIn) onLogin(); }} placeholder={replyTarget ? `回复 @${replyTarget.author}…` : isLoggedIn ? '写下你的评论…' : '登录后参与评论'} aria-label="评论内容" />
            <button type="button" onClick={submitComment} disabled={!commentDraft.trim() || commentSubmitting || Boolean(commentReplyPendingId)}>{commentSubmitting ? '发布中…' : '发布'}</button>
          </div>
          {replyTarget ? <button className="detail-comment-cancel-reply" type="button" onClick={() => setReplyTarget(null)}>取消回复</button> : null}
        </section>
      </div>

      <div className="detail-bottom-actions">
        <div className="detail-bottom-actions-inner">
          <button className={pattern.likedByMe ? 'detail-like-action active' : 'detail-like-action'} type="button" aria-label={pattern.likedByMe ? '取消点赞' : '点赞'} aria-pressed={Boolean(pattern.likedByMe)} onClick={onLike}><Heart className={pattern.likedByMe ? 'is-liked' : ''} aria-hidden="true" />  {formatPatternCount(pattern.likes)}</button>
          <button className="detail-download-action" type="button" disabled={copyingToRepository} onClick={onCopyToRepository}><Copy aria-hidden="true" /> {copyingToRepository ? '复制中…' : '复制到仓库'}</button>
        </div>
      </div>
      {showFullBeadList ? <BeadListDrawer colors={drawerColors} totalBeads={totalBeads} description="按作品实时统计颜色和数量" onClose={() => setShowFullBeadList(false)} /> : null}
    </main>
  );
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
