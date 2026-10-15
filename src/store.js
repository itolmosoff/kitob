import {useSyncExternalStore} from 'react';
// Brauzerda: kirish tokeni va shu qurilmada kirilgan akkauntlar ro'yxati (parolsiz). Akkaunt va parol serverda.
const TK='kitob-token',AK='kitob-accounts';
try{localStorage.removeItem('kitob-store-v1')}catch{}
const rd=k=>{try{return localStorage.getItem(k)}catch{return null}};
const wr=(k,v)=>{try{v==null?localStorage.removeItem(k):localStorage.setItem(k,v)}catch{}};
let token=rd(TK);let accounts=(()=>{try{const a=JSON.parse(rd(AK));return Array.isArray(a)?a:[]}catch{return[]}})();
const subs=new Set();const emit=()=>subs.forEach(f=>f());
export const store={
 get token(){return token},
 sub:f=>{subs.add(f);return()=>subs.delete(f)},
 setToken(t){token=t||null;wr(TK,token);emit()},
 remember(a){const old=accounts.find(x=>x.email===a.email);accounts=[{...old,...a},...accounts.filter(x=>x.email!==a.email)].slice(0,5);wr(AK,JSON.stringify(accounts));emit()},
 forget(email){accounts=accounts.filter(x=>x.email!==email);wr(AK,JSON.stringify(accounts));emit()}};
export const useToken=()=>useSyncExternalStore(store.sub,()=>token);
export const useAccounts=()=>useSyncExternalStore(store.sub,()=>accounts);
export const uuid=()=>{try{if(crypto.randomUUID)return crypto.randomUUID()}catch{}
 return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16)})};
