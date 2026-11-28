import {getOSApp} from './os-shell.mjs';

const freezeState = state => Object.freeze({
  ...state,
  windows:Object.freeze(Object.fromEntries(Object.entries(state.windows||{}).map(([id,win])=>[id,Object.freeze({...win})])))
});

export function createWindowManagerState(){
  return freezeState({
    windows:{home:{open:true,minimized:false,maximized:false,z:1}},
    activeId:'home',zCounter:1,revision:0
  });
}

function nextVisible(windows,except=''){
  return Object.entries(windows)
    .filter(([id,w])=>id!==except&&w.open&&!w.minimized)
    .sort((a,b)=>b[1].z-a[1].z)[0]?.[0]||null;
}

export function reduceWindowManagerState(state,action){
  const current=state&&typeof state==='object'?state:createWindowManagerState();
  const windows={...(current.windows||{})};
  const zCounter=(Number.isSafeInteger(current.zCounter)?current.zCounter:0)+1;
  let activeId=current.activeId??null;
  let changed=false;
  const appId=action?.appId||activeId;
  const win=windows[appId];
  switch(action?.type){
    case 'open':
    case 'focus':
    case 'restore': {
      if(!getOSApp(action?.appId))return current;
      const old=windows[action.appId]||{open:false,minimized:false,maximized:false,z:0};
      windows[action.appId]={...old,open:true,minimized:false,z:zCounter};
      activeId=action.appId;changed=true;break;
    }
    case 'minimize':
      if(!win?.open||win.minimized)return current;
      windows[appId]={...win,minimized:true,maximized:false};
      activeId=activeId!==appId&&windows[activeId]?.open&&!windows[activeId]?.minimized?activeId:nextVisible(windows,appId);changed=true;break;
    case 'toggle-maximize':
      if(!win?.open||win.minimized)return current;
      windows[appId]={...win,maximized:!win.maximized,z:zCounter};
      activeId=appId;changed=true;break;
    case 'close':
      if(!win?.open)return current;
      windows[appId]={...win,open:false,minimized:false,maximized:false};
      activeId=activeId!==appId&&windows[activeId]?.open&&!windows[activeId]?.minimized?activeId:nextVisible(windows,appId);changed=true;break;
    default:return current;
  }
  if(!changed)return current;
  return freezeState({windows,activeId,zCounter,revision:(Number.isSafeInteger(current.revision)?current.revision:0)+1});
}

export function isManagedWindowVisible(state,appId){
  const win=state?.windows?.[appId];
  return Boolean(win?.open&&!win.minimized);
}

export function getVisibleWindowIds(state){
  return Object.entries(state?.windows||{})
    .filter(([,win])=>win.open&&!win.minimized)
    .sort((a,b)=>a[1].z-b[1].z)
    .map(([id])=>id);
}
