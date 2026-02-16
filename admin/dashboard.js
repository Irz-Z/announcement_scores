import { auth, db, onAuthStateChanged, signOut, collection, getDocs, addDoc, deleteDoc, doc, updateDoc, query, where, setDoc } from './firebase.js';

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

function renderStudyPlanStats(students) {
    const container = document.getElementById('plan-stats-content');
    if (!container) return;

    const planKeys = Object.keys(PLAN_SUBJECTS);
    const stats = {};
    planKeys.forEach((planKey) => {
        stats[planKey] = {
            count: 0,
            sums: {},
            maxs: {}
        };
        PLAN_SUBJECTS[planKey].forEach((subjectKey) => {
            stats[planKey].sums[subjectKey] = 0;
            stats[planKey].maxs[subjectKey] = -Infinity;
        });
    });

    (students || []).forEach((student) => {
        const plan = normalizeStudyPlan(student.studyPlan);
        if (!PLAN_SUBJECTS[plan]) return;
        stats[plan].count += 1;
        PLAN_SUBJECTS[plan].forEach((subjectKey) => {
            const scoreValue = toNumber(student.scores?.[subjectKey]);
            stats[plan].sums[subjectKey] += scoreValue;
            stats[plan].maxs[subjectKey] = Math.max(stats[plan].maxs[subjectKey], scoreValue);
        });
    });

    // Publish aggregated stats for student page consumption
    publishStudyPlanStats(stats).catch((e) => {
        console.error('Failed to publish study plan stats:', e);
    });

    container.innerHTML = planKeys.map((planKey) => {
        const planStat = stats[planKey];
        const count = planStat.count;
        const rowsHtml = PLAN_SUBJECTS[planKey].map((subjectKey) => {
            const subject = SUBJECTS[subjectKey];
            const fullMark = subject?.fullMark;
            const max = count > 0 ? planStat.maxs[subjectKey] : null;
            const avg = count > 0 ? (planStat.sums[subjectKey] / count) : null;
            return `
                <tr class="border-b border-gray-100">
                    <td class="py-2 pr-2 text-gray-700">${subject?.label || subjectKey}</td>
                    <td class="py-2 px-2 text-center text-gray-700">${formatNumber(fullMark, 0)}</td>
                    <td class="py-2 px-2 text-center text-gray-700">${max === null ? '-' : formatNumber(max, 0)}</td>
                    <td class="py-2 pl-2 text-center text-gray-700">${avg === null ? '-' : formatNumber(avg, 2)}</td>
                </tr>
            `;
        }).join('');

        return `
            <div class="border border-gray-100 rounded-xl p-4 bg-white">
                <div class="flex items-center justify-between mb-3">
                    <div class="font-bold text-gray-800">${PLAN_LABELS[planKey] || planKey}</div>
                    <div class="text-sm text-gray-600">จำนวนผู้เข้าสอบ: <span class="font-semibold text-primary">${count}</span></div>
                </div>
                <div class="overflow-x-auto rounded-lg border border-gray-100">
                    <table class="min-w-full text-sm">
                        <thead>
                            <tr class="bg-blue-50 text-gray-700 text-xs uppercase">
                                <th class="py-2 px-3 text-left font-bold">วิชา</th>
                                <th class="py-2 px-3 text-center font-bold">เต็ม</th>
                                <th class="py-2 px-3 text-center font-bold">สูงสุด</th>
                                <th class="py-2 px-3 text-center font-bold">เฉลี่ย</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }).join('');
}

async function publishStudyPlanStats(statsByPlan) {
    const planKeys = Object.keys(PLAN_SUBJECTS);
    const updates = planKeys.map(async (planKey) => {
        const planStat = statsByPlan?.[planKey];
        if (!planStat) return;

        const count = planStat.count || 0;
        const subjects = {};
        PLAN_SUBJECTS[planKey].forEach((subjectKey) => {
            const sum = planStat.sums?.[subjectKey] || 0;
            const max = count > 0 ? planStat.maxs?.[subjectKey] : null;
            const avg = count > 0 ? (sum / count) : null;
            subjects[subjectKey] = {
                max: max === null ? null : Number(max),
                avg: avg === null ? null : Number(avg)
            };
        });

        const payload = {
            planKey,
            count: Number(count),
            subjects,
            updatedAt: new Date().toISOString()
        };

        await setDoc(doc(db, 'studyPlanStats', planKey), payload);
    });

    await Promise.all(updates);
}

// Check admin authentication state
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('admin-name').textContent = `Welcome, ${user.email}`;
        loadStudents();
    } else {
        window.location.href = 'index.html';
    }
});

// Logout functionality
document.getElementById('logout-btn').addEventListener('click', () => {
    signOut(auth).then(() => {
        window.location.href = 'index.html';
    }).catch((error) => {
        console.error('Logout error:', error);
    });
});

// Show/hide score fields based on study plan
const studyPlanSelectEl = document.getElementById("study-plan");
studyPlanSelectEl?.addEventListener("change", function () {
    const plan = this.value;
    const sections = [
        "math-section", "science-section", "english-section",
        "chinese-section", "social-section", "thai-section", "technology-section"
    ];
    sections.forEach(section => document.getElementById(section).classList.add("hidden"));

    if (plan === "ISMT") {
        showSections(["math-section", "science-section", "english-section"]);
    } else if (plan === "ILEC") {
        showSections(["chinese-section", "social-section", "thai-section", "english-section"]);
    } else if (plan === "IDGT") {
        showSections(["math-section", "science-section", "english-section", "technology-section"]);
    }
});

// Ensure score fields are visible immediately for the default/selected plan
studyPlanSelectEl?.dispatchEvent(new Event('change'));

function showSections(sectionIds) {
    sectionIds.forEach(section => document.getElementById(section).classList.remove("hidden"));
}

// Check for duplicate studentID
async function checkDuplicateStudentID(studentID, excludeDocId = null) {
    const q = query(collection(db, 'students'), where('studentID', '==', studentID));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.some(doc => doc.id !== excludeDocId);
}

// Handle adding new student
document.getElementById('add-student-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const studentID = formData.get('studentID');
    const studyPlan = formData.get('study_plan');
    let scores = {};

    if (await checkDuplicateStudentID(studentID)) {
        alert('รหัสนักเรียนนี้มีอยู่ในระบบแล้ว');
        return;
    }

    if (studyPlan === 'ISMT') {
        scores = {
            math: parseInt(formData.get('math')) || 0,
            science: parseInt(formData.get('science')) || 0,
            english: parseInt(formData.get('english')) || 0
        };
    } else if (studyPlan === 'ILEC') {
        scores = {
            english: parseInt(formData.get('english')) || 0,
            chinese: parseInt(formData.get('chinese')) || 0,
            social: parseInt(formData.get('social')) || 0,
            thai: parseInt(formData.get('thai')) || 0
        };
    } else if (studyPlan === 'IDGT') {
        scores = {
            math: parseInt(formData.get('math')) || 0,
            science: parseInt(formData.get('science')) || 0,
            english: parseInt(formData.get('english')) || 0,
            technology: parseInt(formData.get('technology')) || 0
        };
    }

    try {
        await addDoc(collection(db, 'students'), {
            thID: formData.get('thID'),
            studentID: studentID,
            prefix: formData.get('prefix'),
            name: formData.get('name'),
            surname: formData.get('surname'),
            studyPlan: studyPlan,
            scores: scores
        });
        alert('เพิ่มนักเรียนสำเร็จ');
        e.target.reset();
        loadStudents();
    } catch (error) {
        console.error('Error adding student:', error);
        alert('เกิดข้อผิดพลาดในการเพิ่มนักเรียน');
    }
});

// Handle Excel upload and stop if no data
document.getElementById('download-template-btn').addEventListener('click', () => {
    const wb = XLSX.utils.book_new();
    const ws_data = [
        [
            "รหัสบัตรประชาชน", "รหัสผู้เข้าสอบ", "", "", "", "", "คำนำหน้า", "ชื่อ", "นามสกุล", "แผนการเรียน",
            "คะแนนคณิต", "คะแนนวิทย์", "คะแนนอังกฤษ", "คะแนนสังคม", "คะแนนจีน", "คะแนนไทย", "คะแนนเทคโนโลยี"
        ],
        [
            "1234567890123", "67001", "", "", "", "", "เด็กชาย", "ตัวอย่าง", "ใจดี", "ISMT",
            "35", "55", "45", "", "", "", ""
        ],
        [
            "1234567890124", "67002", "", "", "", "", "เด็กหญิง", "มานี", "มีตา", "ILEC",
            "", "", "40", "50", "35", "55", ""
        ]
    ];
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    
    // Set column widths
    const wscols = [
        {wch: 15}, {wch: 10}, {wch: 5}, {wch: 5}, {wch: 5}, {wch: 5}, {wch: 10}, {wch: 15}, {wch: 15}, {wch: 15},
        {wch: 10}, {wch: 10}, {wch: 10}, {wch: 10}, {wch: 10}, {wch: 10}, {wch: 10}
    ];
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "import_template.xlsx");
});

document.getElementById('upload-excel-btn').addEventListener('click', () => {
    document.getElementById('excel-file').click();
});

document.getElementById('excel-file').addEventListener('change', (event) => {
    const file = event.target.files[0];
    const statusDiv = document.getElementById('upload-status');
    const studentTable = document.getElementById('student-table');

    if (!file) {
        statusDiv.textContent = 'กรุณาเลือกไฟล์';
        statusDiv.style.color = 'red';
        return;
    }

    const fileName = file.name;
    const reader = new FileReader();

    reader.onloadstart = () => {
        statusDiv.textContent = `กำลังอัปโหลดไฟล์: ${fileName}...`;
        statusDiv.style.color = 'blue';
    };

    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            // Clear table before adding new data
            studentTable.innerHTML = '';
            let rowNumber = 1;

            for (let i = 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                const excelRowNumber = i + 1; // Human-readable row number (starts at 2)

                // Check if row is empty (no data)
                if (!row || row.every(cell => !cell || String(cell).trim() === '')) {
                    statusDiv.textContent = `หยุดอัปโหลดที่แถวที่ ${excelRowNumber} เนื่องจากไม่มีข้อมูล`;
                    statusDiv.style.color = 'orange';
                    break; // Stop uploading if row is empty
                }

                const thID = String(row[0] || '').trim();
                const studentID = String(row[1] || '').trim();
                const prefix = row[6] || '';
                const name = row[7] || '';
                const surname = row[8] || '';
                const studyPlan = row[9] || '';
                const normalizedStudyPlan = studyPlan.trim();

                let scores = {};
                let totalScore = 0;
                let errorMessage = '';
                let docId = null;

                // Update status with current row
                statusDiv.textContent = `กำลังอัปโหลดแถวที่ ${excelRowNumber} - ${prefix} ${name || 'ไม่ระบุชื่อ'}...`;
                statusDiv.style.color = 'orange';

                console.log(`Processing row ${excelRowNumber}:`, { thID, studentID, prefix, name, surname, studyPlan, rawRow: row });

                // Check for errors
                if (!thID || !studentID || !prefix || !name || !surname || !normalizedStudyPlan) {
                    errorMessage = 'ข้อมูลขาดหาย';
                    statusDiv.textContent = `ข้อมูลในแถวที่ ${excelRowNumber} หาย`;
                    statusDiv.style.color = 'red';
                } else if (await checkDuplicateStudentID(studentID)) {
                    errorMessage = 'รหัสนักเรียนซ้ำ';
                    statusDiv.textContent = `รหัสนักเรียนซ้ำในแถวที่ ${excelRowNumber} - ${studentID}`;
                    statusDiv.style.color = 'red';
                    console.warn(`Duplicate studentID at row ${excelRowNumber}: ${studentID}`);
                } else if (!['ISMT', 'ILEC', 'IDGT'].includes(normalizedStudyPlan)) {
                    errorMessage = 'แผนการเรียนไม่ถูกต้อง';
                    statusDiv.textContent = `แผนการเรียนไม่ถูกต้องในแถวที่ ${excelRowNumber}`;
                    statusDiv.style.color = 'red';
                    console.warn(`Unrecognized study plan at row ${excelRowNumber}: ${normalizedStudyPlan}`);
                } else {
                    // Process scores for valid rows
                    if (normalizedStudyPlan === 'ISMT') {
                        scores = {
                            math: Number(row[10]) || 0,
                            science: Number(row[11]) || 0,
                            english: Number(row[12]) || 0
                        };
                    } else if (normalizedStudyPlan === 'ILEC') {
                        scores = {
                            social: Number(row[13]) || 0,
                            chinese: Number(row[14]) || 0,
                            thai: Number(row[15]) || 0,
                            english: Number(row[12]) || 0
                        };
                    } else if (normalizedStudyPlan === 'IDGT') {
                        scores = {
                            math: Number(row[10]) || 0,
                            science: Number(row[11]) || 0,
                            english: Number(row[12]) || 0,
                            technology: Number(row[16]) || 0
                        };
                    }
                    totalScore = calculateTotalScore(normalizedStudyPlan, scores);
                }

                // Add row to table regardless of errors
                const tableRow = document.createElement('tr');
                tableRow.innerHTML = `
                    <td>${rowNumber}</td>
                    <td>${thID || '-'}</td>
                    <td>${studentID || 'ขาดข้อมูล'}</td>
                    <td>${prefix || '-'}</td>
                    <td>${name || '-'}</td>
                    <td>${surname || '-'}</td>
                    <td>${normalizedStudyPlan || '-'}</td>
                    <td>${scores.math !== undefined ? scores.math : '-'}</td>
                    <td>${scores.science !== undefined ? scores.science : '-'}</td>
                    <td>${scores.english !== undefined ? scores.english : '-'}</td>
                    <td>${scores.social !== undefined ? scores.social : '-'}</td>
                    <td>${scores.chinese !== undefined ? scores.chinese : '-'}</td>
                    <td>${scores.thai !== undefined ? scores.thai : '-'}</td>
                    <td>${scores.technology !== undefined ? scores.technology : '-'}</td>
                    <td>${errorMessage || totalScore}</td>
                    <td>
                        <button class="edit-btn">แก้ไข</button>
                        <button class="delete-btn">ลบ</button>
                    </td>
                `;
                studentTable.appendChild(tableRow);
                rowNumber++;

                // Upload to Firebase only if no errors
                if (!errorMessage) {
                    try {
                        const docRef = await addDoc(collection(db, 'students'), {
                            thID: thID,
                            studentID: studentID,
                            prefix: prefix,
                            name: name,
                            surname: surname,
                            studyPlan: normalizedStudyPlan,
                            scores: scores
                        });
                        docId = docRef.id;
                        tableRow.setAttribute('data-id', docId);
                        console.log(`Successfully added row ${excelRowNumber}`);
                    } catch (error) {
                        tableRow.cells[14].textContent = `ข้อผิดพลาด: ${error.message}`;
                        statusDiv.textContent = `เกิดข้อผิดพลาดในแถวที่ ${excelRowNumber}: ${error.message}`;
                        statusDiv.style.color = 'red';
                        console.error(`Error adding row ${excelRowNumber}:`, error);
                    }
                }

                // Add event listeners for edit and delete
                tableRow.querySelector('.edit-btn').addEventListener('click', () => editStudentRow(docId, tableRow));
                tableRow.querySelector('.delete-btn').addEventListener('click', async () => {
                    if (docId) {
                        await deleteDoc(doc(db, 'students', docId));
                    }
                    tableRow.remove(); // Remove from table even if not in Firebase
                });
            }

            statusDiv.textContent = `อัปโหลดไฟล์: ${fileName} เสร็จสิ้น`;
            statusDiv.style.color = 'green';
        } catch (error) {
            statusDiv.textContent = `เกิดข้อผิดพลาดในการอัปโหลดไฟล์: ${fileName} - ${error.message}`;
            statusDiv.style.color = 'red';
            console.error('Upload error:', error);
        }
    };

    reader.onerror = () => {
        statusDiv.textContent = `เกิดข้อผิดพลาดในการอ่านไฟล์: ${fileName}`;
        statusDiv.style.color = 'red';
    };

    reader.readAsArrayBuffer(file);
});

function calculateTotalScore(studyPlan, scores) {
    let total = 0;
    if (studyPlan === 'ISMT') {
        total = (scores.math || 0) + (scores.science || 0) + (scores.english || 0);
    } else if (studyPlan === 'ILEC') {
        total = (scores.social || 0) + (scores.chinese || 0) + (scores.thai || 0) + (scores.english || 0);
    } else if (studyPlan === 'IDGT') {
        total = (scores.math || 0) + (scores.science || 0) + (scores.english || 0) + (scores.technology || 0);
    }
    return total;
}

// Load and display students from Firebase
async function loadStudents() {
    const studentTable = document.getElementById('student-table');
    studentTable.innerHTML = '';

    const querySnapshot = await getDocs(collection(db, 'students'));
    const allStudents = querySnapshot.docs.map((d) => d.data());
    renderStudyPlanStats(allStudents);
    let rowNumber = 1;

    querySnapshot.forEach((docSnapshot) => {
        const data = docSnapshot.data();
        const totalScore = calculateTotalScore(data.studyPlan, data.scores);
        const row = document.createElement('tr');
        row.setAttribute('data-id', docSnapshot.id);
        row.innerHTML = `
            <td>${rowNumber}</td>
            <td>${data.thID || '-'}</td>
            <td>${data.studentID || 'ขาดข้อมูล'}</td>
            <td>${data.prefix || '-'}</td>
            <td>${data.name || '-'}</td>
            <td>${data.surname || '-'}</td>
            <td>${data.studyPlan || '-'}</td>
            <td>${data.scores.math !== undefined ? data.scores.math : '-'}</td>
            <td>${data.scores.science !== undefined ? data.scores.science : '-'}</td>
            <td>${data.scores.english !== undefined ? data.scores.english : '-'}</td>
            <td>${data.scores.social !== undefined ? data.scores.social : '-'}</td>
            <td>${data.scores.chinese !== undefined ? data.scores.chinese : '-'}</td>
            <td>${data.scores.thai !== undefined ? data.scores.thai : '-'}</td>
            <td>${data.scores.technology !== undefined ? data.scores.technology : '-'}</td>
            <td>${totalScore}</td>
            <td>
                <button class="edit-btn">แก้ไข</button>
                <button class="delete-btn">ลบ</button>
            </td>
        `;
        studentTable.appendChild(row);
        rowNumber++;

        row.querySelector('.edit-btn').addEventListener('click', () => editStudentRow(docSnapshot.id, row));
        row.querySelector('.delete-btn').addEventListener('click', async () => {
            await deleteDoc(doc(db, 'students', docSnapshot.id));
            loadStudents();
        });
    });
}

// Edit student row
function editStudentRow(id, row) {
    const cells = row.children;
    const data = {
        thID: cells[1].textContent,
        studentID: cells[2].textContent === 'ขาดข้อมูล' ? '' : cells[2].textContent,
        prefix: cells[3].textContent,
        name: cells[4].textContent,
        surname: cells[5].textContent,
        studyPlan: cells[6].textContent,
        scores: {
            math: cells[7].textContent === '-' ? '' : cells[7].textContent,
            science: cells[8].textContent === '-' ? '' : cells[8].textContent,
            english: cells[9].textContent === '-' ? '' : cells[9].textContent,
            social: cells[10].textContent === '-' ? '' : cells[10].textContent,
            chinese: cells[11].textContent === '-' ? '' : cells[11].textContent,
            thai: cells[12].textContent === '-' ? '' : cells[12].textContent,
            technology: cells[13].textContent === '-' ? '' : cells[13].textContent
        }
    };
    const totalScore = calculateTotalScore(data.studyPlan, data.scores);

    cells[1].innerHTML = `<input type="text" value="${data.thID}" maxlength="13">`;
    cells[2].innerHTML = `<input type="text" value="${data.studentID}" maxlength="8">`;
    cells[3].innerHTML = `
        <select>
            <option value="เด็กชาย" ${data.prefix === 'เด็กชาย' ? 'selected' : ''}>เด็กชาย</option>
            <option value="เด็กหญิง" ${data.prefix === 'เด็กหญิง' ? 'selected' : ''}>เด็กหญิง</option>
            <option value="นาย" ${data.prefix === 'นาย' ? 'selected' : ''}>นาย</option>
            <option value="นางสาว" ${data.prefix === 'นางสาว' ? 'selected' : ''}>นางสาว</option>
        </select>`;
    cells[4].innerHTML = `<input type="text" value="${data.name}">`;
    cells[5].innerHTML = `<input type="text" value="${data.surname}">`;
    cells[6].innerHTML = `
        <select>
            <option value="ISMT" ${data.studyPlan === 'ISMT' ? 'selected' : ''}>ISMT</option>
            <option value="ILEC" ${data.studyPlan === 'ILEC' ? 'selected' : ''}>ILEC</option>
            <option value="IDGT" ${data.studyPlan === 'IDGT' ? 'selected' : ''}>IDGT</option>
        </select>`;
    cells[7].innerHTML = `<input type="number" value="${data.scores.math}" min="0" max="40" ${data.studyPlan === 'ISMT' || data.studyPlan === 'IDGT' ? '' : 'disabled'}>`;
    cells[8].innerHTML = `<input type="number" value="${data.scores.science}" min="0" max="60" ${data.studyPlan === 'ISMT' || data.studyPlan === 'IDGT' ? '' : 'disabled'}>`;
    cells[9].innerHTML = `<input type="number" value="${data.scores.english}" min="0" max="50">`;
    cells[10].innerHTML = `<input type="number" value="${data.scores.social}" min="0" max="60" ${data.studyPlan === 'ILEC' ? '' : 'disabled'}>`;
    cells[11].innerHTML = `<input type="number" value="${data.scores.chinese}" min="0" max="40" ${data.studyPlan === 'ILEC' ? '' : 'disabled'}>`;
    cells[12].innerHTML = `<input type="number" value="${data.scores.thai}" min="0" max="60" ${data.studyPlan === 'ILEC' ? '' : 'disabled'}>`;
    cells[13].innerHTML = `<input type="number" value="${data.scores.technology}" min="0" max="80" ${data.studyPlan === 'IDGT' ? '' : 'disabled'}>`;
    cells[14].innerHTML = `<span>${totalScore}</span>`;
    cells[15].innerHTML = `
        <button class="save-btn" data-id="${id}">บันทึก</button>
        <button class="cancel-btn" data-id="${id}">ยกเลิก</button>
    `;

    cells[15].querySelector('.save-btn').addEventListener('click', () => saveStudent(id, row));
    cells[15].querySelector('.cancel-btn').addEventListener('click', () => loadStudents());
}

// Save edited student (handles both updates and new additions)
async function saveStudent(id, row) {
    const cells = row.children;
    const studentID = cells[2].querySelector('input').value;
    const studyPlan = cells[6].querySelector('select').value;

    if (!studentID || !cells[1].querySelector('input').value || !cells[3].querySelector('select').value || !cells[4].querySelector('input').value || !cells[5].querySelector('input').value || !studyPlan) {
        alert('กรุณากรอกข้อมูลให้ครบถ้วน');
        return;
    }

    if (studentID && await checkDuplicateStudentID(studentID, id)) {
        alert('รหัสนักเรียนนี้มีอยู่ในระบบแล้ว');
        return;
    }

    let scores = {};
    if (studyPlan === 'ISMT') {
        scores = {
            math: parseInt(cells[7].querySelector('input').value) || 0,
            science: parseInt(cells[8].querySelector('input').value) || 0,
            english: parseInt(cells[9].querySelector('input').value) || 0
        };
    } else if (studyPlan === 'ILEC') {
        scores = {
            social: parseInt(cells[10].querySelector('input').value) || 0,
            chinese: parseInt(cells[11].querySelector('input').value) || 0,
            thai: parseInt(cells[12].querySelector('input').value) || 0,
            english: parseInt(cells[9].querySelector('input').value) || 0
        };
    } else if (studyPlan === 'IDGT') {
        scores = {
            math: parseInt(cells[7].querySelector('input').value) || 0,
            science: parseInt(cells[8].querySelector('input').value) || 0,
            english: parseInt(cells[9].querySelector('input').value) || 0,
            technology: parseInt(cells[13].querySelector('input').value) || 0
        };
    } else if (studyPlan === 'IDGT + ISMT') {
        scores = {
            math: parseInt(cells[7].querySelector('input').value) || 0,
            science: parseInt(cells[8].querySelector('input').value) || 0,
            english: parseInt(cells[9].querySelector('input').value) || 0,
            technology: parseInt(cells[13].querySelector('input').value) || 0
        };
    }

    try {
        if (id) {
            // Update existing document
            await updateDoc(doc(db, 'students', id), {
                thID: cells[1].querySelector('input').value,
                studentID: studentID,
                prefix: cells[3].querySelector('select').value,
                name: cells[4].querySelector('input').value,
                surname: cells[5].querySelector('input').value,
                studyPlan: studyPlan,
                scores: scores
            });
            alert('แก้ไขข้อมูลสำเร็จ');
        } else {
            // Add new document
            const docRef = await addDoc(collection(db, 'students'), {
                thID: cells[1].querySelector('input').value,
                studentID: studentID,
                prefix: cells[3].querySelector('select').value,
                name: cells[4].querySelector('input').value,
                surname: cells[5].querySelector('input').value,
                studyPlan: studyPlan,
                scores: scores
            });
            row.setAttribute('data-id', docRef.id);
            alert('เพิ่มข้อมูลสำเร็จ');
        }
        loadStudents();
    } catch (error) {
        console.error('Error saving student:', error);
        alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    }
}

// Search functionality
document.getElementById('search-btn').addEventListener('click', async () => {
    const searchInput = document.getElementById('search-input').value.trim().toLowerCase();
    const studentTable = document.getElementById('student-table');
    studentTable.innerHTML = '';

    const querySnapshot = await getDocs(collection(db, 'students'));
    let rowNumber = 1;

    querySnapshot.forEach((docSnapshot) => {
        const data = docSnapshot.data();
        
        // Prepare searchable fields (case-insensitive)
        const name = (data.name || '').toLowerCase();
        const surname = (data.surname || '').toLowerCase();
        const fullName = `${name} ${surname}`;
        const studentID = (data.studentID || '').toString().toLowerCase();
        const thID = (data.thID || '').toString().toLowerCase();

        // Check against Name, Surname, Fullname, Student ID, and ID Card
        if (name.includes(searchInput) || 
            surname.includes(searchInput) || 
            fullName.includes(searchInput) || 
            studentID.includes(searchInput) || 
            thID.includes(searchInput)) {

            const totalScore = calculateTotalScore(data.studyPlan, data.scores);
            const row = document.createElement('tr');
            row.setAttribute('data-id', docSnapshot.id);
            row.innerHTML = `
                <td>${rowNumber}</td>
                <td>${data.thID || '-'}</td>
                <td>${data.studentID || 'ขาดข้อมูล'}</td>
                <td>${data.prefix || '-'}</td>
                <td>${data.name || '-'}</td>
                <td>${data.surname || '-'}</td>
                <td>${data.studyPlan || '-'}</td>
                <td>${data.scores.math !== undefined ? data.scores.math : '-'}</td>
                <td>${data.scores.science !== undefined ? data.scores.science : '-'}</td>
                <td>${data.scores.english !== undefined ? data.scores.english : '-'}</td>
                <td>${data.scores.social !== undefined ? data.scores.social : '-'}</td>
                <td>${data.scores.chinese !== undefined ? data.scores.chinese : '-'}</td>
                <td>${data.scores.thai !== undefined ? data.scores.thai : '-'}</td>
                <td>${data.scores.technology !== undefined ? data.scores.technology : '-'}</td>
                <td>${totalScore}</td>
                <td>
                    <button class="edit-btn">แก้ไข</button>
                    <button class="delete-btn">ลบ</button>
                </td>
            `;
            studentTable.appendChild(row);
            rowNumber++;

            row.querySelector('.edit-btn').addEventListener('click', () => editStudentRow(docSnapshot.id, row));
            row.querySelector('.delete-btn').addEventListener('click', async () => {
                await deleteDoc(doc(db, 'students', docSnapshot.id));
                loadStudents();
            });
        }
    });
});