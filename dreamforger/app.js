import {CATEGORIES,createCreation,mutateCreation,fuseCreations,makeDailyChallenge,renderCreationSvg,randomSeed,normalizeCreation,hasCreationNormalizationLoss,createDemoSet,slugify,evaluateConcept,mergeCreationArchive} from './engine.mjs';
import {createStarterProjectMap,normalizeProjectMap,arrangeProjectMap,projectMapHeight,PROJECT_MAP_EDGE_TYPES,hasProjectMapNormalizationLoss} from './project-map.mjs';
import {normalizeProjectWorkflow,normalizeMapNodeWorkflow,compareProjectSnapshots,makeProjectAsset,findDuplicateProjectAsset,hasProjectWorkflowNormalizationLoss} from './project-workflow.mjs';
import {normalizeCareerData,hasCareerNormalizationLoss} from './career-data.mjs';
import {reconcileArchiveRecords,reconcileStudioProjects} from './storage-reconcile.mjs';
import {withExclusiveStorageLock} from './storage-lock.mjs';
import {STORAGE_EPOCH_KEY,readStorageEpoch} from './storage-epoch.mjs';
import {estimateStorageUsage,storageBudgetAllows,LOCAL_STORAGE_BUDGET_BYTES} from './storage-budget.mjs';
import {ProjectHistory,snapshotWorkflowState} from './project-history.mjs';
import {analyzeProject} from './project-intelligence.mjs';
import {OS_APPS,searchOSApps,getOSApp} from './os-shell.mjs';
import {createWindowManagerState,reduceWindowManagerState,isManagedWindowVisible,getVisibleWindowIds} from './window-manager.mjs';
import {readShellPreferences,writeShellPreferences,createDefaultShellPreferences} from './shell-preferences.mjs';
import {inspectStorageHealth} from './storage-health.mjs';
import {createProjectContextState,recordProjectContextEvent} from './project-context.mjs';
import {previewLegacyWorkspaceMigration} from './indexeddb-store.mjs';
import {OS_REGISTRY,CURIOID_HOST_URL,DREAMFORGER_ARTIFACT_TYPE,MAX_PROJECT_HANDOFF_BYTES,inspectCurioidHost,connectDreamforgerToCurioid,launchCurioidSystem,sendProjectToCurioidExchange} from './os-integration.mjs';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const STORE='dreamforge.archive.v1', STUDIO_STORE='dreamforge.studio.v1', MAX_ITEMS=300;
const APP_VERSION='0.19.0';
let shellPreferences=readShellPreferences(localStorage);
let shellPreferenceSaveTimer=null;
let notificationItems=[];
let projectContext=createProjectContextState();
let curioidIntegration=null;
let curioidHostInspection=null;
let curioidExchangePermission={available:false,granted:false};
let curioidReferences=[];
let curioidReferencesState='pending';
let curioidAdapterBusy=false;
let windowManagerState=createWindowManagerState();
const windowElements=new Map();
let windowDragState=null;
const ARCHIVE_LOCK='dreamforger:archive-storage',STUDIO_LOCK='dreamforger:studio-storage',LEGACY_CAREER_LOCK='dreamforger:legacy-career-storage';
let loadedStorageEpoch=readStorageEpoch();
let archiveRecoveryWarning='',studioRecoveryWarning='',archiveConflictWarning='',studioConflictWarning='';
let archive=[],archiveBaselineRaw=null,archiveBaseline=[],current=null,variants=[],selectedCategory='anything',exploreFilter='all',archiveVisibleCount=24,toastTimer=null,studioProject=null,studioLibrary=[],studioBaselineRaw=null,studioBaselineProjects=[],studioSaveTimer=null,studioDirty=false,studioMutationRevision=0,studioInteractions=0,pressureIndex=0,pendingTaskId=null,commandPaletteInvoker=null,studioActionBusy=false,studioOpeningBusy=false;
const safeText=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function loadArchive(){try{const raw=localStorage.getItem(STORE);archiveBaselineRaw=raw;if(!raw){archiveBaseline=[];return [];}const parsed=JSON.parse(raw);if(!Array.isArray(parsed)){archiveRecoveryWarning='Archive data is not a valid list. The original browser data was left untouched.';return [];}const clean=[];for(const item of parsed){try{const normalized=normalizeCreation(item);if(hasCreationNormalizationLoss(item))archiveRecoveryWarning='One or more archive records exceed supported field limits. The original browser data was preserved; export raw recovery data before replacing it.';clean.push(normalized);}catch{archiveRecoveryWarning='Some archive entries could not be read. The original browser data was left untouched; export any recoverable creations before replacing it.';}}if(parsed.length>MAX_ITEMS){archiveRecoveryWarning='The archive contains more than 300 entries. Only the newest 300 are loaded; export the original data before saving changes.';}if(new Set(clean.map(item=>item.id)).size!==clean.length){archiveRecoveryWarning='The archive contains duplicate creation identifiers. The original data was left untouched for recovery.';}archiveBaseline=clean.slice(0,MAX_ITEMS).map(item=>JSON.parse(JSON.stringify(item)));return clean.slice(0,MAX_ITEMS);}catch{archiveRecoveryWarning='The archive could not be read (possibly malformed JSON or blocked storage). The original browser data was left untouched.';return [];}}
async function persist(){
  const transactionEpoch=loadedStorageEpoch;
  if(archiveRecoveryWarning){$('#diagStorage').textContent='RECOVERY';toast('Archive recovery is required. Export the raw recovery file before replacing damaged data.');return false;}
  try{
    return await withExclusiveStorageLock(ARCHIVE_LOCK,async()=>{
      if(readStorageEpoch()!==transactionEpoch||transactionEpoch!==loadedStorageEpoch){archiveConflictWarning='Local data was cleared or reset in another tab. Reload before writing to avoid restoring an old archive.';$('#diagStorage').textContent='CONFLICT';toast(archiveConflictWarning);return false;}
      const latestRaw=localStorage.getItem(STORE);
      if(latestRaw!==archiveBaselineRaw){
        let remote;
        try{
          const parsed=latestRaw?JSON.parse(latestRaw):[];
          if(!Array.isArray(parsed)||parsed.length>MAX_ITEMS)throw new Error('Stored archive is malformed or exceeds the supported limit.');
          remote=parsed.map(item=>{if(hasCreationNormalizationLoss(item))throw new Error('Stored record contains unsupported nested fields.');return normalizeCreation(item);});
          if(new Set(remote.map(item=>item.id)).size!==remote.length)throw new Error('Stored archive contains duplicate identifiers.');
        }catch{
          archiveConflictWarning='Another tab changed the archive into data this tab cannot safely merge. Export local and raw recovery data, then reload.';
          $('#diagStorage').textContent='CONFLICT';$('#exportRecoveryData').hidden=false;toast(archiveConflictWarning);return false;
        }
        const merged=reconcileArchiveRecords(archiveBaseline,archive,remote,MAX_ITEMS);
        if(!merged.ok){
          archiveConflictWarning=`Archive conflict: ${merged.reason}. Nothing was overwritten; export this session and reload before continuing.`;
          $('#diagStorage').textContent='CONFLICT';$('#exportRecoveryData').hidden=false;toast(archiveConflictWarning);return false;
        }
        archive=merged.records;
      }
      const serialized=JSON.stringify(archive);
      if(!storageBudgetAllows(localStorage,STORE,serialized)){toast('Local storage is approaching its safe 4 MiB limit. Export the archive and remove older creations before saving more.');return false;}
      localStorage.setItem(STORE,serialized);
      archiveBaselineRaw=serialized;archiveBaseline=archive.map(copyJson);archiveConflictWarning='';
      $('#diagStorage').textContent='READY';updateStorageMeter();return true;
    });
  }catch(error){
    $('#diagStorage').textContent='LIMITED';updateStorageMeter();
    toast(error?.message||'Browser storage is unavailable or full. Export your archive.');return false;
  }
}

function updateStorageMeter(){let size=0,available=true;try{size=estimateStorageUsage(localStorage);}catch{available=false;}const pct=Math.min(100,size/LOCAL_STORAGE_BUDGET_BYTES*100);$('#storageBar').style.width=`${Math.max(3,pct)}%`;$('#storageLabel').textContent=available?`${(size/1024).toFixed(0)} KB / LOCAL DATA`:'UNAVAILABLE';$('#storageBar').setAttribute('aria-valuenow',String(Math.round(pct)));}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600);$('#taskbarMessage').textContent=message.toUpperCase();}
async function flushCareerBeforeTransition(){
  if(typeof window.dreamforgerFlushCareer!=='function')return true;
  try{return await window.dreamforgerFlushCareer();}catch{return false;}
}
async function navigate(view){
  const appId=view==='career'?'studio':view;
  const win=windowElements.get(appId);
  if(!win)return;
  const currentView=win.querySelector('.view.active');
  if(appId==='studio'&&currentView?.id==='view-career'&&view!=='career'){
    const saved=await flushCareerBeforeTransition();
    if(!saved){toast('Navigation paused: the current Professional Practice draft could not be saved. Export it before leaving.');return;}
  }
  if(appId==='studio'&&currentView?.id==='view-studio'&&view!=='studio'&&studioDirty){
    const saved=await flushStudioPersist();
    if(!saved||studioDirty){toast('Navigation paused: the current project has unsaved or conflicting changes. Export it before leaving.');return;}
  }
  const target=win.querySelector(`#view-${view}`);
  if(!target)return;
  win.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v===target));
  const navView=view==='career'?'studio':view;
  $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===navView));
  windowManagerState=reduceWindowManagerState(windowManagerState,{type:'open',appId});
  syncWindowManager();
  win.querySelector('.app-window-content')?.focus({preventScroll:true});
  if(view==='archive')renderArchive();if(view==='explore')renderDiscoveries();if(view==='home')renderRecent();
}

function setCategory(cat){selectedCategory=CATEGORIES[cat]?cat:'anything';$$('.category-choice').forEach(b=>b.classList.toggle('selected',b.dataset.cat===selectedCategory));}
function setForge(cat='anything',prompt=''){setCategory(cat);if(prompt)$('#seedInput').value=prompt;navigate('forge');}
function getBrief(){return {audience:$('#audienceInput').value,outcome:$('#outcomeInput').value,constraint:$('#constraintInput').value};}
function makeOne(){const seed=randomSeed();const chaos=Number($('#chaosRange').value);current=createCreation({category:selectedCategory,seed,chaos,prompt:$('#seedInput').value,coherent:$('#coherenceToggle').checked,...getBrief()});$('#forgeVariants').hidden=true;renderCurrent();toast('A new possibility has entered the universe.');}
function makeTrio(){const chaos=Number($('#chaosRange').value),prompt=$('#seedInput').value,brief=getBrief();const directions=[{name:'THE PRACTICAL ROUTE',approach:'Practical route',delta:-22,coherent:true},{name:'THE BOLD ROUTE',approach:'Bold exploration',delta:0,coherent:$('#coherenceToggle').checked},{name:'THE WILDCARD',approach:'Wildcard inversion',delta:22,coherent:false}];variants=directions.map((d)=>createCreation({category:selectedCategory,seed:randomSeed(),chaos:Math.max(0,Math.min(100,chaos+d.delta)),prompt,coherent:d.coherent,...brief,approach:d.approach}));variants.forEach((v,i)=>v.directionLabel=directions[i].name);current=variants[0];renderCurrent();$('#forgeVariants').hidden=false;$('#forgeVariants').innerHTML=`<div class="variants-heading"><span>THREE DESIGN DIRECTIONS</span><small>EXPLORE · COMPARE · COMMIT</small></div><div class="variants-grid">${variants.map((item,i)=>`<button class="variant-card ${i===0?'selected':''}" data-variant-index="${i}"><span class="variant-number">0${i+1} / ${safeText(item.directionLabel)}</span><strong>${safeText(item.title)}</strong><small>${safeText(item.blueprint.purpose)}</small><span class="variant-score">${item.review.overall}/100 CONCEPT SIGNAL</span><b>OPEN THIS DIRECTION ↗</b></button>`).join('')}</div>`;toast('Three distinct approaches generated. Compare before committing.');}
function chooseVariant(index){const item=variants[index];if(!item)return;current=item;setCategory(current.category);$$('.variant-card').forEach((b,i)=>b.classList.toggle('selected',i===index));renderCurrent();toast('Direction selected. Now make it stranger.');}
function rebuildCurrent(){if(!current)return;current=createCreation({category:current.category,seed:randomSeed(),chaos:Number($('#chaosRange').value),prompt:current.prompt||current.title,coherent:$('#coherenceToggle').checked,...getBrief(),approach:'Fresh angle'});renderCurrent();toast('A fresh angle, same creative brief.');}
function renderCurrent(){if(!current)return;$('#emptyResult').hidden=true;$('#creationResult').hidden=false;$('#creationArt').innerHTML=renderCreationSvg(current);$('#creationType').textContent=`${CATEGORIES[current.category].label.toUpperCase()} / ${current.revision?'MUTATION':'SPECIMEN'}`;$('#creationSeedLabel').textContent=`SEED / ${current.seed}`;$('#resultSeed').textContent=`SEED ${current.seed}`;$('#creationTitle').textContent=current.title;$('#creationDescription').textContent=current.description;$('#traitList').innerHTML=current.traits.map(t=>`<span class="trait-chip">${safeText(t)}</span>`).join('');const bp=current.blueprint||{};const labels=[['CONCEPT PREMISE',bp.premise],['PURPOSE / VALUE',bp.purpose],['WHO IT SERVES',bp.audience],['PROBLEM SPACE',bp.problem],['VALUE PROPOSITION',bp.value],['OPERATING PRINCIPLE',bp.mechanism],['SIGNATURE DETAIL',bp.signature],['EXPERIENCE FLOW',bp.experience],['CORE REQUIREMENTS',bp.requirements],['HARD CONSTRAINT',bp.hardConstraint||current.brief?.constraint||'No additional constraint supplied.'],['BUILT-IN LIMITATION',bp.constraint],['KEY RISK TO TEST',bp.risk],['FIRST EXPERIMENT',bp.firstTest],['PROTOTYPE PLAN',bp.prototype],['SUCCESS SIGNAL',bp.successMetric],['UNEXPECTED RIPPLE',bp.ripple],['NEXT CONCRETE STEP',bp.nextStep],['DESIGN DIRECTIVE',bp.designNote]];$('#blueprintGrid').innerHTML=labels.map(([label,value])=>`<div class="blueprint-cell"><span>${label}</span><p>${safeText(value||'Not specified.')}</p></div>`).join('');const review=current.review||evaluateConcept({chaos:current.chaos,coherent:current.coherent,prompt:current.prompt,audience:current.brief?.audience,outcome:current.brief?.outcome,constraint:current.brief?.constraint,seed:current.seed});const metrics=[['CLARITY',review.clarity],['ORIGINALITY',review.originality],['FEASIBILITY',review.feasibility],['USEFULNESS',review.usefulness]];$('#reviewGrid').innerHTML=`<div class="review-overall"><strong>${review.overall}</strong><span>/ 100</span><small>CONCEPT SIGNAL</small></div>${metrics.map(([label,value])=>`<div class="review-metric"><div><span>${label}</span><b>${value}</b></div><i><em style="width:${value}%"></em></i></div>`).join('')}`;$('#reviewNote').textContent=`Strongest signal: ${review.strongest}. Best next improvement: challenge ${review.weakest}. These are local heuristic estimates to guide discussion, not proof of quality or feasibility.`;$('#creationLineage').textContent=current.parentIds?.length?'FUSION / TWO PARENTS':current.parentId?'MUTATION / DERIVED':'ORIGINAL SPECIMEN';$('#saveCreation').textContent=archive.some(x=>x.id===current.id)?'✓ SAVED TO ARCHIVE':'＋ SAVE TO ARCHIVE';}
async function saveCurrent(){if(!current)return;if(archive.some(x=>x.id===current.id)){toast('This specimen is already in your archive.');return;}if(archive.length>=MAX_ITEMS){toast('Archive is full (300 creations). Export a backup and delete an item before saving more.');return;}archive.unshift({...current,savedAt:new Date().toISOString()});const saved=await persist();renderCurrent();renderArchiveCount();renderRecent();toast(saved?'Saved to your local archive.':'Added for this session, but browser storage failed. Export it now.');}
function mutateCurrent(){if(!current)return;const previous=current;current=mutateCreation(previous,{seed:randomSeed(),chaos:Number($('#chaosRange').value)});renderCurrent();toast('Mutation complete. Original preserved if saved.');}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);}
function exportCreation(item){const payload={format:'dreamforge',formatVersion:1,exportedAt:new Date().toISOString(),creation:item};downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),`${slugify(item.title)}.dreamforge`);toast('Creation package exported.');}
function exportSvg(item){downloadBlob(new Blob([renderCreationSvg(item)],{type:'image/svg+xml;charset=utf-8'}),`${slugify(item.title)}.svg`);toast('Vector artwork exported.');}
function exportBuildSheet(item){if(!item)return;const b=item.blueprint||{},r=item.review||{};const rows=[['Concept',item.title],['Category',CATEGORIES[item.category].label],['Direction',item.approach||'Balanced exploration'],['Seed',item.seed],['Description',item.description],['Audience',b.audience],['Problem',b.problem],['Value proposition',b.value],['Core principle',b.mechanism],['Experience',b.experience],['Requirements',b.requirements],['Constraint',b.hardConstraint||item.brief?.constraint],['Risk',b.risk],['Prototype plan',b.prototype],['Success signal',b.successMetric],['First experiment',b.firstTest],['Next step',b.nextStep],['Originality signal',r.originality],['Feasibility signal',r.feasibility],['Review note',r.method||'Local heuristic review; not validation']];const body=`KNIGHTMARE OS / DREAMFORGER\nCONCEPT BUILD SHEET\n${'='.repeat(48)}\n\n`+rows.map(([k,v])=>`${k.toUpperCase()}\n${v??'—'}\n`).join('\n');downloadBlob(new Blob([body],{type:'text/plain;charset=utf-8'}),`${slugify(item.title)}-build-sheet.txt`);toast('Build sheet exported.');}
function exportAll(){if(!archive.length){toast('Your archive is empty.');return;}const payload={format:'dreamforge-archive',formatVersion:1,appVersion:APP_VERSION,exportedAt:new Date().toISOString(),creations:archive};downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),'dreamforge-archive.dreamforge');toast(`${archive.length} creations exported.`);}
function copySummary(item){const b=item.blueprint||{};const fields=[['Premise',b.premise],['Audience',b.audience],['Problem',b.problem],['Value proposition',b.value],['Purpose',b.purpose],['Operating principle',b.mechanism],['Signature detail',b.signature],['Experience flow',b.experience],['Requirements',b.requirements],['Hard constraint',b.hardConstraint],['Key risk',b.risk],['Prototype plan',b.prototype],['Success signal',b.successMetric],['First experiment',b.firstTest],['Next step',b.nextStep],['Limitation',b.constraint],['Unexpected ripple',b.ripple]];const text=`${item.title}\n${CATEGORIES[item.category].label} · DREAMFORGER / KNIGHTMARE OS\n\n${item.description}\n\nBUILD BLUEPRINT\n${fields.map(([k,v])=>`${k}: ${v||'—'}`).join('\n')}\n\nCONCEPT REVIEW / HEURISTIC ONLY\n${JSON.stringify(item.review||{})}\n\nTraits: ${item.traits.join(', ')}\nSeed: ${item.seed}\n\nMade with DREAMFORGER on KNIGHTMARE OS — Imagine what doesn't exist.`;if(navigator.clipboard?.writeText){navigator.clipboard.writeText(text).then(()=>toast('Creation summary copied.')).catch(()=>fallbackCopy(text));}else fallbackCopy(text);}
function fallbackCopy(text){const t=document.createElement('textarea');t.value=text;document.body.append(t);t.select();try{document.execCommand('copy');toast('Creation summary copied.');}catch{toast('Copy unavailable in this browser.');}t.remove();}
function renderArchiveCount(){$('#archiveCount').textContent=archive.length;$('#archiveSummary').textContent=`${archive.length} SAVED CREATION${archive.length===1?'':'S'}`;updateStorageMeter();renderFiles();}
function renderRecent(){const items=archive.slice(0,3);$('#recentList').innerHTML=items.length?items.map(item=>`<div class="recent-row" data-open-id="${safeText(item.id)}"><div class="mini-art">${renderCreationSvg(item)}</div><div><strong>${safeText(item.title)}</strong><small>${CATEGORIES[item.category].label.toUpperCase()} · SIGNAL ${item.review?.overall??'—'} · SEED ${item.seed}</small></div></div>`).join(''):'<div class="empty-mini">Your first strange idea will appear here.</div>';}
function cardMarkup(item,mode='archive'){return `<article class="${mode}-card"><div class="${mode}-art">${renderCreationSvg(item)}</div><div class="${mode}-body"><span class="card-kicker">${CATEGORIES[item.category].label.toUpperCase()} / ${item.seed} · SIGNAL ${item.review?.overall??'—'}</span><h3>${safeText(item.title)}</h3><p>${safeText(item.description)}</p></div><div class="card-actions"><button data-card-action="view" data-id="${safeText(item.id)}">INSPECT</button><button data-card-action="remix" data-id="${safeText(item.id)}">MUTATE ↗</button>${mode==='archive'?'<button data-card-action="fuse" data-id="'+safeText(item.id)+'">FUSE +</button><button data-card-action="export" data-id="'+safeText(item.id)+'">EXPORT ↓</button><button data-card-action="delete" data-id="'+safeText(item.id)+'">DELETE ×</button>':''}</div></article>`;}
function renderArchive(){const q=$('#archiveSearch').value.trim().toLowerCase();let items=archive.filter(x=>!q||`${x.title} ${x.description} ${x.category} ${x.approach||''} ${x.brief?.audience||''} ${Object.values(x.blueprint||{}).join(' ')}`.toLowerCase().includes(q));const sort=$('#archiveSort').value;if(sort==='oldest')items.reverse();if(sort==='name')items.sort((a,b)=>a.title.localeCompare(b.title));if(sort==='quality')items.sort((a,b)=>(b.review?.overall||0)-(a.review?.overall||0));const shown=items.slice(0,archiveVisibleCount);$('#archiveGrid').innerHTML=items.length?shown.map(x=>cardMarkup(x,'archive')).join('')+(items.length>shown.length?`<button class="outline-button archive-load-more" data-load-more>LOAD MORE (${items.length-shown.length} REMAINING) ↓</button>`:''):`<div class="archive-empty"><span>▤</span><h2>${archive.length?'NO MATCHING CREATIONS.':'YOUR ARCHIVE IS A BLANK UNIVERSE.'}</h2><p>${archive.length?'Try another search.':'Save a creation from Dreamforger and it will live here on this device.'}</p><button class="primary-cta" data-open-forge="anything">CREATE SOMETHING ↗</button></div>`;renderArchiveCount();}
let demos=createDemoSet();function renderDiscoveries(){const items=demos.filter(x=>exploreFilter==='all'||x.category===exploreFilter);$('#discoveryGrid').innerHTML=items.map(x=>cardMarkup(x,'discovery')).join('');}
function inspect(item){const bp=item.blueprint||{};const dossier=[['AUDIENCE',bp.audience],['PROBLEM',bp.problem],['VALUE',bp.value],['PURPOSE',bp.purpose],['OPERATING PRINCIPLE',bp.mechanism],['EXPERIENCE FLOW',bp.experience],['REQUIREMENTS',bp.requirements],['HARD CONSTRAINT',bp.hardConstraint],['KEY RISK',bp.risk],['PROTOTYPE PLAN',bp.prototype],['SUCCESS SIGNAL',bp.successMetric],['LIMITATION',bp.constraint],['FIRST EXPERIMENT',bp.firstTest],['NEXT STEP',bp.nextStep],['UNEXPECTED RIPPLE',bp.ripple]];$('#detailDialogContent').innerHTML=`<div class="eyebrow">SPECIMEN INSPECTION / ${item.seed}</div><div class="detail-art">${renderCreationSvg(item)}</div><div class="card-kicker">${CATEGORIES[item.category].label.toUpperCase()}</div><h2>${safeText(item.title)}</h2><p>${safeText(item.description)}</p><div class="detail-traits">${item.traits.map(t=>`<span class="trait-chip">${safeText(t)}</span>`).join('')}</div><div class="inspect-dossier"><div class="blueprint-heading"><span>KNIGHTMARE FIELD DOSSIER</span><small>SEED ${item.seed}</small></div>${dossier.map(([label,value])=>`<div class="inspect-dossier-row"><span>${label}</span><p>${safeText(value||'Not specified.')}</p></div>`).join('')}</div><div class="creation-actions"><button class="action-primary" data-dialog-action="studio" data-id="${safeText(item.id)}">▦ OPEN IN STUDIO</button><button class="action-secondary" data-dialog-action="remix" data-id="${safeText(item.id)}">⟳ MUTATE THIS</button><button class="action-secondary" data-dialog-action="export" data-id="${safeText(item.id)}">↓ EXPORT</button><button class="action-secondary" data-dialog-action="build" data-id="${safeText(item.id)}">↓ BUILD SHEET</button></div>`;$('#detailDialog').showModal();}
function findItem(id){return archive.find(x=>x.id===id)||demos.find(x=>x.id===id);}
function remixItem(id){const item=findItem(id);if(!item)return;current=mutateCreation(item,{seed:randomSeed(),chaos:item.chaos});setCategory(current.category);renderCurrent();navigate('forge');toast('Remix created. Save it to keep it.');}
let archiveImportBusy=false;
function importFile(file){if(!file)return;if(archiveImportBusy){toast('An archive import is already being processed.');return;}if(file.size>5*1024*1024){toast('Import is too large (5 MB maximum).');return;}const reader=new FileReader();archiveImportBusy=true;reader.onload=async()=>{try{const data=JSON.parse(reader.result);const incoming=data.format==='dreamforge-archive'?data.creations:[data.creation||data];if(!Array.isArray(incoming)||incoming.length>MAX_ITEMS)throw new Error('Unsupported or oversized archive');const merged=mergeCreationArchive(archive,incoming,MAX_ITEMS);archive=merged.archive;const saved=await persist();renderArchive();renderRecent();const {imported:count,invalid,duplicates,capacitySkipped}=merged;const details=[`${count} imported`,`${invalid} invalid skipped`,`${duplicates} duplicates skipped`];if(capacitySkipped)details.push(`${capacitySkipped} skipped (300-item limit)`);if(!saved)details.push('storage failed · export this session');toast(details.join(' · ')+'.');}catch(e){toast(`Import failed: ${e.message}`);}finally{archiveImportBusy=false;}};reader.onerror=()=>{archiveImportBusy=false;toast('Could not read that file.');};reader.readAsText(file);} 
function updateDaily(){const d=makeDailyChallenge();$('#dailyDate').textContent=d.key;$('#dailyTitle').textContent=d.title;$('#dailyPrompt').textContent=d.prompt;$('#tryDaily').dataset.prompt=d.prompt;}
function exportRawRecovery(){try{const payload={format:'dreamforger-raw-recovery',exportedAt:new Date().toISOString(),archiveRaw:localStorage.getItem(STORE),studioRaw:localStorage.getItem(STUDIO_STORE),warnings:[archiveRecoveryWarning,studioRecoveryWarning,archiveConflictWarning,studioConflictWarning].filter(Boolean)};downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),'dreamforger-raw-recovery.json');toast('Raw recovery data exported. Keep this file unchanged.');}catch{toast('Could not read local storage for recovery export.');}}
async function runMigrationPreview(){
  const output=$('#migrationPreviewOutput');output.textContent='Inspecting local records without modifying them…';
  try{
    const report=await previewLegacyWorkspaceMigration({storage:localStorage});
    const lines=report.records.map(item=>`${item.present?'PRESENT':'EMPTY'}  ${item.key}  ·  ${item.estimatedBytes} estimated bytes${item.sha256?`  ·  SHA-256 ${item.sha256.slice(0,16)}…`:''}`);
    output.textContent=`READ-ONLY PREVIEW · ${report.recordCount} stored record(s) · ${report.totalCharacters} characters · ${report.estimatedBytes} estimated bytes · source unchanged\n${lines.join('\n')}\nNo IndexedDB write or storage cutover was performed.`;
  }catch(error){output.textContent=`PREVIEW UNAVAILABLE · ${error?.message||'Could not inspect local storage.'}\nNo source data was changed.`;}
}
function runDiagnostics(){const storageReport=inspectStorageHealth(localStorage,LOCAL_STORAGE_BUDGET_BYTES);const checks=[['Procedural engine',typeof createCreation==='function'],['Concept review',typeof evaluateConcept==='function'&&Number.isFinite(evaluateConcept({seed:1}).overall)],['Build-sheet exporter',typeof exportBuildSheet==='function'],['Local storage read/write',(()=>{try{const k='df-test';localStorage.setItem(k,'1');const ok=localStorage.getItem(k)==='1';localStorage.removeItem(k);return ok;}catch{return false;}})()],['Studio project persistence',(()=>{try{const k='df-studio-test';localStorage.setItem(k,'1');const ok=localStorage.getItem(k)==='1';localStorage.removeItem(k);return ok;}catch{return false;}})()],['Storage within conservative budget',storageReport.available&&storageReport.usedBytes<=storageReport.budgetBytes],['IndexedDB API available (not active)',Boolean(globalThis.indexedDB)],['Web Locks API available',Boolean(navigator.locks?.request)],['Service Worker API available',Boolean(navigator.serviceWorker)],['SVG renderer',renderCreationSvg(createCreation({seed:1})).includes('<svg')],['Download API',typeof URL.createObjectURL==='function'],['Secure context',window.isSecureContext||location.hostname==='localhost']];const warnings=[archiveRecoveryWarning,studioRecoveryWarning,archiveConflictWarning,studioConflictWarning].filter(Boolean);const pass=checks.filter(x=>x[1]).length;const output=checks.map(x=>`${x[1]?'PASS':'WARN'}  ${x[0]}`).join('   ·   ')+`   |   ${pass}/${checks.length} checks passed`+(warnings.length?`   |   RECOVERY WARNING: ${warnings.join(' ')}`:'');$('#diagnosticOutput').textContent=output;if($('#settingsDiagnosticResult'))$('#settingsDiagnosticResult').textContent=output;toast(warnings.length?'Diagnostics found data recovery warnings. Export recoverable data before saving.':`Diagnostics complete: ${pass}/${checks.length} checks passed.`);}
function updateClock(){const d=new Date();$('#clock').textContent=d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});}
async function clearData(){
  if(!confirm('Clear ALL DREAMFORGER local data in this browser, including creations, Studio projects, Career Suite drafts, notes and snapshots? Export your backups first. This cannot be undone.'))return;
  try{
    const nextEpoch=`${Date.now()}-${randomSeed()}`;
    await withExclusiveStorageLock(ARCHIVE_LOCK,()=>withExclusiveStorageLock(STUDIO_LOCK,()=>withExclusiveStorageLock(LEGACY_CAREER_LOCK,()=>{
      localStorage.setItem(STORAGE_EPOCH_KEY,`clearing:${nextEpoch}`);
      localStorage.removeItem(STORE);localStorage.removeItem(STUDIO_STORE);localStorage.removeItem('dreamforger.career-suite.v1');localStorage.removeItem('dreamforger.shell-preferences.v1');
      localStorage.setItem(STORAGE_EPOCH_KEY,nextEpoch);
    })));
    loadedStorageEpoch=nextEpoch;
  }catch(error){toast(error?.message||'Could not safely clear storage. No local data was intentionally removed.');return;}
  shellPreferences=createDefaultShellPreferences();applyShellPreferences();
  archive=[];archiveBaselineRaw=null;archiveBaseline=[];archiveRecoveryWarning='';archiveConflictWarning='';
  studioLibrary=[];studioProject=null;studioBaselineRaw=null;studioBaselineProjects=[];studioRecoveryWarning='';studioConflictWarning='';studioDirty=false;studioMutationRevision++;
  current=null;$('#exportRecoveryData').hidden=true;window.dispatchEvent(new Event('dreamforger:local-data-cleared'));
  $('#creationResult').hidden=true;$('#emptyResult').hidden=false;renderArchive();renderRecent();renderArchiveCount();renderFiles();renderDesktopSurface();updateStorageMeter();await navigate('home');
  toast('Creation archive, Studio workspace and Career Suite cleared.');
}

function fuseFromArchive(id){const a=findItem(id);const candidates=archive.filter(x=>x.id!==id);if(!a||!candidates.length){toast('Save at least two creations to fuse them.');return;}const b=candidates[0];current=fuseCreations(a,b,{seed:randomSeed(),chaos:88});setCategory(current.category);renderCurrent();navigate('forge');toast(`Fused ${a.title} with ${b.title}.`);}

const PRESSURE_TESTS=[
  ['THE 10-SECOND TEST','Can someone understand the core promise in ten seconds without an explanation?'],
  ['THE NO-BUDGET TEST','What is the smallest version you could test with materials and tools you already have?'],
  ['THE OPPOSITE TEST','What happens if the main assumption is reversed? Does a more interesting concept appear?'],
  ['THE FAILURE TEST','How could this fail in a surprising way, and can that failure become a feature?'],
  ['THE ACCESSIBILITY TEST','Can someone use the core experience with one hand, low vision, or no sound?'],
  ['THE STRANGER TEST','Would a person outside the intended audience understand why this matters?'],
  ['THE SUBTRACTION TEST','Remove one major feature. Does the concept become clearer or more distinctive?'],
  ['THE REALITY TEST','What is the riskiest assumption, and what is the cheapest experiment that could challenge it?'],
  ['THE DELIGHT TEST','Where is the tiny moment that makes someone want to show another person?']
];
const STUDIO_PROMPTS=['What is the smallest version that still feels like the real thing?','What should this deliberately refuse to do?','What would make this feel unmistakably different after one minute?','Which part could be made physical, tactile, audible or spatial?','What happens if two unrelated features collide?','What can the user change, discover or influence?'];
function makeStudioProject(item){const bp=item.blueprint||{};return {format:'dreamforge-studio',version:1,id:`studio-${item.id}`,creation:normalizeCreation(item),title:item.title||'Untitled project',tagline:bp.premise||item.description||'',audience:bp.audience||item.brief?.audience||'Curious people',goal:bp.purpose||bp.value||item.description||'',firstStep:bp.firstTest||bp.nextStep||'Explore the first interaction',success:bp.successMetric||'A person understands the value and wants to continue.',notes:'',tasks:[{id:'t-brief',title:'Clarify the core promise',status:'todo'},{id:'t-flow',title:'Map the first user interaction',status:'todo'},{id:'t-test',title:'Run one small reality check',status:'todo'},{id:'t-refine',title:'Refine after the first test',status:'todo'}],canvasNodes:createStarterProjectMap(item),groups:[],assets:[],mapView:{zoom:1,left:0,top:0},career:null,snapshots:[],updatedAt:new Date().toISOString()};}
function boundedText(value,fallback='',max=1000){return String(value??fallback).slice(0,max);}
function normalizeStudioTask(task,index=0){return {id:(boundedText(task?.id,`task-${index}`,100).replace(/[<>"']/g,'')||`task-${index}`),title:boundedText(task?.title,'Untitled task',140),status:['todo','doing','done'].includes(task?.status)?task.status:'todo'};}
function hasStudioTaskNormalizationLoss(raw,normalized){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||!normalized)return true;
  if(Object.keys(raw).some(key=>!['id','title','status'].includes(key)))return true;
  if(typeof raw.id!=='string'||!raw.id||raw.id.length>100||/[<>"']/.test(raw.id))return true;
  if(typeof raw.title!=='string'||raw.title.length>140)return true;
  if(!['todo','doing','done'].includes(raw.status))return true;
  return raw.id!==normalized.id||raw.title!==normalized.title||raw.status!==normalized.status;
}
function normalizeStudioSnapshot(snapshot,index=0,projectTitle='Untitled project'){if(!snapshot||typeof snapshot!=='object'||!snapshot.data?.creation)return null;const d=snapshot.data;const tasks=Array.isArray(d.tasks)?d.tasks.slice(0,80).map(normalizeStudioTask):[];const nodes=normalizeProjectMap(d.canvasNodes,d.creation);const wf=normalizeProjectWorkflow(d,nodes,tasks);return {id:boundedText(snapshot.id,`version-${index}`,100).replace(/[<>"']/g,''),label:boundedText(snapshot.label,`Snapshot ${index+1}`,60),createdAt:Number.isFinite(Date.parse(snapshot.createdAt))?new Date(snapshot.createdAt).toISOString():new Date().toISOString(),data:{title:boundedText(d.title,projectTitle,90),tagline:boundedText(d.tagline,'',260),audience:boundedText(d.audience,'',140),goal:boundedText(d.goal,'',300),firstStep:boundedText(d.firstStep,'',120),success:boundedText(d.success,'',220),notes:boundedText(d.notes,'',12000),tasks,canvasNodes:nodes.map(n=>normalizeMapNodeWorkflow(n,wf.groups,tasks,wf.assets)),groups:wf.groups,assets:wf.assets,mapView:wf.mapView,career:d.career&&typeof d.career==='object'?normalizeCareerData(d.career):null,creation:normalizeCreation(d.creation)}};}
function safeNormalizeStudioProject(raw){try{return normalizeStudioProject(raw);}catch{return null;}}
function safeNormalizeStudioSnapshot(raw,index,title){try{return normalizeStudioSnapshot(raw,index,title);}catch{return null;}}
function normalizeUniqueIds(items,prefix){const seen=new Set();return items.map((item,index)=>{let id=item.id;if(seen.has(id)){id=`${prefix}-${index}`;while(seen.has(id))id+=`-${index}`;item={...item,id};}seen.add(id);return item;});}
function hasStudioSnapshotNormalizationLoss(raw,normalized){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(key=>!['id','label','createdAt','data'].includes(key))||!raw.data||typeof raw.data!=='object'||Array.isArray(raw.data))return true;
  if(typeof raw.id!=='string'||!raw.id||raw.id.length>100||/[<>"']/.test(raw.id))return true;
  if(typeof raw.label!=='string'||raw.label.length>60||!Number.isFinite(Date.parse(raw.createdAt)))return true;
  const d=raw.data,n=normalized?.data;
  if(!n||hasCreationNormalizationLoss(d.creation))return true;
  if(Object.keys(d).some(key=>!['title','tagline','audience','goal','firstStep','success','notes','tasks','canvasNodes','groups','assets','mapView','career','creation'].includes(key)))return true;
  if(hasProjectWorkflowNormalizationLoss(d,n?.canvasNodes||[],n?.tasks||[]))return true;
  if(Array.isArray(d.tasks)&&(d.tasks.length>80||d.tasks.length!==n.tasks.length||d.tasks.some((task,index)=>hasStudioTaskNormalizationLoss(task,n.tasks[index]))))return true;
  if(d.tasks!=null&&!Array.isArray(d.tasks))return true;
  if(hasProjectMapNormalizationLoss(d.canvasNodes))return true;
  if(d.career!=null&&hasCareerNormalizationLoss(d.career))return true;
  const fields={title:90,tagline:260,audience:140,goal:300,firstStep:120,success:220,notes:12000};
  for(const [key,max] of Object.entries(fields))if(d[key]!=null&&(typeof d[key]!=='string'||d[key].length>max))return true;
  return false;
}
function hasStudioNormalizationLoss(raw,normalized){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||!normalized||hasCreationNormalizationLoss(raw.creation))return true;
  const allowed=['format','version','id','creation','title','tagline','audience','goal','firstStep','success','notes','tasks','canvasNodes','groups','assets','mapView','career','snapshots','updatedAt','parentProjectId','sourceReference','appVersion','exportedAt','exportNotice'];
  if(Object.keys(raw).some(key=>!allowed.includes(key)))return true;
  if(raw.format!=null&&raw.format!=='dreamforge-studio')return true;
  if(raw.version!=null&&raw.version!==1)return true;
  if(raw.id!=null&&(typeof raw.id!=='string'||!raw.id||raw.id.length>120||/[<>"']/.test(raw.id)||raw.id!==normalized.id))return true;
  if(raw.updatedAt!=null&&!Number.isFinite(Date.parse(raw.updatedAt)))return true;
  if(raw.appVersion!=null&&(typeof raw.appVersion!=='string'||raw.appVersion.length>40))return true;
  if(raw.exportedAt!=null&&!Number.isFinite(Date.parse(raw.exportedAt)))return true;
  if(raw.exportNotice!=null&&(typeof raw.exportNotice!=='string'||raw.exportNotice.length>300))return true;
  if(raw.sourceReference!=null){const ref=raw.sourceReference;if(!ref||typeof ref!=='object'||Array.isArray(ref)||Object.keys(ref).some(key=>!['schemaVersion','sourceExperienceId','artifactType','artifactId','title','importedAt'].includes(key))||ref.schemaVersion!==1||ref.sourceExperienceId!=='dreamforger'||ref.artifactType!==DREAMFORGER_ARTIFACT_TYPE||typeof ref.artifactId!=='string'||!/^[a-z0-9][a-z0-9._:-]{0,95}$/i.test(ref.artifactId)||typeof ref.title!=='string'||!ref.title||ref.title.length>160||typeof ref.importedAt!=='string'||!Number.isFinite(Date.parse(ref.importedAt)))return true;}
  if(Array.isArray(raw.tasks)&&(raw.tasks.length>80||raw.tasks.length!==normalized.tasks.length||raw.tasks.some((task,index)=>hasStudioTaskNormalizationLoss(task,normalized.tasks[index]))))return true;
  if(raw.tasks!=null&&!Array.isArray(raw.tasks))return true;
  if(Array.isArray(raw.snapshots)&&(raw.snapshots.length>10||raw.snapshots.length!==normalized.snapshots.length))return true;
  if(raw.snapshots!=null&&!Array.isArray(raw.snapshots))return true;
  if(Array.isArray(raw.canvasNodes)&&hasProjectMapNormalizationLoss(raw.canvasNodes))return true;
  if(raw.canvasNodes!=null&&!Array.isArray(raw.canvasNodes))return true;
  if(raw.career!=null&&hasCareerNormalizationLoss(raw.career))return true;
  if(hasProjectWorkflowNormalizationLoss(raw,normalized.canvasNodes,normalized.tasks))return true;
  const fields={title:90,tagline:260,audience:140,goal:300,firstStep:120,success:220,notes:12000,parentProjectId:120};
  for(const [key,max] of Object.entries(fields))if(raw[key]!=null&&(typeof raw[key]!=='string'||raw[key].length>max))return true;
  if(Array.isArray(raw.tasks)){const ids=raw.tasks.map(t=>t?.id);if(ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)return true;}
  if(Array.isArray(raw.snapshots)){
    const ids=raw.snapshots.map(v=>v?.id);
    if(ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)return true;
    for(let i=0;i<raw.snapshots.length;i++)if(hasStudioSnapshotNormalizationLoss(raw.snapshots[i],normalized.snapshots[i]))return true;
  }
  return false;
}
function copyJson(value){return JSON.parse(JSON.stringify(value));}
function normalizeStudioProject(raw){if(!raw||typeof raw!=='object'||!raw.creation)return null;const creation=normalizeCreation(raw.creation),project=makeStudioProject(creation);project.id=(boundedText(raw.id||project.id,project.id,120).replace(/[<>"']/g,'')||project.id);project.title=boundedText(raw.title,creation.title||'Imported project',90);project.tagline=boundedText(raw.tagline,project.tagline,260);project.audience=boundedText(raw.audience,project.audience,140);project.goal=boundedText(raw.goal,project.goal,300);project.firstStep=boundedText(raw.firstStep,project.firstStep,120);project.success=boundedText(raw.success,project.success,220);project.notes=boundedText(raw.notes,'',12000);project.tasks=normalizeUniqueIds(Array.isArray(raw.tasks)?raw.tasks.slice(0,80).map(normalizeStudioTask):project.tasks,'recovered-task');project.canvasNodes=normalizeProjectMap(raw.canvasNodes,creation);const workflow=normalizeProjectWorkflow(raw,project.canvasNodes,project.tasks);project.groups=workflow.groups;project.assets=workflow.assets;project.mapView=workflow.mapView;project.canvasNodes=project.canvasNodes.map(n=>normalizeMapNodeWorkflow(n,project.groups,project.tasks,project.assets));project.career=raw.career&&typeof raw.career==='object'?normalizeCareerData(raw.career):null;project.snapshots=normalizeUniqueIds(Array.isArray(raw.snapshots)?raw.snapshots.slice(0,10).map((v,i)=>safeNormalizeStudioSnapshot(v,i,project.title)).filter(Boolean):[],'recovered-snapshot');project.updatedAt=Number.isFinite(Date.parse(raw.updatedAt))?new Date(raw.updatedAt).toISOString():new Date().toISOString();project.parentProjectId=boundedText(raw.parentProjectId,'',120);if(raw.sourceReference&&typeof raw.sourceReference==='object'&&!Array.isArray(raw.sourceReference))project.sourceReference={schemaVersion:1,sourceExperienceId:'dreamforger',artifactType:DREAMFORGER_ARTIFACT_TYPE,artifactId:boundedText(raw.sourceReference.artifactId,'',96),title:boundedText(raw.sourceReference.title,'Imported DREAMFORGER project',160),importedAt:boundedText(raw.sourceReference.importedAt,new Date().toISOString(),64)};return project;}
function hasStudioWorkspaceEnvelopeLoss(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return true;
  if(raw.format!=='dreamforge-studio-library'||raw.version!==1)return true;
  if(Object.keys(raw).some(key=>!['format','version','activeId','projects'].includes(key)))return true;
  if(raw.activeId!=null&&(typeof raw.activeId!=='string'||raw.activeId.length>120||/[<>"']/.test(raw.activeId)))return true;
  if(!Array.isArray(raw.projects)||raw.projects.length>8)return true;
  const ids=raw.projects.map(project=>project?.id);
  if(ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)return true;
  return raw.activeId!=null&&!ids.includes(raw.activeId);
}
function parseStudioWorkspace(rawText){
  if(rawText===null)return {ok:true,projects:[],activeId:null};
  try{
    const raw=JSON.parse(rawText);let sources,activeId=null;
    if(raw?.format==='dreamforge-studio-library'&&raw.version===1){if(hasStudioWorkspaceEnvelopeLoss(raw))return {ok:false,reason:'The stored workspace envelope contains unsupported or oversized fields.'};sources=raw.projects;activeId=raw.activeId||null;}
    else if(raw?.format==='dreamforge-studio'&&raw.version===1&&raw.creation){sources=[raw];activeId=raw.id||null;}
    else return {ok:false,reason:'The other tab stored an unsupported workspace format.'};
    const projects=sources.map(safeNormalizeStudioProject);
    if(projects.some((project,index)=>!project||hasStudioNormalizationLoss(sources[index],project)))return {ok:false,reason:'The other tab stored a project that would lose nested data during normalization.'};
    if(new Set(projects.map(p=>p.id)).size!==projects.length)return {ok:false,reason:'The other tab stored duplicate project identifiers.'};
    return {ok:true,projects,activeId};
  }catch{return {ok:false,reason:'The other tab stored malformed project data.'};}
}
function captureStudioBaseline(rawText=localStorage.getItem(STUDIO_STORE)){
  const parsed=parseStudioWorkspace(rawText);
  if(!parsed.ok)return false;
  studioBaselineRaw=rawText;
  studioBaselineProjects=parsed.projects.map(copyJson);
  return true;
}
function loadStudio(){try{const stored=localStorage.getItem(STUDIO_STORE);studioBaselineRaw=stored;studioBaselineProjects=[];if(!stored)return null;const raw=JSON.parse(stored);if(raw?.format==='dreamforge-studio-library'&&raw.version===1){if(hasStudioWorkspaceEnvelopeLoss(raw)){studioRecoveryWarning='The Studio workspace envelope contains unsupported or oversized fields. The original data was left untouched for recovery.';studioLibrary=[];return null;}const bounded=raw.projects.slice(0,8);studioLibrary=bounded.map(safeNormalizeStudioProject).filter(Boolean);if(raw.projects.some((source,index)=>{const normalized=safeNormalizeStudioProject(source);return !normalized||hasStudioNormalizationLoss(source,normalized);}))studioRecoveryWarning='One or more stored projects contain oversized or invalid nested data that would be truncated by normalization. The original browser data was preserved; export raw recovery data before replacing it.';if(raw.projects.length>8)studioRecoveryWarning='The stored workspace contains more than eight projects. The original was left untouched; export raw recovery data before replacing it.';if(studioLibrary.length!==raw.projects.length&&raw.projects.length<=8)studioRecoveryWarning='Some Studio projects were invalid and were skipped. The original browser data was left untouched until you recover it.';if(new Set(studioLibrary.map(p=>p.id)).size!==studioLibrary.length)studioRecoveryWarning='The Studio workspace contains duplicate project identifiers. The original data was left untouched for recovery.';studioBaselineProjects=studioLibrary.map(copyJson);return studioLibrary.find(p=>p.id===raw.activeId)||studioLibrary[0]||null;}if(raw?.format==='dreamforge-studio'&&raw.version===1&&raw.creation){const legacy=normalizeStudioProject(raw);if(!legacy||hasStudioNormalizationLoss(raw,legacy)){studioRecoveryWarning='The stored legacy Studio project contains unsupported or oversized fields. Its original data was preserved; export raw recovery data before replacing it.';studioLibrary=[];return null;}studioLibrary=[legacy];studioBaselineProjects=studioLibrary.map(copyJson);return legacy;}studioRecoveryWarning='Studio data uses an unsupported format. The original browser data was left untouched.';}catch{studioRecoveryWarning='Studio data could not be read (possibly malformed JSON or blocked storage). The original browser data was left untouched.';}studioLibrary=[];return null;}
function refreshStudioFromStorage(notify=true){
  const previousId=studioProject?.id||null;
  let raw;try{raw=localStorage.getItem(STUDIO_STORE);}catch{return false;}
  const parsed=parseStudioWorkspace(raw);
  if(!parsed.ok)return false;
  studioLibrary=parsed.projects.map(copyJson);
  studioBaselineRaw=raw;
  studioBaselineProjects=studioLibrary.map(copyJson);
  const nextId=parsed.activeId&&studioLibrary.some(project=>project.id===parsed.activeId)?parsed.activeId:(studioLibrary[0]?.id||null);
  studioProject=studioLibrary.find(project=>project.id===nextId)||null;
  current=studioProject?.creation||null;
  if(notify&&previousId!==nextId){
    window.dispatchEvent(new CustomEvent('dreamforger:project-switched',{detail:{projectId:nextId}}));
  }
  if($('#view-studio')?.classList.contains('active')&&studioProject)renderStudio();
  updateStorageMeter();
  return true;
}
function showStudioSaveError(message){const state=$('#studioSaveState');if(state){state.textContent=message;state.classList.add('save-error');}}
function scheduleStudioPersist(){if(!studioProject)return;studioMutationRevision++;studioDirty=true;const state=$('#studioSaveState');if(state){state.textContent='UNSAVED CHANGES · SAVING…';state.classList.remove('save-error');}clearTimeout(studioSaveTimer);studioSaveTimer=setTimeout(()=>{studioSaveTimer=null;void persistStudio();},450);}
async function flushStudioPersist(){clearTimeout(studioSaveTimer);studioSaveTimer=null;if(!studioDirty)return true;for(let attempt=0;attempt<5&&studioDirty;attempt++){const saved=await persistStudio();if(!saved)return false;}return !studioDirty;}
async function persistStudio(){
  const transactionEpoch=loadedStorageEpoch;
  clearTimeout(studioSaveTimer);studioSaveTimer=null;
  const revision=++studioMutationRevision;studioDirty=true;
  if(!studioProject&&studioLibrary.length===0){
    if(studioRecoveryWarning){studioDirty=true;showStudioSaveError('RECOVERY REQUIRED · EXPORT RAW DATA');return false;}
    try{return await withExclusiveStorageLock(STUDIO_LOCK,async()=>{
      if(readStorageEpoch()!==transactionEpoch||transactionEpoch!==loadedStorageEpoch){studioDirty=true;showStudioSaveError('WORKSPACE RESET ELSEWHERE · RELOAD');return false;}
      const latestRaw=localStorage.getItem(STUDIO_STORE);let remote=[];
      if(latestRaw!==studioBaselineRaw){const parsed=parseStudioWorkspace(latestRaw);if(!parsed.ok){studioDirty=true;showStudioSaveError('CONFLICT · EXPORT AND RELOAD');return false;}remote=parsed.projects;}
      const merged=reconcileStudioProjects(studioBaselineProjects,[],remote,8);if(!merged.ok){studioDirty=true;showStudioSaveError('CONFLICT · EXPORT AND RELOAD');return false;}
      if(merged.records.length){const first=merged.records[0];const serialized=JSON.stringify({format:'dreamforge-studio-library',version:1,activeId:first.id,projects:merged.records});if(!storageBudgetAllows(localStorage,STUDIO_STORE,serialized)){studioDirty=true;showStudioSaveError('LOCAL STORAGE BUDGET · EXPORT / TRIM HISTORY');toast('Workspace exceeds the safe 4 MiB browser-storage budget. Export it and reduce older snapshots or notes before saving.');return false;}localStorage.setItem(STUDIO_STORE,serialized);studioBaselineRaw=serialized;studioBaselineProjects=merged.records.map(copyJson);studioLibrary=merged.records;studioProject=first;current=first.creation;}
      else{localStorage.removeItem(STUDIO_STORE);studioBaselineRaw=null;studioBaselineProjects=[];studioLibrary=[];studioProject=null;current=null;}
      studioDirty=studioMutationRevision!==revision;updateStorageMeter();return !studioDirty;
    });}catch(error){studioDirty=true;showStudioSaveError('STORAGE LOCK / QUOTA · EXPORT PROJECT');toast(error?.message||'Workspace storage failed. Export your project.');return false;}
  }
  if(!studioProject)return false;
  const activeId=studioProject.id;const localProject=copyJson(studioProject);localProject.updatedAt=new Date().toISOString();
  const localLibrary=studioLibrary.filter(project=>project.id!==activeId).map(copyJson);localLibrary.unshift(localProject);
  if(studioRecoveryWarning){studioDirty=true;showStudioSaveError('RECOVERY REQUIRED · EXPORT RAW DATA');return false;}
  try{
    return await withExclusiveStorageLock(STUDIO_LOCK,async()=>{
      if(readStorageEpoch()!==transactionEpoch||transactionEpoch!==loadedStorageEpoch){studioConflictWarning='Local data was cleared or reset in another tab. Reload before saving to prevent restoring stale projects.';studioDirty=true;showStudioSaveError('WORKSPACE RESET ELSEWHERE · RELOAD');toast(studioConflictWarning);return false;}
      let nextLibrary=localLibrary;const latestRaw=localStorage.getItem(STUDIO_STORE);
      if(latestRaw!==studioBaselineRaw){
        const remote=parseStudioWorkspace(latestRaw);
        if(!remote.ok){studioConflictWarning=`Another tab changed the workspace: ${remote.reason} Export this session and reload before editing further.`;studioDirty=true;showStudioSaveError('CONFLICT · EXPORT AND RELOAD');$('#exportRecoveryData').hidden=false;toast(studioConflictWarning);return false;}
        const merged=reconcileStudioProjects(studioBaselineProjects,localLibrary,remote.projects,8);
        if(!merged.ok){studioConflictWarning=`Workspace conflict: ${merged.reason}. Nothing was overwritten. Export this session and reload before continuing.`;studioDirty=true;showStudioSaveError('CONFLICT · EXPORT AND RELOAD');$('#exportRecoveryData').hidden=false;toast(studioConflictWarning);return false;}
        nextLibrary=merged.records;
        if(!nextLibrary.some(project=>project.id===activeId)){studioConflictWarning='The active project was deleted in another tab. This session was preserved; export it before reloading.';studioDirty=true;showStudioSaveError('PROJECT REMOVED ELSEWHERE');$('#exportRecoveryData').hidden=false;toast(studioConflictWarning);return false;}
      }
      const savedActive=nextLibrary.find(project=>project.id===activeId);
      const serialized=JSON.stringify({format:'dreamforge-studio-library',version:1,activeId,projects:nextLibrary});
      if(!storageBudgetAllows(localStorage,STUDIO_STORE,serialized)){studioDirty=true;showStudioSaveError('LOCAL STORAGE BUDGET · EXPORT / TRIM HISTORY');toast('Workspace exceeds the safe 4 MiB browser-storage budget. Export it and reduce older snapshots or notes before saving.');return false;}
      localStorage.setItem(STUDIO_STORE,serialized);if(localStorage.getItem(STUDIO_STORE)!==serialized)throw new Error('The saved Studio workspace failed read-back verification.');studioBaselineRaw=serialized;studioBaselineProjects=nextLibrary.map(copyJson);studioConflictWarning='';
      if(studioMutationRevision===revision){studioLibrary=nextLibrary;studioProject=savedActive;current=savedActive.creation;studioDirty=false;const state=$('#studioSaveState');if(state){state.innerHTML='<i></i> SAVED LOCALLY';state.classList.remove('save-error');}}
      else{studioDirty=true;const state=$('#studioSaveState');if(state){state.textContent='NEWER CHANGES · SAVING…';state.classList.remove('save-error');}}
      updateStorageMeter();renderFiles();return true;
    });
  }catch(error){studioDirty=true;showStudioSaveError('STORAGE LOCK / QUOTA · EXPORT PROJECT');toast(error?.message||'Workspace storage failed. Export your project.');return false;}
}
async function importStudioProjectCopy(payload,meta){
  if(studioActionBusy||studioImportBusy)throw new Error('Another Studio project action is already running.');
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||payload.format!=='dreamforge-project-handoff'||payload.schemaVersion!==1||!payload.project||typeof payload.project!=='object'||Array.isArray(payload.project))throw new Error('The incoming DREAMFORGER project handoff has an unsupported structure.');
  if(!meta||meta.sourceExperienceId!=='dreamforger'||meta.type!==DREAMFORGER_ARTIFACT_TYPE||typeof meta.id!=='string'||!/^[a-z0-9][a-z0-9._:-]{0,95}$/i.test(meta.id))throw new Error('The incoming project provenance is invalid.');
  let serialized;try{serialized=JSON.stringify(payload);}catch{throw new Error('The incoming project cannot be serialized safely.');}
  if(typeof serialized!=='string')throw new Error('The incoming project cannot be serialized safely.');
  const bytes=new TextEncoder().encode(serialized).byteLength;if(bytes>MAX_PROJECT_HANDOFF_BYTES)throw new Error('The incoming project exceeds the 2 MiB safe handoff limit.');
  const lockManager=window.navigator?.locks;
  if(typeof lockManager?.request!=='function')throw new Error('Cross-tab safe project import is unavailable in this browser. No project was changed.');
  // Claim the in-tab state machine before the first await. The per-artifact
  // Web Lock then serializes the same incoming copy across every open tab.
  studioActionBusy=true;studioImportBusy=true;
  try{
    return await lockManager.request(`dreamforger:studio-import:v1:${meta.id}`,{mode:'exclusive'},async()=>{
      if(studioRecoveryWarning||studioConflictWarning)throw new Error('Studio recovery or conflict state must be resolved before importing. Existing project data was preserved.');
      if(!await flushCareerBeforeTransition())throw new Error('The current Career Suite changes could not be saved. No project was imported.');
      if(!await flushStudioPersist()&&studioDirty)throw new Error('The current Studio project could not be saved. No project was imported.');
      // A prior tab may have completed this import while this callback waited
      // for its lock. Reload the persisted workspace before duplicate and quota
      // checks so the second tab observes the committed source lineage.
      if(!refreshStudioFromStorage(false))throw new Error('The Studio workspace could not be refreshed safely. No project was imported.');
      if(studioRecoveryWarning||studioConflictWarning)throw new Error('Studio recovery or conflict state must be resolved before importing. Existing project data was preserved.');
      const already=studioLibrary.find(project=>project.sourceReference?.sourceExperienceId==='dreamforger'&&project.sourceReference?.artifactId===meta.id);
      if(already)return {imported:true,alreadyImported:true,projectId:already.id};
      if(studioLibrary.length>=8)throw new Error('The Studio library already contains eight projects. Back up or remove one before importing another.');
      const source=payload.project;const normalized=safeNormalizeStudioProject(source);
      if(!normalized||hasStudioNormalizationLoss(source,normalized))throw new Error('The incoming project contains unsupported or oversized fields that would be lost during normalization. Nothing was imported.');
      const sourceProjectId=boundedText(source.id,'',120);
      if(!sourceProjectId)throw new Error('The incoming project has no stable source project identifier.');
      const importedAt=new Date().toISOString();
      const copy=copyJson(normalized);
      copy.id=`import-${Date.now().toString(36)}-${String(randomSeed()).replace(/[^a-z0-9]/gi,'').slice(0,20)}`.slice(0,120);
      copy.parentProjectId=boundedText(source.parentProjectId||sourceProjectId,'',120);
      copy.sourceReference={schemaVersion:1,sourceExperienceId:'dreamforger',artifactType:DREAMFORGER_ARTIFACT_TYPE,artifactId:meta.id,title:boundedText(meta.title||source.title||'DREAMFORGER project',160),importedAt};
      copy.updatedAt=importedAt;
      if(studioLibrary.some(project=>project.id===copy.id))throw new Error('A project identifier collision occurred. Retry the import; no existing project was changed.');
      const previous={library:studioLibrary.map(copyJson),project:studioProject?copyJson(studioProject):null,current:current?copyJson(current):null,dirty:studioDirty,raw:localStorage.getItem(STUDIO_STORE)};
      try{
        studioLibrary=[copy,...studioLibrary.map(copyJson)];studioProject=copy;current=copy.creation;studioDirty=true;
        const saved=await persistStudio();
        let committed=false;
        if(saved){const stored=localStorage.getItem(STUDIO_STORE);const parsed=parseStudioWorkspace(stored);committed=parsed.ok&&parsed.projects.some(project=>project.id===copy.id&&project.sourceReference?.artifactId===meta.id);}
        if(!committed){
          // A setItem can succeed immediately before a later failure. Treat a
          // verified persisted copy as committed; otherwise restore only memory.
          let stored=null;try{stored=localStorage.getItem(STUDIO_STORE);}catch{}
          const parsed=parseStudioWorkspace(stored);
          if(parsed.ok&&parsed.projects.some(project=>project.id===copy.id&&project.sourceReference?.artifactId===meta.id)){
            studioLibrary=parsed.projects.map(copyJson);studioProject=studioLibrary.find(project=>project.id===copy.id)||studioLibrary[0]||null;current=studioProject?.creation||null;studioBaselineRaw=stored;studioBaselineProjects=studioLibrary.map(copyJson);studioDirty=false;committed=true;
          } else {
            studioLibrary=previous.library;studioProject=previous.project;current=previous.current;studioDirty=previous.dirty;
            if(stored!==previous.raw){studioConflictWarning='An unexpected workspace change occurred during the import. Existing browser data was preserved; inspect and export a recovery copy before retrying.';}
            renderStudio();renderFiles();throw new Error('The project copy could not be verified in persistent storage. The existing Studio workspace was restored; retry after checking storage.');
          }
        }
        renderStudio();renderFiles();renderGlobalProjectContext();renderOsHub();
        await navigate('studio');window.dispatchEvent(new CustomEvent('dreamforger:project-switched',{detail:{projectId:copy.id,eventType:'project-created'}}));
        toast('DREAMFORGER project imported as a new copy. The source project and existing projects remain unchanged.');
        return {imported:true,alreadyImported:false,projectId:copy.id,parentProjectId:copy.parentProjectId};
      }catch(error){
        // Persistence may have committed even if a later UI transition failed.
        // Never undo a verified durable import merely because rendering failed.
        throw error;
      }
    });
  } finally {studioImportBusy=false;studioActionBusy=false;}
}
function makeDreamforgerAdapterCallbacks(){
  return {
    async exportProjects(){
      if(!await flushCareerBeforeTransition())throw new Error('Career Suite changes could not be saved before export.');
      if(!await flushStudioPersist()&&studioDirty)throw new Error('Studio changes could not be saved before export.');
      if(!studioProject)return [];
      const project=copyJson(studioProject);const payload={format:'dreamforge-project-handoff',schemaVersion:1,project};
      const bytes=new TextEncoder().encode(JSON.stringify(payload)).byteLength;
      if(bytes>MAX_PROJECT_HANDOFF_BYTES)throw new Error('The active project exceeds the 2 MiB native artifact limit. Use a standard project backup.');
      return [{type:DREAMFORGER_ARTIFACT_TYPE,title:`DREAMFORGER · ${project.title||'Untitled project'}`,data:payload,metadata:{projectId:project.id,parentProjectId:project.parentProjectId||null,projectVersion:APP_VERSION,handoffFormat:'dreamforge-project-handoff-v1'}}];
    },
    importProjectCopy:importStudioProjectCopy,
    setImportBusy(busy){curioidAdapterBusy=Boolean(busy);const button=$('#osHubShareProject');if(button)button.disabled=curioidAdapterBusy||!curioidIntegration?.connected||!studioProject;const status=$('#osHubStatus');if(status&&curioidAdapterBusy)status.textContent='IMPORTING A VALIDATED PROJECT COPY OR METADATA REFERENCE…';}
  };
}
async function openStudio(){if(studioOpeningBusy||studioActionBusy)return;studioOpeningBusy=true;try{if(!await flushCareerBeforeTransition())return;if(studioDirty){const saved=await flushStudioPersist();if(!saved&&studioDirty){toast('Opening the Studio is paused until the current workspace is safely saved or exported.');return;}}if(!current){if(studioProject)current=studioProject.creation;else if(archive.length)current=archive[0];else current=createCreation({category:'anything',seed:randomSeed(),chaos:65,prompt:'A small impossible thing with a useful purpose',coherent:true});}const existing=studioLibrary.find(p=>p.creation.id===current.id)||studioLibrary.find(p=>p.id===`studio-${current.id}`)||null;if(!existing&&studioLibrary.length>=8){toast('Studio library is full. Export or delete a project before opening another.');studioProject=studioLibrary[0];current=studioProject.creation;renderStudio();await navigate('studio');window.dispatchEvent(new CustomEvent('dreamforger:project-switched',{detail:{projectId:studioProject.id}}));return;}studioProject=existing;if(!studioProject){studioProject=makeStudioProject(current);await persistStudio();}renderStudio();await navigate('studio');window.dispatchEvent(new CustomEvent('dreamforger:project-switched',{detail:{projectId:studioProject.id,eventType:existing?'project-opened':'project-created'}}));}finally{studioOpeningBusy=false;}}
function renderStudioProjectPicker(){const picker=$('#studioProjectPicker');if(picker)picker.innerHTML='<option value="">SWITCH PROJECT…</option>'+studioLibrary.map(p=>`<option value="${safeText(p.id)}" ${p.id===studioProject?.id?'selected':''}>${safeText(p.title||'Untitled project')}</option>`).join('');renderGlobalProjectContext();}
function renderGlobalProjectContext(){const picker=$('#globalProjectContext');if(!picker)return;const recentIds=projectContext.recentProjectIds||[];const recent=recentIds.map(id=>studioLibrary.find(p=>p.id===id)).filter(Boolean);const others=studioLibrary.filter(p=>!recentIds.includes(p.id));const option=p=>`<option value="${safeText(p.id)}" ${p.id===studioProject?.id?'selected':''}>${safeText(p.title||'Untitled project')}</option>`;picker.innerHTML=recent.length?`<optgroup label="RECENT">${recent.map(option).join('')}</optgroup>${others.length?`<optgroup label="ALL PROJECTS">${others.map(option).join('')}</optgroup>`:''}`:studioLibrary.map(option).join('');if(!studioLibrary.length)picker.innerHTML='<option value="">NO ACTIVE PROJECT</option>';picker.disabled=!studioLibrary.length;picker.setAttribute('aria-label',studioProject?`Active project: ${studioProject.title}`:'No active project');}
function studioSnapshotData(){return JSON.parse(JSON.stringify({title:studioProject.title,tagline:studioProject.tagline,audience:studioProject.audience,goal:studioProject.goal,firstStep:studioProject.firstStep,success:studioProject.success,notes:studioProject.notes,tasks:studioProject.tasks,canvasNodes:studioProject.canvasNodes,groups:studioProject.groups||[],assets:studioProject.assets||[],mapView:studioProject.mapView||{zoom:1,left:0,top:0},career:studioProject.career?normalizeCareerData(studioProject.career):null,creation:studioProject.creation}));}
let snapshotBusy=false;
async function saveStudioSnapshot(label='',quiet=false){if(!studioProject||snapshotBusy)return false;snapshotBusy=true;try{studioProject.snapshots.unshift({id:`v-${Date.now()}-${randomSeed()}`,label:boundedText(label||`Snapshot ${String(studioProject.snapshots.length+1).padStart(2,'0')}`,`Snapshot ${String(studioProject.snapshots.length+1).padStart(2,'0')}`,60),createdAt:new Date().toISOString(),data:studioSnapshotData()});studioProject.snapshots=studioProject.snapshots.slice(0,10);const saved=await persistStudio();renderStudioHistory();if(!quiet)toast(saved?'Snapshot saved. You can restore it at any time.':'Snapshot exists for this session, but browser storage failed. Export the workspace.');return saved;}finally{snapshotBusy=false;}}
function renderStudioHistory(){const el=$('#studioVersionList');if(!el)return;el.innerHTML=studioProject.snapshots.length?studioProject.snapshots.map((v,i)=>`<article class="version-entry"><div class="version-marker">${String(studioProject.snapshots.length-i).padStart(2,'0')}</div><div><strong>${safeText(v.label)}</strong><small>${new Date(v.createdAt).toLocaleString()} · ${safeText(v.data.title||'Untitled')}</small></div><button class="outline-button" data-restore-version="${safeText(v.id)}">RESTORE THIS VERSION</button></article>`).join(''):'<div class="studio-empty">No snapshots yet. Save one before a major experiment, then you can safely explore.</div>';$('#studioVersionLabel').textContent=`VERSION ${String(studioProject.snapshots.length+1).padStart(2,'0')}`;const a=$('#historyCompareA'),b=$('#historyCompareB');if(a&&b){const opts=studioProject.snapshots.map(v=>`<option value="${safeText(v.id)}">${safeText(v.label)}</option>`).join('');const branches=studioLibrary.filter(p=>p.id!==studioProject.id&&(p.parentProjectId===studioProject.id||studioProject.parentProjectId===p.id)).map(p=>`<option value="project:${safeText(p.id)}">BRANCH · ${safeText(p.title)}</option>`).join('');a.innerHTML=opts;b.innerHTML=opts+'<option value="__current__">CURRENT PROJECT</option>'+branches;if(studioProject.snapshots.length){a.selectedIndex=0;b.value='__current__';}}}
function renderStudioPressure(){const chosen=PRESSURE_TESTS[(pressureIndex%PRESSURE_TESTS.length)];$('#studioPressure').innerHTML=`<div class="pressure-number">${String(pressureIndex+1).padStart(2,'0')} / ${PRESSURE_TESTS.length}</div><strong>${chosen[0]}</strong><p>${chosen[1]}</p>`;}
function renderStudioReadiness(){const p=studioProject;const checks=[['A clear one-line premise',p.tagline],['A defined audience',p.audience],['A concrete first interaction',p.firstStep],['A signal of success',p.success],['At least one test task',p.tasks.length>0]];$('#studioReadiness').innerHTML=checks.map(([label,value])=>`<div class="readiness-row"><span class="readiness-check ${String(value||'').trim()?'ready':''}">${String(value||'').trim()?'✓':'·'}</span><span>${label}</span><small>${String(value||'').trim()?'DEFINED':'NEEDS WORK'}</small></div>`).join('');}
function renderStudio(){if(!studioProject)return;projectHistory.clear();activeMapInspectorId=studioProject.canvasNodes[0]?.id||'';selectedMapNodes.clear();activeMapGroupFilter='';activeMapSearch='';activeAssetSearch='';if($('#mapSearch'))$('#mapSearch').value='';if($('#assetSearch'))$('#assetSearch').value='';const p=studioProject,c=p.creation;$('#studioProjectName').value=p.title;renderStudioProjectPicker();$('#studioTagline').value=p.tagline;$('#studioAudience').value=p.audience;$('#studioGoal').value=p.goal;$('#studioFirstStep').value=p.firstStep;$('#studioSuccess').value=p.success;$('#studioNotes').value=p.notes||'';$('#studioNotesCount').textContent=`${(p.notes||'').length} / 12000`;$('#studioSeedLabel').textContent=`SEED ${c.seed}`;$('#studioStatusLabel').textContent=p.tasks.some(t=>t.status==='doing')?'IN PROGRESS':'WORK IN PROGRESS';updateStudioPreview();canvasZoom=studioProject.mapView?.zoom||1;renderProjectCanvas();const mapViewport=$('#canvasViewport');if(mapViewport){mapViewport.scrollLeft=studioProject.mapView?.left||0;mapViewport.scrollTop=studioProject.mapView?.top||0;}renderStudioBoard();renderStudioHistory();renderStudioPressure();renderStudioReadiness();$('#studioPromptStack').innerHTML=STUDIO_PROMPTS.map((q,i)=>`<button class="studio-prompt" data-insert-prompt="${i}"><span>✦</span>${safeText(q)}<b>↗</b></button>`).join('');renderStudioMethods();}
function updateStudioPreview(){if(!studioProject)return;const p=studioProject,c=p.creation;$('#previewTitle').textContent=p.title||'Untitled project';$('#previewTagline').textContent=p.tagline||c.description;$('#previewCategory').textContent=`${(CATEGORIES[c.category]?.label||'CONCEPT').toUpperCase()} / LIVE CONCEPT`;$('#previewPrompt').textContent=p.firstStep||'Choose your first interaction';$('#previewAction').textContent=(p.firstStep||'TRY THE INTERACTION').toUpperCase().slice(0,42)+' ↗';$('#previewFeedback').textContent='Prototype ready. Nothing is sent anywhere.';$('#previewCounter').textContent=`INTERACTIONS ${String(studioInteractions).padStart(2,'0')}`;}
const EDGE_LABELS={'leads-to':'LEADS TO','informs':'INFORMS','tests':'TESTS','blocks':'BLOCKS','depends-on':'DEPENDS ON','derived-from':'DERIVED FROM','delivers':'DELIVERS'};
let canvasZoom=1;
function setCanvasZoom(value,announce=true){
  canvasZoom=Math.max(.2,Math.min(1.5,Math.round(Number(value)*100)/100));
  const canvas=$('#projectCanvas'),viewport=$('#canvasViewport');
  if(!canvas||!viewport)return;
  canvas.style.zoom=String(canvasZoom);
  if(studioProject){studioProject.mapView=studioProject.mapView||{zoom:1,left:0,top:0};studioProject.mapView.zoom=canvasZoom;}
  canvas.dataset.scale=String(canvasZoom);
  const label=$('#canvasZoomLabel');if(label)label.textContent=`${Math.round(canvasZoom*100)}%`;
  if(announce){const status=$('#canvasMapStatus');if(status)status.textContent=`MAP ZOOM ${Math.round(canvasZoom*100)}%`;if(studioProject)scheduleStudioPersist();}
}
function fitCanvasToView(){
  const viewport=$('#canvasViewport'),nodes=studioProject?.canvasNodes||[];
  if(!viewport||!nodes.length){setCanvasZoom(1);return;}
  const right=Math.max(...nodes.map(n=>n.x+260))+36;
  const bottom=Math.max(...nodes.map(n=>n.y+230))+36;
  const scale=Math.min(1, (viewport.clientWidth-36)/right, (viewport.clientHeight-36)/bottom);
  setCanvasZoom(Math.max(.2,scale));viewport.scrollTo({left:0,top:0,behavior:'smooth'});if(studioProject){studioProject.mapView={zoom:canvasZoom,left:0,top:0};scheduleStudioPersist();}
  toast(`Map fitted to view at ${Math.round(canvasZoom*100)}%.`);
}
let selectedMapNodes=new Set();let activeMapGroupFilter='';let activeMapSearch='';let activeAssetSearch='';
const projectHistory=new ProjectHistory(40);let activeMapInspectorId='';
function workflowUndoState(){return snapshotWorkflowState(studioProject);}
function updateWorkflowHistoryControls(){const undo=$('#mapUndo'),redo=$('#mapRedo');if(undo){undo.disabled=!projectHistory.canUndo;undo.setAttribute('aria-label',projectHistory.canUndo?'Undo last project workflow edit':'Nothing to undo');}if(redo){redo.disabled=!projectHistory.canRedo;redo.setAttribute('aria-label',projectHistory.canRedo?'Redo project workflow edit':'Nothing to redo');}}
function recordWorkflowUndo(label){if(!studioProject)return;projectHistory.record(workflowUndoState(),label);updateWorkflowHistoryControls();}
function beginWorkflowUndo(label){if(studioProject)projectHistory.begin(workflowUndoState(),label);}
function commitWorkflowUndo(){if(studioProject)projectHistory.commit(workflowUndoState());updateWorkflowHistoryControls();}
async function applyWorkflowHistory(direction){if(!studioProject)return;const result=direction==='undo'?projectHistory.undo(workflowUndoState()):projectHistory.redo(workflowUndoState());if(!result){updateWorkflowHistoryControls();return;}Object.assign(studioProject,{canvasNodes:result.state.canvasNodes,groups:result.state.groups,assets:result.state.assets,tasks:result.state.tasks});selectedMapNodes.clear();activeMapInspectorId=studioProject.canvasNodes[0]?.id||'';const saved=await persistStudio();renderProjectCanvas();renderStudioBoard();renderStudioReadiness();updateWorkflowHistoryControls();toast(saved?`${direction==='undo'?'Undid':'Redid'}: ${result.label}`:`${direction==='undo'?'Undid':'Redid'} ${result.label} for this session, but storage failed. Export the project.`);}
function renderMapInspector(){const panel=$('#mapInspector');if(!panel||!studioProject)return;const node=studioProject.canvasNodes.find(item=>item.id===activeMapInspectorId)||studioProject.canvasNodes[0];if(node)activeMapInspectorId=node.id;const title=$('#mapInspectorTitle'),body=$('#mapInspectorBody'),status=$('#mapInspectorStatus'),group=$('#mapInspectorGroup'),tasks=$('#mapInspectorTasks'),assets=$('#mapInspectorAssets');const empty=!node;[title,body,status,group,tasks,assets].forEach(el=>{if(el)el.disabled=empty;});if(!node){panel.querySelector('[data-inspector-empty]').hidden=false;panel.querySelector('[data-inspector-fields]').hidden=true;}else{panel.querySelector('[data-inspector-empty]').hidden=true;panel.querySelector('[data-inspector-fields]').hidden=false;title.value=node.title;body.value=node.body;status.value=node.status;group.innerHTML='<option value="">UNGROUPED</option>'+(studioProject.groups||[]).map(item=>`<option value="${safeText(item.id)}">${safeText(item.name)}</option>`).join('');group.value=node.groupId||'';tasks.innerHTML=studioProject.tasks.map(item=>`<option value="${safeText(item.id)}">${safeText(item.title)}</option>`).join('');[...tasks.options].forEach(option=>option.selected=(node.taskIds||[]).includes(option.value));assets.innerHTML=(studioProject.assets||[]).map(item=>`<option value="${safeText(item.id)}">${safeText(item.title)}</option>`).join('');[...assets.options].forEach(option=>option.selected=(node.assetIds||[]).includes(option.value));panel.querySelector('[data-inspector-type]').textContent=node.type.toUpperCase();panel.querySelector('[data-inspector-id]').textContent=node.id;}
 const pulse=analyzeProject(studioProject),summary=$('#projectPulseSummary'),list=$('#projectPulseList');if(summary)summary.textContent=`${pulse.totals.findings} FINDINGS · ${pulse.totals.attention} NEED ATTENTION`;if(list)list.innerHTML=pulse.findings.map(item=>`<button type="button" class="pulse-finding pulse-${item.severity}" data-pulse-finding="${safeText(item.refs[0]||'')}"><span>${safeText(item.title)}</span><small>${safeText(item.detail)}</small></button>`).join('')||'<p class="pulse-clear">No structural gaps detected. Keep experimenting.</p>';updateWorkflowHistoryControls();}
function renderMapMinimap(){const svg=$('#canvasMinimap');if(!svg||!studioProject)return;const nodes=studioProject.canvasNodes||[];const maxX=Math.max(1400,...nodes.map(n=>n.x+260)),maxY=Math.max(900,...nodes.map(n=>n.y+220));svg.setAttribute('viewBox',`0 0 ${maxX} ${maxY}`);svg.innerHTML=nodes.filter(n=>(!activeMapGroupFilter||n.groupId===activeMapGroupFilter)&&(!activeMapSearch||`${n.title} ${n.body} ${n.type}`.toLowerCase().includes(activeMapSearch))).map(n=>`<rect data-mini-node="${safeText(n.id)}" tabindex="0" role="button" aria-label="Jump to ${safeText(n.title)}" x="${n.x}" y="${n.y}" width="244" height="190" rx="12" class="mini-node mini-${safeText(n.type)}"/>`).join('');}
function renderWorkflowPanels(){if(!studioProject)return;const groups=studioProject.groups||[],assets=studioProject.assets||[];const groupList=$('#mapGroupList');if(groupList)groupList.innerHTML=groups.map(g=>`<span class="workflow-chip tone-${g.tone}">${safeText(g.name)} <button type="button" data-group-delete="${safeText(g.id)}" aria-label="Delete group ${safeText(g.name)}">×</button></span>`).join('')||'<small>No groups yet. Add one to organize map elements.</small>';const assetList=$('#projectAssetList');if(assetList)assetList.innerHTML=assets.filter(a=>!activeAssetSearch||`${a.title} ${a.kind} ${a.description} ${a.url}`.toLowerCase().includes(activeAssetSearch)).map(a=>`<article class="asset-row"><div><b>${safeText(a.title)}</b><small>${safeText(a.kind.toUpperCase())} · ${safeText(a.description||a.url||a.source||'No description')} · ${safeText((a.confidence||'unassessed').toUpperCase())}</small></div>${a.url?`<a href="${safeText(a.url)}" target="_blank" rel="noopener noreferrer">OPEN ↗</a>`:''}<button type="button" data-asset-edit="${safeText(a.id)}" aria-label="Edit ${safeText(a.title)}" title="Edit reference">✎</button><button type="button" data-asset-delete="${safeText(a.id)}" aria-label="Remove ${safeText(a.title)}">×</button></article>`).join('')||(assets.length&&activeAssetSearch?'<small>No assets match this search.</small>':'<small>No assets registered yet. Add links and references to keep project material together.</small>');const selects=$('#mapGroupFilter');if(selects){selects.innerHTML='<option value="">ALL GROUPS</option>'+groups.map(g=>`<option value="${safeText(g.id)}">${safeText(g.name)}</option>`).join('');selects.value=activeMapGroupFilter;}renderMapMinimap();}
function renderProjectCanvas(){
  const root=$('#canvasNodes'),svg=$('#canvasConnections');
  if(!root||!svg||!studioProject)return;
  const nodes=studioProject.canvasNodes||[],mapHeight=projectMapHeight(nodes);
  $('#projectCanvas').style.height=`${mapHeight}px`;setCanvasZoom(canvasZoom,false);
  svg.setAttribute('viewBox',`0 0 1400 ${mapHeight}`);svg.style.height=`${mapHeight}px`;
  $('#canvasNodeCount').textContent=`${nodes.length} ELEMENT${nodes.length===1?'':'S'}`;
  root.innerHTML=nodes.map(n=>{
    const opts=nodes.filter(x=>x.id!==n.id).map(x=>`<option value="${safeText(x.id)}">${safeText(x.title)}</option>`).join('');
    const edges=n.connections||[];
    const edgeList=edges.map(edge=>{
      const target=nodes.find(x=>x.id===edge.target);
      return target?`<span class="canvas-edge-chip"><b>${safeText(EDGE_LABELS[edge.type]||'LEADS TO')}</b><span>${safeText(target.title)}</span><button type="button" data-edge-remove="${safeText(n.id)}" data-edge-target="${safeText(edge.target)}" aria-label="Remove ${safeText(EDGE_LABELS[edge.type]||'connection')} connection to ${safeText(target.title)}">×</button></span>`:'';
    }).join('');
    return `<article ${(activeMapGroupFilter&&n.groupId!==activeMapGroupFilter)||(activeMapSearch&&!`${n.title} ${n.body} ${n.type}`.toLowerCase().includes(activeMapSearch))?'hidden':''} class="canvas-node node-${n.type}" data-canvas-node="${safeText(n.id)}" style="left:${n.x}px;top:${n.y}px">
      <header class="canvas-node-head" data-drag-handle="${safeText(n.id)}" tabindex="0" aria-label="Move ${safeText(n.title)} with arrow keys. Hold Shift to move farther."><label class="node-select"><input type="checkbox" data-node-select="${safeText(n.id)}" ${selectedMapNodes.has(n.id)?'checked':''} aria-label="Select ${safeText(n.title)}"></label><span class="node-kind">${n.type.toUpperCase()}</span><button type="button" data-node-delete="${safeText(n.id)}" aria-label="Remove ${safeText(n.title)}">×</button></header>
      <label class="canvas-node-title-label"><span>ELEMENT NAME</span><input data-node-title="${safeText(n.id)}" maxlength="80" value="${safeText(n.title)}" aria-label="Element name"></label>
      <label class="canvas-node-body-label"><span>THINKING / DETAILS</span><textarea data-node-body="${safeText(n.id)}" maxlength="420" rows="3" aria-label="Element details">${safeText(n.body)}</textarea></label>
      <label class="canvas-link-heading" for="edgeTarget-${safeText(n.id)}">RELATIONSHIPS <small>${edges.length}/8</small></label>
      <div class="canvas-edge-add"><select id="edgeTarget-${safeText(n.id)}" data-edge-target-select="${safeText(n.id)}" aria-label="Choose an element to connect" ${nodes.length<2||edges.length>=8?'disabled':''}><option value="">CHOOSE ELEMENT</option>${opts}</select><select data-edge-type-select="${safeText(n.id)}" aria-label="Choose relationship type"><option value="leads-to">LEADS TO</option>${PROJECT_MAP_EDGE_TYPES.filter(t=>t!=='leads-to').map(t=>`<option value="${t}">${EDGE_LABELS[t]}</option>`).join('')}</select><button type="button" data-edge-add="${safeText(n.id)}" aria-label="Add relationship" ${nodes.length<2||edges.length>=8?'disabled':''}>+</button></div>
      <div class="canvas-edge-list">${edgeList||'<small class="canvas-no-edges">No relationships yet.</small>'}</div>
      <div class="node-production-links"><label>GROUP<select data-node-group="${safeText(n.id)}"><option value="">UNGROUPED</option>${(studioProject.groups||[]).map(g=>`<option value="${safeText(g.id)}" ${n.groupId===g.id?'selected':''}>${safeText(g.name)}</option>`).join('')}</select></label><label>LINK TASKS <small>CTRL/⌘-CLICK FOR MULTIPLE</small><select multiple size="3" data-node-task="${safeText(n.id)}" aria-label="Link multiple tasks">${studioProject.tasks.map(t=>`<option value="${safeText(t.id)}" ${(n.taskIds||[]).includes(t.id)?'selected':''}>${safeText(t.title)}</option>`).join('')}</select></label><label>LINK ASSETS <small>CTRL/⌘-CLICK FOR MULTIPLE</small><select multiple size="3" data-node-asset="${safeText(n.id)}" aria-label="Link multiple assets">${(studioProject.assets||[]).map(a=>`<option value="${safeText(a.id)}" ${(n.assetIds||[]).includes(a.id)?'selected':''}>${safeText(a.title)}</option>`).join('')}</select></label></div><footer class="canvas-node-foot"><select data-node-status="${safeText(n.id)}" aria-label="Element status"><option value="open" ${n.status==='open'?'selected':''}>OPEN</option><option value="active" ${n.status==='active'?'selected':''}>ACTIVE</option><option value="done" ${n.status==='done'?'selected':''}>DONE</option><option value="blocked" ${n.status==='blocked'?'selected':''}>BLOCKED</option></select></footer>
    </article>`;
  }).join('');
  renderCanvasLinksOnly();renderWorkflowPanels();renderMapInspector();
}
function renderCanvasLinksOnly(){
  const svg=$('#canvasConnections');if(!svg||!studioProject)return;
  const nodes=studioProject.canvasNodes||[],byId=new Map(nodes.map(n=>[n.id,n])),mapHeight=projectMapHeight(nodes);
  $('#projectCanvas').style.height=`${mapHeight}px`;setCanvasZoom(canvasZoom,false);svg.setAttribute('viewBox',`0 0 1400 ${mapHeight}`);svg.style.height=`${mapHeight}px`;
  const visibleNodes=nodes.filter(n=>(!activeMapGroupFilter||n.groupId===activeMapGroupFilter)&&(!activeMapSearch||`${n.title} ${n.body} ${n.type}`.toLowerCase().includes(activeMapSearch)));const visibleIds=new Set(visibleNodes.map(n=>n.id));const edges=visibleNodes.flatMap(n=>(n.connections||[]).filter(edge=>visibleIds.has(edge.target)&&byId.has(edge.target)).map(edge=>({source:n,target:byId.get(edge.target),type:edge.type}))); 
  svg.innerHTML=edges.map(({source,target,type},index)=>{
    const x1=source.x+244,y1=source.y+104,x2=target.x,y2=target.y+104,cx=(x1+x2)/2,lift=((index%5)-2)*9;
    return `<path d="M ${x1} ${y1} C ${cx} ${y1+lift}, ${cx} ${y2+lift}, ${x2} ${y2}" class="canvas-link-path edge-${safeText(type)}"/><circle cx="${x2}" cy="${y2}" r="4" class="canvas-link-dot"/><text x="${cx}" y="${(y1+y2)/2+lift-7}" text-anchor="middle" class="canvas-link-label">${safeText(EDGE_LABELS[type]||'LEADS TO')}</text>`;
  }).join('');
  const visibleCount=visibleNodes.length;$('#canvasMapStatus').textContent=`${edges.length} RELATIONSHIP${edges.length===1?'':'S'} · ${visibleCount}/${nodes.length} VISIBLE`; 
}
function addCanvasNode(type){if(!studioProject)return;if(studioProject.canvasNodes.length>=40){toast('Project map limit reached (40 elements).');return;}recordWorkflowUndo('Add map element');const titles={idea:'New idea',question:'Open question',experiment:'Experiment to run',decision:'Decision to make',output:'Desired output',note:'Field note'};const n={id:`node-${Date.now()}-${randomSeed()}`,type,title:titles[type]||'New element',body:'Add the useful detail here…',x:60+(studioProject.canvasNodes.length%3)*340,y:80+Math.floor(studioProject.canvasNodes.length/3)*220,connections:[],connectsTo:'',status:'open'};studioProject.canvasNodes.push(n);void persistStudio();renderProjectCanvas();$('#canvasNodes').querySelector(`[data-node-title="${n.id}"]`)?.focus();}
function arrangeCanvas(){if(!studioProject)return;recordWorkflowUndo('Arrange Project Map');studioProject.canvasNodes=arrangeProjectMap(studioProject.canvasNodes);void persistStudio();renderProjectCanvas();toast('Project map arranged.');}
function bindCanvas(){
  const root=$('#canvasNodes');
  root.addEventListener('focusin',e=>{const title=e.target.dataset.nodeTitle,body=e.target.dataset.nodeBody;if(title||body)beginWorkflowUndo(title?'Edit element name':'Edit element details');else if(e.target.dataset.nodeGroup||e.target.dataset.nodeTask||e.target.dataset.nodeAsset||e.target.dataset.nodeStatus)beginWorkflowUndo('Edit element links or status');});
  root.addEventListener('focusout',e=>{if(e.target.dataset.nodeTitle||e.target.dataset.nodeBody){commitWorkflowUndo();renderMapInspector();}});
  root.addEventListener('input',e=>{
    const id=e.target.dataset.nodeTitle||e.target.dataset.nodeBody;if(!id)return;
    const n=studioProject?.canvasNodes.find(x=>x.id===id);if(!n)return;
    if(e.target.dataset.nodeTitle)n.title=e.target.value;
    if(e.target.dataset.nodeBody)n.body=e.target.value;
    scheduleStudioPersist();
  });
  root.addEventListener('change',e=>{
    const workflowId=e.target.dataset.nodeGroup||e.target.dataset.nodeTask||e.target.dataset.nodeAsset;if(workflowId){const n=studioProject?.canvasNodes.find(x=>x.id===workflowId);if(!n)return;if(e.target.dataset.nodeGroup)n.groupId=e.target.value;if(e.target.dataset.nodeTask)n.taskIds=[...e.target.selectedOptions].map(o=>o.value).slice(0,8);if(e.target.dataset.nodeAsset)n.assetIds=[...e.target.selectedOptions].map(o=>o.value).slice(0,12);commitWorkflowUndo();void persistStudio();renderMapInspector();return;}
    if(e.target.dataset.nodeSelect!==undefined){const id=e.target.dataset.nodeSelect;e.target.checked?selectedMapNodes.add(id):selectedMapNodes.delete(id);return;}
    const id=e.target.dataset.nodeStatus;if(!id)return;
    const n=studioProject?.canvasNodes.find(x=>x.id===id);if(!n)return;
    n.status=['open','active','done','blocked'].includes(e.target.value)?e.target.value:'open';commitWorkflowUndo();void persistStudio();renderMapInspector();
  });
  root.addEventListener('click',e=>{
    const card=e.target.closest('[data-canvas-node]');if(card&&!e.target.closest('button,input,textarea,select,label')){activeMapInspectorId=card.dataset.canvasNode;renderMapInspector();}
    const add=e.target.closest('[data-edge-add]');
    if(add){
      const id=add.dataset.edgeAdd,node=studioProject?.canvasNodes.find(x=>x.id===id);if(!node)return;
      const target=root.querySelector(`[data-edge-target-select="${id}"]`)?.value;
      const type=root.querySelector(`[data-edge-type-select="${id}"]`)?.value||'leads-to';
      if(!target){toast('Choose an element first.');return;}
      node.connections=node.connections||[];
      if(node.connections.some(edge=>edge.target===target)){toast('These elements already have a relationship. Remove it first to change its type.');return;}
      if(node.connections.length>=8){toast('Each element can have up to 8 outgoing relationships.');return;}
      recordWorkflowUndo('Add relationship');node.connections.push({target,type:PROJECT_MAP_EDGE_TYPES.includes(type)?type:'leads-to'});
      node.connectsTo=node.connections[0]?.target||'';void persistStudio();renderProjectCanvas();return;
    }
    const remove=e.target.closest('[data-edge-remove]');
    if(remove){
      const node=studioProject?.canvasNodes.find(x=>x.id===remove.dataset.edgeRemove);if(!node)return;
      recordWorkflowUndo('Remove relationship');node.connections=(node.connections||[]).filter(edge=>edge.target!==remove.dataset.edgeTarget);
      node.connectsTo=node.connections[0]?.target||'';void persistStudio();renderProjectCanvas();return;
    }
    const del=e.target.closest('[data-node-delete]');
    if(del){
      const id=del.dataset.nodeDelete;recordWorkflowUndo('Delete map element');
      studioProject.canvasNodes=studioProject.canvasNodes.filter(n=>n.id!==id);studioProject.assets.forEach(a=>{if(a.nodeId===id)a.nodeId='';});
      studioProject.canvasNodes.forEach(n=>{n.connections=(n.connections||[]).filter(edge=>edge.target!==id);n.connectsTo=n.connections[0]?.target||'';});
      void persistStudio();renderProjectCanvas();
    }
  });
  let drag=null;
  root.addEventListener('keydown',e=>{
    const handle=e.target.closest('[data-drag-handle]');
    if(!handle||e.target!==handle||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;
    const node=studioProject?.canvasNodes.find(n=>n.id===handle.dataset.dragHandle);if(!node)return;
    e.preventDefault();recordWorkflowUndo('Move map element');const step=e.shiftKey?80:20;
    if(e.key==='ArrowLeft')node.x=Math.max(12,node.x-step);if(e.key==='ArrowRight')node.x=Math.min(1160,node.x+step);
    if(e.key==='ArrowUp')node.y=Math.max(12,node.y-step);if(e.key==='ArrowDown')node.y=Math.min(6000,node.y+step);
    const card=root.querySelector(`[data-canvas-node="${node.id}"]`);if(card){card.style.left=`${node.x}px`;card.style.top=`${node.y}px`;}
    renderCanvasLinksOnly();scheduleStudioPersist();
  });
  root.addEventListener('pointerdown',e=>{
    const handle=e.target.closest('[data-drag-handle]');if(!handle||e.target.closest('button'))return;
    const node=studioProject?.canvasNodes.find(n=>n.id===handle.dataset.dragHandle);if(!node)return;
    if(drag)return;drag={id:node.id,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,x:node.x,y:node.y,persistScheduled:false,undoRecorded:false};handle.setPointerCapture?.(e.pointerId);
  });
  root.addEventListener('pointermove',e=>{
    if(!drag||e.pointerId!==drag.pointerId)return;const node=studioProject?.canvasNodes.find(n=>n.id===drag.id);if(!node)return;if(!drag.undoRecorded&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>2){recordWorkflowUndo('Move map element');drag.undoRecorded=true;}if(!drag.persistScheduled){drag.persistScheduled=true;scheduleStudioPersist();}
    const scale=Number(root.parentElement.dataset.scale)||1;
    node.x=Math.max(12,Math.min(1160,drag.x+(e.clientX-drag.startX)/scale));node.y=Math.max(12,Math.min(6000,drag.y+(e.clientY-drag.startY)/scale));
    const card=root.querySelector(`[data-canvas-node="${drag.id}"]`);if(card){card.style.left=`${node.x}px`;card.style.top=`${node.y}px`;}
    renderCanvasLinksOnly();
  });
  const stop=async e=>{if(!drag||(e?.pointerId!==undefined&&e.pointerId!==drag.pointerId))return;drag=null;await flushStudioPersist();};root.addEventListener('pointerup',stop);root.addEventListener('pointercancel',stop);root.addEventListener('lostpointercapture',stop);
  $$('[data-canvas-add]').forEach(b=>b.addEventListener('click',()=>addCanvasNode(b.dataset.canvasAdd)));
  $('#canvasAutoArrange').addEventListener('click',arrangeCanvas);
  $('#canvasZoomIn').addEventListener('click',()=>setCanvasZoom(canvasZoom+.1));
  $('#canvasZoomOut').addEventListener('click',()=>setCanvasZoom(canvasZoom-.1));
  $('#canvasZoomReset').addEventListener('click',()=>setCanvasZoom(1));
  $('#canvasFit').addEventListener('click',fitCanvasToView);
  $('#canvasViewport').addEventListener('wheel',e=>{if(!(e.ctrlKey||e.metaKey))return;e.preventDefault();setCanvasZoom(canvasZoom+(e.deltaY<0?.05:-.05));},{passive:false});
  window.addEventListener('keydown',e=>{if(!(e.ctrlKey||e.metaKey)||!['+','=','-','0'].includes(e.key))return;const target=e.target;if(target?.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target?.tagName))return;if(!$('#view-studio')?.classList.contains('active')||!$('#studioPane-canvas')?.classList.contains('active'))return;e.preventDefault();if(e.key==='0')setCanvasZoom(1);else setCanvasZoom(canvasZoom+(e.key==='-'?-.1:.1));});
  $('#mapGroupAdd').addEventListener('click',()=>{const name=$('#mapGroupName').value.trim().slice(0,48);if(!name)return;if(studioProject.groups.length>=12){toast('Maximum of 12 map groups.');return;}recordWorkflowUndo('Add map group');const group={id:`group-${randomSeed()}`,name,tone:['violet','blue','green','amber','rose','slate'][studioProject.groups.length%6]};studioProject.groups.push(group);$('#mapGroupName').value='';void persistStudio();renderProjectCanvas();});
  $('#mapGroupFilter').addEventListener('change',e=>{activeMapGroupFilter=e.target.value;selectedMapNodes.clear();renderProjectCanvas();});
  $('#mapSearch').addEventListener('input',e=>{activeMapSearch=e.target.value.trim().toLowerCase().slice(0,100);selectedMapNodes.clear();renderProjectCanvas();});
  $('#assetSearch').addEventListener('input',e=>{activeAssetSearch=e.target.value.trim().toLowerCase().slice(0,100);renderWorkflowPanels();});
  $('#mapGroupList').addEventListener('click',e=>{const b=e.target.closest('[data-group-delete]');if(!b)return;recordWorkflowUndo('Delete map group');studioProject.groups=studioProject.groups.filter(g=>g.id!==b.dataset.groupDelete);if(activeMapGroupFilter===b.dataset.groupDelete)activeMapGroupFilter='';studioProject.canvasNodes.forEach(n=>{if(n.groupId===b.dataset.groupDelete)n.groupId='';});void persistStudio();renderProjectCanvas();});
  let editingAssetId='';
  const resetAssetEditor=()=>{editingAssetId='';$('#projectAssetForm').reset();$('#assetSubmit').textContent='＋ ADD REFERENCE';$('#assetEditCancel').hidden=true;};
  $('#assetEditCancel').addEventListener('click',resetAssetEditor);
  $('#projectAssetForm').addEventListener('submit',e=>{
    e.preventDefault();const title=$('#assetTitle').value.trim();if(!title){toast('Give the asset a name.');return;}
    const existingAsset=editingAssetId?studioProject.assets.find(asset=>asset.id===editingAssetId):null;
    if(editingAssetId&&!existingAsset){resetAssetEditor();toast('That asset no longer exists.');return;}
    const candidate=makeProjectAsset({id:existingAsset?.id,title,kind:$('#assetKind').value,url:$('#assetUrl').value,description:$('#assetDescription').value,source:$('#assetSource').value,method:$('#assetMethod').value,capturedAt:$('#assetCapturedAt').value,consent:$('#assetConsent').value,confidence:$('#assetConfidence').value,nodeId:existingAsset?.nodeId||''},existingAsset?studioProject.assets.indexOf(existingAsset):studioProject.assets.length);
    const duplicate=findDuplicateProjectAsset(studioProject.assets,candidate,existingAsset?.id||'');
    if(duplicate&&!confirm(`Possible duplicate: “${duplicate.title}” has the same URL or the same type and title. Add this reference anyway?`))return;
    if(existingAsset){recordWorkflowUndo('Edit asset reference');Object.assign(existingAsset,candidate,{createdAt:existingAsset.createdAt});resetAssetEditor();void persistStudio();renderProjectCanvas();toast('Asset reference updated.');return;}
    if(studioProject.assets.length>=60){toast('Asset register limit reached (60 references).');return;}
    recordWorkflowUndo('Add asset reference');studioProject.assets.push(candidate);resetAssetEditor();void persistStudio();renderProjectCanvas();toast('Asset reference added to this project.');
  });
  $('#projectAssetList').addEventListener('click',e=>{const edit=e.target.closest('[data-asset-edit]');if(edit){const asset=studioProject.assets.find(a=>a.id===edit.dataset.assetEdit);if(!asset)return;editingAssetId=asset.id;$('#assetTitle').value=asset.title;$('#assetKind').value=asset.kind;$('#assetUrl').value=asset.url;$('#assetDescription').value=asset.description;$('#assetSource').value=asset.source||'';$('#assetMethod').value=asset.method||'other';$('#assetCapturedAt').value=asset.capturedAt?asset.capturedAt.slice(0,10):'';$('#assetConsent').value=asset.consent||'unknown';$('#assetConfidence').value=asset.confidence||'unassessed';$('#assetSubmit').textContent='SAVE CHANGES';$('#assetEditCancel').hidden=false;$('#assetTitle').focus();return;}const b=e.target.closest('[data-asset-delete]');if(!b)return;recordWorkflowUndo('Delete asset reference');if(editingAssetId===b.dataset.assetDelete)resetAssetEditor();studioProject.assets=studioProject.assets.filter(a=>a.id!==b.dataset.assetDelete);studioProject.canvasNodes.forEach(n=>n.assetIds=(n.assetIds||[]).filter(id=>id!==b.dataset.assetDelete));void persistStudio();renderProjectCanvas();});
  $('#mapSelectAll').addEventListener('click',()=>{selectedMapNodes=new Set(studioProject.canvasNodes.filter(n=>(!activeMapGroupFilter||n.groupId===activeMapGroupFilter)&&(!activeMapSearch||`${n.title} ${n.body} ${n.type}`.toLowerCase().includes(activeMapSearch))).map(n=>n.id));renderProjectCanvas();});
  $('#mapClearSelection').addEventListener('click',()=>{selectedMapNodes.clear();renderProjectCanvas();});
  $('#mapDuplicateSelected').addEventListener('click',()=>{const chosen=studioProject.canvasNodes.filter(n=>selectedMapNodes.has(n.id));if(!chosen.length)return;if(studioProject.canvasNodes.length+chosen.length>40){toast('Not enough room under the 40-element limit to duplicate this selection.');return;}recordWorkflowUndo('Duplicate map elements');const ids=new Map(chosen.map(n=>[n.id,`node-${randomSeed()}-${Date.now()}`]));const copies=chosen.map(n=>({...copyJson(n),id:ids.get(n.id),title:`${n.title} COPY`.slice(0,80),x:Math.min(1160,n.x+36),y:Math.min(6000,n.y+36),connections:(n.connections||[]).map(edge=>({...edge,target:ids.get(edge.target)||edge.target})).filter(edge=>studioProject.canvasNodes.some(x=>x.id===edge.target)||ids.has(edge.target))}));studioProject.canvasNodes.push(...copies);selectedMapNodes=new Set(copies.map(n=>n.id));void persistStudio();renderProjectCanvas();});
  $('#mapAlignSelected').addEventListener('click',()=>{const chosen=studioProject.canvasNodes.filter(n=>selectedMapNodes.has(n.id));if(chosen.length<2){toast('Select at least two elements to align.');return;}recordWorkflowUndo('Align map elements');const x=Math.min(...chosen.map(n=>n.x));chosen.forEach(n=>n.x=x);void persistStudio();renderProjectCanvas();});
  $('#mapDistributeSelected').addEventListener('click',()=>{const chosen=studioProject.canvasNodes.filter(n=>selectedMapNodes.has(n.id)).sort((a,b)=>a.x-b.x);if(chosen.length<3){toast('Select at least three elements to distribute.');return;}recordWorkflowUndo('Distribute map elements');const first=chosen[0].x,last=chosen[chosen.length-1].x,step=(last-first)/(chosen.length-1);chosen.forEach((n,i)=>n.x=Math.round(first+step*i));void persistStudio();renderProjectCanvas();});
  $('#mapDeleteSelected').addEventListener('click',()=>{const ids=new Set(selectedMapNodes);if(!ids.size)return;if(!confirm(`Delete ${ids.size} selected map element(s)? Linked relationships will also be removed.`))return;recordWorkflowUndo('Delete selected map elements');studioProject.canvasNodes=studioProject.canvasNodes.filter(n=>!ids.has(n.id));studioProject.assets.forEach(a=>{if(ids.has(a.nodeId))a.nodeId='';});studioProject.canvasNodes.forEach(n=>{n.connections=(n.connections||[]).filter(edge=>!ids.has(edge.target));n.connectsTo=n.connections[0]?.target||'';});selectedMapNodes.clear();void persistStudio();renderProjectCanvas();});
  const jumpMini=r=>{const node=studioProject.canvasNodes.find(n=>n.id===r.dataset.miniNode);if(!node)return;const vp=$('#canvasViewport');vp.scrollTo({left:Math.max(0,node.x*canvasZoom-vp.clientWidth/2),top:Math.max(0,node.y*canvasZoom-vp.clientHeight/2),behavior:'smooth'});};$('#canvasMinimap').addEventListener('click',e=>{const r=e.target.closest('[data-mini-node]');if(r)jumpMini(r);});$('#canvasMinimap').addEventListener('keydown',e=>{const r=e.target.closest('[data-mini-node]');if(r&&['Enter',' '].includes(e.key)){e.preventDefault();jumpMini(r);}});
  $('#canvasViewport').addEventListener('scroll',()=>{if(!studioProject)return;studioProject.mapView=studioProject.mapView||{zoom:canvasZoom,left:0,top:0};studioProject.mapView.left=$('#canvasViewport').scrollLeft;studioProject.mapView.top=$('#canvasViewport').scrollTop;scheduleStudioPersist();},{passive:true});

  $('#mapUndo').addEventListener('click',()=>applyWorkflowHistory('undo'));$('#mapRedo').addEventListener('click',()=>applyWorkflowHistory('redo'));
  const inspector=$('#mapInspector');inspector.addEventListener('focusin',e=>{if(e.target.matches('[data-inspector-field]'))beginWorkflowUndo('Edit selected map element');});inspector.addEventListener('focusout',e=>{if(e.target.matches('[data-inspector-field]')){commitWorkflowUndo();renderProjectCanvas();}});inspector.addEventListener('input',e=>{const node=studioProject?.canvasNodes.find(item=>item.id===activeMapInspectorId);if(!node)return;if(e.target.id==='mapInspectorTitle')node.title=e.target.value.slice(0,80);if(e.target.id==='mapInspectorBody')node.body=e.target.value.slice(0,420);scheduleStudioPersist();const card=$(`[data-canvas-node="${node.id}"]`);if(card){const title=card.querySelector('[data-node-title]'),body=card.querySelector('[data-node-body]');if(title&&title!==e.target)title.value=node.title;if(body&&body!==e.target)body.value=node.body;}renderCanvasLinksOnly();});inspector.addEventListener('change',e=>{const node=studioProject?.canvasNodes.find(item=>item.id===activeMapInspectorId);if(!node)return;if(e.target.id==='mapInspectorStatus')node.status=e.target.value;if(e.target.id==='mapInspectorGroup')node.groupId=e.target.value;if(e.target.id==='mapInspectorTasks')node.taskIds=[...e.target.selectedOptions].map(option=>option.value).slice(0,8);if(e.target.id==='mapInspectorAssets')node.assetIds=[...e.target.selectedOptions].map(option=>option.value).slice(0,12);commitWorkflowUndo();void persistStudio();renderProjectCanvas();});inspector.addEventListener('click',e=>{const button=e.target.closest('[data-pulse-finding]');if(!button||!button.dataset.pulseFinding)return;const ref=button.dataset.pulseFinding;if(studioProject.canvasNodes.some(node=>node.id===ref))focusMapNode(ref);else if(studioProject.assets.some(asset=>asset.id===ref)){activeAssetSearch='';$('#assetSearch').value='';renderWorkflowPanels();const assetRow=$(`[data-asset-edit="${ref}"]`);assetRow?.scrollIntoView({block:'center',behavior:'smooth'});assetRow?.focus();}else{switchStudioTab('board');const task=$(`[data-task-edit="${ref}"]`);task?.scrollIntoView({block:'center',behavior:'smooth'});}});
  window.addEventListener('keydown',e=>{if(!(e.ctrlKey||e.metaKey)||!['z','y'].includes(e.key.toLowerCase()))return;if(!$('#view-studio')?.classList.contains('active')||!$('#studioPane-canvas')?.classList.contains('active'))return;const target=e.target;if(target?.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target?.tagName))return;e.preventDefault();applyWorkflowHistory(e.key.toLowerCase()==='y'||(e.key.toLowerCase()==='z'&&e.shiftKey)?'redo':'undo');});
  $('#studioOpenCareer').addEventListener('click',()=>navigate('career'));
}
let commandIndex=0;
function commandCatalog(){
  const commands=[
    ['go:home','Open Home','Navigation','Return to the studio launchpad.'],
    ['go:forge','Open Idea Forge','Navigation','Generate and compare new creative directions.'],
    ['go:studio','Open Active Project','Navigation','Return to the current project workspace.'],
    ['go:archive','Open Creation Archive','Navigation','Browse saved creations.'],
    ['go:explore','Open Discovery Field','Navigation','Browse locally generated inspiration.'],
    ['go:career','Open Professional Practice','Project tools','Open the brief, estimate, validation and case-study tools for this project.'],
    ['go:system','Open System Monitor','System','Run local diagnostics and inspect capabilities.'],
    ['tab:canvas','Open Project Map','Workspace','View connected project elements.'],
    ['tab:prototype','Open Experience','Workspace','Edit the project premise and test the interaction mockup.'],
    ['tab:board','Open Plan','Workspace','Manage tasks and production progress.'],
    ['tab:notes','Open Think / Field Notes','Workspace','Capture observations and creative exercises.'],
    ['tab:history','Open History','Workspace','Save and restore project snapshots.'],
    ['tool:snapshot','Save Project Snapshot','Project actions','Preserve the current project state before experimenting.'],
    ['tool:add-task','Create Production Task','Project actions','Add a concrete item to the project backlog.'],
    ['tool:auto-arrange','Auto-arrange Project Map','Project actions','Arrange map elements into a readable four-column layout.'],
    ['tool:export-project','Export Current Project','Project actions','Create a portable project JSON file.'],
    ['tool:backup-workspace','Back Up Entire Workspace','Project actions','Export all projects and the active project selection.'],
    ...['idea','question','experiment','decision','output','note'].map(type=>[`map:add:${type}`,`Add ${type[0].toUpperCase()+type.slice(1)} to Project Map`,'Project Map',`Create a new ${type} element in the active project.`]),
    ...(studioProject?.canvasNodes||[]).map(node=>[`map:focus:${node.id}`,`Find ${node.title||'Untitled element'}`,`Project Map / ${node.type.toUpperCase()}`,node.body||`Open this ${node.type} element in the Project Map.`]),
    ...studioLibrary.filter(p=>p.id!==studioProject?.id).map(p=>[`project:${p.id}`,`Switch to ${p.title||'Untitled project'}`,'Projects',`Open this saved project (${p.tasks?.length||0} tasks).`])
  ].map(([id,label,group,description])=>({id,label,group,description}));
  return commands;
}
function renderCommandResults(query=''){
  const root=$('#commandPaletteResults');if(!root)return;
  const q=query.trim().toLowerCase();
  const matches=commandCatalog().filter(c=>!q||`${c.label} ${c.group} ${c.description}`.toLowerCase().includes(q)).slice(0,40);
  commandIndex=0;
  root.innerHTML=matches.length?matches.map((c,i)=>`<div class="command-result ${i===0?'selected':''}" role="option" aria-selected="${i===0?'true':'false'}" data-command-id="${safeText(c.id)}"><span class="command-result-main"><b>${safeText(c.label)}</b><small>${safeText(c.description)}</small></span><span class="command-result-group">${safeText(c.group)}</span></div>`).join(''):'<div class="command-empty">No matching commands. Try a project name or a shorter search.</div>';
  root.querySelectorAll('.command-result').forEach((el,i)=>{el.id=`command-option-${i}`;});
  if(matches.length)$('#commandPaletteSearch').setAttribute('aria-activedescendant','command-option-0');else $('#commandPaletteSearch').removeAttribute('aria-activedescendant');
}
function openCommandPalette(){
  const dialog=$('#commandPaletteDialog');if(!dialog||dialog.open)return;
  commandPaletteInvoker=document.activeElement instanceof HTMLElement?document.activeElement:null;
  dialog.showModal();$('#commandPaletteSearch').value='';renderCommandResults('');
  requestAnimationFrame(()=>{if(dialog.open)$('#commandPaletteSearch').focus();});
}
function restoreCommandPaletteFocus(){
  const target=commandPaletteInvoker;commandPaletteInvoker=null;
  if(target?.isConnected&&!target.closest('[hidden]')&&target.getClientRects().length){target.focus();return;}
  $('#mainContent')?.focus({preventScroll:true});
}
function closeCommandPalette(){const dialog=$('#commandPaletteDialog');if(dialog?.open)dialog.close();else restoreCommandPaletteFocus();}
async function runCommand(id){
  closeCommandPalette();
  if(id.startsWith('go:')){const view=id.slice(3);if(view==='studio')await navigate('studio');else await navigate(view);return;}
  if(id.startsWith('tab:')){await navigate('studio');switchStudioTab(id.slice(4));return;}
  if(id.startsWith('map:add:')){await navigate('studio');switchStudioTab('canvas');addCanvasNode(id.slice(8));return;}
  if(id.startsWith('map:focus:')){focusMapNode(id.slice(10));return;}
  if(id.startsWith('project:')){switchStudioProjectById(id.slice(8));return;}
  if(id==='tool:snapshot'){saveStudioSnapshot('Quick snapshot');return;}
  if(id==='tool:add-task'){if(studioProject?.tasks.length>=80){toast('This project has reached the 80-task limit.');return;}await navigate('studio');switchStudioTab('board');openTaskEditor();return;}
  if(id==='tool:auto-arrange'){await navigate('studio');switchStudioTab('canvas');arrangeCanvas();return;}
  if(id==='tool:export-project'){exportStudio();return;}
  if(id==='tool:backup-workspace'){exportStudioLibrary();return;}
}
async function focusMapNode(id){
  await navigate('studio');switchStudioTab('canvas');activeMapGroupFilter='';activeMapSearch='';selectedMapNodes.clear();if($('#mapSearch'))$('#mapSearch').value='';if($('#mapGroupFilter'))$('#mapGroupFilter').value='';activeMapInspectorId=id;renderProjectCanvas();
  const card=$$('[data-canvas-node]').find(el=>el.dataset.canvasNode===id);
  if(!card){toast('That project element is no longer available.');return;}
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  card.scrollIntoView({block:'center',inline:'center',behavior:reduced?'auto':'smooth'});
  card.classList.add('command-focus');
  card.querySelector('[data-drag-handle]')?.focus();
  window.setTimeout(()=>card.classList.remove('command-focus'),1400);
}
async function switchStudioProjectById(id){
  if(studioActionBusy){toast('Another project action is already running.');return false;}
  const next=studioLibrary.find(p=>p.id===id);if(!next||next.id===studioProject?.id)return false;
  studioActionBusy=true;
  try{
    if(!await flushCareerBeforeTransition())return false;
    const flushed=await flushStudioPersist();if(!flushed&&studioDirty){toast('Project switch paused because this tab has unsaved or conflicting changes. Export the current workspace first.');return false;}
    const previous=studioProject,previousCurrent=current;studioProject=next;current=next.creation;studioInteractions=0;
    const saved=await persistStudio();if(!saved){studioProject=previous;current=previousCurrent;renderStudio();toast('Project switch was not committed. Export the workspace before continuing.');return false;}
    renderStudio();const view=$('#canvasViewport');if(view){view.scrollLeft=studioProject.mapView?.left||0;view.scrollTop=studioProject.mapView?.top||0;}window.dispatchEvent(new CustomEvent('dreamforger:project-switched',{detail:{projectId:studioProject.id}}));toast('Studio project switched and set as active.');return true;
  }finally{studioActionBusy=false;}
}

function bindCommandPalette(){
  const dialog=$('#commandPaletteDialog'),input=$('#commandPaletteSearch'),root=$('#commandPaletteResults');
  $('#studioCommandOpen').addEventListener('click',openCommandPalette);
  $('#commandPaletteClose').addEventListener('click',closeCommandPalette);
  dialog.addEventListener('close',restoreCommandPaletteFocus);
  input.addEventListener('input',()=>renderCommandResults(input.value));
  root.addEventListener('click',e=>{const b=e.target.closest('[data-command-id]');if(b)runCommand(b.dataset.commandId);});
  dialog.addEventListener('keydown',e=>{
    const options=[...root.querySelectorAll('.command-result')];
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      if(!options.length)return;e.preventDefault();commandIndex=(commandIndex+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;
      options.forEach((item,i)=>{item.classList.toggle('selected',i===commandIndex);item.setAttribute('aria-selected',String(i===commandIndex));});
      input.setAttribute('aria-activedescendant',options[commandIndex].id);
      options[commandIndex].scrollIntoView({block:'nearest'});return;
    }
    if(e.key==='Enter'&&document.activeElement===input&&options.length){e.preventDefault();runCommand(options[commandIndex]?.dataset.commandId);}
  });
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){
      if($('#commandPaletteDialog').open)return;const target=e.target;if(target instanceof HTMLElement&&(target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target.tagName)))return;e.preventDefault();openCommandPalette();
    }
  });
}
function renderStudioBoard(){const lanes=[['todo','BACKLOG','Define what comes next.'],['doing','IN PROGRESS','Work currently being explored.'],['done','COMPLETED','Keep the finished steps visible.']];$('#productionBoard').innerHTML=lanes.map(([key,title,desc])=>`<section class="board-lane" data-lane="${key}"><div class="board-lane-head"><div><strong>${title}</strong><small>${desc}</small></div><b>${studioProject.tasks.filter(t=>t.status===key).length}</b></div><div class="board-task-list">${studioProject.tasks.filter(t=>t.status===key).map(t=>`<article class="board-task"><p>${safeText(t.title)}</p><div><button data-task-edit="${safeText(t.id)}" aria-label="Edit task: ${safeText(t.title)}" title="Edit task">✎</button><button data-task-map="${safeText(t.id)}" aria-label="Find map elements linked to ${safeText(t.title)}" title="Find linked map elements">⌖</button><button data-task-move="${safeText(t.id)}" data-direction="prev" aria-label="Move task to previous lane" title="Move to previous lane">←</button><button data-task-move="${safeText(t.id)}" data-direction="next" aria-label="Move task to next lane" title="Move to next lane">→</button><button data-task-delete="${safeText(t.id)}" aria-label="Delete task" title="Delete task">×</button></div></article>`).join('')||'<div class="lane-empty">Nothing here yet.</div>'}</div></section>`).join('');}
const STUDIO_METHODS=[['morph','MORPHOLOGICAL MIX','Break the concept into parts, then recombine them.'],['analogy','ANALOGY TRANSFER','Borrow a rule from an unrelated world.'],['invert','INVERT THE RULE','Challenge the assumption holding the idea in place.'],['extreme','EXTREME PROTOTYPE','Make a tiny version under an unusual time limit.']];
function appendStudioNotes(content){if(!studioProject)return;studioProject.notes=((studioProject.notes?studioProject.notes.trim()+'\n\n':'')+String(content)).slice(-12000);$('#studioNotes').value=studioProject.notes;$('#studioNotesCount').textContent=`${studioProject.notes.length} / 12000`;persistStudio();}
function renderStudioMethods(){const el=$('#studioMethodGrid');if(!el)return;el.innerHTML=STUDIO_METHODS.map(([id,title,desc])=>`<button class="method-card" data-studio-method="${id}"><strong>${title}</strong><small>${desc}</small><span>GENERATE EXERCISE ↗</span></button>`).join('');}
function generateStudioMethod(method){if(!studioProject)return;const p=studioProject,subject=p.title||'this concept',goal=p.goal||p.tagline||'the core experience';const pools={analogy:['a street market','a coral reef','a jazz ensemble','a public library','a board game','a beehive','a railway network','a theatre backstage'],extreme:['10 minutes and one sheet of paper','one afternoon and no budget','one screen and one interaction','a single physical object','a first-time user with no instructions']};let exercise='';if(method==='morph'){const dimensions=[['INPUT',['voice','gesture','text','location','time']],['TRANSFORMATION',['combine','filter','invert','compress','randomize']],['OUTPUT',['a story','a tool','a ritual','a map','a shared artifact']]];exercise=`MORPHOLOGICAL MIX / ${subject.toUpperCase()}

Choose one option from each dimension and combine them into a new direction:
${dimensions.map(([name,opts])=>`${name}: ${opts.sort(()=>Math.random()-.5).slice(0,3).join(' / ')}`).join('\\n')}

What combination creates a surprising but useful experience?
How could you test it in one interaction?`;}else if(method==='analogy'){const source=pools.analogy[Math.floor(Math.random()*pools.analogy.length)];exercise=`ANALOGY TRANSFER / ${subject.toUpperCase()}

Borrow a principle from ${source}.
What does ${source} do exceptionally well that ${subject} could learn from?
Which rule can you transfer without copying its appearance?
What would the smallest test of that borrowed rule look like?`;}else if(method==='invert'){exercise=`INVERT THE RULE / ${subject.toUpperCase()}

Current promise: ${goal}

Reverse one assumption. Make the experience do the opposite of what users expect.
What becomes easier? What becomes worse?
Could the reversed version reveal a more distinctive direction?
What evidence would make you keep or reject it?`;}else if(method==='extreme'){const limit=pools.extreme[Math.floor(Math.random()*pools.extreme.length)];exercise=`EXTREME PROTOTYPE / ${subject.toUpperCase()}

Constraint: ${limit}.
Preserve only the one moment that communicates the core value.
What can be faked, removed or represented with paper?
Define the test, the observation to record and the result that would change your mind.`;}else return;const stamp=new Date().toLocaleString();appendStudioNotes(`--- ${stamp} ---
${exercise}
`);switchStudioTab('notes');toast('Creative exercise added to Field Notes.');}
async function branchStudioProject(){if(studioActionBusy){toast('Another Studio action is already running.');return;}studioActionBusy=true;try{if(!studioProject)return;if(!await flushCareerBeforeTransition())return;const flushed=await flushStudioPersist();if(!flushed&&studioDirty){toast('Branch creation paused until the current project is safely saved or exported.');return;}if(studioLibrary.length>=8){toast('Studio library is full. Export the workspace or delete a project first.');return;}const branchCreation=mutateCreation(studioProject.creation,{seed:randomSeed(),chaos:studioProject.creation.chaos});const branch=makeStudioProject(branchCreation);branch.id=`${branch.id}-branch-${randomSeed()}`;branch.title=`${studioProject.title} / BRANCH`;branch.tagline=studioProject.tagline;branch.audience=studioProject.audience;branch.goal=studioProject.goal;branch.firstStep=studioProject.firstStep;branch.success=studioProject.success;branch.notes=`BRANCHED FROM: ${studioProject.title}

${studioProject.notes||''}`.slice(0,12000);branch.tasks=studioProject.tasks.map((t,i)=>({...normalizeStudioTask(t,i),id:`branch-${randomSeed()}-${i}`}));const mapIds=new Map(studioProject.canvasNodes.map(n=>[n.id,`branch-${randomSeed()}`]));const taskIds=new Map(studioProject.tasks.map((t,i)=>[t.id,branch.tasks[i]?.id]));branch.canvasNodes=studioProject.canvasNodes.map(n=>({...n,id:mapIds.get(n.id),connections:(n.connections||[]).map(edge=>({...edge,target:mapIds.get(edge.target)||''})).filter(edge=>edge.target),connectsTo:mapIds.get(n.connectsTo)||'',taskIds:(n.taskIds||[]).map(id=>taskIds.get(id)).filter(Boolean)}));branch.groups=copyJson(studioProject.groups||[]);branch.assets=copyJson(studioProject.assets||[]).map(a=>({...a,nodeId:mapIds.get(a.nodeId)||''}));branch.mapView=copyJson(studioProject.mapView||{zoom:1,left:0,top:0});branch.canvasNodes=branch.canvasNodes.map(n=>normalizeMapNodeWorkflow(n,branch.groups,branch.tasks,branch.assets));branch.career=studioProject.career?normalizeCareerData(studioProject.career):null;branch.parentProjectId=studioProject.id;studioProject=branch;current=branchCreation;studioInteractions=0;const saved=await persistStudio();renderStudio();await navigate('studio');window.dispatchEvent(new CustomEvent('dreamforger:project-switched',{detail:{projectId:studioProject.id}}));toast(saved?'A new branch was created. The source project remains unchanged.':'Branch created for this session, but storage failed. Export the workspace.');}finally{studioActionBusy=false;}}
async function exportStudioLibrary(){const flushed=await flushStudioPersist();if(!flushed){toast('Backup export contains unsaved session data; resolve the storage warning before relying on it.');}if(!studioLibrary.length){toast('There are no Studio projects to back up.');return;}const payload={format:'dreamforge-studio-workspace',version:1,appVersion:APP_VERSION,exportedAt:new Date().toISOString(),activeId:studioProject?.id||studioLibrary[0].id,projects:studioLibrary};downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),'dreamforger-studio-workspace-backup.json');toast(`${studioLibrary.length} Studio projects backed up.`);}
async function saveStudioConcept(){if(!studioProject)return;const item=normalizeCreation(studioProject.creation);if(!archive.some(x=>x.id===item.id)){if(archive.length>=MAX_ITEMS){toast('Archive is full (300 creations). Export a backup and delete an item before saving more.');return;}archive.unshift({...item,savedAt:new Date().toISOString()});const saved=await persist();renderArchiveCount();renderRecent();toast(saved?'Concept saved to your creation archive.':'Concept added for this session, but browser storage failed. Export it now.');}else toast('This concept is already in your archive.');}
async function runStudioCollision(){if(studioActionBusy){toast('Another Studio action is already running.');return;}studioActionBusy=true;try{if(!studioProject)return;if(!await flushCareerBeforeTransition())return;const flushed=await flushStudioPersist();if(!flushed&&studioDirty){toast('Collision paused because the active project could not be saved. Export it first.');return;}const base=studioProject.creation;const pool=[...archive.filter(x=>x.id!==base.id),...demos.filter(x=>x.id!==base.id)];if(!pool.length){toast('Create or discover another concept first.');return;}const partner=pool[Math.floor(Math.random()*pool.length)];if(studioLibrary.length>=8){toast('Studio library is full. Export or delete a project before creating another branch.');return;}const fused=fuseCreations(base,partner,{seed:randomSeed(),chaos:88});studioProject=makeStudioProject(fused);studioProject.title=`${fused.title} / COLLISION`;studioProject.notes=`CROSS-POLLINATION
Source A: ${base.title}
Source B: ${partner.title}

What unexpected property emerged from this combination?
`;current=fused;const saved=await persistStudio();renderStudio();window.dispatchEvent(new CustomEvent('dreamforger:project-switched',{detail:{projectId:studioProject.id}}));toast(`${saved?'Collision created':'Collision created for this session; storage failed'} from “${base.title}” × “${partner.title}”.`);}finally{studioActionBusy=false;}}
async function exportStudio(){if(!studioProject)return;const flushed=await flushStudioPersist();if(!flushed)toast('Exporting the current local session because browser storage could not be updated.');const payload={...studioProject,format:'dreamforge-studio',version:1,appVersion:APP_VERSION,exportedAt:new Date().toISOString(),exportNotice:'Portable local project file. No server, account or remote sync is included.'};downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),`${slugify(studioProject.title||'dreamforger-project')}.dreamforge-project.json`);toast('Studio project exported.');}
let studioImportBusy=false;
async function importStudioProject(file){if(!file)return;if(studioImportBusy||studioActionBusy){toast('Another Studio project action is already running.');return;}if(file.size>5*1024*1024){toast('Project file is too large (5 MB maximum).');return;}studioImportBusy=true;studioActionBusy=true;if(!await flushCareerBeforeTransition()){studioImportBusy=false;studioActionBusy=false;return;}if(!await flushStudioPersist()&&studioDirty){studioImportBusy=false;studioActionBusy=false;toast('Import paused because the current project could not be saved. Export it first.');return;}const reader=new FileReader();reader.onload=async()=>{try{const raw=JSON.parse(reader.result);if(raw.format==='dreamforge-studio-workspace'&&raw.version===1&&Array.isArray(raw.projects)){if(Object.keys(raw).some(key=>!['format','version','appVersion','exportedAt','activeId','projects'].includes(key)))throw new Error('Workspace backup contains unsupported top-level fields.');if(raw.activeId!=null&&(typeof raw.activeId!=='string'||raw.activeId.length>120))throw new Error('Workspace backup has an invalid active project identifier.');if(raw.appVersion!=null&&(typeof raw.appVersion!=='string'||raw.appVersion.length>40))throw new Error('Workspace backup has invalid version metadata.');if(raw.exportedAt!=null&&!Number.isFinite(Date.parse(raw.exportedAt)))throw new Error('Workspace backup has an invalid export timestamp.');if(raw.projects.length>300)throw new Error('Workspace backup exceeds the 300-project input safety limit.');const rawProjects=raw.projects.slice(0,8);const normalized=[];let invalidSkipped=0;for(const source of rawProjects){const project=safeNormalizeStudioProject(source);if(!project||hasStudioNormalizationLoss(source,project)){invalidSkipped++;continue;}normalized.push(project);}const incomingIds=normalized.map(project=>project.id);if(new Set(incomingIds).size!==incomingIds.length)throw new Error('Workspace backup contains duplicate project identifiers. No projects were imported.');const incoming=normalized;if(!incoming.length)throw new Error('The workspace backup contains no valid projects.');const merged=[...studioLibrary];const accepted=new Set();let added=0,replaced=0,declined=0,capacitySkipped=Math.max(0,raw.projects.length-rawProjects.length);for(const project of incoming){const i=merged.findIndex(p=>p.id===project.id);if(i>=0){if(!confirm(`Replace the local project “${project.title}” with the backup copy?`)){declined++;continue;}merged[i]=project;replaced++;accepted.add(project.id);}else if(merged.length<8){merged.push(project);added++;accepted.add(project.id);}else capacitySkipped++;}if(!added&&!replaced){toast(`Nothing imported · ${declined} replacement(s) declined${capacitySkipped?` · ${capacitySkipped} skipped (8-project limit)`:''}${invalidSkipped?` · ${invalidSkipped} invalid skipped`:''}.`);return;}const previousActiveId=studioProject?.id;studioLibrary=merged.slice(0,8);const preferredId=accepted.has(raw.activeId)?raw.activeId:previousActiveId;studioProject=studioLibrary.find(p=>p.id===preferredId)||studioLibrary[0];current=studioProject.creation;const saved=await persistStudio();if(!saved){toast('Workspace import was prepared but not saved. Export the current session before closing.');renderStudio();return;}renderStudio();await navigate('studio');window.dispatchEvent(new CustomEvent('dreamforger:project-switched',{detail:{projectId:studioProject.id}}));toast(`Workspace merged · ${added} added · ${replaced} replaced${declined?` · ${declined} declined`:''}${capacitySkipped?` · ${capacitySkipped} skipped (8-project limit)`:''}${invalidSkipped?` · ${invalidSkipped} invalid skipped`:''}.`);return;}if(raw.format!=='dreamforge-studio'||raw.version!==1||!raw.creation)throw new Error('This is not a supported Dreamforger project or workspace backup.');const project=safeNormalizeStudioProject(raw);if(!project||hasStudioNormalizationLoss(raw,project))throw new Error('Project contains unsupported, malformed or oversized fields. The original import file was not modified.');const duplicate=studioLibrary.find(x=>x.id===project.id);if(studioLibrary.length>=8&&!duplicate)throw new Error('Studio library is full. Back up or delete an existing project first.');if(duplicate&&!confirm('This project already exists here. Replace its local Studio copy?'))return;const previousProject=studioProject,previousCurrent=current,previousLibrary=studioLibrary;studioProject=project;current=project.creation;const saved=await persistStudio();if(!saved){studioProject=previousProject;current=previousCurrent;studioLibrary=previousLibrary;renderStudio();toast('Project import was not saved. Your previous active project was restored.');return;}renderStudio();await navigate('studio');window.dispatchEvent(new CustomEvent('dreamforger:project-switched',{detail:{projectId:studioProject.id}}));toast('Studio project imported.');}catch(e){toast(`Project import failed: ${e.message}`);}finally{studioImportBusy=false;studioActionBusy=false;}};reader.onerror=()=>{studioImportBusy=false;studioActionBusy=false;toast('Could not read the project file.');};reader.readAsText(file);}

function switchStudioTab(tab){$$('[data-studio-tab]').forEach(b=>{const on=b.dataset.studioTab===tab;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});$$('[data-studio-pane]').forEach(p=>{const on=p.dataset.studioPane===tab;p.hidden=!on;p.classList.toggle('active',on);});}
async function restoreStudioVersion(id){if(!studioProject)return false;if(studioActionBusy){toast('Another project action is already running.');return false;}studioActionBusy=true;try{const v=studioProject.snapshots.find(x=>x.id===id);if(!v)return;if(!await flushCareerBeforeTransition())return;const flushed=await flushStudioPersist();if(!flushed&&studioDirty){toast('Restore paused because the current project could not be saved. Export it before restoring a snapshot.');return;}const safetySaved=await saveStudioSnapshot('Safety before restore',true);if(!safetySaved){toast('Restore cancelled because the safety snapshot could not be saved. Export the project and resolve storage first.');return;}const d=v.data;Object.assign(studioProject,{title:d.title,tagline:d.tagline,audience:d.audience,goal:d.goal,firstStep:d.firstStep,success:d.success,notes:d.notes,tasks:d.tasks.map(normalizeStudioTask),canvasNodes:normalizeProjectMap(d.canvasNodes,d.creation),groups:Array.isArray(d.groups)?d.groups:[],assets:Array.isArray(d.assets)?d.assets:[],mapView:d.mapView||{zoom:1,left:0,top:0},career:d.career?normalizeCareerData(d.career):null,creation:normalizeCreation(d.creation)});current=studioProject.creation;studioInteractions=0;const saved=await persistStudio();renderStudio();const restoreViewport=$('#canvasViewport');if(restoreViewport){restoreViewport.scrollLeft=studioProject.mapView?.left||0;restoreViewport.scrollTop=studioProject.mapView?.top||0;}window.dispatchEvent(new CustomEvent('dreamforger:project-switched',{detail:{projectId:studioProject.id,restored:true}}));toast(saved?'Version restored. Your previous state is preserved as a safety snapshot.':'Version restored for this session, but browser storage failed. Export the workspace immediately.');}finally{studioActionBusy=false;}}
function openTaskEditor(taskId=null){if(!studioProject||$('#taskDialog').open||taskCommitBusy)return;pendingTaskId=taskId;const task=taskId?studioProject.tasks.find(t=>t.id===taskId):null;if(taskId&&!task)return;$('#taskDialogTitle').textContent=task?'EDIT TASK':'ADD A TASK';$('#taskSubmit').textContent=task?'SAVE CHANGES':'ADD TASK';$('#taskTitleInput').value=task?.title||'';$('#taskDialog').showModal();$('#taskTitleInput').focus();}
let taskCommitBusy=false;
async function commitTaskEditor(event){event.preventDefault();if(taskCommitBusy||!studioProject)return;const editingId=pendingTaskId;const submit=$('#taskSubmit'),cancel=$('#taskCancel');const title=$('#taskTitleInput').value.trim().slice(0,140);if(!title){$('#taskTitleInput').focus();return;}if(editingId){const task=studioProject.tasks.find(t=>t.id===editingId);if(!task)return;if(task.title!==title){recordWorkflowUndo('Edit production task');task.title=title;}}else{if(studioProject.tasks.length>=80){toast('This project has reached the 80-task limit.');$('#taskDialog').close();return;}recordWorkflowUndo('Add production task');studioProject.tasks.push({id:`t-${randomSeed()}-${Date.now()}`,title,status:'todo'});}taskCommitBusy=true;if(submit)submit.disabled=true;if(cancel)cancel.disabled=true;try{const saved=await persistStudio();renderStudioBoard();renderProjectCanvas();renderStudioReadiness();$('#taskDialog').close();toast(saved?(editingId?'Task updated.':'Task added to the backlog.'):'Task changed for this session, but storage failed. Export the project.');pendingTaskId=null;}finally{taskCommitBusy=false;if(submit)submit.disabled=false;if(cancel)cancel.disabled=false;}}
async function deleteStudioProject(){
  if(studioActionBusy){toast('Another project action is already running.');return false;}
  if(!studioProject)return false;
  studioActionBusy=true;
  try{
    if(!await flushCareerBeforeTransition())return false;
    if(!confirm(`Delete the Studio project “${studioProject.title}”? Its snapshots, tasks and notes will be removed. The creation archive is not affected.`))return false;
    const oldProject=studioProject,oldCurrent=current,oldLibrary=studioLibrary.map(copyJson);
    studioLibrary=studioLibrary.filter(p=>p.id!==oldProject.id);studioProject=studioLibrary[0]||null;current=studioProject?.creation||null;
    const saved=await persistStudio();
    if(!saved){studioProject=oldProject;current=oldCurrent;studioLibrary=oldLibrary;renderStudio();toast('Project deletion was not committed. Your original project is restored in this session.');return false;}
    renderStudio();window.dispatchEvent(new CustomEvent('dreamforger:project-switched',{detail:{projectId:studioProject?.id||null}}));
    if(studioProject)toast('Studio project deleted.');else{await navigate('home');toast('Last Studio project deleted.');}
    return true;
  }finally{studioActionBusy=false;}
}
function bindStudio(){bindCommandPalette();window.addEventListener('dreamforger:career-updated',e=>{const raw=localStorage.getItem(STUDIO_STORE);const parsed=parseStudioWorkspace(raw);if(parsed.ok){studioLibrary=parsed.projects;const active=studioLibrary.find(p=>p.id===studioProject?.id);if(active){studioProject=active;current=active.creation;}captureStudioBaseline(raw);studioDirty=false;}else if(studioProject&&e.detail?.projectId===studioProject.id){studioProject.career=normalizeCareerData(e.detail.data);studioLibrary=studioLibrary.map(p=>p.id===studioProject.id?studioProject:p);}updateStorageMeter();});bindCanvas();$('#taskForm').addEventListener('submit',commitTaskEditor);$('#taskCancel').addEventListener('click',()=>$('#taskDialog').close());$('#taskDialog').addEventListener('close',()=>{pendingTaskId=null;});const fields={studioProjectName:'title',studioTagline:'tagline',studioAudience:'audience',studioGoal:'goal',studioFirstStep:'firstStep',studioSuccess:'success',studioNotes:'notes'};Object.entries(fields).forEach(([id,key])=>$('#'+id).addEventListener('input',e=>{if(!studioProject)return;studioProject[key]=e.target.value.slice(0,key==='notes'?12000:key==='title'?90:key==='tagline'?260:key==='audience'?140:key==='goal'?300:key==='firstStep'?120:220);if(key==='notes')$('#studioNotesCount').textContent=`${e.target.value.length} / 12000`;if(key!=='notes')updateStudioPreview();scheduleStudioPersist();if(key==='title')renderStudioProjectPicker();renderStudioReadiness();}));$('#studioPreview').addEventListener('click',e=>{if(e.target.closest('#previewAction')){studioInteractions++;$('#previewFeedback').textContent=`Interaction ${studioInteractions}: “${studioProject.firstStep||'Explore the idea'}” has been tested. What should happen next?`;$('#previewCounter').textContent=`INTERACTIONS ${String(studioInteractions).padStart(2,'0')}`;}});$('#previewReset').addEventListener('click',()=>{studioInteractions=0;updateStudioPreview();});$('#studioSnapshot').addEventListener('click',saveStudioSnapshot);$('#studioCollision').addEventListener('click',runStudioCollision);$('#studioSaveConcept').addEventListener('click',saveStudioConcept);$('#studioSnapshotAlt').addEventListener('click',saveStudioSnapshot);$('#studioExport').addEventListener('click',exportStudio);$('#studioExportLibrary').addEventListener('click',exportStudioLibrary);$('#studioBranch').addEventListener('click',branchStudioProject);$('#studioImport').addEventListener('click',()=>$('#studioImportInput').click());$('#studioImportInput').addEventListener('change',e=>{importStudioProject(e.target.files[0]);e.target.value='';});$('#studioDeleteProject').addEventListener('click',deleteStudioProject);$('#studioProjectPicker').addEventListener('change',e=>switchStudioProjectById(e.target.value));$('#studioNewPressure').addEventListener('click',()=>{pressureIndex=(pressureIndex+1)%PRESSURE_TESTS.length;renderStudioPressure();});$('#studioAddTask').addEventListener('click',()=>{if(studioProject.tasks.length>=80){toast('This project has reached the 80-task limit.');return;}openTaskEditor();});$('#productionBoard').addEventListener('click',async e=>{if(studioActionBusy)return;const jump=e.target.closest('[data-task-map]');const edit=e.target.closest('[data-task-edit]');const move=e.target.closest('[data-task-move]');const del=e.target.closest('[data-task-delete]');if(jump){const linked=studioProject.canvasNodes.filter(n=>(n.taskIds||[]).includes(jump.dataset.taskMap));if(!linked.length){toast('No Project Map elements are linked to this task yet.');return;}await focusMapNode(linked[0].id);if(linked.length>1)toast(`${linked.length} linked elements found. Showing the first; use map search to find the others.`);return;}if(edit){openTaskEditor(edit.dataset.taskEdit);return;}if(move){const t=studioProject.tasks.find(x=>x.id===move.dataset.taskMove);if(t){const order=['todo','doing','done'],i=order.indexOf(t.status),next=order[Math.max(0,Math.min(2,i+(move.dataset.direction==='next'?1:-1)))];if(next===t.status)return;recordWorkflowUndo('Move production task');t.status=next;await persistStudio();renderStudioBoard();renderStudioReadiness();}}if(del){const removedId=del.dataset.taskDelete;recordWorkflowUndo('Delete production task');studioProject.tasks=studioProject.tasks.filter(t=>t.id!==removedId);studioProject.canvasNodes.forEach(n=>n.taskIds=(n.taskIds||[]).filter(id=>id!==removedId));await persistStudio();renderStudioBoard();renderProjectCanvas();renderStudioReadiness();}});$('#studioVersionList').addEventListener('click',e=>{const b=e.target.closest('[data-restore-version]');if(b&&confirm('Restore this snapshot? Your current unsnapshotted state will be replaced.'))restoreStudioVersion(b.dataset.restoreVersion);});$('#historyCompareRun').addEventListener('click',()=>{const a=studioProject.snapshots.find(v=>v.id===$('#historyCompareA').value);const bv=$('#historyCompareB').value;const b=bv==='__current__'?{data:studioSnapshotData()}:bv.startsWith('project:')?{data:studioLibrary.find(p=>p.id===bv.slice(8))||{}}:studioProject.snapshots.find(v=>v.id===bv);if(!a||!b){$('#historyCompareResult').textContent='Save a snapshot and choose a valid comparison target first.';return;}const diff=compareProjectSnapshots(a,b);$('#historyCompareResult').innerHTML=diff.identical?'<p>No differences detected in the compared fields and collection sizes.</p>':`<p>${diff.total} difference(s)${diff.total>diff.changes.length?` · showing first ${diff.changes.length}`:''}</p>`+diff.changes.map(c=>`<div class="history-diff-row"><b>${safeText(c.field)}</b><span>${safeText(c.before)}</span><i>→</i><span>${safeText(c.after)}</span></div>`).join('');});$('#studioPromptStack').addEventListener('click',e=>{const b=e.target.closest('[data-insert-prompt]');if(!b)return;const q=STUDIO_PROMPTS[Number(b.dataset.insertPrompt)];appendStudioNotes(q+'\n');switchStudioTab('notes');});$('#studioMethodGrid').addEventListener('click',e=>{const b=e.target.closest('[data-studio-method]');if(b)generateStudioMethod(b.dataset.studioMethod);});$$('[data-studio-tab]').forEach(b=>b.addEventListener('click',()=>switchStudioTab(b.dataset.studioTab)));$('.studio-tabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const tabs=$$('[data-studio-tab]'),i=tabs.indexOf(document.activeElement),next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;e.preventDefault();switchStudioTab(tabs[next].dataset.studioTab);tabs[next].focus();});}

function renderStartApps(query=''){
  const apps=searchOSApps(query);
  $('#startResultCount').textContent=`${apps.length} APP${apps.length===1?'':'S'}`;
  $('#startAppGrid').innerHTML=apps.length?apps.map(app=>`<button class="start-app" type="button" data-os-app="${app.id}"><span class="start-app-icon">${safeText(app.icon)}</span><span><b>${safeText(app.name)}</b><small>${safeText(app.description)}</small></span></button>`).join(''):'<p class="start-empty">No applications match that search.</p>';
}
function openStartMenu(){renderStartApps($('#startSearch').value);$('#startMenu').hidden=false;$('#startButton').setAttribute('aria-expanded','true');$('#startSearch').focus();}
function closeStartMenu({restoreFocus=true}={}){$('#startMenu').hidden=true;$('#startButton').setAttribute('aria-expanded','false');if(restoreFocus)$('#startButton').focus();}
const APP_VIEWS={home:['home'],forge:['forge'],studio:['studio','career'],explore:['explore'],archive:['archive'],files:['files'],system:['system']};
function applyShellPreferences(){
  const shell=$('#appShell');
  shell.dataset.compact=shellPreferences.compact?'true':'false';
  shell.dataset.highContrast=shellPreferences.highContrast?'true':'false';
  shell.dataset.reduceMotion=shellPreferences.reduceMotion?'true':'false';
  shell.style.zoom=String(shellPreferences.fontScale);
}
function saveShellPreferences(){
  if(!writeShellPreferences(localStorage,shellPreferences)){toast('Interface preferences could not be saved. Project data is unaffected.');return false;}
  applyShellPreferences();renderSettingsDiagnostics();return true;
}
function renderSettingsDiagnostics(){
  const root=$('#settingsStorageSummary');if(!root)return;
  const report=inspectStorageHealth(localStorage,LOCAL_STORAGE_BUDGET_BYTES);
  if(!report.available){root.textContent='Browser storage could not be inspected.';return;}
  const kb=(report.usedBytes/1024).toFixed(1),budget=(report.budgetBytes/1024).toFixed(0);
  const archiveBytes=report.records.find(x=>x.key===STORE)?.bytes||0;
  const studioBytes=report.records.find(x=>x.key===STUDIO_STORE)?.bytes||0;
  root.innerHTML=`<div class="settings-storage-meter"><div><strong>${kb} KB</strong><small>estimated local storage · ${report.percent}% of conservative ${budget} KB budget</small></div><div class="settings-storage-track"><span style="width:${report.percent}%"></span></div></div><div class="settings-storage-grid"><span>Archive <b>${(archiveBytes/1024).toFixed(1)} KB</b></span><span>Studio <b>${(studioBytes/1024).toFixed(1)} KB</b></span><span>Creations <b>${archive.length} / ${MAX_ITEMS}</b></span><span>Projects <b>${studioLibrary.length} / 8</b></span></div><p class="settings-storage-note">This is a conservative estimate, not the browser’s actual quota. Data remains on this device. Export backups before clearing site data or changing browsers.</p>`;
}
function initializeWindowHost(){
  const host=$('#mainContent');
  applyShellPreferences();
  for(const app of OS_APPS){
    const viewNodes=(APP_VIEWS[app.id]||[]).map(name=>document.getElementById(`view-${name}`)).filter(Boolean);
    if(!viewNodes.length)continue;
    const win=document.createElement('section');
    win.className='app-window';win.dataset.windowApp=app.id;win.setAttribute('aria-label',`${app.name} application window`);win.hidden=true;
    const header=document.createElement('header');header.className='app-window-titlebar';header.tabIndex=0;header.setAttribute('aria-label',`${app.name} window title bar. Drag to move. Use Alt Shift and arrow keys to move; Ctrl Alt and arrow keys to resize.`);
    header.innerHTML=`<div class="app-window-identity"><span class="app-window-glyph">${safeText(app.icon)}</span><div><strong>${safeText(app.name)}</strong><small>${safeText(app.category.toUpperCase())} · KNIGHTMARE OS</small></div></div><div class="app-window-controls" aria-label="Window controls"><button type="button" data-window-action="minimize" aria-label="Minimize ${safeText(app.name)} window" title="Minimize">−</button><button type="button" data-window-action="maximize" aria-label="Maximize ${safeText(app.name)} window" aria-pressed="false" title="Maximize">□</button><button type="button" data-window-action="close" aria-label="Close ${safeText(app.name)} window" title="Close">×</button></div>`;
    const content=document.createElement('section');content.className='app-window-content';content.tabIndex=-1;content.setAttribute('role','region');content.setAttribute('aria-label',`${app.name} workspace content`);
    for(const node of viewNodes)content.appendChild(node);
    win.append(header,content);host.appendChild(win);windowElements.set(app.id,win);
    const index=OS_APPS.findIndex(x=>x.id===app.id);
    const width=Math.min(980,Math.max(420,host.clientWidth-64));
    const height=Math.min(700,Math.max(320,host.clientHeight-64));
    const saved=shellPreferences.windows[app.id];
    win.style.left=`${saved?Math.min(saved.x,Math.max(0,host.clientWidth-100)):Math.max(0,28+(index%3)*26)}px`;
    win.style.top=`${saved?Math.min(saved.y,Math.max(0,host.clientHeight-60)):Math.max(0,24+(index%3)*22)}px`;
    win.style.width=`${Math.min(saved?.width||width,Math.max(320,host.clientWidth-12))}px`;
    win.style.height=`${Math.min(saved?.height||height,Math.max(260,host.clientHeight-12))}px`;
    if(saved?.maximized) win.dataset.startMaximized='true';
  }
  for(const [id,win] of windowElements){if(win.dataset.startMaximized==='true'){windowManagerState=reduceWindowManagerState(windowManagerState,{type:'open',appId:id});windowManagerState=reduceWindowManagerState(windowManagerState,{type:'toggle-maximize',appId:id});delete win.dataset.startMaximized;}}
  const active=windowElements.get('home');
  active?.classList.add('is-active');
}
function syncWindowManager(){
  const visible=getVisibleWindowIds(windowManagerState);
  for(const app of OS_APPS){
    const win=windowElements.get(app.id);if(!win)continue;
    const state=windowManagerState.windows[app.id];
    const shown=isManagedWindowVisible(windowManagerState,app.id);
    win.hidden=!shown;
    win.classList.toggle('is-active',windowManagerState.activeId===app.id&&shown);
    win.classList.toggle('is-maximized',Boolean(state?.maximized));
    win.style.zIndex=String(state?.z||1);
    const maxButton=win.querySelector('[data-window-action="maximize"]');
    if(maxButton){maxButton.setAttribute('aria-pressed',String(Boolean(state?.maximized)));maxButton.setAttribute('aria-label',state?.maximized?`Restore ${app.name} window`:`Maximize ${app.name} window`);maxButton.title=state?.maximized?'Restore':'Maximize';}
    $$('[data-os-app]').filter(b=>b.dataset.osApp===app.id).forEach(b=>{b.classList.toggle('is-current',windowManagerState.activeId===app.id&&shown);b.classList.toggle('is-running',Boolean(state?.open));});
  }
  $('#mainContent').classList.toggle('is-empty',visible.length===0);
  $('#desktopEmpty').hidden=visible.length>0;
  const activeApp=getOSApp(windowManagerState.activeId);
  $('#taskbarMessage').textContent=activeApp?`${activeApp.name.toUpperCase()} · ${visible.length>1?`${visible.length} WINDOWS OPEN`:'ACTIVE'}`:'DESKTOP · NO OPEN WINDOWS';
  $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===(activeApp?.id==='studio'?'studio':activeApp?.id)));
}
function focusManagedWindow(appId,{focusContent=false}={}){
  if(!windowElements.has(appId))return;
  windowManagerState=reduceWindowManagerState(windowManagerState,{type:'focus',appId});
  syncWindowManager();
  if(focusContent)windowElements.get(appId)?.querySelector('.app-window-content')?.focus({preventScroll:true});
}
function changeManagedWindow(type,appId=windowManagerState.activeId){
  if(!appId)return;
  windowManagerState=reduceWindowManagerState(windowManagerState,{type,appId});syncWindowManager();
  saveShellLayout();
  if(type==='restore'||type==='open'||type==='focus')windowElements.get(appId)?.querySelector('.app-window-content')?.focus({preventScroll:true});
  else if(type==='minimize')($(`[data-os-app="${appId}"]`,$('#taskbarApps'))||$('#startButton')).focus();
  else if(type==='close')$('#startButton').focus();
}
async function closeManagedWindow(appId=windowManagerState.activeId){
  if(!appId)return;
  if(appId==='studio'&&$('#view-career')?.classList.contains('active')){
    const saved=await flushCareerBeforeTransition();
    if(!saved){toast('Window kept open: the Professional Practice draft could not be saved. Export it before closing.');return;}
  }
  if(appId==='studio'&&studioDirty){const saved=await flushStudioPersist();if(!saved||studioDirty){toast('Window kept open: the Studio project has unsaved or conflicting changes. Export it before closing.');return;}}
  windowManagerState=reduceWindowManagerState(windowManagerState,{type:'close',appId});syncWindowManager();saveShellLayout();
  if(windowManagerState.activeId)windowElements.get(windowManagerState.activeId)?.querySelector('.app-window-content')?.focus({preventScroll:true});else $('#startButton').focus();
}
async function launchOSApp(id){
  const app=getOSApp(id);if(!app)return;closeStartMenu({restoreFocus:false});
  if(windowManagerState.windows[id]?.open)focusManagedWindow(id,{focusContent:true});
  else if(id==='studio')await openStudio();else await navigate(id);
  if(windowManagerState.windows[id]?.open)focusManagedWindow(id,{focusContent:false});
  if(id==='files')renderFiles();
  $('#taskbarMessage').textContent=`${app.name.toUpperCase()} · ACTIVE`;
}
function bindWindowInteractions(){
  const host=$('#mainContent');
  host.addEventListener('click',e=>{const control=e.target.closest('[data-window-action]');if(!control)return;const win=control.closest('[data-window-app]');if(!win)return;const id=win.dataset.windowApp;const action=control.dataset.windowAction;if(action==='close')void closeManagedWindow(id);else changeManagedWindow(action==='maximize'?'toggle-maximize':action,id);});
  host.addEventListener('focusin',e=>{const win=e.target.closest('[data-window-app]');if(win&&windowManagerState.activeId!==win.dataset.windowApp)focusManagedWindow(win.dataset.windowApp);});
  host.addEventListener('pointerdown',e=>{const win=e.target.closest('[data-window-app]');if(win)focusManagedWindow(win.dataset.windowApp);const titlebar=e.target.closest('.app-window-titlebar');if(!titlebar||e.target.closest('button'))return;const appWindow=titlebar.closest('[data-window-app]');if(!appWindow||windowManagerState.windows[appWindow.dataset.windowApp]?.maximized||matchMedia('(max-width: 720px)').matches)return;const rect=appWindow.getBoundingClientRect(),bounds=host.getBoundingClientRect();windowDragState={id:appWindow.dataset.windowApp,pointerId:e.pointerId,offsetX:e.clientX-rect.left,offsetY:e.clientY-rect.top,hostLeft:bounds.left,hostTop:bounds.top};titlebar.setPointerCapture?.(e.pointerId);e.preventDefault();});
  document.addEventListener('pointermove',e=>{if(!windowDragState||e.pointerId!==windowDragState.pointerId)return;const win=windowElements.get(windowDragState.id);if(!win)return;const hostRect=host.getBoundingClientRect(),maxX=Math.max(0,hostRect.width-90),maxY=Math.max(0,hostRect.height-44);const left=Math.max(0,Math.min(maxX,e.clientX-windowDragState.hostLeft-windowDragState.offsetX));const top=Math.max(0,Math.min(maxY,e.clientY-windowDragState.hostTop-windowDragState.offsetY));win.style.left=`${left}px`;win.style.top=`${top}px`;});
  document.addEventListener('pointerup',e=>{if(windowDragState&&e.pointerId===windowDragState.pointerId)windowDragState=null;if(e.target?.closest?.('.app-window'))saveShellLayout();});document.addEventListener('pointercancel',e=>{if(windowDragState&&e.pointerId===windowDragState.pointerId)windowDragState=null;});
  host.addEventListener('keydown',e=>{const titlebar=e.target.closest('.app-window-titlebar');if(!titlebar||!e.altKey||!e.key.startsWith('Arrow')||(!e.ctrlKey&&!e.shiftKey))return;const win=titlebar.closest('[data-window-app]');if(!win||windowManagerState.windows[win.dataset.windowApp]?.maximized)return;e.preventDefault();const step=e.shiftKey?40:20;let left=parseFloat(win.style.left)||0,top=parseFloat(win.style.top)||0,width=win.offsetWidth,height=win.offsetHeight;if(e.ctrlKey){if(e.key==='ArrowLeft')width-=step;if(e.key==='ArrowRight')width+=step;if(e.key==='ArrowUp')height-=step;if(e.key==='ArrowDown')height+=step;win.style.width=`${Math.max(360,Math.min($('#mainContent').clientWidth,width))}px`;win.style.height=`${Math.max(280,Math.min($('#mainContent').clientHeight,height))}px`;}else{if(e.key==='ArrowLeft')left-=step;if(e.key==='ArrowRight')left+=step;if(e.key==='ArrowUp')top-=step;if(e.key==='ArrowDown')top+=step;win.style.left=`${Math.max(0,Math.min($('#mainContent').clientWidth-80,left))}px`;win.style.top=`${Math.max(0,Math.min($('#mainContent').clientHeight-44,top))}px`;}});
}
function saveShellLayout(immediate=false){
  const windows={};
  for(const [id,win] of windowElements){
    const state=windowManagerState.windows[id];
    if(!win.isConnected) continue;
    windows[id]={x:Math.round(parseFloat(win.style.left)||0),y:Math.round(parseFloat(win.style.top)||0),width:Math.round(parseFloat(win.style.width)||win.offsetWidth||420),height:Math.round(parseFloat(win.style.height)||win.offsetHeight||320),maximized:Boolean(state.maximized)};
  }
  shellPreferences={...shellPreferences,windows};
  if(shellPreferenceSaveTimer)clearTimeout(shellPreferenceSaveTimer);
  if(immediate){writeShellPreferences(localStorage,shellPreferences);return;}
  shellPreferenceSaveTimer=setTimeout(()=>{if(!writeShellPreferences(localStorage,shellPreferences))toast('Desktop layout could not be saved. Project data is unaffected.');},180);
}
function resetShellLayout(){shellPreferences={...shellPreferences,windows:{}};writeShellPreferences(localStorage,shellPreferences);for(const [index,[id,win]] of [...windowElements.entries()].entries()){win.style.left=`${28+(index%3)*26}px`;win.style.top=`${24+(index%3)*22}px`;win.style.width=`min(920px, calc(100% - 24px))`;win.style.height='min(660px, calc(100% - 24px))';if(windowManagerState.windows[id]?.maximized)windowManagerState=reduceWindowManagerState(windowManagerState,{type:'toggle-maximize',appId:id});}syncWindowManager();toast('Default desktop arrangement restored.');}
function notify(title,detail=''){
  notificationItems.unshift({id:`n-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,title:String(title).slice(0,100),detail:String(detail).slice(0,220),time:new Date().toISOString(),read:false});
  notificationItems=notificationItems.slice(0,20);renderNotifications();
}
function renderNotifications(){
  const list=$('#notificationList');if(!list)return;
  const unread=notificationItems.filter(item=>!item.read).length;
  $('#notificationCount').textContent=unread?String(unread):'';
  $('#notificationCount').hidden=!unread;
  list.innerHTML=notificationItems.length?`<div class="notification-actions"><button type="button" data-notification-action="read-all">MARK ALL READ</button><button type="button" data-notification-action="clear">CLEAR ALL</button></div>`+notificationItems.map(item=>`<article class="notification-item ${item.read?'is-read':''}"><strong>${safeText(item.title)}</strong><small>${safeText(item.detail)}</small><time>${safeText(new Date(item.time).toLocaleTimeString())}</time><button type="button" data-notification-read="${safeText(item.id)}">${item.read?'READ':'MARK READ'}</button></article>`).join(''):'<p class="notification-empty">Nothing new. Important local events will appear here.</p>';
}
function openFilesProject(id){
  const project=studioLibrary.find(item=>item.id===id);if(!project)return;
  const activate=async()=>{if(studioProject?.id!==id){const switched=await switchStudioProjectById(id);if(!switched)return;}await launchOSApp('studio');};
  void activate();
}
function renderDesktopSurface(){
  const shortcuts=$('#desktopShortcutGrid');
  if(shortcuts)shortcuts.innerHTML=OS_APPS.filter(app=>app.id!=='home').map(app=>`<button type="button" class="desktop-shortcut" data-desktop-app="${app.id}"><span>${safeText(app.icon)}</span><b>${safeText(app.name)}</b></button>`).join('');
  const recent=$('#desktopRecentProjects');
  if(recent)recent.innerHTML=studioLibrary.slice(0,4).map(project=>`<button type="button" class="desktop-recent-item" data-desktop-project="${safeText(project.id)}"><strong>${safeText(project.title||'Untitled project')}</strong><small>${(project.tasks||[]).length} TASKS · ${(project.canvasNodes||[]).length} MAP ITEMS</small></button>`).join('')||'<p>No recent Studio projects yet.</p>';
}
function renderFiles(){
  const root=$('#filesContent');if(!root)return;
  const query=($('#filesSearch')?.value||'').trim().toLowerCase();
  const projects=studioLibrary.filter(p=>`${p.title} ${p.tagline} ${p.audience}`.toLowerCase().includes(query));
  const creations=archive.filter(item=>`${item.title} ${item.description} ${item.category}`.toLowerCase().includes(query));
  root.innerHTML=`<section class="files-section"><div class="files-section-head"><div><span class="eyebrow">PROJECT WORKSPACES</span><h2>STUDIO PROJECTS <small>${studioLibrary.length} / 8</small></h2></div><button type="button" class="outline-button" data-files-action="backup">BACK UP WORKSPACE ↓</button></div>${projects.length?projects.map(p=>`<article class="file-row"><span class="file-icon">▦</span><div><strong>${safeText(p.title||'Untitled project')}</strong><small>${safeText(p.creation?.category||'project').toUpperCase()} · ${(p.tasks||[]).length} TASKS · ${(p.canvasNodes||[]).length} MAP ELEMENTS</small></div><button type="button" class="action-secondary" data-file-project="${safeText(p.id)}">OPEN PROJECT ↗</button></article>`).join(''):'<p class="files-empty">No matching Studio projects. Create one in Studio to see it here.</p>'}</section><section class="files-section"><div class="files-section-head"><div><span class="eyebrow">SAVED CREATIONS</span><h2>ARCHIVE <small>${archive.length} / 300</small></h2></div><button type="button" class="outline-button" data-files-action="archive">OPEN ARCHIVE ↗</button></div>${creations.slice(0,40).map(item=>`<article class="file-row"><span class="file-icon file-art">✳</span><div><strong>${safeText(item.title)}</strong><small>${safeText(CATEGORIES[item.category]?.label||item.category).toUpperCase()} · SEED ${safeText(item.seed)}</small></div><button type="button" class="action-secondary" data-file-creation="${safeText(item.id)}">INSPECT ↗</button></article>`).join('')||'<p class="files-empty">No matching archived creations.</p>'}</section><p class="files-footnote">Files is a browser-local index of DREAMFORGER records, not a view of your computer’s folders. Binary file management arrives with the later Asset Studio milestone.</p>`;
}
function renderOsHub(){
  const grid=$('#osHubGrid');if(!grid)return;
  const systems=curioidHostInspection?.systems||OS_REGISTRY.map(item=>({...item,status:item.local?'local':'directory-link'}));
  grid.innerHTML=systems.map(os=>{
    const state=os.status==='local'?'ACTIVE HERE':os.status==='active'?'ACTIVE IN HOST':os.status==='catalogued'?'IN CATALOGUE':os.status==='not-found'?'NOT IN THIS BUILD':'OPEN CURIOID';
    const launch=os.local?'':os.status==='not-found'?'<span class="os-hub-unavailable">NOT AVAILABLE IN THIS HOST BUILD</span>':`<a class="os-hub-launch" data-os-launch="${safeText(os.id)}" href="${CURIOID_HOST_URL}#curioid=${encodeURIComponent(os.id)}" target="_blank" rel="noopener noreferrer">OPEN ↗</a>`;
    return `<article class="os-hub-card ${os.local?'is-active':''}"><div class="os-hub-card-top"><strong>${safeText(os.name)}</strong><span>${state}</span></div><b>${safeText(os.kind==='experience'?'CURIOID EXPERIENCE':os.kind==='environment'?'HOSTED ENVIRONMENT':'SPECIALIST OS')} · ${safeText(os.role)}</b><p>${safeText(os.domain)}</p>${launch}</article>`;
  }).join('');
  const status=$('#osHubStatus');
  if(!curioidHostInspection?.available)status.textContent='STANDALONE MODE · CURIOID CONNECT IS NOT LOADED IN THIS PAGE. OS LINKS USE CURIOID’S VERIFIED #curioid=PROJECT-ID ROUTE. NO CROSS-ORIGIN MESSAGE BUS IS CREATED.';
  else if(!curioidHostInspection.compatible)status.textContent=`CURIOID HOST DETECTED BUT INCOMPATIBLE · KERNEL ${safeText(curioidHostInspection.kernelVersion||'UNKNOWN')} · CONNECT ${safeText(curioidHostInspection.connectVersion||'UNKNOWN')} · REQUIRED KERNEL ${'1.13.0'} / CONNECT 1.0.0 / APP SDK 1.0.0.`;
  else status.textContent=`CONNECTED TO CURIOID · KERNEL ${safeText(curioidHostInspection.kernelVersion)} · CONNECT ${safeText(curioidHostInspection.connectVersion)} · APP SDK ${safeText(curioidHostInspection.sdkVersion)} · EXCHANGE ${safeText(curioidHostInspection.exchangeVersion||'UNAVAILABLE')} ${curioidExchangePermission.granted?'PERMISSION GRANTED':curioidExchangePermission.available?'PERMISSION NOT GRANTED':'UNAVAILABLE'}`;
  const label=$('#osHubProjectLabel');if(label)label.textContent=studioProject?`Ready to share: ${studioProject.title||'Untitled project'}`:'No active Studio project.';
  const share=$('#osHubShareProject');if(share)share.disabled=curioidAdapterBusy||!curioidIntegration?.connected||!studioProject;
  const messages=$('#osHubMessages');if(messages){
    if(!curioidHostInspection?.available)messages.innerHTML='<p>DREAMFORGER is running independently. Open a CURIOID system from the directory above. The native adapter becomes available when DREAMFORGER is mounted inside CURIOID as a trusted same-origin first-party OS. The standalone build does not create a duplicate Kernel, Connect runtime or message bus.</p>';
    else if(!curioidIntegration?.connected)messages.innerHTML='<p>The CURIOID host was found, but the required Connect / App SDK contract is not compatible or DREAMFORGER could not register safely. No fallback bridge was started.</p>';
    else if(!curioidExchangePermission.granted)messages.innerHTML='<p>To enable project handoff: open any CURIOID OS → CURIOID Exchange → Kernel Bridge → choose DREAMFORGER → Grant access. The grant belongs to CURIOID and can be revoked there.</p>';
    else messages.innerHTML=`<p>Native Kernel adapter: ACTIVE · DREAMFORGER projects export as <code>dreamforger/project</code>. Other OS artifacts enter as metadata-only Asset Library references. ${curioidIntegration.assetLibraryAvailable?'Asset Library available.':'Asset Library unavailable; reference imports will fail safely.'} Project copies never overwrite an existing Studio project.</p>`;
  }
  const references=$('#osHubReferences');if(references){
    const imported=studioLibrary.filter(project=>project.sourceReference).map(project=>({title:project.title,kind:'IMPORTED PROJECT COPY',source:'DREAMFORGER',type:project.sourceReference.artifactType,id:project.sourceReference.artifactId,detail:'A new local Studio project with parent-project lineage.'}));
    const external=curioidReferences.map(record=>({title:record.title,kind:'EXTERNAL REFERENCE',source:OS_REGISTRY.find(os=>os.id===record.data?.sourceExperienceId)?.name||record.data?.sourceExperienceId||'UNKNOWN SOURCE',type:record.data?.artifactType||record.kind,id:record.data?.artifactId||record.id,detail:'Metadata only. Original content remains in its source operating system.'}));
    const rows=[...imported,...external];
    if(!curioidIntegration?.connected)references.innerHTML='<p class="os-hub-reference-empty">Connect DREAMFORGER inside CURIOID to browse its Asset Library references. Standalone mode does not create a replacement store.</p>';
    else if(curioidReferencesState==='error')references.innerHTML='<p class="os-hub-reference-empty">The shared Asset Library could not be read. Existing data was not treated as empty and no references were removed.</p>';
    else if(!rows.length)references.innerHTML='<p class="os-hub-reference-empty">No imported project copies or external references yet. Import a DREAMFORGER project through Exchange, or receive a declared artifact from another native OS.</p>';
    else references.innerHTML=rows.map(item=>`<article class="os-hub-reference"><div><b>${safeText(item.title||'Untitled reference')}</b><small>${safeText(item.kind)} · ${safeText(item.source)} · ${safeText(item.type)}</small><small>${safeText(item.detail)}</small></div><code>${safeText(item.id)}</code></article>`).join('');
  }
}
async function refreshCurioidHubStatus(){
  curioidHostInspection=inspectCurioidHost(window);
  if(curioidHostInspection.compatible&&!curioidIntegration?.connected)curioidIntegration=connectDreamforgerToCurioid(window,makeDreamforgerAdapterCallbacks());
  curioidHostInspection=inspectCurioidHost(window);
  if(curioidIntegration?.connected){try{curioidExchangePermission=await curioidIntegration.permissionStatus();}catch{curioidExchangePermission={available:false,granted:false};}try{curioidReferences=await curioidIntegration.listReferences();curioidReferencesState='ready';}catch{curioidReferencesState='error';}}
  else{curioidReferences=[];curioidReferencesState='unavailable';}
  renderOsHub();
}
function bindCoreApps(){
  curioidHostInspection=inspectCurioidHost(window);
  if(curioidHostInspection.compatible)curioidIntegration=connectDreamforgerToCurioid(window,makeDreamforgerAdapterCallbacks());
  curioidHostInspection=inspectCurioidHost(window);
  $('#osHubButton').addEventListener('click',()=>{renderOsHub();$('#osHubDialog').showModal();void refreshCurioidHubStatus();});
  $('#osHubClose').addEventListener('click',()=>$('#osHubDialog').close());
  $('#osHubGrid').addEventListener('click',e=>{const link=e.target.closest('[data-os-launch]');if(!link)return;const result=launchCurioidSystem(window,link.dataset.osLaunch);if(result.ok){e.preventDefault();$('#osHubStatus').textContent=`LAUNCHING ${link.dataset.osLaunch.toUpperCase()} THROUGH CURIOID’S NATIVE PROJECT ROUTER.`;}});
  $('#osHubShareProject').addEventListener('click',async()=>{if(!studioProject||!curioidIntegration?.connected)return;if(!confirm(`Send a COPY of the complete Studio project “${studioProject.title||'Untitled project'}” to CURIOID Exchange Universal Space? This includes its notes, tasks, map, assets metadata, career data and creation details. It does not delete or replace the original. The safe handoff limit is 2 MiB.`))return;const button=$('#osHubShareProject');button.disabled=true;$('#osHubStatus').textContent='PREPARING A VERIFIED CURIOID KERNEL ARTIFACT…';try{const receipt=await sendProjectToCurioidExchange(curioidIntegration,studioProject,window,{approved:true});$('#osHubStatus').textContent=`PROJECT COPY DELIVERED TO CURIOID EXCHANGE · ${receipt.folderId.toUpperCase()} · ${Math.ceil(receipt.bytes/1024)} KB · ORIGINAL UNCHANGED.`;notify('CURIOID handoff complete',`${studioProject.title} was copied to Exchange Universal Space.`);}catch(error){$('#osHubStatus').textContent=String(error?.message||error).toUpperCase();}finally{button.disabled=!curioidIntegration?.connected||!studioProject;}});
  $('#filesSearch').addEventListener('input',renderFiles);
  $('#globalProjectContext').addEventListener('change',e=>{if(e.target.value)void switchStudioProjectById(e.target.value);});
  $('#desktopShortcutGrid').addEventListener('click',e=>{const b=e.target.closest('[data-desktop-app]');if(b)void launchOSApp(b.dataset.desktopApp);});
  $('#desktopRecentProjects').addEventListener('click',e=>{const b=e.target.closest('[data-desktop-project]');if(b)openFilesProject(b.dataset.desktopProject);});
  $('#filesContent').addEventListener('click',e=>{const project=e.target.closest('[data-file-project]');if(project){openFilesProject(project.dataset.fileProject);return;}const creation=e.target.closest('[data-file-creation]');if(creation){const item=findItem(creation.dataset.fileCreation);if(item)inspect(item);return;}const action=e.target.closest('[data-files-action]');if(action?.dataset.filesAction==='backup')void exportStudioLibrary();if(action?.dataset.filesAction==='archive')void launchOSApp('archive');});
  $('#notificationButton').addEventListener('click',()=>{const panel=$('#notificationPanel');panel.hidden=!panel.hidden;if(!panel.hidden){notificationItems=notificationItems.map(item=>({...item,read:true}));renderNotifications();$('#notificationPanelClose').focus();}});
  $('#notificationPanelClose').addEventListener('click',()=>{$('#notificationPanel').hidden=true;$('#notificationButton').focus();});
  $('#notificationList').addEventListener('click',e=>{const action=e.target.closest('[data-notification-action]');if(action?.dataset.notificationAction==='read-all'){notificationItems=notificationItems.map(item=>({...item,read:true}));renderNotifications();return;}if(action?.dataset.notificationAction==='clear'){notificationItems=[];renderNotifications();return;}const b=e.target.closest('[data-notification-read]');if(!b)return;notificationItems=notificationItems.map(item=>item.id===b.dataset.notificationRead?{...item,read:true}:item);renderNotifications();});
  $('#compactDesktop').checked=shellPreferences.compact;
  $('#fontScale').value=String(shellPreferences.fontScale);
  $('#highContrast').checked=shellPreferences.highContrast;
  $('#reduceMotion').checked=shellPreferences.reduceMotion;
  $('#compactDesktop').addEventListener('change',e=>{shellPreferences={...shellPreferences,compact:e.target.checked};saveShellPreferences();});
  $('#fontScale').addEventListener('change',e=>{shellPreferences={...shellPreferences,fontScale:Number(e.target.value)};saveShellPreferences();});
  $('#highContrast').addEventListener('change',e=>{shellPreferences={...shellPreferences,highContrast:e.target.checked};saveShellPreferences();});
  $('#reduceMotion').addEventListener('change',e=>{shellPreferences={...shellPreferences,reduceMotion:e.target.checked};saveShellPreferences();});
  $('#resetDesktopLayout').addEventListener('click',resetShellLayout);
  $('#settingsBackupArchive').addEventListener('click',exportAll);
  $('#settingsBackupStudio').addEventListener('click',()=>void exportStudioLibrary());
  $('#settingsRecoveryExport').addEventListener('click',exportRawRecovery);
  $('#settingsDiagnosticsRun').addEventListener('click',()=>{runDiagnostics();renderSettingsDiagnostics();});
  $('#settingsButton').addEventListener('click',()=>{renderSettingsDiagnostics();$('#settingsRecoveryExport').hidden=!(archiveRecoveryWarning||studioRecoveryWarning||archiveConflictWarning||studioConflictWarning);$('#settingsDialog').showModal();});
  $('#settingsClose').addEventListener('click',()=>$('#settingsDialog').close());
  $('#helpButton').addEventListener('click',()=>$('#helpDialog').showModal());
}

function bindDesktopShell(){
  initializeWindowHost();syncWindowManager();bindWindowInteractions();renderStartApps();
  bindCoreApps();
  $('#startButton').addEventListener('click',()=>$('#startMenu').hidden?openStartMenu():closeStartMenu());
  $('#startMenuClose').addEventListener('click',()=>closeStartMenu());
  $('#startSearch').addEventListener('input',e=>renderStartApps(e.target.value));
  $('#startMenu').addEventListener('click',e=>{const b=e.target.closest('[data-os-app]');if(b)void launchOSApp(b.dataset.osApp);});
  $('#taskbarApps').addEventListener('click',e=>{const b=e.target.closest('[data-os-app]');if(b)void launchOSApp(b.dataset.osApp);});
  $('#desktopOpenStart').addEventListener('click',openStartMenu);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#startMenu').hidden){e.preventDefault();closeStartMenu();}if(e.key==='Escape'&&!$('#notificationPanel').hidden){$('#notificationPanel').hidden=true;$('#notificationButton').focus();}if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.code==='Space'){e.preventDefault();$('#startMenu').hidden?openStartMenu():closeStartMenu();}if((e.ctrlKey||e.metaKey)&&e.altKey&&e.key.toLowerCase()==='m'){e.preventDefault();changeManagedWindow('minimize');}if((e.ctrlKey||e.metaKey)&&e.altKey&&e.key==='Enter'){e.preventDefault();changeManagedWindow('toggle-maximize');}});
  document.addEventListener('pointerdown',e=>{if(!$('#startMenu').hidden&&!$('#startMenu').contains(e.target)&&!$('#startButton').contains(e.target))closeStartMenu({restoreFocus:false});if(!$('#notificationPanel').hidden&&!$('#notificationPanel').contains(e.target)&&!$('#notificationButton').contains(e.target))$('#notificationPanel').hidden=true;});
}

async function init(){bindDesktopShell();archive=loadArchive();renderArchiveCount();renderRecent();updateDaily();renderDiscoveries();updateClock();setInterval(updateClock,15000);
  $$('.nav-item').forEach(b=>b.addEventListener('click',()=>b.dataset.view==='studio'?openStudio():navigate(b.dataset.view)));
  $$('[data-view]').forEach(b=>{if(b.classList.contains('nav-item'))return;if(b.dataset.view==='studio')b.addEventListener('click',()=>void openStudio());else b.addEventListener('click',()=>navigate(b.dataset.view));});
  $$('[data-open-forge]').forEach(b=>b.addEventListener('click',()=>setForge(b.dataset.openForge)));
  $$('[data-category]').forEach(b=>b.addEventListener('click',()=>setForge(b.dataset.category)));
  $('#heroCreate').addEventListener('click',openStudio);
  $('#openStudioFromForge').addEventListener('click',openStudio);bindStudio();$('#generateButton').addEventListener('click',makeOne);$('#emptyGenerate').addEventListener('click',makeOne);$('#generateTrioButton').addEventListener('click',makeTrio);$('#rebuildCreation').addEventListener('click',rebuildCurrent);$('#forgeVariants').addEventListener('click',e=>{const b=e.target.closest('[data-variant-index]');if(b)chooseVariant(Number(b.dataset.variantIndex));});
  $('#categoryGrid').addEventListener('click',e=>{const b=e.target.closest('[data-cat]');if(b)setCategory(b.dataset.cat);});
  $('#chaosRange').addEventListener('input',e=>{const v=Number(e.target.value);$('#chaosValue').textContent=`${v} / ${v<30?'GROUNDED':v<65?'UNUSUAL':'UNHINGED'}`;});
  $('#saveCreation').addEventListener('click',saveCurrent);$('#mutateCreation').addEventListener('click',mutateCurrent);$('#downloadSvg').addEventListener('click',()=>current&&exportSvg(current));$('#exportBuildSheet').addEventListener('click',()=>current&&exportBuildSheet(current));$('#copySummary').addEventListener('click',()=>current&&copySummary(current));
  $('#tryDaily').addEventListener('click',e=>setForge('anything',e.currentTarget.dataset.prompt));
  $('#archiveSearch').addEventListener('input',()=>{archiveVisibleCount=24;renderArchive();});$('#archiveSort').addEventListener('change',()=>{archiveVisibleCount=24;renderArchive();});$('#exportAllButton').addEventListener('click',exportAll);$('#importButton').addEventListener('click',()=>$('#importInput').click());$('#importInput').addEventListener('change',e=>{importFile(e.target.files[0]);e.target.value='';});
  $('#exploreFilters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;exploreFilter=b.dataset.filter;$$('.filter-chip').forEach(x=>x.classList.toggle('active',x===b));renderDiscoveries();});
  $('#refreshDiscoveries').addEventListener('click',()=>{demos=createDemoSet().map(x=>createCreation({category:x.category,seed:randomSeed(),chaos:x.chaos,prompt:x.prompt}));renderDiscoveries();toast('Discovery field reshuffled.');});
  $('#recentList').addEventListener('click',e=>{const row=e.target.closest('[data-open-id]');if(row){const item=findItem(row.dataset.openId);if(item)inspect(item);}});
  $('#archiveGrid').addEventListener('click',async e=>{if(e.target.closest('[data-load-more]')){archiveVisibleCount+=24;renderArchive();return;}const action=e.target.closest('[data-card-action]');if(action){const item=findItem(action.dataset.id);if(!item)return;if(action.dataset.cardAction==='view')inspect(item);if(action.dataset.cardAction==='remix')remixItem(item.id);if(action.dataset.cardAction==='fuse')fuseFromArchive(item.id);if(action.dataset.cardAction==='export')exportCreation(item);if(action.dataset.cardAction==='delete'){if(confirm(`Delete “${item.title}” from this device?`)){archive=archive.filter(x=>x.id!==item.id);const saved=await persist();renderArchive();renderRecent();toast(saved?'Creation deleted from your local archive.':'Deletion remains in this session only; storage conflict or failure prevented saving.');}}return;}const forge=e.target.closest('[data-open-forge]');if(forge)setForge(forge.dataset.openForge);});
  $('#discoveryGrid').addEventListener('click',e=>{const b=e.target.closest('[data-card-action]');if(!b)return;const item=findItem(b.dataset.id);if(!item)return;if(b.dataset.cardAction==='view')inspect(item);if(b.dataset.cardAction==='remix')remixItem(item.id);});
  $('#detailDialogContent').addEventListener('click',e=>{const b=e.target.closest('[data-dialog-action]');if(!b)return;const item=findItem(b.dataset.id);if(!item)return;$('#detailDialog').close();if(b.dataset.dialogAction==='studio'){current=item;openStudio();}if(b.dataset.dialogAction==='remix')remixItem(item.id);if(b.dataset.dialogAction==='export')exportCreation(item);if(b.dataset.dialogAction==='build')exportBuildSheet(item);});
  $('#helpOkay').addEventListener('click',()=>$('#helpDialog').close());
  $('#runDiagnostics').addEventListener('click',runDiagnostics);$('#runMigrationPreview').addEventListener('click',runMigrationPreview);$('#clearLocalData').addEventListener('click',clearData);$('#exportRecoveryData').addEventListener('click',exportRawRecovery);
  window.addEventListener('dreamforger:storage-updated',updateStorageMeter);
  window.addEventListener('dreamforger:project-switched',e=>{const project=studioLibrary.find(p=>p.id===e.detail?.projectId);if(project){const eventType=['project-opened','project-created','project-branched'].includes(e.detail?.eventType)?e.detail.eventType:'project-opened';projectContext=recordProjectContextEvent(projectContext,{type:eventType,projectId:project.id,label:project.title});notify('Project ready',project.title);}renderGlobalProjectContext();renderFiles();renderDesktopSurface();renderOsHub();});
  window.addEventListener('storage',e=>{if(e.key===STORAGE_EPOCH_KEY){updateStorageMeter();toast('Local data was reset in another tab. Reload this tab before continuing; stale writes are blocked.');return;}if(e.key===STUDIO_STORE&&!studioDirty&&!studioRecoveryWarning&&!$('#view-career')?.classList.contains('active'))refreshStudioFromStorage(true);if(e.key===STORE||e.key===STUDIO_STORE||e.key===null){updateStorageMeter();toast('Another tab changed local data. Changes will be reconciled or protected from overwrite when you save.');}});
  window.addEventListener('pagehide',()=>{curioidIntegration?.dispose?.();saveShellLayout(true);if(studioDirty)showStudioSaveError('UNSAVED · REOPEN AND EXPORT BEFORE CLOSING');});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&studioDirty)void flushStudioPersist();});
  $('#systemState').textContent='KNIGHTMARE OS READY';renderNotifications();
  studioProject=loadStudio();renderFiles();renderDesktopSurface();renderOsHub();if(studioProject){renderStudio();await navigate('studio');window.dispatchEvent(new CustomEvent('dreamforger:project-switched',{detail:{projectId:studioProject.id}}));}else{openStudio();window.dispatchEvent(new CustomEvent('dreamforger:project-switched',{detail:{projectId:studioProject?.id||null}}));}$('#exportRecoveryData').hidden=!(archiveRecoveryWarning||studioRecoveryWarning);$('#settingsRecoveryExport').hidden=!(archiveRecoveryWarning||studioRecoveryWarning||archiveConflictWarning||studioConflictWarning);
  if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
init().catch(error=>{console.error('DREAMFORGER initialization failed',error);const state=document.querySelector('#systemState');if(state)state.textContent='STARTUP ERROR · EXPORT LOCAL DATA';});
if(archiveRecoveryWarning||studioRecoveryWarning){const message='Recovery warning: '+[archiveRecoveryWarning,studioRecoveryWarning].filter(Boolean).join(' ');setTimeout(()=>toast(message),350);}
