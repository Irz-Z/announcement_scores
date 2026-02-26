import { db, collection, getDocs, query, where, limit, getDoc, doc } from "./firebase.js";

// ---- Load login mode from Firestore and update UI ----
async function getLoginMode() {
    try {
        const snap = await getDoc(doc(db, 'config', 'settings'));
        return snap.exists() ? (snap.data().loginMode || 'thID') : 'thID';
    } catch {
        return 'thID'; // fallback
    }
}

async function initLoginPage() {
    const mode = await getLoginMode();
    const labelEl = document.getElementById('login-field-label');
    const inputEl = document.getElementById('login-field-input');
    const errorEl = document.getElementById('login-field-error');

    if (mode === 'studentID') {
        labelEl.textContent = 'รหัสผู้เข้าสอบ';
        inputEl.placeholder = 'เช่น A12345678';
        inputEl.removeAttribute('maxLength');
        inputEl.removeAttribute('pattern');
        inputEl.dataset.mode = 'studentID';
        errorEl.textContent = 'กรุณากรอกรหัสผู้เข้าสอบให้ถูกต้อง';
    } else {
        labelEl.textContent = 'รหัสบัตรประชาชน';
        inputEl.placeholder = 'เช่น 1112415655151';
        inputEl.setAttribute('maxLength', '13');
        inputEl.setAttribute('pattern', '\\d{13}');
        inputEl.dataset.mode = 'thID';
        errorEl.textContent = 'กรุณากรอกรหัสบัตรประชาชน 13 หลัก';
    }
}

initLoginPage();

// ---- Handle login form submit ----
document.getElementById("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const inputEl = document.getElementById('login-field-input');
    const errorEl = document.getElementById('login-field-error');
    const mode = inputEl.dataset.mode || 'thID';
    const inputValue = inputEl.value.trim();

    errorEl.classList.add("hidden");

    // Validate
    if (mode === 'thID' && !/^\d{13}$/.test(inputValue)) {
        errorEl.classList.remove("hidden");
        return;
    }
    if (mode === 'studentID' && !inputValue) {
        errorEl.classList.remove("hidden");
        return;
    }

    try {
        const studentsRef = collection(db, "students");
        const q = query(studentsRef, where(mode, "==", inputValue), limit(1));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const data = querySnapshot.docs[0].data();
            sessionStorage.setItem('isLoggedIn', 'true');
            sessionStorage.setItem('thID', String(data.thID || ''));
            sessionStorage.setItem('studentID', String(data.studentID || ''));
            window.location.href = 'results.html';
        } else {
            const fieldLabel = mode === 'studentID' ? 'รหัสผู้เข้าสอบ' : 'รหัสบัตรประชาชน';
            alert(`ไม่พบข้อมูลนักเรียน — ${fieldLabel}ไม่ถูกต้อง`);
        }
    } catch (error) {
        console.error("Error during login:", error);
        alert("เกิดข้อผิดพลาดในการเข้าสู่ระบบ");
    }
});