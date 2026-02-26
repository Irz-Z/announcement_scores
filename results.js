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

// ============= Default Plan Config fallback =============
const DEFAULT_PLAN_CONFIG = {
    ISMT: {
        label: 'โครงการห้องเรียนพิเศษวิทยาศาสตร์ คณิตศาสตร์และเทคโนโลยี (ISMT)',
        subjects: [
            { key: 'math', label: 'คณิตศาสตร์', fullMark: 40 },
            { key: 'science', label: 'วิทยาศาสตร์', fullMark: 60 },
            { key: 'english', label: 'ภาษาอังกฤษ', fullMark: 50 }
        ]
    },
    ILEC: {
        label: 'โครงการห้องเรียนพิเศษภาษาต่างประเทศ (อังกฤษ-จีน) (ILEC)',
        subjects: [
            { key: 'social', label: 'สังคมศึกษา', fullMark: 60 },
            { key: 'chinese', label: 'ภาษาจีน', fullMark: 40 },
            { key: 'thai', label: 'ภาษาไทย', fullMark: 60 },
            { key: 'english', label: 'ภาษาอังกฤษ', fullMark: 50 }
        ]
    },
    IDGT: {
        label: 'โครงการห้องเรียนพิเศษเทคโนโลยีดิจิทัล (IDGT)',
        subjects: [
            { key: 'science', label: 'วิทยาศาสตร์', fullMark: 60 },
            { key: 'english', label: 'ภาษาอังกฤษ', fullMark: 50 },
            { key: 'technology', label: 'เทคโนโลยี', fullMark: 80 }
        ]
    }
};

// Runtime config — loaded from Firestore
let planConfig = JSON.parse(JSON.stringify(DEFAULT_PLAN_CONFIG));

async function loadPlanConfig() {
    try {
        const snap = await getDoc(doc(db, 'config', 'planConfig'));
        if (snap.exists()) {
            const data = snap.data();
            const merged = {};
            Object.keys(data).forEach(planKey => {
                const plan = data[planKey];
                if (plan && Array.isArray(plan.subjects)) {
                    merged[planKey] = {
                        label: plan.label || planKey,
                        subjects: plan.subjects.map(s => ({
                            key: String(s.key || '').trim(),
                            label: String(s.label || s.key || '').trim(),
                            fullMark: Number(s.fullMark) || 0
                        })).filter(s => s.key)
                    };
                }
            });
            if (Object.keys(merged).length > 0) planConfig = merged;
        }
    } catch (e) {
        console.error('loadPlanConfig error:', e);
    }
}

function getPlanLabel(planKey) { return planConfig[planKey]?.label || planKey; }
function getPlanSubjects(planKey) { return planConfig[planKey]?.subjects || []; }

function normalizeStudyPlan(plan) {
    return String(plan || '').trim();
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

function calculateTotalScore(studyPlan, scores) {
    const s = scores || {};
    return getPlanSubjects(studyPlan).reduce((sum, subj) => sum + (Number(s[subj.key]) || 0), 0);
}

async function renderStudentPlanStats(studentPlan) {
    if (!planStatsDiv) return;
    const planKey = normalizeStudyPlan(studentPlan);
    const subjectDefs = getPlanSubjects(planKey);
    if (!subjectDefs.length) {
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

        const rowsHtml = subjectDefs.map((subj) => {
            // Use fullMark from Firestore stats if available (reflects latest config at publish time)
            // Fall back to current planConfig fullMark
            const fullMark = subjects?.[subj.key]?.fullMark ?? subj.fullMark;
            const max = subjects?.[subj.key]?.max;
            const avg = subjects?.[subj.key]?.avg;
            return `
                <tr class="border-b border-gray-100">
                    <td class="p-4 text-gray-700">${subj.label}</td>
                    <td class="p-4 text-center text-gray-700">${formatNumber(fullMark, 0)}</td>
                    <td class="p-4 text-center text-gray-700">${max === undefined ? '-' : formatNumber(max, 0)}</td>
                    <td class="p-4 text-center text-gray-700">${avg === undefined ? '-' : formatNumber(avg, 2)}</td>
                </tr>
            `;
        }).join('');

        planStatsDiv.innerHTML = `
            <div class="border border-gray-100 rounded-xl overflow-hidden">
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-4 bg-blue-50">
                    <div class="font-bold text-primary">${getPlanLabel(planKey)}</div>
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
    studentInfoDiv.innerHTML = '<p style="color: blue;">กำลังโหลดข้อมูล...</p>';
    if (planStatsDiv) {
        planStatsDiv.innerHTML = '<p style="color: blue;">กำลังโหลดสถิติ...</p>';
    }

    // Load plan config first
    await loadPlanConfig();

    try {
        if (!thID && !studentID) {
            studentInfoDiv.innerHTML = '';
            if (planStatsDiv) planStatsDiv.innerHTML = '';
            errorMessageDiv.textContent = 'ข้อมูลการเข้าสู่ระบบไม่ครบถ้วน';
            return;
        }

        const studentsRef = collection(db, "students");
        const constraints = [];
        if (thID) constraints.push(where('thID', '==', thID));
        if (studentID) constraints.push(where('studentID', '==', studentID));
        constraints.push(limit(1));

        const q = query(studentsRef, ...constraints);
        const querySnapshot = await getDocs(q);
        const studentData = querySnapshot.empty ? null : querySnapshot.docs[0].data();

        if (studentData) {
            displayStudentData(studentData);
            await renderStudentPlanStats(studentData.studyPlan);
        } else {
            studentInfoDiv.innerHTML = '';
            if (planStatsDiv) planStatsDiv.innerHTML = '';
            errorMessageDiv.textContent = "ไม่พบข้อมูลนักเรียน";
        }
    } catch (error) {
        console.error("Error fetching student data:", error);
        studentInfoDiv.innerHTML = '';
        if (planStatsDiv) planStatsDiv.innerHTML = '';
        errorMessageDiv.textContent = "เกิดข้อผิดพลาดในการโหลดข้อมูล";
    }
}

function displayStudentData(data) {
    const fullName = `${data.prefix} ${data.name} ${data.surname || ''}`.trim();
    const normalizedPlan = normalizeStudyPlan(data.studyPlan);
    const subjectDefs = getPlanSubjects(normalizedPlan);
    const total = calculateTotalScore(normalizedPlan, data.scores || {});

    const scoresHtml = subjectDefs.map(subj => {
        const val = data.scores?.[subj.key];
        const display = (val !== null && val !== undefined) ? val : '-';
        return `<tr><td>${subj.label}</td><td>${display} / ${subj.fullMark}</td></tr>`;
    }).join('');

    studentInfoDiv.innerHTML = `
        <p><strong>รหัสบัตรประชาชน:</strong> ${data.thID || '-'}</p>
        <p><strong>เลขประจำตัวผู้เข้าสอบ:</strong> ${data.studentID || '-'}</p>
        <p><strong>ชื่อ-นามสกุล:</strong> ${fullName}</p>
        <p><strong>แผนการเรียน:</strong> ${getPlanLabel(normalizedPlan)}</p>
        <table>
            <thead>
                <tr><th>วิชา</th><th>คะแนน / เต็ม</th></tr>
            </thead>
            <tbody>
                ${scoresHtml}
                <tr style="font-weight:bold; border-top: 2px solid #ccc;">
                    <td>รวม</td>
                    <td>${total}</td>
                </tr>
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

document.getElementById('logout-btn').addEventListener('click', logout);

// Load data when page loads
loadStudentData();