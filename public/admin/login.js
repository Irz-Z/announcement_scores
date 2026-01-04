import { auth } from "./firebase.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

document.getElementById("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("adminName").value;
    const password = document.getElementById("adminPass").value;
    const errorMessage = document.getElementById("error-message");

    try {
        // ล็อกอินด้วย Email/Password
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        console.log("เข้าสู่ระบบสำเร็จ:", user);

        // ไปยังหน้าหลักของแอดมิน (เปลี่ยน URL ตามที่คุณต้องการ)
        window.location.href = "admin_dashboard.html";
    } catch (error) {
        console.error("Error:", error.message);
        errorMessage.textContent = "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง!";
    }
});
