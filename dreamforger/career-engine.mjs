/* Pure, testable calculations for Dreamforger Career Suite. */
const bounded=(value,max)=>{const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(max,n)):0;};
export function calculateQuote(input={}){
  const h=bounded(input.hours,10000000),r=bounded(input.rate,1000000),ex=bounded(input.expenses,100000000),rev=bounded(input.revisions,1000),rh=bounded(input.revisionHours,100000),cont=bounded(input.contingency,100),tax=bounded(input.tax,100);
  const labour=(h+rev*rh)*r,base=labour+ex,buffer=base*cont/100,subtotal=base+buffer;
  return {h,r,ex,rev,rh,cont,tax,labour,base,buffer,subtotal,total:subtotal*(1+tax/100)};
}
export function scoreMatrix(matrix){
  const criteria=Array.isArray(matrix?.criteria)?matrix.criteria:[],options=Array.isArray(matrix?.options)?matrix.options:[];
  const weight=c=>{const n=Number(c?.weight);return Number.isFinite(n)?Math.max(0,Math.min(100,n)):0;};
  const score=(o,i)=>{const n=Number(o?.scores?.[i]);return Number.isFinite(n)?Math.max(0,Math.min(5,n)):0;};
  const max=criteria.reduce((sum,c)=>sum+weight(c)*5,0)||1;
  return options.map(o=>{const weighted=criteria.reduce((sum,c,i)=>sum+weight(c)*score(o,i),0);return {name:String(o.name||'Untitled'),weighted,percent:Math.round(weighted/max*100)};});
}
