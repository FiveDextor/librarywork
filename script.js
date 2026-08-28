/* =========================================================
   1) ตั้งค่า Supabase — แก้สองบรรทัดนี้ให้เป็นของโปรเจกต์คุณ
   ========================================================= */
const SUPABASE_URL = "https://etxezwalaxywjdvvrojc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_sXSm5tjEOyVRrwYHdh2fVw_DZ26OX0l";

/*
  วิธีตั้งค่า Supabase:
  1. สร้างโปรเจกต์ที่ supabase.com
  2. ไปที่ SQL Editor แล้วรันคำสั่งนี้เพื่อสร้างตาราง:

     create table books (
       id uuid primary key default gen_random_uuid(),
       title text not null,
       author text,
       category text,
       status text not null default 'available' check (status in ('available','borrowed')),
       borrower_name text,
       borrower_contact text,
       borrowed_at timestamptz,
       created_at timestamptz not null default now()
     );

     alter table books enable row level security;
     create policy "Public read" on books for select using (true);
     create policy "Public insert" on books for insert with check (true);
     create policy "Public update" on books for update using (true);
     create policy "Public delete" on books for delete using (true);

  3. ไปที่ Project Settings > API คัดลอก Project URL และ anon public key
  4. แก้ไขค่า SUPABASE_URL และ SUPABASE_ANON_KEY ด้านล่างนี้
*/

let db = null;
let isConfigured = SUPABASE_URL.indexOf("YOUR_PROJECT") === -1 && SUPABASE_ANON_KEY.indexOf("YOUR_ANON_KEY") === -1;

if (isConfigured) {
  if (typeof window.supabase === 'undefined') {
    // ไลบรารี Supabase ยังไม่ถูกโหลด — เช็คว่ามี <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    // อยู่ใน HTML ก่อน script.js นี้หรือไม่ (ใน CodePen: วางไว้ในช่อง HTML หรือเพิ่มใน JS Settings > External Script)
    console.error('Supabase library not loaded. Make sure the CDN <script> tag runs before script.js');
    isConfigured = false;
    document.getElementById('configBanner').classList.add('show');
  } else {
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} else {
  document.getElementById('configBanner').classList.add('show');
}

let books = [];
let currentFilter = 'all';
let searchTerm = '';
let pendingBorrowId = null;

// ---------- Starfield background ----------
function buildStars(){
  const container = document.getElementById('stars');
  let html = '';
  for(let i=0;i<90;i++){
    const size = Math.random()*2.4+0.6;
    html += `<div class="twinkle" style="
      width:${size}px;height:${size}px;
      top:${Math.random()*100}%; left:${Math.random()*100}%;
      animation-delay:${(Math.random()*4).toFixed(2)}s;
      animation-duration:${(3+Math.random()*4).toFixed(2)}s;"></div>`;
  }
  for(let i=0;i<3;i++){
    html += `<div class="shooting-star" style="
      top:${5+Math.random()*40}%; left:${50+Math.random()*40}%;
      animation-delay:${(i*3.2).toFixed(2)}s;"></div>`;
  }
  container.innerHTML = html;
}
buildStars();

// ---------- Toast ----------
function showToast(msg, isErr){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  setTimeout(()=> t.classList.remove('show'), 2600);
}

// ---------- Mock fallback (when Supabase not configured) ----------
let mockBooks = [
  {id:'m1', title:'สามก๊ก', author:'หลอกว้านจง', category:'วรรณกรรม', status:'available', borrower_name:null, borrower_contact:null, borrowed_at:null},
  {id:'m2', title:'ไซอิ๋ว', author:'อู๋เฉิงเอิน', category:'วรรณกรรม', status:'borrowed', borrower_name:'สมชาย ใจดี', borrower_contact:'081-234-5678', borrowed_at:new Date().toISOString()},
  {id:'m3', title:'ปรัชญากรีก', author:'เพลโต', category:'ปรัชญา', status:'available', borrower_name:null, borrower_contact:null, borrowed_at:null},
];

// ---------- Data layer ----------
async function fetchBooks(){
  if(!isConfigured){
    books = mockBooks;
    render();
    return;
  }
  const { data, error } = await db.from('books').select('*').order('created_at', {ascending:false});
  if(error){ showToast('โหลดข้อมูลผิดพลาด: '+error.message, true); return; }
  books = data;
  render();
}

async function addBook(title, author, category){
  if(!isConfigured){
    mockBooks.unshift({id:'m'+Date.now(), title, author, category, status:'available', borrower_name:null, borrower_contact:null, borrowed_at:null});
    books = mockBooks; render();
    showToast('เพิ่มหนังสือแล้ว (โหมดทดลอง — ยังไม่เชื่อม Supabase)');
    return;
  }
  const { error } = await db.from('books').insert([{ title, author, category, status:'available' }]);
  if(error){ showToast('เพิ่มหนังสือผิดพลาด: '+error.message, true); return; }
  showToast('เพิ่มหนังสือ "'+title+'" เรียบร้อย');
  fetchBooks();
}

async function borrowBook(id, name, contact){
  if(!isConfigured){
    const b = mockBooks.find(x=>x.id===id);
    if(b){ b.status='borrowed'; b.borrower_name=name; b.borrower_contact=contact; b.borrowed_at=new Date().toISOString(); }
    books = mockBooks; render();
    showToast('ยืมหนังสือสำเร็จ (โหมดทดลอง)');
    return;
  }
  const { error } = await db.from('books').update({
    status:'borrowed', borrower_name:name, borrower_contact:contact, borrowed_at:new Date().toISOString()
  }).eq('id', id);
  if(error){ showToast('ยืมหนังสือผิดพลาด: '+error.message, true); return; }
  showToast('ยืมหนังสือสำเร็จ');
  fetchBooks();
}

async function returnBook(id){
  if(!isConfigured){
    const b = mockBooks.find(x=>x.id===id);
    if(b){ b.status='available'; b.borrower_name=null; b.borrower_contact=null; b.borrowed_at=null; }
    books = mockBooks; render();
    showToast('คืนหนังสือแล้ว (โหมดทดลอง)');
    return;
  }
  const { error } = await db.from('books').update({
    status:'available', borrower_name:null, borrower_contact:null, borrowed_at:null
  }).eq('id', id);
  if(error){ showToast('คืนหนังสือผิดพลาด: '+error.message, true); return; }
  showToast('คืนหนังสือแล้ว');
  fetchBooks();
}

async function deleteBook(id){
  if(!confirm('ลบหนังสือเล่มนี้ออกจากระบบใช่ไหม?')) return;
  if(!isConfigured){
    mockBooks = mockBooks.filter(x=>x.id!==id);
    books = mockBooks; render();
    showToast('ลบหนังสือแล้ว (โหมดทดลอง)');
    return;
  }
  const { error } = await db.from('books').delete().eq('id', id);
  if(error){ showToast('ลบหนังสือผิดพลาด: '+error.message, true); return; }
  showToast('ลบหนังสือแล้ว');
  fetchBooks();
}

// ---------- Render ----------
function fmtDate(d){
  if(!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('th-TH', {day:'numeric', month:'short', year:'numeric'});
}

function render(){
  const grid = document.getElementById('bookGrid');
  let filtered = books.filter(b=>{
    const matchFilter = currentFilter==='all' || b.status===currentFilter;
    const matchSearch = !searchTerm ||
      b.title.toLowerCase().includes(searchTerm) ||
      (b.author||'').toLowerCase().includes(searchTerm);
    return matchFilter && matchSearch;
  });

  document.getElementById('statTotal').textContent = books.length;
  document.getElementById('statAvailable').textContent = books.filter(b=>b.status==='available').length;
  document.getElementById('statBorrowed').textContent = books.filter(b=>b.status==='borrowed').length;

  if(filtered.length===0){
    grid.innerHTML = `<div class="empty"><div class="glyph">✦ ⋆ ✦</div>ไม่พบหนังสือที่ตรงกับเงื่อนไข</div>`;
    return;
  }

  grid.innerHTML = filtered.map(b=>{
    const isAvail = b.status==='available';
    return `
    <div class="card">
      <span class="badge ${isAvail?'available':'borrowed'}">${isAvail?'พร้อมให้ยืม':'ถูกยืมอยู่'}</span>
      <h3>${escapeHtml(b.title)}</h3>
      <div class="author">${escapeHtml(b.author||'ไม่ระบุผู้แต่ง')}${b.category? ' · '+escapeHtml(b.category):''}</div>
      ${!isAvail ? `<div class="meta">ผู้ยืม: <span>${escapeHtml(b.borrower_name||'-')}</span><br>วันที่ยืม: <span>${fmtDate(b.borrowed_at)}</span></div>` : ''}
      <div class="actions">
        ${isAvail
          ? `<button class="btn-borrow" onclick="openBorrowModal('${b.id}')">ยืมหนังสือ</button>`
          : `<button class="btn-return" onclick="returnBook('${b.id}')">คืนหนังสือ</button>`
        }
        <button class="btn-del" onclick="deleteBook('${b.id}')" title="ลบ">✕</button>
      </div>
    </div>`;
  }).join('');
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// ---------- Modals ----------
const addModal = document.getElementById('addModal');
const borrowModal = document.getElementById('borrowModal');

document.getElementById('openAddModal').onclick = ()=> addModal.classList.add('show');
document.getElementById('cancelAdd').onclick = ()=> addModal.classList.remove('show');
document.getElementById('confirmAdd').onclick = ()=>{
  const title = document.getElementById('newTitle').value.trim();
  const author = document.getElementById('newAuthor').value.trim();
  const category = document.getElementById('newCategory').value.trim();
  if(!title){ showToast('กรุณากรอกชื่อหนังสือ', true); return; }
  addBook(title, author, category);
  document.getElementById('newTitle').value='';
  document.getElementById('newAuthor').value='';
  document.getElementById('newCategory').value='';
  addModal.classList.remove('show');
};

window.openBorrowModal = function(id){
  pendingBorrowId = id;
  borrowModal.classList.add('show');
};
document.getElementById('cancelBorrow').onclick = ()=> borrowModal.classList.remove('show');
document.getElementById('confirmBorrow').onclick = ()=>{
  const name = document.getElementById('borrowerName').value.trim();
  const contact = document.getElementById('borrowerContact').value.trim();
  if(!name){ showToast('กรุณากรอกชื่อผู้ยืม', true); return; }
  borrowBook(pendingBorrowId, name, contact);
  document.getElementById('borrowerName').value='';
  document.getElementById('borrowerContact').value='';
  borrowModal.classList.remove('show');
};

[addModal, borrowModal].forEach(m=>{
  m.addEventListener('click', e=>{ if(e.target===m) m.classList.remove('show'); });
});

window.returnBook = returnBook;
window.deleteBook = deleteBook;

// ---------- Filters & search ----------
document.querySelectorAll('.chip').forEach(chip=>{
  chip.onclick = ()=>{
    document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
    chip.classList.add('active');
    currentFilter = chip.dataset.filter;
    render();
  };
});
document.getElementById('searchInput').oninput = (e)=>{
  searchTerm = e.target.value.toLowerCase();
  render();
};

// ---------- Init ----------
fetchBooks();