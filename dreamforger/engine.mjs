const VERSION = '0.19.0';
export const CATEGORIES = {
  anything: {label:'Impossible', icon:'✳'}, world:{label:'World',icon:'◉'}, creature:{label:'Lifeform',icon:'♧'},
  invention:{label:'Invention',icon:'⌬'}, art:{label:'Visual oddity',icon:'✧'}, story:{label:'Story seed',icon:'¶'}, game:{label:'Game oddity',icon:'▣'}
};
const BANKS = {
  world:{nouns:['The Glass Tundra','Morrow-9','The Orchard of Echoes','Velvet Reach','The Sleeping Meridian','Aster Vale','The Hollow Sun','The Salt Cathedral'],forms:['a planet where oceans float above the clouds','a moon-sized garden orbiting a dead star','an archipelago suspended inside a permanent thunderstorm','a desert that rearranges itself every midnight','a city built on the back of a migratory mountain'],rules:['shadows remember every person who has crossed them','rain falls upward once every seven days','the horizon moves closer when someone tells the truth','night lasts exactly as long as a forgotten song','every river flows toward the oldest living thing'],inhabitants:['clockwork gardeners','tiny luminous whales','nomadic glasswrights','moss-covered astronomers','the descendants of abandoned robots'],features:['three pale moons','forests of translucent reeds','a magnetic inland sea','singing mineral cliffs','a second sunrise beneath the ground']},
  creature:{nouns:['The Gloamhopper','Mossback No. 8','The Velvet Mite','A Lantern Grazer','The Borrowed Beast','The Hushling','The Clockwork Plover','The Cloud Eater'],forms:['a small creature that collects lost directions','a gentle predator that hunts reflections','a burrowing animal with a portable weather system','a nocturnal pollinator made of soft mineral dust','a migratory creature that carries tiny ecosystems'],rules:['it communicates by rearranging nearby objects','it grows a new limb whenever it learns a new sound','it sleeps inside the shadows of moving things','it changes colour to match forgotten memories','it leaves behind seeds that grow into miniature doorways'],inhabitants:['lichen','tiny glass beetles','glowing spores','paper-thin moths','symbiotic clock flowers'],features:['a transparent crown','six soft antennae','a pocket of warm fog','a shell like folded origami','two mismatched eyes']},
  invention:{nouns:['The Apology Engine','Pocket Thunder','The Memory Kettle','The Unfinished Compass','The Moonlight Stapler','The Portable Eclipse','The Quiet Machine','The Borrowed Hour'],forms:['a machine that turns awkward silences into electricity','a pocket-sized device for bottling the smell of places','a compass that points toward the most interesting mistake','a tiny engine powered by unfinished thoughts','a domestic appliance that repairs forgotten objects'],rules:['it only works when nobody is watching','every use creates a harmless side effect','it runs on a material that has not been invented','it becomes more efficient when shared','it refuses to repeat the same result twice'],inhabitants:['a tiny brass moth','a patient magnetic spirit','a miniature librarian','a choir of ceramic buttons','a sleepy mechanical eye'],features:['a hand-cranked probability dial','a glass chamber full of blue sparks','a fold-out map of impossible routes','a dial marked MAYBE','a warm ceramic core']},
  art:{nouns:['A Map of Almost','Soft Geometry','The Colour of Static','A Window for Comets','The Unstable Bouquet','Afterimage No. 3','The Shape of Humming','Velvet Mathematics'],forms:['a living collage of impossible architecture','a geometric garden that rearranges when observed','a portrait made from weather patterns','a sculpture that looks different from every angle','a landscape assembled from forgotten colours'],rules:['its shapes drift toward the nearest sound','the brightest colour is always hiding','every line ends somewhere unexpected','it changes slowly with the local time','its symmetry is deliberately imperfect'],inhabitants:['floating tessellations','tiny paper suns','liquid polygons','slow-moving colour fields','translucent geometric birds'],features:['acid-lime highlights','violet shadows','soft chrome surfaces','impossible perspective','a hidden spiral']},
  story:{nouns:['The Last Postcard','A Door Left Open','The Museum of Tomorrow','Seven Minutes of Winter','The Cartographer of Sleep','A Small, Unreasonable Moon','The Quietest Revolution','The City That Forgot'],forms:['a courier delivers letters to places that have not been built yet','a retired monster opens a repair shop for broken promises','a town wakes up with one extra street every morning','an astronaut discovers a garden growing inside a radio','a library lends out memories instead of books'],rules:['the narrator is unreliable but kind','the smallest character knows the ending','every chapter begins with a sound','the central mystery has an ordinary explanation','the world changes whenever someone tells a story'],inhabitants:['a stubborn mapmaker','a retired storm','a child who collects keys','an extremely polite ghost','a botanist with no sense of direction'],features:['a brass ticket','a blue envelope','a lighthouse with no sea','a staircase that ends in a field','a train that only stops for questions']},
  game:{nouns:['Bureau of Lost Tuesdays','Pocket Volcano League','The Last Elevator','Mushroom Courier','Tiny Planet Problems','Museum After Dark','The Unreliable Dungeon','Cloud Shepherd'],forms:['a puzzle game where gravity changes with the music','a tiny strategy game about keeping a moon garden alive','a cooperative game played by passing one unusual object','a platformer where the level rearranges after every jump','a management game about a hotel for imaginary creatures'],rules:['every win introduces a stranger rule','players can trade one mistake for a clue','the world remembers the last three moves','the score is measured in curious discoveries','there is no game over, only a new problem'],inhabitants:['mischievous librarians','sleepy dragons','tiny delivery robots','sentient houseplants','retired space pirates'],features:['a rotating map','a pocket-sized weather forecast','a suspiciously friendly shopkeeper','a one-use rewind button','a collection of impossible keys']}
};
const CHAOS = ['slightly inconvenient','beautifully unstable','almost certainly illegal in three imaginary countries','surprisingly wholesome','powered by a very small mystery','not approved by the laws of physics','deeply suspicious','strangely elegant','held together by optimism','more complicated than it looks'];
const TRAITS = ['curious','softly radioactive','unreasonably polite','magnetically confused','time-adjacent','weather-sensitive','memory-rich','mildly sentient','gravity-optional','dimensionally shy','glow-capable','unreasonably durable'];
const PALETTES = [['#c6f36b','#a78bfa','#17233b'],['#ff79b0','#8ce7db','#25203e'],['#f5b85b','#83a9ff','#202c3c'],['#b9a2ff','#f2e7b4','#253b42'],['#78e0c3','#f08a72','#22243e'],['#d5ee74','#ed8cc1','#28334b']];
const pick = (arr, rng) => arr[Math.floor(rng()*arr.length)];
function hashSeed(value){let h=2166136261;for(const c of String(value)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
export function seededRandom(seed){let a=(Number(seed)>>>0)||1;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
export function randomSeed(){if(globalThis.crypto?.getRandomValues){const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0];}return Math.floor(Math.random()*4294967295);}
function titleCase(s){return s.replace(/\b\w/g,c=>c.toUpperCase());}
const BLUEPRINTS = {
  world:{purpose:['A refuge for things that have nowhere else to exist','A living map that changes with its visitors','A place where a forgotten natural law still works'],test:['Leave one object at the edge of the map and return after one full cycle','Follow a local inhabitant without interrupting its routine','Measure the distance between two landmarks twice, at different moods'],cost:['Every shortcut changes something elsewhere','Visitors slowly inherit the place’s oldest memory','The safest route is never the shortest'],signal:['The sky develops a second horizon','Local wildlife begins arranging stones into diagrams','A familiar landmark appears in a different season']},
  creature:{purpose:['It maintains a tiny ecological balance nobody notices','It finds and returns things that have been misplaced','It acts as a living warning system for its habitat'],test:['Offer it two unfamiliar sounds and observe which one it keeps','Track its route for one night without disturbing it','Place a harmless object nearby and record how it responds'],cost:['Its most useful ability also attracts a natural rival','It needs a resource that is difficult to find','It becomes less predictable when observed'],signal:['Nearby plants subtly change their growth pattern','It leaves a trail of unusually precise little marks','Other species begin copying one of its habits']},
  invention:{purpose:['It turns an overlooked nuisance into a useful resource','It gives physical form to a problem that is hard to explain','It makes one impossible task briefly achievable'],test:['Run it once with the simplest possible input','Ask two people to use it without explaining the controls','Repeat the same operation under deliberately different conditions'],cost:['It solves the stated problem but creates a stranger one','It requires a material that is only available at the wrong moment','It works best when used for a purpose it was not designed for'],signal:['A small indicator predicts the next failure','It produces a harmless side effect that becomes useful','It refuses to repeat an identical result']},
  art:{purpose:['It makes an invisible relationship visible','It changes meaning depending on where the viewer stands','It records a feeling without depicting a person'],test:['View it from three distances and note what changes','Remove its brightest element and see what the composition loses','Let it sit beside an unrelated object for a day'],cost:['Its strongest detail is almost impossible to reproduce','It becomes less legible when fully explained','The composition changes faster than it can be documented'],signal:['A hidden pattern appears only in peripheral vision','Its negative space becomes the main subject','The colour balance seems to lean toward nearby light']},
  story:{purpose:['It gives an ordinary decision consequences across an entire world','It follows the person who was supposed to be a background character','It turns a tiny mystery into a question about belonging'],test:['Write the scene from the least important character’s point of view','Reveal one consequence before explaining its cause','Remove the central mystery and see what remains worth caring about'],cost:['The truth solves one mystery and opens a more personal one','The person with the answer has the least reason to speak','Every useful clue changes the reader’s sympathy'],signal:['A repeated object quietly changes meaning','The ending is foreshadowed by an unimportant detail','The apparent antagonist is protecting something fragile']},
  game:{purpose:['It rewards curiosity rather than perfect execution','It makes cooperation more interesting than competition','It turns a tiny rule change into a new strategy'],test:['Play three rounds while changing only one rule','Give the same starting state to two very different play styles','Remove the score and see whether the loop remains fun'],cost:['A powerful strategy creates an interesting weakness','The easiest route is not the most satisfying','Players can exploit the rules, but the world remembers'],signal:['A losing move unlocks a new possibility','The environment becomes a quiet second player','A tiny optional action changes the next round']}
};
function makeBlueprint(category,seed,prompt,chaos,coherent,bank,rng,brief={}){
  const set=BLUEPRINTS[category]||BLUEPRINTS.invention;
  const choose=(items)=>pick(items,rng);
  const anchor=String(prompt||choose(bank.nouns)).trim().slice(0,100);
  const intensity=chaos>78?'high-voltage':chaos>48?'volatile':chaos>20?'experimental':'measured';
  const mechanism=choose(bank.rules);
  const detail=choose(bank.features);
  const cast=choose(bank.inhabitants);
  const audience=String(brief.audience||'curious people').slice(0,100);
  const outcome=String(brief.outcome||'create something memorable').slice(0,120);
  const hardConstraint=String(brief.constraint||'Keep the first experiment small, reversible and inexpensive.').slice(0,180);
  const approach=String(brief.approach||'Balanced exploration');
  return {
    premise:`${anchor} — ${choose(bank.forms)}.`,
    purpose:choose(set.purpose),
    mechanism:`${mechanism.charAt(0).toUpperCase()+mechanism.slice(1)}.`,
    signature:`${detail.charAt(0).toUpperCase()+detail.slice(1)}, involving ${cast}.`,
    constraint:choose(set.cost),
    firstTest:choose(set.test),
    ripple:choose(set.signal),
    operatingMode:intensity,
    designNote:coherent?'Keep the internal rule consistent; let the consequences become surprising.':'Do not repair contradictions. Treat each contradiction as a new feature.',
    audience,
    problem:`A useful opportunity for ${audience}: ${outcome}.`,
    value:`The concept should make ${outcome} feel distinct through ${detail}.`,
    experience:`A person encounters ${anchor.toLowerCase()}, discovers its main rule, then tries one low-risk interaction.`,
    requirements:`Start with one clear core interaction; explain the rule in under a minute; make the result observable.`,
    risk:`The central mechanic may be charming but unclear. Test whether a first-time user understands what to do without coaching.`,
    successMetric:`At least 4 of 5 test users can explain the core idea and complete the first interaction without help.`,
    prototype:`Build a paper or clickable rough prototype of the single most important interaction. Test it with 3–5 people before adding features.`,
    nextStep:`Write a one-sentence promise, sketch the first interaction, and test the smallest believable version.`,
    hardConstraint,
    approach
  };
}


export function evaluateConcept({chaos=50,coherent=true,prompt='',audience='',outcome='',constraint='',seed=1}={}){
  const rng=seededRandom((Number(seed)>>>0)^0x4b4e4f54);
  const clarity=Math.max(35,Math.min(96,Math.round(58+(String(prompt).trim().length>=12?13:0)+(String(audience).trim()?8:0)+(String(outcome).trim()?9:0)+(coherent?6:0)+(rng()*8-4))));
  const originality=Math.max(35,Math.min(98,Math.round(48+Number(chaos)*.43+rng()*12)));
  const feasibility=Math.max(28,Math.min(96,Math.round(78-Number(chaos)*.34+(coherent?12:-7)+(String(constraint).trim()?5:0)+rng()*8-4)));
  const usefulness=Math.max(30,Math.min(96,Math.round(52+(String(outcome).trim()?17:0)+(String(audience).trim()?10:0)+(coherent?5:0)+rng()*10-5)));
  const overall=Math.round(clarity*.25+originality*.2+feasibility*.3+usefulness*.25);
  const strongest=Object.entries({clarity,originality,feasibility,usefulness}).sort((a,b)=>b[1]-a[1])[0][0];
  const weakest=Object.entries({clarity,originality,feasibility,usefulness}).sort((a,b)=>a[1]-b[1])[0][0];
  return {clarity,originality,feasibility,usefulness,overall,strongest,weakest,method:'Local heuristic review · not user research or technical validation'};
}

export function createCreation({category='anything',seed=randomSeed(),chaos=77,prompt='',coherent=true,audience='',outcome='',constraint='',approach='Balanced exploration'}={}){
  const numericSeed=Number.isFinite(Number(seed))?(Number(seed)>>>0):1;
  const requestedCategory=Object.hasOwn(CATEGORIES,category)?category:'anything';
  const actualCategory=requestedCategory==='anything'?['world','creature','invention','art','story','game'][seededRandom(numericSeed)()*6|0]:requestedCategory;
  const bank=BANKS[actualCategory];const rng=seededRandom(numericSeed);const level=Math.max(0,Math.min(100,Number(chaos)||0));
  const userPrompt=String(prompt||'').trim().slice(0,100);const noun=pick(bank.nouns,rng);const form=pick(bank.forms,rng);const rule=pick(bank.rules,rng);const inhabitant=pick(bank.inhabitants,rng);const feature=pick(bank.features,rng);const chaosTag=pick(CHAOS,rng);const traitA=pick(TRAITS,rng);let traitB=pick(TRAITS,rng);if(traitB===traitA)traitB=pick(TRAITS.filter(x=>x!==traitA),rng);
  const palette=PALETTES[Math.floor(rng()*PALETTES.length)];
  const promptLine=userPrompt?`Starting from “${userPrompt}”, `:'';
  const twist=level>65?` The catch: ${chaosTag}.`:level>30?` An unusual detail: ${chaosTag}.`:'';
  const description=`${promptLine}${form}. It is known for ${feature}, and its world is shaped by one peculiar rule: ${rule}.${twist}${coherent?' Everything follows a consistent internal logic, even when that logic is delightfully strange.':' Logic has been politely asked to wait outside.'}`;
  const traits=[titleCase(traitA),titleCase(traitB),titleCase(feature),`${level}% chaos`];
  return {id:`df-${numericSeed.toString(36)}-${Date.now().toString(36)}`,version:VERSION,seed:numericSeed,category:actualCategory,label:'',title:noun,description,traits,palette,chaos:level,prompt:userPrompt,coherent:Boolean(coherent),brief:{audience:String(audience||'curious people').slice(0,100),outcome:String(outcome||'create something memorable').slice(0,120),constraint:String(constraint||'').slice(0,180)},approach:String(approach||'Balanced exploration').slice(0,80),blueprint:makeBlueprint(actualCategory,numericSeed,userPrompt,level,Boolean(coherent),bank,rng,{audience,outcome,constraint,approach}),review:evaluateConcept({chaos:level,coherent:Boolean(coherent),prompt:userPrompt,audience:audience||'curious people',outcome:outcome||'create something memorable',constraint,seed:numericSeed}),createdAt:new Date().toISOString(),lineage:[],revision:0};
}
export function mutateCreation(source,options={}){
  const parent=normalizeCreation(source);const seed=options.seed??randomSeed();const chaos=options.chaos??parent.chaos;
  const next=createCreation({category:parent.category,seed,chaos,prompt:parent.prompt||parent.title,coherent:parent.coherent,audience:parent.brief?.audience,outcome:parent.brief?.outcome,constraint:parent.brief?.constraint,approach:'Mutation study'});
  const prefix=['After an unexpected mutation, ','A strange new branch appears: ','The experiment takes a left turn: '][seededRandom(seed)()*3|0];
  return {...next,id:`${next.id}-m`,title:pick([next.title,`The ${pick(['Unlikely','Revised','Sideways','Second','Unstable'],seededRandom(seed+7))} ${next.title.replace(/^The /,'')}`],seededRandom(seed+9)),description:prefix+next.description,revision:parent.revision+1,lineage:[...parent.lineage,parent.id].slice(-8),parentId:parent.id};
}
export function fuseCreations(a,b,{seed=randomSeed(),chaos=80}={}){
  if(!a||!b||typeof a!=='object'||typeof b!=='object')throw new Error('Fusion requires two creation records');
  const left=normalizeCreation(a),right=normalizeCreation(b);
  const rng=seededRandom(seed);const category=pick([left.category,right.category,'anything'],rng);const next=createCreation({category,seed,chaos,prompt:`${left.title} × ${right.title}`,coherent:false,audience:left.brief?.audience||right.brief?.audience,outcome:left.brief?.outcome||right.brief?.outcome,constraint:left.brief?.constraint||right.brief?.constraint,approach:'Cross-disciplinary fusion'});
  const leftTraits=left.traits.length?left.traits:['unclassified signal'],rightTraits=right.traits.length?right.traits:['unclassified signal'];
  return {...next,id:`${next.id}-f`,title:`${pick(['The Hybrid','The Crossover','The Unlicensed Fusion','Project'],rng)} ${pick([left.title,right.title],rng).replace(/^The /,'')} ${pick(['Deluxe','Protocol','Paradox','Mk. ∞'],rng)}`,description:`A collision between ${left.title} and ${right.title}. ${next.description} It inherits ${pick(leftTraits,rng).toLowerCase()} from one parent and ${pick(rightTraits,rng).toLowerCase()} from the other.`,traits:[...new Set([...leftTraits.slice(0,2),...rightTraits.slice(0,2),'cross-universe anomaly'])].slice(0,4),lineage:[left.id,right.id],parentIds:[left.id,right.id],revision:0};
}
const BLUEPRINT_KEYS=['premise','purpose','mechanism','signature','constraint','firstTest','ripple','operatingMode','designNote','audience','problem','value','experience','requirements','risk','successMetric','prototype','nextStep','hardConstraint','approach'];
function normalizeBlueprint(raw,fallback={}){const clean={};for(const key of BLUEPRINT_KEYS){const value=raw&&typeof raw[key]==='string'?raw[key]:fallback[key]||'';clean[key]=String(value).slice(0,500);}return clean;}
function normalizeReview(raw,fallback){if(!raw||!['clarity','originality','feasibility','usefulness','overall'].every(k=>Number.isFinite(raw[k])))return fallback;const score={};for(const key of ['clarity','originality','feasibility','usefulness','overall'])score[key]=Math.max(0,Math.min(100,Math.round(raw[key])));const valid=['clarity','originality','feasibility','usefulness'];score.strongest=valid.includes(raw.strongest)?raw.strongest:valid.sort((a,b)=>score[b]-score[a])[0];score.weakest=valid.includes(raw.weakest)?raw.weakest:valid.sort((a,b)=>score[a]-score[b])[0];score.method='Local heuristic review · not user research or technical validation';return score;}
export function normalizeCreation(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid creation record');
  if(!Object.hasOwn(CATEGORIES,value.category))throw new Error('Unknown creation category');
  const title=String(value.title||'Untitled creation').slice(0,120);
  const description=String(value.description||'').slice(0,2000);
  const rawSeed=Number(value.seed);if(!Number.isFinite(rawSeed))throw new Error('Invalid seed');const seed=rawSeed>>>0;
  const palette=Array.isArray(value.palette)&&value.palette.length===3&&value.palette.every(x=>typeof x==='string'&&/^#[0-9a-f]{6}$/i.test(x))?[...value.palette]:[...PALETTES[0]];
  const rawChaos=Number(value.chaos);const chaos=Number.isFinite(rawChaos)?Math.max(0,Math.min(100,rawChaos)):0;
  const brief=value.brief&&typeof value.brief==='object'&&!Array.isArray(value.brief)?value.brief:{};
  const prompt=String(value.prompt||'').slice(0,100),approach=String(value.approach||'Balanced exploration').slice(0,80);
  const base=createCreation({category:value.category,seed,chaos,prompt,coherent:value.coherent!==false,audience:brief.audience||'',outcome:brief.outcome||'',constraint:brief.constraint||'',approach});
  const validDate=(candidate)=>{const d=new Date(candidate??Date.now());return Number.isFinite(d.getTime())?d.toISOString():new Date().toISOString();};
  const clean={id:String(value.id||`df-import-${seed.toString(36)}`).slice(0,100),version:VERSION,label:String(value.label||'').slice(0,80),title,description,seed,category:value.category,traits:Array.isArray(value.traits)?value.traits.slice(0,12).map(x=>String(x).slice(0,60)):[],palette,chaos,prompt,coherent:value.coherent!==false,brief:{audience:String(brief.audience||base.brief.audience).slice(0,100),outcome:String(brief.outcome||base.brief.outcome).slice(0,120),constraint:String(brief.constraint||'').slice(0,180)},approach,review:normalizeReview(value.review,base.review),blueprint:normalizeBlueprint(value.blueprint,base.blueprint),lineage:Array.isArray(value.lineage)?value.lineage.slice(0,8).map(x=>String(x).slice(0,100)):[],createdAt:validDate(value.createdAt),revision:Number.isFinite(Number(value.revision))?Math.max(0,Math.min(100000,Math.trunc(Number(value.revision)))):0};
  if(value.parentId!=null)clean.parentId=String(value.parentId).slice(0,100);
  if(Array.isArray(value.parentIds))clean.parentIds=value.parentIds.slice(0,2).map(x=>String(x).slice(0,100));
  if(value.savedAt!=null)clean.savedAt=validDate(value.savedAt);
  if(value.directionLabel!=null)clean.directionLabel=String(value.directionLabel).slice(0,80);
  return clean;
}
export function hasCreationNormalizationLoss(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return true;
  const allowed=['id','version','label','title','description','seed','category','traits','palette','chaos','prompt','coherent','brief','approach','review','blueprint','lineage','createdAt','revision','parentId','parentIds','savedAt','directionLabel'];
  if(Object.keys(value).some(key=>!allowed.includes(key)))return true;
  const stringLimits={id:100,label:80,title:120,description:2000,prompt:100,approach:80,parentId:100,directionLabel:80};
  for(const [key,max] of Object.entries(stringLimits))if(value[key]!=null&&(typeof value[key]!=='string'||value[key].length>max))return true;
  if(value.seed==null||!Number.isInteger(Number(value.seed))||Number(value.seed)<0||Number(value.seed)>0xffffffff)return true;
  if(value.version!=null&&(typeof value.version!=='string'||value.version.length>40))return true;
  if(value.id!=null&&(!value.id||/[<>\"']/.test(value.id)))return true;
  if(value.category==null||!Object.hasOwn(CATEGORIES,value.category))return true;
  if(value.palette!=null&&(!Array.isArray(value.palette)||value.palette.length!==3||!value.palette.every(item=>typeof item==='string'&&/^#[0-9a-f]{6}$/i.test(item))))return true;
  if(value.traits!=null&&(!Array.isArray(value.traits)||value.traits.length>12||value.traits.some(item=>typeof item!=='string'||item.length>60)))return true;
  if(value.lineage!=null&&(!Array.isArray(value.lineage)||value.lineage.length>8||value.lineage.some(item=>typeof item!=='string'||item.length>100)))return true;
  if(value.parentIds!=null&&(!Array.isArray(value.parentIds)||value.parentIds.length>2||value.parentIds.some(item=>typeof item!=='string'||item.length>100)))return true;
  if(value.brief!=null){if(!value.brief||typeof value.brief!=='object'||Array.isArray(value.brief)||Object.keys(value.brief).some(key=>!['audience','outcome','constraint'].includes(key)))return true;for(const [key,max] of Object.entries({audience:100,outcome:120,constraint:180}))if(value.brief[key]!=null&&(typeof value.brief[key]!=='string'||value.brief[key].length>max))return true;}
  if(value.blueprint!=null){if(!value.blueprint||typeof value.blueprint!=='object'||Array.isArray(value.blueprint)||Object.keys(value.blueprint).some(key=>!BLUEPRINT_KEYS.includes(key)))return true;for(const key of BLUEPRINT_KEYS)if(value.blueprint[key]!=null&&(typeof value.blueprint[key]!=='string'||value.blueprint[key].length>500))return true;}
  if(value.review!=null){
    const review=value.review,scoreKeys=['clarity','originality','feasibility','usefulness','overall'],validSignals=['clarity','originality','feasibility','usefulness'];
    if(!review||typeof review!=='object'||Array.isArray(review)||Object.keys(review).some(key=>![...scoreKeys,'strongest','weakest','method'].includes(key)))return true;
    if(!scoreKeys.every(key=>Number.isFinite(review[key])&&review[key]>=0&&review[key]<=100))return true;
    if(review.strongest!=null&&!validSignals.includes(review.strongest))return true;
    if(review.weakest!=null&&!validSignals.includes(review.weakest))return true;
    if(review.method!=null&&review.method!=='Local heuristic review · not user research or technical validation')return true;
  }
  if(value.chaos!=null&&(!Number.isFinite(Number(value.chaos))||Number(value.chaos)<0||Number(value.chaos)>100))return true;
  if(value.revision!=null&&(!Number.isFinite(Number(value.revision))||Number(value.revision)<0||Number(value.revision)>100000))return true;
  for(const key of ['createdAt','savedAt'])if(value[key]!=null&&!Number.isFinite(Date.parse(value[key])))return true;
  if(value.coherent!=null&&typeof value.coherent!=='boolean')return true;
  return false;
}

export function mergeCreationArchive(existing,incoming,limit=300){
  const archive=Array.isArray(existing)?[...existing]:[];
  const seen=new Set(archive.map(item=>item?.id).filter(id=>typeof id==='string'));
  let imported=0,invalid=0,duplicates=0,capacitySkipped=0;
  for(const raw of Array.isArray(incoming)?incoming:[]){
    let item;
    try{item=normalizeCreation(raw);if(hasCreationNormalizationLoss(raw)){invalid++;continue;}}catch{invalid++;continue;}
    if(seen.has(item.id)){duplicates++;continue;}
    if(archive.length>=Math.max(0,Math.trunc(Number(limit)||0))){capacitySkipped++;continue;}
    archive.unshift(item);seen.add(item.id);imported++;
  }
  return {archive,imported,invalid,duplicates,capacitySkipped};
}

export function makeDailyChallenge(date=new Date()){
  const key=`${date.getUTCFullYear()}-${date.getUTCMonth()+1}-${date.getUTCDate()}`;const rng=seededRandom(hashSeed(key));const prompts=['Invent an organism that lives inside a clock, feeds on forgotten time and reproduces through music.','Build a house that could survive on the surface of a star.','Design a machine that solves a problem nobody has noticed yet.','Create a tiny civilization that has never seen the sky.','Imagine a planet where the weather is decided by its inhabitants.','Make a useful object for a creature that exists only on Tuesdays.','Design a game where the rules change when players cooperate.'];return {key,title:pick(['A Clockwork Ecosystem','Architecture for the Impossible','Useful Nonsense','The Unseen Civilization','Weather Has Opinions','Tuesday Technology','Rules in Motion'],rng),prompt:pick(prompts,rng),seed:hashSeed(key)};
}
const SVG_CACHE=new Map();
export function renderCreationSvg(item){if(!item||typeof item!=='object')throw new Error('SVG export requires a creation record');const palette=Array.isArray(item.palette)&&item.palette.length===3&&item.palette.every(x=>typeof x==='string'&&/^#[0-9a-f]{6}$/i.test(x))?item.palette:PALETTES[0];const title=String(item.title??'Untitled creation');const seed=Number.isFinite(Number(item.seed))?(Number(item.seed)>>>0):1;const cacheKey=`${seed}|${title}|${palette.join(',')}`;if(SVG_CACHE.has(cacheKey))return SVG_CACHE.get(cacheKey);const [a,b,c]=palette;const rng=seededRandom(seed);const shapes=Array.from({length:13},(_,i)=>{const x=40+rng()*520,y=35+rng()*300,r=8+rng()*75,rot=Math.floor(rng()*360),opacity=(.12+rng()*.48).toFixed(2);return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot})" opacity="${opacity}"><path d="M 0 ${-r} Q ${r*1.3} ${-r*.4} ${r} 0 Q ${r*.2} ${r*1.4} 0 ${r} Q ${-r*1.4} ${r*.3} ${-r} 0 Q ${-r*.3} ${-r*1.3} 0 ${-r}Z" fill="${i%2?a:b}" stroke="${a}" stroke-width="2"/></g>`;}).join('');const dots=Array.from({length:55},()=>`<circle cx="${(rng()*600).toFixed(1)}" cy="${(rng()*360).toFixed(1)}" r="${(1+rng()*2.5).toFixed(1)}" fill="${a}" opacity="${(.2+rng()*.6).toFixed(2)}"/>`).join('');const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 360" role="img" aria-label="Procedural abstract artwork for ${escapeXml(title)}"><defs><radialGradient id="bg"><stop stop-color="${c}"/><stop offset="1" stop-color="#0a1020"/></radialGradient><filter id="blur"><feGaussianBlur stdDeviation="17"/></filter></defs><rect width="600" height="360" fill="url(#bg)"/><circle cx="300" cy="180" r="125" fill="${b}" opacity=".15" filter="url(#blur)"/>${dots}${shapes}<circle cx="300" cy="180" r="68" fill="none" stroke="${a}" stroke-width="1.5" opacity=".8"/><circle cx="300" cy="180" r="88" fill="none" stroke="${b}" stroke-width="1" stroke-dasharray="3 9" opacity=".7"/><path d="M70 285 Q180 70 300 180 T530 65" fill="none" stroke="${a}" stroke-width="2" opacity=".55"/><text x="24" y="334" fill="#ffffff" opacity=".65" font-family="monospace" font-size="10" letter-spacing="3">DREAMFORGER / ${String(seed).slice(0,9)} / SPECIMEN</text></svg>`;if(SVG_CACHE.size>=96)SVG_CACHE.delete(SVG_CACHE.keys().next().value);SVG_CACHE.set(cacheKey,svg);return svg;}
function escapeXml(s){return String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));}
export function slugify(s){return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'creation';}
export function createDemoSet(){return [
  createCreation({category:'creature',seed:187203,chaos:82,prompt:'a creature that lives in the static between radio stations'}),
  createCreation({category:'world',seed:902174,chaos:68,prompt:'an ocean suspended above a sleeping city'}),
  createCreation({category:'invention',seed:665102,chaos:91,prompt:'a device that repairs awkward silences'}),
  createCreation({category:'art',seed:441209,chaos:74,prompt:'a garden made of impossible geometry'}),
  createCreation({category:'story',seed:778201,chaos:57,prompt:'a lighthouse that receives letters from tomorrow'}),
  createCreation({category:'game',seed:310087,chaos:88,prompt:'a tiny strategy game about a moon garden'})
];}
