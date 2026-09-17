import { describe, expect, it } from 'vitest';
import { createPlayerController, type PlayerController } from '@mage2/player';
import { createSaveEnvelope, loadSaveForProject, validateProject, assessProjectReadiness, resolveHotspotInventoryAction } from '@mage2/schema';
// Authored game source compiles to existing native schema; no separate runner.
import { createLastKindnessProject } from '../games/the-last-kindness/content.mjs';

const project=createLastKindnessProject();
const make=()=>createPlayerController(project);
function finish(p:PlayerController) {
  let guard=0;
  while(p.getSnapshot().activeDialogue) {
    if(++guard>40) throw new Error('Dialogue failed to end');
    if(p.getSnapshot().activeDialogue!.choices.length) throw new Error('A real choice must be selected');
    p.continueDialogue();
  }
}
function visible(p:PlayerController,key:string) { return p.getVisibleHotspots(0).filter(h=>h.id.includes(`::${key}::`)); }
function click(p:PlayerController,key:string,drain=true) {
  expect(p.getSnapshot().activeDialogue,`Close conversation before ${key}`).toBeUndefined();
  const hits=visible(p,key);expect(hits,`Exactly one ${key} in ${p.getSnapshot().scene.id}`).toHaveLength(1);
  const result=p.selectHotspot(hits[0].id,0);if(drain)finish(p);return result;
}
function choose(p:PlayerController,key:string,drain=true) {
  const candidates=p.getSnapshot().activeDialogue!.choices.filter(c=>c.id.includes(`.${key}::`));
  expect(candidates).toHaveLength(1);p.chooseDialogueChoice(candidates[0].id);if(drain)finish(p);
}
function getBrace(p:PlayerController) { click(p,'courtyard_mill');click(p,'brace_pickup');click(p,'mill_exit'); }
function getPin(p:PlayerController,proof=false) { click(p,'courtyard_archive');click(p,'archive_plan');if(proof)click(p,'archive_records');click(p,'pin_pickup');click(p,'archive_exit'); }
function brace(p:PlayerController) { getBrace(p);click(p,'bridge_place');expect(p.getSnapshot().scene.id).toBe('courtyard-braced'); }
function ready(p:PlayerController) { click(p,'courtyard_ward');click(p,'ondine');click(p,'sabine');click(p,'ward_exit'); }
function evacuate(p:PlayerController) { brace(p);ready(p);click(p,'bell');click(p,'bell'); }
function repair(p:PlayerController) { click(p,'courtyard_sluice');click(p,'pin_place');click(p,'intake');click(p,'outlet'); }
function consent(p:PlayerController) {
  click(p,'courtyard_archive');click(p,'archive_records');click(p,'archive_exit');
  click(p,'courtyard_mill');click(p,'mael',false);choose(p,'diversion',false);choose(p,'accept');click(p,'mill_exit');
}
function restore(p:PlayerController) {
  const envelope=createSaveEnvelope(project,p.save());
  const loaded=loadSaveForProject(JSON.stringify(envelope),project);
  expect(loaded.status).toBe('compatible');
  if(loaded.status!=='compatible') throw new Error(JSON.stringify(loaded));
  return createPlayerController(project,loaded.saveState);
}

describe('The Last Kindness / native Saint-Orme gameplay',()=>{
  it('passes the real schema and reference validator without issues',()=>{
    expect(validateProject(project)).toEqual({valid:true,issues:[]});
    expect(assessProjectReadiness(project).blockers).toEqual([]);
  });
  it('does not present duplicated hotspot branches simultaneously',()=>{
    const p=make();const names=p.getVisibleHotspots(0).map(h=>h.name);expect(new Set(names).size).toBe(names.length);
  });
  it('labels the occupied and empty beds according to their actual scene state',()=>{
    const label=(id:string)=>{
      const h=project.scenes.items.find(s=>s.id===id)!.hotspots.find(h=>h.id.includes('::ward_patients::'))!;
      return project.strings.byLocale.fr[h.commentTextId!];
    };
    expect(label('ward')).toBe('Examiner les brancards');
    expect(label('ward-evacuated')).toBe('Examiner les lits vides');
  });
  it('integrates the fitted pin into its scene and keeps it fitted on revisits and saves',()=>{
    let p=make();getPin(p);click(p,'courtyard_sluice');click(p,'pin_place');
    expect(p.getSnapshot().scene.id).toBe('sluice-pinned');
    expect(p.save().inventory).not.toContain('pin');
    expect(visible(p,'pin_installed')[0].inventoryItemId).toBeUndefined();
    expect(visible(p,'pin_place')).toHaveLength(0);
    p=restore(p);click(p,'sluice_exit');click(p,'courtyard_sluice');
    expect(p.getSnapshot().scene.backgroundAssetId).toBe('art_sluice-pinned');
  });
  it('preserves the fitted pin appearance when the player later chooses diversion',()=>{
    const p=make();getPin(p);click(p,'courtyard_sluice');click(p,'pin_place');click(p,'sluice_exit');
    consent(p);evacuate(p);click(p,'courtyard_mill');click(p,'divert');click(p,'mill_exit');click(p,'courtyard_sluice');
    expect(p.getSnapshot().scene.id).toBe('sluice-diverted-pinned');
    expect(visible(p,'pin_installed')[0].inventoryItemId).toBeUndefined();
    expect(p.getSnapshot().variables.water_route).toBe('divert');
  });
  it.each(['pin-first','rescue-first'])('preserves the mill through repair, %s',order=>{
    const p=make();if(order==='pin-first')getPin(p);evacuate(p);if(order==='rescue-first')getPin(p);repair(p);
    expect(p.getSnapshot().variables).toMatchObject({resolved:true,water_route:'repair',evacuated:true,pin_fitted:true,intake_closed:true});
    expect(p.getSnapshot().scene.id).toBe('sluice-drained');expect(p.getRuntimeIssues()).toEqual([]);
    click(p,'sluice_exit');click(p,'courtyard_ward');expect(p.getSnapshot().scene.id).toBe('ward-evacuated');
    click(p,'ondine');expect(p.getSnapshot().variables.aftermath_seen).toBe(true);
  });
  it.each(['consent-first','rescue-first'])('allows the physical diversion without acquiring the pin, %s',order=>{
    const p=make();if(order==='consent-first')consent(p);evacuate(p);if(order==='rescue-first')consent(p);
    click(p,'courtyard_mill');click(p,'divert');expect(p.getSnapshot().scene.id).toBe('mill-flooded');
    expect(p.getSnapshot().variables).toMatchObject({resolved:true,water_route:'divert',pin_taken:false,owner_consent:true});
    click(p,'mill_exit');click(p,'courtyard_ward');click(p,'ondine');expect(p.getSnapshot().variables.aftermath_seen).toBe(true);
    expect(p.getRuntimeIssues()).toEqual([]);
  });
  it('refuses the bell before the crossing and porters are ready',()=>{
    const p=make();click(p,'bell');expect(p.getSnapshot().variables).toMatchObject({bell_stage:0,evacuated:false});
    brace(p);click(p,'bell');expect(p.getSnapshot().variables.bell_stage).toBe(0);
  });
  it('resumes an interrupted signal through a real native save envelope',()=>{
    let p=make();brace(p);ready(p);click(p,'bell');expect(p.getSnapshot().variables.bell_stage).toBe(1);
    p=restore(p);click(p,'bell');expect(p.getSnapshot().variables).toMatchObject({bell_stage:2,evacuated:true});
    const state=p.save();click(p,'bell');expect(p.save()).toEqual(state);
  });
  it('preserves an in-progress conversation through save/load',()=>{
    let p=make();click(p,'courtyard_ward');click(p,'ondine',false);p.continueDialogue();
    const node=p.getSnapshot().activeDialogue!.node.id;p=restore(p);expect(p.getSnapshot().activeDialogue!.node.id).toBe(node);finish(p);
    expect(p.getSnapshot().variables.met_ondine).toBe(true);
  });
  it('hides a picked-up sprite and does not duplicate the reward',()=>{
    const p=make();click(p,'courtyard_archive');const id=visible(p,'pin_pickup')[0].id;click(p,'pin_pickup');
    expect(visible(p,'pin_pickup')).toHaveLength(0);p.selectHotspot(id,0);expect(p.save().inventory).toEqual(['pin']);
    click(p,'archive_exit');click(p,'courtyard_archive');expect(visible(p,'pin_pickup')).toHaveLength(0);
  });
  it('keeps an empty-hand inspection target before a placement item is acquired',()=>{
    const p=make();expect(visible(p,'bridge_place')).toHaveLength(0);
    const result=click(p,'bridge_place_inspect');expect(result.response?.entry.kind).toBe('text');
    expect(p.getSnapshot().variables.bridge_braced).toBe(false);
  });
  it('wrong-item and empty-hand events cannot consume either item or repair the bridge',()=>{
    const p=make();getPin(p);getBrace(p);const h=visible(p,'bridge_place')[0];
    expect(resolveHotspotInventoryAction(h).type).toBe('placeItem');
    const before=p.save();const empty=p.selectHotspotEvent(h.id,'click',0);const wrong=p.selectHotspotEvent(h.id,'otherItem',0);
    expect(empty.response?.entry.id).toBe('bridge_place_empty');expect(wrong.response?.entry.id).toBe('bridge_place_wrong');
    expect(p.save()).toEqual(before);
  });
  it('cannot release the outlet before evacuation or before the intake closes',()=>{
    const p=make();getPin(p);click(p,'courtyard_sluice');click(p,'pin_place');click(p,'outlet');expect(p.getSnapshot().variables.resolved).toBe(false);
    click(p,'intake');click(p,'outlet');expect(p.getSnapshot().variables.resolved).toBe(false);
  });
  it('cannot divert without consent even after the patients are safe',()=>{
    const p=make();evacuate(p);click(p,'courtyard_mill');click(p,'divert');expect(p.getSnapshot().variables.water_route).toBe('pending');
  });
  it('cannot divert before evacuation even after consent',()=>{
    const p=make();consent(p);click(p,'courtyard_mill');click(p,'divert');expect(p.getSnapshot().variables.resolved).toBe(false);
  });
  it('follows native conversation links through the evidence and consent branch',()=>{
    const p=make();click(p,'courtyard_mill');click(p,'mael',false);choose(p,'diversion',false);
    expect(p.getSnapshot().activeDialogue!.node.textId).toBe('mael_proof_needed.0.text');finish(p);
    expect(p.getSnapshot().variables.owner_consent).toBe(false);
  });
  it('may preserve the mill after obtaining permission to sacrifice it',()=>{
    const p=make();consent(p);getPin(p);evacuate(p);repair(p);
    expect(p.getSnapshot().variables.water_route).toBe('repair');click(p,'sluice_exit');click(p,'courtyard_mill');click(p,'divert');
    expect(p.getSnapshot().variables.water_route).toBe('repair');expect(p.getSnapshot().scene.id).toBe('mill');
  });
  it('does not retroactively turn a diversion into a repair',()=>{
    const p=make();consent(p);getPin(p);evacuate(p);click(p,'courtyard_mill');click(p,'divert');click(p,'mill_exit');click(p,'courtyard_sluice');
    expect(p.getSnapshot().scene.id).toBe('sluice-diverted');click(p,'outlet');expect(p.getSnapshot().variables.water_route).toBe('divert');
  });
  it('restores a complex partial repair and preserves physical consequences',()=>{
    let p=make();getPin(p);brace(p);click(p,'courtyard_sluice');click(p,'pin_place');click(p,'intake');
    const before=p.save();p=restore(p);expect(p.save()).toEqual(before);expect(visible(p,'pin_place')).toHaveLength(0);
    click(p,'sluice_exit');expect(p.getSnapshot().scene.id).toBe('courtyard-braced');ready(p);click(p,'bell');click(p,'bell');click(p,'courtyard_sluice');click(p,'outlet');
    expect(p.getSnapshot().variables.resolved).toBe(true);
  });
  it('only reveals progressive hints on an explicit request and never solves the puzzle',()=>{
    const p=make();click(p,'courtyard_ward');click(p,'journal',false);choose(p,'hints',false);choose(p,'crossing',false);
    expect(p.getSnapshot().activeDialogue!.node.textId).toBe('hint_cross_1.text');choose(p,'more',false);
    expect(p.getSnapshot().activeDialogue!.node.textId).toBe('hint_cross_2.text');choose(p,'more',false);
    expect(p.getSnapshot().activeDialogue!.node.textId).toBe('hint_cross_3.text');choose(p,'close');
    expect(p.getSnapshot().variables).toMatchObject({bridge_braced:false,evacuated:false,resolved:false});
  });
  it('journal hides unestablished evidence and consequences',()=>{
    const p=make();click(p,'courtyard_ward');click(p,'journal',false);
    const ids=p.getSnapshot().activeDialogue!.choices.map(c=>c.textId);expect(ids).not.toContain('journal.fraud.text');expect(ids).not.toContain('journal.result.text');
  });
  it('gives Ondine an independent response to the dreams',()=>{
    const p=make();getPin(p);evacuate(p);repair(p);click(p,'sluice_exit');click(p,'courtyard_ward');click(p,'ondine');click(p,'ondine',false);choose(p,'tell',false);
    expect(p.getSnapshot().activeDialogue!.node.textId).toBe('dream_tell.0.text');p.continueDialogue();
    expect(project.strings.byLocale.fr[p.getSnapshot().activeDialogue!.node.textId]).toContain('sans avoir à m’écouter');finish(p);
    expect(p.getSnapshot().variables.dream_discussed).toBe(true);
  });
});
