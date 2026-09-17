import { createDefaultProjectBundle, parseProjectBundle, CURRENT_SCHEMA_VERSION } from '@mage2/schema';
import { compileNativeAuthoring } from './native-authoring.mjs';

export const ENGINE_REVISION = '0532ea6d41f1df852caee6a0d0ddb601f3381e0b';
export const MEDIA = ['courtyard', 'courtyard-braced', 'sluice', 'sluice-pinned', 'sluice-drained', 'sluice-diverted', 'sluice-diverted-pinned', 'ward', 'ward-evacuated', 'archive', 'mill', 'mill-flooded', 'pin', 'brace'];

/** Native schema-16 authoring. This file does not implement a game engine. */
export function createLastKindnessProject() {
  const p = createDefaultProjectBundle('The Last Kindness');
  const strings = { ...(p.strings.byLocale.fr ?? {}) };
  p.strings = { schemaVersion: CURRENT_SCHEMA_VERSION, byLocale: { fr: strings }, translationStateByLocale: { fr: {} } };
  Object.assign(p.manifest, {
    projectId: 'the-last-kindness-saint-orme-checkpoint', defaultLanguage: 'fr', supportedLocales: ['fr'],
    gameVersion: '0.1.0-checkpoint.1', saveCompatibilityVersion: 1, assetRoots: ['media'],
    startSceneId: 'courtyard', startLocationId: 'saint-orme',
    playerPresentation: { titleScreenEnabled: true, titleBackgroundAssetId: 'art_title', titleLayout: 'left',
      overlayTone: 'dark', fontPreset: 'cinematic', accentColor: '#d5b486', creatorName: 'The Last Kindness',
      websiteUrl: '', taglineTextId: 'title.tagline', creditsTextId: 'title.credits', showLandscapeHintInPortrait: true }
  });
  strings['title.tagline'] = 'Saint-Orme · section de production inachevée\nDécors et énigme jouables. Performances et voix encore absentes.';
  strings['title.credits'] = 'Histoire, écriture et production : création pour Patrice avec Codex. Images originales : ImageGen. Moteur : MAGE2, révision 0532ea6. Ce chantier ne constitue ni le jeu complet ni une démonstration de durée. Aucun acteur réel imité. Voir les documents de provenance et de validation inclus.';
  const booleans = ['introduced', 'met_ondine', 'protocol_known', 'plan_read', 'gauge_read', 'records_found', 'owner_consent', 'brace_taken', 'bridge_braced', 'pin_taken', 'pin_fitted', 'evacuation_ready', 'evacuated', 'intake_closed', 'resolved', 'water_announced', 'aftermath_seen', 'dream_discussed'];
  p.manifest.variables = booleans.map(id => ({ id, name: id, type: 'boolean', initialValue: false, system: false, description: `Saint-Orme / ${id}` }));
  p.manifest.variables.push({ id: 'bell_stage', name: 'Signal d’évacuation', type: 'integer', initialValue: 0, system: false, description: '0 = repos, 1 = porteurs prêts, 2 = traversée achevée' });
  p.manifest.variables.push({ id: 'water_route', name: 'Sort réservé au moulin', type: 'choice', initialValue: 'pending', system: false, description: 'Conséquence persistante de la résolution hydraulique', options: [{id:'pending',name:'Indécis'},{id:'repair',name:'Moulin préservé'},{id:'divert',name:'Moulin sacrifié, dette reconnue'}] });
  p.assets.assets = MEDIA.map(id => ({ id: `art_${id}`, name: id, kind: 'image', category: ['pin','brace'].includes(id) ? 'inventory' : 'background', provenance: { source: 'creator' }, variants: { fr: { sourcePath: `media/${id}.png`, importedAt: '2026-09-17T00:00:00.000Z', width: ['pin','brace'].includes(id) ? 1024 : 1672, height: ['pin','brace'].includes(id) ? 1024 : 941 } } }));
  // Schema 16 gives title artwork a separate asset role. Reuse the same source file.
  p.assets.assets.push({...structuredClone(p.assets.assets[0]),id:'art_title',name:'Saint-Orme — écran titre',category:'player'});
  p.scenes.items = [];
  p.dialogues.items = [];
  p.dialogues.responseGroups = [];
  p.inventory.items = [];
  const str = (id, text) => { strings[id] = text; return id; };
  const eq = (id, value = true) => ({ type:'variableCompare', variableId:id, operator:'equals', value });
  const set = (id, value = true) => ({ type:'setVariable', variableId:id, value });
  const go = sceneId => ({ type:'goToScene', sceneId });
  const talk = dialogueTreeId => ({ type:'playDialogue', dialogueTreeId });
  const iff = (conditions, thenEffects, elseEffects = []) => ({ type:'conditional', conditionMode:'all', conditions, thenEffects, elseEffects });
  const has = itemId => ({ type:'inventoryHas', itemId });
  function dialogue(id, lines, finalEffects = []) {
    const nodes = lines.map(([speaker,text], i) => ({ id:`${id}.${i}`, speaker, textId:str(`${id}.${i}.text`,text), effects:i === lines.length-1 ? finalEffects : [], choices:[], ...(i+1 < lines.length ? {nextNodeId:`${id}.${i+1}`} : {}) }));
    p.dialogues.items.push({id,name:id,startNodeId:nodes[0].id,nodes});
    return id;
  }
  function menu(id, speaker, text, choices, tail = []) {
    const nodes = [{ id:`${id}.start`, speaker, textId:str(`${id}.text`,text), effects:[], choices:choices.map(([key,label,effects = [],conditions = [], nextNodeId])=>({ id:`${id}.${key}`,textId:str(`${id}.${key}.text`,label),effects,conditions,...(nextNodeId?{nextNodeId}:{}) })) },...tail];
    p.dialogues.items.push({id,name:id,startNodeId:nodes[0].id,nodes});
  }
  function response(id,text) {
    p.dialogues.responseGroups.push({id:`group_${id}`,name:id,entries:[{id,kind:'text',textId:str(`response.${id}`,text)}]});
    return {type:'entry',entryId:id};
  }
  function hot(id,name,box,effects = [],extra = {}) {
    return {id,name,x:box[0],y:box[1],width:box[2],height:box[3],startMs:0,endMs:30000,timingMode:'sceneDuration',conditions:[],effects,...extra};
  }
  const returnCourt = () => iff([eq('bridge_braced')],[go('courtyard-braced')],[go('courtyard')]);
  const returnSluice = () => iff([eq('resolved')],[iff([eq('water_route','divert')],[iff([eq('pin_fitted')],[go('sluice-diverted-pinned')],[go('sluice-diverted')])],[go('sluice-drained')])],[iff([eq('pin_fitted')],[go('sluice-pinned')],[go('sluice')])]);
  const returnWard = () => iff([eq('evacuated')],[go('ward-evacuated')],[go('ward')]);
  const returnMill = () => iff([eq('water_route','divert')],[go('mill-flooded')],[go('mill')]);
  function scene(id,name,hotspots,onEnterEffects = []) {
    p.scenes.items.push({id,name,locationId:'saint-orme',backgroundAssetId:`art_${id}`,hotspots,dialogueTreeIds:[],onEnterEffects,onExitEffects:[],onMediaEndEffects:[],sceneAudioLoop:false,sceneAudioDelayMs:0,backgroundVideoLoop:false,videoAudioMode:'silent'});
  }
  function pickup(id,name,box,itemId,flag,copy) {
    return hot(id,name,box,[{type:'addItem',itemId},set(flag)],{inventoryItemId:itemId,conditions:[eq(flag,false)],response:response(`${id}_reply`,copy)});
  }
  function placement(id,name,box,itemId,flag,success,empty,wrong,effects = [],extra = {}) {
    return hot(id,name,box,[{type:'removeItem',itemId},set(flag),...effects],{placedInventoryItemId:itemId,conditions:[eq(flag,false)],response:response(`${id}_ok`,success),clickEvent:{effects:[],response:response(`${id}_empty`,empty)},otherItemEvent:{effects:[],response:response(`${id}_wrong`,wrong)},...extra});
  }
  for (const [id,name,description] of [
    ['pin','Goupille de bronze','Une clavette conique, assez résistante pour transmettre l’effort du volant. Son extrémité porte des traces d’usage.'],
    ['brace','Étai de chêne','Un étai de chêne avec deux planches, des coins et ses liens. Il peut soutenir la passerelle sans bloquer le courant.']
  ]) p.inventory.items.push({id,name,textId:str(`item.${id}.name`,name),descriptionTextId:str(`item.${id}.description`,description),imageAssetId:`art_${id}`});

  dialogue('arrival',[
    ['Tancrede','La femme qui dirige les porteurs… Ian, je l’ai déjà vue.'],
    ['Ian d’Au-Delà-Des-Monts','Alors vous savez peut-être où elle veut que vous posiez vos mains. Nous avons l’air remarquablement inutiles.'],
    ['Ondine, depuis l’infirmerie','Vous deux ! Si vous pouvez marcher, vous pouvez aider. Mais personne ne touche aux vannes tant que mes malades sont ici.'],
    ['Carnet','Objectif : sécuriser le passage des brancards, organiser l’évacuation et rétablir l’écoulement. Les lieux peuvent être explorés dans l’ordre choisi. Le registre de l’infirmerie conserve les faits et propose des indices facultatifs.']
  ]);
  dialogue('ondine_first',[
    ['Ondine','Tancrede ? On vous a décrit plus grand. Et beaucoup plus mort.'],
    ['Tancrede','Je peux vous conduire à l’abri.'],
    ['Ondine','Moi, oui. Eux, non. Sabine a trois patients qu’on ne peut pas porter dans l’eau. Je cherche un passage pour eux, pas une escorte pour moi.'],
    ['Tancrede','Dites-moi où commencer.'],
    ['Ondine','La passerelle a cédé. Maël conserve de quoi l’étayer près du moulin. Ensuite Sabine organisera les porteurs. Les archives expliquent les vannes ; la pierre du canal vous dira ce qui se passe réellement.']
  ],[set('met_ondine'),set('protocol_known')]);
  dialogue('ondine_again',[
    ['Ondine','Le passage, les porteurs, l’eau : trois problèmes différents. Nous pouvons travailler en parallèle.'],
    ['Tancrede','Et si le mécanisme ne peut pas être réparé ?'],
    ['Ondine','L’ancien déversoir du moulin évacuerait l’eau. Mais les sacs de Maël prendraient tout. Allez lui parler avant de décider à sa place.']
  ]);
  dialogue('sabine_unready',[
    ['Sabine','J’ai déjà perdu un porteur dans ce canal. Quand le bois tiendra, je préparerai les brancards. Pas avant.']
  ]);
  dialogue('sabine_ready',[
    ['Sabine','L’étai tient ? Alors je rassemble les porteurs. Une sonnerie : ils se mettent en place. La seconde : ils traversent.'],
    ['Tancrede','Et si je dois m’interrompre ?'],
    ['Sabine','Ils attendront mon signe. Ce sont des êtres humains, pas des rouages. Revenez finir le signal quand vous serez prêt.']
  ],[set('evacuation_ready'),set('protocol_known')]);
  dialogue('sabine_done', [['Sabine','Tous sont dans la salle haute. Vous pouvez agir sur l’eau. Je reste ici vérifier les couvertures.']]);
  dialogue('plan',[
    ['Tancrede','Le tracé bleu rejoint la rivière par l’exutoire de droite. La grande roue de gauche commande l’admission.'],
    ['Note du maître des eaux','Fermer l’admission AVANT d’ouvrir l’exutoire. Sans la goupille de bronze, le volant tourne sur son axe. La goupille de rechange reste sur cette table.'],
    ['Tancrede','Le déversoir du moulin contourne les deux vannes. Il sauverait l’abbaye, mais sacrifierait le stock du meunier. Ce n’est pas un passage gratuit.']
  ],[set('plan_read')]);
  dialogue('gauge',[
    ['Tancrede','Trois entailles dans la pierre. L’eau dépasse la marque qui protège l’infirmerie.'],
    ['Ian d’Au-Delà-Des-Monts','Les pierres font d’excellents témoins. Elles ont rarement une carrière à préserver.'],
    ['Tancrede','La pluie n’explique pas tout. Le canal du moulin a été barré récemment. Il doit exister une trace de cette décision.']
  ],[set('gauge_read')]);
  dialogue('gauge_low',[['Tancrede','L’eau reste sous la marque basse. Les pierres récemment découvertes sont encore humides : la décrue est réelle.']]);
  dialogue('records',[
    ['Tancrede','Le registre ordonne de barrer l’ancien déversoir « au nom du prince ». La date est postérieure au meurtre de ma famille.'],
    ['Ian d’Au-Delà-Des-Monts','Voilà un avantage inattendu de votre décès : quelqu’un a trouvé votre signature plus docile.'],
    ['Tancrede','Ce document ne prouve pas qui a commandé les meurtres. Il prouve que Maël a obéi à une réquisition frauduleuse. Il faut lui montrer ce qu’elle lui a coûté.']
  ],[set('records_found')]);
  dialogue('mael_intro',[
    ['Maël','Le dernier homme venu au nom de votre père a pris mon grain. Le suivant a barré mon canal. Vous comprendrez que les noms ne me rassurent plus.'],
    ['Tancrede','Vous avez un étai ?'],
    ['Maël','Là, sur le quai. Prenez-le pour les malades. Ce n’est pas à eux de payer nos comptes. Mais la vanne de dérivation reste fermée.']
  ]);
  dialogue('mael_proof_needed',[
    ['Maël','Votre parole contre un ordre signé ? Cherchez le registre aux archives. Si vous voulez que je risque ce qui reste, commencez par reconnaître ce qui m’a déjà été pris.']
  ]);
  menu('mael_main','Maël','Le moulin, les malades, vos promesses : de quoi voulez-vous parler ?',[
    ['supplies','Demander de quoi étayer la passerelle.',[talk('mael_intro')]],
    ['diversion','Discuter de l’ouverture du déversoir.',[iff([eq('owner_consent')],[talk('mael_agrees')],[iff([eq('records_found')],[talk('mael_offer')],[talk('mael_proof_needed')])])]],
    ['leave','Le laisser à son travail.',[]]
  ]);
  menu('mael_offer','Maël','La date ne ment pas. Si je laisse ouvrir, la farine est perdue. La dette, elle, ne doit pas disparaître avec l’eau.',[
    ['accept','Reconnaître la dette envers le moulin et demander son accord.',[set('owner_consent'),talk('mael_agrees')],[eq('records_found')]],
    ['repair','Essayer d’abord de réparer les vannes.',[talk('mael_repair')]],
    ['leave','Revenir plus tard.',[]]
  ]);
  dialogue('mael_agrees',[
    ['Tancrede','Je reconnaîtrai cette dette devant Sabine, même si je ne retrouve jamais mon trône.'],
    ['Maël','Alors vous avez mon accord. Quand les malades seront passés, le levier de dérivation est à vous. Ne m’en remerciez pas encore.']
  ]);
  dialogue('mael_repair',[['Maël','Le bronze vaut encore mieux que les promesses. Si vous réparez la grande roue, je garderai mon pain et vous votre signature.']]);
  dialogue('bell_unready',[['Tancrede','Je ne donne pas le départ tant que la passerelle et les porteurs ne sont pas prêts. Sabine doit confirmer l’évacuation.']]);
  dialogue('bell_first',[['Sabine, de l’autre côté','Premier signal reçu. Porteurs en place. Donnez le second lorsque vous êtes prêt.']]);
  dialogue('bell_second',[['Sabine, de l’autre côté','Tous ont traversé. La salle haute les accueille. Vous pouvez libérer l’eau.']]);
  dialogue('bell_done',[['Tancrede','La cloche reste silencieuse. Inutile de rappeler les porteurs pour un travail terminé.']]);
  dialogue('intake_pin',[['Tancrede','Le volant tourne à vide. L’axe a besoin de sa goupille, pas de davantage de force.']]);
  dialogue('intake_closed',[['Tancrede','L’admission est fermée. Le courant ne pousse plus contre l’exutoire.']],[set('intake_closed')]);
  dialogue('intake_already',[['Tancrede','La vanne d’admission est déjà fermée. La rouvrir n’aiderait personne.']]);
  dialogue('outlet_unsafe',[['Ondine, hors champ','Pas encore. Les malades doivent être à l’abri et l’admission fermée. Vérifiez ces deux choses avant de tirer.']]);
  dialogue('divert_unsafe',[['Tancrede','Il faut l’accord de Maël et les malades à l’abri. Je ne peux pas échanger leur sécurité contre son moulin à leur insu.']]);
  dialogue('repair_complete',[
    ['Ondine, hors champ','L’eau descend. L’exutoire tient. Le moulin pourra tourner demain.'],
    ['Tancrede','Ce n’était qu’une goupille.'],
    ['Ondine','Non. C’était savoir qui attendait de l’autre côté avant de la mettre en place. Revenez à l’infirmerie.']
  ]);
  dialogue('divert_complete',[
    ['Maël','Voilà. Une année de farine couleur de rivière.'],
    ['Tancrede','Je n’oublierai pas ma dette.'],
    ['Maël','Ne l’oubliez pas surtout quand vous aurez les moyens de le faire.'],
    ['Ondine, hors champ','Les malades sont sauvés. Je vous attends à l’infirmerie.']
  ]);
  dialogue('after_repair',[
    ['Ondine','Sabine a gardé tous ses malades. Maël, sa farine. Vous avez accepté de commencer par ce qui ne vous rapportait aucune couronne.'],
    ['Tancrede','Vous m’aviez vu arriver avec de grandes idées.'],
    ['Ondine','J’ai surtout vu vos mains vides. Elles ne le sont plus.']
  ],[set('aftermath_seen')]);
  dialogue('after_divert',[
    ['Ondine','Ils sont tous vivants. Et Maël vous attendra au prochain hiver.'],
    ['Tancrede','Je sais.'],
    ['Ondine','Alors écrivez-le. On appelle souvent nécessité ce qu’on préfère ne plus devoir à personne.']
  ],[set('aftermath_seen')]);
  menu('dream','Ondine','Vous me regardez encore comme quelqu’un dont vous attendiez une réponse.',[
    ['tell','Lui parler des rêves sans prétendre qu’ils lui imposent quoi que ce soit.',[talk('dream_tell')]],
    ['wait','La remercier pour son travail et attendre de mieux la connaître.',[talk('dream_wait')]],
    ['leave','Reprendre les vérifications.',[]],
    ['checkpoint','Lire l’état de cette section de production.',[talk('section_end')],[eq('dream_discussed')]]
  ]);
  dialogue('dream_tell',[
    ['Tancrede','Je vous ai vue en rêve. Je sais à quel point cela peut paraître…'],
    ['Ondine','Commode ? Vous me connaissiez sans avoir à m’écouter.'],
    ['Tancrede','Je me trompais. Je voudrais apprendre.'],
    ['Ondine','Alors demain, demandez-moi où je vais. Et acceptez que ce ne soit pas où vous souhaitez aller.']
  ],[set('dream_discussed')]);
  dialogue('dream_wait',[
    ['Tancrede','Je vous ai jugée avant de vous connaître. Merci de m’avoir donné du travail malgré cela.'],
    ['Ondine','Il reste des couvertures à porter. Vous pourrez m’en dire plus en chemin.']
  ],[set('dream_discussed')]);
  dialogue('section_end',[['Carnet','Fin de la section actuellement implémentée. Vous pouvez revisiter les lieux et vérifier les conséquences. Le reste de la campagne, les performances filmées, les voix et la musique ne sont pas livrés dans ce chantier.']]);
  dialogue('patients',[['Sabine','Trois brancards, six porteurs. Je ne transporte personne sur une passerelle qui ploie. Un chemin sûr vaut mieux qu’un prince pressé.']]);
  dialogue('empty_beds',[['Carnet','Fait établi : les trois patients ont rejoint la salle haute. L’état de l’évacuation reste acquis en quittant les lieux et en rechargeant une sauvegarde.']]);
  dialogue('bridge_done',[['Tancrede','Les coins portent sous la traverse. L’étai ne coupe pas le courant ; la passerelle peut supporter un brancard.']]);
  dialogue('resolved_again',[['Tancrede','L’eau s’évacue déjà. Je laisse les commandes dans cette position.']]);
  dialogue('mill_after',[['Maël','Le grain est perdu. Les murs tiennent. J’aurai besoin de bois sec, de semences et que votre mémoire dépasse cette journée.']]);
  dialogue('mill_saved',[['Maël','La roue tourne encore. Si les routes rouvrent, j’enverrai de la farine à Sabine. Dites-lui que c’est du grain, pas une faveur.']]);

  menu('journal','Registre de Saint-Orme','Faits, interprétations et pistes sont conservés séparément. Aucun indice n’est révélé sans votre demande.',[
    ['people','Fait : organiser la traversée des trois brancards.',[talk('journal_people')]],
    ['water','Fait : fonctionnement des deux vannes.',[talk('journal_water')],[eq('plan_read')]],
    ['fraud','Fait et interprétation : la réquisition datée.',[talk('journal_fraud')],[eq('records_found')]],
    ['debt','Engagement : la dette envers Maël.',[talk('journal_debt')],[eq('owner_consent')]],
    ['result','Conséquence de notre intervention.',[iff([eq('water_route','divert')],[talk('journal_loss')],[talk('journal_saved')])],[eq('resolved')]],
    ['hints','Demander un indice facultatif.',[talk('hints')]],
    ['close','Refermer le registre.',[]]
  ]);
  dialogue('journal_people',[['Registre · faits','Trois patients ne peuvent pas marcher. Un étai doit sécuriser la passerelle. Sabine organise les porteurs ; deux signaux distincts de cloche lancent leur préparation puis leur traversée.'],['Registre · piste','La pierre du canal et le plan des archives permettent de choisir la solution hydraulique.']]);
  dialogue('journal_water',[['Registre · faits','La goupille de bronze solidarise l’axe et le volant gauche. Fermer l’admission avant d’ouvrir l’exutoire droit. L’exutoire ne doit être ouvert qu’après l’évacuation.'],['Registre · alternative','Le déversoir du moulin contourne le mécanisme cassé. Il détruirait la farine. L’accord de Maël et l’évacuation sont indispensables.']]);
  dialogue('journal_fraud',[['Registre · fait','La réquisition porte le nom du prince après la date de sa mort annoncée. Maël a obéi à cet ordre.'],['Registre · interprétation','Une autorité profite de la disparition de la famille. Cette pièce seule n’identifie pas le commanditaire des meurtres.']]);
  dialogue('journal_debt',[['Registre · engagement','Tancrede a reconnu la perte que subirait le moulin. Maël autorise la dérivation. Cet accord ne nous oblige pas à l’utiliser si une réparation reste possible.']]);
  dialogue('journal_loss',[['Registre · conséquences','Les trois patients sont saufs. Le grain du moulin a été perdu. La dette reconnue demeure ; la réparation politique reste à accomplir dans la campagne future.']]);
  dialogue('journal_saved',[['Registre · conséquences','Les trois patients sont saufs. Les vannes réparées ont préservé le grain de Maël. Sa promesse d’aider l’infirmerie demeure dans le récit à développer.']]);
  menu('hints','Indices facultatifs','Choisissez le problème sur lequel vous voulez réfléchir.',[
    ['crossing','Le passage des brancards.',[talk('hint_cross_1')]],
    ['repair','La réparation des vannes.',[talk('hint_water_1')]],
    ['alternate','Une autre voie pour l’eau.',[talk('hint_alt_1')]],
    ['close','Continuer sans indice.',[]]
  ]);
  for(const [prefix,steps] of [
    ['cross',[['Le bois peut être soutenu sans arrêter l’eau. Cherchez quelqu’un qui travaille quotidiennement avec elle.','Au moulin, un étai est disponible. Utilisez-le sur la passerelle du cloître ; Sabine pourra préparer les porteurs.','Prenez l’étai au moulin. Sélectionnez-le dans l’inventaire puis cliquez la passerelle. Parlez à Sabine. Tirez la corde de cloche une fois pour préparer, puis une seconde pour faire traverser.']]],
    ['water',[['La grande roue manque de liaison avec son axe. Les écrits conservés au sec expliquent la séquence.','Le plan des archives indique une goupille de rechange sur la table. L’admission doit être fermée avant l’exutoire.','Prenez la goupille aux archives. Placez-la dans l’axe du volant au local des vannes. Fermez ensuite l’admission avec le volant. Après l’évacuation, ouvrez l’exutoire droit.']]],
    ['alt',[['Le moulin possède une voie d’eau plus ancienne que les vannes. Son propriétaire a de bonnes raisons de la garder fermée.','Comparez la date de réquisition aux archives, puis discutez de la dérivation avec Maël. Reconnaître une dette change ce qu’il peut accepter.','Lisez la réquisition aux archives. Parlez du déversoir à Maël et reconnaissez sa perte. Évacuez les patients. Actionnez ensuite le levier du déversoir, à droite du moulin.']]]
  ]) {
    const texts=steps[0];
    for(let i=0;i<3;i++) menu(`hint_${prefix}_${i+1}`,'Indice facultatif',texts[i],[...(i<2?[['more','Demander un indice plus précis.',[talk(`hint_${prefix}_${i+2}`)]]]:[]),['close','Refermer les indices.',[]]]);
  }

  function courtyardHotspots(braced) {
    return [
      hot('courtyard_ward','Entrer dans l’infirmerie',[.05,.20,.11,.38],[returnWard()]),
      hot('courtyard_archive','Entrer aux archives',[.532,.335,.047,.16],[go('archive')]),
      hot('courtyard_sluice','Entrer au local des vannes',[.857,.27,.14,.39],[returnSluice()]),
      hot('courtyard_mill','Descendre vers le moulin',[.45,.84,.20,.16],[returnMill()]),
      braced ? hot('bridge_inspect','Examiner la passerelle étayée',[.24,.50,.28,.21],[talk('bridge_done')]) : placement('bridge_place','Étayer la passerelle',[.24,.50,.28,.21],'brace','bridge_braced','L’étai soulage la traverse. Le passage tient.','La traverse a lâché. Un étai avec des planches et des coins pourrait la soutenir.','La goupille est faite pour un axe. Elle ne peut pas soutenir le poids d’un brancard.',[go('courtyard-braced')]),
      hot('bell','Tirer la corde de cloche',[.576,.35,.026,.11],[iff([eq('evacuated')],[talk('bell_done')],[iff([eq('evacuation_ready'),eq('bridge_braced')],[iff([eq('bell_stage',0)],[set('bell_stage',1),talk('bell_first')],[set('bell_stage',2),set('evacuated'),talk('bell_second')])],[talk('bell_unready')])])])
    ];
  }
  scene('courtyard','Cloître — passage endommagé',courtyardHotspots(false));
  scene('courtyard-braced','Cloître — passage étayé',courtyardHotspots(true));
  function wardHotspots(evacuated) { return [
    hot('ward_exit','Revenir au cloître',[.01,.06,.15,.53],[returnCourt()]),
    hot('ondine','Parler à Ondine',[.83,.10,.16,.80],[iff([eq('resolved')],[iff([eq('aftermath_seen')],[talk('dream')],[iff([eq('water_route','divert')],[talk('after_divert')],[talk('after_repair')])])],[iff([eq('met_ondine')],[talk('ondine_again')],[talk('ondine_first')])])]),
    hot('sabine','Parler à Sabine',[.63,.19,.17,.45],[iff([eq('evacuated')],[talk('sabine_done')],[iff([eq('bridge_braced')],[talk('sabine_ready')],[talk('sabine_unready')])])]),
    hot('ward_patients',evacuated?'Examiner les lits vides':'Examiner les brancards',[.21,.34,.36,.24],[talk(evacuated?'empty_beds':'patients')]),
    hot('journal','Consulter le registre et les indices',[.30,.63,.33,.15],[talk('journal')])
  ]; }
  scene('ward','Infirmerie — patients présents',wardHotspots(false),[iff([eq('introduced',false)],[set('introduced'),talk('arrival')])]);
  scene('ward-evacuated','Infirmerie — évacuation achevée',wardHotspots(true));
  scene('archive','Archives de Saint-Orme',[
    hot('archive_exit','Revenir au cloître',[.12,.035,.14,.50],[returnCourt()]),
    hot('archive_plan','Étudier le plan hydraulique',[.14,.57,.40,.29],[talk('plan')]),
    hot('archive_records','Comparer la réquisition et sa date',[.83,.64,.16,.21],[talk('records')]),
    pickup('pin_pickup','Prendre la goupille de bronze',[.61,.75,.065,.05],'pin','pin_taken','Une clavette de bronze. Elle est trop usée pour une arme, juste assez pour une machine.')
  ]);
  const installedPinResponse = response('installed_pin','La clavette reste solidement engagée dans l’axe.');
  function sluiceHotspots(drained,pinned=false) { return [
    hot('sluice_exit','Revenir au cloître',[.01,.075,.115,.52],[returnCourt()]),
    hot('gauge','Lire les marques de crue',[.48,.33,.063,.31],[talk(drained?'gauge_low':'gauge')]),
    ...(pinned?[hot('pin_installed','Examiner la goupille installée',[.175,.36,.095,.13],[],{response:installedPinResponse})]:[]),
    ...(!drained && !pinned ? [placement('pin_place','Insérer la goupille dans l’axe',[.175,.36,.095,.13],'pin','pin_fitted','Le bronze entre dans l’axe. Le volant entraîne maintenant la vanne.','L’axe du volant présente un logement conique vide.','Un étai de chêne casserait dans cet axe. Il faut la pièce de bronze conservée aux archives.',[go('sluice-pinned')])] : []),
    hot('intake','Fermer la vanne d’admission',[.185,.19,.11,.15],[iff([eq('resolved')],[talk('resolved_again')],[iff([eq('intake_closed')],[talk('intake_already')],[iff([eq('pin_fitted')],[talk('intake_closed')],[talk('intake_pin')])])])]),
    hot('outlet','Ouvrir l’exutoire droit',[.815,.255,.093,.30],[iff([eq('resolved')],[talk('resolved_again')],[iff([eq('intake_closed'),eq('evacuated')],[set('resolved'),set('water_route','repair'),go('sluice-drained')],[talk('outlet_unsafe')])])])
  ]; }
  scene('sluice','Local des vannes',sluiceHotspots(false));
  scene('sluice-pinned','Local des vannes — goupille ajustée',sluiceHotspots(false,true));
  scene('sluice-drained','Local des vannes — eaux abaissées',sluiceHotspots(true,true),[iff([eq('water_announced',false),eq('water_route','repair')],[set('water_announced'),talk('repair_complete')])]);
  scene('sluice-diverted','Local des vannes — eau détournée',sluiceHotspots(true));
  scene('sluice-diverted-pinned','Local des vannes — eau détournée, goupille ajustée',sluiceHotspots(true,true));
  function millHotspots(flooded) { return [
    hot('mill_exit','Remonter au cloître',[.10,.03,.16,.48],[returnCourt()]),
    hot('mael','Parler à Maël',[.37,.12,.14,.66],[iff([eq('water_route','divert')],[talk('mill_after')],[iff([eq('resolved')],[talk('mill_saved')],[talk('mael_main')])])]),
    ...(!flooded ? [pickup('brace_pickup','Prendre l’étai de chêne',[.27,.77,.17,.10],'brace','brace_taken','Maël vous fait signe de prendre l’étai. Les liens et les coins sont encore solides.')] : []),
    hot('divert','Actionner le déversoir du moulin',[.694,.20,.11,.47],[iff([eq('resolved')],[talk('resolved_again')],[iff([eq('owner_consent'),eq('evacuated')],[set('resolved'),set('water_route','divert'),go('mill-flooded')],[talk('divert_unsafe')])])]),
    hot('mill_sacks','Examiner le grain du moulin',[.54,.39,.115,.21],[talk(flooded?'mill_after':'mael_repair')])
  ]; }
  scene('mill','Moulin et ancien déversoir',millHotspots(false));
  scene('mill-flooded','Moulin — grain perdu',millHotspots(true),[iff([eq('water_announced',false)],[set('water_announced'),talk('divert_complete')])]);
  p.locations.items = [{id:'saint-orme',name:'Abbaye de Saint-Orme',icon:'settlement',x:280,y:200,sceneIds:p.scenes.items.map(s=>s.id)}];
  return parseProjectBundle(compileNativeAuthoring(p));
}
