import {calculateQuote,scoreMatrix} from './career-engine.mjs';
import {createCareerDefaults,normalizeCareerData,hasCareerNormalizationLoss} from './career-data.mjs';
import {updateCareerProject,readCareerProject,findCareerProject} from './career-project-store.mjs';
import {reconcileCareerDraft} from './career-merge.mjs';
import {withExclusiveStorageLock} from './storage-lock.mjs';
import {readStorageEpoch} from './storage-epoch.mjs';
import {storageBudgetAllows} from './storage-budget.mjs';
/* Dreamforger Career Suite — local-first professional tools. */
const KEY='dreamforger.career-suite.v1',STUDIO_KEY='dreamforge.studio.v1',STUDIO_LOCK='dreamforger:studio-storage',LEGACY_LOCK='dreamforger:legacy-career-storage';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const defaults=createCareerDefaults();
let activeProjectId=null,legacyRecoveryRaw=null,projectRecoveryRaw=null,recoveryExported=false,saveTimer=null,saveDirty=false,careerConflict='',lastConflictNotice='',careerRevision=0,loadedStorageEpoch=readStorageEpoch();
let careerBaselineData=createCareerDefaults();
let data=load();let active='brief';
function clone(x){return JSON.parse(JSON.stringify(x));}
function readWorkspace(){
  try{
    const raw=localStorage.getItem(STUDIO_KEY);if(!raw)return null;
    const parsed=JSON.parse(raw);
    if(parsed?.format==='dreamforge-studio-library'&&parsed.version===1&&Array.isArray(parsed.projects)){
      if(parsed.projects.length>8||Object.keys(parsed).some(key=>!['format','version','activeId','projects'].includes(key))||(parsed.activeId!=null&&(typeof parsed.activeId!=='string'||parsed.activeId.length>120)))return {invalid:true,raw};
      const ids=parsed.projects.map(project=>project?.id);
      if(ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length||(parsed.activeId!=null&&!ids.includes(parsed.activeId)))return {invalid:true,raw};
      const project=parsed.projects.find(p=>p?.id===parsed.activeId)||parsed.projects[0]||null;
      return {raw:parsed,project,projectId:project?.id||null};
    }
    if(parsed?.format==='dreamforge-studio'&&parsed.version===1&&parsed.creation){
      if(Object.keys(parsed).some(key=>!['format','version','id','creation','title','tagline','audience','goal','firstStep','success','notes','tasks','canvasNodes','career','snapshots','updatedAt','parentProjectId','appVersion','exportedAt','exportNotice'].includes(key)))return {invalid:true,raw};
      return {raw:parsed,project:parsed,projectId:parsed.id||null,legacy:true};
    }
    return {invalid:true,raw};
  }catch{return {invalid:true};}
}
function readLegacyDraft(){
  try{
    const raw=localStorage.getItem(KEY);if(!raw)return null;
    const parsed=JSON.parse(raw);
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||hasCareerNormalizationLoss(parsed))throw Error('invalid');
    return normalizeCareerData(parsed);
  }catch{
    const raw=localStorage.getItem(KEY);
    if(raw)legacyRecoveryRaw=raw;
    return raw?{...createCareerDefaults(),_recovery:raw}:null;
  }
}
async function writeProjectCareer(projectId,next,revision){
  const transactionEpoch=loadedStorageEpoch;
  try{
    return await withExclusiveStorageLock(STUDIO_LOCK,async()=>{
      if(readStorageEpoch()!==transactionEpoch||transactionEpoch!==loadedStorageEpoch){careerConflict='Local data was reset in another tab. Reload before saving this draft.';return false;}
      const stored=localStorage.getItem(STUDIO_KEY);if(!stored)return false;
      const raw=JSON.parse(stored),normalized=normalizeCareerData(next);
      const storedProject=findCareerProject(raw,projectId);
      if(!storedProject){careerConflict='The active project no longer exists in the stored workspace. Reload before saving.';return false;}
      if(storedProject.career!=null&&hasCareerNormalizationLoss(storedProject.career)&&!recoveryExported){careerConflict='The stored Career Suite draft contains unsupported or damaged fields. Its original data was preserved; export the raw recovery file before continuing.';return false;}
      const remote=readCareerProject(raw,projectId)||createCareerDefaults();
      const baseline=projectId===activeProjectId?careerBaselineData:remote;
      const merged=reconcileCareerDraft(baseline,normalized,remote);
      if(!merged.ok){careerConflict=merged.reason;return false;}
      const finalData=normalizeCareerData(merged.data);
      const updated=updateCareerProject(raw,projectId,finalData);
      if(!updated)return false;
      const serialized=JSON.stringify(updated);
      if(!storageBudgetAllows(localStorage,STUDIO_KEY,serialized)){careerConflict='The workspace exceeds the safe 4 MiB browser-storage budget. Export the workspace and trim older snapshots or notes before saving.';return false;}
      localStorage.setItem(STUDIO_KEY,serialized);
      careerBaselineData=clone(finalData);careerConflict='';
      if(careerRevision===revision){data=clone(finalData);syncCareerFieldsFromData();}
      window.dispatchEvent(new CustomEvent('dreamforger:career-updated',{detail:{projectId,data:finalData,workspace:updated}}));
      return true;
    });
  }catch(error){careerConflict=error?.message||'Storage lock or quota failure.';return false;}
}
function syncCareerFieldsFromData(){
  for(const section of Object.keys(defaults))for(const el of fields(section)){
    if(el===document.activeElement)continue;
    const value=data[section]?.[el.dataset.field];if(value===undefined)continue;
    if(el.type==='checkbox')el.checked=!!value;else if(el.value!==String(value))el.value=String(value);
  }
  renderQuote();renderMatrix();
}

function load(){
  const workspace=readWorkspace();
  if(workspace?.project){
    activeProjectId=workspace.projectId;
    if(workspace.project.career!=null){if(hasCareerNormalizationLoss(workspace.project.career)){const original=JSON.stringify(workspace.project.career);projectRecoveryRaw=original;careerBaselineData=createCareerDefaults();return {...normalizeCareerData(workspace.project.career),_recovery:original};}const existing=normalizeCareerData(workspace.project.career);careerBaselineData=clone(existing);return existing;}
    const legacy=readLegacyDraft();
    const initial=legacy||createCareerDefaults();
    careerBaselineData=clone(initial);
    careerBaselineData=clone(initial);
    return initial;
  }
  if(workspace?.invalid){const original=workspace.raw||localStorage.getItem(STUDIO_KEY);projectRecoveryRaw=original||null;return {...createCareerDefaults(),_recovery:original||'unsupported-workspace'};}
  activeProjectId=null;
  const legacy=readLegacyDraft()||createCareerDefaults();
  careerBaselineData=clone(legacy._recovery?createCareerDefaults():legacy);
  return legacy;
}
function loadProject(projectId){
  const workspace=readWorkspace();
  const project=workspace?.raw?.projects?.find(p=>p?.id===projectId)||((workspace?.raw?.id===projectId)?workspace.raw:null);
  activeProjectId=projectId||null;legacyRecoveryRaw=null;projectRecoveryRaw=null;recoveryExported=false;clearCareerSaveConflict();
  if(project?.career!=null&&hasCareerNormalizationLoss(project.career)){projectRecoveryRaw=JSON.stringify(project.career);data={...normalizeCareerData(project.career),_recovery:projectRecoveryRaw};careerBaselineData=createCareerDefaults();}
  else if(project?.career&&typeof project.career==='object'){data=normalizeCareerData(project.career);careerBaselineData=clone(data);}
  else{data=createCareerDefaults();careerBaselineData=clone(data);}
  hydrate();
  if(projectId&&!data._recovery){saveDirty=true;void save();}
  showCareerRecovery();
  const state=$('#careerSaveState');if(state){state.textContent=data._recovery?'RECOVERY REQUIRED · ORIGINAL PRESERVED':'PROJECT CONTEXT LOADED';state.dataset.state=data._recovery?'error':'saved';}
}
async function save(){
  const revision=careerRevision;
  clearTimeout(saveTimer);saveTimer=null;
  if(data._recovery){$('#careerSaveState').textContent='RECOVERY REQUIRED · ORIGINAL PRESERVED';$('#careerSaveState').dataset.state='error';saveDirty=true;return false;}
  const normalized=normalizeCareerData(data);
  data=normalized;
  if(activeProjectId){
    const ok=await writeProjectCareer(activeProjectId,normalized,revision);
    if(!ok){showCareerSaveConflict(careerConflict||'The project draft could not be saved. Export your work before leaving.');saveDirty=true;return false;}
    clearCareerSaveConflict();$('#careerSaveState').textContent='SAVED WITH ACTIVE PROJECT';$('#careerSaveState').dataset.state='saved';saveDirty=careerRevision!==revision;
    return !saveDirty;
  }
  const transactionEpoch=loadedStorageEpoch;try{const result=await withExclusiveStorageLock(LEGACY_LOCK,async()=>{if(readStorageEpoch()!==transactionEpoch||transactionEpoch!==loadedStorageEpoch)return {ok:false,reason:'Local data was reset in another tab. Reload before saving.'};let remote=createCareerDefaults();const raw=localStorage.getItem(KEY);if(raw){let parsed;try{parsed=JSON.parse(raw);}catch{return {ok:false,reason:'The stored Career Suite draft is malformed. Export the original recovery data before continuing.'};}if(hasCareerNormalizationLoss(parsed)&&!recoveryExported)return {ok:false,reason:'The stored Career Suite draft contains unsupported or damaged fields. Its original data was preserved.'};remote=normalizeCareerData(parsed);}const merged=reconcileCareerDraft(careerBaselineData,normalized,remote);if(!merged.ok)return {ok:false,reason:merged.reason};const finalData=normalizeCareerData(merged.data),serialized=JSON.stringify(finalData);if(!storageBudgetAllows(localStorage,KEY,serialized))return {ok:false,reason:'The safe 4 MiB browser-storage budget is full. Export your dossier and trim stored project data before saving.'};localStorage.setItem(KEY,serialized);careerBaselineData=clone(finalData);return {ok:true,data:finalData};});if(!result.ok){careerConflict=result.reason;showCareerSaveConflict(careerConflict);saveDirty=true;return false;}if(careerRevision===revision){data=clone(result.data);syncCareerFieldsFromData();}$('#careerSaveState').textContent='SAVED LOCALLY';$('#careerSaveState').dataset.state='saved';window.dispatchEvent(new Event('dreamforger:storage-updated'));saveDirty=careerRevision!==revision;return !saveDirty;}
  catch(error){careerConflict=error?.message||'Storage lock or quota failure.';showCareerSaveConflict(careerConflict);saveDirty=true;return false;}
}
function showCareerSaveConflict(message){
  const state=$('#careerSaveState');
  if(state){state.textContent='SAVE BLOCKED · SEE DETAILS';state.dataset.state='error';state.title=message;state.setAttribute('aria-label',`Save blocked. ${message}`);}
  if(message&&message!==lastConflictNotice){toast(message);lastConflictNotice=message;}
}
function clearCareerSaveConflict(){
  const state=$('#careerSaveState');
  if(state){state.removeAttribute('title');state.removeAttribute('aria-label');}
  careerConflict='';lastConflictNotice='';
}
function scheduleSave(){
  careerRevision++;saveDirty=true;const state=$('#careerSaveState');if(state){state.textContent='UNSAVED CHANGES · SAVING…';state.dataset.state='pending';}
  clearTimeout(saveTimer);saveTimer=setTimeout(()=>{saveTimer=null;void save();},450);
}
async function flushPendingSave(){clearTimeout(saveTimer);saveTimer=null;for(let attempt=0;attempt<5&&saveDirty;attempt++){const ok=await save();if(!ok)return false;}return !saveDirty;}

function showCareerRecovery(){
  const panel=$('#careerRecovery');if(!panel)return;
  const raw=data?._recovery||projectRecoveryRaw||legacyRecoveryRaw;
  if(!raw||recoveryExported){panel.hidden=true;panel.innerHTML='';return;}
  panel.hidden=false;
  panel.innerHTML='A previous Career Suite save could not be read or contains fields this build cannot safely preserve. Its original data remains untouched. Export the original recovery data before replacing it. <button type="button" id="exportCareerRecovery" class="text-action">EXPORT ORIGINAL RECOVERY DATA</button>';
  $('#exportCareerRecovery').addEventListener('click',()=>{
    const original=data?._recovery||projectRecoveryRaw||legacyRecoveryRaw;if(!original)return;
    const blob=new Blob([original],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='dreamforger-career-recovery.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    if(data?._recovery)delete data._recovery;
    projectRecoveryRaw=null;legacyRecoveryRaw=null;recoveryExported=true;showCareerRecovery();
    const state=$('#careerSaveState');if(state){state.textContent='RECOVERY EXPORTED · EDITABLE COPY READY';state.dataset.state='saved';}
  });
}
function fields(section){return $$(`[data-career-section="${section}"] [data-field]`);}
function collect(section){for(const el of fields(section)){const key=el.dataset.field;if(el.type==='checkbox')data[section][key]=el.checked;else data[section][key]=el.type==='number'?Number(el.value):el.value;}scheduleSave();if(section==='quote')renderQuote();}
function activate(name){active=name;$$('[data-career-tab]').forEach(b=>{const selected=b.dataset.careerTab===name;b.classList.toggle('active',selected);b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});$$('[data-career-panel]').forEach(p=>p.hidden=p.dataset.careerPanel!==name);}
function hydrate(){for(const section of Object.keys(defaults)){for(const el of fields(section)){const value=data[section][el.dataset.field];if(value!==undefined){if(el.type==='checkbox')el.checked=!!value;else el.value=value;}}}renderQuote();renderMatrix();}
function money(n,c){return new Intl.NumberFormat(undefined,{style:'currency',currency:c||'EUR',maximumFractionDigits:2}).format(Number.isFinite(n)?n:0);}
function quoteNumbers(){return calculateQuote(data.quote);}
function renderMatrix(){const root=$('#matrixTable');if(!root)return;const active=document.activeElement;let restore=null;if(root.contains(active)){if(active.dataset.score!==undefined)restore={key:'score',value:active.dataset.score};else if(active.dataset.weight!==undefined)restore={key:'weight',value:active.dataset.weight};else if(active.dataset.optionName!==undefined)restore={key:'option-name',value:active.dataset.optionName,selectionStart:active.selectionStart,selectionEnd:active.selectionEnd};}const m=data.matrix,scores=scoreMatrix(m);root.innerHTML=`<div class="matrix-head"><span>CRITERION / WEIGHT</span>${m.options.map((o,i)=>`<span><input class="matrix-option-name" aria-label="Option ${i+1} name" maxlength="60" value="${esc(o.name)}" data-option-name="${i}"></span>`).join('')}</div>${m.criteria.map((c,ci)=>`<div class="matrix-row"><label>${esc(c.name)} <small>WEIGHT <input class="matrix-weight" aria-label="${esc(c.name)} weight" type="number" min="1" max="5" value="${c.weight}" data-weight="${ci}"></small></label>${m.options.map((o,oi)=>`<span><input aria-label="${esc(o.name)} ${esc(c.name)} score" type="number" min="0" max="5" step="1" value="${Math.max(0,Math.min(5,Number(o.scores[ci])||0))}" data-score="${oi}:${ci}"></span>`).join('')}</div>`).join('')}<div class="matrix-results">${scores.map(o=>`<div><span>${esc(o.name)}</span><b>${o.percent} / 100</b><i><em style="width:${o.percent}%"></em></i></div>`).join('')}</div><p class="career-caveat">Scores are structured judgement, not objective truth. Change weights to reflect the actual project and record evidence behind each score.</p>`;if(restore){const el=root.querySelector(`[data-${restore.key}="${restore.value}"]`);if(el){el.focus();if(restore.key==='option-name'&&Number.isInteger(restore.selectionStart)){try{el.setSelectionRange(restore.selectionStart,restore.selectionEnd);}catch{}}}}}
function report(){const b=data.brief,q=quoteNumbers(),v=data.validation,c=data.case,m=data.matrix,project=readWorkspace()?.project;return `DREAMFORGER CAREER SUITE — WORKING DOSSIER\nProject context: ${project?.title||'Standalone draft'}\nGenerated ${new Date().toLocaleString()}\n\nPROJECT BRIEF\nProject: ${b.name}\nClient / organisation: ${b.client}\nProblem: ${b.problem}\nAudience: ${b.audience}\nDeliverables: ${b.deliverables}\nConstraints: ${b.constraints}\nSuccess measures: ${b.success}\nTimeline: ${b.timeline}\nAssumptions to verify: ${b.assumptions}\n\nSCOPE & QUOTE ESTIMATE\nCurrency: ${data.quote.currency}\nCore hours: ${q.h}\nHourly rate: ${q.r}\nRevision allowance: ${q.rev} × ${q.rh} hours\nDirect expenses: ${q.ex}\nContingency: ${q.cont}%\nTax estimate: ${q.tax}%\nIndicative total: ${money(q.total,data.quote.currency)}\n\nVALIDATION PLAN\nConcept: ${v.concept}\nCritical assumption: ${v.assumption}\nTarget audience: ${v.audience}\nMethod: ${v.method}\nSample target: ${v.sample}\nEvidence / success signal: ${v.signal}\nDecision rule: ${v.decision}\n\nDECISION MATRIX\n${m.options.map((o,oi)=>{const score=m.criteria.reduce((s,cr,ci)=>s+(Number(cr.weight)||0)*(Number(o.scores[ci])||0),0);return `${o.name}: ${score} weighted points`;}).join('\n')}\nCriteria: ${m.criteria.map(x=>`${x.name} (weight ${x.weight})`).join(', ')}\n\nPORTFOLIO CASE STUDY\nTitle: ${c.title}\nRole: ${c.role}\nContext: ${c.context}\nChallenge: ${c.challenge}\nProcess: ${c.process}\nKey decisions: ${c.decisions}\nOutcome: ${c.outcome}\nReflection: ${c.reflection}\n\nNOTE\nThis dossier is a working document. Replace estimates with actuals, validate assumptions with real people, and obtain permission before publishing client work.`;}
function download(){const blob=new Blob([report()],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='dreamforger-career-dossier.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function copy(){try{if(!navigator.clipboard?.writeText)throw Error('clipboard unavailable');await navigator.clipboard.writeText(report());toast('Dossier copied.');}catch{toast('Clipboard unavailable. Use Export dossier instead.');}}
function toast(msg){const el=$('#careerToast');if(el){el.textContent=msg;el.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.hidden=true,3200);}}
function init(){if(!$('#view-career'))return;window.dreamforgerFlushCareer=flushPendingSave;window.addEventListener('dreamforger:local-data-cleared',()=>{activeProjectId=null;legacyRecoveryRaw=null;projectRecoveryRaw=null;recoveryExported=false;clearCareerSaveConflict();loadedStorageEpoch=readStorageEpoch();careerBaselineData=createCareerDefaults();careerRevision++;saveDirty=false;clearTimeout(saveTimer);saveTimer=null;data=createCareerDefaults();hydrate();showCareerRecovery();$('#careerSaveState').textContent='CLEARED';$('#careerSaveState').dataset.state='saved';});window.addEventListener('dreamforger:project-switched',e=>{const id=e.detail?.projectId??readWorkspace()?.projectId??null;if(id!==activeProjectId){if(saveDirty){toast('Project context changed before the pending draft was saved. The prior draft remains in this tab for export.');return;}loadProject(id);}});window.addEventListener('storage',e=>{if(e.key===STUDIO_KEY){const state=$('#careerSaveState');if(state&&activeProjectId){state.textContent='ANOTHER TAB SAVED · NEXT SAVE WILL RECONCILE';state.dataset.state='pending';}}});window.addEventListener('pagehide',()=>{if(saveDirty){const state=$('#careerSaveState');if(state){state.textContent='UNSAVED · REOPEN AND EXPORT BEFORE CLOSING';state.dataset.state='error';}}});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&saveDirty)void flushPendingSave();});hydrate();activate('brief');$$('[data-career-tab]').forEach(b=>b.addEventListener('click',()=>activate(b.dataset.careerTab)));$('#careerTabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const tabs=$$('[data-career-tab]'),i=tabs.indexOf(document.activeElement);const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;e.preventDefault();activate(tabs[next].dataset.careerTab);tabs[next].focus();});$$('[data-career-section]').forEach(s=>s.addEventListener('input',e=>{if(e.target.matches('[data-field]'))collect(s.dataset.careerSection);}));$('#quoteReset').addEventListener('click',()=>{data.quote=clone(defaults.quote);hydrate();scheduleSave();});$('#matrixTable').addEventListener('change',e=>{const score=e.target.closest('[data-score]'),weight=e.target.closest('[data-weight]'),name=e.target.closest('[data-option-name]');if(score){const [oi,ci]=score.dataset.score.split(':').map(Number);data.matrix.options[oi].scores[ci]=Math.max(0,Math.min(5,Number(score.value)||0));}else if(weight){data.matrix.criteria[Number(weight.dataset.weight)].weight=Math.max(1,Math.min(5,Number(weight.value)||1));}else if(name){data.matrix.options[Number(name.dataset.optionName)].name=name.value.trim().slice(0,60)||`Option ${Number(name.dataset.optionName)+1}`;}else return;scheduleSave();renderMatrix();});$('#exportCareerDossier').addEventListener('click',download);$('#copyCareerDossier').addEventListener('click',copy);$('#resetCareerSuite').addEventListener('click',()=>{if(!confirm('Reset the Career Suite drafts for this project? Other projects will remain unchanged. This cannot be undone.'))return;data=clone(defaults);hydrate();scheduleSave();toast('This project’s Career Suite drafts are being reset.');});showCareerRecovery();if(data._recovery){$('#careerSaveState').textContent='RECOVERY REQUIRED · ORIGINAL PRESERVED';$('#careerSaveState').dataset.state='error';}else void save();}
init();
