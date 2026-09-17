import { it, expect, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseProjectBundle } from '@mage2/schema';
// Exercise the actual exporter with the actual packaged runtime. Only the
// Electron process-context probe is supplied; no UI or player behavior is mocked.
vi.mock('electron',()=>({app:{isPackaged:true}}));
import { exportProjectBundle } from '../apps/editor/electron/exporter';

it.skipIf(process.env.LAST_KINDNESS_EXPORT !== '1')('exports the checkpoint through the official MAGE2 exporter',async()=>{
  const root=path.resolve('output/the-last-kindness/editable-project');
  const bundle:any={};
  for(const [key,file] of Object.entries({manifest:'project',assets:'assets',locations:'locations',scenes:'scenes',dialogues:'dialogues',inventory:'inventory',strings:'strings'}))bundle[key]=JSON.parse(await fs.readFile(path.join(root,`${file}.json`),'utf8'));
  // Project loading normally resolves stored relative paths before export.
  for(const a of bundle.assets.assets)for(const v of Object.values(a.variants) as any[])v.sourcePath=path.join(root,v.sourcePath);
  const previous=Object.getOwnPropertyDescriptor(process,'resourcesPath');
  Object.defineProperty(process,'resourcesPath',{configurable:true,value:path.resolve('output/packaging/editor-win/dist/win-unpacked/resources')});
  try {
    const result=await exportProjectBundle(root,parseProjectBundle(bundle),{mode:'preview'});
    expect(result.validationReport.valid).toBe(true);
    expect(await fs.stat(path.join(result.outputDirectory,'index.html'))).toMatchObject({});
    await fs.writeFile('output/the-last-kindness/evidence/official-export.json',JSON.stringify({method:'official exportProjectBundle; packaged runtime resources; Electron context supplied by integration test, not Windows UI verification',...result},null,2));
  } finally { if(previous)Object.defineProperty(process,'resourcesPath',previous);else delete (process as any).resourcesPath; }
},120000);
