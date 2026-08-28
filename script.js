/*
  Galaxy Library
  ------------------------------------------------------------
  Accounts:
    - Any Google account can sign in automatically.
    - Normal users can ONLY borrow and return books.
    - The librarian account can add/delete books and manage returns.

  Librarian Google account:
    raminbaandit4@gmail.com

  IMPORTANT:
    Put only your Supabase URL + publishable/anon key here.
    NEVER put the service_role/secret key in this file.
*/

const SUPABASE_URL = "PASTE_YOUR_SUPABASE_PROJECT_URL_HERE";
const SUPABASE_ANON_KEY = "PASTE_YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY_HERE";
const LIBRARIAN_EMAIL = "raminbaandit4@gmail.com";
const LOAN_DAYS = 30;

const isConfigured =
  !SUPABASE_URL.includes("PASTE_YOUR") &&
  !SUPABASE_ANON_KEY.includes("PASTE_YOUR");

let db = null;
let currentUser = null;
let isLibrarian = false;
let books = [];
let myActiveLoans = new Set();
let currentFilter = "all";
let searchTerm = "";
let pendingBorrowId = null;

const $ = (id) => document.getElementById(id);

const configBanner = $("configBanner");
const loginBanner = $("loginBanner");
const authArea = $("authArea");
const bookGrid = $("bookGrid");
const addModal = $("addModal");
const borrowModal = $("borrowModal");

document.addEventListener("DOMContentLoaded", init);

async function init() {
  buildStars();
  bindUI();

  if (!isConfigured) {
    configBanner.classList.add("show");
    bookGrid.innerHTML =
      '<div class="empty"><div class="glyph">⚠</div>กรุณาตั้งค่า Supabase ใน script.js ก่อน</div>';
    updateAuthUI(null);
    return;
  }

  if (!window.supabase) {
    configBanner.classList.add("show");
    configBanner.innerHTML =
      "⚠️ <b>โหลด Supabase ไม่สำเร็จ</b><br>ตรวจสอบอินเทอร์เน็ตหรือ CDN ใน index.html";
    return;
  }

  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  db.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => handleSession(session), 0);
  });

  const { data, error } = await db.auth.getSession();
  if (error) showToast("ตรวจสอบเซสชันไม่สำเร็จ: " + error.message, true);

  await handleSession(data?.session ?? null);
  await fetchBooks();
}

async function handleSession(session) {
  currentUser = session?.user ?? null;

  const email = currentUser?.email?.trim().toLowerCase() ?? "";
  isLibrarian = email === LIBRARIAN_EMAIL.toLowerCase();

  updateAuthUI(currentUser);
  updateLibrarianUI();

  if (db && currentUser) {
    await fetchMyActiveLoans();
  } else {
    myActiveLoans = new Set();
  }

  render();
}

function bindUI() {
  $("searchInput").addEventListener("input", (event) => {
    searchTerm = event.target.value.trim().toLowerCase();
    render();
  });

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((x) => x.classList.remove("active"));
      chip.classList.add("active");
      currentFilter = chip.dataset.filter;
      render();
    });
  });

  $("loginButton").addEventListener("click", signInWithGoogle);

  $("openAddModal").addEventListener("click", () => {
    if (!requireLibrarian()) return;
    openModal(addModal);
    $("newTitle").focus();
  });

  $("confirmAdd").addEventListener("click", submitAddBook);
  $("confirmBorrow").addEventListener("click", submitBorrow);

  document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => closeModal($(button.dataset.close)));
  });

  [addModal, borrowModal].forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal(modal);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal(addModal);
      closeModal(borrowModal);
    }
  });
}

function updateAuthUI(user) {
  if (!user) {
    authArea.innerHTML =
      '<button class="btn-login" id="headerLoginButton" type="button">Google Login</button>';
    $("headerLoginButton").addEventListener("click", signInWithGoogle);
    loginBanner.classList.remove("hidden");
    $("loginButton").classList.remove("hidden");
    $("loginButton").textContent = "เข้าสู่ระบบด้วย Google";
    return;
  }

  const email = escapeHtml(user.email || "");
  const name = escapeHtml(
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email ||
    "Google User"
  );

  const avatar = user.user_metadata?.avatar_url
    ? `<img class="auth-avatar" src="${escapeAttribute(user.user_metadata.avatar_url)}" alt="">`
    : "";

  authArea.innerHTML = `
    <div class="user-pill">
      ${avatar}
      <span>${name}${isLibrarian ? " · Librarian" : ""}</span>
    </div>
    <button class="btn-logout" id="logoutButton" type="button">ออกจากระบบ</button>
  `;

  $("logoutButton").addEventListener("click", signOut);
  loginBanner.classList.add("hidden");

  // Avoid putting the librarian-only wording on normal users.
  if (!isLibrarian) {
    $("openAddModal").classList.add("hidden");
  }

  void email;
}

function updateLibrarianUI() {
  document.querySelectorAll(".librarian-only").forEach((element) => {
    element.classList.toggle("hidden", !isLibrarian);
  });
  render();
}

async function signInWithGoogle() {
  if (!db) {
    showToast("ยังไม่ได้เชื่อมต่อ Supabase", true);
    return;
  }

  const redirectTo = window.location.origin + window.location.pathname;

  const { error } = await db.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo }
  });

  if (error) showToast("เข้าสู่ระบบไม่สำเร็จ: " + error.message, true);
}

async function signOut() {
  if (!db) return;
  const { error } = await db.auth.signOut();
  if (error) {
    showToast("ออกจากระบบไม่สำเร็จ: " + error.message, true);
    return;
  }
  showToast("ออกจากระบบแล้ว");
}

function requireUser() {
  if (!currentUser) {
    showToast("กรุณาเข้าสู่ระบบด้วย Google ก่อน", true);
    return false;
  }
  return true;
}

function requireLibrarian() {
  if (!requireUser()) return false;
  if (!isLibrarian) {
    showToast("บัญชีนี้ไม่มีสิทธิ์ Librarian", true);
    return false;
  }
  return true;
}

/* -------------------- Database -------------------- */

async function expireOverdueLoans() {
  if (!db) return;

  const { error } = await db.rpc("expire_overdue_loans");
  if (error) {
    // Do not block the catalogue if the optional cleanup call fails.
    console.warn("expire_overdue_loans:", error.message);
  }
}

async function fetchBooks() {
  if (!db) return;

  bookGrid.innerHTML = '<div class="loading">กำลังโหลดข้อมูลจากจักรวาล...</div>';

  await expireOverdueLoans();

  const { data, error } = await db
    .from("books")
    .select("id,title,author,category,status,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    bookGrid.innerHTML =
      '<div class="empty"><div class="glyph">⚠</div>โหลดหนังสือไม่สำเร็จ</div>';
    showToast("โหลดหนังสือผิดพลาด: " + error.message, true);
    return;
  }

  books = data ?? [];

  if (currentUser) await fetchMyActiveLoans();
  render();
}

async function fetchMyActiveLoans() {
  if (!db || !currentUser) {
    myActiveLoans = new Set();
    return;
  }

  const { data, error } = await db
    .from("loans")
    .select("book_id")
    .eq("borrowed_by", currentUser.id)
    .is("returned_at", null);

  if (error) {
    console.warn("fetchMyActiveLoans:", error.message);
    myActiveLoans = new Set();
    return;
  }

  myActiveLoans = new Set((data ?? []).map((loan) => loan.book_id));
}

async function addBook(title, author, category) {
  if (!requireLibrarian()) return;

  const { error } = await db.from("books").insert({
    title,
    author: author || null,
    category: category || null,
    status: "available"
  });

  if (error) {
    showToast("เพิ่มหนังสือผิดพลาด: " + error.message, true);
    return;
  }

  closeModal(addModal);
  clearAddForm();
  showToast(`เพิ่มหนังสือ "${title}" เรียบร้อย`);
  await fetchBooks();
}

async function borrowBook(id) {
  if (!requireUser()) return;

  const book = books.find((item) => item.id === id);
  if (!book) {
    showToast("ไม่พบหนังสือเล่มนี้", true);
    return;
  }

  if (book.status !== "available") {
    showToast("หนังสือเล่มนี้ถูกยืมไปแล้ว", true);
    closeModal(borrowModal);
    await fetchBooks();
    return;
  }

  const { error } = await db.rpc("borrow_book", { p_book_id: id });

  if (error) {
    showToast("ยืมหนังสือไม่สำเร็จ: " + error.message, true);
    await fetchBooks();
    return;
  }

  closeModal(borrowModal);
  pendingBorrowId = null;
  showToast(`ยืมสำเร็จ · กำหนดคืนภายใน ${LOAN_DAYS} วัน`);
  await fetchBooks();
}

async function returnBook(id) {
  if (!requireUser()) return;

  const { error } = await db.rpc("return_book", { p_book_id: id });

  if (error) {
    showToast("คืนหนังสือไม่สำเร็จ: " + error.message, true);
    await fetchBooks();
    return;
  }

  showToast("คืนหนังสือแล้ว");
  await fetchBooks();
}

async function deleteBook(id) {
  if (!requireLibrarian()) return;

  const book = books.find((item) => item.id === id);
  const title = book?.title || "หนังสือเล่มนี้";

  if (!confirm(`ลบ "${title}" ออกจากระบบใช่ไหม?`)) return;

  const { error } = await db.from("books").delete().eq("id", id);

  if (error) {
    showToast("ลบหนังสือผิดพลาด: " + error.message, true);
    return;
  }

  showToast("ลบหนังสือแล้ว");
  await fetchBooks();
}

/* -------------------- Rendering -------------------- */

function render() {
  const filtered = books.filter((book) => {
    const matchFilter = currentFilter === "all" || book.status === currentFilter;
    const title = (book.title || "").toLowerCase();
    const author = (book.author || "").toLowerCase();
    const matchSearch = !searchTerm || title.includes(searchTerm) || author.includes(searchTerm);
    return matchFilter && matchSearch;
  });

  $("statTotal").textContent = books.length;
  $("statAvailable").textContent = books.filter((book) => book.status === "available").length;
  $("statBorrowed").textContent = books.filter((book) => book.status === "borrowed").length;

  if (filtered.length === 0) {
    bookGrid.innerHTML = `
      <div class="empty">
        <div class="glyph">✦ ⋆ ✦</div>
        ${books.length === 0 ? "ยังไม่มีหนังสือในห้องสมุด" : "ไม่พบหนังสือที่ตรงกับเงื่อนไข"}
      </div>
    `;
    return;
  }

  bookGrid.innerHTML = filtered.map((book) => {
    const available = book.status === "available";
    const canBorrow = Boolean(currentUser) && available;
    const canReturn = Boolean(currentUser) && !available && (isLibrarian || myActiveLoans.has(book.id));

    let actionButtons = "";

    if (canBorrow) {
      actionButtons += `<button class="btn-borrow" data-action="borrow" data-id="${escapeAttribute(book.id)}">ยืมหนังสือ</button>`;
    }

    if (canReturn) {
      actionButtons += `<button class="btn-return" data-action="return" data-id="${escapeAttribute(book.id)}">คืนหนังสือ</button>`;
    }

    if (isLibrarian) {
      actionButtons += `<button class="btn-del" data-action="delete" data-id="${escapeAttribute(book.id)}" title="ลบ">✕</button>`;
    }

    const deadlineText = !available
      ? `<div class="meta">สถานะ: <span>กำลังถูกยืม</span></div>`
      : `<div class="meta">สถานะ: <span>พร้อมให้ยืม</span></div>`;

    return `
      <div class="card">
        <span class="badge ${available ? "available" : "borrowed"}">
          ${available ? "พร้อมให้ยืม" : "ถูกยืมอยู่"}
        </span>

        <h3>${escapeHtml(book.title)}</h3>

        <div class="author">
          ${escapeHtml(book.author || "ไม่ระบุผู้แต่ง")}
          ${book.category ? " · " + escapeHtml(book.category) : ""}
        </div>

        ${deadlineText}

        ${actionButtons ? `<div class="actions">${actionButtons}</div>` : ""}
      </div>
    `;
  }).join("");

  bookGrid.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.id;
      const action = button.dataset.action;
      if (action === "borrow") openBorrowModal(id);
      if (action === "return") returnBook(id);
      if (action === "delete") deleteBook(id);
    });
  });
}

/* -------------------- Modals -------------------- */

function openModal(modal) {
  modal.classList.add("show");
}

function closeModal(modal) {
  if (!modal) return;
  modal.classList.remove("show");
}

function openBorrowModal(id) {
  if (!requireUser()) return;

  const book = books.find((item) => item.id === id);
  if (!book) {
    showToast("ไม่พบหนังสือเล่มนี้", true);
    return;
  }

  if (book.status !== "available") {
    showToast("หนังสือเล่มนี้ถูกยืมไปแล้ว", true);
    return;
  }

  pendingBorrowId = id;
  $("borrowBookName").textContent = `หนังสือ: ${book.title}`;
  openModal(borrowModal);
}

async function submitAddBook() {
  const title = $("newTitle").value.trim();
  const author = $("newAuthor").value.trim();
  const category = $("newCategory").value.trim();

  if (!title) {
    showToast("กรุณากรอกชื่อหนังสือ", true);
    $("newTitle").focus();
    return;
  }

  await addBook(title, author, category);
}

async function submitBorrow() {
  if (!pendingBorrowId) return;
  const id = pendingBorrowId;
  await borrowBook(id);
}

function clearAddForm() {
  $("newTitle").value = "";
  $("newAuthor").value = "";
  $("newCategory").value = "";
}

/* -------------------- Helpers -------------------- */

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function showToast(message, isError = false) {
  const toast = $("toast");
  toast.textContent = message;
  toast.className = "toast show" + (isError ? " err" : "");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3000);
}

function buildStars() {
  const container = $("stars");
  let html = "";

  for (let i = 0; i < 90; i++) {
    const size = Math.random() * 2.4 + 0.6;
    html += `
      <div class="twinkle" style="
        width:${size}px;
        height:${size}px;
        top:${Math.random() * 100}%;
        left:${Math.random() * 100}%;
        animation-delay:${(Math.random() * 4).toFixed(2)}s;
        animation-duration:${(3 + Math.random() * 4).toFixed(2)}s;
      "></div>
    `;
  }

  for (let i = 0; i < 3; i++) {
    html += `
      <div class="shooting-star" style="
        top:${5 + Math.random() * 40}%;
        left:${50 + Math.random() * 40}%;
        animation-delay:${(i * 3.2).toFixed(2)}s;
      "></div>
    `;
  }

  container.innerHTML = html;
}
