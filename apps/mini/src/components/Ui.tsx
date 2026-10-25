import { Button } from './Controls'
import { type ReactNode } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'

export function Glyph({name}: {name:string}) {
  return <View className={'ui-glyph ui-glyph-'+name}><View/><View/><View/><View/></View>
}
export function CreationArt({fabric=false}:{fabric?:boolean}) {
  return <View className={'creation-art'+(fabric?' fabric':'')}>{Array.from({length:fabric?4:9},(_,i)=><View key={i} className={'creation-dot c'+(i%4)} />)}</View>
}
export function Sheet({title,onClose,children,className=''}:{title:string;onClose:()=>void;children:ReactNode;className?:string}) {
  return <View className='ui-mask' catchMove onClick={onClose}>
    <View className={'ui-sheet'+(className?' '+className:'')} role='dialog' aria-modal={true} ariaLabel={title} onClick={e=>e.stopPropagation()}>
      <View className='ui-sheet-handle'/>
      <View className='ui-sheet-head'><Text>{title}</Text><Button className='ui-close' ariaLabel='关闭弹窗' onClick={onClose}><Glyph name='close'/></Button></View>
      <ScrollView scrollY className='ui-sheet-body'>{children}</ScrollView>
    </View>
  </View>
}
export function CreationMenu({onClose,onBead,onFabric}:{onClose:()=>void;onBead?:()=>void;onFabric?:()=>void}) {
  const open=(kind:string)=>{
    onClose()
    if (kind === 'beading' && onBead) onBead()
    else if (kind === 'patchwork' && onFabric) onFabric()
    else Taro.navigateTo({url:'/pages/'+kind+'/index'})
  }
  return <View className='ui-mask creation-mask' catchMove onClick={onClose}>
    <View className='creation-menu' role='dialog' aria-modal={true} ariaLabel='选择创作类型' onClick={e=>e.stopPropagation()}>
      <View className='creation-options'>{['beading','patchwork'].map((kind,i)=><Button className='creation-option' key={kind} onClick={()=>open(kind)}><View className='creation-circle'><CreationArt fabric={!!i}/></View><Text>{i?'拼布':'拼豆'}</Text></Button>)}</View>
      <Button className='creation-close' ariaLabel='关闭创作菜单' onClick={onClose}><Glyph name='close'/></Button>
    </View>
  </View>
}
const tabs=[['index','首页','home'],['community','发现','compass'],['create','创建','plus'],['works','作品','grid'],['profile','我的','user']]
export function BottomNav({active,onCreate}:{active:string;onCreate:()=>void}) {
  return <View className='bottom-tabs'>{tabs.map(([key,label,icon])=><Button key={key} ariaLabel={label} className={'bottom-tab-item '+(key===active?'active ':'')+(key==='create'?'plus-tab':'')} onClick={()=>{
    if(key==='create'){onCreate();return}
    if(key!==active)Taro.redirectTo({url:'/pages/'+key+'/index'})
  }}><Glyph name={icon}/>{key!=='create'&&<Text>{label}</Text>}</Button>)}</View>
}
export function KindBadge({kind}:{kind:string}) {return <Text className={'kind-badge '+kind}>{kind==='patchwork'?'拼布':'拼豆'}</Text>}
export function Empty({title,detail}:{title:string;detail?:string}) {return <View className='ui-empty'><Glyph name='grid'/><Text className='ui-empty-title'>{title}</Text>{detail&&<Text>{detail}</Text>}</View>}
