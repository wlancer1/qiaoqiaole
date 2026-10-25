import { useEffect, useState } from 'react'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { wxLogin, getStoredAuth, type AuthUser } from '../../platform/auth'
import { listBeadingProjects } from '../../platform/beadingStore'
import { listPwProjects } from '../../platform/patchworkStore'
import { request } from '../../platform/request'
import { API_BASE } from '../../config'
import creationCategories from '../../assets/creation-categories.webp'
import { BottomNav, CreationMenu, KindBadge } from '../../components/Ui'
import { CreateProjectEntry, type CreateKind } from '../../components/CreateProjectFlow'
import './index.scss'

type RecentItem = {
  id: string
  kind: 'beading' | 'patchwork'
  name: string
  size: string
  updatedAt: number
  url: string
}

type CommunityPost = {
  id: string
  kind: 'beading' | 'patchwork'
  name: string
  thumbnailImage?: string
  sourceImage?: string
}

function absUrl(path: string): string {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  const origin = API_BASE.replace(/\/api$/, '')
  return path.startsWith('/') ? `${origin}${path}` : `${origin}/${path}`
}

export default function Home() {
  const [creating,setCreating]=useState(false)
  const [creationKind, setCreationKind] = useState<CreateKind | null>(null)
  const openCreation = (kind: CreateKind) => { setCreating(false); setCreationKind(kind) }
  const [user, setUser] = useState<AuthUser | null>(() => getStoredAuth()?.user || null)
  const [recent, setRecent] = useState<RecentItem[]>([])
  const [hotPosts, setHotPosts] = useState<CommunityPost[]>([])

  const refreshRecent = () => {
    const beads = listBeadingProjects().map((m) => ({
      id: m.id, kind: 'beading' as const, name: m.title, size: `${m.cols}×${m.rows}`, updatedAt: m.updatedAt,
      url: `/pages/beading/index?id=${m.id}`,
    }))
    const fabrics = listPwProjects().map((m) => ({
      id: m.id, kind: 'patchwork' as const, name: m.name, size: `${m.widthMm / 10}×${m.heightMm / 10}cm`, updatedAt: m.updatedAt,
      url: `/pages/patchwork/index?id=${m.id}`,
    }))
    setRecent([...beads, ...fabrics].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4))
  }

  useDidShow(() => {
    setUser(getStoredAuth()?.user || null)
    refreshRecent()
  })

  useEffect(() => {
    request<{ posts: CommunityPost[] }>('/community/posts?sort=hot&page=1&pageSize=6')
      .then((data) => setHotPosts(data.posts || []))
      .catch(() => setHotPosts([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onLogin = async () => {
    try {
      const auth = await wxLogin()
      setUser(auth.user)
      Taro.showToast({ title: `欢迎，${auth.user.nickname}`, icon: 'none' })
    } catch (e) {
      Taro.showToast({ title: e instanceof Error ? e.message : '登录失败', icon: 'none' })
    }
  }

  const onProfile = () => Taro.redirectTo({url:'/pages/profile/index'})

  return (
    <View className='home-shell'>
      <ScrollView scrollY={!creating && !creationKind} className='home-scroll'>
        <View className='home-content'>
          <View className='home-hero'>
            <View className='home-brand'>
              <Text className='home-brand-title'>超级拼</Text>
              <Text className='home-brand-sub'>让创作更简单</Text>
            </View>
            <View className='home-user' onClick={onProfile}>
              <Text className='home-user-text'>{user ? user.nickname : '登录'}</Text>
            </View>
          </View>

          <View className='home-entries'>
            <View className='home-entry home-entry-bead' onClick={() => openCreation('beading')}>
              <Image className='home-entry-img home-entry-img-left' src={creationCategories} mode='scaleToFill' />
              <View className='home-entry-copy'>
                <Text className='home-entry-title'>拼豆</Text>
                <Text className='home-entry-desc'>图片转图纸</Text>
              </View>
              <View className='home-entry-status'><Text>MARD 221 色</Text></View>
            </View>
            <View className='home-entry home-entry-fabric' onClick={() => openCreation('patchwork')}>
              <Image className='home-entry-img home-entry-img-right' src={creationCategories} mode='scaleToFill' />
              <View className='home-entry-copy'>
                <Text className='home-entry-title'>拼布</Text>
                <Text className='home-entry-desc'>手绘布片拼接</Text>
              </View>
              <View className='home-entry-status'><Text>自由拼接</Text></View>
            </View>
          </View>

          <View className='home-section'>
            <View className='home-section-head'>
              <Text className='home-section-title'>最近项目</Text>
              {user && recent.length > 0 && (
                <Text className='home-section-more' onClick={() => Taro.navigateTo({ url: '/pages/works/index' })}>查看全部 ›</Text>
              )}
            </View>
            {!user ? (
              <View className='home-empty'>
                <View className='home-empty-art'><View className='ic-folder'><View className='ic-folder-tab' /><View className='ic-folder-body' /></View></View>
                <View className='home-empty-copy'>
                  <Text className='home-empty-title'>登录后查看最近项目</Text>
                  <Text className='home-empty-desc'>登录后管理你的创作记录</Text>
                </View>
                <Text className='home-empty-btn' onClick={onLogin}>立即登录</Text>
              </View>
            ) : recent.length === 0 ? (
              <View className='home-empty'>
                <View className='home-empty-art'><View className='ic-folder'><View className='ic-folder-tab' /><View className='ic-folder-body' /></View></View>
                <View className='home-empty-copy'>
                  <Text className='home-empty-title'>还没有最近项目</Text>
                  <Text className='home-empty-desc'>开始创作后，项目会显示在这里</Text>
                </View>
              </View>
            ) : (
              <ScrollView scrollX className='home-recent-row'>
                <View className='home-recent-inner'>
                  {recent.map((item) => (
                    <View key={item.kind+item.id} className='home-recent-card' onClick={() => Taro.navigateTo({ url: item.url })}>
                      <View className={`home-recent-thumb ${item.kind === 'patchwork' ? 'thumb-fabric' : 'thumb-bead'}`}>
                        <Text className='home-recent-badge'>{item.kind === 'patchwork' ? '拼布' : '拼豆'}</Text>
                      </View>
                      <Text className='home-recent-name'>{item.name}</Text>
                      <Text className='home-recent-meta'>{item.size}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>

          {hotPosts.length > 0 && (
            <View className='home-section'>
              <View className='home-section-head'>
                <Text className='home-section-title'>热门图纸</Text>
                <Text className='home-section-more' onClick={() => Taro.navigateTo({ url: '/pages/community/index' })}>更多 ›</Text>
              </View>
              <View className='home-hot-row'>
                <View className='home-hot-grid'>
                  {hotPosts.map((post) => {
                    const img = absUrl(post.thumbnailImage || post.sourceImage || '')
                    return (
                      <View key={post.id} className='home-recent-card' onClick={() => Taro.navigateTo({ url: '/pages/community/index' })}>
                        <KindBadge kind={post.kind}/>
                        {img
                          ? <Image className='home-recent-thumb-img' src={img} mode='aspectFill' />
                          : <View className={`home-recent-thumb ${post.kind === 'patchwork' ? 'thumb-fabric' : 'thumb-bead'}`}>
                            <Text className='home-recent-badge'>{post.kind === 'patchwork' ? '拼布' : '拼豆'}</Text>
                          </View>}
                        <Text className='home-recent-name'>{post.name}</Text>
                        <Text className='home-recent-meta'>{post.kind === 'patchwork' ? '拼布' : '拼豆'}</Text>
                      </View>
                    )
                  })}
                </View>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      <BottomNav active='index' onCreate={()=>setCreating(true)}/>
      {creating && <CreationMenu onClose={() => setCreating(false)} onBead={() => openCreation('beading')} onFabric={() => openCreation('patchwork')} />}
      {creationKind && <CreateProjectEntry key={creationKind} kind={creationKind} onClose={() => setCreationKind(null)} />}
    </View>
  )
}
