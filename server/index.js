import http from 'node:http'; import crypto from 'node:crypto'; import os from 'node:os'; import path from 'path'; import fs from 'fs'; import {fileURLToPath} from 'url';
const dir=path.dirname(fileURLToPath(import.meta.url));
// better-sqlite3 o'rniga Node'ning ichki sqlite'i (hech narsa o'rnatish/kompilyatsiya shart emas). Node 22.13+ kerak.
let DatabaseSync;try{({DatabaseSync}=await import('node:sqlite'))}catch{console.error('Node 22.13+ kerak (node -v). Eskiroq 22.x da: node --experimental-sqlite index.js');process.exit(1)}
// Baza kod papkasidan TASHQARIDA saqlanadi: yangi zip/papka ochsangiz ham akkauntlar yo'qolmaydi.
const DATA=process.env.DATA_DIR||path.join(os.homedir(),'.kitob-uz');fs.mkdirSync(DATA,{recursive:true});
const DBF=path.join(DATA,'kitob.db');
if(!fs.existsSync(DBF)){for(const x of ['','-wal','-shm']){const old=path.join(dir,'kitob.db'+x);if(fs.existsSync(old))fs.copyFileSync(old,DBF+x)}} // eski versiyadan ko'chirish
console.log('Ma‘lumotlar bazasi:',DBF);
const raw=new DatabaseSync(DBF);
const db={exec:q=>raw.exec(q),pragma:q=>raw.exec('pragma '+q),prepare:q=>raw.prepare(q),
 transaction:f=>(...a)=>{raw.exec('begin');try{const r=f(...a);raw.exec('commit');return r}catch(e){try{raw.exec('rollback')}catch{}throw e}}};
db.pragma('journal_mode=WAL');
db.exec(`create table if not exists users(id text primary key,name text,created text);
create table if not exists books(id integer primary key,owner_id text,title text,author text,genre text,desc text,price int,copies int,available int,address text);
create table if not exists orders(id integer primary key,key text unique,book_id int,book_title text,renter_id text,owner_id text,name text,phone text,start text,end text,days int,price int,total int,status text,reason text,return_requested int default 0,created text);
create table if not exists history(id integer primary key,order_id int,status text,note text,at text);`);
const today=()=>new Date().toISOString().slice(0,10), now=()=>new Date().toISOString();
const addDays=(s,d)=>{const x=new Date(s);x.setUTCDate(x.getUTCDate()+d);return x.toISOString().slice(0,10)};
// express o'rniga mini-router (hech qanday paket kerak emas)
const routes=[];const app={};
for(const m of ['get','post','put','delete'])app[m]=(p,...h)=>routes.push({m:m.toUpperCase(),re:new RegExp('^'+p.replace(/:(\w+)/g,'(?<$1>[^/]+)')+'$'),h});
const E=(c,m)=>({c,m});
const SYS='kutubxona';
const AV=p=>`case when ${p}avatar is null or ${p}avatar='' then 0 else coalesce(${p}avatar_ts,1) end`;
const BC="b.id,b.owner_id,b.title,b.author,b.genre,b.desc,b.price,b.copies,b.available,b.address,case when b.cover is null or b.cover='' then 0 else coalesce(b.cover_ts,1) end as cover_v";
const auth=(q,s,n)=>{try{const t=(q.headers.authorization||'').slice(7);
 const u=t&&db.prepare('select u.id,u.name,u.email from sessions s join users u on u.id=s.user_id where s.token=? and s.created>?').get(t,new Date(Date.now()-30*864e5).toISOString());
 if(!u)return s.status(401).json({error:'Qayta kiring'});q.u=u;q.token=t;n()}catch{s.status(500).json({error:'Server xatosi'})}};
const wrap=f=>(q,s)=>{try{f(q,s)}catch(e){s.status(e.c||500).json({error:e.m||'Server xatosi'})}};
app.get('/api/me',auth,wrap((q,s)=>s.json(db.prepare(`select id,name,email,username,phone,region,${AV('')} as avatar_v from users where id=?`).get(q.u.id))));
// --- akkauntlar serverda: parol scrypt bilan, kirish token bilan ---
const pw={hash:p=>{const salt=crypto.randomBytes(16).toString('hex');return salt+':'+crypto.scryptSync(p,salt,64).toString('hex')},
 ok:(p,h)=>{const [salt,x]=(h||'').split(':');if(!x)return false;const a=Buffer.from(x,'hex'),b=crypto.scryptSync(p,salt,64);return a.length===b.length&&crypto.timingSafeEqual(a,b)}};
const session=id=>{const t=crypto.randomBytes(32).toString('hex');db.prepare('insert into sessions(token,user_id,created) values(?,?,?)').run(t,id,now());return t};
const norm=e=>String(e||'').trim().toLowerCase(),fails=new Map();
const limit=k=>{const r=(fails.get(k)||[]).filter(t=>Date.now()-t<6e5);fails.set(k,r);if(r.length>=10)throw E(429,'Juda ko‘p urinish. 10 daqiqadan keyin qayta urining')};
app.post('/api/register',wrap((q,s)=>{const name=String(q.body.name||'').trim().slice(0,60),email=norm(q.body.email),password=String(q.body.password||'');
 if(!name)throw E(400,'Ismingizni kiriting');if(!/^\S+@\S+\.\S+$/.test(email))throw E(400,'Email noto‘g‘ri');if(password.length<6)throw E(400,'Parol kamida 6 belgi bo‘lsin');
 if(db.prepare('select 1 from users where email=?').get(email))throw E(409,'Bu email band');
 const id=crypto.randomUUID();db.prepare('insert into users(id,name,email,hash,created,username) values(?,?,?,?,?,?)').run(id,name,email,pw.hash(password),now(),'user'+id.replace(/-/g,'').slice(0,8));
 s.json({token:session(id),user:{id,name,email}})}));
app.post('/api/login',wrap((q,s)=>{const email=norm(q.body.email),k=q.socket.remoteAddress+'|'+email;limit(k);
 const u=db.prepare('select id,name,email,hash from users where email=?').get(email);
 if(!u){fails.get(k).push(Date.now());throw E(401,'Bu email ro‘yxatdan o‘tmagan. Avval ro‘yxatdan o‘ting')}
 if(!pw.ok(String(q.body.password||''),u.hash)){fails.get(k).push(Date.now());throw E(401,'Parol noto‘g‘ri')}
 fails.delete(k);s.json({token:session(u.id),user:{id:u.id,name:u.name,email:u.email}})}));
app.post('/api/logout',auth,(q,s)=>{db.prepare('delete from sessions where token=?').run(q.token);s.json({ok:1})});
app.put('/api/me/password',auth,wrap((q,s)=>{const u=db.prepare('select hash from users where id=?').get(q.u.id);
 if(!pw.ok(String(q.body.old||''),u.hash))throw E(400,'Eski parol xato');if(String(q.body.new||'').length<6)throw E(400,'Yangi parol ≥ 6 belgi');
 db.prepare('update users set hash=? where id=?').run(pw.hash(String(q.body.new)),q.u.id);db.prepare('delete from sessions where user_id=? and token<>?').run(q.u.id,q.token);s.json({ok:1})}));
const bookIn=b=>{const p=+b.price,c=+b.copies;
 if(!String(b.title||'').trim()||!String(b.author||'').trim()||!Number.isInteger(p)||p<=0||!Number.isInteger(c)||c<0)throw E(400,'Kitob maydonlari noto‘g‘ri (nom, muallif, narx, nusxa)');
 return [String(b.title).trim().slice(0,120),String(b.author).trim().slice(0,120),String(b.genre||'Roman').slice(0,30),String(b.desc||'').slice(0,1000),p,c,String(b.address||'').slice(0,200)]};
const IMG=/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/]+=*$/;
const imgOk=(v,max)=>{if(typeof v!=='string'||!IMG.test(v)||v.length>max)throw E(400,'Rasm noto‘g‘ri yoki juda katta');return v};
const sendImg=(v,s)=>{const m=/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(v||'');if(!m)return s.status(404).json({error:'Rasm yo‘q'});
 s.setHeader('Content-Type',m[1]);s.setHeader('Cache-Control','public, max-age=604800');s.end(Buffer.from(m[2],'base64'))};
app.get('/api/books',wrap((q,s)=>{const {q:t='',genre=''}=q.query;
 s.json(db.prepare(`select ${BC},u.name owner_name,(select count(*) from orders o where o.book_id=b.id) rentals from books b left join users u on u.id=b.owner_id
  where (b.title like ? or b.author like ?) and (?='' or b.genre=?) order by case when b.owner_id=? then 1 else 0 end, case when b.owner_id=? then b.id else -b.id end`).all(`%${t}%`,`%${t}%`,genre,genre,SYS,SYS))}));
app.get('/api/books/:id/cover',(q,s)=>sendImg(db.prepare('select cover v from books where id=?').get(q.params.id)?.v,s));
app.get('/api/users/:id/avatar',(q,s)=>sendImg(db.prepare('select avatar v from users where id=?').get(q.params.id)?.v,s));
app.get('/api/books/:id',wrap((q,s)=>{const b=db.prepare(`select ${BC},u.name owner_name,${AV('u.')} as owner_av,
  (select avg(stars) from reviews where to_id=b.owner_id) owner_rating,(select count(*) from reviews where to_id=b.owner_id) owner_reviews,
  (select count(*) from orders o where o.book_id=b.id) rentals from books b left join users u on u.id=b.owner_id where b.id=?`).get(q.params.id);
 if(!b)throw E(404,'Kitob topilmadi');s.json({...b,owner_rating:b.owner_rating?+(+b.owner_rating).toFixed(1):null})}));
app.get('/api/my-books',auth,(q,s)=>s.json(db.prepare(`select ${BC} from books b where b.owner_id=? order by b.id desc`).all(q.u.id)));
app.post('/api/books',auth,wrap((q,s)=>{const [t,a,g,d,p,c,ad]=bookIn(q.body);const cv=q.body.cover?imgOk(q.body.cover,450000):null;
 s.json({id:db.prepare('insert into books(owner_id,title,author,genre,desc,price,copies,available,address,cover,cover_ts) values(?,?,?,?,?,?,?,?,?,?,?)').run(q.u.id,t,a,g,d,p,c,c,ad,cv,Date.now()).lastInsertRowid})}));
app.put('/api/books/:id',auth,wrap((q,s)=>{const [t,a,g,d,p,c,ad]=bookIn(q.body);
 const b=db.prepare('select * from books where id=? and owner_id=?').get(q.params.id,q.u.id);if(!b)throw E(404,'Kitob topilmadi');
 const cv=typeof q.body.cover==='string'&&q.body.cover?imgOk(q.body.cover,450000):null;
 const av=Math.max(0,b.available+(c-b.copies));
 db.prepare('update books set title=?,author=?,genre=?,desc=?,price=?,copies=?,available=?,address=? where id=?').run(t,a,g,d,p,c,av,ad,b.id);
 if(q.body.cover===null)db.prepare('update books set cover=null,cover_ts=? where id=?').run(Date.now(),b.id);
 else if(cv)db.prepare('update books set cover=?,cover_ts=? where id=?').run(cv,Date.now(),b.id);
 s.json({ok:1})}));
app.delete('/api/books/:id',auth,wrap((q,s)=>{const b=db.prepare('select id from books where id=? and owner_id=?').get(q.params.id,q.u.id);if(!b)throw E(404,'Kitob topilmadi');
 if(db.prepare("select 1 from orders where book_id=? and status in('new','confirmed','rented')").get(b.id))throw E(409,'Bu kitobda faol ijara bor. Ijara tugagach o‘chirishingiz mumkin');
 db.prepare('delete from books where id=?').run(b.id);db.prepare('delete from favs where book_id=?').run(b.id);s.json({ok:1})}));
const log=(id,st,note='')=>db.prepare('insert into history(order_id,status,note,at) values(?,?,?,?)').run(id,st,note,now());
app.post('/api/orders',auth,wrap((q,s)=>{const {bookId,start,days,name,phone,key}=q.body,d=+days;
 if(!key||!name?.trim()||!/^\+?[\d\s-]{7,15}$/.test(phone||'')||!Number.isInteger(d)||d<1||d>60||!/^\d{4}-\d\d-\d\d$/.test(start||''))throw E(400,'Forma noto‘g‘ri');
 if(start<today())throw E(400,'O‘tgan sanaga ijara mumkin emas');
 const id=db.transaction(()=>{const old=db.prepare('select id from orders where key=?').get(key);if(old)return old.id; // takroriy yuborish
  const b=db.prepare('select * from books where id=?').get(bookId);if(!b)throw E(404,'Kitob mavjud emas');if(b.owner_id===q.u.id)throw E(400,'O‘z kitobingizni ijaraga ololmaysiz');
  if(db.prepare('update books set available=available-1 where id=? and available>0').run(b.id).changes!==1)throw E(409,'Bo‘sh nusxa qolmadi');
  const total=b.price*d,st=b.owner_id===SYS?'confirmed':'new'; // narx serverda hisoblanadi va saqlanadi
  const oid=db.prepare('insert into orders(key,book_id,book_title,renter_id,owner_id,name,phone,start,end,days,price,total,status,created) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(key,b.id,b.title,q.u.id,b.owner_id,name.trim(),phone,start,addDays(start,d),d,b.price,total,st,now()).lastInsertRowid;
  log(oid,'new');if(st==='confirmed')log(oid,'confirmed','Avtomatik tasdiqlandi');return oid})();
 s.json({id})}));
app.get('/api/orders',auth,(q,s)=>{const col=q.query.as==='owner'?'owner_id':'renter_id';
 s.json(db.prepare(`select o.*,case when b.cover is null or b.cover='' then 0 else coalesce(b.cover_ts,1) end as cover_v,b.author as book_author,(b.id is not null) as book_exists,(select name from users where id=o.owner_id) owner_name,(select name from users where id=o.renter_id) renter_name from orders o left join books b on b.id=o.book_id where o.${col}=? order by o.id desc`).all(q.u.id).map(o=>({...o,overdue:['confirmed','rented'].includes(o.status)&&o.end<today()?1:0,history:db.prepare('select status,note,at from history where order_id=? order by id').all(o.id)})))});
const T={confirm:['owner','new','confirmed'],reject:['owner','new','rejected'],handover:['owner','confirmed','rented'],receive:['owner','rented','returned'],cancel:['customer','new','cancelled']};
app.post('/api/orders/:id/:act',auth,wrap((q,s)=>{const {act}=q.params;
 db.transaction(()=>{const o=db.prepare('select * from orders where id=?').get(q.params.id);
  const role=o&&o.owner_id===q.u.id?'owner':o&&o.renter_id===q.u.id?'customer':null;if(!role)throw E(404,'Buyurtma topilmadi');
  if(o.owner_id===SYS&&role==='customer'){ // kutubxona kitoblari: egasi yo'q, ijarachi o'zi boshqaradi
   const mv=(st,note)=>{db.prepare('update orders set status=? where id=?').run(st,o.id);log(o.id,st,note);if(st!=='rented')db.prepare('update books set available=min(copies,available+1) where id=?').run(o.book_id)};
   if(act==='pickup'){if(o.status!=='confirmed')throw E(400,'Bu amal hozir mumkin emas');return mv('rented','Kitob olindi')}
   if(act==='cancel'){if(o.status!=='confirmed')throw E(400,'Bu amal hozir mumkin emas');return mv('cancelled')}
   if(act==='return-request'){if(o.status!=='rented')throw E(400,'Bu amal hozir mumkin emas');return mv('returned','Qaytarildi')}}
  if(act==='return-request'){if(role!=='customer'||o.status!=='rented')throw E(400,'Bu amal hozir mumkin emas');
   db.prepare('update orders set return_requested=1 where id=?').run(o.id);return log(o.id,'rented','Qaytarish so‘rovi')}
  const t=T[act];if(!t||t[0]!==role)throw E(403,'Ruxsat yo‘q');if(o.status!==t[1])throw E(400,'Holat tartibi buzilmasin: hozir "'+o.status+'"');
  if(act==='reject'&&!q.body.reason?.trim())throw E(400,'Rad etish sababi kerak');
  db.prepare('update orders set status=?,reason=? where id=?').run(t[2],q.body.reason||o.reason,o.id);log(o.id,t[2],q.body.reason||'');
  if(['rejected','cancelled','returned'].includes(t[2]))db.prepare('update books set available=min(copies,available+1) where id=?').run(o.book_id)})();
 s.json({ok:1})}));

for(const c of ['username','surname','bio','region','phone','created','email','hash','avatar','avatar_ts'])try{db.exec(`alter table users add column ${c} text`)}catch{}
for(const c of ['cover text','cover_ts int'])try{db.exec(`alter table books add column ${c}`)}catch{}
db.exec(`update users set created=coalesce(created,'${now()}'),username=coalesce(username,lower(replace(name,' ','_'))||id);
create table if not exists sessions(token text primary key,user_id text,created text);
create unique index if not exists users_email on users(email);
create table if not exists favs(user_id text,book_id int,primary key(user_id,book_id));
create table if not exists msgs(id integer primary key,order_id int,sender text,text text,at text);
create table if not exists reviews(id integer primary key,order_id int,from_id text,to_id text,stars int,text text,at text,unique(order_id,from_id));`);
const SEED=[["O‘tkan kunlar", "Abdulla Qodiriy", "Roman", "O‘zbek adabiyotidagi ilk roman: Otabek va Kumushning muhabbati hamda xonlik davri voqealari."], ["Mehrobdan chayon", "Abdulla Qodiriy", "Roman", "Qo‘qon xonligi muhitida yosh Anvar va Ra’noning fojiali taqdiri haqida tarixiy roman."], ["Otamdan qolgan dalalar", "Tohir Malik", "Roman", "Ota va bola, yer va adolat haqidagi, bir necha avlod hayotini qamragan roman."], ["Shaytanat", "Tohir Malik", "Roman", "Insonning ichki kurashi, vijdon va iymon mavzusidagi mashhur roman."], ["Ikki eshik orasi", "O‘tkir Hoshimov", "Roman", "O‘tkir Hoshimovning xalq hayotini keng ko‘rsatgan, hayotiy romani."], ["Dunyoning ishlari", "O‘tkir Hoshimov", "Roman", "Bolalik xotiralari va hayotiy voqealar asosida yozilgan samimiy qissa."], ["Ulug‘bek xazinasi", "Odil Yoqubov", "Roman", "Mirzo Ulug‘bek davri va uning taqdiri haqida tarixiy roman."], ["Kecha va kunduz", "Cho‘lpon", "Roman", "Cho‘lponning o‘zbek xalqi hayotini tasvirlaydigan mashhur romani."], ["Navoiy", "Oybek", "Roman", "Oybekning Alisher Navoiy hayoti va davri haqidagi tarixiy romani."], ["Jinoyat va jazo", "Fyodor Dostoyevskiy", "Roman", "Raskolnikovning ichki kurashi va vijdon azobi haqidagi klassik roman."], ["Urush va tinchlik", "Lev Tolstoy", "Roman", "Napoleon urushlari davridagi Rossiya jamiyati haqida buyuk epik roman."], ["Anna Karenina", "Lev Tolstoy", "Roman", "Muhabbat, oila va jamiyat qoidalarining to‘qnashuvi haqidagi roman."], ["Alkimyogar", "Paulo Koelo", "Roman", "Yosh cho‘pon Santyagoning orzusi ortidan qilgan sayohati haqida ibratli hikoya."], ["Chol va dengiz", "Ernest Xeminguey", "Roman", "Keksa baliqchining ulkan baliq bilan kurashi haqida qissa."], ["Usta va Margarita", "Mixail Bulgakov", "Roman", "Moskvada shayton paydo bo‘lishi, sevgi va adolat haqidagi mashhur roman."], ["Yuz yillik yolg‘izlik", "Gabriel Garsia Markes", "Roman", "Buendia oilasining bir necha avlodi tarixi, sehrli realizm namunasi."], ["Buyuk Getsbi", "Frensis Skott Fitsjerald", "Roman", "1920-yillar Amerikasida orzu, boylik va sevgi haqidagi roman."], ["Hayvonlar fermasi", "Jorj Oruell", "Roman", "Hokimiyat va tenglik haqidagi masalga o‘xshash satirik qissa."], ["Dune", "Frank Herbert", "Fantastika", "Cho‘l sayyorasi Arrakisdagi hokimiyat va omon qolish kurashi haqida fantastik doston."], ["Xobbit", "J. R. R. Tolkin", "Fantastika", "Bilbo Baggins va mittilar sarguzashti haqida ertakbop asar."], ["Garri Potter va falsafiy tosh", "Joan Rowling", "Fantastika", "Sehrgarlik maktabiga kelgan yetim bolaning birinchi sarguzashtlari."], ["Asos", "Ayzek Azimov", "Fantastika", "Galaktika imperiyasi qulashi va sivilizatsiyani saqlab qolish haqida ilmiy fantastika."], ["Marslik", "Endi Veyr", "Fantastika", "Marsda yolg‘iz qolgan astronavtning omon qolish uchun kurashi."], ["1984", "Jorj Oruell", "Fantastika", "Total nazorat va haqiqat buzib ko‘rsatiladigan jamiyat haqida antiutopiya."], ["Fahrenheit 451", "Rey Bredberi", "Fantastika", "Kitoblar yoqib tashlanadigan kelajak haqidagi distopik roman."], ["Sherlok Xolms sarguzashtlari", "Artur Konan Doyl", "Detektiv", "Dono detektiv Xolms va doktor Vatsonning qiziqarli ishlari."], ["Nil daryosidagi o‘lim", "Agata Kristi", "Detektiv", "Nil bo‘ylab kemada sodir bo‘lgan qotillikni Puaro ochadi."], ["Sharq ekspressidagi qotillik", "Agata Kristi", "Detektiv", "Qorga tushib qolgan poyezdda sodir bo‘lgan jumboqli qotillik."], ["Da Vinchi siri", "Den Braun", "Detektiv", "Luvrdagi qotillikdan boshlangan sirli izlanish haqida triller."], ["Sapiens", "Yuval Harari", "Tarix", "Insoniyatning ibtidosidan bugungi kungacha bo‘lgan qisqacha tarixi."], ["Homo Deus", "Yuval Harari", "Tarix", "Insoniyatning kelajagi: texnologiya va inson taqdiri haqida mulohazalar."], ["Boburnoma", "Zahiriddin Muhammad Bobur", "Tarix", "Bobur Mirzoning xotiralari: hayoti, yurishlari va tabiat tasvirlari."], ["Temur tuzuklari", "Amir Temur", "Tarix", "Amir Temurga nisbat beriladigan davlat boshqaruvi va harbiy ish qoidalari."], ["Qurol, mikroblar va po‘lat", "Jared Daymond", "Tarix", "Jamiyatlar taraqqiyoti nega turlicha bo‘lganini tushuntiruvchi tadqiqot."], ["Vaqtning qisqacha tarixi", "Stiven Xoking", "Ilmiy", "Koinot, qora o‘ralar va vaqt tabiati haqida ommabop kitob."], ["Kosmos", "Karl Sagan", "Ilmiy", "Koinot va unda insonning o‘rni haqida ilhomlantiruvchi kitob."], ["Xudbin gen", "Richard Dokinz", "Ilmiy", "Evolyutsiyaga genlar nuqtai nazaridan qaraydigan mashhur kitob."], ["Tez va sekin fikrlash", "Daniel Kaneman", "Psixologiya", "Fikrlashimizning ikki tizimi va qarorlardagi xatolar haqida."], ["Atom odatlar", "Jeyms Klir", "Psixologiya", "Kichik odatlar orqali hayotni o‘zgartirishning amaliy yo‘llari."], ["Insonning ma’no izlashi", "Viktor Frankl", "Psixologiya", "Qamoq lagerida omon qolgan psixiatr tajribasi va hayot ma’nosi haqida."], ["Boy ota, kambag‘al ota", "Robert Kiyosaki", "Biznes", "Pul va moliyaviy savodxonlik haqida ikki xil qarash."], ["Kichkina shahzoda", "Antuan de Sent-Ekzyuperi", "Bolalar", "Kattalar uchun ham falsafiy ertak: do‘stlik, sevgi va mas’uliyat haqida."], ["Sariq devni minib", "Xudoyberdi To‘xtaboyev", "Bolalar", "Xudoyberdi To‘xtaboyevning bolalar uchun sarguzasht qissasi."], ["Alisa mo‘jizalar mamlakatida", "Lyuis Kerroll", "Bolalar", "Quyon inidan boshlangan g‘alati sarguzasht haqida ertak."], ["Xamsa", "Alisher Navoiy", "She’riyat", "Alisher Navoiyning beshta dostondan iborat buyuk asari."], ["Ruboiylar", "Umar Xayyom", "She’riyat", "Umar Xayyomning hikmat va tafakkurga to‘la to‘rtliklari."]];
db.prepare('insert or ignore into users(id,name,created,username) values(?,?,?,?)').run(SYS,'V A Y R O',now(),SYS);
db.prepare('update users set name=? where id=?').run('V A Y R O',SYS);
if(!db.prepare('select 1 from books where owner_id=?').get(SYS)){const ins=db.prepare('insert into books(owner_id,title,author,genre,desc,price,copies,available,address) values(?,?,?,?,?,?,?,?,?)');
 SEED.forEach(([t,a,g,d],i)=>{const c=i%3+1;ins.run(SYS,t,a,g,d,2000+(i%4)*500,c,c,'Toshkent, V A Y R O kutubxona punkti')})}
else SEED.forEach(([t,a,g,d])=>db.prepare("update books set desc=? where owner_id=? and title=? and desc like '%asari. Janr:%'").run(d,SYS,t));
const cnt=(sql,...a)=>db.prepare(sql).get(...a).n;
app.get('/api/users/:id',auth,wrap((q,s)=>{const id=q.params.id;
 const u=db.prepare(`select id,name,surname,username,bio,region,created,phone,${AV('')} as avatar_v from users where id=?`).get(id);if(!u)throw E(404,'Foydalanuvchi topilmadi');
 const r=db.prepare('select avg(stars) a,count(*) n from reviews where to_id=?').get(id);
 const p={id,avatar_v:u.avatar_v,name:u.name,surname:u.surname||'',username:u.username||'user'+id.replace(/-/g,'').slice(0,8),bio:u.bio||'',region:u.region||'',created:u.created,rating:r.a?+r.a.toFixed(1):null,reviewCount:r.n};
 p.books=db.prepare(`select ${BC} from books b where b.owner_id=? order by b.id desc`).all(id);
 p.reviews=db.prepare(`select r.stars,r.text,r.at,u.name,u.id uid,${AV('u.')} as avatar_v from reviews r join users u on u.id=r.from_id where r.to_id=? order by r.id desc`).all(id);
 if(id===q.u.id){p.phone=u.phone||'';const done=cnt("select count(*) n from orders where status='returned' and (owner_id=? or renter_id=?)",id,id);
  p.stats={books:p.books.length,lent:cnt("select count(*) n from orders where owner_id=? and status in('rented','returned')",id),borrowed:cnt("select count(*) n from orders where renter_id=? and status in('rented','returned')",id),done,reviews:r.n,rating:p.rating};
  p.xp=done*10+r.n*5+p.books.length*2;p.level=Math.floor(p.xp/50)+1}
 s.json(p)}));
app.put('/api/me/profile',auth,wrap((q,s)=>{const {name,surname,username,bio,region,phone}=q.body;
 if(!name?.trim()||!/^[a-z0-9_]{3,20}$/.test(username||''))throw E(400,'Ism va username kerak (3–20 belgi: a-z, 0-9, _)');
 if(phone&&!/^\+?[\d\s-]{7,15}$/.test(phone))throw E(400,'Telefon noto‘g‘ri');
 if(db.prepare('select 1 from users where username=? and id<>?').get(username,q.u.id))throw E(409,'Bu username band');
 db.prepare('update users set name=?,surname=?,username=?,bio=?,region=?,phone=? where id=?').run(name.trim(),surname||'',username,(bio||'').slice(0,300),region||'',phone||'',q.u.id);s.json({ok:1})}));
app.put('/api/me/avatar',auth,wrap((q,s)=>{const v=q.body.image;
 if(v===null||v==='')db.prepare('update users set avatar=null,avatar_ts=? where id=?').run(Date.now(),q.u.id);
 else db.prepare('update users set avatar=?,avatar_ts=? where id=?').run(imgOk(v,250000),Date.now(),q.u.id);s.json({ok:1})}));
app.get('/api/fav-ids',auth,(q,s)=>s.json(db.prepare('select book_id from favs where user_id=?').all(q.u.id).map(x=>x.book_id)));
app.get('/api/favs',auth,(q,s)=>s.json(db.prepare(`select ${BC} from books b join favs f on f.book_id=b.id where f.user_id=? order by f.rowid desc`).all(q.u.id)));
app.post('/api/favs/:id',auth,(q,s)=>{const r=db.prepare('delete from favs where user_id=? and book_id=?').run(q.u.id,q.params.id);if(!r.changes)db.prepare('insert or ignore into favs values(?,?)').run(q.u.id,q.params.id);s.json({fav:!r.changes})});
const party=q=>{const o=db.prepare('select * from orders where id=? and (owner_id=? or renter_id=?)').get(q.params.id,q.u.id,q.u.id);if(!o)throw E(404,'Buyurtma topilmadi');return o};
app.get('/api/chat/:id',auth,wrap((q,s)=>{party(q);s.json(db.prepare('select m.id,m.text,m.at,m.sender,u.name from msgs m join users u on u.id=m.sender where order_id=? order by m.id').all(q.params.id).map(x=>({...x,mine:x.sender===q.u.id})))}));
app.post('/api/chat/:id',auth,wrap((q,s)=>{const o=party(q),t=(q.body.text||'').trim();if(!t||t.length>500)throw E(400,'Xabar 1–500 belgi');
 db.prepare('insert into msgs(order_id,sender,text,at) values(?,?,?,?)').run(o.id,q.u.id,t,now());s.json({ok:1})}));
app.post('/api/review/:id',auth,wrap((q,s)=>{const o=party(q),st=+q.body.stars;
 if(o.status!=='returned')throw E(400,'Baho ijara tugagach beriladi');if(!Number.isInteger(st)||st<1||st>5)throw E(400,'1–5 yulduz tanlang');
 try{db.prepare('insert into reviews(order_id,from_id,to_id,stars,text,at) values(?,?,?,?,?,?)').run(o.id,q.u.id,o.owner_id===q.u.id?o.renter_id:o.owner_id,st,(q.body.text||'').slice(0,300),now())}catch{throw E(409,'Siz allaqachon baho bergansiz')}s.json({ok:1})}));
app.get('/api/book-of-day',auth,(q,s)=>{const a=db.prepare(`select ${BC},u.name owner_name from books b left join users u on u.id=b.owner_id order by b.id`).all();s.json(a.length?a[Math.floor(Date.now()/864e5)%a.length]:null)});
const pub=path.join(dir,'public');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.ico':'image/x-icon','.png':'image/png'};
const serve=(url,s)=>{let f=path.join(pub,decodeURIComponent(url==='/'?'/index.html':url));
 if(!f.startsWith(pub+path.sep)||!fs.existsSync(f)||fs.statSync(f).isDirectory())f=path.join(pub,'index.html');
 if(!fs.existsSync(f))return s.status(404).json({error:'Topilmadi'});
 s.setHeader('Content-Type',MIME[path.extname(f)]||'application/octet-stream');s.end(fs.readFileSync(f))};
const server=http.createServer(async(q,s)=>{try{
 s.status=c=>{s.statusCode=c;return s};s.json=o=>{s.setHeader('Content-Type','application/json; charset=utf-8');s.end(JSON.stringify(o))};
 const u=new URL(q.url,'http://x');q.query=Object.fromEntries(u.searchParams);
 const ch=[];let n=0;for await(const c of q){n+=c.length;if(n>2e6)return s.status(413).json({error:'Juda katta'});ch.push(c)}
 const raw=Buffer.concat(ch).toString('utf8');q.body={};
 if(raw){try{q.body=JSON.parse(raw)}catch{return s.status(400).json({error:'Noto‘g‘ri so‘rov'})}}
 for(const r of routes){if(r.m!==q.method)continue;const m=u.pathname.match(r.re);if(!m)continue;
  q.params=Object.fromEntries(Object.entries(m.groups||{}).map(([k,v])=>[k,decodeURIComponent(v)]));
  let i=0;const next=()=>{const f=r.h[i++];if(f)f(q,s,next)};return next()}
 if(q.method==='GET'&&!u.pathname.startsWith('/api'))return serve(u.pathname,s);
 s.status(404).json({error:'Topilmadi'})
}catch(e){if(!s.headersSent)s.status(500).json({error:'Server xatosi'});else s.end()}});
const PORT=process.env.PORT||3001;server.listen(PORT,'0.0.0.0',()=>console.log('Server ishga tushdi: http://localhost:'+PORT));
