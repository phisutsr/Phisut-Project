const DB_KEY = 'sakonstay.db.v2';   
const SESSION_KEY = 'sakonstay.session';
const B = n => Number(n||0).toLocaleString('th-TH');
const esc = s => String(s??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = p => p + '-' + Math.random().toString(36).slice(2,8);
const today = () => { const d = new Date(), z = n => String(n).padStart(2,'0'); return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate()); };
const addDays = (d,n) => { const x=new Date(d); x.setDate(x.getDate()+n); return x.toISOString().slice(0,10); };
const nights = (a,b) => Math.max(1, Math.round((new Date(b)-new Date(a))/86400000));
const thDate = s => s ? new Date(s).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'2-digit'}) : '-';

function photo(seed, label){
  let h=0; for(const c of String(seed)) h=(h*31+c.charCodeAt(0))>>>0;
  const hues=[218,196,168,32,248,142], hue=hues[h%hues.length], l2=(h>>3)%14;
  const s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="hsl(${hue},42%,${26+l2}%)"/><stop offset="1" stop-color="hsl(${(hue+26)%360},38%,${52+l2}%)"/></linearGradient>
  <pattern id="p" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
  <rect width="16" height="16" fill="none"/><path d="M0 0h16M0 8h16" stroke="rgba(255,255,255,.13)" stroke-width="2"/></pattern></defs>
  <rect width="400" height="260" fill="url(#g)"/><rect width="400" height="260" fill="url(#p)"/>
  <g fill="rgba(255,255,255,.9)"><path d="M150 168V116l50-32 50 32v52z" opacity=".22"/><path d="M168 168v-30h26v30zM212 132h22v18h-22z" opacity=".5"/></g>
  <text x="200" y="228" text-anchor="middle" font-family="sans-serif" font-size="17" fill="rgba(255,255,255,.95)">${String(label||'').slice(0,26)}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
}

const qrSVG = payload => QR.svg(payload, 'คิวอาร์โค้ดพร้อมเพย์สำหรับชำระเงิน');
const maskPP = id => { const d=String(id||'').replace(/\D/g,''); return d.length>6 ? d.slice(0,3)+'x'.repeat(d.length-6)+d.slice(-3) : d; };

const AMENITIES = ['แอร์','Wi‑Fi ฟรี','ที่จอดรถ','ทีวี','ตู้เย็น','เครื่องทำน้ำอุ่น','อาหารเช้า','สระว่ายน้ำ','ซักรีด','ลิฟต์','กล้องวงจรปิด','ครัวส่วนตัว'];
const DISTRICT = 'เมืองสกลนคร';                                   
const PROP_TYPES = ['โรงแรม','อพาร์ทเม้น','หอพัก','รีสอร์ท'];      

let SEED = null;

async function fetchSeed(){
  const res = await fetch('api/get_data.php', {cache:'no-store'});
  if(!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if(data && data.ok === false) throw new Error(data.error || 'อ่านข้อมูลจากฐานข้อมูลไม่สำเร็จ');
  return data;
}
function seed(){ return JSON.parse(JSON.stringify(SEED)); }

function fillPhotos(db){
  db.properties.forEach(p=>{
    if(!p.photos || !p.photos.length)
      p.photos = [photo(p.id+'a', p.name), photo(p.id+'b','บรรยากาศ'), photo(p.id+'c','ภายในห้องพัก')];
  });
  db.rooms.forEach(r=>{ if(!r.photos || !r.photos.length) r.photos = [photo(r.id, r.type)]; });
  db.bookings.forEach(b=>{ if(b.payStatus!=='unpaid' && !b.slip) b.slip = photo(b.code,'หลักฐานการโอน'); });
  return db;
}

let DB = null, session = null;
function load(){
  DB = seed(); fillPhotos(DB);    
  try{ const s = localStorage.getItem(SESSION_KEY); session = s ? JSON.parse(s) : null; }catch(e){ session = null; }
}
let savePromise = Promise.resolve();
function save(){
  const body = JSON.stringify(DB);
  savePromise = savePromise
    .then(()=>fetch('api/save_data.php', {method:'POST', headers:{'Content-Type':'application/json'}, body}))
    .then(res=>res.json())
    .then(r=>{ if(r && r.ok===false){ console.error('บันทึกฐานข้อมูลไม่สำเร็จ:', r.error); toast('บันทึกลงฐานข้อมูลไม่สำเร็จ: ' + r.error, true); } })
    .catch(err=>{ console.error('เชื่อมต่อ api/save_data.php ไม่สำเร็จ:', err); toast('เชื่อมต่อฐานข้อมูลไม่ได้ ข้อมูลอาจยังไม่ถูกบันทึก', true); });
}
async function refreshData(){
  await savePromise;
  try{ SEED = await fetchSeed(); DB = seed(); fillPhotos(DB); }catch(e){ console.warn('รีเฟรชข้อมูลไม่สำเร็จ ใช้ข้อมูลเดิมในหน้าไปก่อน', e); }
}
function setSession(u){
  session = u ? {id:u.id, role:u.role, name:u.name} : null;
  try{ u ? localStorage.setItem(SESSION_KEY, JSON.stringify(session)) : localStorage.removeItem(SESSION_KEY); }catch(e){}
}
const me = () => session ? DB.users.find(u=>u.id===session.id) : null;

const api = {
  login(username, password, role){
    const u = DB.users.find(x=>x.username===username && x.password===password && x.role===role);
    if(!u) return {ok:false, error:'ชื่อผู้ใช้ รหัสผ่าน หรือประเภทผู้ใช้ไม่ถูกต้อง'};
    setSession(u); return {ok:true, user:u};
  },
  register(d){
    if(DB.users.some(u=>u.username===d.username)) return {ok:false, error:'ชื่อผู้ใช้นี้ถูกใช้แล้ว เลือกชื่ออื่น'};
    const u = {id:uid('U'), ...d}; DB.users.push(u); save(); return {ok:true, user:u};
  },
  properties(f={}){
    let list = DB.properties.filter(p =>
      p.status==='approved' && p.district===DISTRICT && PROP_TYPES.includes(p.type));
    if(f.q){ const q=f.q.toLowerCase(); list = list.filter(p=>(p.name+p.address+p.district+p.type).toLowerCase().includes(q)); }
    if(f.type) list = list.filter(p=>p.type===f.type);
    if(f.max) list = list.filter(p=>minPrice(p.id) <= Number(f.max));
    return list;
  },
  book(d){
    const b = {id:uid('B'), code:'SKN-'+Math.floor(100000+Math.random()*899999), status:'pending', payStatus:'unpaid',
               payMethod:'QR code', slip:null, createdAt:today(), note:'', ...d};
    DB.bookings.push(b); save(); return b;
  }
};
const prop = id => DB.properties.find(p=>p.id===id) || {};
const room = id => DB.rooms.find(r=>r.id===id) || {};
const user = id => DB.users.find(u=>u.id===id) || {};
const roomsOf = pid => DB.rooms.filter(r=>r.propertyId===pid);
const minPrice = pid => { const rs=roomsOf(pid); return rs.length? Math.min(...rs.map(r=>r.price)) : 0; };
const reviewsOf = pid => DB.reviews.filter(v=>v.propertyId===pid);
/* ---- คะแนนดาว: ดาวสูงสุด 5 ดาว คำนวณค่าเฉลี่ยจากทุกรีวิวของที่พัก ---- */
const clampStar = n => Math.min(5, Math.max(1, Math.round(Number(n)||0)));
function ratingStats(pid){
  const vs = reviewsOf(pid), dist = {1:0,2:0,3:0,4:0,5:0};
  vs.forEach(v => { dist[clampStar(v.rating)]++; });
  const sum = vs.reduce((t,v)=>t+clampStar(v.rating), 0);
  return {count: vs.length, avg: vs.length ? sum/vs.length : 0, dist};
}
const ratingOf = pid => ratingStats(pid).avg;
/* ---- จำนวนห้องคงเหลือ: หักเมื่อผู้จองชำระเงินแล้ว (ส่งสลิป/เจ้าของยืนยัน) และคืนห้องเมื่อยกเลิกหรือสลิปไม่ผ่าน ---- */
const ACTIVE_ST = ['pending','confirmed','checkedin'];
const stayDone = b => b.status==='completed' || (b.payStatus==='paid' && ['confirmed','checkedin'].includes(b.status) && b.checkOut <= today());
const canReview = b => !!session && b.userId===session.id && stayDone(b) && !DB.reviews.some(v=>v.bookingId===b.id);
// ห้องที่ผ่านวันเช็กเอาต์แล้วถือว่าคืนเข้าระบบ
const takesRoom = b => ACTIVE_ST.includes(b.status) && ['waiting','paid'].includes(b.payStatus) && b.checkOut > today();
const sumQty = list => list.reduce((s,b)=>s+Number(b.qty||1),0);
const heldUnpaid = rid => sumQty(DB.bookings.filter(b=>b.roomId===rid && ACTIVE_ST.includes(b.status) && b.payStatus==='unpaid'));

/* ---- เช็กห้องว่างตามช่วงวัน: การจองหนึ่งรายการใช้ห้องตั้งแต่คืนเช็กอิน ถึงคืนก่อนวันเช็กเอาต์ [checkIn, checkOut)
        วันเช็กเอาต์ของคนเก่า = วันเช็กอินของคนใหม่ได้ (ไม่นับซ้อน) ---- */
const overlaps = (b, ci, co) => b.checkIn < co && b.checkOut > ci;
// จำนวนห้องที่ถูกใช้มากที่สุดในแต่ละคืนของช่วง ci..co (ไม่นับการจอง excludeId)
function bookedBetween(rid, ci, co, excludeId){
  const list = DB.bookings.filter(b=>b.roomId===rid && b.id!==excludeId && takesRoom(b) && overlaps(b, ci, co));
  if(!list.length) return 0;
  let peak = 0;
  for(let d=ci; d<co; d=addDays(d,1)){
    const used = sumQty(list.filter(b=>b.checkIn<=d && d<b.checkOut));
    if(used>peak) peak = used;
  }
  return peak;
}
// ห้องว่างในช่วงวันที่เลือก
const freeQtyRange = (rid, ci, co, excludeId) => { const r=room(rid); return r.status==='available' ? Math.max(0, Number(r.qty) - bookedBetween(rid, ci, co, excludeId)) : 0; };
// ห้องว่างคืนนี้ (ใช้แสดงในหน้ารายละเอียดที่พัก)
const freeQty = rid => freeQtyRange(rid, today(), addDays(today(),1));
// ตรวจก่อนรับชำระ: ช่วงวันของการจองนี้ยังมีห้องพอหรือไม่
const canHold = b => freeQtyRange(b.roomId, b.checkIn, b.checkOut, b.id) >= Number(b.qty||1);

const ST = {
  pending:['รอยืนยัน','t-wait'], confirmed:['ยืนยันแล้ว','t-ok'], checkedin:['เข้าพักแล้ว','t-info'],
  completed:['เสร็จสิ้น','t-idle'], cancelled:['ยกเลิก','t-no']
};
const PS = {
  unpaid:['ยังไม่ชำระ','t-no'], waiting:['รอตรวจสอบ','t-wait'], paid:['ชำระแล้ว','t-ok'], rejected:['หลักฐานไม่ผ่าน','t-no']
};
const RS = { available:['ว่าง','t-ok'], unavailable:['ไม่ว่าง','t-no'], maintenance:['ปิดปรับปรุง','t-wait'] };
const tag = (map,k) => { const v = map[k]||['-','t-idle']; return `<span class="tag ${v[1]}">${v[0]}</span>`; };
const stars = n => '★★★★★'.slice(0, Math.round(n)) + '☆☆☆☆☆'.slice(0, 5-Math.round(n));
const starBar = n => `<span class="starbar" style="--p:${Math.max(0,Math.min(5,Number(n)||0))/5*100}%" role="img" aria-label="${(Number(n)||0).toFixed(1)} จาก 5 ดาว">★★★★★</span>`;
function ratingSummary(pid){
  const s = ratingStats(pid); if(!s.count) return '';
  return `<div class="ratesum"><div class="big"><div class="num">${s.avg.toFixed(1)}<small>/5</small></div>${starBar(s.avg)}<div class="tiny muted">เฉลี่ยจาก ${s.count} รีวิว</div></div>
    <div class="bars">${[5,4,3,2,1].map(n=>`<div class="barrow"><span class="tiny">${n} ★</span><div class="track"><i style="width:${s.dist[n]/s.count*100}%"></i></div><span class="tiny muted">${s.dist[n]}</span></div>`).join('')}</div></div>`;
}

function toast(msg, bad){
  const el = document.createElement('div');
  el.className = 'toast' + (bad ? ' bad' : ''); el.textContent = msg;
  document.getElementById('toast').appendChild(el);
  setTimeout(()=>el.remove(), 2800);
}

/* =============================== ส่วนแสดงผล =============================== */
const app = () => document.getElementById('app');
const go = h => { location.hash = h; };

function renderNav(){
  const n = document.getElementById('nav'); const r = session?.role;
  const items = [['#/','ค้นหาที่พัก']];
  if(r==='admin') items.push(['#/admin','ผู้ดูแลระบบ']);
  if(r==='owner') items.push(['#/owner','จัดการที่พักของฉัน']);
  if(r==='guest') items.push(['#/bookings','การจองของฉัน']);
  if(session) items.push(['#/profile','ข้อมูลส่วนตัว']);
  const cur = location.hash || '#/';
  n.innerHTML = items.map(([h,t])=>`<a href="${h}" class="${cur===h?'on':''}">${t}</a>`).join('') +
    (session
      ? `<span class="navbtn muted small">${esc(session.name)}</span><button class="btn ghost sm" onclick="logout()">ออกจากระบบ</button>`
      : `<a href="#/login" class="btn sm" style="color:#fff">เข้าสู่ระบบ</a><a href="#/register" class="btn ghost sm">สมัครสมาชิก</a>`);
  document.getElementById('brandName').textContent = DB.site.name;
  document.getElementById('footContact').textContent = 'โทร ' + DB.site.phone + ' · ' + DB.site.email;
}
function logout(){ setSession(null); toast('ออกจากระบบแล้ว'); go('#/'); renderNav(); route(); }

/* ---------------------------- หน้าแรก ---------------------------- */
function viewHome(){
  const s = DB.site, list = api.properties().slice(0,6);
  const news = DB.news.filter(n=>n.active);
  const cls = t => t==='โปรโมชั่น' ? 'pro' : t==='ประกาศ' ? 'ann' : '';
  app().innerHTML = `
  <div class="hero kramweave">
    <div class="wrap">
      <h1>${esc(s.heroTitle)}</h1>
      <form class="searchbox" onsubmit="event.preventDefault();doSearch()">
        <label class="f"><span>ค้นหาที่พักหรือย่าน</span><input id="q" placeholder="เช่น หนองหาร, พระธาตุเชิงชุม, ถ.นิตโย"></label>
        <label class="f"><span>ประเภทที่พัก</span><select id="ptype"><option value="">ทุกประเภท</option>${PROP_TYPES.map(t=>`<option>${t}</option>`).join('')}</select></label>
        <button class="btn" style="height:41px">ค้นหาห้องว่าง</button>
      </form>
    </div>
  </div>

  <section class="block wrap">
    <h2>เลือกตามประเภทที่พัก</h2>
    <div class="row mt" style="gap:10px;flex-wrap:wrap">
      ${PROP_TYPES.map(t=>`<a class="btn ghost sm" href="#/search?q=&t=${encodeURIComponent(t)}&m=">${t} (${api.properties({type:t}).length})</a>`).join('')}
    </div>

    <div class="spread mt2"><h2>ที่พักแนะนำในเขตอำเภอเมืองสกลนคร</h2><a href="#/search">ดูทั้งหมด</a></div>
    <div class="cards mt">${list.map(cardHTML).join('')}</div>
  </section>

  <section class="block wrap" style="padding-top:0">
    <h2>ข่าวสาร โปรโมชั่น และประกาศ</h2>
    <div class="newsrow mt">${news.map(n=>`
      <article class="news ${cls(n.type)}">
        <div class="tiny muted">${esc(n.type)} · ${thDate(n.date)}</div>
        <h3 style="margin:4px 0 6px">${esc(n.title)}</h3>
        <p class="small muted" style="margin:0">${esc(n.body)}</p>
      </article>`).join('') || '<div class="empty">ยังไม่มีประกาศ</div>'}
    </div>
  </section>`;
}
function cardHTML(p){
  const rt = ratingOf(p.id), n = reviewsOf(p.id).length;
  return `<article class="pcard">
    <a href="#/property/${p.id}"><img class="thumb" src="${p.photos[0]}" alt="${esc(p.name)}"></a>
    <div class="body">
      <div class="tiny muted">${esc(p.type)} · อ.${esc(p.district)}</div>
      <h3><a href="#/property/${p.id}" style="color:inherit">${esc(p.name)}</a></h3>
      <div class="small muted">${rt ? `${starBar(rt)} <b>${rt.toFixed(1)}</b>/5 (${n} รีวิว)` : 'ยังไม่มีรีวิว'}</div>
      <div class="foot">
        <div class="price">฿${B(minPrice(p.id))} <small>/คืน</small></div>
        <a class="btn sm ghost" href="#/property/${p.id}">ดูห้องพัก</a>
      </div>
    </div></article>`;
}
function doSearch(){
  const q = document.getElementById('q').value.trim();
  const t = document.getElementById('ptype').value;
  const maxEl = document.getElementById('max');
  const m = maxEl ? maxEl.value : '';
  go(`#/search?q=${encodeURIComponent(q)}&t=${encodeURIComponent(t)}&m=${m}`);
}

/* ---------------------------- ผลการค้นหา ---------------------------- */
function viewSearch(qs){
  const f = {q:qs.get('q')||'', type:qs.get('t')||'', max:qs.get('m')||''};
  const list = api.properties(f);
  app().innerHTML = `<section class="block wrap">
    <h2>ผลการค้นหาที่พัก ในเขตอำเภอ${DISTRICT}</h2>
    <div class="panel mt" style="padding:14px">
      <div class="grid3">
        <label class="f"><span>คำค้น</span><input id="q" value="${esc(f.q)}"></label>
        <label class="f"><span>ประเภทที่พัก</span><select id="ptype"><option value="">ทุกประเภท</option>${PROP_TYPES.map(t=>`<option ${t===f.type?'selected':''}>${t}</option>`).join('')}</select></label>
        <label class="f"><span>ราคาไม่เกิน</span><input id="max" type="number" value="${esc(f.max)}" placeholder="ไม่จำกัด"></label>
      </div>
      <button class="btn" onclick="doSearch()">ค้นหาอีกครั้ง</button>
    </div>
    <p class="muted small mt">พบ ${list.length} ที่พัก</p>
    <div class="cards">${list.map(cardHTML).join('') || '<div class="empty">ไม่พบที่พักตามเงื่อนไข ลองลดตัวกรองลง</div>'}</div>
  </section>`;
}

/* ---------------------------- รายละเอียดที่พัก ---------------------------- */
function viewProperty(id){
  const p = prop(id); if(!p.id) return notFound();
  const rs = roomsOf(id), vs = reviewsOf(id), rt = ratingOf(id);
  app().innerHTML = `<section class="block wrap">
    <div class="tiny muted"><a href="#/search">ที่พักทั้งหมด</a> / ${esc(p.district)}</div>
    <div class="spread" style="margin:6px 0 14px">
      <div>
        <h1 style="font-size:1.7rem;margin-bottom:2px">${esc(p.name)}</h1>
        <div class="muted small">${esc(p.type)} · ${rt?`${starBar(rt)} <b>${rt.toFixed(1)}</b>/5 จาก ${vs.length} รีวิว`:'ที่พักใหม่'}</div>
      </div>
      <div class="price">เริ่มต้น ฿${B(minPrice(id))} <small>/คืน</small></div>
    </div>
    <div class="gallery">${p.photos.map((s,i)=>`<img src="${s}" alt="ภาพที่พัก ${i+1}">`).join('')}</div>

    <div class="split mt2">
      <div>
        <div class="sheet"><div class="sheet-h"><h3>เกี่ยวกับที่พัก</h3></div>
          <div class="sheet-b">
            <p style="margin-top:0">${esc(p.desc)}</p>
            <h4 style="margin:18px 0 8px">สิ่งอำนวยความสะดวก</h4>
            <ul class="amen">${p.amenities.map(a=>`<li>${esc(a)}</li>`).join('')}</ul>
          </div>
        </div>

        <div class="sheet mt"><div class="sheet-h"><h3>ห้องพักและราคา</h3><span class="tiny muted">ราคาต่อคืน · ชำระเต็มจำนวน</span></div>
          <div class="sheet-b" style="padding-top:2px">
            ${rs.map(r=>`
            <div class="roomrow">
              <img src="${r.photos[0]}" alt="${esc(r.type)}">
              <div class="info">
                <div style="font-weight:600">${esc(r.type)} ${tag(RS,r.status)}</div>
                <div class="small muted">${esc(r.beds)} · พักได้ ${r.capacity} ท่าน · ${r.size} ตร.ม.</div>
                <div class="tiny muted">${r.amenities.join(' · ')}</div>
              </div>
              <div style="text-align:right">
                <div class="price">฿${B(r.price)}</div>
                <div class="tiny muted" style="margin-bottom:6px">ว่างคืนนี้ <b>${freeQty(r.id)}</b> / ${r.qty} ห้อง${heldUnpaid(r.id)?` · รอชำระ ${heldUnpaid(r.id)}`:''}</div>
                ${r.status==='available'
                  ? `<a class="btn sm" href="#/book/${r.id}">${freeQty(r.id)>0?'จองห้องนี้':'ดูวันว่าง / จอง'}</a>`
                  : `<button class="btn sm" disabled>ไม่เปิดจอง</button>`}
              </div>
            </div>`).join('') || '<div class="empty">ยังไม่ได้เพิ่มห้องพัก</div>'}
          </div>
        </div>

        <div class="sheet mt"><div class="sheet-h"><h3>รีวิวจากผู้เข้าพัก</h3></div>
          <div class="sheet-b">
            ${ratingSummary(id)}
            ${vs.map(v=>`<div style="border-bottom:1px solid var(--line);padding:10px 0">
              <div class="small"><b>${esc(user(v.userId).name||'ผู้เข้าพัก')}</b> ${starBar(clampStar(v.rating))} <span class="tiny muted">${thDate(v.date)}</span></div>
              <div class="small muted">${esc(v.comment)}</div></div>`).join('') || '<div class="empty">ยังไม่มีรีวิวสำหรับที่พักนี้</div>'}
          </div>
        </div>
      </div>

      <aside>
        <div class="sheet"><div class="sheet-h"><h3>ติดต่อเจ้าของที่พัก</h3></div>
          <div class="sheet-b">
            <p class="small" style="margin:0 0 4px"><b>ชื่อผู้ดูแล</b><br>${esc(user(p.ownerId).name||'-')}</p>
            <p class="small" style="margin:10px 0 4px"><b>เบอร์โทร</b><br><a href="tel:${esc(p.phone)}">${esc(p.phone)}</a></p>
            <p class="small" style="margin:10px 0 4px"><b>ที่อยู่</b><br>${esc(p.address)}</p>
            <div class="note mt">ชำระเงินผ่าน QR code เต็มจำนวนหลังทำรายการจอง แล้วอัปโหลดหลักฐานให้เจ้าของที่พักตรวจสอบ</div>
          </div>
        </div>
      </aside>
    </div>
  </section>`;
}

/* ---------------------------- ทำรายการจอง ---------------------------- */
function viewBook(rid){
  const r = room(rid); if(!r.id) return notFound();
  const p = prop(r.propertyId);
  if(!session || session.role!=='guest')
    return app().innerHTML = `<section class="block wrap"><div class="panel center">
      <h2>เข้าสู่ระบบก่อนทำรายการจอง</h2>
      <p class="muted">ใช้บัญชีสมาชิกผู้จองเพื่อจองห้องพักและติดตามสถานะ</p>
      <a class="btn" href="#/login">เข้าสู่ระบบ</a> <a class="btn ghost" href="#/register">สมัครสมาชิก</a></div></section>`;
  app().innerHTML = `<section class="block wrap" style="max-width:760px">
    <h2>ทำรายการจอง</h2>
    <div class="sheet mt">
      <div class="sheet-h"><h3>${esc(p.name)} — ${esc(r.type)}</h3><span class="tiny muted" id="avail"></span></div>
      <div class="sheet-b">
        <div class="grid2">
          <label class="f"><span>วันเช็กอิน</span><input type="date" id="ci" value="${today()}" min="${today()}" onchange="calcTotal('${rid}')"></label>
          <label class="f"><span>วันเช็กเอาต์</span><input type="date" id="co" value="${addDays(today(),1)}" min="${addDays(today(),1)}" onchange="calcTotal('${rid}')"></label>
        </div>
        <div class="grid2">
          <label class="f"><span>จำนวนห้อง</span><input type="number" id="qty" value="1" min="1" onchange="calcTotal('${rid}')"></label>
          <label class="f"><span>เบอร์โทรติดต่อกลับ</span><input id="tel" value="${esc(me().phone||'')}"></label>
        </div>
        <label class="f"><span>ข้อความถึงเจ้าของที่พัก (ถ้ามี)</span><textarea id="note" placeholder="เช่น เข้าพักดึก ขอที่จอดรถ"></textarea></label>
        <div class="note" id="sum"></div>
        <button class="btn mt" onclick="submitBooking('${rid}')">ยืนยันการจองและไปหน้าชำระเงิน</button>
      </div>
    </div>
  </section>`;
  calcTotal(rid);
}
function calcTotal(rid){
  const ciEl = document.getElementById('ci'), coEl = document.getElementById('co');
  if(ciEl.value){ coEl.min = addDays(ciEl.value,1); if(!coEl.value || coEl.value <= ciEl.value) coEl.value = addDays(ciEl.value,1); }
  const r = room(rid), ci = ciEl.value, co = coEl.value;
  const q = Number(document.getElementById('qty').value||1), n = nights(ci,co);
  const av = document.getElementById('avail');
  if(av){
    if(co > ci){ const f = freeQtyRange(rid, ci, co); av.innerHTML = f>0 ? `ช่วงวันที่เลือกว่าง <b>${f}</b> ห้อง` : '<b style="color:var(--bad,#b42318)">ช่วงวันที่เลือกเต็ม กรุณาเลือกวันอื่น</b>';
      document.getElementById('qty').max = Math.max(1,f); }
    else av.textContent = '';
  }
  document.getElementById('sum').innerHTML =
    `฿${B(r.price)} × ${n} คืน × ${q} ห้อง = <b style="color:var(--ink);font-size:1.1rem">฿${B(r.price*n*q)}</b><br>
     <span class="tiny">ระบบรับชำระแบบเต็มจำนวนเท่านั้น · จำนวนห้องว่างจะถูกหักเมื่อชำระเงินแล้ว</span>`;
}
function submitBooking(rid){
  const r = room(rid), ci = document.getElementById('ci').value, co = document.getElementById('co').value;
  const q = Number(document.getElementById('qty').value||1);
  if(new Date(co) <= new Date(ci)) return toast('วันเช็กเอาต์ต้องหลังวันเช็กอิน', true);
  const free = freeQtyRange(rid, ci, co);
  if(free < 1) return toast('ช่วงวันที่เลือกห้องเต็มแล้ว กรุณาเลือกวันอื่น', true);
  if(q > free) return toast('ช่วงวันที่เลือกเหลือห้องว่างเพียง ' + free + ' ห้อง', true);
  const b = api.book({userId:session.id, propertyId:r.propertyId, roomId:rid, checkIn:ci, checkOut:co, qty:q,
    total:r.price*nights(ci,co)*q, note:document.getElementById('note').value});
  const tel = document.getElementById('tel').value; const u = me(); if(tel){ u.phone = tel; save(); }
  toast('สร้างรายการจอง ' + b.code + ' แล้ว');
  go('#/pay/' + b.id);
}

/* ---------------------------- ชำระเงิน ---------------------------- */
function viewPay(bid){
  const b = DB.bookings.find(x=>x.id===bid); if(!b) return notFound();
  const p = prop(b.propertyId), r = room(b.roomId);
  const payload = QR.promptPayPayload(p.promptpay, b.total);   // null ถ้าเจ้าของยังไม่ได้ตั้งพร้อมเพย์
  app().innerHTML = `<section class="block wrap" style="max-width:860px">
    <h2>ชำระเงิน</h2>
    <p class="muted small">รหัสการจอง ${b.code} · ${esc(p.name)} · ${esc(r.type)}</p>
    <div class="split mt">
      <div class="sheet">
        <div class="sheet-h"><h3>สถานะการชำระเงิน</h3>${tag(PS,b.payStatus)}</div>
        <div class="sheet-b">
          <table style="min-width:0"><tbody>
            <tr><td class="muted">เข้าพัก</td><td style="text-align:right">${thDate(b.checkIn)} – ${thDate(b.checkOut)} (${nights(b.checkIn,b.checkOut)} คืน)</td></tr>
            <tr><td class="muted">จำนวนห้อง</td><td style="text-align:right">${b.qty} ห้อง</td></tr>
            <tr><td class="muted">ช่องทาง</td><td style="text-align:right">QR code (พร้อมเพย์)</td></tr>
            <tr><td class="muted">ยอดที่ต้องชำระ</td><td style="text-align:right"><b class="price">฿${B(b.total)}</b></td></tr>
          </tbody></table>
          <div class="note mt">ระบบกำหนดให้ชำระเต็มจำนวนครั้งเดียว เปิดแอปธนาคารสแกน QR แล้วอัปโหลดสลิปเพื่อให้เจ้าของที่พักตรวจสอบ เมื่อส่งสลิปแล้วห้องจะถูกหักออกจากจำนวนห้องว่างทันที</div>
          ${b.payStatus==='paid' ? '<p class="mt" style="color:var(--han)">เจ้าของที่พักยืนยันการชำระเงินเรียบร้อยแล้ว</p>' : !payload && b.payStatus==='unpaid' ? '<p class="mt" style="color:var(--bad,#b42318)">เจ้าของที่พักยังไม่ได้ตั้งค่าพร้อมเพย์ จึงยังชำระเงินผ่านระบบไม่ได้ กรุณาติดต่อที่พักโดยตรง</p>' : `
          <label class="f mt"><span>อัปโหลดหลักฐานการโอน</span><input type="file" accept="image/*" id="slip"></label>
          <button class="btn" onclick="uploadSlip('${b.id}')">ส่งหลักฐานการชำระเงิน</button>`}
          ${b.slip ? `<div class="mt"><div class="tiny muted">หลักฐานที่ส่งแล้ว</div><img class="slip" src="${b.slip}" alt="หลักฐานการชำระเงิน"></div>` : ''}
          <div class="mt"><a href="#/bookings">ไปที่รายการจองของฉัน</a></div>
        </div>
      </div>
      <div class="qrbox">
        ${payload ? `
        <div class="pp">พร้อมเพย์ · ${esc(p.name)}</div>
        <div class="qrimg">${qrSVG(payload)}</div>
        <div class="small mt">สแกนเพื่อโอน <b>฿${B(b.total)}</b></div>
        <div class="tiny muted">บัญชีพร้อมเพย์ ${esc(maskPP(p.promptpay))} · อ้างอิง ${b.code}</div>`
        : `<div class="pp">พร้อมเพย์ · ${esc(p.name)}</div><div class="small muted mt">ยังไม่มี QR เพราะเจ้าของที่พักยังไม่ได้ตั้งค่าเลขพร้อมเพย์</div>`}
      </div>
    </div>
  </section>`;
}
function readSlip(file){   // ย่อรูปสลิปให้เล็กลงก่อนเก็บลงฐานข้อมูล
  return new Promise((resolve,reject)=>{
    const rd = new FileReader(); rd.onerror = () => reject(new Error('อ่านไฟล์ไม่ได้'));
    rd.onload = () => { const img = new Image(); img.onerror = () => reject(new Error('ไฟล์นี้ไม่ใช่รูปภาพ'));
      img.onload = () => { const k = Math.min(1, 1000/Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width*k); c.height = Math.round(img.height*k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); resolve(c.toDataURL('image/jpeg', .72)); };
      img.src = rd.result; };
    rd.readAsDataURL(file);
  });
}
async function uploadSlip(bid){
  const b = DB.bookings.find(x=>x.id===bid);
  const f = document.getElementById('slip').files[0];
  if(!f) return toast('กรุณาเลือกไฟล์รูปสลิปการโอนก่อน', true);
  if(!/^image\//.test(f.type)) return toast('ไฟล์สลิปต้องเป็นรูปภาพเท่านั้น', true);
  await refreshData();                                   // เช็กจำนวนห้องล่าสุดก่อนหักห้อง
  const cur = DB.bookings.find(x=>x.id===bid);
  if(!cur || cur.status==='cancelled') return toast('การจองนี้ถูกยกเลิกแล้ว', true);
  if(!canHold(cur)){ toast('ขออภัย ห้องประเภทนี้เต็มแล้ว จึงยังชำระเงินไม่ได้ กรุณายกเลิกและเลือกห้องอื่น', true); return route(); }
  try{ cur.slip = await readSlip(f); }catch(e){ return toast(e.message, true); }
  cur.payStatus = 'waiting'; save();
  toast('ส่งหลักฐานแล้ว หักห้องออกจากจำนวนห้องว่างเรียบร้อย รอเจ้าของที่พักตรวจสอบ'); route();
}

/* ---------------------------- การจองของฉัน ---------------------------- */
function viewBookings(){
  if(!session || session.role!=='guest') return needLogin('guest');
  const all = DB.bookings.filter(b=>b.userId===session.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const active = all.filter(b=>['pending','confirmed','checkedin'].includes(b.status) && !stayDone(b));
  const hist = all.filter(b=>['completed','cancelled'].includes(b.status) || stayDone(b));
  const rowsOf = list => list.map(b=>{
    const p = prop(b.propertyId), r = room(b.roomId);
    const reviewed = DB.reviews.some(v=>v.bookingId===b.id);
    return `<tr>
      <td><b>${b.code}</b><div class="tiny muted">${esc(p.name)} · ${esc(r.type)}</div></td>
      <td>${thDate(b.checkIn)} – ${thDate(b.checkOut)}<div class="tiny muted">${b.qty} ห้อง</div></td>
      <td>฿${B(b.total)}<div class="tiny">${tag(PS,b.payStatus)}</div></td>
      <td>${tag(ST,b.status)}</td>
      <td style="text-align:right;white-space:nowrap">
        ${b.payStatus!=='paid' && b.status!=='cancelled' ? `<a class="btn sm" href="#/pay/${b.id}">ชำระเงิน</a> ` : ''}
        ${['pending','confirmed'].includes(b.status) ? `<button class="btn sm danger" onclick="cancelBooking('${b.id}')">ยกเลิก</button> ` : ''}
        ${canReview(b) ? `<button class="btn sm warn" onclick="openReview('${b.id}')">★ รีวิวที่พัก</button>` : ''}
        ${reviewed ? `<span class="tiny muted">รีวิวแล้ว ${starBar(clampStar(DB.reviews.find(v=>v.bookingId===b.id).rating))}</span>` : ''}
        ${!reviewed && !stayDone(b) && b.payStatus==='paid' && b.status!=='cancelled' ? `<span class="tiny muted">รีวิวได้หลังเข้าพักเสร็จ (${thDate(b.checkOut)})</span>` : ''}
      </td></tr>`;}).join('');
  app().innerHTML = `<section class="block wrap">
    <h2>การจองของฉัน</h2>
    <div class="sheet mt"><div class="sheet-h"><h3>รายการที่กำลังติดตาม</h3><span class="tiny muted">${active.length} รายการ</span></div>
      <div class="sheet-b" style="padding:0">
        ${active.length ? `<div class="tablewrap"><table><thead><tr><th>รหัส/ที่พัก</th><th>วันเข้าพัก</th><th>ยอดชำระ</th><th>สถานะ</th><th></th></tr></thead><tbody>${rowsOf(active)}</tbody></table></div>`
        : '<div class="empty" style="margin:18px">ยังไม่มีการจองที่กำลังดำเนินการ เริ่มจาก <a href="#/search">ค้นหาที่พัก</a></div>'}
      </div></div>
    <div class="sheet mt"><div class="sheet-h"><h3>ประวัติการจอง</h3></div>
      <div class="sheet-b" style="padding:0">
        ${hist.length ? `<div class="tablewrap"><table><thead><tr><th>รหัส/ที่พัก</th><th>วันเข้าพัก</th><th>ยอดชำระ</th><th>สถานะ</th><th></th></tr></thead><tbody>${rowsOf(hist)}</tbody></table></div>`
        : '<div class="empty" style="margin:18px">ยังไม่มีประวัติการเข้าพัก</div>'}
      </div></div>
    <div id="reviewSlot"></div>
  </section>`;
}
function cancelBooking(bid){
  const b = DB.bookings.find(x=>x.id===bid);
  if(!confirm('ยืนยันยกเลิกการจอง ' + b.code + ' ?')) return;
  b.status = 'cancelled'; save(); toast('ยกเลิกการจองแล้ว'); route();
}
let rateVal = 0;
function setRate(n){
  rateVal = n;
  document.querySelectorAll('#ratepick button').forEach(x=>x.classList.toggle('on', Number(x.dataset.n)<=n));
  document.getElementById('ratetxt').textContent = n + ' จาก 5 ดาว';
}
function openReview(bid){
  const b = DB.bookings.find(x=>x.id===bid), p = prop(b.propertyId); rateVal = 0;
  document.getElementById('reviewSlot').innerHTML = `<div class="sheet mt">
    <div class="sheet-h"><h3>รีวิว ${esc(p.name)}</h3></div>
    <div class="sheet-b">
      <div class="f"><span>ให้คะแนน (สูงสุด 5 ดาว)</span>
        <div class="ratepick" id="ratepick">${[1,2,3,4,5].map(n=>`<button type="button" data-n="${n}" onclick="setRate(${n})" aria-label="${n} ดาว">★</button>`).join('')}
          <span id="ratetxt" class="small muted">แตะดาวเพื่อเลือกคะแนน</span></div></div>
      <label class="f"><span>ความคิดเห็น</span><textarea id="cmt" placeholder="เล่าประสบการณ์เข้าพักให้คนอื่นฟัง"></textarea></label>
      <button class="btn" onclick="sendReview('${bid}')">ส่งรีวิว</button>
    </div></div>`;
  document.getElementById('reviewSlot').scrollIntoView({behavior:'smooth'});
}
function sendReview(bid){
  const b = DB.bookings.find(x=>x.id===bid);
  const cmt = (document.getElementById('cmt')?.value || '').trim();
  if(!b || !session || b.userId!==session.id || !stayDone(b)) return toast('รีวิวได้หลังเข้าพักเสร็จสิ้นแล้วเท่านั้น', true);
  if(DB.reviews.some(v=>v.bookingId===bid)) return toast('คุณรีวิวการจองนี้ไปแล้ว', true);
  if(!Number.isInteger(rateVal) || rateVal<1 || rateVal>5) return toast('กรุณาเลือกจำนวนดาว 1–5 ดาว', true);
  if(!cmt) return toast('กรอกความคิดเห็นก่อนส่งรีวิว', true);
  DB.reviews.push({id:uid('V'), bookingId:bid, propertyId:b.propertyId, userId:session.id, rating:rateVal, comment:cmt, date:today()});
  const st = ratingStats(b.propertyId);
  save(); toast('ขอบคุณสำหรับรีวิว ที่พักนี้ได้คะแนนเฉลี่ย ' + st.avg.toFixed(1) + '/5 จาก ' + st.count + ' รีวิว'); route();
}

/* ---------------------------- ข้อมูลส่วนตัว ---------------------------- */
function viewProfile(){
  if(!session) return needLogin();
  const u = me();
  const roleTxt = {admin:'ผู้ดูแลระบบ', owner:'สมาชิก (เจ้าของที่พัก)', guest:'สมาชิก (ผู้จอง)'}[u.role];
  app().innerHTML = `<section class="block wrap" style="max-width:640px">
    <h2>แก้ไขข้อมูลส่วนตัว</h2>
    <p class="muted small">สิทธิ์การใช้งาน: ${roleTxt}</p>
    <div class="panel mt">
      <div class="grid2">
        <label class="f"><span>ชื่อ-สกุล</span><input id="pf_name" value="${esc(u.name)}"></label>
        <label class="f"><span>เบอร์โทร</span><input id="pf_phone" value="${esc(u.phone||'')}"></label>
      </div>
      <div class="grid2">
        <label class="f"><span>อีเมล</span><input id="pf_email" type="email" value="${esc(u.email||'')}"></label>
        <label class="f"><span>ชื่อผู้ใช้</span><input value="${esc(u.username)}" disabled></label>
      </div>
      <label class="f"><span>ที่อยู่</span><input id="pf_addr" value="${esc(u.address||'')}"></label>
      <label class="f"><span>ตั้งรหัสผ่านใหม่ (เว้นว่างหากไม่เปลี่ยน)</span><input id="pf_pass" type="password" placeholder="••••••"></label>
      <button class="btn" onclick="saveProfile()">บันทึกข้อมูล</button>
    </div>
  </section>`;
}
function saveProfile(){
  const u = me();
  u.name = document.getElementById('pf_name').value.trim() || u.name;
  u.phone = document.getElementById('pf_phone').value.trim();
  u.email = document.getElementById('pf_email').value.trim();
  u.address = document.getElementById('pf_addr').value.trim();
  const np = document.getElementById('pf_pass').value; if(np) u.password = np;
  setSession(u); save(); renderNav(); toast('บันทึกข้อมูลส่วนตัวแล้ว');
}

/* ---------------------------- เข้าสู่ระบบ / สมัคร / ลืมรหัสผ่าน ---------------------------- */
let loginRole = 'guest';
function viewLogin(){
  app().innerHTML = `<div class="wrap"><div class="authwrap">
    <div class="sheet"><div class="sheet-h"><h3>เข้าสู่ระบบ</h3></div><div class="sheet-b">
      <div class="rolepick" id="rp">
        <button data-r="guest">ผู้จอง</button><button data-r="owner">เจ้าของที่พัก</button><button data-r="admin">ผู้ดูแลระบบ</button>
      </div>
      <label class="f"><span>ชื่อผู้ใช้</span><input id="lg_u" autocomplete="username"></label>
      <label class="f"><span>รหัสผ่าน</span><input id="lg_p" type="password" autocomplete="current-password"></label>
      <button class="btn" style="width:100%" onclick="doLogin()">เข้าสู่ระบบ</button>
      <div class="spread mt"><a href="#/forgot">ลืมรหัสผ่าน</a><a href="#/register">สมัครสมาชิก</a></div>
      <div class="note mt tiny">บัญชีทดสอบ · ผู้จอง user/1234 · เจ้าของที่พัก owner/1234 · ผู้ดูแลระบบ admin/1234</div>
    </div></div>
  </div></div>`;
  const rp = document.getElementById('rp');
  rp.querySelectorAll('button').forEach(b=>{
    if(b.dataset.r===loginRole) b.classList.add('on');
    b.onclick = () => { loginRole = b.dataset.r; rp.querySelectorAll('button').forEach(x=>x.classList.toggle('on', x===b)); };
  });
  document.getElementById('lg_p').addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });
}
function doLogin(){
  const r = api.login(document.getElementById('lg_u').value.trim(), document.getElementById('lg_p').value, loginRole);
  if(!r.ok) return toast(r.error, true);
  toast('ยินดีต้อนรับ ' + r.user.name);
  renderNav();
  go(r.user.role==='admin' ? '#/admin' : r.user.role==='owner' ? '#/owner' : '#/');
}
function viewRegister(){
  app().innerHTML = `<div class="wrap"><div class="authwrap">
    <div class="sheet"><div class="sheet-h"><h3>สมัครสมาชิก</h3></div><div class="sheet-b">
      <label class="f"><span>สมัครในฐานะ</span><select id="rg_role"><option value="guest">ผู้จองที่พัก</option><option value="owner">เจ้าของที่พัก</option></select></label>
      <div class="grid2">
        <label class="f"><span>ชื่อ-สกุล</span><input id="rg_name"></label>
        <label class="f"><span>เบอร์โทร</span><input id="rg_phone"></label>
      </div>
      <label class="f"><span>อีเมล</span><input id="rg_email" type="email"></label>
      <label class="f"><span>ที่อยู่</span><input id="rg_addr"></label>
      <div class="grid2">
        <label class="f"><span>ชื่อผู้ใช้</span><input id="rg_user"></label>
        <label class="f"><span>รหัสผ่าน</span><input id="rg_pass" type="password"></label>
      </div>
      <button class="btn" style="width:100%" onclick="doRegister()">สมัครสมาชิก</button>
      <div class="mt center small">มีบัญชีแล้ว? <a href="#/login">เข้าสู่ระบบ</a></div>
    </div></div>
  </div></div>`;
}
function doRegister(){
  const v = id => document.getElementById(id).value.trim();
  if(!v('rg_name')||!v('rg_user')||!v('rg_pass')||!v('rg_email')) return toast('กรอกชื่อ อีเมล ชื่อผู้ใช้ และรหัสผ่านให้ครบ', true);
  const r = api.register({role:v('rg_role'), name:v('rg_name'), phone:v('rg_phone'), email:v('rg_email'),
    address:v('rg_addr'), username:v('rg_user'), password:v('rg_pass')});
  if(!r.ok) return toast(r.error, true);
  setSession(r.user); renderNav(); toast('สมัครสมาชิกสำเร็จ');
  go(r.user.role==='owner' ? '#/owner' : '#/');
}
function viewForgot(){
  app().innerHTML = `<div class="wrap"><div class="authwrap">
    <div class="sheet"><div class="sheet-h"><h3>ลืมรหัสผ่าน</h3></div><div class="sheet-b">
      <p class="small muted" style="margin-top:0">กรอกอีเมลที่ใช้สมัคร เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้ทางอีเมล (ลิงก์ใช้ได้ 30 นาที)</p>
      <label class="f"><span>อีเมล</span><input id="fg_email" type="email" autocomplete="email"></label>
      <button class="btn" id="fg_btn" style="width:100%" onclick="sendReset()">ส่งลิงก์ตั้งรหัสผ่านใหม่</button>
      <div id="fg_step" class="mt"></div>
      <div class="mt center small"><a href="#/login">กลับไปเข้าสู่ระบบ</a></div>
    </div></div>
  </div></div>`;
  document.getElementById('fg_email').addEventListener('keydown', e=>{ if(e.key==='Enter') sendReset(); });
}
async function sendReset(){
  const email = document.getElementById('fg_email').value.trim();
  const btn = document.getElementById('fg_btn');
  if(!email) return toast('กรุณากรอกอีเมล', true);
  btn.disabled = true; btn.textContent = 'กำลังส่ง...';
  try{
    const res = await fetch('api/forgot.php', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email})});
    const r = await res.json();
    if(!r.ok){ toast(r.error || 'ส่งคำขอไม่สำเร็จ', true); btn.disabled = false; btn.textContent = 'ส่งลิงก์ตั้งรหัสผ่านใหม่'; return; }
    if(r.debug) console.warn('[MAIL_DEBUG] ส่งอีเมลไม่สำเร็จ:', r.debug);
    document.getElementById('fg_step').innerHTML = `<div class="note">หากอีเมล <b>${esc(email)}</b> มีในระบบ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปให้แล้ว
      กรุณาตรวจกล่องจดหมาย (รวมถึงอีเมลขยะ) ลิงก์ใช้ได้ภายใน 30 นาที</div>`;
    btn.textContent = 'ส่งแล้ว';
  }catch(e){
    toast('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่', true);
    btn.disabled = false; btn.textContent = 'ส่งลิงก์ตั้งรหัสผ่านใหม่';
  }
}
/* หน้าที่เปิดจากลิงก์ในอีเมล: #/reset?token=... */
let resetToken = '';
async function viewReset(qs){
  resetToken = (qs.get('token') || '').trim();
  app().innerHTML = `<div class="wrap"><div class="authwrap"><div class="sheet"><div class="sheet-h"><h3>ตั้งรหัสผ่านใหม่</h3></div>
    <div class="sheet-b" id="rs_body"><p class="small muted" style="margin:0">กำลังตรวจสอบลิงก์...</p></div></div></div></div>`;
  const body = document.getElementById('rs_body');
  const bad = msg => { body.innerHTML = `<div class="note">${esc(msg)}</div>
      <div class="mt"><a class="btn" href="#/forgot">ขอลิงก์ใหม่</a></div>`; };
  if(!/^[a-f0-9]{64}$/.test(resetToken)) return bad('ลิงก์ไม่ถูกต้อง กรุณาขอลิงก์ใหม่');
  try{
    const res = await fetch('api/reset.php?token=' + encodeURIComponent(resetToken), {cache:'no-store'});
    const r = await res.json();
    if(!r.ok) return bad(r.error || 'ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว');
  }catch(e){ return bad('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่'); }
  body.innerHTML = `
    <label class="f"><span>รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)</span><input id="rs_p1" type="password" autocomplete="new-password"></label>
    <label class="f"><span>ยืนยันรหัสผ่านใหม่</span><input id="rs_p2" type="password" autocomplete="new-password"></label>
    <button class="btn" id="rs_btn" style="width:100%" onclick="confirmReset()">บันทึกรหัสผ่านใหม่</button>`;
  document.getElementById('rs_p2').addEventListener('keydown', e=>{ if(e.key==='Enter') confirmReset(); });
}
async function confirmReset(){
  const p1 = document.getElementById('rs_p1').value, p2 = document.getElementById('rs_p2').value;
  const btn = document.getElementById('rs_btn');
  if(p1.length < 6) return toast('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', true);
  if(p1 !== p2) return toast('รหัสผ่านทั้งสองช่องไม่ตรงกัน', true);
  btn.disabled = true;
  try{
    const res = await fetch('api/reset.php', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({token:resetToken, password:p1})});
    const r = await res.json();
    if(!r.ok){
      toast(r.error || 'ตั้งรหัสผ่านไม่สำเร็จ', true);
      if(/ลิงก์/.test(r.error||'')) return viewReset(new URLSearchParams({token:resetToken}));
      btn.disabled = false; return;
    }
    resetToken = '';
    await refreshData();                       // โหลดรหัสผ่านใหม่จากฐานข้อมูลก่อน ไม่งั้นล็อกอินด้วยรหัสใหม่ไม่ผ่าน
    toast('ตั้งรหัสผ่านใหม่แล้ว เข้าสู่ระบบได้ทันที'); go('#/login');
  }catch(e){ toast('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่', true); btn.disabled = false; }
}

/* ============================ เจ้าของที่พัก ============================ */
let ownerTab = 'props';
let propPhotoDraft = [];   // รูปภาพที่พักที่กำลังแก้ไข (ลบทีละรูปได้ก่อนบันทึกจริง)
let roomPhotoDraft = [];   // รูปภาพห้องพักที่กำลังแก้ไข (ลบทีละรูปได้ก่อนบันทึกจริง)
function viewOwner(){
  if(!session || session.role!=='owner') return needLogin('owner');
  const mine = DB.properties.filter(p=>p.ownerId===session.id);
  const ids = mine.map(p=>p.id);
  const bks = DB.bookings.filter(b=>ids.includes(b.propertyId));
  const tabs = [['props','ข้อมูลที่พัก'],['rooms','ห้องพักและสถานะ'],['bookings','รายการจอง'],['pays','การชำระเงิน']];
  const waiting = bks.filter(b=>b.payStatus==='waiting').length;
  app().innerHTML = `<section class="block wrap">
    <div class="spread"><h2>จัดการที่พักของฉัน</h2>
      <div class="small muted">รายได้ที่ยืนยันแล้ว ฿${B(bks.filter(b=>b.payStatus==='paid').reduce((s,b)=>s+b.total,0))}</div></div>
    <div class="tabs mt">${tabs.map(([k,t])=>`<button class="${ownerTab===k?'on':''}" onclick="ownerTab='${k}';route()">${t}${k==='pays'&&waiting?` (${waiting})`:''}</button>`).join('')}</div>
    <div id="otab"></div></section>`;
  const box = document.getElementById('otab');
  if(ownerTab==='props') box.innerHTML = ownerProps(mine);
  if(ownerTab==='rooms') box.innerHTML = ownerRooms(mine);
  if(ownerTab==='bookings') box.innerHTML = ownerBookings(bks);
  if(ownerTab==='pays') box.innerHTML = ownerPays(bks);
}
function ownerProps(mine){
  return `<div class="sheet"><div class="sheet-h"><h3>ที่พักทั้งหมด (${mine.length})</h3>
      <button class="btn sm" onclick="editProp()">เพิ่มที่พักใหม่</button></div>
    <div class="sheet-b" style="padding:0">
      ${mine.length ? `<div class="tablewrap"><table><thead><tr><th>ที่พัก</th><th>ประเภท/อำเภอ</th><th>ห้อง</th><th>การตรวจสอบ</th><th></th></tr></thead><tbody>
      ${mine.map(p=>`<tr>
        <td><b>${esc(p.name)}</b><div class="tiny muted">${esc(p.address)}</div></td>
        <td>${esc(p.type)}<div class="tiny muted">อ.${esc(p.district)}</div></td>
        <td>${roomsOf(p.id).length} ประเภท</td>
        <td>${p.status==='approved'?'<span class="tag t-ok">ผ่านการตรวจสอบ</span>':p.status==='pending'?'<span class="tag t-wait">รอตรวจสอบ</span>':'<span class="tag t-no">ไม่ผ่าน</span>'}
            ${p.note?`<div class="tiny muted">${esc(p.note)}</div>`:''}</td>
        <td style="text-align:right;white-space:nowrap">
          <button class="btn sm ghost" onclick="editProp('${p.id}')">แก้ไข</button>
          <button class="btn sm danger" onclick="delProp('${p.id}')">ลบ</button></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty" style="margin:18px">ยังไม่มีที่พัก กด “เพิ่มที่พักใหม่” เพื่อเริ่มต้น</div>'}
    </div></div><div id="pform"></div>`;
}
function editProp(id){
  const p = id ? prop(id) : {id:'', name:'', type:PROP_TYPES[0], district:DISTRICT, address:'', phone:me().phone||'', promptpay:'', desc:'', amenities:[], photos:[]};
  propPhotoDraft = (p.photos||[]).slice();
  document.getElementById('pform').innerHTML = `<div class="sheet mt">
    <div class="sheet-h"><h3>${id?'แก้ไขข้อมูลที่พัก':'เพิ่มที่พักใหม่'}</h3></div>
    <div class="sheet-b">
      <div class="grid2">
        <label class="f"><span>ชื่อที่พัก</span><input id="p_name" value="${esc(p.name)}"></label>
        <label class="f"><span>ประเภท</span><select id="p_type">${PROP_TYPES.map(t=>`<option ${t===p.type?'selected':''}>${t}</option>`).join('')}</select></label>
      </div>
      <div class="grid2">
        <label class="f"><span>อำเภอ (ระบบรับเฉพาะอำเภอเมืองสกลนคร)</span><input id="p_dist" value="${DISTRICT}" readonly></label>
        <label class="f"><span>เบอร์โทรติดต่อ</span><input id="p_phone" value="${esc(p.phone)}"></label>
      </div>
      <label class="f"><span>ที่อยู่</span><input id="p_addr" value="${esc(p.address)}"></label>
      <label class="f"><span>เลขพร้อมเพย์ที่ใช้รับเงิน (เบอร์มือถือ 10 หลัก · เลขบัตรประชาชน/ภาษี 13 หลัก · e-Wallet 15 หลัก)</span><input id="p_pp" inputmode="numeric" value="${esc(p.promptpay||'')}" placeholder="เช่น 0812345678"></label>
      <label class="f"><span>รายละเอียดที่พัก</span><textarea id="p_desc">${esc(p.desc)}</textarea></label>
      <label class="f"><span>สิ่งอำนวยความสะดวก</span></label>
      <div class="amen" style="margin-bottom:14px">${AMENITIES.map((a,i)=>`
        <label class="tag ${p.amenities.includes(a)?'t-info':'t-idle'}" style="cursor:pointer;font-weight:500">
          <input type="checkbox" class="p_am" value="${a}" ${p.amenities.includes(a)?'checked':''} style="width:auto;margin-right:5px">${a}</label>`).join('')}</div>
      <label class="f"><span>รูปภาพที่พัก (เลือกได้หลายไฟล์ เพิ่มเติมจากรูปเดิม)</span><input type="file" id="p_pics" accept="image/*" multiple></label>
      <div id="p_photolist" class="row" style="margin-bottom:14px;flex-wrap:wrap;gap:8px">${propPhotoStrip()}</div>
      <button class="btn" onclick="saveProp('${p.id}')">บันทึกข้อมูลที่พัก</button>
      <button class="btn ghost" onclick="document.getElementById('pform').innerHTML=''">ยกเลิก</button>
      <div class="note mt tiny">${id?'แก้ไขแล้วบันทึกใช้งานได้ทันที ไม่ต้องรอผู้ดูแลระบบตรวจสอบซ้ำ':'ที่พักที่เพิ่มใหม่จะถูกส่งให้ผู้ดูแลระบบตรวจสอบก่อนแสดงบนหน้าเว็บ'}</div>
    </div></div>`;
  document.getElementById('pform').scrollIntoView({behavior:'smooth'});
}
function propPhotoStrip(){
  if(!propPhotoDraft.length) return '<div class="tiny muted">ยังไม่มีรูปภาพ</div>';
  return propPhotoDraft.map((s,i)=>`<div style="position:relative;display:inline-block">
      <img src="${s}" style="width:92px;height:66px;object-fit:cover;border-radius:6px">
      <button type="button" onclick="removePropPhoto(${i})" title="เอารูปนี้ออก"
        style="position:absolute;top:-6px;right:-6px;width:22px;height:22px;border-radius:50%;border:none;background:#e02424;color:#fff;cursor:pointer;line-height:1;font-size:14px">×</button>
    </div>`).join('');
}
function removePropPhoto(i){
  propPhotoDraft.splice(i,1);
  document.getElementById('p_photolist').innerHTML = propPhotoStrip();
}
function saveProp(id){
  const v = i => document.getElementById(i).value.trim();
  if(!v('p_name')||!v('p_addr')) return toast('กรอกชื่อที่พักและที่อยู่ให้ครบ', true);
  const pp = v('p_pp').replace(/\D/g,'');
  if(!QR.validPromptPayId(pp)) return toast('เลขพร้อมเพย์ไม่ถูกต้อง (เบอร์มือถือ 10 หลักขึ้นต้น 0, เลข 13 หลัก หรือ 15 หลัก)', true);
  const am = [...document.querySelectorAll('.p_am:checked')].map(x=>x.value);
  const files = [...document.getElementById('p_pics').files];
  const finish = pics => {
    const isNew = !id;
    let p = id ? prop(id) : null;
    if(!p){ p = {id:uid('P'), ownerId:session.id, photos:[], status:'pending', note:''}; DB.properties.push(p); }
    Object.assign(p, {name:v('p_name'), type:PROP_TYPES.includes(v('p_type'))?v('p_type'):PROP_TYPES[0], district:DISTRICT, phone:v('p_phone'),
      address:v('p_addr'), promptpay:pp, desc:v('p_desc'), amenities:am});
    // รูปภาพ = รูปเดิมที่เหลืออยู่ (หลังจากที่เจ้าของอาจกดเอาออกไปแล้ว) + รูปใหม่ที่เพิ่งอัปโหลด
    p.photos = propPhotoDraft.concat(pics);
    if(!p.photos.length) p.photos = [photo(p.id, p.name), photo(p.id+'b','บรรยากาศ')];
    if(isNew){ p.status = 'pending'; p.note = ''; }
    save(); toast(isNew ? 'บันทึกแล้ว ส่งให้ผู้ดูแลระบบตรวจสอบ' : 'บันทึกการแก้ไขแล้ว ใช้งานได้ทันที'); route();
  };
  if(!files.length) return finish([]);
  const out = []; let n = 0;
  files.forEach(f=>{ const rd = new FileReader(); rd.onload=()=>{ out.push(rd.result); if(++n===files.length) finish(out); }; rd.readAsDataURL(f); });
}
function delProp(id){
  if(!confirm('ลบที่พักนี้พร้อมห้องพักทั้งหมด?')) return;
  DB.properties = DB.properties.filter(p=>p.id!==id);
  DB.rooms = DB.rooms.filter(r=>r.propertyId!==id);
  save(); toast('ลบที่พักแล้ว'); route();
}
function ownerRooms(mine){
  return `<div class="sheet"><div class="sheet-h"><h3>ห้องพักและสถานะ</h3>
      ${mine.length?`<button class="btn sm" onclick="editRoom('', '${mine[0].id}')">เพิ่มห้องพัก</button>`:''}</div>
    <div class="sheet-b" style="padding:0">
    ${mine.map(p=>`
      <div style="padding:14px 18px;border-bottom:1px solid var(--line)">
        <div class="spread"><b>${esc(p.name)}</b><button class="btn sm ghost" onclick="editRoom('','${p.id}')">เพิ่มห้องในที่พักนี้</button></div>
        <div class="tablewrap mt">${roomsOf(p.id).length?`<table><thead><tr><th>ประเภทห้อง</th><th>ราคา/คืน</th><th>จำนวนห้อง</th><th>ว่าง</th><th>สถานะ</th><th></th></tr></thead><tbody>
        ${roomsOf(p.id).map(r=>`<tr>
          <td>${esc(r.type)}<div class="tiny muted">${esc(r.beds)} · ${r.size} ตร.ม. · พัก ${r.capacity} ท่าน</div></td>
          <td>฿${B(r.price)}</td><td>${r.qty}</td><td><b>${freeQty(r.id)}</b>${heldUnpaid(r.id)?`<div class="tiny muted">รอชำระ ${heldUnpaid(r.id)}</div>`:''}</td>
          <td><select onchange="setRoomStatus('${r.id}',this.value)" style="width:auto;padding:4px 8px;font-size:.84rem">
            <option value="available" ${r.status==='available'?'selected':''}>ว่าง</option>
            <option value="unavailable" ${r.status==='unavailable'?'selected':''}>ไม่ว่าง</option>
            <option value="maintenance" ${r.status==='maintenance'?'selected':''}>ปิดชั่วคราว (ซ่อมแซม)</option></select></td>
          <td style="text-align:right;white-space:nowrap">
            <button class="btn sm ghost" onclick="editRoom('${r.id}','${p.id}')">แก้ไข</button>
            <button class="btn sm danger" onclick="delRoom('${r.id}')">ลบ</button></td></tr>`).join('')}
        </tbody></table>`:'<div class="empty">ยังไม่มีห้องพักในที่พักนี้</div>'}</div>
      </div>`).join('') || '<div class="empty" style="margin:18px">เพิ่มข้อมูลที่พักก่อน จึงจะเพิ่มห้องพักได้</div>'}
    </div></div><div id="rform"></div>`;
}
function setRoomStatus(rid, st){ room(rid).status = st; save(); toast('อัปเดตสถานะห้องแล้ว'); route(); }
function delRoom(rid){ if(!confirm('ลบห้องพักนี้?')) return; DB.rooms = DB.rooms.filter(r=>r.id!==rid); save(); toast('ลบห้องพักแล้ว'); route(); }
function editRoom(rid, pid){
  const r = rid ? room(rid) : {id:'', propertyId:pid, type:'', price:0, qty:1, capacity:2, beds:'เตียงใหญ่ 1 เตียง', size:24, amenities:[], status:'available', photos:[]};
  const mine = DB.properties.filter(p=>p.ownerId===session.id);
  roomPhotoDraft = (r.photos||[]).slice();
  document.getElementById('rform').innerHTML = `<div class="sheet mt">
    <div class="sheet-h"><h3>${rid?'แก้ไขห้องพัก':'เพิ่มห้องพัก'}</h3></div>
    <div class="sheet-b">
      <label class="f"><span>อยู่ในที่พัก</span><select id="r_prop">${mine.map(p=>`<option value="${p.id}" ${p.id===r.propertyId?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label>
      <div class="grid2">
        <label class="f"><span>ประเภทห้อง</span><input id="r_type" value="${esc(r.type)}" placeholder="เช่น ห้องเตียงคู่ วิวหนองหาร"></label>
        <label class="f"><span>ราคาต่อคืน (บาท)</span><input id="r_price" type="number" min="0" value="${r.price}"></label>
      </div>
      <div class="grid3">
        <label class="f"><span>จำนวนห้อง</span><input id="r_qty" type="number" min="1" value="${r.qty}"></label>
        <label class="f"><span>พักได้ (ท่าน)</span><input id="r_cap" type="number" min="1" value="${r.capacity}"></label>
        <label class="f"><span>ขนาด (ตร.ม.)</span><input id="r_size" type="number" min="1" value="${r.size}"></label>
      </div>
      <label class="f"><span>รายละเอียดเตียง</span><input id="r_beds" value="${esc(r.beds)}"></label>
      <label class="f"><span>สิ่งอำนวยความสะดวกในห้อง</span></label>
      <div class="amen" style="margin-bottom:14px">${AMENITIES.map(a=>`
        <label class="tag ${r.amenities.includes(a)?'t-info':'t-idle'}" style="cursor:pointer;font-weight:500">
          <input type="checkbox" class="r_am" value="${a}" ${r.amenities.includes(a)?'checked':''} style="width:auto;margin-right:5px">${a}</label>`).join('')}</div>
      <label class="f"><span>รูปภาพห้องพัก (เลือกได้หลายไฟล์ เพิ่มเติมจากรูปเดิม)</span><input type="file" id="r_pics" accept="image/*" multiple></label>
      <div id="r_photolist" class="row" style="margin-bottom:14px;flex-wrap:wrap;gap:8px">${roomPhotoStrip()}</div>
      <button class="btn" onclick="saveRoom('${r.id}')">บันทึกห้องพัก</button>
      <button class="btn ghost" onclick="document.getElementById('rform').innerHTML=''">ยกเลิก</button>
    </div></div>`;
  document.getElementById('rform').scrollIntoView({behavior:'smooth'});
}
function roomPhotoStrip(){
  if(!roomPhotoDraft.length) return '<div class="tiny muted">ยังไม่มีรูปภาพ</div>';
  return roomPhotoDraft.map((s,i)=>`<div style="position:relative;display:inline-block">
      <img src="${s}" style="width:92px;height:66px;object-fit:cover;border-radius:6px">
      <button type="button" onclick="removeRoomPhoto(${i})" title="เอารูปนี้ออก"
        style="position:absolute;top:-6px;right:-6px;width:22px;height:22px;border-radius:50%;border:none;background:#e02424;color:#fff;cursor:pointer;line-height:1;font-size:14px">×</button>
    </div>`).join('');
}
function removeRoomPhoto(i){
  roomPhotoDraft.splice(i,1);
  document.getElementById('r_photolist').innerHTML = roomPhotoStrip();
}
function saveRoom(rid){
  const v = i => document.getElementById(i).value;
  if(!v('r_type').trim() || Number(v('r_price'))<=0) return toast('กรอกประเภทห้องและราคาให้ถูกต้อง', true);
  const am = [...document.querySelectorAll('.r_am:checked')].map(x=>x.value);
  const files = [...document.getElementById('r_pics').files];
  const finish = pics => {
    let r = rid ? room(rid) : null;
    if(!r){ r = {id:uid('R'), photos:[], status:'available'}; DB.rooms.push(r); }
    Object.assign(r, {propertyId:v('r_prop'), type:v('r_type').trim(), price:Number(v('r_price')), qty:Number(v('r_qty')),
      capacity:Number(v('r_cap')), size:Number(v('r_size')), beds:v('r_beds'), amenities:am});
    r.photos = roomPhotoDraft.concat(pics);
    if(!r.photos.length) r.photos = [photo(r.id, r.type)];
    save(); toast('บันทึกห้องพักแล้ว ใช้งานได้ทันที'); route();
  };
  if(!files.length) return finish([]);
  const out=[]; let n=0;
  files.forEach(f=>{ const rd=new FileReader(); rd.onload=()=>{ out.push(rd.result); if(++n===files.length) finish(out); }; rd.readAsDataURL(f); });
}
function ownerBookings(bks){
  const list = bks.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  return `<div class="sheet"><div class="sheet-h"><h3>รายการจองจากผู้เช่า</h3><span class="tiny muted">${list.length} รายการ</span></div>
    <div class="sheet-b" style="padding:0">${list.length?`<div class="tablewrap"><table>
      <thead><tr><th>รหัส</th><th>ผู้จอง</th><th>ห้อง/วันเข้าพัก</th><th>ยอด</th><th>สถานะการจอง</th><th>เปลี่ยนสถานะ</th></tr></thead><tbody>
      ${list.map(b=>{const u=user(b.userId);return `<tr>
        <td><b>${b.code}</b><div class="tiny muted">${thDate(b.createdAt)}</div></td>
        <td>${esc(u.name||'-')}<div class="tiny muted">${esc(u.phone||'')}</div></td>
        <td>${esc(room(b.roomId).type)}<div class="tiny muted">${thDate(b.checkIn)} – ${thDate(b.checkOut)} · ${b.qty} ห้อง</div></td>
        <td>฿${B(b.total)}<div class="tiny">${tag(PS,b.payStatus)}</div></td>
        <td>${tag(ST,b.status)}${b.note?`<div class="tiny muted">“${esc(b.note)}”</div>`:''}</td>
        <td><select onchange="setBookingStatus('${b.id}',this.value)" style="width:auto;padding:4px 8px;font-size:.84rem">
          ${Object.keys(ST).map(k=>`<option value="${k}" ${b.status===k?'selected':''}>${ST[k][0]}</option>`).join('')}
        </select></td></tr>`;}).join('')}
    </tbody></table></div>`:'<div class="empty" style="margin:18px">ยังไม่มีรายการจองเข้ามา</div>'}</div></div>`;
}
function setBookingStatus(bid, st){
  const b = DB.bookings.find(x=>x.id===bid);
  if(st==='confirmed' && b.payStatus!=='paid' && !confirm('ยังไม่ได้ยืนยันการชำระเงิน ต้องการยืนยันการจองเลยหรือไม่?')) return route();
  b.status = st; save(); toast('อัปเดตสถานะการจองเป็น “'+ST[st][0]+'”'); route();
}
function ownerPays(bks){
  const list = bks.filter(b=>b.payStatus!=='unpaid').sort((a,b)=>a.payStatus==='waiting'?-1:1);
  return `<div class="sheet"><div class="sheet-h"><h3>ตรวจสอบหลักฐานการชำระเงิน</h3></div>
    <div class="sheet-b" style="padding:0">${list.length?list.map(b=>`
      <div class="roomrow" style="padding:16px 18px;border-top:1px solid var(--line);margin:0">
        ${b.slip?`<img src="${b.slip}" alt="หลักฐานการชำระเงิน" style="width:110px;height:78px;object-fit:cover;border-radius:8px">`:''}
        <div class="info">
          <div><b>${b.code}</b> · ${esc(user(b.userId).name)} ${tag(PS,b.payStatus)}</div>
          <div class="small muted">${esc(prop(b.propertyId).name)} · ${esc(room(b.roomId).type)} · ${thDate(b.checkIn)} – ${thDate(b.checkOut)}</div>
          <div class="small">ยอดที่ต้องได้รับ <b>฿${B(b.total)}</b> · ชำระเต็มจำนวนผ่าน ${esc(b.payMethod)}</div>
        </div>
        <div style="text-align:right;white-space:nowrap">
          ${b.payStatus==='waiting'?`
            <button class="btn sm" onclick="setPay('${b.id}','paid')">ยืนยันการชำระเงิน</button>
            <button class="btn sm danger" onclick="setPay('${b.id}','rejected')">หลักฐานไม่ผ่าน</button>`
            : `<span class="tiny muted">ตรวจสอบแล้ว</span>`}
        </div></div>`).join('') : '<div class="empty" style="margin:18px">ยังไม่มีหลักฐานการชำระเงินรอตรวจสอบ</div>'}
    </div></div>`;
}
function setPay(bid, st){
  const b = DB.bookings.find(x=>x.id===bid);
  b.payStatus = st;
  if(st==='paid' && b.status==='pending') b.status = 'confirmed';
  save(); toast(st==='paid' ? 'ยืนยันการชำระเงินแล้ว การจองถูกยืนยันอัตโนมัติ' : 'หลักฐานไม่ผ่าน คืนห้องเข้าระบบและแจ้งผู้จองแล้ว');
  route();
}

/* ============================== ผู้ดูแลระบบ ============================== */
let adminTab = 'review';
function viewAdmin(){
  if(!session || session.role!=='admin') return needLogin('admin');
  const pend = DB.properties.filter(p=>p.status==='pending').length;
  const tabs = [['review',`ตรวจสอบที่พัก${pend?` (${pend})`:''}`],['news','ข่าวสาร โปรโมชั่น ประกาศ'],['site','ข้อมูลหน้าเว็บไซต์'],['users','ผู้ใช้งาน']];
  app().innerHTML = `<section class="block wrap">
    <h2>ระบบผู้ดูแล</h2>
    <div class="row mt" style="gap:22px">
      ${[['ที่พักทั้งหมด',DB.properties.length],['รอตรวจสอบ',pend],['การจองสะสม',DB.bookings.length],['สมาชิก',DB.users.length]]
        .map(([t,n])=>`<div class="panel" style="padding:12px 18px;min-width:130px"><div class="tiny muted">${t}</div><div class="price">${n}</div></div>`).join('')}
    </div>
    <div class="tabs mt2">${tabs.map(([k,t])=>`<button class="${adminTab===k?'on':''}" onclick="adminTab='${k}';route()">${t}</button>`).join('')}</div>
    <div id="atab"></div></section>`;
  const box = document.getElementById('atab');
  if(adminTab==='review') box.innerHTML = adminReview();
  if(adminTab==='news') box.innerHTML = adminNews();
  if(adminTab==='site') box.innerHTML = adminSite();
  if(adminTab==='users') box.innerHTML = adminUsers();
}
function adminReview(){
  const list = DB.properties.slice().sort((a,b)=> (a.status==='pending'?-1:1));
  return `<div class="sheet"><div class="sheet-h"><h3>ตรวจสอบที่พักก่อนเผยแพร่</h3></div>
    <div class="sheet-b" style="padding:0">${list.map(p=>`
      <div class="roomrow" style="padding:16px 18px;border-top:1px solid var(--line);margin:0">
        <img src="${p.photos[0]}" alt="${esc(p.name)}">
        <div class="info">
          <div><b>${esc(p.name)}</b> ${p.status==='approved'?'<span class="tag t-ok">เผยแพร่อยู่</span>':p.status==='pending'?'<span class="tag t-wait">รอตรวจสอบ</span>':'<span class="tag t-no">ไม่ผ่าน</span>'}</div>
          <div class="small muted">${esc(p.type)} · อ.${esc(p.district)} · เจ้าของ ${esc(user(p.ownerId).name||'-')} · ${esc(p.phone)}</div>
          <div class="tiny muted">${esc(p.address)} · ${roomsOf(p.id).length} ประเภทห้อง</div>
        </div>
        <div style="text-align:right;white-space:nowrap">
          <a class="btn sm ghost" href="#/property/${p.id}">ดูหน้าเว็บ</a>
          ${p.status!=='approved'?`<button class="btn sm" onclick="reviewProp('${p.id}','approved')">อนุมัติ</button>`:''}
          ${p.status!=='rejected'?`<button class="btn sm danger" onclick="reviewProp('${p.id}','rejected')">ไม่อนุมัติ</button>`:''}
        </div></div>`).join('')}
    </div></div>`;
}
function reviewProp(id, st){
  const p = prop(id); p.status = st;
  p.note = st==='rejected' ? (prompt('เหตุผลที่ไม่อนุมัติ (แจ้งเจ้าของที่พัก)','ข้อมูลหรือรูปภาพไม่ครบถ้วน') || '') : '';
  save(); toast(st==='approved' ? 'อนุมัติที่พักแล้ว' : 'บันทึกผลไม่อนุมัติแล้ว'); route();
}
function adminNews(){
  return `<div class="sheet"><div class="sheet-h"><h3>เนื้อหาในระบบ</h3><button class="btn sm" onclick="editNews()">เพิ่มเนื้อหา</button></div>
    <div class="sheet-b" style="padding:0"><div class="tablewrap"><table>
      <thead><tr><th>หัวข้อ</th><th>ประเภท</th><th>วันที่</th><th>แสดงผล</th><th></th></tr></thead><tbody>
      ${DB.news.map(n=>`<tr>
        <td><b>${esc(n.title)}</b><div class="tiny muted">${esc(n.body).slice(0,70)}…</div></td>
        <td>${esc(n.type)}</td><td>${thDate(n.date)}</td>
        <td>${n.active?'<span class="tag t-ok">แสดงอยู่</span>':'<span class="tag t-idle">ซ่อน</span>'}</td>
        <td style="text-align:right;white-space:nowrap">
          <button class="btn sm ghost" onclick="toggleNews('${n.id}')">${n.active?'ซ่อน':'แสดง'}</button>
          <button class="btn sm ghost" onclick="editNews('${n.id}')">แก้ไข</button>
          <button class="btn sm danger" onclick="delNews('${n.id}')">ลบ</button></td></tr>`).join('')}
    </tbody></table></div></div></div><div id="nform"></div>`;
}
function editNews(id){
  const n = id ? DB.news.find(x=>x.id===id) : {id:'', type:'ข่าวสาร', title:'', body:'', date:today(), active:true};
  document.getElementById('nform').innerHTML = `<div class="sheet mt">
    <div class="sheet-h"><h3>${id?'แก้ไขเนื้อหา':'เพิ่มเนื้อหาใหม่'}</h3></div>
    <div class="sheet-b">
      <div class="grid2">
        <label class="f"><span>ประเภท</span><select id="n_type">${['ข่าวสาร','โปรโมชั่น','ประกาศ'].map(t=>`<option ${t===n.type?'selected':''}>${t}</option>`).join('')}</select></label>
        <label class="f"><span>วันที่เผยแพร่</span><input type="date" id="n_date" value="${n.date}"></label>
      </div>
      <label class="f"><span>หัวข้อ</span><input id="n_title" value="${esc(n.title)}"></label>
      <label class="f"><span>เนื้อหา</span><textarea id="n_body">${esc(n.body)}</textarea></label>
      <button class="btn" onclick="saveNews('${n.id}')">บันทึกเนื้อหา</button>
      <button class="btn ghost" onclick="document.getElementById('nform').innerHTML=''">ยกเลิก</button>
    </div></div>`;
}
function saveNews(id){
  const v = i => document.getElementById(i).value;
  if(!v('n_title').trim()) return toast('กรอกหัวข้อก่อนบันทึก', true);
  let n = id ? DB.news.find(x=>x.id===id) : null;
  if(!n){ n = {id:uid('N'), active:true}; DB.news.unshift(n); }
  Object.assign(n, {type:v('n_type'), date:v('n_date'), title:v('n_title').trim(), body:v('n_body').trim()});
  save(); toast('บันทึกเนื้อหาแล้ว'); route();
}
function toggleNews(id){ const n=DB.news.find(x=>x.id===id); n.active=!n.active; save(); route(); }
function delNews(id){ if(!confirm('ลบเนื้อหานี้?')) return; DB.news = DB.news.filter(n=>n.id!==id); save(); toast('ลบแล้ว'); route(); }
function adminSite(){
  const s = DB.site;
  return `<div class="sheet"><div class="sheet-h"><h3>แก้ไขข้อมูลหน้าเว็บไซต์</h3></div>
    <div class="sheet-b">
      <label class="f"><span>ชื่อเว็บไซต์</span><input id="s_name" value="${esc(s.name)}"></label>
      <label class="f"><span>พาดหัวหน้าแรก</span><input id="s_title" value="${esc(s.heroTitle)}"></label>
      <div class="grid2">
        <label class="f"><span>เบอร์โทรติดต่อระบบ</span><input id="s_phone" value="${esc(s.phone)}"></label>
        <label class="f"><span>อีเมลติดต่อระบบ</span><input id="s_email" value="${esc(s.email)}"></label>
      </div>
      <label class="f"><span>เกี่ยวกับระบบ</span><textarea id="s_about">${esc(s.about)}</textarea></label>
      <button class="btn" onclick="saveSite()">บันทึกข้อมูลหน้าเว็บ</button>
      <button class="btn ghost" onclick="resetAll()">รีเซ็ตข้อมูลตัวอย่างทั้งหมด</button>
    </div></div>`;
}
function saveSite(){
  const v = i => document.getElementById(i).value;
  Object.assign(DB.site, {name:v('s_name'), heroTitle:v('s_title'),
    phone:v('s_phone'), email:v('s_email'), about:v('s_about')});
  save(); renderNav(); toast('บันทึกข้อมูลหน้าเว็บแล้ว');
}
function resetAll(){
  if(!confirm('คืนค่าข้อมูลทั้งหมดกลับเป็นชุดตัวอย่าง?')) return;
  DB = seed(); save(); setSession(null); renderNav(); toast('รีเซ็ตข้อมูลแล้ว'); go('#/'); route();
}
function adminUsers(){
  const label = {admin:'ผู้ดูแลระบบ', owner:'เจ้าของที่พัก', guest:'ผู้จอง'};
  return `<div class="sheet"><div class="sheet-h"><h3>ผู้ใช้งานในระบบ</h3></div>
    <div class="sheet-b" style="padding:0"><div class="tablewrap"><table>
      <thead><tr><th>ชื่อ</th><th>สิทธิ์</th><th>ติดต่อ</th><th>ที่พัก/การจอง</th></tr></thead><tbody>
      ${DB.users.map(u=>`<tr>
        <td><b>${esc(u.name)}</b><div class="tiny muted">${esc(u.username)}</div></td>
        <td>${label[u.role]}</td>
        <td>${esc(u.phone||'-')}<div class="tiny muted">${esc(u.email||'')}</div></td>
        <td>${u.role==='owner' ? DB.properties.filter(p=>p.ownerId===u.id).length + ' ที่พัก'
             : u.role==='guest' ? DB.bookings.filter(b=>b.userId===u.id).length + ' การจอง' : '-'}</td></tr>`).join('')}
    </tbody></table></div></div></div>`;
}

/* ================================ เราเตอร์ ================================ */
function needLogin(role){
  const t = {admin:'ผู้ดูแลระบบ', owner:'เจ้าของที่พัก', guest:'ผู้จอง'}[role] || 'สมาชิก';
  app().innerHTML = `<section class="block wrap"><div class="panel center">
    <h2>ต้องเข้าสู่ระบบในฐานะ${t}</h2>
    <p class="muted">เข้าสู่ระบบด้วยบัญชีที่มีสิทธิ์เพื่อใช้งานหน้านี้</p>
    <a class="btn" href="#/login">ไปหน้าเข้าสู่ระบบ</a></div></section>`;
}
function notFound(){
  app().innerHTML = `<section class="block wrap"><div class="panel center">
    <h2>ไม่พบหน้าที่ต้องการ</h2><p class="muted">ลิงก์อาจถูกลบหรือพิมพ์ผิด</p>
    <a class="btn" href="#/">กลับหน้าแรก</a></div></section>`;
}
let routeSeq = 0;
const LIVE_PAGES = ['', 'search', 'property', 'book', 'pay', 'bookings', 'owner', 'admin'];
async function route(skipRefresh){
  const my = ++routeSeq;
  const raw = (location.hash || '#/').slice(1);
  const [path, query] = raw.split('?');
  const qs = new URLSearchParams(query || '');
  const seg = path.split('/').filter(Boolean);
  const head = seg[0] || '';
  if(skipRefresh!==true && LIVE_PAGES.includes(head)){ await refreshData(); if(my!==routeSeq) return; }
  renderNav();
  document.getElementById('nav').classList.remove('open');
  if(head==='') viewHome();
  else if(head==='search') viewSearch(qs);
  else if(head==='property') viewProperty(seg[1]);
  else if(head==='book') viewBook(seg[1]);
  else if(head==='pay') viewPay(seg[1]);
  else if(head==='bookings') viewBookings();
  else if(head==='profile') viewProfile();
  else if(head==='login') viewLogin();
  else if(head==='register') viewRegister();
  else if(head==='forgot') viewForgot();
  else if(head==='reset') viewReset(qs);
  else if(head==='owner') viewOwner();
  else if(head==='admin') viewAdmin();
  else notFound();
  window.scrollTo({top:0});
}
document.getElementById('menuToggle').onclick = function(){
  const n = document.getElementById('nav'); const open = n.classList.toggle('open');
  this.setAttribute('aria-expanded', open);
};
window.addEventListener('hashchange', () => route());

/* ----------------------------- เริ่มทำงาน ----------------------------- */
async function init(){
  try{
    SEED = await fetchSeed();
  }catch(err){
    document.getElementById('app').innerHTML = `<section class="block wrap"><div class="panel">
      <h2>เชื่อมต่อฐานข้อมูลไม่สำเร็จ</h2>
      <p class="muted">หน้าเว็บนี้ต้องเปิดผ่าน Apache ของ XAMPP (ไม่ใช่ดับเบิลคลิกไฟล์โดยตรง) และต้องมีฐานข้อมูล MySQL <b>sakon_booking</b> อยู่แล้ว</p>
      <ol class="tiny muted" style="text-align:left;max-width:520px;margin:0 auto">
        <li>เปิด XAMPP Control Panel แล้วกด Start ที่ <b>Apache</b> และ <b>MySQL</b></li>
        <li>คัดลอกโฟลเดอร์ <b>project</b> นี้ไปไว้ใน <code>C:\\xampp\\htdocs\\sakon-stay</code></li>
        <li>เปิด <a href="http://localhost/phpmyadmin" target="_blank">phpMyAdmin</a> แล้ว Import ไฟล์ <code>sql/sakon_stay_xampp.sql</code></li>
        <li>เปิดเว็บผ่าน <code>http://localhost/sakon-stay/</code></li>
      </ol>
      <p class="tiny muted">รายละเอียดข้อผิดพลาด: ${esc(err.message)}</p></div></section>`;
    return;
  }
  load();
  route(true);
}
init();
