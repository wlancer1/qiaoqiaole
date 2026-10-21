
const{chromium}=require('playwright');const fs=require('fs');const path=require('path');const{pathToFileURL}=require('url');
(async()=>{const out=path.join(__dirname,'screenshots');fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',timeout:45000});try{
const page=await browser.newPage({viewport:{width:1310,height:1050},deviceScaleFactor:2});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(path.join(__dirname,'index.html')).href);await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
console.log('Loaded design');const cdp=await page.context().newCDPSession(page);
async function capture(selector,file){const r=await page.locator(selector).evaluate(e=>{const r=e.getBoundingClientRect();return{x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1}});const result=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,fromSurface:true,clip:r});fs.writeFileSync(path.join(out,file),Buffer.from(result.data,'base64'));}
const ids=await page.locator('.art').evaluateAll(es=>es.map(e=>e.id));for(const [i,id]of ids.entries()){await capture('#'+id+' .device',String(i).padStart(2,'0')+'-'+id+'.png');console.log('Exported',id)}
await capture('#desktop .device','13-desktop.png');await page.screenshot({path:path.join(out,'00-all-screens.png'),fullPage:true});console.log('Exported overview');
const checks=await page.evaluate(()=>{
 const ok=(c,t)=>{if(!c)throw Error(t)};const find=s=>document.querySelector(s);const click=s=>find(s).click();
 click('#profile [data-go="warehouse"]');ok(location.hash==='#warehouse','profile entry');
 click('#warehouse .head [data-go="profile"]');ok(location.hash==='#profile','return profile');
 const q=find('#warehouse [data-search]');q.value='玫粉';q.dispatchEvent(new Event('input',{bubbles:true}));ok([...document.querySelectorAll('#warehouse .tile')].filter(e=>e.style.display!=='none').length===1,'search');q.value='';q.dispatchEvent(new Event('input',{bubbles:true}));
 click('#warehouse [data-filter="已用完"]');ok([...document.querySelectorAll('#warehouse .tile')].filter(e=>e.style.display!=='none').length===1,'filter');click('#warehouse [data-filter="全部"]');
 click('#picker [data-pick="1"]');ok(location.hash==='#editor','immediate pick');
 const mode=find('#stock-mode');mode.value='own';mode.dispatchEvent(new Event('change',{bubbles:true}));ok(!find('#own-fields').hidden,'stock mode');mode.value='size';mode.dispatchEvent(new Event('change',{bubbles:true}));
 const actual=find('#actual');actual.value=7000;actual.dispatchEvent(new Event('input',{bubbles:true}));click('#ack');ok(find('#confirm-cut').disabled,'no overdraw');actual.value=2600;actual.dispatchEvent(new Event('input',{bubbles:true}));ok(!find('#confirm-cut').disabled,'confirm enable');click('#confirm-cut');
 return ['profile entry','return profile','search','filter','immediate pick','stock modes','overdraw guard'];
});await page.waitForURL('**#ledger',{timeout:5000});
await page.evaluate(()=>document.querySelector('#toggle').click());if(await page.locator('.art:visible').count()!==1)throw Error('single screen');
for(const width of [320,375,390,414]){await page.setViewportSize({width,height:900});await page.evaluate(()=>navigate('warehouse'));const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)throw Error('viewport overflow '+width);await page.screenshot({path:path.join(out,'responsive-'+width+'.png')});}
if(errors.length)throw Error(errors.join(';'));console.log(JSON.stringify({pass:true,screens:14,checks:[...checks,'partial cutting','single screen','320/375/390/414 widths']}));}
finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
