// Merge edits by object field and array item ID, preserving concurrent unrelated changes.
const copyState = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
function sameState(a,b) {
 if(a===b)return true;
 if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return false;
 if(Array.isArray(a)||Array.isArray(b))
  return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>sameState(value,b[index]));
 const keys=Object.keys(a),otherKeys=Object.keys(b);
 return keys.length===otherKeys.length&&keys.every(key=>Object.prototype.hasOwnProperty.call(b,key)&&sameState(a[key],b[key]));
}
function mergeEdits(before, after, remote) {
 if(sameState(before,after))return copyState(remote);
 if(sameState(before,remote)||sameState(after,remote))return copyState(after);
 if(Array.isArray(before)&&Array.isArray(after)&&Array.isArray(remote)){
  if([...before,...after,...remote].every(x=>x&&typeof x==='object'&&typeof x.id==='string')){
   const b=new Map(before.map(x=>[x.id,x])),a=new Map(after.map(x=>[x.id,x])),r=new Map(remote.map(x=>[x.id,x]));
   return [...new Set([...remote.map(x=>x.id),...after.map(x=>x.id)])].map(id=>mergeEdits(b.get(id),a.get(id),r.get(id))).filter(x=>x!==undefined);
  }
  if([...before,...after,...remote].every(x=>typeof x==='string')){
   return [...new Set([...remote.filter(x=>!before.includes(x)||after.includes(x)),...after.filter(x=>!before.includes(x))])];
  }
 }
 if(before&&after&&remote&&!Array.isArray(before)&&!Array.isArray(after)&&!Array.isArray(remote)&&typeof before==='object'&&typeof after==='object'&&typeof remote==='object'){
  const result={};
  for(const key of new Set([...Object.keys(before),...Object.keys(after),...Object.keys(remote)])){
   const value=mergeEdits(before[key],after[key],remote[key]);if(value!==undefined)Object.defineProperty(result,key,{value,enumerable:true,writable:true,configurable:true});
  }return result;
 }
 throw new Error('같은 항목이 다른 곳에서 변경되었습니다. 최신 내용을 확인한 뒤 다시 시도해 주세요.');
}
let syncBaseline=null, savePending=false, undoEdit=null;
function acceptSnapshot(state){syncBaseline=copyState(state);}
function containsDeletion(before,after){
 if(Array.isArray(before)&&Array.isArray(after)&&before.some(x=>x?.id&&!after.some(y=>y?.id===x.id)))return true;
 if(before&&after&&typeof before==='object'&&typeof after==='object')
  return Object.keys(before).some(key=>key==='hiddenTasks'?after[key]?.some(id=>!before[key].includes(id)):containsDeletion(before[key],after[key]));
 return false;
}
async function commitEdits(before,after,offerUndo=true){
 const target=docRef;
 if(!target||savePending)return;
 savePending=true;
 try{
  const merged=await db.runTransaction(async transaction=>{
   const doc=await transaction.get(target);
   const raw=doc.exists?doc.data():before;
   const remote=typeof normalizeState==='function'?normalizeState(raw):raw;
   const value=mergeEdits(before,after,remote);
   transaction.set(target,value);
   return value;
  });
  if(docRef!==target)return;
  appState=typeof normalizeState==='function'?normalizeState(merged):merged;
  acceptSnapshot(appState);
  if(offerUndo&&containsDeletion(before,after)){
   undoEdit={before:copyState(after),after:copyState(before),target};
   showUndo();
  }
  if(typeof setSyncStatus==='function')setSyncStatus('● 동기화됨');
 }catch(error){
  if(docRef===target){
   try{
    const current=await target.get({source:'server'});
    if(current.exists){
     appState=typeof normalizeState==='function'?normalizeState(current.data()):current.data();
     acceptSnapshot(appState);isServerSynced=true;
    }
    if(typeof setSyncStatus==='function')setSyncStatus('저장 실패 · 최신 내용 확인 필요');
   }
   catch{
    appState=copyState(before);acceptSnapshot(appState);isServerSynced=false;
    if(typeof setSyncStatus==='function')setSyncStatus('저장 실패 · 서버 연결 확인 필요');
   }
   showToast(error.message||'저장에 실패했습니다.');
  }
 }finally{
  savePending=false;
  if(docRef===target){renderAll();if(typeof publishAbyss==='function')publishAbyss();}
 }
}
function showUndo(){
 document.getElementById('undo-toast')?.remove();
 const box=document.createElement('div');box.id='undo-toast';box.className='toast show';
 box.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:20000;display:flex;gap:18px;align-items:center';
 box.append(document.createTextNode('삭제했습니다.'));
 const button=document.createElement('button');button.textContent='실행 취소';
 button.onclick=async()=>{if(savePending||!undoEdit)return;const edit=undoEdit;if(edit.target!==docRef)return;undoEdit=null;box.remove();await commitEdits(edit.before,edit.after,false);};
 box.append(button);document.body.append(box);
 setTimeout(()=>{if(document.getElementById('undo-toast')===box){box.remove();undoEdit=null;}},15000);
}
