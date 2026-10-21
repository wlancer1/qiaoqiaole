import { afterEach,expect,it,vi } from 'vitest';
import { createH5Store } from '../store/store';
import { sessionEstablished } from '../store/auth/authEvents';
import { fabricApi } from './fabricApi';
afterEach(()=>vi.unstubAllGlobals());
it('loads only the first requested page, appends explicitly and refetches invalidated inventory',async()=>{
 const NativeRequest=globalThis.Request;
 vi.stubGlobal('Request',class extends NativeRequest {constructor(input:RequestInfo|URL,init?:RequestInit){super(typeof input==='string'&&input.startsWith('/')?'http://localhost'+input:input,init);}});
 const fetch=vi.fn(async(input:Request)=>{
  const page=Number(new URL(input.url).searchParams.get('page'));
  return new Response(JSON.stringify({fabrics:[{id:'f'+page}],page,pageSize:16,hasMore:page===1,ownedPresetIds:[]}),{headers:{'content-type':'application/json'}});
 });vi.stubGlobal('fetch',fetch);
 const store=createH5Store();store.dispatch(sessionEstablished({token:'token',user:{id:'one',username:'one',displayName:'one',avatarUrl:'',legacyDraftOwnerId:'',likesCount:0,followingCount:0,followersCount:0}}));
 const arg={accountId:'one',query:''};
 const first=store.dispatch(fabricApi.endpoints.browseFabrics.initiate(arg));
 try {
  await first.unwrap();expect(fetch).toHaveBeenCalledTimes(1);
  expect(new URL(fetch.mock.calls[0][0].url).searchParams.get('pageSize')).toBe('16');
  await store.dispatch(fabricApi.endpoints.browseFabrics.initiate(arg,{direction:'forward'})).unwrap();
  expect(fabricApi.endpoints.browseFabrics.select(arg)(store.getState()).data?.pages.map(p=>p.page)).toEqual([1,2]);
  store.dispatch(fabricApi.util.invalidateTags(['Inventory']));
  await vi.waitFor(()=>expect(fetch.mock.calls.length).toBeGreaterThan(2));
  expect(fabricApi.endpoints.browseFabrics.select({accountId:'two',query:''})(store.getState()).data).toBeUndefined();
 } finally {first.unsubscribe();store.dispatch(fabricApi.util.resetApiState());}
});
