/**
 * DREAMFORGER native CURIOID adapter.
 * Uses the host's Kernel, Connect, App SDK, Exchange and Local Services.
 * No duplicate store, message bus, permission registry or launch catalogue is created.
 */
export const DREAMFORGER_EXPERIENCE_ID = 'dreamforger';
export const DREAMFORGER_ARTIFACT_TYPE = 'dreamforger/project';
export const CURIOID_EXCHANGE_CAPABILITY = 'exchange.receive-artifact';
export const CURIOID_EXCHANGE_OWNER = 'curioid-exchange';
export const CURIOID_HOST_URL = 'https://stelioswinters.com/curioid/';
export const CURIOID_MIN_KERNEL_VERSION = '1.13.0';
export const CURIOID_CONNECT_VERSION = '1.0.0';
export const CURIOID_EXCHANGE_VERSION = '2.0.0';
export const CURIOID_APP_SDK_VERSION = '1.0.0';
export const DREAMFORGER_ADAPTER_VERSION = '0.19.0';
export const MAX_PROJECT_HANDOFF_BYTES = 2 * 1024 * 1024;
export const MAX_CROSS_OS_REFERENCES = 120;
export const CURIOID_ASSET_LIBRARY_SERVICE = 'asset-library';

// Native outputs are domain-specific. DREAMFORGER stores references to them,
// not copies of their binary or project data.
export const CURIOID_NATIVE_SOURCE_TYPES = Object.freeze({
  'dead-interface': Object.freeze(['doors98/keys']),
  'food-alchemy': Object.freeze(['nourish/collection']),
  'echonoise-os': Object.freeze(['echonoise/session','echonoise/songbook','echonoise/lyric-study','echonoise/sound-palette']),
  'umbra-os': Object.freeze(['umbra/project','umbra/palette']),
  'aether-os': Object.freeze(['aether/knowledge-collection']),
  'aura-synthesis': Object.freeze(['aura/creative-output','aura/release-dossier'])
});
export const DREAMFORGER_ACCEPTED_ARTIFACT_TYPES = Object.freeze([
  DREAMFORGER_ARTIFACT_TYPE,
  ...Object.values(CURIOID_NATIVE_SOURCE_TYPES).flat()
]);

// Exact v1.393 catalogue IDs and roles. Sandbox is a Doors98-hosted
// environment, not an independent OS. Kineta remains a Web Experiments item.
export const OS_REGISTRY = Object.freeze([
  { id:'dead-interface', name:'Doors98', kind:'os', role:'Nostalgic explorer', domain:'Retro exploration and discovery' },
  { id:'food-alchemy', name:'NOURISH OS', kind:'os', role:'Caring nurturer', domain:'Food, nourishment and everyday care' },
  { id:'echonoise-os', name:'Echonoise OS', kind:'os', role:'Sonic experimenter', domain:'Sound, voice and audio experimentation' },
  { id:'umbra-os', name:'UMBRA Studio', kind:'os', role:'Visual alchemist', domain:'Visual creation and image manipulation' },
  { id:'aether-os', name:'Aether.OS', kind:'os', role:'Knowledge explorer', domain:'Cognition, evidence and semantic connections' },
  { id:'aura-synthesis', name:'AURA//SYNTHESIS', kind:'os', role:'Creative administrator', domain:'Production records, routines and creative operations' },
  { id:DREAMFORGER_EXPERIENCE_ID, name:'DREAMFORGER', kind:'os', role:'Creative integrator', domain:'Research, design, prototyping and production', local:true },
  { id:'sandbox-os', name:'Sandbox OS', kind:'environment', hostId:'dead-interface', role:'Playful architect', domain:'A configurable Doors98-hosted environment for custom desktop building' },
  { id:'kineta-hyperion', name:'KINETA // HYPERION', kind:'experience', role:'Energetic mover', domain:'Movement, artificial life and kinetic interaction' }
]);

const HANDOFF_SCHEMA = Object.freeze({
  type:'object', additionalProperties:false,
  required:['format','schemaVersion','project'],
  properties:{
    format:{type:'string',enum:['dreamforge-project-handoff']},
    schemaVersion:{type:'integer',enum:[1]},
    project:{type:'object'}
  }
});
const SOURCE_ID_BY_ARTIFACT_TYPE = new Map(
  Object.entries(CURIOID_NATIVE_SOURCE_TYPES).flatMap(([source,types])=>types.map(type=>[type,source]))
);

function versionParts(value) {
  const match = String(value || '').match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}
function versionAtLeast(actual, minimum) {
  const a=versionParts(actual), b=versionParts(minimum);
  if(!a||!b)return false;
  for(let i=0;i<3;i++){if(a[i]>b[i])return true;if(a[i]<b[i])return false;}
  return true;
}
function listProjects(host) {
  const catalogue=host?.CurioidCatalogue?.projects || host?.CurioidUniverse?.catalogue?.projects;
  return Array.isArray(catalogue) ? catalogue : [];
}
function boundedText(value,max,fallback='') {
  if(typeof value!=='string')return fallback;
  return value.trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,max);
}
function safeRecordId(sourceExperienceId,artifactId) {
  const source=String(sourceExperienceId||'').replace(/[^a-z0-9._:-]/gi,'-').slice(0,20);
  const artifact=String(artifactId||'').replace(/[^a-z0-9._:-]/gi,'-').slice(0,68);
  return `ref-${source}-${artifact}`.slice(0,96);
}
function validateReferenceMetadata(meta) {
  if(!meta||typeof meta!=='object'||Array.isArray(meta))throw new TypeError('The incoming artifact metadata is malformed.');
  let serialized;
  try{serialized=JSON.stringify(meta);}catch{throw new Error('The incoming artifact metadata cannot be serialized safely.');}
  if(typeof serialized!=='string'||new TextEncoder().encode(serialized).byteLength>8192)throw new Error('The incoming artifact metadata exceeds the 8 KiB safe limit.');
  if(typeof meta.sourceExperienceId!=='string'||typeof meta.type!=='string'||typeof meta.id!=='string'||typeof meta.title!=='string')throw new Error('The incoming artifact metadata has missing or incorrectly typed fields.');
  const source=meta.sourceExperienceId;
  const type=meta.type;
  const expected=SOURCE_ID_BY_ARTIFACT_TYPE.get(type);
  if(!expected||expected!==source)throw new Error('This artifact type is not declared as an export from its claimed source operating system.');
  const id=meta.id;
  if(!/^[a-z0-9][a-z0-9._:-]{0,95}$/i.test(id))throw new Error('The source artifact identifier is invalid.');
  if(meta.title.length>160)throw new Error('The source artifact title exceeds the 160 character safe limit.');
  const title=boundedText(meta.title,160);
  if(!title)throw new Error('The source artifact title is missing.');
  if(meta.createdAt!=null&&typeof meta.createdAt!=='string')throw new Error('The source artifact timestamp is invalid.');
  const createdAt=meta.createdAt??'';
  if(createdAt&&(createdAt.length>64||!Number.isFinite(Date.parse(createdAt))))throw new Error('The source artifact timestamp is invalid.');
  return Object.freeze({sourceExperienceId:source,artifactType:type,artifactId:id,title,sourceCreatedAt:createdAt||null});
}

/** Save only source metadata in CURIOID's existing Asset Library Local Service. */
export async function storeCurioidArtifactReference(localServices,meta,lockManager) {
  if(!localServices||localServices.ownerExperienceId!==DREAMFORGER_EXPERIENCE_ID||typeof localServices.get!=='function'||typeof localServices.put!=='function'||typeof localServices.list!=='function') {
    throw new Error('CURIOID Asset Library Local Service is unavailable. The reference was not copied or stored.');
  }
  if(!lockManager||typeof lockManager.request!=='function')throw new Error('The browser Web Locks API is unavailable. Reference import was stopped to prevent duplicate concurrent writes.');
  const reference=validateReferenceMetadata(meta);
  return lockManager.request('curioid:dreamforger:asset-reference-import:v1',{mode:'exclusive'},async()=>{
    const id=safeRecordId(reference.sourceExperienceId,reference.artifactId);
    const existing=await localServices.get(CURIOID_ASSET_LIBRARY_SERVICE,id);
    if(existing) {
      const prior=existing.data||{};
      if(existing.kind==='curioid-cross-os-reference'&&prior.sourceExperienceId===reference.sourceExperienceId&&prior.artifactId===reference.artifactId&&prior.artifactType===reference.artifactType) {
        return Object.freeze({imported:true,alreadyReferenced:true,referenceId:id,sourceExperienceId:reference.sourceExperienceId});
      }
      throw new Error('A different Asset Library record already uses this local identifier. No existing record was changed.');
    }
    const records=await localServices.list(CURIOID_ASSET_LIBRARY_SERVICE,{limit:500});
    if(!Array.isArray(records))throw new Error('CURIOID Asset Library returned an invalid reference list.');
    if(records.length>=500)throw new Error('The Asset Library listing reached its 500-record safety ceiling. Reference capacity cannot be verified, so no new reference was stored.');
    const existingCount=records.filter(item=>item?.kind==='curioid-cross-os-reference'&&item?.data?.schemaVersion===1&&item?.data?.contentStored===false).length;
    if(existingCount>=MAX_CROSS_OS_REFERENCES)throw new Error(`The Asset Library reference limit is ${MAX_CROSS_OS_REFERENCES}. Remove an old reference before adding another.`);
    if(typeof localServices.remove!=='function')throw new Error('The Asset Library service cannot perform compensating deletes. Reference import was stopped before writing.');
    let writeAttempted=false;
    try {
      writeAttempted=true;
      await localServices.put(CURIOID_ASSET_LIBRARY_SERVICE,{
        id,kind:'curioid-cross-os-reference',title:reference.title,
        data:{schemaVersion:1,...reference,contentStored:false},
        tags:['dreamforger','cross-os',reference.sourceExperienceId,reference.artifactType]
      });
      const verified=await localServices.get(CURIOID_ASSET_LIBRARY_SERVICE,id);
      const saved=verified?.data;
      if(!verified||verified.kind!=='curioid-cross-os-reference'||saved?.sourceExperienceId!==reference.sourceExperienceId||saved?.artifactId!==reference.artifactId||saved?.artifactType!==reference.artifactType||saved?.contentStored!==false) {
        throw new Error('The Asset Library reference failed read-back verification.');
      }
      return Object.freeze({imported:true,alreadyReferenced:false,referenceId:id,sourceExperienceId:reference.sourceExperienceId});
    } catch(error) {
      if(writeAttempted) {
        let rolledBack=false;
        try {
          const current=await localServices.get(CURIOID_ASSET_LIBRARY_SERVICE,id);
          if(!current)rolledBack=true;
          else {
            const currentData=current.data||{};
            const isOurWrite=current.kind==='curioid-cross-os-reference'&&currentData.schemaVersion===1&&currentData.sourceExperienceId===reference.sourceExperienceId&&currentData.artifactId===reference.artifactId&&currentData.artifactType===reference.artifactType&&currentData.contentStored===false;
            if(isOurWrite) {
              await localServices.remove(CURIOID_ASSET_LIBRARY_SERVICE,id);
              rolledBack=!(await localServices.get(CURIOID_ASSET_LIBRARY_SERVICE,id));
            }
          }
        } catch { rolledBack=false; }
        if(!rolledBack)throw new Error(`The reference write failed and compensating rollback could not be verified without risking deletion of another record. Inspect Asset Library record ${id} before retrying. Original error: ${String(error?.message||error).slice(0,160)}`);
      }
      throw new Error(`The Asset Library reference was not committed. ${String(error?.message||error).slice(0,220)}`);
    }
  });
}

export function resolveCurioidHost(view=globalThis.window) {
  const hasRuntime=candidate=>Boolean(candidate?.CurioidKernel&&candidate?.CurioidConnect&&candidate?.CurioidAppSDK);
  if(hasRuntime(view))return view;
  try {
    const parent=view?.parent;
    if(parent&&parent!==view&&view.location?.origin&&parent.location?.origin===view.location.origin&&hasRuntime(parent))return parent;
  } catch { /* Cross-origin parent access is intentionally unavailable. */ }
  return view;
}

export function inspectCurioidHost(host=globalThis.window) {
  host=resolveCurioidHost(host);
  const kernel=host?.CurioidKernel, connect=host?.CurioidConnect, sdk=host?.CurioidAppSDK;
  const navigate=host?.CurioidNavigateToProject;
  if(!kernel||!connect||!sdk) return Object.freeze({available:false,compatible:false,reason:'standalone',systems:OS_REGISTRY.map(item=>({...item,status:item.local?'local':'directory-link'})),kernelVersion:null,connectVersion:null,sdkVersion:null,canLaunch:false,canExchange:false});
  let protocol=null, connectStatus=null;
  try{protocol=connect.getProtocolSpec?.()||null;connectStatus=connect.getStatus?.()||null;}catch{}
  const kernelVersion=String(protocol?.kernelVersion||kernel.version||'');
  const connectVersion=String(protocol?.version||connect.version||'');
  const sdkVersion=String(protocol?.appSdkVersion||sdk.version||'');
  const exchangeVersion=String(host?.CurioidExchange?.version||'');
  const protocolValid=protocol?.protocol==='curioid-connect' && protocol?.transport==='internal-local-only';
  const compatible=protocolValid && versionAtLeast(kernelVersion,CURIOID_MIN_KERNEL_VERSION) && versionAtLeast(connectVersion,CURIOID_CONNECT_VERSION) && sdkVersion===CURIOID_APP_SDK_VERSION && typeof kernel.registerExperience==='function' && typeof kernel.getExperience==='function' && typeof kernel.unregisterExperience==='function' && typeof kernel.getCapability==='function' && typeof kernel.getCapabilityGrants==='function' && typeof kernel.deleteArtifact==='function' && typeof kernel.listArtifacts==='function' && typeof kernel.registerAdapter==='function' && typeof kernel.getAdapter==='function' && typeof connect.getManifest==='function' && typeof connect.registerManifest==='function' && typeof connect.getArtifactTypes==='function' && typeof sdk.forExperience==='function';
  const projects=listProjects(host), projectIds=new Set(projects.map(item=>String(item?.id||'')));
  let experiences=[];try{experiences=kernel.getExperiences?.()||[];}catch{}
  const activeIds=new Set(experiences.map(item=>String(item?.id||'')));
  const systems=OS_REGISTRY.map(item=>({...item,status:item.local?'local':activeIds.has(item.id)?'active':projectIds.has(item.id)?'catalogued':'not-found'}));
  return Object.freeze({available:true,compatible,reason:compatible?'connected':'incompatible-host',kernelVersion,connectVersion,sdkVersion,exchangeVersion,connectStatus,systems,canLaunch:typeof navigate==='function'&&projectIds.size>0,canExchange:compatible&&exchangeVersion===CURIOID_EXCHANGE_VERSION&&Boolean(kernel.getCapability?.(CURIOID_EXCHANGE_CAPABILITY)),localServicesAvailable:typeof host.CurioidLocalServices?.forExperience==='function',hostNotificationsAvailable:typeof host.CurioidNotifications?.notify==='function',catalogueCount:projects.length});
}

function manifestForDreamforger(existing) {
  const current=existing||{};
  const provides=current.provides||{}, consumes=current.consumes||{};
  const providedTypes=Array.isArray(provides.artifactTypes)?provides.artifactTypes:[];
  const capabilities=Array.isArray(consumes.capabilities)?consumes.capabilities:[];
  const artifactTypes=providedTypes.some(item=>(typeof item==='string'?item:item?.id)===DREAMFORGER_ARTIFACT_TYPE)
    ? providedTypes : [...providedTypes,{id:DREAMFORGER_ARTIFACT_TYPE,version:'1.0.0',description:'A bounded, user-approved DREAMFORGER Studio project export.'}];
  const requiredCapabilities=capabilities.some(item=>(typeof item==='string'?item:item?.id)===CURIOID_EXCHANGE_CAPABILITY)
    ? capabilities : [...capabilities,{id:CURIOID_EXCHANGE_CAPABILITY,ownerExperienceId:CURIOID_EXCHANGE_OWNER,version:'^1.0.0',description:'Send an approved project artifact to CURIOID Exchange Universal Space.'}];
  return {
    ...current,id:DREAMFORGER_EXPERIENCE_ID,kind:'os',name:'DREAMFORGER',version:DREAMFORGER_ADAPTER_VERSION,creator:'KNIGHTMARE',
    description:'A local-first creative development operating system integrated with CURIOID native artifacts and metadata-only cross-OS references.',
    requires:{kernel:`>=${CURIOID_MIN_KERNEL_VERSION}`,connect:'^1.0.0'},
    provides:{...provides,artifactTypes},
    consumes:{...consumes,capabilities:requiredCapabilities}
  };
}

const sameValue=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
function restoreDreamforgerManifestContract(connect,previous,installed) {
  if(!previous||!installed)return false;
  const current=connect.getManifest(DREAMFORGER_EXPERIENCE_ID);
  if(!current)return false;
  const next={...current};
  for(const field of ['kind','name','version','creator','description','requires']) {
    if(sameValue(current[field],installed[field])) {
      if(Object.prototype.hasOwnProperty.call(previous,field))next[field]=previous[field];
      else delete next[field];
    }
  }
  for(const [section,key,id] of [['provides','artifactTypes',DREAMFORGER_ARTIFACT_TYPE],['consumes','capabilities',CURIOID_EXCHANGE_CAPABILITY]]) {
    const currentSection=current[section]||{}, installedSection=installed[section]||{}, previousSection=previous[section]||{};
    const currentItems=Array.isArray(currentSection[key])?currentSection[key]:[];
    const installedItem=(Array.isArray(installedSection[key])?installedSection[key]:[]).find(item=>(typeof item==='string'?item:item?.id)===id);
    const currentItem=currentItems.find(item=>(typeof item==='string'?item:item?.id)===id);
    if(sameValue(currentItem,installedItem)) {
      const restored=currentItems.filter(item=>(typeof item==='string'?item:item?.id)!==id);
      const previousItem=(Array.isArray(previousSection[key])?previousSection[key]:[]).find(item=>(typeof item==='string'?item:item?.id)===id);
      if(previousItem!==undefined)restored.push(previousItem);
      next[section]={...currentSection,[key]:restored};
    }
  }
  connect.registerManifest(DREAMFORGER_EXPERIENCE_ID,next);
  return true;
}

export function connectDreamforgerToCurioid(host=globalThis.window,callbacks={}) {
  const inspection=inspectCurioidHost(host);
  if(!inspection.compatible) return Object.freeze({connected:false,inspection,reason:inspection.reason,dispose(){}});
  host=resolveCurioidHost(host);
  const kernel=host.CurioidKernel, connect=host.CurioidConnect, sdkFactory=host.CurioidAppSDK;
  // Refuse to replace an adapter owned by another mount or extension. A second
  // mount can never silently take over its callbacks or cleanup responsibility.
  try{if(kernel.getAdapter(DREAMFORGER_EXPERIENCE_ID))return Object.freeze({connected:false,inspection,reason:'adapter-already-registered',dispose(){}});}catch{return Object.freeze({connected:false,inspection,reason:'adapter-registry-unavailable',dispose(){}});}
  let createdExperience=false, session=null, localServices=null, disposed=false, previousManifest=null, installedManifest=null, existingExperience=false, manifestUpdated=false, artifactTypePreexisting=false, adapterDisposer=null;
  try {
    const existing=kernel.getExperience(DREAMFORGER_EXPERIENCE_ID);
    if(existing && !/dreamforger|knightmare/i.test(String(existing.name||'')) && existing.profile?.integrationId!=='dreamforger-curioid-connect-v1') {
      return Object.freeze({connected:false,inspection,reason:'experience-id-conflict',dispose(){}});
    }
    existingExperience=Boolean(existing);
    if(!existing){
      kernel.registerExperience({
        id:DREAMFORGER_EXPERIENCE_ID,name:'DREAMFORGER',version:DREAMFORGER_ADAPTER_VERSION,category:'Operating Systems',
        description:'Creative research, design, prototyping and production workstation.',
        profile:{integrationId:'dreamforger-curioid-connect-v1',localOnly:true,role:'independent-operating-system'},
        manifest:manifestForDreamforger(null)
      });
      createdExperience=true;
    } else {
      previousManifest=connect.getManifest(DREAMFORGER_EXPERIENCE_ID);
      if(!previousManifest)return Object.freeze({connected:false,inspection,reason:'existing-experience-manifest-unavailable',dispose(){}});
      const existingDependency=(previousManifest.consumes?.capabilities||[]).find(item=>(typeof item==='string'?item:item?.id)===CURIOID_EXCHANGE_CAPABILITY);
      if(existingDependency && (existingDependency.ownerExperienceId!==CURIOID_EXCHANGE_OWNER || (existingDependency.version&&!versionAtLeast(String(existingDependency.version).replace(/^[^0-9]*/,''),'1.0.0'))))return Object.freeze({connected:false,inspection,reason:'exchange-capability-contract-conflict',dispose(){}});
      const allArtifactTypes=connect.getArtifactTypes?.()||[];
      const existingType=allArtifactTypes.find(item=>item.id===DREAMFORGER_ARTIFACT_TYPE);
      const declaredType=(previousManifest.provides?.artifactTypes||[]).find(item=>(typeof item==='string'?item:item?.id)===DREAMFORGER_ARTIFACT_TYPE);
      if(existingType && (existingType.ownerExperienceId!==DREAMFORGER_EXPERIENCE_ID || existingType.version!=='1.0.0' || !sameValue(existingType.schema,HANDOFF_SCHEMA) || !(existingType.mediaTypes||[]).includes('application/json')))return Object.freeze({connected:false,inspection,reason:'project-artifact-type-conflict',dispose(){}});
      if(declaredType&&!existingType)return Object.freeze({connected:false,inspection,reason:'project-artifact-type-unregistered',dispose(){}});
      artifactTypePreexisting=Boolean(existingType);
      connect.registerManifest(DREAMFORGER_EXPERIENCE_ID,manifestForDreamforger(previousManifest));
      installedManifest=connect.getManifest(DREAMFORGER_EXPERIENCE_ID);
      manifestUpdated=true;
    }
    session=sdkFactory.forExperience(DREAMFORGER_EXPERIENCE_ID);
    try{localServices=host.CurioidLocalServices?.forExperience?.(DREAMFORGER_EXPERIENCE_ID)||null;}catch{localServices=null;}
    if(!artifactTypePreexisting){
      session.artifacts.registerType({
        id:DREAMFORGER_ARTIFACT_TYPE,version:'1.0.0',name:'DREAMFORGER Project',
        description:'Versioned JSON project handoff; imported as a new copy, never as an overwrite.',
        mediaTypes:['application/json'],schema:HANDOFF_SCHEMA
      });
    }
    adapterDisposer=kernel.registerAdapter({
      ownerExperienceId:DREAMFORGER_EXPERIENCE_ID,
      name:'DREAMFORGER Reference & Project Adapter',
      version:DREAMFORGER_ADAPTER_VERSION,
      artifactTypeVersion:'1.0.0',
      description:'Copies validated DREAMFORGER projects; records metadata-only references to declared native CURIOID OS artifacts.',
      artifactTypes:DREAMFORGER_ACCEPTED_ARTIFACT_TYPES,
      exportArtifactTypes:[DREAMFORGER_ARTIFACT_TYPE],
      exportData:async()=>{
        if(typeof callbacks.exportProjects!=='function')return [];
        const output=await callbacks.exportProjects();
        if(!Array.isArray(output))throw new Error('DREAMFORGER export callback returned an invalid collection.');
        return output;
      },
      setImportBusy:busy=>{try{callbacks.setImportBusy?.(Boolean(busy));}catch{}},
      importArtifact:async(payload,meta)=>{
        if(!meta||typeof meta!=='object')throw new Error('The incoming artifact metadata is missing.');
        if(meta.type===DREAMFORGER_ARTIFACT_TYPE){
          if(meta.sourceExperienceId!==DREAMFORGER_EXPERIENCE_ID)throw new Error('A DREAMFORGER project artifact has an unexpected source operating system.');
          if(typeof callbacks.importProjectCopy!=='function')throw new Error('The DREAMFORGER Studio copy importer is not ready.');
          return callbacks.importProjectCopy(payload,meta);
        }
        if(SOURCE_ID_BY_ARTIFACT_TYPE.get(String(meta.type||''))!==String(meta.sourceExperienceId||''))throw new Error('The incoming artifact does not match the declared native source and type.');
        return storeCurioidArtifactReference(localServices,meta,host?.navigator?.locks);
      }
    });
    if(existingExperience&&manifestUpdated)installedManifest=connect.getManifest(DREAMFORGER_EXPERIENCE_ID);
  } catch(error) {
    try{adapterDisposer?.();}catch{}
    try{session?.dispose?.();}catch{}
    if(createdExperience)try{kernel.unregisterExperience(DREAMFORGER_EXPERIENCE_ID);}catch{}
    else if(existingExperience&&manifestUpdated&&previousManifest)try{restoreDreamforgerManifestContract(connect,previousManifest,installedManifest||connect.getManifest(DREAMFORGER_EXPERIENCE_ID));}catch{}
    return Object.freeze({connected:false,inspection,reason:'registration-failed',error:String(error?.message||error).slice(0,240),dispose(){}});
  }
  const result={connected:true,inspection,reason:'connected',session,localServices,adapterRegistered:true,assetLibraryAvailable:Boolean(localServices?.put&&localServices?.get&&localServices?.list&&host?.navigator?.locks?.request),
    async permissionStatus(){
      const capability=kernel.getCapability(CURIOID_EXCHANGE_CAPABILITY);
      if(!capability||capability.ownerExperienceId!==CURIOID_EXCHANGE_OWNER||String(host?.CurioidExchange?.version||'')!==CURIOID_EXCHANGE_VERSION)return {available:false,granted:false};
      const grants=await kernel.getCapabilityGrants(CURIOID_EXCHANGE_CAPABILITY);
      return {available:true,granted:grants.some(item=>item.requesterExperienceId===DREAMFORGER_EXPERIENCE_ID),owner:CURIOID_EXCHANGE_OWNER};
    },
    async listReferences(){
      if(!localServices?.list)throw new Error('CURIOID Asset Library Local Service is unavailable.');
      const records=await localServices.list(CURIOID_ASSET_LIBRARY_SERVICE,{limit:500});
      if(!Array.isArray(records))throw new Error('CURIOID Asset Library returned an invalid reference collection.');
      if(records.length>=500)throw new Error('The Asset Library listing reached its 500-record safety ceiling. The reference panel cannot guarantee a complete list.');
      return records.filter(item=>item?.kind==='curioid-cross-os-reference'&&item?.data?.schemaVersion===1&&item.data.contentStored===false);
    },
    dispose(){if(disposed)return;disposed=true;try{adapterDisposer?.();}catch{}try{session?.dispose?.();}catch{}if(createdExperience)try{kernel.unregisterExperience(DREAMFORGER_EXPERIENCE_ID);}catch{}else if(existingExperience&&manifestUpdated&&previousManifest)try{restoreDreamforgerManifestContract(connect,previousManifest,installedManifest||connect.getManifest(DREAMFORGER_EXPERIENCE_ID));}catch{}}
  };
  return Object.freeze(result);
}

export function launchCurioidSystem(host,id) {
  host=resolveCurioidHost(host);
  const item=OS_REGISTRY.find(entry=>entry.id===id&&!entry.local);
  if(!item||item.kind==='experience')return {ok:false,reason:'unknown-system'};
  const projects=listProjects(host);
  const project=projects.find(candidate=>candidate?.id===id);
  if(!project)return {ok:false,reason:'not-in-catalogue'};
  if(project.category!=='operating-systems')return {ok:false,reason:'wrong-category'};
  if(item.kind==='environment'){
    if(project.profile?.systemKind!=='environment'||project.profile?.role!=='hosted-environment'||project.profile?.hostExperienceId!==item.hostId)return {ok:false,reason:'invalid-hosted-environment-profile'};
    const hostProject=projects.find(candidate=>candidate?.id===item.hostId);
    if(!hostProject||hostProject.profile?.role!=='independent-operating-system')return {ok:false,reason:'host-system-unavailable'};
  } else if(project.profile?.role!=='independent-operating-system'||project.profile?.systemKind!=='operating-system') {
    return {ok:false,reason:'invalid-operating-system-profile'};
  }
  if(typeof host?.CurioidNavigateToProject!=='function')return {ok:false,reason:'launcher-unavailable'};
  try{host.CurioidNavigateToProject(id);return {ok:true,id};}catch(error){return {ok:false,reason:'launch-failed',error:String(error?.message||error).slice(0,180)};}
}

export async function sendProjectToCurioidExchange(connection,project,host=globalThis.window,{approved=false}={}) {
  host=resolveCurioidHost(host);
  if(approved!==true)throw new Error('An explicit user approval is required before sharing a Studio project.');
  if(!connection?.connected||!connection.session)throw new Error('DREAMFORGER is not connected to the CURIOID host runtime.');
  if(!project||typeof project!=='object'||Array.isArray(project)||typeof project.id!=='string'||typeof project.title!=='string')throw new TypeError('A valid Studio project is required.');
  const payload={format:'dreamforge-project-handoff',schemaVersion:1,project};
  const serialized=JSON.stringify(payload);
  const encoded=new TextEncoder().encode(serialized);
  const byteLength=encoded.byteLength;
  if(byteLength>MAX_PROJECT_HANDOFF_BYTES)throw new Error(`This project export is ${(byteLength/1024/1024).toFixed(2)} MiB. The safe handoff limit is 2 MiB; use the normal project backup instead.`);
  const lockManager=host?.navigator?.locks;
  if(typeof lockManager?.request!=='function')throw new Error('Cross-tab safe Exchange delivery is unavailable in this browser. The handoff was stopped before creating an artifact.');
  const digestProvider=host?.crypto?.subtle||globalThis.crypto?.subtle;
  if(typeof digestProvider?.digest!=='function')throw new Error('SHA-256 support is unavailable. The handoff was stopped before creating an artifact.');
  if(typeof host?.CurioidKernel?.listArtifacts!=='function')throw new Error('The Kernel artifact index cannot verify prior handoffs. Update CURIOID before sharing.');
  const digest=await digestProvider.digest('SHA-256',encoded);
  const fingerprint=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
  return lockManager.request(`curioid:dreamforger:exchange-send:v1:${fingerprint}`,{mode:'exclusive'},async()=>{
    const permission=await connection.permissionStatus();
    if(!permission.available)throw new Error('CURIOID Exchange is not available in this host build.');
    if(!permission.granted)throw new Error('Permission not granted yet. In CURIOID Exchange, open Kernel Bridge, select DREAMFORGER and grant access.');
    // Exchange's own unique deliveryKey is based on sender + Kernel artifact ID.
    // Reusing the same artifact makes an uncertain timeout safe to retry.
    const priorArtifacts=await host.CurioidKernel.listArtifacts({sourceExperienceId:DREAMFORGER_EXPERIENCE_ID,type:DREAMFORGER_ARTIFACT_TYPE,limit:500});
    if(!Array.isArray(priorArtifacts))throw new Error('The Kernel artifact index returned an invalid result. No new artifact was created.');
    const prior=priorArtifacts.find(item=>item?.sourceExperienceId===DREAMFORGER_EXPERIENCE_ID&&item?.type===DREAMFORGER_ARTIFACT_TYPE&&item?.metadata?.handoffFingerprint===fingerprint);
    if(priorArtifacts.length>=500&&!prior)throw new Error('The DREAMFORGER artifact history reached its 500-item verification ceiling. Archive older handoffs before creating another to prevent duplicate Exchange deliveries.');
    let artifact=prior||null;
    if(!artifact) {
      artifact=await connection.session.artifacts.create({
        type:DREAMFORGER_ARTIFACT_TYPE,
        title:`DREAMFORGER · ${project.title}`.slice(0,160),
        data:payload,
        mediaType:'application/json',
        metadata:{projectId:project.id,projectVersion:project.appVersion||DREAMFORGER_ADAPTER_VERSION,handoffFormat:'dreamforge-project-handoff-v1',handoffFingerprint:fingerprint,handoffIdempotencyVersion:1}
      });
    }
    try {
      const receipt=await connection.session.capabilities.call(CURIOID_EXCHANGE_CAPABILITY,{artifactId:artifact.id,destination:'shared',title:`DREAMFORGER · ${project.title}`.slice(0,120)});
      if(!receipt?.accepted)throw new Error('CURIOID Exchange did not confirm receipt. The Kernel artifact was retained so the same handoff can be retried safely.');
      try{host?.CurioidNotifications?.notify?.(`DREAMFORGER sent ${project.title||'a project'} to CURIOID Exchange Universal Space.`,{sourceId:DREAMFORGER_EXPERIENCE_ID});}catch{}
      return Object.freeze({accepted:true,artifactId:artifact.id,itemId:receipt.itemId,folderId:receipt.folderId||'shared',bytes:byteLength,reusedArtifact:Boolean(prior)});
    } catch(error) {
      // Do not delete after capability invocation. Exchange may have committed
      // the unique delivery row before a delayed response or local read failed.
      // Retaining the source artifact preserves the delivery idempotency key.
      throw new Error(`${String(error?.message||error).slice(0,220)} The verified handoff artifact ${artifact.id} was retained for safe retry.`);
    }
  });
}
