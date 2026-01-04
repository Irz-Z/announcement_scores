import { db, collection, getDocs } from "./firebase.js";

document.getElementById("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const thIDInput = document.querySelector("input[name='thID']").value.trim();
    const thID = Number(thIDInput); // Convert to number to match Firestore
    const thIDError = document.getElementById("thID-error");

    thIDError.style.display = "none";

    // Validate thID: must be 13 digits
    if (!/^\d{13}$/.test(thIDInput)) {
        thIDError.style.display = "block";
        return;
    }

    try {
        const querySnapshot = await getDocs(collection(db, "students"));
        console.log("Total documents fetched:", querySnapshot.size);
        console.log("Input thID:", { thID, thIDType: typeof thID });

        let found = false;
        let studentID = null; // เพื่อเก็บ studentID สำหรับ redirect
        querySnapshot.forEach(doc => {
            const data = doc.data();
            console.log("Firestore document:", { thID: data.thID, studentID: data.studentID, thIDType: typeof data.thID });
            console.log(`Comparing: input thID=${thID} vs Firestore thID=${data.thID}`);

            // ตรวจสอบเฉพาะ thID
            if (String(data.thID) === String(thID)) {
                found = true;
                studentID = data.studentID; // ดึง studentID จาก Firestore เพื่อใช้ใน redirect
            }
        });

        if (found) {
            console.log("Match found, redirecting...");
            sessionStorage.setItem('isLoggedIn', 'true'); // ตั้งค่าสถานะล็อกอิน
            window.location.href = `results.html?thID=${thID}&studentID=${studentID}`;
        } else {
            console.log("No match found in Firestore.");
            alert("รหัสบัตรประชาชนไม่ถูกต้อง");
        }
    } catch (error) {
        console.error("Error during login:", error);
        alert("เกิดข้อผิดพลาดในการเข้าสู่ระบบ");
    }
});