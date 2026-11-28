/** Bounded, session-only project context and typed activity model. */
const EVENT_TYPES = new Set(['project-opened','project-created','project-branched','project-exported','task-completed','asset-linked','decision-recorded']);
const safeText = (value, limit=120) => String(value??'').replace(/[<>\u0000-\u001f]/g,' ').trim().slice(0,limit);
function normalizeState(state){
  const source=state&&typeof state==='object'?state:{};
  const revision=Number.isSafeInteger(source.revision)&&source.revision>=0?Math.min(source.revision,1_000_000_000):0;
  const recent=Array.isArray(source.recentProjectIds)?source.recentProjectIds.filter(id=>typeof id==='string'&&id.trim()&&id.length<=120).slice(0,5):[];
  const events=Array.isArray(source.events)?source.events.filter(e=>e&&typeof e==='object'&&EVENT_TYPES.has(e.type)&&typeof e.projectId==='string'&&e.projectId.length<=120).slice(0,50).map(e=>Object.freeze({id:safeText(e.id,40),type:e.type,projectId:safeText(e.projectId,120),label:safeText(e.label||e.type,120),at:safeText(e.at,40)})):[];
  const active=typeof source.activeProjectId==='string'&&source.activeProjectId.length<=120?source.activeProjectId:null;
  return {activeProjectId:active,recentProjectIds:recent,events,revision};
}
export function createProjectContextState(){return Object.freeze({activeProjectId:null,recentProjectIds:Object.freeze([]),events:Object.freeze([]),revision:0});}
export function recordProjectContextEvent(state=createProjectContextState(),input={},now=()=>new Date().toISOString()){
  if(!input||!EVENT_TYPES.has(input.type)||typeof input.projectId!=='string'||!input.projectId.trim()||input.projectId.length>120)return state;
  const base=normalizeState(state),projectId=safeText(input.projectId,120);if(!projectId)return state;
  let timestamp='';try{timestamp=safeText(now(),40);}catch{timestamp=new Date(0).toISOString();}
  const event=Object.freeze({id:`ctx-${base.revision+1}`,type:input.type,projectId,label:safeText(input.label||input.type,120),at:timestamp});
  const isContextSwitch=['project-opened','project-created','project-branched'].includes(input.type);
  const recent=isContextSwitch?[projectId,...base.recentProjectIds.filter(id=>id!==projectId)].slice(0,5):base.recentProjectIds.slice(0,5);
  return Object.freeze({activeProjectId:isContextSwitch?projectId:(base.activeProjectId||projectId),recentProjectIds:Object.freeze(recent),events:Object.freeze([event,...base.events].slice(0,50)),revision:base.revision+1});
}
export function getRecentProjectIds(state){return normalizeState(state).recentProjectIds;}
export function getProjectContextEvents(state,projectId=null){return normalizeState(state).events.filter(event=>!projectId||event.projectId===projectId).map(event=>({...event}));}
