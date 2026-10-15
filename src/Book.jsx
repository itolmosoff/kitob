import {useState,useRef} from 'react';import {api} from './api';import {uuid} from './store';
import {Icon,Cover,Avatar,Stars,Btn,Msg,Modal,Loader,toast,go,money,fdate,today,addDays,useLoad} from './ui.jsx';
export default function Book({id,me}){
 const [b,err]=useLoad(()=>api('/books/'+id),[id]);const [favs,,rf]=useLoad(()=>api('/fav-ids'),[]);
 const [open,setOpen]=useState(false),[del,setDel]=useState(false),[busy,setBusy]=useState(false),[msg,setMsg]=useState('');
 const [f,setF]=useState({start:today(),days:3,name:me.name||'',phone:me.phone||''});const key=useRef(uuid());
 const back=()=>history.length>1?history.back():go('/');
 const backBtn=<button className="btn ghost sm backbtn" onClick={back}><Icon n="back" size={16}/>Orqaga</button>;
 if(err)return <div>{backBtn}<Msg err={err}/></div>;if(!b)return <Loader/>;
 const own=b.owner_id===me.id,fav=favs?.includes(b.id),d=+f.days,ok=Number.isInteger(d)&&d>=1&&d<=60,end=ok?addDays(f.start,d):'—',total=ok?d*b.price:0;
 const tog=async()=>{try{await api('/favs/'+b.id,'POST');rf()}catch(e){toast(e.message,'bad')}};
 const step=n=>setF({...f,days:Math.min(60,Math.max(1,(ok?d:1)+n))});
 const send=async()=>{if(busy)return;setMsg('');
  if(!f.name.trim()||!/^\+?[\d\s-]{7,15}$/.test(f.phone)||!ok||f.start<today())return setMsg('Ism, telefon (+998…), sana va muddat (1–60 kun) to‘g‘ri kiritilsin');
  setBusy(true);try{await api('/orders','POST',{...f,bookId:b.id,key:key.current});key.current=uuid();toast('Kitob band qilindi');setOpen(false);go('/me/rentals')}catch(e){setMsg(e.message)}setBusy(false)};
 const remove=async()=>{setBusy(true);setMsg('');try{await api('/books/'+b.id,'DELETE');toast('Kitob o‘chirildi');setDel(false);go('/me/books')}catch(e){setMsg(e.message)}setBusy(false)};
 return <div>{backBtn}
  <div className="bp-grid">
   <div className="bp-cover"><div className="bp-stage"><Cover b={b}/></div>
    <button className={'heart'+(fav?' on':'')} onClick={tog} aria-label="Sevimlilarga"><Icon n="heart" size={22} fill={fav}/></button></div>
   <div className="bp-info">
    <span className="chip on" style={{height:32,cursor:'default'}}>{b.genre}</span>
    <h1>{b.title}</h1><p className="by">{b.author}</p>
    <div className="facts">
     <div className="fact"><Icon n="tag"/><b>{money(b.price)}</b><span>bir kunga</span></div>
     <div className="fact"><Icon n="box"/><b>{b.available} / {b.copies}</b><span>mavjud nusxa</span></div>
     <div className="fact"><Icon n="repeat"/><b>{b.rentals}</b><span>marta ijarada</span></div></div>
    <h4>Kitob haqida</h4><p className="desc">{b.desc||'Bu kitob uchun tavsif kiritilmagan.'}</p>
    <div className="infoline"><Icon n="pin" size={18}/><span><b>Olish manzili:</b> {b.address||'Egasi bilan kelishiladi'}</span></div>
    <div className="infoline"><Icon n="clock" size={18}/><span>Kitobni muddatida qaytaring. Kechiksangiz, egasi bilan kelishasiz.</span></div>
    <a className="owner" href={'#/user/'+b.owner_id}><Avatar id={b.owner_id} name={b.owner_name} v={b.owner_av} size={46}/>
     <div className="grow"><b>{b.owner_name}</b><span className="sub">{b.owner_rating?<><Stars value={b.owner_rating} size={14}/>{b.owner_rating} · {b.owner_reviews} sharh</>:'Kitob egasi'}</span></div><Icon n="chevron" size={20}/></a>
    <div className="ctabar">{own?<><a className="btn soft grow" href={'#/edit/'+b.id}><Icon n="edit" size={18}/>Tahrirlash</a><Btn variant="danger" icon="trash" onClick={()=>{setMsg('');setDel(true)}}>O‘chirish</Btn></>
     :<Btn className="grow" size="lg" icon="calendar" disabled={!b.available} onClick={()=>{setMsg('');setOpen(true)}}>{b.available?'Band qilish':'Hozircha band'}</Btn>}</div></div></div>
  <Modal open={open} onClose={()=>setOpen(false)} title="Band qilish">
   <div className="bk-book"><div className="mini"><Cover b={b}/></div><div><b>{b.title}</b><span>{b.author} · {money(b.price)}/kun</span></div></div>
   <div className="grid2"><label className="field"><span>Boshlanish sanasi</span><input className="input" type="date" min={today()} value={f.start} onChange={e=>setF({...f,start:e.target.value})}/></label>
    <div className="field"><span>Necha kunga</span><div className="stepper"><button type="button" onClick={()=>step(-1)} aria-label="Kamaytirish"><Icon n="minus" size={18}/></button>
     <input className="input" type="number" min="1" max="60" inputMode="numeric" value={f.days} onChange={e=>setF({...f,days:e.target.value})}/><button type="button" onClick={()=>step(1)} aria-label="Ko‘paytirish"><Icon n="plus" size={18}/></button></div></div></div>
   <label className="field"><span>Ismingiz</span><input className="input" autoComplete="name" value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></label>
   <label className="field"><span>Telefon</span><input className="input" type="tel" autoComplete="tel" placeholder="+998 90 123 45 67" value={f.phone} onChange={e=>setF({...f,phone:e.target.value})}/></label>
   <div className="sum"><div><span>Qaytarish sanasi</span><b>{ok?fdate(end):'—'}</b></div><div><span>Kunlik narx</span><b>{money(b.price)}</b></div><div className="t"><span>Jami</span><b>{money(total)}</b></div></div>
   <Msg err={msg}/><Btn block size="lg" busy={busy} icon="check" onClick={send}>Band qilishni tasdiqlash</Btn></Modal>
  <Modal open={del} onClose={()=>setDel(false)} title="Kitobni o‘chirish">
   <p style={{marginBottom:18}}>“{b.title}” kitobi katalogdan butunlay o‘chiriladi. Bu amalni qaytarib bo‘lmaydi.</p><Msg err={msg}/>
   <div className="row"><Btn variant="ghost" className="grow" onClick={()=>setDel(false)}>Bekor qilish</Btn><Btn variant="danger" className="grow" busy={busy} icon="trash" onClick={remove}>O‘chirish</Btn></div></Modal></div>}
