import { Button,Input } from '../../components/Controls'
import { useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { listBeadingProjects, deleteBeadingProject } from '../../platform/beadingStore'
import { listPwProjects, deletePwProject } from '../../platform/patchworkStore'
import { BottomNav, CreationMenu, Empty, Glyph, KindBadge, CreationArt } from '../../components/Ui'
import { CreateProjectEntry, type CreateKind } from '../../components/CreateProjectFlow'
import './index.scss'

export default function WorksPage(){
 const [beading,setBeading]=useState(()=>listBeadingProjects())
 const [patchwork,setPatchwork]=useState(()=>listPwProjects())
 const [filter,setFilter]=useState('all'),[query,setQuery]=useState(''),[limit,setLimit]=useState(18)
 const [creating,setCreating]=useState(false)
 const [creationKind,setCreationKind]=useState<CreateKind | null>(null)
 const openCreation=(kind:CreateKind)=>{setCreating(false);setCreationKind(kind)}
 const refresh=()=>{setBeading(listBeadingProjects());setPatchwork(listPwProjects())}
 useDidShow(refresh)
 const items=[...beading.map(m=>({id:m.id,kind:'beading',name:m.title,size:m.cols+' × '+m.rows,updatedAt:m.updatedAt})),...patchwork.map(m=>({id:m.id,kind:'patchwork',name:m.name,size:m.widthMm/10+' × '+m.heightMm/10+' cm',updatedAt:m.updatedAt}))]
 .filter(m=>(filter==='all'||m.kind===filter)&&m.name.toLowerCase().includes(query.trim().toLowerCase())).sort((a,b)=>b.updatedAt-a.updatedAt)
 const remove=async(item:typeof items[number])=>{
  const result=await Taro.showModal({title:'删除作品',content:'删除「'+item.name+'」？此操作不可恢复。',confirmColor:'#d92d20'})
  if(!result.confirm)return
  if(item.kind==='beading')deleteBeadingProject(item.id);else deletePwProject(item.id)
  refresh()
 }
 return <View className='wk-page'>
  <Text className='page-heading'>我的作品</Text>
  <View className='page-search'><Glyph name='search'/><Input value={query} placeholder='搜索作品名称' onInput={e=>{setQuery(e.detail.value);setLimit(18)}}/>{query&&<Button ariaLabel='清空搜索' onClick={()=>setQuery('')}><Glyph name='close'/></Button>}</View>
  <View className='filter-row'>{[['all','全部'],['beading','拼豆'],['patchwork','拼布']].map(([key,label])=><Button key={key} className={'filter-chip'+(filter===key?' on':'')} onClick={()=>{setFilter(key);setLimit(18)}}>{label}</Button>)}<Text className='wk-count'>{items.length} 个作品</Text></View>
  <ScrollView scrollY={!creating&&!creationKind} className='wk-scroll' onScrollToLower={()=>setLimit(n=>n+18)}>
   {!items.length?<Empty title={query?'没有找到相关作品':'还没有作品'} detail={query?'试试其他关键词':'点击底部加号，开始你的创作'}/>:<View className='wk-grid'>{items.slice(0,limit).map(item=><View key={item.kind+item.id} className='wk-card' onClick={()=>Taro.navigateTo({url:'/pages/'+item.kind+'/index?id='+encodeURIComponent(item.id)})} onLongPress={()=>void remove(item)}>
    <View className={'wk-art '+item.kind}><KindBadge kind={item.kind}/><CreationArt fabric={item.kind==='patchwork'}/></View><Text className='wk-name'>{item.name}</Text><Text className='wk-meta'>{item.size}</Text><Button className='wk-menu' ariaLabel={'管理作品 '+item.name} onClick={e=>{e.stopPropagation();void remove(item)}}>···</Button>
   </View>)}</View>}
   {!!items.length&&<Text className='page-state'>{limit<items.length?'上拉加载更多':'长按作品可管理'}</Text>}
  </ScrollView>
  <BottomNav active='works' onCreate={()=>setCreating(true)}/>
  {creating && <CreationMenu onClose={()=>setCreating(false)} onBead={()=>openCreation('beading')} onFabric={()=>openCreation('patchwork')}/>}
  {creationKind && <CreateProjectEntry key={creationKind} kind={creationKind} onClose={()=>setCreationKind(null)}/>}
 </View>
}
