import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

const root = fileURLToPath(new URL('.', import.meta.url));
await mkdir(root + '/screenshots', {recursive:true});
const browser = await chromium.launch({channel:'chrome',headless:true});
const page = await browser.newPage({viewport:{width:1000,height:2100},deviceScaleFactor:1.5});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const url=new URL('index.html',import.meta.url).href;
try {
 await page.goto(url);
 if(errors.length)throw Error(errors.join("\n"));
 await page.locator(".phone").first().waitFor({timeout:5000});
 for (const id of ['shape','thread','properties','edge']) {
  const scene=page.locator('[data-scene-card="'+id+'"]');
  await scene.locator('.phone').screenshot({path:root+'/screenshots/'+id+'.png'});
 }
 const boxes=await page.locator('.phone').evaluateAll(els=>els.map(phone=>{
  const p=phone.getBoundingClientRect(),s=phone.querySelector('.sheet').getBoundingClientRect();
  return {id:phone.dataset.id,width:p.width,height:p.height,sheetTop:Math.round(s.top-p.top),fits:s.left>=p.left&&s.right<=p.right&&s.bottom<=p.bottom+1};
 }));
 if(boxes.some(b=>!b.fits||b.width!==390||b.height!==844||b.sheetTop<160))throw Error('Invalid phone layout: '+JSON.stringify(boxes));
 const shape=page.locator('.phone[data-id="shape"]');
 await shape.locator('[data-shape="rect"]').click();
 if(await shape.locator('.shape-option.on').innerText()!=='矩形')throw Error('Shape selection');
 await shape.locator('[data-tab="thread"]').click();
 await shape.locator('[data-style="back"]').click();
 await shape.locator('[data-color-name="豆沙粉"]').click();
 if(await shape.locator('.free-needle').evaluate(el=>getComputedStyle(el).stroke)!=='rgb(185, 109, 130)')throw Error('Brush color preview');
 await shape.locator('[data-action="cancel"]').click();
 await shape.locator('[data-action="reopen"]').click();
 if(await shape.locator('.mode-tabs .on').innerText()!=='形状')throw Error('Brush cancel restoration');
 const props=page.locator('.phone[data-id="properties"]');
 await props.locator('[data-action="open-edge"]').click();
 await props.locator('[data-action="toggle"]').click();
 await props.locator('[data-style="back"]').click();
 await props.locator('[data-color-name="炭灰"]').click();
 await props.locator('[data-action="apply"]').click();
 if(!(await props.locator('[data-action="open-edge"]').innerText()).includes('回针'))throw Error('Properties return after apply');
 const edge=page.locator('.phone[data-id="edge"]');
 await edge.locator('[data-offset="-0.5"]').click();
 if(await edge.locator('output').innerText()!=='2.5')throw Error('Edge inset');
 await edge.locator('[data-style="blanket"]').click();
 if(await edge.locator('.blanket-ticks').count()!==1)throw Error('Blanket preview');
 await edge.locator('[data-action="cancel"]').click();
 await edge.locator('[data-action="reopen"]').click();
 if(await edge.locator('output').innerText()!=='3')throw Error('Cancel restoration');
 await edge.locator('[data-action="advanced"]').click();
 await edge.locator('[data-input="length"]').fill('4');
 await edge.locator('[data-input="gap"]').fill('3');
 await edge.locator('[data-action="apply"]').click();
 if(errors.length)throw Error(errors.join('\n'));
 await page.reload();
 await page.evaluate(()=>{
  const board=document.createElement('div');board.className='board';board.id='brush-pair';
  for(const id of ['shape','thread'])board.append(document.querySelector('[data-scene-card="'+id+'"]').cloneNode(true));
  document.body.append(board);
 });
 await page.locator('#brush-pair').screenshot({path:root+'/screenshots/01-brush-modes.png'});
 await page.evaluate(()=>{
  document.getElementById('brush-pair').remove();
  const board=document.createElement('div');board.className='board';board.id='edge-pair';
  for(const id of ['properties','edge'])board.append(document.querySelector('[data-scene-card="'+id+'"]').cloneNode(true));
  document.body.append(board);
 });
 await page.locator('#edge-pair').screenshot({path:root+'/screenshots/02-piece-stitches.png'});
 await page.reload();
 await page.locator('.gallery').screenshot({path:root+'/screenshots/00-overview.png'});
 console.log(JSON.stringify({screenshots:7,interactionChecks:'passed',layouts:boxes,errors}));
} finally {await browser.close();}
