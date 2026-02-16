import { db, collection, getDocs, query, where, limit } from "./firebase.js";

document.getElementById("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const thIDInput = document.querySelector("input[name='thID']").value.trim();
    const thIDError = document.getElementById("thID-error");

    thIDError.style.display = "none";

    // Validate thID: must be 13 digits
    if (!/^\d{13}$/.test(thIDInput)) {
        thIDError.style.display = "block";
        return;
    }

    try {
        const studentsRef = collection(db, "students");
        const q = query(studentsRef, where("thID", "==", thIDInput), limit(1));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const data = querySnapshot.docs[0].data();
            sessionStorage.setItem('isLoggedIn', 'true');
            sessionStorage.setItem('thID', thIDInput);
            sessionStorage.setItem('studentID', String(data.studentID || ''));
            window.location.href = 'results.html';
        } else {
            alert("รหัสบัตรประชาชนไม่ถูกต้อง");
        }
    } catch (error) {
        console.error("Error during login:", error);
        alert("เกิดข้อผิดพลาดในการเข้าสู่ระบบ");
    }
});