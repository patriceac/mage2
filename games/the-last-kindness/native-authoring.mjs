// Compile authoring conveniences to the existing MAGE2 schema. No runtime changes.
// Schema 16 limits conditional nesting; choice effects cannot switch dialogue trees.
// Spatial actions become mutually exclusive native hotspots. Conversation links
// become real nextNodeId links within each tree, preserving the official UI flow.
const negate = c => {
  if(c.type==='variableCompare') return {...c,operator:c.operator==='equals'?'notEquals':c.operator==='notEquals'?'equals':(()=>{throw new Error('Unsupported authored comparison');})()};
  if(c.type==='inventoryHas') return {...c,present:c.present===false};
  throw new Error(`Cannot invert ${c.type}`);
};
function conjunctions(conditions, mode, passed) {
  if((mode==='all')===passed) return [conditions.map(c=>passed?c:negate(c))];
  // Disjoint alternatives: first failing/passing condition wins.
  return conditions.map((c,i)=>[...conditions.slice(0,i).map(x=>passed?negate(x):x),passed?c:negate(c)]);
}
function expand(effects,conditions=[]) {
  const index=effects.findIndex(e=>e.type==='conditional');
  if(index<0) return [{effects,conditions}];
  const e=effects[index];
  if(index>0 && effects.slice(0,index).some(x=>x.type==='setVariable'||x.type==='changeVariable')) throw new Error('Do not branch on a state mutated in the same authored action');
  return [true,false].flatMap(passed=>conjunctions(e.conditions,e.conditionMode??'all',passed).flatMap(test=>expand([...effects.slice(0,index),...(passed?e.thenEffects:e.elseEffects),...effects.slice(index+1)],[...conditions,...test])));
}
function possible(conditions) {
  const equal=new Map();
  for(const c of conditions) if(c.type==='variableCompare'&&c.operator==='equals') {
    if(equal.has(c.variableId)&&equal.get(c.variableId)!==c.value) return false;
    equal.set(c.variableId,c.value);
  }
  return !conditions.some(c=>c.type==='variableCompare'&&c.operator==='notEquals'&&equal.has(c.variableId)&&equal.get(c.variableId)===c.value);
}
export function compileNativeAuthoring(project) {
  const originals=new Map(project.dialogues.items.map(d=>[d.id,d]));
  project.dialogues.items=project.dialogues.items.map(root=>{
    const pending=[root.id],seen=new Set(),nodes=[];
    while(pending.length) {
      const treeId=pending.shift();if(seen.has(treeId))continue;seen.add(treeId);
      const tree=originals.get(treeId);if(!tree)throw new Error(`Unknown dialogue ${treeId}`);
      const prefix=id=>`${root.id}::${id}`;
      for(const node of tree.nodes) {
        const copy={...node,id:prefix(node.id),...(node.nextNodeId?{nextNodeId:prefix(node.nextNodeId)}:{})};
        copy.choices=node.choices.flatMap(choice=>expand(choice.effects,choice.conditions).filter(x=>possible(x.conditions)).map((branch,i)=>{
          const cross=branch.effects.findIndex(e=>e.type==='playDialogue');
          const c={...choice,id:prefix(choice.id)+`::${i}`,conditions:branch.conditions,effects:branch.effects};
          if(cross>=0) {
            if(cross!==branch.effects.length-1)throw new Error('Dialogue launch must end a choice action');
            const target=originals.get(branch.effects[cross].dialogueTreeId);if(!target)throw new Error('Missing target');
            pending.push(target.id);c.nextNodeId=prefix(target.startNodeId);c.effects=branch.effects.slice(0,cross);
          } else if(choice.nextNodeId)c.nextNodeId=prefix(choice.nextNodeId);
          return c;
        }));
        nodes.push(copy);
      }
    }
    return {...root,startNodeId:`${root.id}::${root.startNodeId}`,nodes};
  });
  for(const scene of project.scenes.items) {
    // The same authored interaction can have different labels in each scene state.
    // A shared text id would make the last state overwrite the earlier one.
    for(const h of scene.hotspots) {
      h.commentTextId=`hotspot.${scene.id}.${h.id}.label`;
      project.strings.byLocale[project.manifest.defaultLanguage][h.commentTextId]=h.name;
    }
    const additions=[];
    for(const h of scene.hotspots) if(h.placedInventoryItemId) {
      additions.push({...h,id:h.id+'_inspect',placedInventoryItemId:undefined,placedInventoryGeometry:undefined,effects:h.clickEvent.effects,response:h.clickEvent.response,clickEvent:undefined,conditions:[...h.conditions,{type:'inventoryHas',itemId:h.placedInventoryItemId,present:false}]});
    }
    scene.hotspots=[...scene.hotspots,...additions].flatMap(h=>expand(h.effects,h.conditions).filter(b=>possible(b.conditions)).map((b,i)=>({...h,id:`${scene.id}::${h.id}::${i}`,conditions:b.conditions,effects:b.effects})));
    const owns=new Set();
    const visit=value=>{
      if(!value||typeof value!=='object')return;
      if(value.type==='playDialogue')owns.add(value.dialogueTreeId);
      if(value.dialogueTreeId)owns.add(value.dialogueTreeId);
      for(const v of Object.values(value))if(typeof v==='object')visit(v);
    };
    visit(scene.hotspots);visit(scene.onEnterEffects);
    scene.dialogueTreeIds=[...owns];
  }
  return project;
}
