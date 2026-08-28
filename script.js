// ============================================================
// GALAXY LIBRARY
// Supabase + Google Authentication
// ============================================================

const SUPABASE_URL =
    "https://etxezwalaxywjdvrojc.supabase.co";

const SUPABASE_ANON_KEY =
    "sb_publishable_sXSm5tjEOyVRrwYHdh2fVw_DZ26OX0l";

const LIBRARIAN_EMAIL =
    "raminbaandit4@gmail.com";


// ============================================================
// SUPABASE
// ============================================================

if (!window.supabase) {
    console.error("Supabase library was not loaded.");
    throw new Error("Supabase library missing.");
}

const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);


// ============================================================
// STATE
// ============================================================

let books = [];

let loans = [];

let currentUser = null;

let currentProfile = null;

let currentFilter = "all";

let searchTerm = "";

let pendingBorrowId = null;


// ============================================================
// DOM
// ============================================================

const bookGrid =
    document.getElementById("bookGrid");

const addModal =
    document.getElementById("addModal");

const borrowModal =
    document.getElementById("borrowModal");

const toast =
    document.getElementById("toast");


// ============================================================
// STARFIELD
// ============================================================

function buildStars() {

    const container =
        document.getElementById("stars");

    if (!container) return;

    let html = "";

    for (let i = 0; i < 90; i++) {

        const size =
            Math.random() * 2.4 + 0.6;

        html += `
            <div class="twinkle"
                style="
                    width:${size}px;
                    height:${size}px;
                    top:${Math.random() * 100}%;
                    left:${Math.random() * 100}%;
                    animation-delay:${(
                        Math.random() * 4
                    ).toFixed(2)}s;
                    animation-duration:${(
                        3 + Math.random() * 4
                    ).toFixed(2)}s;
                ">
            </div>
        `;
    }

    for (let i = 0; i < 3; i++) {

        html += `
            <div class="shooting-star"
                style="
                    top:${5 + Math.random() * 40}%;
                    left:${50 + Math.random() * 40}%;
                    animation-delay:${(
                        i * 3.2
                    ).toFixed(2)}s;
                ">
            </div>
        `;
    }

    container.innerHTML = html;
}

buildStars();


// ============================================================
// TOAST
// ============================================================

function showToast(message, error = false) {

    if (!toast) return;

    toast.textContent = message;

    toast.className =
        "toast show" + (error ? " err" : "");

    setTimeout(() => {

        toast.classList.remove("show");

    }, 3000);
}


// ============================================================
// AUTH UI
// ============================================================

function createAuthUI() {

    const header =
        document.querySelector("header");

    if (!header) return;

    if (document.getElementById("authPanel"))
        return;

    const panel =
        document.createElement("div");

    panel.id = "authPanel";

    panel.innerHTML = `
        <div id="authLoggedOut">

            <button
                id="googleLoginButton"
                class="auth-button"
                type="button">

                <span class="google-icon">G</span>
                Sign in with Google

            </button>

        </div>

        <div
            id="authLoggedIn"
            style="display:none;">

            <div class="auth-user">

                <div>
                    <div
                        id="authUserName"
                        class="auth-user-name">
                    </div>

                    <div
                        id="authUserEmail"
                        class="auth-user-email">
                    </div>

                    <span
                        id="authUserRole"
                        class="auth-role">
                    </span>
                </div>

                <button
                    id="googleLogoutButton"
                    class="auth-logout"
                    type="button">

                    Sign out

                </button>

            </div>

        </div>
    `;

    header.appendChild(panel);


    document
        .getElementById("googleLoginButton")
        .addEventListener(
            "click",
            signInWithGoogle
        );


    document
        .getElementById("googleLogoutButton")
        .addEventListener(
            "click",
            signOut
        );
}


// ============================================================
// AUTH
// ============================================================

async function signInWithGoogle() {

    try {

        const redirectUrl =
            window.location.origin +
            window.location.pathname;

        const { error } =
            await db.auth.signInWithOAuth({

                provider: "google",

                options: {
                    redirectTo: redirectUrl
                }

            });

        if (error)
            throw error;

    } catch (error) {

        console.error(error);

        showToast(
            "เข้าสู่ระบบไม่สำเร็จ: " +
            error.message,
            true
        );
    }
}


async function signOut() {

    const { error } =
        await db.auth.signOut();

    if (error) {

        showToast(
            "ออกจากระบบไม่สำเร็จ: " +
            error.message,
            true
        );

        return;
    }

    showToast("ออกจากระบบแล้ว");

    currentUser = null;

    currentProfile = null;

    loans = [];

    updateAuthUI();

    render();
}


// ============================================================
// LOAD PROFILE
// ============================================================

async function loadProfile(user) {

    if (!user) {

        currentProfile = null;

        return;
    }


    const { data, error } =
        await db
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .maybeSingle();


    if (error) {

        console.error(
            "Profile error:",
            error
        );

        currentProfile = {

            id: user.id,

            email:
                user.email || "",

            display_name:
                user.user_metadata?.full_name ||
                user.user_metadata?.name ||
                user.email,

            role:
                user.email?.toLowerCase() ===
                LIBRARIAN_EMAIL
                    ? "librarian"
                    : "user"

        };

        return;
    }


    currentProfile = data;
}


// ============================================================
// AUTH UI UPDATE
// ============================================================

function updateAuthUI() {

    const loggedOut =
        document.getElementById(
            "authLoggedOut"
        );

    const loggedIn =
        document.getElementById(
            "authLoggedIn"
        );


    const addButton =
        document.getElementById(
            "openAddModal"
        );


    if (!currentUser) {

        if (loggedOut)
            loggedOut.style.display = "block";

        if (loggedIn)
            loggedIn.style.display = "none";


        if (addButton) {

            addButton.style.display =
                "none";

        }

        return;
    }


    if (loggedOut)
        loggedOut.style.display = "none";


    if (loggedIn)
        loggedIn.style.display = "block";


    const name =
        document.getElementById(
            "authUserName"
        );

    const email =
        document.getElementById(
            "authUserEmail"
        );

    const role =
        document.getElementById(
            "authUserRole"
        );


    if (name) {

        name.textContent =
            currentProfile?.display_name ||
            currentUser.user_metadata?.full_name ||
            currentUser.email ||
            "Google User";

    }


    if (email) {

        email.textContent =
            currentUser.email || "";

    }


    const librarian =
        isLibrarian();


    if (role) {

        role.textContent =
            librarian
                ? "👑 Librarian"
                : "📚 Library User";

        role.className =
            "auth-role " +
            (librarian
                ? "librarian"
                : "user");

    }


    if (addButton) {

        addButton.style.display =
            librarian
                ? ""
                : "none";

    }
}


// ============================================================
// ROLE
// ============================================================

function isLibrarian() {

    if (!currentUser)
        return false;


    return (
        currentProfile?.role === "librarian" ||
        currentUser.email?.toLowerCase() ===
            LIBRARIAN_EMAIL
    );
}


// ============================================================
// BOOKS
// ============================================================

async function fetchBooks() {

    const { data, error } =
        await db
            .from("books")
            .select("*")
            .order(
                "created_at",
                {
                    ascending: false
                }
            );


    if (error) {

        console.error(error);

        showToast(
            "โหลดหนังสือไม่สำเร็จ: " +
            error.message,
            true
        );

        books = [];

        render();

        return;
    }


    books = data || [];

    await fetchLoans();

    render();
}


// ============================================================
// LOANS
// ============================================================

async function fetchLoans() {

    if (!currentUser) {

        loans = [];

        return;
    }


    let query =
        db
            .from("loans")
            .select("*")
            .is("returned_at", null);


    if (!isLibrarian()) {

        query =
            query.eq(
                "user_id",
                currentUser.id
            );
    }


    const { data, error } =
        await query;


    if (error) {

        console.error(error);

        loans = [];

        return;
    }


    loans = data || [];
}


// ============================================================
// ADD BOOK
// ============================================================

async function addBook(
    title,
    author,
    category
) {

    if (!isLibrarian()) {

        showToast(
            "เฉพาะ Librarian เท่านั้น",
            true
        );

        return;
    }


    const { error } =
        await db
            .from("books")
            .insert({

                title,
                author:
                    author || null,

                category:
                    category || null,

                status:
                    "available"

            });


    if (error) {

        console.error(error);

        showToast(
            "เพิ่มหนังสือไม่สำเร็จ: " +
            error.message,
            true
        );

        return;
    }


    showToast(
        `เพิ่ม "${title}" เรียบร้อยแล้ว`
    );


    await fetchBooks();
}


// ============================================================
// BORROW
// ============================================================

async function borrowBook(
    id,
    name,
    contact
) {

    if (!currentUser) {

        showToast(
            "กรุณาเข้าสู่ระบบก่อนยืมหนังสือ",
            true
        );

        return;
    }


    const { data, error } =
        await db.rpc(
            "borrow_book",
            {
                p_book_id: id,

                p_borrower_name:
                    name,

                p_borrower_contact:
                    contact || null
            }
        );


    if (error) {

        console.error(error);

        showToast(
            "ยืมหนังสือไม่สำเร็จ: " +
            error.message,
            true
        );

        return;
    }


    console.log(
        "Borrow result:",
        data
    );


    showToast(
        "ยืมหนังสือสำเร็จ 📚"
    );


    await fetchBooks();
}


// ============================================================
// RETURN
// ============================================================

async function returnLoan(
    loanId
) {

    if (!currentUser) {

        showToast(
            "กรุณาเข้าสู่ระบบก่อน",
            true
        );

        return;
    }


    const { error } =
        await db.rpc(
            "return_book",
            {
                p_loan_id: loanId
            }
        );


    if (error) {

        console.error(error);

        showToast(
            "คืนหนังสือไม่สำเร็จ: " +
            error.message,
            true
        );

        return;
    }


    showToast(
        "คืนหนังสือเรียบร้อยแล้ว 🔄"
    );


    await fetchBooks();
}


// ============================================================
// DELETE BOOK
// ============================================================

async function deleteBook(
    id
) {

    if (!isLibrarian()) {

        showToast(
            "เฉพาะ Librarian เท่านั้น",
            true
        );

        return;
    }


    if (
        !confirm(
            "ลบหนังสือเล่มนี้ออกจากระบบใช่ไหม?"
        )
    ) {
        return;
    }


    const { error } =
        await db
            .from("books")
            .delete()
            .eq("id", id);


    if (error) {

        console.error(error);

        showToast(
            "ลบหนังสือไม่สำเร็จ: " +
            error.message,
            true
        );

        return;
    }


    showToast(
        "ลบหนังสือแล้ว"
    );


    await fetchBooks();
}


// ============================================================
// FIND ACTIVE LOAN FOR BOOK
// ============================================================

function getActiveLoan(bookId) {

    return loans.find(
        loan =>
            loan.book_id === bookId &&
            !loan.returned_at
    );
}


// ============================================================
// RENDER
// ============================================================

function render() {

    if (!bookGrid)
        return;


    const filtered =
        books.filter(book => {

            const filterMatch =
                currentFilter === "all" ||
                book.status === currentFilter;


            const title =
                (
                    book.title || ""
                ).toLowerCase();


            const author =
                (
                    book.author || ""
                ).toLowerCase();


            const category =
                (
                    book.category || ""
                ).toLowerCase();


            const searchMatch =
                !searchTerm ||

                title.includes(
                    searchTerm
                ) ||

                author.includes(
                    searchTerm
                ) ||

                category.includes(
                    searchTerm
                );


            return (
                filterMatch &&
                searchMatch
            );
        });


    document.getElementById(
        "statTotal"
    ).textContent =
        books.length;


    document.getElementById(
        "statAvailable"
    ).textContent =
        books.filter(
            b =>
                b.status ===
                "available"
        ).length;


    document.getElementById(
        "statBorrowed"
    ).textContent =
        books.filter(
            b =>
                b.status ===
                "borrowed"
        ).length;


    if (filtered.length === 0) {

        bookGrid.innerHTML = `
            <div class="empty">

                <div class="glyph">
                    ✦ ⋆ ✦
                </div>

                ไม่พบหนังสือที่ตรงกับเงื่อนไข

            </div>
        `;

        return;
    }


    bookGrid.innerHTML =
        filtered.map(
            book =>
                renderBookCard(book)
        ).join("");
}


// ============================================================
// BOOK CARD
// ============================================================

function renderBookCard(
    book
) {

    const available =
        book.status === "available";


    const loan =
        getActiveLoan(book.id);


    let actionButton = "";


    if (available) {

        if (currentUser) {

            actionButton = `
                <button
                    class="btn-borrow"
                    onclick="openBorrowModal('${book.id}')">

                    ยืมหนังสือ

                </button>
            `;

        } else {

            actionButton = `
                <button
                    class="btn-borrow"
                    onclick="requireLogin()">

                    เข้าสู่ระบบเพื่อยืม

                </button>
            `;
        }

    } else {

        if (
            currentUser &&
            loan &&
            (
                loan.user_id ===
                    currentUser.id ||
                isLibrarian()
            )
        ) {

            actionButton = `
                <button
                    class="btn-return"
                    onclick="returnLoan('${loan.id}')">

                    คืนหนังสือ

                </button>
            `;

        } else if (isLibrarian()) {

            actionButton = `
                <button
                    class="btn-return"
                    onclick="returnLoan('${loan?.id || ""}')"
                    ${loan ? "" : "disabled"}>

                    จัดการคืน

                </button>
            `;

        } else {

            actionButton = `
                <button
                    class="btn-borrow"
                    disabled>

                    ถูกยืมอยู่

                </button>
            `;
        }
    }


    const deleteButton =
        isLibrarian()
            ? `
                <button
                    class="btn-del"
                    onclick="deleteBook('${book.id}')"
                    title="ลบ">

                    ✕

                </button>
            `
            : "";


    let loanInfo = "";


    // Only librarian can see borrower information.
    if (
        !available &&
        isLibrarian() &&
        loan
    ) {

        loanInfo = `
            <div class="meta">

                ผู้ยืม:
                <span>
                    ${escapeHtml(
                        loan.borrower_name
                    )}
                </span>

                <br>

                ติดต่อ:
                <span>
                    ${escapeHtml(
                        loan.borrower_contact ||
                        "-"
                    )}
                </span>

                <br>

                วันที่ยืม:
                <span>
                    ${fmtDate(
                        loan.borrowed_at
                    )}
                </span>

            </div>
        `;

    } else if (
        !available
    ) {

        loanInfo = `
            <div class="meta">

                สถานะ:
                <span>
                    หนังสือกำลังถูกยืม
                </span>

            </div>
        `;
    }


    return `
        <div class="card">

            <span
                class="badge ${
                    available
                        ? "available"
                        : "borrowed"
                }">

                ${
                    available
                        ? "พร้อมให้ยืม"
                        : "ถูกยืมอยู่"
                }

            </span>


            <h3>
                ${escapeHtml(
                    book.title
                )}
            </h3>


            <div class="author">

                ${escapeHtml(
                    book.author ||
                    "ไม่ระบุผู้แต่ง"
                )}

                ${
                    book.category
                        ? " · " +
                          escapeHtml(
                              book.category
                          )
                        : ""
                }

            </div>


            ${loanInfo}


            <div class="actions">

                ${actionButton}

                ${deleteButton}

            </div>

        </div>
    `;
}


// ============================================================
// REQUIRE LOGIN
// ============================================================

window.requireLogin =
    function () {

        showToast(
            "กรุณาเข้าสู่ระบบด้วย Google ก่อน",
            true
        );

        document
            .getElementById(
                "googleLoginButton"
            )
            ?.click();
    };


// ============================================================
// DATE
// ============================================================

function fmtDate(
    date
) {

    if (!date)
        return "-";


    return new Date(
        date
    ).toLocaleDateString(
        "th-TH",
        {
            day: "numeric",
            month: "short",
            year: "numeric"
        }
    );
}


// ============================================================
// ESCAPE HTML
// ============================================================

function escapeHtml(
    value
) {

    return String(
        value ?? ""
    ).replace(
        /[&<>"']/g,
        character => ({
            "&":
                "&amp;",

            "<":
                "&lt;",

            ">":
                "&gt;",

            '"':
                "&quot;",

            "'":
                "&#39;"
        })[character]
    );
}


// ============================================================
// ADD MODAL
// ============================================================

function setupAddModal() {

    const open =
        document.getElementById(
            "openAddModal"
        );

    const cancel =
        document.getElementById(
            "cancelAdd"
        );

    const confirmButton =
        document.getElementById(
            "confirmAdd"
        );


    if (open) {

        open.onclick =
            () => {

                if (!isLibrarian()) {

                    showToast(
                        "เฉพาะ Librarian เท่านั้น",
                        true
                    );

                    return;
                }

                addModal
                    ?.classList
                    .add("show");
            };
    }


    if (cancel) {

        cancel.onclick =
            () => {

                addModal
                    ?.classList
                    .remove("show");
            };
    }


    if (confirmButton) {

        confirmButton.onclick =
            async () => {

                const title =
                    document
                        .getElementById(
                            "newTitle"
                        )
                        .value
                        .trim();


                const author =
                    document
                        .getElementById(
                            "newAuthor"
                        )
                        .value
                        .trim();


                const category =
                    document
                        .getElementById(
                            "newCategory"
                        )
                        .value
                        .trim();


                if (!title) {

                    showToast(
                        "กรุณากรอกชื่อหนังสือ",
                        true
                    );

                    return;
                }


                await addBook(
                    title,
                    author,
                    category
                );


                document
                    .getElementById(
                        "newTitle"
                    )
                    .value = "";


                document
                    .getElementById(
                        "newAuthor"
                    )
                    .value = "";


                document
                    .getElementById(
                        "newCategory"
                    )
                    .value = "";


                addModal
                    ?.classList
                    .remove("show");
            };
    }
}


// ============================================================
// BORROW MODAL
// ============================================================

window.openBorrowModal =
    function (bookId) {

        if (!currentUser) {

            requireLogin();

            return;
        }


        pendingBorrowId =
            bookId;


        borrowModal
            ?.classList
            .add("show");
    };


function setupBorrowModal() {

    const cancel =
        document.getElementById(
            "cancelBorrow"
        );


    const confirmButton =
        document.getElementById(
            "confirmBorrow"
        );


    if (cancel) {

        cancel.onclick =
            () => {

                pendingBorrowId =
                    null;

                borrowModal
                    ?.classList
                    .remove("show");
            };
    }


    if (confirmButton) {

        confirmButton.onclick =
            async () => {

                const name =
                    document
                        .getElementById(
                            "borrowerName"
                        )
                        .value
                        .trim();


                const contact =
                    document
                        .getElementById(
                            "borrowerContact"
                        )
                        .value
                        .trim();


                if (!name) {

                    showToast(
                        "กรุณากรอกชื่อผู้ยืม",
                        true
                    );

                    return;
                }


                if (!pendingBorrowId) {

                    showToast(
                        "ไม่พบหนังสือ",
                        true
                    );

                    return;
                }


                confirmButton.disabled =
                    true;


                await borrowBook(
                    pendingBorrowId,
                    name,
                    contact
                );


                confirmButton.disabled =
                    false;


                document
                    .getElementById(
                        "borrowerName"
                    )
                    .value = "";


                document
                    .getElementById(
                        "borrowerContact"
                    )
                    .value = "";


                pendingBorrowId =
                    null;


                borrowModal
                    ?.classList
                    .remove("show");
            };
    }
}


// ============================================================
// MODAL CLICK OUTSIDE
// ============================================================

[
    addModal,
    borrowModal
].forEach(
    modal => {

        if (!modal) return;

        modal.addEventListener(
            "click",
            event => {

                if (
                    event.target ===
                    modal
                ) {

                    modal.classList
                        .remove("show");

                }
            }
        );
    }
);


// ============================================================
// FILTERS
// ============================================================

document
    .querySelectorAll(".chip")
    .forEach(
        chip => {

            chip.addEventListener(
                "click",
                () => {

                    document
                        .querySelectorAll(
                            ".chip"
                        )
                        .forEach(
                            c =>
                                c.classList
                                    .remove(
                                        "active"
                                    )
                        );


                    chip.classList
                        .add("active");


                    currentFilter =
                        chip.dataset.filter;


                    render();
                }
            );
        }
    );


// ============================================================
// SEARCH
// ============================================================

const searchInput =
    document.getElementById(
        "searchInput"
    );


if (searchInput) {

    searchInput.addEventListener(
        "input",
        event => {

            searchTerm =
                event.target.value
                    .toLowerCase()
                    .trim();

            render();
        }
    );
}


// ============================================================
// AUTH STATE
// ============================================================

async function handleAuthSession(
    session
) {

    currentUser =
        session?.user || null;


    if (currentUser) {

        await loadProfile(
            currentUser
        );

    } else {

        currentProfile =
            null;
    }


    updateAuthUI();

    await fetchBooks();
}


// ============================================================
// AUTH LISTENER
// ============================================================

db.auth.onAuthStateChange(
    async (
        event,
        session
    ) => {

        console.log(
            "Auth event:",
            event
        );


        await handleAuthSession(
            session
        );
    }
);


// ============================================================
// INITIALIZE
// ============================================================

async function initialize() {

    createAuthUI();

    setupAddModal();

    setupBorrowModal();


    const {
        data,
        error
    } =
        await db.auth.getSession();


    if (error) {

        console.error(error);

        showToast(
            "โหลด session ไม่สำเร็จ",
            true
        );
    }


    await handleAuthSession(
        data?.session || null
    );
}


initialize();