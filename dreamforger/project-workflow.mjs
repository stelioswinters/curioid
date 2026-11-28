const text=(v,f='',n=240)=>String(v??f).slice(0,n);
const id=(v,f)=>text(v,f,80).replace(/[^a-zA-Z0-9_-]/g,'')||f;
const safeUrl=value=>{try{if(String(value??'').length>1000)return '';const u=new URL(String(value));return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return ''}};
export function normalizeProjectWorkflow(raw={},nodes=[],tasks=[]){
 const nodeIds=new Set(nodes.map(n=>n.id)),taskIds=new Set(tasks.map(t=>t.id));
 const usedGroups=new Set();const groups=(Array.isArray(raw.groups)?raw.groups:[]).slice(0,12).map((g,i)=>{let gid=id(g?.id,`group-${i}`);while(usedGroups.has(gid))gid=`${gid}-${i}`;usedGroups.add(gid);return {id:gid,name:text(g?.name,`Group ${i+1}`,48),tone:['violet','blue','green','amber','rose','slate'].includes(g?.tone)?g.tone:'slate'};});
 const groupIds=new Set(groups.map(g=>g.id));
 const usedAssets=new Set();const assets=(Array.isArray(raw.assets)?raw.assets:[]).slice(0,60).map((a,i)=>{let aid=id(a?.id,`asset-${i}`);while(usedAssets.has(aid))aid=`${aid}-${i}`;usedAssets.add(aid);return {id:aid,title:text(a?.title,'Untitled asset',80),kind:['image','audio','video','document','link','reference','evidence','deliverable','other'].includes(a?.kind)?a.kind:'reference',url:safeUrl(a?.url),description:text(a?.description,'',320),source:text(a?.source,'',300),method:['direct-observation','interview','survey','experiment','desk-research','analytics','prototype-test','other'].includes(a?.method)?a.method:'other',capturedAt:Number.isFinite(Date.parse(a?.capturedAt))?new Date(a.capturedAt).toISOString():'',consent:['unknown','granted','not-required','restricted'].includes(a?.consent)?a.consent:'unknown',confidence:['unassessed','low','medium','high'].includes(a?.confidence)?a.confidence:'unassessed',nodeId:nodeIds.has(a?.nodeId)?a.nodeId:'',createdAt:Number.isFinite(Date.parse(a?.createdAt))?new Date(a.createdAt).toISOString():new Date().toISOString()};});
 const mapView={zoom:Math.max(.2,Math.min(1.5,Number.isFinite(Number(raw.mapView?.zoom))?Number(raw.mapView.zoom):1)),left:Math.max(0,Math.min(20000,Number(raw.mapView?.left)||0)),top:Math.max(0,Math.min(20000,Number(raw.mapView?.top)||0))};
 return {groups,assets,mapView};
}
export function normalizeMapNodeWorkflow(node,groups=[],tasks=[],assets=[]){
 const groupIds=new Set(groups.map(g=>g.id)),taskIds=new Set(tasks.map(t=>t.id)),assetIds=new Set(assets.map(a=>a.id));
 return {...node,groupId:groupIds.has(node?.groupId)?node.groupId:'',taskIds:[...new Set((Array.isArray(node?.taskIds)?node.taskIds:[]).filter(x=>taskIds.has(x)))].slice(0,8),assetIds:[...new Set((Array.isArray(node?.assetIds)?node.assetIds:[]).filter(x=>assetIds.has(x)))].slice(0,12)};
}
export function compareProjectSnapshots(a,b){
 const left=a?.data||{},right=b?.data||{};const changes=[];
 const scalar=['title','tagline','audience','goal','firstStep','success','notes'];
 for(const key of scalar)if((left[key]??'')!==(right[key]??''))changes.push({field:key,before:text(left[key],'',120),after:text(right[key],'',120)});
 const stable=value=>JSON.stringify(value??null);
 const compareRows=(key,label,fields)=>{
  const l=Array.isArray(left[key])?left[key]:[],r=Array.isArray(right[key])?right[key]:[];
  const lm=new Map(l.map((v,i)=>[v?.id||String(i),v])),rm=new Map(r.map((v,i)=>[v?.id||String(i),v]));
  for(const id of new Set([...lm.keys(),...rm.keys()])){
   const x=lm.get(id),y=rm.get(id);
   if(!x||!y){changes.push({field:`${label} ${x?'removed':'added'}`,before:x?text(x.title||x.name||id,'',90):'—',after:y?text(y.title||y.name||id,'',90):'—'});continue;}
   const diff=fields.filter(k=>stable(x[k])!==stable(y[k]));
   if(diff.length)changes.push({field:`${label}: ${text(x.title||x.name||id,'',60)}`,before:diff.map(k=>`${k}=${text(Array.isArray(x[k])?x[k].map(v=>typeof v==='object'?`${v.target||v.id||''}:${v.type||''}`:v).join(','):x[k],'',65)}`).join('; '),after:diff.map(k=>`${k}=${text(Array.isArray(y[k])?y[k].map(v=>typeof v==='object'?`${v.target||v.id||''}:${v.type||''}`:v).join(','):y[k],'',65)}`).join('; ')});
  }
 };
 compareRows('tasks','Task',['title','status']);
 compareRows('groups','Group',['name','tone']);
 compareRows('canvasNodes','Map element',['title','body','status','groupId','x','y','connections','taskIds','assetIds']);
 compareRows('assets','Asset',['title','kind','url','description','source','method','capturedAt','consent','confidence','nodeId']);
 const lv=left.mapView||{},rv=right.mapView||{};
 for(const key of ['zoom','left','top'])if((lv[key]??(key==='zoom'?1:0))!==(rv[key]??(key==='zoom'?1:0)))changes.push({field:`Map view: ${key}`,before:String(lv[key]??(key==='zoom'?1:0)),after:String(rv[key]??(key==='zoom'?1:0))});
 return {changes:changes.slice(0,30),total:changes.length,identical:changes.length===0};
}
export function makeProjectAsset(input={},index=0){return {id:id(input.id,`asset-${Date.now()}-${index}`),title:text(input.title,'Untitled asset',80),kind:['image','audio','video','document','link','reference','evidence','deliverable','other'].includes(input.kind)?input.kind:'reference',url:safeUrl(input.url),description:text(input.description,'',320),source:text(input.source,'',300),method:['direct-observation','interview','survey','experiment','desk-research','analytics','prototype-test','other'].includes(input.method)?input.method:'other',capturedAt:Number.isFinite(Date.parse(input.capturedAt))?new Date(input.capturedAt).toISOString():'',consent:['unknown','granted','not-required','restricted'].includes(input.consent)?input.consent:'unknown',confidence:['unassessed','low','medium','high'].includes(input.confidence)?input.confidence:'unassessed',nodeId:text(input.nodeId,'',80),createdAt:new Date().toISOString()};}
export function hasProjectWorkflowNormalizationLoss(raw={},nodes=[],tasks=[]){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return true;
 if(raw.groups!=null&&!Array.isArray(raw.groups)||raw.assets!=null&&!Array.isArray(raw.assets))return true;
 if((raw.groups?.length||0)>12||(raw.assets?.length||0)>60)return true;
 const wf=normalizeProjectWorkflow(raw,nodes,tasks);
 if(raw.groups!=null){if(raw.groups.length!==wf.groups.length)return true;for(let i=0;i<raw.groups.length;i++){const a=raw.groups[i],b=wf.groups[i];if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!['id','name','tone'].includes(k))||a.id!==b.id||a.name!==b.name||a.tone!==b.tone)return true;}}
 if(raw.assets!=null){if(raw.assets.length!==wf.assets.length)return true;for(let i=0;i<raw.assets.length;i++){const a=raw.assets[i],b=wf.assets[i];if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!['id','title','kind','url','description','source','method','capturedAt','consent','confidence','nodeId','createdAt'].includes(k))||a.id!==b.id||a.title!==b.title||a.kind!==b.kind||a.url!==b.url||a.description!==b.description||(a.source!=null&&a.source!==b.source)||(a.method!=null&&a.method!==b.method)||(a.capturedAt!=null&&a.capturedAt!==b.capturedAt)||(a.consent!=null&&a.consent!==b.consent)||(a.confidence!=null&&a.confidence!==b.confidence)||a.nodeId!==b.nodeId||!Number.isFinite(Date.parse(a.createdAt)))return true;}}
 if(raw.mapView!=null){const v=raw.mapView;if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['zoom','left','top'].includes(k))||!Number.isFinite(Number(v.zoom))||Number(v.zoom)<.2||Number(v.zoom)>1.5||!Number.isFinite(Number(v.left))||Number(v.left)<0||Number(v.left)>20000||!Number.isFinite(Number(v.top))||Number(v.top)<0||Number(v.top)>20000)return true;}
 const groupIds=new Set(wf.groups.map(g=>g.id)),taskIds=new Set(tasks.map(t=>t.id)),assetIds=new Set(wf.assets.map(a=>a.id));
 const nodeRows=Array.isArray(raw.canvasNodes)?raw.canvasNodes:nodes;for(const n of nodeRows){if(n?.groupId&&!groupIds.has(n.groupId))return true;if((n?.taskIds||[]).some(x=>!taskIds.has(x))||(n?.assetIds||[]).some(x=>!assetIds.has(x)))return true;}
 return false;
}

/** Find exact duplicate references by canonical URL or same kind + normalized title. */
export function findDuplicateProjectAsset(assets=[],candidate={},excludeId=''){
 const title=String(candidate.title??'').trim().toLocaleLowerCase();const url=safeUrl(candidate.url);
 return (Array.isArray(assets)?assets:[]).find(asset=>asset&&asset.id!==excludeId&&((url&&safeUrl(asset.url)===url)||(title&&asset.kind===candidate.kind&&String(asset.title??'').trim().toLocaleLowerCase()===title)))||null;
}
