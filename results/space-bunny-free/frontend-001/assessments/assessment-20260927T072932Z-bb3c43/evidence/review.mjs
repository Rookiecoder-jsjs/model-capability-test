// Independent evaluation; invoked with an ego-browser Page and an absolute evidence directory.
import fs from 'node:fs/promises';
export async function inspectGeometry(page, dir) {
  const result = await page.evaluate(() => {
    const s=window.__scene, m=s.model;
    const saved={chip:m.chip,card:m.card,server:m.server,rack:m.rackA,cluster:m.cluster};
    const vec=()=>[m.chip,m.card,m.server,m.rackA,...Object.values(m.strata)].flatMap(o=>Array.from(o.world));
    const delta=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
    const points=[.05,.10,.175,.20,.28,.32,.42,.55,.66,.80,.951,.953,.97,1];
    s.setP(0);s.setP(0);s.setP(0);
    const forward={};for(const p of points){s.setP(p);forward[p]=vec();}
    const reverse=[];for(const p of [...points].reverse()){s.setP(p);reverse.push({p,maxWorldMatrixDelta:delta(forward[p],vec())});}
    const identity={chip:saved.chip===m.chip,card:saved.card===m.card,server:saved.server===m.server,rack:saved.rack===m.rackA,cluster:saved.cluster===m.cluster};
    s.setP(.6875);const phases=Object.entries(m.strata).map(([key,o])=>({key,progress:o.t,y:o.pos.y}));
    const r=s.stage.renderer, originalBox=r.box, boxes=[];
    r.box=function(mat,w,h,d,...rest){boxes.push({size:[w,h,d],translation:[mat[12],mat[13],mat[14]],unused:[mat[3],mat[7],mat[11]]});return originalBox.call(this,mat,w,h,d,...rest)};
    try{s.setP(.3125)}finally{r.box=originalBox}
    const serverPanels=boxes.filter(b=>Math.abs(b.size[0]-1.58)<1e-9&&Math.abs(b.size[1]-.04)<1e-9&&Math.abs(b.size[2]-2.3)<1e-9);
    return {identity,reverse,phases,serverPanels,serverCenter:m.server.worldPos,method:'Synchronous progress sampling, reference equality, temporary renderer.box observation; not a performance test'};
  });
  await fs.writeFile(dir+'/geometry.json',JSON.stringify(result,null,2)+'\n');
  console.log(result);
}
export async function inspectLayout(page,dir,width,height,points) {
  await page.cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  const samples=[];
  for(const [label,p] of points) {
    await page.evaluate(p=>window.__scene.setP(p),p);
    await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.chapter.is-live')).opacity)>=.999,undefined,{timeout:5000});
    const data=await page.evaluate(()=>{
      const el=document.querySelector('.chapter.is-live'),head=el.querySelector('h2'),lead=el.querySelector('.chapter__lead');
      const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};
      const cs=getComputedStyle(lead),hs=getComputedStyle(head);
      return {p:window.__scene.stats().p,chapter:el.id,head:{size:hs.fontSize,weight:hs.fontWeight,family:hs.fontFamily,rect:rect(head)},lead:{color:cs.color,background:getComputedStyle(document.body).backgroundColor,rect:rect(lead)},overflow:document.documentElement.scrollWidth-innerWidth,labels:[...document.querySelectorAll('.stack-label')].map(e=>({text:e.textContent,rect:rect(e),opacity:getComputedStyle(e).opacity})),visible:document.visibilityState,focus:document.hasFocus()};
    });
    samples.push(data);
    await page.screenshot({path:dir+'/'+width+'-'+label+'.png'});
  }
  await fs.writeFile(dir+'/layout-'+width+'.json',JSON.stringify(samples,null,2)+'\n');
  console.log({width,height,samples:samples.map(s=>({p:s.p,chapter:s.chapter,titleSize:s.head.size,weight:s.head.weight,overflow:s.overflow}))});
}
export async function inspectInteractions(page,dir) {
  const results={navigation:[]};
  for(const i of [0,6,2,7,1]) {
    await page.click('loc=css:.nav__item[data-index="'+i+'"]');
    await page.waitForFunction(i=>Math.abs(window.__scene.stats().p-(i+.5)/8)<.002,i,{timeout:8000});
    results.navigation.push(await page.evaluate(()=>({p:window.__scene.stats().p,current:document.querySelector('.nav__item[aria-current]').dataset.index,chapter:document.querySelector('.chapter.is-live').id})));
  }
  await page.evaluate(()=>window.__scene.setP(1));
  const state=()=>page.evaluate(()=>({demo:{...window.__scene.demo.snapshot},exec:window.__scene.stage.state.exec,frames:window.__scene.stats().framesRendered,downloadDisabled:document.querySelector('.btn--accent').disabled,replayText:document.querySelector('.btn--primary').textContent}));
  results.before=await state();
  await page.click('loc=css:.btn--primary');
  await page.waitForFunction(()=>window.__scene.demo.snapshot.active>=1,undefined,{timeout:8000});
  results.running=await state();
  await page.click('loc=role:button[name="停止"]');
  results.stopped=await state();
  await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,1500)));
  results.afterStopWait=await state();
  await page.click('loc=css:.btn--primary');
  results.restarted=await state();
  results.duplicateStart=await page.evaluate(()=>window.__scene.demo.start(performance.now()));
  await page.waitForFunction(()=>window.__scene.demo.snapshot.run==='done',undefined,{timeout:10000});
  results.completed=await state();
  const event=page.waitForEvent('download',{timeout:10000});
  await page.click('loc=css:.btn--accent');
  const download=await event;
  const local='/tmp/fe001-review-download.md';
  await download.saveAs(local);
  const text=await fs.readFile(local,'utf8');
  const crypto=await import('node:crypto');
  results.download={suggestedFilename:download.suggestedFilename(),bytes:Buffer.byteLength(text),sha256:crypto.createHash('sha256').update(text).digest('hex'),hasTitle:text.includes('# 项目进展简报'),hasProgress:text.includes('部署需求已梳理；模型与算力配置待确认。'),todoCount:(text.match(/^- \[ \]/gm)||[]).length,hasExpectedTodos:['确认模型与算力资源。','补充评测任务。','开始部署验证。'].every(s=>text.includes(s))};
  await fs.unlink(local);
  await page.click('loc=css:.btn--primary');
  await page.waitForFunction(()=>window.__scene.demo.snapshot.run==='done',undefined,{timeout:10000});
  results.secondCompleted=await state();
  await page.screenshot({path:dir+'/agent-completed.png'});
  await fs.writeFile(dir+'/interactions.json',JSON.stringify(results,null,2)+'\n');
  console.log(results);
}
export async function inspectModes(page,dir) {
 const readings=[];
 const read=async(name)=>{const r=await page.evaluate(()=>({viewport:[innerWidth,innerHeight],classes:document.documentElement.className,overflow:document.documentElement.scrollWidth-innerWidth,visibleChapters:[...document.querySelectorAll('.chapter')].filter(e=>getComputedStyle(e).visibility==='visible'&&getComputedStyle(e).display!=='none').length,ariaHiddenChapters:document.querySelectorAll('.chapter[aria-hidden="true"]').length,stageHidden:getComputedStyle(document.querySelector('.stage-layer')).display==='none',agentVisible:getComputedStyle(document.querySelector('.agent-window')).visibility}));readings.push({name,...r});await page.screenshot({path:dir+'/'+name+'.png'});};
 await page.cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
 await page.waitForFunction(()=>document.documentElement.classList.contains('static-mode'));
 await page.evaluate(()=>window.scrollTo(0,0));await read('mobile-390');
 await page.cdp('Emulation.setDeviceMetricsOverride',{width:1366,height:893,deviceScaleFactor:1,mobile:false});
 await page.evaluate(()=>document.documentElement.style.fontSize='32px');
 await page.waitForFunction(()=>document.documentElement.classList.contains('text-200'));
 await read('text-200');
 await page.evaluate(()=>document.documentElement.style.fontSize='');
 await page.reload();
 await page.cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await page.waitForFunction(()=>document.documentElement.classList.contains('static-mode'));
 await page.evaluate(()=>window.scrollTo(0,0));await read('reduced-motion');
 await page.cdp('Emulation.setEmulatedMedia',{features:[]});
 await page.reload();
 await page.keyboard.press('Tab');
 readings.push({name:'keyboard-first-focus',...await page.evaluate(()=>({element:document.activeElement.tagName,text:document.activeElement.textContent,outline:getComputedStyle(document.activeElement).outlineStyle,outlineWidth:getComputedStyle(document.activeElement).outlineWidth}))});
 await page.cdp('Emulation.setScriptExecutionDisabled',{value:true});
 await page.reload();
 const nojs=await page.snapshot();
 await fs.writeFile(dir+'/no-javascript.txt',nojs+'\n');
 await page.screenshot({path:dir+'/no-javascript.png'});
 await page.cdp('Emulation.setScriptExecutionDisabled',{value:false});await page.reload();
 const environment=await page.evaluate(()=>({date:new Date().toISOString(),userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,visibility:document.visibilityState,focus:document.hasFocus(),loadedFonts:[...document.fonts].filter(f=>f.status==='loaded').map(f=>({family:f.family,weight:f.weight})).filter((v,i,a)=>i===a.findIndex(w=>w.family===v.family))}));
 await fs.writeFile(dir+'/modes.json',JSON.stringify({readings,environment},null,2)+'\n');
 console.log({readings,environment,nojs});
}
