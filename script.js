/* Galaxy Library
   Any Google account: inspect + borrow + return own loans.
   Librarian: raminbaandit4@gmail.com — full inventory management.
*/
//RELOAD

const SUPABASE_URL = "https://etxezwalaxywjdvvrojc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_sXSm5tjEOyVRrwYHdh2fVw_DZ26OX0l";
const LIBRARIAN_EMAIL = "raminbaandit4@gmail.com";
const LOAN_DAYS = 30;

const isConfigured = !SUPABASE_URL.includes("PASTE_YOUR") && !SUPABASE_ANON_KEY.includes("PASTE_YOUR");
let db = null;
let currentUser = null;
let isLibrarian = false;
let books = [];
let myActiveLoans = new Map();
let librarianActiveLoans = new Map();
let currentFilter = "all";
let searchTerm = "";
let pendingBorrowId = null;
let inspectedBookId = null;

const $ = (id) => document.getElementById(id);
const configBanner = $("configBanner");
const loginBanner = $("loginBanner");
const authArea = $("authArea");
const bookGrid = $("bookGrid");
const addModal = $("addModal");
const inspectModal = $("inspectModal");
const borrowModal = $("borrowModal");

document.addEventListener("DOMContentLoaded", init);

async function init() {
  buildStars();
  bindUI();
  if (!isConfigured) {
    configBanner.classList.add("show");
    bookGrid.innerHTML = '<div class="empty"><div class="glyph">⚠</div>กรุณาตั้งค่า Supabase ใน script.js ก่อน</div>';
    updateAuthUI(null);
    return;
  }
  if (!window.supabase) {
    configBanner.classList.add("show");
    configBanner.innerHTML = "⚠️ <b>โหลด Supabase ไม่สำเร็จ</b><br>ตรวจสอบอินเทอร์เน็ตหรือ CDN ใน index.html";
    return;
  }
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  db.auth.onAuthStateChange((_event, session) => setTimeout(() => handleSession(session), 0));
  const { data, error } = await db.auth.getSession();
  if (error) showToast("ตรวจสอบเซสชันไม่สำเร็จ: " + error.message, true);
  await handleSession(data?.session ?? null);
  await fetchBooks();
}

async function handleSession(session) {
  currentUser = session?.user ?? null;
  isLibrarian = (currentUser?.email || "").trim().toLowerCase() === LIBRARIAN_EMAIL.toLowerCase();
  updateAuthUI(currentUser);
  updateLibrarianUI();
  myActiveLoans = new Map();
  librarianActiveLoans = new Map();
  if (currentUser) await fetchActiveLoans();
  render();
}

function bindUI() {
  $("searchInput").addEventListener("input", e => { searchTerm = e.target.value.trim().toLowerCase(); render(); });
  document.querySelectorAll(".chip").forEach(chip => chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach(x => x.classList.remove("active"));
    chip.classList.add("active"); currentFilter = chip.dataset.filter; render();
  }));
  $("loginButton").addEventListener("click", signInWithGoogle);
  $("openAddModal").addEventListener("click", () => { if (requireLibrarian()) { openModal(addModal); $("newTitle").focus(); } });
  $("confirmAdd").addEventListener("click", submitAddBook);
  $("confirmBorrow").addEventListener("click", submitBorrow);
  document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => closeModal($(b.dataset.close))));
  [addModal, inspectModal, borrowModal].forEach(modal => modal.addEventListener("click", e => { if (e.target === modal) closeModal(modal); }));
  document.addEventListener("keydown", e => { if (e.key === "Escape") [addModal, inspectModal, borrowModal].forEach(closeModal); });
}

function updateAuthUI(user) {
  if (!user) {
    authArea.innerHTML = '<button class="btn-login" id="headerLoginButton" type="button">Google Login</button>';
    $("headerLoginButton").addEventListener("click", signInWithGoogle);
    loginBanner.classList.remove("hidden");
    return;
  }
  const name = escapeHtml(user.user_metadata?.full_name || user.user_metadata?.name || user.email || "Google User");
  const avatar = user.user_metadata?.avatar_url ? `<img class="auth-avatar" src="${escapeAttribute(user.user_metadata.avatar_url)}" alt="">` : "";
  authArea.innerHTML = `<div class="user-pill">${avatar}<span>${name}${isLibrarian ? " · Librarian" : ""}</span></div><button class="btn-logout" id="logoutButton" type="button">ออกจากระบบ</button>`;
  $("logoutButton").addEventListener("click", signOut);
  loginBanner.classList.add("hidden");
}

function updateLibrarianUI() {
  document.querySelectorAll(".librarian-only").forEach(el => el.classList.toggle("hidden", !isLibrarian));
}

async function signInWithGoogle() {
  if (!db) return showToast("ยังไม่ได้เชื่อมต่อ Supabase", true);
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await db.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  if (error) showToast("เข้าสู่ระบบไม่สำเร็จ: " + error.message, true);
}

async function signOut() {
  const { error } = await db.auth.signOut();
  if (error) return showToast("ออกจากระบบไม่สำเร็จ: " + error.message, true);
  showToast("ออกจากระบบแล้ว");
}

function requireUser() { if (!currentUser) { showToast("กรุณาเข้าสู่ระบบด้วย Google ก่อน", true); return false; } return true; }
function requireLibrarian() { if (!requireUser()) return false; if (!isLibrarian) { showToast("บัญชีนี้ไม่มีสิทธิ์ Librarian", true); return false; } return true; }

async function cleanupExpired() {
  if (!db) return;
  const { error } = await db.rpc("expire_overdue_loans");
  if (error) console.warn("expire_overdue_loans:", error.message);
}

async function fetchBooks() {
  if (!db) return;
  bookGrid.innerHTML = '<div class="loading">กำลังโหลดข้อมูลจากจักรวาล...</div>';
  await cleanupExpired();
  const { data, error } = await db.from("books").select("id,title,author,category,isbn,description,total_copies,available_copies,created_at").order("created_at", { ascending: false });
  if (error) {
    bookGrid.innerHTML = '<div class="empty"><div class="glyph">⚠</div>โหลดหนังสือไม่สำเร็จ</div>';
    return showToast("โหลดหนังสือผิดพลาด: " + error.message, true);
  }
  books = (data || []).map(b => ({ ...b, status: Number(b.available_copies) > 0 ? "available" : "borrowed" }));
  if (currentUser) await fetchActiveLoans();
  render();
}

async function fetchActiveLoans() {
  if (!currentUser) return;
  const { data: mine, error: myError } = await db.from("loans").select("id,book_id,borrowed_at,due_at,borrower_name,borrower_contact").eq("borrowed_by", currentUser.id).is("returned_at", null);
  if (myError) console.warn("my loans:", myError.message); else myActiveLoans = new Map((mine || []).map(x => [x.book_id, x]));
  if (isLibrarian) {
    const { data: all, error } = await db.from("loans").select("id,book_id,borrowed_at,due_at,borrower_name,borrower_contact,borrowed_by").is("returned_at", null);
    if (error) console.warn("all loans:", error.message); else librarianActiveLoans = new Map((all || []).map(x => [x.book_id, x]));
  }
}

async function addBook() {
  if (!requireLibrarian()) return;
  const title = $("newTitle").value.trim();
  const author = $("newAuthor").value.trim();
  const category = $("newCategory").value.trim();
  const isbn = $("newIsbn").value.trim();
  const description = $("newDescription").value.trim();
  const copies = Math.max(1, parseInt($("newCopies").value, 10) || 1);
  if (!title) return showToast("กรุณากรอกชื่อหนังสือ", true);
  const { error } = await db.from("books").insert({ title, author: author || null, category: category || null, isbn: isbn || null, description: description || null, total_copies: copies, available_copies: copies });
  if (error) return showToast("เพิ่มหนังสือผิดพลาด: " + error.message, true);
  closeModal(addModal); clearAddForm(); showToast(`เพิ่ม "${title}" จำนวน ${copies} เล่มแล้ว`); await fetchBooks();
}

async function borrowBook(id) {
  if (!requireUser()) return;
  const book = books.find(x => x.id === id);
  if (!book || book.available_copies < 1) return showToast("ไม่มีเล่มว่างให้ยืมแล้ว", true);
  const { error } = await db.rpc("borrow_book", { p_book_id: id });
  if (error) { showToast("ยืมหนังสือไม่สำเร็จ: " + error.message, true); await fetchBooks(); return; }
  closeModal(borrowModal); pendingBorrowId = null; showToast(`ยืมสำเร็จ · กำหนดคืน ${LOAN_DAYS} วัน`); await fetchBooks();
}

async function returnBook(id) {
  if (!requireUser()) return;
  const { error } = await db.rpc("return_book", { p_book_id: id });
  if (error) { showToast("คืนหนังสือไม่สำเร็จ: " + error.message, true); return; }
  showToast("คืนหนังสือแล้ว"); await fetchBooks();
}

async function deleteBook(id) {
  if (!requireLibrarian()) return;
  const book = books.find(x => x.id === id);
  if (!book) return;
  if (!confirm(`ลบ "${book.title}" และประวัติการยืมทั้งหมดออกจากระบบใช่ไหม?`)) return;
  const { error } = await db.from("books").delete().eq("id", id);
  if (error) return showToast("ลบหนังสือผิดพลาด: " + error.message, true);
  closeModal(inspectModal); showToast("ลบหนังสือแล้ว"); await fetchBooks();
}

async function setInventory(id, totalCopies) {
  if (!requireLibrarian()) return;
  const count = Math.max(1, parseInt(totalCopies, 10) || 1);
  const { error } = await db.rpc("set_book_inventory", { p_book_id: id, p_total_copies: count });
  if (error) return showToast("แก้ไขคลังไม่สำเร็จ: " + error.message, true);
  showToast("อัปเดตจำนวนเล่มแล้ว"); await fetchBooks(); openInspectModal(id);
}

function render() {
  const filtered = books.filter(book => {
    const title = (book.title || "").toLowerCase();
    const author = (book.author || "").toLowerCase();
    const matchSearch = !searchTerm || title.includes(searchTerm) || author.includes(searchTerm) || (book.category || "").toLowerCase().includes(searchTerm);
    const matchFilter = currentFilter === "all" || (currentFilter === "available" ? book.available_copies > 0 : book.available_copies < book.total_copies);
    return matchSearch && matchFilter;
  });
  $("statTotal").textContent = books.reduce((sum, b) => sum + Number(b.total_copies || 0), 0);
  $("statAvailable").textContent = books.reduce((sum, b) => sum + Number(b.available_copies || 0), 0);
  $("statBorrowed").textContent = books.reduce((sum, b) => sum + (Number(b.total_copies || 0) - Number(b.available_copies || 0)), 0);
  if (!filtered.length) { bookGrid.innerHTML = `<div class="empty"><div class="glyph">✦ ⋆ ✦</div>${books.length ? "ไม่พบหนังสือที่ตรงกับเงื่อนไข" : "ยังไม่มีหนังสือในห้องสมุด"}</div>`; return; }

  bookGrid.innerHTML = filtered.map(bookCard).join("");
  bookGrid.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", () => {
    const id = button.dataset.id;
    switch (button.dataset.action) {
      case "inspect": openInspectModal(id); break;
      case "borrow": openBorrowModal(id); break;
      case "return": returnBook(id); break;
      case "delete": deleteBook(id); break;
    }
  }));
}

function bookCard(book) {
  const total = Number(book.total_copies || 0);
  const available = Number(book.available_copies || 0);
  const borrowed = total - available;
  const mine = myActiveLoans.has(book.id);
  let actionButtons = `<button class="btn-inspect" data-action="inspect" data-id="${escapeAttribute(book.id)}">ดูรายละเอียด</button>`;
  if (currentUser && available > 0 && !mine) actionButtons += `<button class="btn-borrow" data-action="borrow" data-id="${escapeAttribute(book.id)}">ยืมหนังสือ</button>`;
  if (!currentUser && available > 0) actionButtons += `<button class="btn-borrow" data-action="borrow" data-id="${escapeAttribute(book.id)}">เข้าสู่ระบบเพื่อยืม</button>`;
  if (mine) actionButtons += `<button class="btn-return" data-action="return" data-id="${escapeAttribute(book.id)}">คืนหนังสือ</button>`;
  const statusClass = available > 0 ? "available" : "borrowed";
  return `<div class="card">
    <span class="badge ${statusClass}">${available > 0 ? "มีเล่มว่าง" : "ไม่มีเล่มว่าง"}</span>
    <h3>${escapeHtml(book.title)}</h3>
    <div class="author">${escapeHtml(book.author || "ไม่ระบุผู้แต่ง")}${book.category ? " · " + escapeHtml(book.category) : ""}</div>
    <div class="inventory-bar"><div class="inventory-track"><div class="inventory-fill" style="width:${total ? Math.max(0, Math.min(100, available / total * 100)) : 0}%"></div></div><div class="inventory-text"><span>ว่าง ${available}</span><span>ทั้งหมด ${total}</span></div></div>
    <div class="meta">ถูกยืมอยู่ <span>${borrowed}</span> เล่ม</div>
    <div class="actions">${actionButtons}</div>
  </div>`;
}

function openInspectModal(id) {
  const book = books.find(x => x.id === id);
  if (!book) return showToast("ไม่พบหนังสือเล่มนี้", true);
  inspectedBookId = id;
  const total = Number(book.total_copies || 0), available = Number(book.available_copies || 0), borrowed = total - available;
  const mine = myActiveLoans.get(id);
  const librarianLoan = librarianActiveLoans.get(id);
  const activeLoan = isLibrarian ? librarianLoan : mine;
  const loanInfo = activeLoan ? `<div class="loan-box"><div class="loan-title">📚 การยืมที่กำลังใช้งาน</div><div>ผู้ยืม: <strong>${escapeHtml(activeLoan.borrower_name || "ไม่ระบุ")}</strong></div><div>ยืมเมื่อ: ${formatDate(activeLoan.borrowed_at)}</div><div>กำหนดคืน: <strong>${formatDate(activeLoan.due_at)}</strong></div>${activeLoan.borrower_contact && isLibrarian ? `<div>ติดต่อ: ${escapeHtml(activeLoan.borrower_contact)}</div>` : ""}</div>` : `<div class="loan-box muted-box">${available > 0 ? "ตอนนี้ไม่มีรายการยืมของคุณ" : "ขณะนี้ไม่มีข้อมูลผู้ยืมสำหรับบัญชีนี้"}</div>`;
  const userActions = currentUser && available > 0 && !mine ? `<button class="btn-confirm" data-inspect-action="borrow">ยืมหนังสือ</button>` : "";
  const returnAction = mine ? `<button class="btn-return inspect-return" data-inspect-action="return">คืนหนังสือของฉัน</button>` : (isLibrarian && borrowed > 0 ? `<button class="btn-return inspect-return" data-inspect-action="return">รับคืนหนังสือ</button>` : "");
  const librarianTools = isLibrarian ? `<div class="inventory-editor"><label>จำนวนเล่มในคลัง</label><div class="inventory-edit-row"><input id="inventoryInput" type="number" min="${borrowed || 1}" max="9999" value="${total}"><button class="btn-confirm" data-inspect-action="inventory">บันทึกจำนวน</button></div><small>ต้องมีจำนวนอย่างน้อยเท่ากับจำนวนที่กำลังถูกยืม (${borrowed})</small></div><button class="danger-full" data-inspect-action="delete">ลบหนังสือออกจากคลัง</button>` : "";
  $("inspectContent").innerHTML = `<div class="inspect-head"><div><span class="badge ${available > 0 ? "available" : "borrowed"}">${available > 0 ? "มีเล่มว่าง" : "ไม่มีเล่มว่าง"}</span><h2>${escapeHtml(book.title)}</h2><div class="inspect-author">${escapeHtml(book.author || "ไม่ระบุผู้แต่ง")}</div></div></div>
    <div class="detail-grid"><div><span>หมวดหมู่</span><strong>${escapeHtml(book.category || "ไม่ระบุ")}</strong></div><div><span>ISBN / รหัส</span><strong>${escapeHtml(book.isbn || "ไม่ระบุ")}</strong></div><div><span>ในคลังทั้งหมด</span><strong>${total} เล่ม</strong></div><div><span>พร้อมให้ยืม</span><strong class="ok-text">${available} เล่ม</strong></div><div><span>กำลังถูกยืม</span><strong class="gold-text">${borrowed} เล่ม</strong></div><div><span>เพิ่มเข้าระบบ</span><strong>${formatDate(book.created_at)}</strong></div></div>
    <div class="description"><h3>รายละเอียด</h3><p>${escapeHtml(book.description || "ยังไม่มีคำอธิบายสำหรับหนังสือเล่มนี้")}</p></div>${loanInfo}${librarianTools}<div class="modal-actions">${userActions}${returnAction}<button class="btn-cancel" data-close="inspectModal" type="button">ปิด</button></div>`;
  $("inspectContent").querySelectorAll("[data-inspect-action]").forEach(b => b.addEventListener("click", () => {
    const action = b.dataset.inspectAction;
    if (action === "borrow") openBorrowModal(id);
    if (action === "return") returnBook(id).then(() => openInspectModal(id));
    if (action === "inventory") setInventory(id, $("inventoryInput").value);
    if (action === "delete") deleteBook(id);
  }));
  $("inspectContent").querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => closeModal($(b.dataset.close))));
  openModal(inspectModal);
}

function openBorrowModal(id) {
  if (!requireUser()) return;
  const book = books.find(x => x.id === id);
  if (!book || book.available_copies < 1) return showToast("ไม่มีเล่มว่างให้ยืมแล้ว", true);
  pendingBorrowId = id;
  $("borrowBookName").textContent = `${book.title} · ว่าง ${book.available_copies} เล่ม · กำหนดคืน 30 วัน`;
  closeModal(inspectModal); openModal(borrowModal);
}
function submitBorrow() { if (pendingBorrowId) borrowBook(pendingBorrowId); }
function submitAddBook() { addBook(); }
function clearAddForm() { ["newTitle","newAuthor","newCategory","newIsbn","newDescription"].forEach(id => $(id).value = ""); $("newCopies").value = 1; }
function openModal(modal) { modal.classList.add("show"); }
function closeModal(modal) { if (modal) modal.classList.remove("show"); }
function formatDate(value) { if (!value) return "-"; return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function escapeAttribute(value) { return escapeHtml(value).replace(/`/g, "&#96;"); }
function showToast(message, isError = false) { const toast = $("toast"); toast.textContent = message; toast.className = "toast show" + (isError ? " err" : ""); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove("show"), 3500); }
function buildStars() { const container = $("stars"); let html = ""; for (let i=0;i<90;i++){const size=Math.random()*2.4+.6;html+=`<div class="twinkle" style="width:${size}px;height:${size}px;top:${Math.random()*100}%;left:${Math.random()*100}%;animation-delay:${(Math.random()*4).toFixed(2)}s;animation-duration:${(3+Math.random()*4).toFixed(2)}s"></div>`} for(let i=0;i<3;i++) html+=`<div class="shooting-star" style="top:${5+Math.random()*40}%;left:${50+Math.random()*40}%;animation-delay:${(i*3.2).toFixed(2)}s"></div>`; container.innerHTML=html; }
