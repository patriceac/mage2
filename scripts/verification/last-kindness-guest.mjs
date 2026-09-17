// Guest-only acceptance driver. No scene jumps, forced variables or fabricated saves.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
const [outDir,payloadDir,inputDir]=process.argv.slice(2);
if(!outDir||!payloadDir||!inputDir)throw new Error('Run via verify-last-kindness-hyperv.ps1');
const result={passed:false,checks:[],errors:[],scope:'Packaged Windows editor; UI keyboard activation; native Playtest; actual app export. No FMV/audio claim.'};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const token=crypto.randomBytes(32).toString('hex');
const gameDir=path.join(outDir,'editable-project');
fs.mkdirSync(gameDir,{recursive:true});
for(const name of ['project.json','assets.json','locations.json','scenes.json','dialogues.json','inventory.json','strings.json','media'])fs.cpSync(path.join(inputDir,name),path.join(gameDir,name),{recursive:true});
const exe=path.join(payloadDir,'MAGE2 Editor.exe');
const log=fs.openSync(path.join(outDir,'editor.log'),'w');
const proc=spawn(exe,['--remote-debugging-port=9222',`--user-data-dir=${path.join(outDir,'user-data')}`],{windowsHide:true,stdio:['ignore',log,log],env:{...process.env,MAGE2_EDITOR_AUTOMATION:'1',MAGE2_EDITOR_AUTOMATION_TOKEN:token,MAGE2_EDITOR_AUTOMATION_ROOT:outDir}});
let cdp;
async function wait(fn,ms=45000){const end=Date.now()+ms;let last;while(Date.now()<end){try{const v=await fn();if(v)return v;}catch(e){last=e;}await pause(150);}throw last??new Error('Wait expired');}
async function command(data){const r=await fetch('http://127.0.0.1:47632/automation/command',{method:'POST',headers:{'content-type':'application/json','x-mage2-automation-token':token},body:JSON.stringify(data),signal:AbortSignal.timeout(90000)});const j=await r.json();if(!r.ok||!j.ok)throw new Error(JSON.stringify(j));return j.value;}
async function shot(name){const x=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(outDir,name+'.png'),Buffer.from(x.data,'base64'));fs.writeFileSync(path.join(outDir,name+'.txt'),await cdp.value('document.body.innerText'));}
async function pressButton(name){
  await wait(()=>cdp.value(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>(e.getAttribute('aria-label')===${JSON.stringify(name)}||e.textContent.trim()===${JSON.stringify(name)})&&!e.disabled&&e.getAttribute('aria-disabled')!=='true'&&e.getBoundingClientRect().width>0);if(!b)return false;b.focus();return true;})()`));
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await pause(100);
}
async function drain(){for(let i=0;i<35;i++){const has=await cdp.value(`!!document.querySelector('.mage2-player__dialogue-continue')`);if(!has)return;await cdp.value(`document.querySelector('.mage2-player__dialogue-continue').focus()`);await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await pause(80);}throw new Error('Dialogue loop');}
async function act(name){await pressButton(name);await drain();}
async function state(){return command({command:'playtest.getState'});}
async function check(name,fn){await fn();result.checks.push({name,passed:true});}
try{
  const target=await wait(async()=>{const rows=await(await fetch('http://127.0.0.1:9222/json/list',{signal:AbortSignal.timeout(1000)})).json();return rows.find(t=>t.type==='page'&&t.webSocketDebuggerUrl);},60000);
  cdp=new Cdp(target.webSocketDebuggerUrl);await cdp.connect();
  await wait(async()=>{const health=await(await fetch('http://127.0.0.1:47632/health',{signal:AbortSignal.timeout(2000)})).json();return health.ready;},60000);
  await command({command:'setInterfaceLocale',locale:'en'});
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await check('Portable project opens in the release editor',async()=>{const s=await command({command:'openProject',projectDir:gameDir,tab:'scenes'});assert.equal(s.projectDir,gameDir);await shot('editor-project');});
  await command({command:'enterPlaytest'});await command({command:'playtest.reset'});await pause(300);
  await check('Five connected spaces, real pickup and visible bridge repair',async()=>{
    await act('Entrer aux archives');await act('Étudier le plan hydraulique');await act('Prendre la goupille de bronze');
    assert((await state()).inventoryItemIds.includes('pin'));await shot('pin-picked-up');await act('Revenir au cloître');
    await act('Descendre vers le moulin');await act('Prendre l’étai de chêne');await act('Remonter au cloître');
    const inventoryToggle=await cdp.value(`[...document.querySelectorAll('button')].find(e=>(e.getAttribute('aria-label')??'').startsWith('Open inventory'))?.getAttribute('aria-label')`);
    if(inventoryToggle)await pressButton(inventoryToggle);
    await pressButton('Étai de chêne');await act('Étayer la passerelle');
    assert.equal((await state()).sceneId,'courtyard-braced');await shot('bridge-repaired');
  });
  await check('Evacuation through conversation and two actual bell inputs',async()=>{
    await act('Entrer dans l’infirmerie');await act('Parler à Ondine');await act('Parler à Sabine');await act('Revenir au cloître');await act('Tirer la corde de cloche');
    assert.equal((await state()).flags.evacuated,false);await act('Tirer la corde de cloche');assert.equal((await state()).flags.evacuated,true);
  });
  await check('Native inventory placement and successful repair route',async()=>{
    await act('Entrer au local des vannes');
    const toggle=await cdp.value(`[...document.querySelectorAll('button')].find(e=>(e.getAttribute('aria-label')??'').startsWith('Open inventory'))?.getAttribute('aria-label')`);if(toggle)await pressButton(toggle);
    await pressButton('Goupille de bronze');await act('Insérer la goupille dans l’axe');await act('Fermer la vanne d’admission');await act('Ouvrir l’exutoire droit');
    assert.equal((await state()).sceneId,'sluice-drained');assert.equal((await state()).flags.resolved,true);await shot('repair-complete');
    await act('Revenir au cloître');await act('Entrer dans l’infirmerie');await act('Parler à Ondine');assert.equal((await state()).sceneId,'ward-evacuated');await shot('ward-evacuated');
  });
  await check('Official export from the actual Windows editor',async()=>{
    const destinationPath=path.join(outDir,'official-web-export');const exported=await command({command:'exportProject',format:'web',mode:'preview',destinationPath});
    assert.equal(exported.export.validationReport.valid,true);assert(fs.existsSync(path.join(destinationPath,'build-manifest.json')));fs.writeFileSync(path.join(outDir,'app-export-result.json'),JSON.stringify(exported,null,2));
  });
  result.passed=true;
}catch(e){result.errors.push(String(e.stack??e));if(cdp)try{await shot('failure');}catch{}}
finally{
  result.executableSha256=crypto.createHash('sha256').update(fs.readFileSync(exe)).digest('hex');
  result.asarSha256=crypto.createHash('sha256').update(fs.readFileSync(path.join(payloadDir,'resources/app.asar'))).digest('hex');
  cdp?.close();if(proc.pid)spawnSync('taskkill.exe',['/PID',String(proc.pid),'/T','/F'],{windowsHide:true,timeout:15000});fs.closeSync(log);
  fs.writeFileSync(path.join(outDir,'last-kindness-result.json'),JSON.stringify(result,null,2));
}
function Cdp(url){this.pending=new Map();this.id=0;this.connect=async()=>{this.socket=new WebSocket(url);this.socket.addEventListener('message',({data})=>{const m=JSON.parse(data),p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);});await new Promise((r,j)=>{this.socket.addEventListener('open',r,{once:true});this.socket.addEventListener('error',j,{once:true});});};this.send=(method,params={})=>new Promise((resolve,reject)=>{const id=++this.id;const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(method+' timed out'));},15000);this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({id,method,params}));});this.value=async(expression)=>{const x=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(x.exceptionDetails)throw new Error(JSON.stringify(x.exceptionDetails));return x.result.value;};this.close=()=>this.socket?.close();}
