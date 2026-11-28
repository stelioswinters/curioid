/** Read-only storage inventory. Never returns stored values or mutates storage. */
const TRACKED_KEYS = Object.freeze([
  'dreamforge.archive.v1',
  'dreamforge.studio.v1',
  'dreamforger.career-suite.v1',
  'dreamforger.shell-preferences.v1',
  'dreamforger.storage-epoch.v1'
]);
const unavailable = budgetBytes => Object.freeze({available:false,usedBytes:null,budgetBytes,percent:null,records:Object.freeze([])});

export function inspectStorageHealth(storage, budgetBytes = 4 * 1024 * 1024) {
  const budget=Number.isFinite(budgetBytes)&&budgetBytes>0?budgetBytes:4*1024*1024;
  if (!storage || !Number.isInteger(storage.length) || typeof storage.key !== 'function' || typeof storage.getItem !== 'function') return unavailable(budget);
  try {
    let codeUnits=0;
    for(let i=0;i<storage.length;i++){
      const key=storage.key(i);
      if(typeof key==='string') codeUnits+=key.length+String(storage.getItem(key)??'').length;
    }
    const records=TRACKED_KEYS.map(key=>{
      const value=storage.getItem(key);
      return Object.freeze({key,present:value!==null,bytes:value===null?0:(key.length+value.length)*2});
    });
    const usedBytes=codeUnits*2;
    return Object.freeze({available:true,usedBytes,budgetBytes:budget,percent:Math.min(100,Math.round(usedBytes/budget*100)),records:Object.freeze(records)});
  } catch { return unavailable(budget); }
}
