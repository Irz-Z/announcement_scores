import { db, collection, getDocs } from "./firebase.js";

// Check if user is logged in
if (!sessionStorage.getItem('isLoggedIn')) {
    window.location.href = 'index.html';
}

// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const thID = Number(urlParams.get('thID')); // Convert to number to match Firestore
const studentID = urlParams.get('studentID').toLowerCase(); // Normalize to lowercase

const studentInfoDiv = document.getElementById('student-info');
const errorMessageDiv = document.getElementById('error-message');

async function loadStudentData() {
    // Show loading message
    studentInfoDiv.innerHTML = '<p style="color: blue;">กำลังโหลดข้อมูล...</p>';

    try {
        const querySnapshot = await getDocs(collection(db, "students"));
        console.log("Total documents fetched:", querySnapshot.size);
        console.log("Searching for:", { thID, studentID, thIDType: typeof thID, studentIDType: typeof studentID });

        let studentData = null;
        querySnapshot.forEach(doc => {
            const data = doc.data();
            console.log("Firestore document:", { thID: data.thID, studentID: data.studentID, thIDType: typeof data.thID, studentIDType: typeof data.studentID });
            console.log(`Comparing: input thID=${thID} vs Firestore thID=${data.thID} | input studentID=${studentID} vs Firestore studentID=${data.studentID}`);

            if (String(data.thID) === String(thID) && data.studentID.toLowerCase() === studentID) {
                studentData = data;
            }
        });

        if (studentData) {
            console.log("Student data found:", studentData);
            displayStudentData(studentData);
        } else {
            console.log("No student data found.");
            studentInfoDiv.innerHTML = ''; // Clear loading message
            errorMessageDiv.textContent = "ไม่พบข้อมูลนักเรียน";
        }
    } catch (error) {
        console.error("Error fetching student data:", error);
        studentInfoDiv.innerHTML = ''; // Clear loading message
        errorMessageDiv.textContent = "เกิดข้อผิดพลาดในการโหลดข้อมูล";
    }
}

function displayStudentData(data) {
    const fullName = `${data.prefix} ${data.name} ${data.surname || ''}`.trim();
    let scoresHtml = '';
    
    if (data.studyPlan === 'ISMT') {
        scoresHtml = `
            <tr><td>คณิตศาสตร์</td><td>${data.scores.math || '-'}</td></tr>
            <tr><td>วิทยาศาสตร์</td><td>${data.scores.science || '-'}</td></tr>
            <tr><td>ภาษาอังกฤษ</td><td>${data.scores.english || '-'}</td></tr>
        `;
    } else if (data.studyPlan === 'ILEC') {
        scoresHtml = `
            <tr><td>สังคมศึกษา</td><td>${data.scores.social || '-'}</td></tr>
            <tr><td>ภาษาจีน</td><td>${data.scores.chinese || '-'}</td></tr>
            <tr><td>ภาษาไทย</td><td>${data.scores.thai || '-'}</td></tr>
            <tr><td>ภาษาอังกฤษ</td><td>${data.scores.english || '-'}</td></tr>
        `;
    } else if (data.studyPlan === 'IDGT') {
        scoresHtml = `
            <tr><td>คณิตศาสตร์</td><td>${data.scores.math || '-'}</td></tr>
            <tr><td>วิทยาศาสตร์</td><td>${data.scores.science || '-'}</td></tr>
            <tr><td>ภาษาอังกฤษ</td><td>${data.scores.english || '-'}</td></tr>
            <tr><td>เทคโนโลยี</td><td>${data.scores.technology || '-'}</td></tr>
        `;
    } else if (data.studyPlan === 'ISMT + IDGT') { // Fixed condition
        scoresHtml = `
            <tr><td>คณิตศาสตร์</td><td>${data.scores.math || '-'}</td></tr>
            <tr><td>วิทยาศาสตร์</td><td>${data.scores.science || '-'}</td></tr>
            <tr><td>ภาษาอังกฤษ</td><td>${data.scores.english || '-'}</td></tr>
            <tr><td>เทคโนโลยี</td><td>${data.scores.technology || '-'}</td></tr>
        `;
    }

    studentInfoDiv.innerHTML = `
        <p><strong>รหัสบัตรประชาชน:</strong> ${thID}</p>
        <p><strong>เลขประจำตัวผู้เข้าสอบ:</strong> ${studentID}</p>
        <p><strong>ชื่อ-นามสกุล:</strong> ${fullName}</p>
        <p><strong>แผนการเรียน:</strong> ${data.studyPlan}</p>
        <table>
            <thead>
                <tr><th>วิชา</th><th>คะแนน</th></tr>
            </thead>
            <tbody>
                ${scoresHtml}
            </tbody>
        </table>
    `;
}

// Logout function
function logout() {
    if (confirm('คุณต้องการออกจากระบบใช่หรือไม่?')) {
        sessionStorage.removeItem('isLoggedIn');
        window.location.href = 'index.html';
    }
}

// Add logout event listener
document.getElementById('logout-btn').addEventListener('click', logout);

// Load data when page loads
loadStudentData();