import { useState } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { PatternDiscoverPage } from './H5PatternPages';
vi.mock('../community/CommunityPatternCard',()=>({CommunityPatternCard:({pattern}:any)=>{
 const [identity]=useState(pattern.id);
 return <article data-id={pattern.id} data-mounted-id={identity}/>;
}}));
afterEach(()=>vi.unstubAllGlobals());
it('keeps same-title works distinct when switching all, anime, and back',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const all=Array.from({length:6},(_,i)=>({id:'post-'+i,title:'未命名作品',tags:i>3?['动漫']:['动物']})) as any;
 const props={onOpen:vi.fn(),onOpenAuthor:vi.fn()};
 let tree:ReturnType<typeof create>;
 await act(async()=>{tree=create(<PatternDiscoverPage {...props} patterns={all}/>);});
 for(const patterns of [all.slice(4),all,all.slice(4)]){
  await act(async()=>{tree.update(<PatternDiscoverPage {...props} patterns={patterns}/>);});
  const cards=tree!.root.findAllByType('article');
  expect(cards.map(c=>c.props['data-id']).sort()).toEqual(patterns.map((p:any)=>p.id).sort());
  for(const card of cards)expect(card.props['data-mounted-id']).toBe(card.props['data-id']);
 }
 await act(async()=>tree.unmount());
});
