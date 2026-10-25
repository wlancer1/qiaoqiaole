import { Button,Input } from '../../components/Controls'
import { useEffect, useRef, useState } from 'react'
import { View, Text, Image, ScrollView} from '@tarojs/components'
import Taro from '@tarojs/taro'
import { request } from '../../platform/request'
import { getAccessToken } from '../../platform/auth'
import { API_BASE } from '../../config'
import { BottomNav, CreationMenu, Empty, Glyph, KindBadge } from '../../components/Ui'
import { CreateProjectEntry, type CreateKind } from '../../components/CreateProjectFlow'
import './index.scss'

type Post={id:string;kind:'beading'|'patchwork';name:string;author:string;likesCount:number;thumbnailImage?:string;tags?:string[]}
const categories=['全部','动物','人物','植物','食物','风景','动漫','游戏','节日','文字','新手','其他']
export default function CommunityPage(){
 const [posts,setPosts]=useState<Post[]>([])
 const [sort,setSort]=useState<'hot'|'latest'>('hot')
 const [tag,setTag]=useState('全部')
 const [query,setQuery]=useState('')
 const [search,setSearch]=useState('')
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 const [hasMore,setHasMore]=useState(true)
 const [creating,setCreating]=useState(false)
 const [creationKind,setCreationKind]=useState<CreateKind | null>(null)
 const openCreation=(kind:CreateKind)=>{setCreating(false);setCreationKind(kind)}
 const page=useRef(0),sequence=useRef(0),busy=useRef(false)
 const load=async(reset=false)=>{
  if(busy.current&&!reset)return
  if(!reset&&!hasMore)return
  const run=++sequence.current
  const next=reset?1:page.current+1
  busy.current=true;setLoading(true);setError('')
  if(reset){page.current=0;setPosts([]);setHasMore(true)}
  try{
   const token=getAccessToken()
   const data=await request<{posts:Post[];hasMore?:boolean}>(`/community/posts?sort=${sort}&page=${next}&pageSize=20&q=${encodeURIComponent(search)}&tags=${tag==='全部'?'':encodeURIComponent(tag)}`,token?{token}:{})
   if(run!==sequence.current)return
   setPosts(current=>reset?data.posts:Array.from(new Map([...current,...data.posts].map(p=>[p.id,p])).values()))
   page.current=next;setHasMore(data.hasMore??data.posts.length===20)
  }catch{if(run===sequence.current)setError('加载失败，请重试')}
  finally{if(run===sequence.current){busy.current=false;setLoading(false)}}
 }
 useEffect(()=>{void load(true);return()=>{sequence.current++;busy.current=false}},[sort,tag,search])
 const preview=(post:Post)=>{
  if(!post.thumbnailImage)return
  const path=post.thumbnailImage
  const url=/^https?:/.test(path)?path:API_BASE.replace(/\/api$/,'')+path
  Taro.previewImage({urls:[url],current:url})
 }
 return <View className='cm-page'>
  <View className='cm-header'><Text className='page-heading'>发现</Text><View className='cm-sort'>{(['hot','latest'] as const).map(s=><Button key={s} className={'cm-sort-option'+(sort===s?' on':'')} onClick={()=>setSort(s)}>{s==='hot'?'热门':'最新'}</Button>)}</View></View>
  <View className='page-search'><Glyph name='search'/><Input value={query} placeholder='搜索图纸、作者' confirmType='search' onInput={e=>setQuery(e.detail.value)} onConfirm={()=>setSearch(query.trim())}/>{query&&<Button ariaLabel='清空搜索' onClick={()=>{setQuery('');setSearch('')}}><Glyph name='close'/></Button>}</View>
  <ScrollView scrollX className='cm-categories'><View className='filter-row'>{categories.map(t=><Button key={t} className={'filter-chip'+(tag===t?' on':'')} onClick={()=>setTag(t)}>{t}</Button>)}</View></ScrollView>
  <ScrollView scrollY={!creating&&!creationKind} className='cm-list' onScrollToLower={()=>void load()} lowerThreshold={120} refresherEnabled={!creating&&!creationKind} refresherTriggered={loading&&page.current===0} onRefresherRefresh={()=>{page.current=0;void load(true)}}>
   <View className='cm-grid'>{posts.map(post=><View key={post.id} className='cm-card' onClick={()=>preview(post)}>
    <View className='cm-art'><KindBadge kind={post.kind}/>{post.thumbnailImage?<Image className='cm-img' src={/^https?:/.test(post.thumbnailImage)?post.thumbnailImage:API_BASE.replace(/\/api$/,'')+post.thumbnailImage} mode='aspectFit' lazyLoad/>:<View className='cm-placeholder'><Glyph name='grid'/></View>}</View>
    <Text className='cm-name'>{post.name}</Text><View className='cm-meta'><Text>{post.author||'创作者'}</Text><Text>♡ {post.likesCount||0}</Text></View>
   </View>)}</View>
   {!loading&&!error&&!posts.length&&<Empty title='没有找到相关图纸' detail='试试其他分类或关键词'/>}
   {error?<Button className='page-state' onClick={()=>void load(page.current===0)}>{error}</Button>:<Text className='page-state'>{loading?'加载中…':hasMore?'上拉加载更多':posts.length?'已显示全部图纸':''}</Text>}
  </ScrollView>
  <BottomNav active='community' onCreate={()=>setCreating(true)}/>
  {creating&&<CreationMenu onClose={()=>setCreating(false)} onBead={()=>openCreation('beading')} onFabric={()=>openCreation('patchwork')}/>}
  {creationKind&&<CreateProjectEntry key={creationKind} kind={creationKind} onClose={()=>setCreationKind(null)}/>}
 </View>
}
