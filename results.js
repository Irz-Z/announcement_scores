import { db, collection, getDocs, query, where, limit, doc, getDoc } from "./firebase.js";

// Check if user is logged in
if (!sessionStorage.getItem('isLoggedIn')) {
    window.location.href = 'index.html';
}

// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const thID = (sessionStorage.getItem('thID') || urlParams.get('thID') || '').trim();
const studentID = String(sessionStorage.getItem('studentID') || urlParams.get('studentID') || '').trim();

const studentInfoDiv = document.getElementById('student-info');
const errorMessageDiv = document.getElementById('error-message');
const planStatsDiv = document.getElementById('plan-stats-student');

const SUBJECTS = {
    math: { label: 'คณิตศาสตร์', fullMark: 40 },
    science: { label: 'วิทยาศาสตร์', fullMark: 60 },
    english: { label: 'ภาษาอังกฤษ', fullMark: 50 },
    social: { label: 'สังคมศึกษา', fullMark: 60 },
    chinese: { label: 'ภาษาจีน', fullMark: 40 },
    thai: { label: 'ภาษาไทย', fullMark: 60 },
    technology: { label: 'เทคโนโลยี', fullMark: 80 }
};

const PLAN_SUBJECTS = {
    ISMT: ['math', 'science', 'english'],
    ILEC: ['social', 'chinese', 'thai', 'english'],
    IDGT: ['math', 'science', 'english', 'technology']
};

const PLAN_LABELS = {
    ISMT: 'โครงการห้องเรียนพิเศษวิทยาศาสตร์ คณิตศาสตร์และเทคโนโลยี (ISMT)',
    ILEC: 'โครงการห้องเรียนพิเศษภาษาต่างประเทศ (อังกฤษ-จีน) (ILEC)',
    IDGT: 'โครงการห้องเรียนพิเศษเทคโนโลยีดิจิทัล (IDGT)'
};

function normalizeStudyPlan(plan) {
    const normalized = String(plan || '').trim();
    return normalized;
}

function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function formatNumber(value, digits = 2) {
    if (value === null || value === undefined) return '-';
    const n = Number(value);
    if (!Number.isFinite(n)) return '-';
    return digits === 0 ? String(Math.round(n)) : n.toFixed(digits);
}

async function renderStudentPlanStats(studentPlan) {
    if (!planStatsDiv) return;
    const planKey = normalizeStudyPlan(studentPlan);
    const subjectKeys = PLAN_SUBJECTS[planKey];
    if (!subjectKeys) {
        planStatsDiv.innerHTML = '<p class="text-gray-500">ไม่พบแผนการเรียนสำหรับคำนวณสถิติ</p>';
        return;
    }

    try {
        const statsRef = doc(db, 'studyPlanStats', planKey);
        const statsSnap = await getDoc(statsRef);
        if (!statsSnap.exists()) {
            planStatsDiv.innerHTML = '<p class="text-gray-500">สถิติยังไม่พร้อมใช้งาน (รอแอดมินอัปเดตข้อมูล)</p>';
            return;
        }

        const statsData = statsSnap.data();
        const count = Number(statsData.count || 0);
        const subjects = statsData.subjects || {};

        const rowsHtml = subjectKeys.map((k) => {
            const subject = SUBJECTS[k];
            const fullMark = subject?.fullMark;
            const max = subjects?.[k]?.max;
            const avg = subjects?.[k]?.avg;
            return `
                <tr class="border-b border-gray-100">
                    <td class="p-4 text-gray-700">${subject?.label || k}</td>
                    <td class="p-4 text-center text-gray-700">${formatNumber(fullMark, 0)}</td>
                    <td class="p-4 text-center text-gray-700">${max === undefined ? '-' : formatNumber(max, 0)}</td>
                    <td class="p-4 text-center text-gray-700">${avg === undefined ? '-' : formatNumber(avg, 2)}</td>
                </tr>
            `;
        }).join('');

        planStatsDiv.innerHTML = `
            <div class="border border-gray-100 rounded-xl overflow-hidden">
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-4 bg-blue-50">
                    <div class="font-bold text-primary">${PLAN_LABELS[planKey] || planKey}</div>
                    <div class="text-sm text-gray-700">จำนวนผู้เข้าสอบในแผนนี้: <span class="font-semibold">${count}</span></div>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full border-collapse">
                        <thead>
                            <tr>
                                <th class="bg-blue-50 p-4 text-left text-primary font-bold uppercase text-sm">วิชา</th>
                                <th class="bg-blue-50 p-4 text-center text-primary font-bold uppercase text-sm">เต็ม</th>
                                <th class="bg-blue-50 p-4 text-center text-primary font-bold uppercase text-sm">สูงสุด</th>
                                <th class="bg-blue-50 p-4 text-center text-primary font-bold uppercase text-sm">เฉลี่ย</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (e) {
        console.error('Error loading plan stats:', e);
        planStatsDiv.innerHTML = '<p class="text-gray-500">ไม่สามารถโหลดสถิติได้</p>';
    }
}

async function loadStudentData() {
    // Show loading message
    studentInfoDiv.innerHTML = '<p style="color: blue;">กำลังโหลดข้อมูล...</p>';
    if (planStatsDiv) {
        planStatsDiv.innerHTML = '<p style="color: blue;">กำลังโหลดสถิติ...</p>';
    }

    try {
        if (!thID) {
            studentInfoDiv.innerHTML = '';
            if (planStatsDiv) planStatsDiv.innerHTML = '';
            errorMessageDiv.textContent = 'ข้อมูลการเข้าสู่ระบบไม่ครบถ้วน';
            return;
        }

        const studentsRef = collection(db, "students");
        const constraints = [where('thID', '==', thID)];
        if (studentID) constraints.push(where('studentID', '==', studentID));
        constraints.push(limit(1));

        const q = query(studentsRef, ...constraints);
        const querySnapshot = await getDocs(q);
        const studentData = querySnapshot.empty ? null : querySnapshot.docs[0].data();

        if (studentData) {
            displayStudentData(studentData);
            await renderStudentPlanStats(studentData.studyPlan);
        } else {
            studentInfoDiv.innerHTML = ''; // Clear loading message
            if (planStatsDiv) planStatsDiv.innerHTML = '';
            errorMessageDiv.textContent = "ไม่พบข้อมูลนักเรียน";
        }
    } catch (error) {
        console.error("Error fetching student data:", error);
        studentInfoDiv.innerHTML = ''; // Clear loading message
        if (planStatsDiv) planStatsDiv.innerHTML = '';
        errorMessageDiv.textContent = "เกิดข้อผิดพลาดในการโหลดข้อมูล";
    }
}

function displayStudentData(data) {
    const fullName = `${data.prefix} ${data.name} ${data.surname || ''}`.trim();
    let scoresHtml = '';
    const normalizedPlan = normalizeStudyPlan(data.studyPlan);
    
    if (normalizedPlan === 'ISMT') {
        scoresHtml = `
            <tr><td>คณิตศาสตร์</td><td>${data.scores.math || '-'}</td></tr>
            <tr><td>วิทยาศาสตร์</td><td>${data.scores.science || '-'}</td></tr>
            <tr><td>ภาษาอังกฤษ</td><td>${data.scores.english || '-'}</td></tr>
        `;
    } else if (normalizedPlan === 'ILEC') {
        scoresHtml = `
            <tr><td>สังคมศึกษา</td><td>${data.scores.social || '-'}</td></tr>
            <tr><td>ภาษาจีน</td><td>${data.scores.chinese || '-'}</td></tr>
            <tr><td>ภาษาไทย</td><td>${data.scores.thai || '-'}</td></tr>
            <tr><td>ภาษาอังกฤษ</td><td>${data.scores.english || '-'}</td></tr>
        `;
    } else if (normalizedPlan === 'IDGT') {
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
        <p><strong>แผนการเรียน:</strong> ${PLAN_LABELS[normalizedPlan] || normalizedPlan}</p>
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