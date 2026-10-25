import { Button } from '../../components/Controls'
import { useState } from 'react'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { getStoredAuth, wxLogin, clearAuth } from '../../platform/auth'
import { listBeadingProjects } from '../../platform/beadingStore'
import { listPwProjects } from '../../platform/patchworkStore'
import { BottomNav, CreationMenu, Glyph } from '../../components/Ui'
import { CreateProjectEntry, type CreateKind } from '../../components/CreateProjectFlow'
import './index.scss'
export default function ProfilePage(){
 const [user,setUser]=useState(()=>getStoredAuth()?.user)
 const [creating,setCreating]=useState(false),[busy,setBusy]=useState(false)
 const [creationKind,setCreationKind]=useState<CreateKind | null>(null)
 const openCreation=(kind:CreateKind)=>{setCreating(false);setCreationKind(kind)}
 const [count,setCount]=useState(0)
 useDidShow(()=>{setUser(getStoredAuth()?.user);setCount(listBeadingProjects().length+listPwProjects().length)})
 const login=async()=>{if(busy||user)return;setBusy(true);try{const auth=await wxLogin();setUser(auth.user)}catch(e){Taro.showToast({title:e instanceof Error?e.message:'登录失败，请重试',icon:'none'})}finally{setBusy(false)}}
 const logout=async()=>{const result=await Taro.showModal({title:'退出登录',content:'确定退出当前账号？'});if(result.confirm){clearAuth();setUser(undefined)}}
 return <View className='profile-page'><ScrollView scrollY={!creating&&!creationKind} className='profile-scroll'>
  <Text className='page-heading'>我的</Text><View className='profile-card' onClick={()=>void login()}>
   <View className='profile-avatar'>{user?.avatarUrl?<Image src={user.avatarUrl} mode='aspectFill'/>:<Glyph name='user'/>}</View>
   <View><Text className='profile-name'>{user?.nickname||'登录 / 注册'}</Text><Text className='profile-note'>{user?'每一份创作，都值得珍藏':'登录后管理你的创作记录'}</Text></View>
   {!user&&<Text className='profile-arrow'>{busy?'…':'›'}</Text>}
  </View>
  <View className='profile-stats' onClick={()=>Taro.redirectTo({url:'/pages/works/index'})}><Text>{count}</Text><Text>本机作品</Text></View>
  <View className='profile-links'><Button className='profile-link' onClick={()=>Taro.redirectTo({url:'/pages/works/index'})}><Glyph name='grid'/><Text>我的作品</Text><Text>›</Text></Button><Button className='profile-link' onClick={()=>Taro.redirectTo({url:'/pages/community/index'})}><Glyph name='compass'/><Text>发现图纸</Text><Text>›</Text></Button></View>
  {user&&<Button className='profile-logout' onClick={()=>void logout()}>退出登录</Button>}
 </ScrollView><BottomNav active='profile' onCreate={()=>setCreating(true)}/>{creating&&<CreationMenu onClose={()=>setCreating(false)} onBead={()=>openCreation('beading')} onFabric={()=>openCreation('patchwork')}/>}{creationKind&&<CreateProjectEntry key={creationKind} kind={creationKind} onClose={()=>setCreationKind(null)}/>}</View>
}
