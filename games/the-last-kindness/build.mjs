import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateProject, assessProjectReadiness } from '@mage2/schema';
import { createLastKindnessProject, ENGINE_REVISION, MEDIA } from './content.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root,'output/the-last-kindness');
const projectDir = path.join(output,'editable-project');
const p=createLastKindnessProject();
await fs.mkdir(path.join(projectDir,'media'),{recursive:true});
const provenance=[];
for(const name of MEDIA) {
  const source=path.join(output,'source-media',name+'.png');
  const bytes=await fs.readFile(source); // Missing art is a build failure, never a silent placeholder.
  if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error(`Not a PNG: ${source}`);
  const variant=p.assets.assets.find(a=>a.id===`art_${name}`).variants.fr;
  variant.width=bytes.readUInt32BE(16);variant.height=bytes.readUInt32BE(20);
  variant.sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  for(const a of p.assets.assets) for(const other of Object.values(a.variants)) {
    if(other.sourcePath===variant.sourcePath)Object.assign(other,{width:variant.width,height:variant.height,sha256:variant.sha256});
  }
  await fs.copyFile(source,path.join(projectDir,'media',name+'.png'));
  provenance.push({file:`media/${name}.png`,sha256:variant.sha256,bytes:bytes.length,width:variant.width,height:variant.height,source:'OpenAI built-in ImageGen',status:'integrated static artwork; no performance claim'});
}
const validation=validateProject(p);
if(!validation.valid) throw new Error(JSON.stringify(validation,null,2));
for(const [key,file] of Object.entries({manifest:'project',assets:'assets',locations:'locations',scenes:'scenes',dialogues:'dialogues',inventory:'inventory',strings:'strings'})) {
  await fs.writeFile(path.join(projectDir,`${file}.json`),JSON.stringify(p[key],null,2)+'\n');
}
await fs.mkdir(path.join(output,'evidence'),{recursive:true});
await fs.writeFile(path.join(output,'evidence/project-validation.json'),JSON.stringify({engineRevision:ENGINE_REVISION,validation,engineReadiness:assessProjectReadiness(p),productionQualityGate:'NOT PASSED: no performed footage, voices, music or human duration evidence'},null,2));
await fs.writeFile(path.join(output,'evidence/media-manifest.json'),JSON.stringify(provenance,null,2));
console.log(JSON.stringify({projectDir,scenes:p.scenes.items.length,dialogues:p.dialogues.items.length,nodes:p.dialogues.items.reduce((n,d)=>n+d.nodes.length,0),hotspots:p.scenes.items.reduce((n,s)=>n+s.hotspots.length,0),assets:provenance.length,validation},null,2));
