/** Small, non-project desktop preferences. Never store creative/project content here. */
export const SHELL_PREFERENCES_KEY = 'dreamforge.shell-preferences.v1';
const APP_IDS = new Set(['home','forge','studio','explore','archive','files','system']);
const clamp = (value,min,max) => Math.max(min,Math.min(max,Number.isFinite(value)?value:min));

export function createDefaultShellPreferences(){
  return Object.freeze({version:2,compact:false,fontScale:1,highContrast:false,reduceMotion:false,windows:{}});
}

export function normalizeShellPreferences(input){
  if(!input || typeof input!=='object' || Array.isArray(input) || ![1,2].includes(input.version)) return createDefaultShellPreferences();
  const windows={};
  if(input.windows && typeof input.windows==='object' && !Array.isArray(input.windows)){
    for(const [id,value] of Object.entries(input.windows).slice(0,7)){
      if(!APP_IDS.has(id) || !value || typeof value!=='object') continue;
      windows[id]={x:Math.round(clamp(value.x,0,10000)),y:Math.round(clamp(value.y,0,10000)),width:Math.round(clamp(value.width,320,2400)),height:Math.round(clamp(value.height,260,1800)),maximized:value.maximized===true};
    }
  }
  return Object.freeze({version:2,compact:input.compact===true,fontScale:clamp(input.fontScale??1,.9,1.25),highContrast:input.highContrast===true,reduceMotion:input.reduceMotion===true,windows:Object.freeze(windows)});
}

export function readShellPreferences(storage){
  try { const raw=storage?.getItem(SHELL_PREFERENCES_KEY); return raw?normalizeShellPreferences(JSON.parse(raw)):createDefaultShellPreferences(); }
  catch { return createDefaultShellPreferences(); }
}

export function writeShellPreferences(storage,input){
  const safe=normalizeShellPreferences(input);
  try { const raw=JSON.stringify(safe); if(raw.length>4096) return false; storage?.setItem(SHELL_PREFERENCES_KEY,raw); return true; }
  catch { return false; }
}
