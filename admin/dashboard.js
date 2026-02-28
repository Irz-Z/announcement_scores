import { auth, db, onAuthStateChanged, signOut, collection, getDocs, addDoc, deleteDoc, doc, updateDoc, query, where, setDoc, getDoc } from './firebase.js';

// ============= Default Plan Config (used when Firestore has no data yet) =============
const DEFAULT_PLAN_CONFIG = {
    ISMT: {
        label: 'โครงการห้องเรียนพิเศษวิทยาศาสตร์ คณิตศาสตร์และเทคโนโลยี (ISMT)',
        subjects: [
            { key: 'math', label: 'คณิตศาสตร์', fullMark: 40, fullMarkStat: 40 },
            { key: 'science', label: 'วิทยาศาสตร์', fullMark: 60, fullMarkStat: 60 },
            { key: 'english', label: 'ภาษาอังกฤษ', fullMark: 50, fullMarkStat: 50 }
        ]
    },
    ILEC: {
        label: 'โครงการห้องเรียนพิเศษภาษาต่างประเทศ (อังกฤษ-จีน) (ILEC)',
        subjects: [
            { key: 'social', label: 'สังคมศึกษา', fullMark: 60, fullMarkStat: 60 },
            { key: 'chinese', label: 'ภาษาจีน', fullMark: 40, fullMarkStat: 40 },
            { key: 'thai', label: 'ภาษาไทย', fullMark: 60, fullMarkStat: 60 },
            { key: 'english', label: 'ภาษาอังกฤษ', fullMark: 50, fullMarkStat: 50 }
        ]
    },
    IDGT: {
        label: 'โครงการห้องเรียนพิเศษเทคโนโลยีดิจิทัล (IDGT)',
        subjects: [
            { key: 'science', label: 'วิทยาศาสตร์', fullMark: 60, fullMarkStat: 60 },
            { key: 'english', label: 'ภาษาอังกฤษ', fullMark: 50, fullMarkStat: 50 },
            { key: 'technology', label: 'เทคโนโลยี', fullMark: 80, fullMarkStat: 80 }
        ]
    }
};

// Runtime plan config — loaded from Firestore, falls back to DEFAULT_PLAN_CONFIG
let planConfig = JSON.parse(JSON.stringify(DEFAULT_PLAN_CONFIG));

// ============= Helper: deep clone =============
function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

// ============= Config helpers =============
function getPlanKeys() { return Object.keys(planConfig); }
function getPlanLabel(planKey) { return planConfig[planKey]?.label || planKey; }
function getPlanSubjects(planKey) { return planConfig[planKey]?.subjects || []; }

// ============= Column Mapping Config =============
// Default column mappings (A=0, B=1, ..., Q=16)
const DEFAULT_COL_MAP = {
    thID: 'A',
    studentID: 'B',
    prefix: 'G',
    name: 'H',
    surname: 'I',
    studyPlan: 'J',
    avgScore: 'none'
};

const COL_FIELD_LABELS = {
    thID: 'รหัสบัตรประชาชน',
    studentID: 'รหัสผู้เข้าสอบ',
    prefix: 'คำนำหน้า',
    name: 'ชื่อ',
    surname: 'นามสกุล',
    studyPlan: 'แผนการเรียน',
    avgScore: 'คะแนนเฉลี่ย'
};

let uploadConfig = null; // Will be set when modal confirms

function columnLetterToIndex(letter) {
    return letter.toUpperCase().charCodeAt(0) - 65; // A=0, B=1, ..., Z=25
}

function indexToColumnLetter(idx) {
    return String.fromCharCode(65 + idx); // 0=A, 1=B, ..., 25=Z
}

// Initialize column mapping modal dropdowns
function initColumnMappingModal() {
    // Render dynamic score columns
    const scoreMapContainer = document.getElementById('mapping-score-columns');
    if (scoreMapContainer) {
        scoreMapContainer.innerHTML = '';
        const allSubjs = getAllSubjectColumns();
        allSubjs.forEach((subj, idx) => {
            const defaultLetter = indexToColumnLetter(10 + idx); // start at K
            const html = `
                <div class="flex flex-col">
                    <label class="text-xs font-medium text-gray-600 mb-1">${escapeHtml(subj.label)}</label>
                    <select id="map-${subj.key}" data-default="${defaultLetter}" class="col-map-select dynamic-score-select px-3 py-2 border border-blue-200 rounded-lg bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition text-sm font-mono"></select>
                </div>
            `;
            scoreMapContainer.insertAdjacentHTML('beforeend', html);
        });
    }

    const selects = document.querySelectorAll('.col-map-select');
    const letters = [];
    for (let i = 0; i < 26; i++) {
        letters.push(String.fromCharCode(65 + i));
    }

    selects.forEach(select => {
        select.innerHTML = `<option value="none">— ไม่มี (none) —</option>` + letters.map(l => `<option value="${l}">${l}</option>`).join('');
    });

    // Set defaults for base columns
    Object.keys(DEFAULT_COL_MAP).forEach(field => {
        const el = document.getElementById(`map-${field}`);
        if (el) el.value = DEFAULT_COL_MAP[field];
    });

    // Set defaults and attach change listener for dynamic score columns
    document.querySelectorAll('.dynamic-score-select').forEach(el => {
        const defaultLet = el.getAttribute('data-default');
        if (defaultLet) el.value = defaultLet;
        el.addEventListener('change', updateMappingPreview);
    });

    // Add fixed study plan options to map-studyPlan
    const studyPlanSelect = document.getElementById('map-studyPlan');
    if (studyPlanSelect) {
        const sep = document.createElement('option');
        sep.disabled = true;
        sep.textContent = '── กำหนดแผนให้ทั้งไฟล์ ──';
        studyPlanSelect.appendChild(sep);

        getPlanKeys().forEach(k => {
            const opt = document.createElement('option');
            opt.value = k;
            opt.textContent = `${k} (ทุกแถว)`;
            studyPlanSelect.appendChild(opt);
        });
    }

    updateMappingPreview();

    // Wire split-name checkbox
    const splitCb = document.getElementById('split-name-checkbox');
    const surnameWrapper = document.getElementById('surname-col-wrapper');
    const nameLabel = document.getElementById('name-col-label');
    if (splitCb) {
        splitCb.checked = false; // reset on open
        surnameWrapper.style.display = '';
        nameLabel.textContent = 'ชื่อ';
        splitCb.addEventListener('change', () => {
            if (splitCb.checked) {
                surnameWrapper.style.display = 'none';
                nameLabel.textContent = 'ชื่อ-นามสกุล (คอลัมน์เดียว)';
            } else {
                surnameWrapper.style.display = '';
                nameLabel.textContent = 'ชื่อ';
            }
            updateMappingPreview();
        });
    }
}

function updateMappingPreview() {
    const previewContent = document.getElementById('mapping-preview-content');
    if (!previewContent) return;

    const startRow = document.getElementById('map-start-row')?.value || '2';
    let html = `<div class="mb-1">แถวเริ่มต้น: <strong>${startRow}</strong></div>`;
    html += '<div class="grid grid-cols-2 md:grid-cols-3 gap-1">';

    Object.keys(DEFAULT_COL_MAP).forEach(field => {
        const el = document.getElementById(`map-${field}`);
        const val = el ? el.value : DEFAULT_COL_MAP[field];
        let display;
        if (val === 'none') {
            display = '<span class="text-gray-400">ไม่มี</span>';
        } else if (field === 'studyPlan' && getPlanKeys().includes(val)) {
            display = `<strong class="text-blue-600">${val} (ทั้งไฟล์)</strong>`;
        } else {
            display = `<strong>คอลัมน์ ${val}</strong>`;
        }
        const label = COL_FIELD_LABELS[field] || field;
        html += `<div>${label}: ${display}</div>`;
    });

    getAllSubjectColumns().forEach(subj => {
        const field = subj.key;
        const el = document.getElementById(`map-${field}`);
        const val = el ? el.value : 'none';
        let display = (val === 'none') ? '<span class="text-gray-400">ไม่มี</span>' : `<strong>คอลัมน์ ${val}</strong>`;
        html += `<div>${escapeHtml(subj.label)}: ${display}</div>`;
    });

    const splitCb = document.getElementById('split-name-checkbox');
    if (splitCb?.checked) {
        html += `<div class="text-green-600 font-medium">✂️ ชื่อ-นามสกุล: แยกด้วยเว้นวรรค (ใช้ col ชื่อ)</div>`;
    }

    html += '</div>';
    previewContent.innerHTML = html;
}

function openMappingModal() {
    const modal = document.getElementById('column-mapping-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    initColumnMappingModal();
}

function closeMappingModal() {
    const modal = document.getElementById('column-mapping-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function getUploadConfigFromModal() {
    const startRow = parseInt(document.getElementById('map-start-row').value) || 2;
    const config = { startRow };

    Object.keys(DEFAULT_COL_MAP).forEach(field => {
        const el = document.getElementById(`map-${field}`);
        const val = el ? el.value : DEFAULT_COL_MAP[field];
        if (val === 'none') {
            config[field] = null;
        } else if (field === 'studyPlan' && getPlanKeys().includes(val)) {
            config[field] = val; // fixed plan string — not a column index
        } else {
            config[field] = columnLetterToIndex(val);
        }
    });
    // avgScore is already handled as part of DEFAULT_COL_MAP above

    getAllSubjectColumns().forEach(subj => {
        const field = subj.key;
        const el = document.getElementById(`map-${field}`);
        const val = el ? el.value : 'none';
        if (val === 'none') {
            config[field] = null;
        } else {
            config[field] = columnLetterToIndex(val);
        }
    });

    const splitCb = document.getElementById('split-name-checkbox');
    config.splitNameSurname = splitCb ? splitCb.checked : false;

    return config;
}

// Attach change listeners for live preview
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.col-map-select').forEach(s => {
        s.addEventListener('change', updateMappingPreview);
    });
    const startRowEl = document.getElementById('map-start-row');
    if (startRowEl) startRowEl.addEventListener('input', updateMappingPreview);
});

// Modal open/close handlers
document.getElementById('mapping-modal-close')?.addEventListener('click', closeMappingModal);
document.getElementById('mapping-cancel-btn')?.addEventListener('click', closeMappingModal);
document.getElementById('mapping-confirm-btn')?.addEventListener('click', () => {
    uploadConfig = getUploadConfigFromModal();
    closeMappingModal();
    document.getElementById('excel-file').click();
});

// Close modal on backdrop click
document.getElementById('column-mapping-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeMappingModal();
});

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

    // Load custom overrides first
    getDocs(collection(db, 'studyPlanStats')).then(snap => {
        const customOverrides = {};
        snap.forEach(doc => {
            const data = doc.data();
            if (data.custom) {
                customOverrides[doc.id] = data.custom; // { subjectKey: { max: 100, avg: 50.5 } }
            }
        });
        _renderStudyPlanStatsWithOverrides(students, customOverrides, container);
    }).catch(e => {
        console.error('Failed to load custom stats:', e);
        _renderStudyPlanStatsWithOverrides(students, {}, container);
    });
}

function _renderStudyPlanStatsWithOverrides(students, customOverrides, container) {
    const planKeys = getPlanKeys();
    const stats = {};
    planKeys.forEach((planKey) => {
        stats[planKey] = { count: 0, sums: {}, maxs: {}, mins: {} };
        getPlanSubjects(planKey).forEach((subj) => {
            stats[planKey].sums[subj.key] = 0;
            stats[planKey].maxs[subj.key] = -Infinity;
            stats[planKey].mins[subj.key] = Infinity;
        });
    });

    (students || []).forEach((student) => {
        const plan = normalizeStudyPlan(student.studyPlan);
        if (!planConfig[plan]) return;
        stats[plan].count += 1;
        getPlanSubjects(plan).forEach((subj) => {
            const scoreValue = toNumber(student.scores?.[subj.key]);
            stats[plan].sums[subj.key] += scoreValue;
            stats[plan].maxs[subj.key] = Math.max(stats[plan].maxs[subj.key], scoreValue);
            stats[plan].mins[subj.key] = Math.min(stats[plan].mins[subj.key], scoreValue);
        });
    });

    // Merge and Publish (but preserve custom overrides)
    publishStudyPlanStats(stats, customOverrides).catch((e) => {
        console.error('Failed to publish study plan stats:', e);
    });

    container.innerHTML = planKeys.map((planKey) => {
        const planStat = stats[planKey];
        const overrides = customOverrides[planKey] || {};
        const count = planStat.count;
        const rowsHtml = getPlanSubjects(planKey).map((subj) => {
            const calcMax = count > 0 ? planStat.maxs[subj.key] : null;
            const calcMin = count > 0 ? planStat.mins[subj.key] : null;
            const calcAvg = count > 0 ? (planStat.sums[subj.key] / count) : null;

            // Apply override if exists, otherwise use calculated
            const customMax = overrides[subj.key]?.max;
            const customMin = overrides[subj.key]?.min;
            const customAvg = overrides[subj.key]?.avg;

            const displayMax = customMax !== undefined && customMax !== null && customMax !== '' ? customMax : (calcMax === null ? '' : formatNumber(calcMax, 2));
            const displayMin = customMin !== undefined && customMin !== null && customMin !== '' ? customMin : (calcMin === null ? '' : formatNumber(calcMin, 2));
            const displayAvg = customAvg !== undefined && customAvg !== null && customAvg !== '' ? customAvg : (calcAvg === null ? '' : formatNumber(calcAvg, 2));

            const fmStatDisplay = subj.fullMarkStat !== undefined ? subj.fullMarkStat : subj.fullMark;
            return `
                <tr class="border-b border-gray-100" data-plan="${planKey}" data-subj="${subj.key}">
                    <td class="py-2 pr-2 text-gray-700">${subj.label}</td>
                    <td class="py-2 px-2 text-center text-gray-500 text-xs font-mono">${formatNumber(subj.fullMark, 0)}</td>
                    <td class="py-2 px-2 text-center text-gray-700">${formatNumber(fmStatDisplay, 0)}</td>
                    <td class="py-2 px-2 text-center">
                        <input type="number" step="0.01" class="stat-override-max w-16 px-1 py-1 text-center text-sm border border-gray-200 rounded focus:ring-1 focus:ring-primary ${customMax !== undefined && customMax !== '' ? 'bg-yellow-50 text-yellow-700 font-bold border-yellow-300' : 'text-gray-700'}" value="${displayMax}" placeholder="คำนวณ">
                    </td>
                    <td class="py-2 px-2 text-center">
                        <input type="number" step="0.01" class="stat-override-min w-16 px-1 py-1 text-center text-sm border border-gray-200 rounded focus:ring-1 focus:ring-primary ${customMin !== undefined && customMin !== '' ? 'bg-yellow-50 text-yellow-700 font-bold border-yellow-300' : 'text-gray-700'}" value="${displayMin}" placeholder="คำนวณ">
                    </td>
                    <td class="py-2 pl-2 text-center">
                        <input type="number" step="0.01" class="stat-override-avg w-16 px-1 py-1 text-center text-sm border border-gray-200 rounded focus:ring-1 focus:ring-primary ${customAvg !== undefined && customAvg !== '' ? 'bg-yellow-50 text-yellow-700 font-bold border-yellow-300' : 'text-gray-700'}" value="${displayAvg}" placeholder="คำนวณ">
                    </td>
                </tr>
            `;
        }).join('');

        return `
            <div class="border border-gray-100 rounded-xl p-4 bg-white relative">
                <div class="flex items-center justify-between mb-3">
                    <div class="font-bold text-gray-800">${getPlanLabel(planKey)}</div>
                    <div class="text-sm text-gray-600 flex items-center gap-2">
                        จำนวนผู้เข้าสอบ: <span class="font-semibold text-primary">${count}</span>
                        <button class="save-stats-btn bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-2 py-1 rounded text-xs font-bold transition ml-2 border border-indigo-200" data-plan="${planKey}">บันทึกสถิติ</button>
                    </div>
                </div>
                <div class="overflow-x-auto rounded-lg border border-gray-100">
                    <table class="min-w-full text-sm">
                        <thead>
                            <tr class="bg-blue-50 text-gray-700 text-xs uppercase">
                                <th class="py-2 px-3 text-left font-bold">วิชา</th>
                                <th class="py-2 px-3 text-center font-bold text-gray-400" title="คะแนนเต็มแบบหารแล้ว">เต็ม (หาร)</th>
                                <th class="py-2 px-3 text-center font-bold">เต็ม (สถิติ)</th>
                                <th class="py-2 px-3 text-center font-bold">สูงสุด</th>
                                <th class="py-2 px-3 text-center font-bold">ต่ำสุด</th>
                                <th class="py-2 px-3 text-center font-bold">เฉลี่ย</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
                <div class="text-xs text-gray-400 mt-2 flex justify-between">
                    <span>* หากต้องการใช้ค่าที่คำนวณอัตโนมัติ ให้ลบข้อมูลในช่องให้ว่างเปล่าแล้วบันทึก</span>
                    <span class="save-stats-status text-indigo-500 font-bold" id="stats-status-${planKey}"></span>
                </div>
            </div>
        `;
    }).join('');

    // Attach save handlers for stats
    container.querySelectorAll('.save-stats-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const planKey = btn.dataset.plan;
            const block = btn.closest('.bg-white');
            const statusEl = document.getElementById(`stats-status-${planKey}`);

            const newOverrides = {};
            block.querySelectorAll('tr[data-subj]').forEach(tr => {
                const subjKey = tr.dataset.subj;
                const maxVal = tr.querySelector('.stat-override-max').value.trim();
                const minVal = tr.querySelector('.stat-override-min').value.trim();
                const avgVal = tr.querySelector('.stat-override-avg').value.trim();

                if (maxVal !== '' || minVal !== '' || avgVal !== '') {
                    newOverrides[subjKey] = {
                        max: maxVal !== '' ? Number(maxVal) : null,
                        min: minVal !== '' ? Number(minVal) : null,
                        avg: avgVal !== '' ? Number(avgVal) : null
                    };
                }
            });

            try {
                statusEl.textContent = 'กำลังบันทึก...';
                await setDoc(doc(db, 'studyPlanStats', planKey), { custom: newOverrides }, { merge: true });
                statusEl.textContent = '✅ บันทึกแล้ว';
                statusEl.classList.replace('text-indigo-500', 'text-green-500');
                setTimeout(() => {
                    statusEl.textContent = '';
                    statusEl.classList.replace('text-green-500', 'text-indigo-500');
                    // Reload table to show yellow highlight
                    loadStudents();
                }, 1000);
            } catch (e) {
                console.error('Error saving custom stats:', e);
                statusEl.textContent = '❌ ผิดพลาด';
                statusEl.classList.replace('text-indigo-500', 'text-red-500');
            }
        });
    });
}

async function publishStudyPlanStats(statsByPlan, customOverrides = {}) {
    const planKeys = getPlanKeys();
    const updates = planKeys.map(async (planKey) => {
        const planStat = statsByPlan?.[planKey];
        if (!planStat) return;

        const count = planStat.count || 0;
        const overrides = customOverrides[planKey] || {};
        const subjects = {};

        getPlanSubjects(planKey).forEach((subj) => {
            const sum = planStat.sums?.[subj.key] || 0;
            const calcMax = count > 0 ? planStat.maxs?.[subj.key] : null;
            const calcMin = count > 0 ? planStat.mins?.[subj.key] : null;
            const calcAvg = count > 0 ? (sum / count) : null;

            // Use override if present, else fallback to calculated
            const customMax = overrides[subj.key]?.max;
            const customMin = overrides[subj.key]?.min;
            const customAvg = overrides[subj.key]?.avg;

            const finalMax = customMax !== undefined && customMax !== null ? customMax : calcMax;
            const finalMin = customMin !== undefined && customMin !== null ? customMin : calcMin;
            const finalAvg = customAvg !== undefined && customAvg !== null ? customAvg : calcAvg;

            subjects[subj.key] = {
                label: subj.label,
                fullMark: subj.fullMark,
                fullMarkStat: subj.fullMarkStat !== undefined ? subj.fullMarkStat : subj.fullMark,
                max: finalMax === null ? null : Number(finalMax),
                min: finalMin === null ? null : Number(finalMin),
                avg: finalAvg === null ? null : Number(finalAvg)
            };
        });

        const payload = {
            planKey,
            label: getPlanLabel(planKey),
            count: Number(count),
            subjects,
            custom: overrides, // Keep overrides in the doc
            updatedAt: new Date().toISOString()
        };

        await setDoc(doc(db, 'studyPlanStats', planKey), payload);
    });

    await Promise.all(updates);
}

// ============= Plan Config: Load from Firestore =============
async function loadPlanConfig() {
    try {
        const snap = await getDoc(doc(db, 'config', 'planConfig'));
        if (snap.exists()) {
            const data = snap.data();
            // Validate and merge
            const merged = {};
            Object.keys(data).forEach(planKey => {
                const plan = data[planKey];
                if (plan && Array.isArray(plan.subjects)) {
                    merged[planKey] = {
                        label: plan.label || planKey,
                        subjects: plan.subjects.map(s => ({
                            key: String(s.key || '').trim(),
                            label: String(s.label || s.key || '').trim(),
                            fullMark: Number(s.fullMark) || 0,
                            fullMarkStat: s.fullMarkStat !== undefined ? Number(s.fullMarkStat) : Number(s.fullMark) || 0
                        })).filter(s => s.key)
                    };
                }
            });
            if (Object.keys(merged).length > 0) {
                planConfig = merged;
            }
        }
    } catch (e) {
        console.error('loadPlanConfig error:', e);
    }
    renderPlanConfigUI();
    updateStudyPlanDropdowns();
}

async function savePlanConfig() {
    const statusEl = document.getElementById('plan-config-status');
    try {
        statusEl.textContent = 'กำลังบันทึก...';
        const toSave = {};
        getPlanKeys().forEach(planKey => {
            toSave[planKey] = {
                label: planConfig[planKey].label,
                subjects: getPlanSubjects(planKey).map(s => ({
                    key: s.key,
                    label: s.label,
                    fullMark: s.fullMark,
                    fullMarkStat: s.fullMarkStat !== undefined ? s.fullMarkStat : s.fullMark
                }))
            };
        });
        await setDoc(doc(db, 'config', 'planConfig'), toSave);
        statusEl.textContent = '✅ บันทึกแล้ว';
        setTimeout(() => { statusEl.textContent = ''; }, 3000);
        // Re-render dependent UI
        renderAddFormScoreFields(document.getElementById('study-plan')?.value);
        loadStudents();
    } catch (e) {
        console.error('savePlanConfig error:', e);
        statusEl.textContent = '❌ บันทึกไม่สำเร็จ';
    }
}

// ============= Plan Config: Render Tab UI =============
let activePlanTab = null;

function renderPlanConfigUI() {
    const tabsEl = document.getElementById('plan-config-tabs');
    const panelsEl = document.getElementById('plan-config-panels');
    if (!tabsEl || !panelsEl) return;

    const planKeys = getPlanKeys();
    if (!activePlanTab || !planKeys.includes(activePlanTab)) {
        activePlanTab = planKeys[0] || null;
    }

    // Render tabs
    tabsEl.innerHTML = planKeys.map(planKey => `
        <button
            class="plan-tab-btn px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition duration-150 ${planKey === activePlanTab
            ? 'border-orange-500 text-orange-700 bg-orange-50'
            : 'border-transparent text-gray-500 hover:text-orange-600 hover:bg-orange-50'
        }"
            data-plan="${planKey}"
        >${planKey}</button>
    `).join('');

    // Attach tab click handlers
    tabsEl.querySelectorAll('.plan-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            activePlanTab = btn.dataset.plan;
            renderPlanConfigUI();
        });
    });

    // Render active panel
    if (!activePlanTab) {
        panelsEl.innerHTML = '';
        return;
    }
    panelsEl.innerHTML = renderPlanPanel(activePlanTab);
    attachPlanPanelEvents(activePlanTab);
}

function renderPlanPanel(planKey) {
    const plan = planConfig[planKey];
    const subjects = plan?.subjects || [];

    const rows = subjects.map((s, i) => {
        const fmStat = s.fullMarkStat !== undefined ? s.fullMarkStat : s.fullMark;
        return `
        <tr class="border-b border-orange-100" data-idx="${i}">
            <td class="py-2 pl-2 pr-1">
                <input type="text" class="subj-label-input w-full px-2 py-1 border border-orange-200 rounded text-sm bg-orange-50 focus:outline-none focus:ring-1 focus:ring-orange-400"
                    value="${escapeHtml(s.label)}" placeholder="ชื่อวิชา" data-idx="${i}">
            </td>
            <td class="py-2 px-1">
                <input type="text" class="subj-key-input w-24 px-2 py-1 border border-orange-200 rounded text-sm bg-orange-50 focus:outline-none focus:ring-1 focus:ring-orange-400 font-mono"
                    value="${escapeHtml(s.key)}" placeholder="key" data-idx="${i}">
            </td>
            <td class="py-2 px-1">
                <input type="number" class="subj-fm-input w-20 px-2 py-1 border border-orange-200 rounded text-sm bg-orange-50 text-center font-bold focus:outline-none focus:ring-1 focus:ring-orange-400"
                    value="${s.fullMark}" min="1" max="9999" data-idx="${i}" title="คะแนนเต็มแบบหารแล้ว (ใช้คำนวณร้อยละ)">
            </td>
            <td class="py-2 px-1">
                <input type="number" class="subj-fmstat-input w-20 px-2 py-1 border border-purple-200 rounded text-sm bg-purple-50 text-center font-bold focus:outline-none focus:ring-1 focus:ring-purple-400"
                    value="${fmStat}" min="1" max="9999" data-idx="${i}" title="คะแนนเต็มในสถิติ (แสดงในตารางสถิติ)">
            </td>
            <td class="py-2 pl-1">
                <button class="subj-delete-btn text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 text-xs font-bold transition" data-idx="${i}">✕ ลบ</button>
            </td>
        </tr>
    `;
    }).join('');

    return `
        <div class="overflow-x-auto">
            <table class="w-full text-sm mb-3">
                <thead>
                    <tr class="text-xs text-gray-500 uppercase bg-orange-50">
                        <th class="py-2 pl-2 pr-1 text-left font-semibold">ชื่อวิชา</th>
                        <th class="py-2 px-1 text-left font-semibold">Key (ภาษาอังกฤษ)</th>
                        <th class="py-2 px-1 text-center font-semibold text-orange-700" title="ใช้เป็นตัวหาร เมื่อแสดงคะแนน/เต็ม บนหน้าผลคะแนน">เต็ม (หาร 💡)</th>
                        <th class="py-2 px-1 text-center font-semibold text-purple-700" title="แสดงใน คอลัมน์ เต็ม ของตารางสถิติ">เต็ม (สถิติ 📊)</th>
                        <th class="py-2 pl-1"></th>
                    </tr>
                </thead>
                <tbody id="subj-rows-${planKey}">
                    ${rows}
                </tbody>
            </table>
            <div class="flex items-center gap-4 mb-3">
                <span class="text-xs text-orange-600 bg-orange-50 border border-orange-200 px-2 py-1 rounded">💡 เต็ม (หาร) = ตัวหารเมื่อแสดงคะแนน เช่น 45/60 หรือคำนวณร้อยละ</span>
                <span class="text-xs text-purple-600 bg-purple-50 border border-purple-200 px-2 py-1 rounded">📊 เต็ม (สถิติ) = คะแนนเต็มที่แสดงในตารางสถิติ</span>
            </div>
            <button id="add-subj-btn-${planKey}"
                class="text-orange-600 hover:text-orange-800 text-sm font-medium px-3 py-1.5 border border-orange-300 rounded-lg hover:bg-orange-50 transition duration-150">
                ➕ เพิ่มวิชา
            </button>
        </div>
    `;
}

function attachPlanPanelEvents(planKey) {
    const panel = document.getElementById('plan-config-panels');
    if (!panel) return;

    // Sync inputs to planConfig on change
    const syncInputs = () => {
        const subjects = [];
        panel.querySelectorAll('tr[data-idx]').forEach(tr => {
            const label = tr.querySelector('.subj-label-input')?.value.trim() || '';
            const key = tr.querySelector('.subj-key-input')?.value.trim().replace(/\s+/g, '_') || '';
            const fullMark = parseInt(tr.querySelector('.subj-fm-input')?.value) || 0;
            const fullMarkStat = parseInt(tr.querySelector('.subj-fmstat-input')?.value);
            if (key) subjects.push({ key, label, fullMark, fullMarkStat: Number.isFinite(fullMarkStat) ? fullMarkStat : fullMark });
        });
        planConfig[planKey].subjects = subjects;
    };
    panel.querySelectorAll('input').forEach(inp => inp.addEventListener('input', syncInputs));

    // Delete subject row
    panel.querySelectorAll('.subj-delete-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            syncInputs();
            const idx = parseInt(btn.dataset.idx);
            planConfig[planKey].subjects.splice(idx, 1);
            renderPlanConfigUI();
        });
    });

    // Add new subject
    document.getElementById(`add-subj-btn-${planKey}`)?.addEventListener('click', () => {
        syncInputs();
        planConfig[planKey].subjects.push({ key: '', label: '', fullMark: 0, fullMarkStat: 0 });
        renderPlanConfigUI();
        // Focus the new label input
        const rows = panel.querySelectorAll('tr[data-idx]');
        const lastRow = rows[rows.length - 1];
        lastRow?.querySelector('.subj-label-input')?.focus();
    });
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

document.getElementById('save-plan-config-btn')?.addEventListener('click', () => {
    // Flush any pending input changes by reading from current panel before saving
    const planKey = activePlanTab;
    if (planKey) {
        const panel = document.getElementById('plan-config-panels');
        const subjects = [];
        panel?.querySelectorAll('tr[data-idx]').forEach(tr => {
            const label = tr.querySelector('.subj-label-input')?.value.trim() || '';
            const key = tr.querySelector('.subj-key-input')?.value.trim().replace(/\s+/g, '_') || '';
            const fullMark = parseInt(tr.querySelector('.subj-fm-input')?.value) || 0;
            const fullMarkStat = parseInt(tr.querySelector('.subj-fmstat-input')?.value);
            if (key) subjects.push({ key, label, fullMark, fullMarkStat: Number.isFinite(fullMarkStat) ? fullMarkStat : fullMark });
        });
        planConfig[planKey].subjects = subjects;
    }
    savePlanConfig();
});

// Update the study plan dropdown options in add-student form from planConfig
function updateStudyPlanDropdowns() {
    const planKeys = getPlanKeys();
    const studyPlanEl = document.getElementById('study-plan');
    if (studyPlanEl) {
        const currentVal = studyPlanEl.value;
        studyPlanEl.innerHTML = planKeys.map(k =>
            `<option value="${k}">${getPlanLabel(k)}</option>`
        ).join('');
        if (planKeys.includes(currentVal)) studyPlanEl.value = currentVal;
    }
    // Also update map-studyPlan fixed options in the mapping modal
    const mappingModal = document.getElementById('column-mapping-modal');
    if (mappingModal) {
        // Rebuild the fixed plan options in map-studyPlan
        const studyPlanSelect = document.getElementById('map-studyPlan');
        if (studyPlanSelect) {
            // Remove old fixed plan options (after the column options)
            Array.from(studyPlanSelect.options).forEach(opt => {
                if (planKeys.includes(opt.value)) opt.remove();
                if (opt.disabled && opt.textContent.includes('กำหนดแผน')) opt.remove();
            });
            const sep = document.createElement('option');
            sep.disabled = true;
            sep.textContent = '── กำหนดแผนให้ทั้งไฟล์ ──';
            studyPlanSelect.appendChild(sep);
            planKeys.forEach(k => {
                const opt = document.createElement('option');
                opt.value = k;
                opt.textContent = `${k} (ทุกแถว)`;
                studyPlanSelect.appendChild(opt);
            });
        }
    }
}

// ============= Dynamic Add-Student Score Fields =============
function renderAddFormScoreFields(planKey) {
    const container = document.getElementById('score-fields-container');
    if (!container) return;
    if (!planKey || !planConfig[planKey]) {
        container.innerHTML = '<p class="text-xs text-gray-400 col-span-full">เลือกแผนการเรียนเพื่อแสดงช่องกรอกคะแนน</p>';
        return;
    }
    const subjects = getPlanSubjects(planKey);
    container.innerHTML = subjects.map(s => `
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">${escapeHtml(s.label)}
                <span class="text-xs text-gray-400 font-normal">/ ${s.fullMark}</span>
            </label>
            <input type="number" name="${s.key}" min="0" max="${s.fullMark}"
                class="w-full px-3 py-2 border border-blue-200 rounded-md focus:outline-none focus:ring-2 focus:ring-secondary focus:border-transparent transition">
        </div>
    `).join('');
}

// Check admin authentication state
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('admin-name').textContent = `Welcome, ${user.email}`;
        loadPlanConfig().then(() => {
            loadStudents();
        });
        loadLoginMode();
        loadDisplaySettings();
    } else {
        window.location.href = 'index.html';
    }
});

// ============= Login Mode Setting =============
async function loadLoginMode() {
    try {
        const snap = await getDoc(doc(db, 'config', 'settings'));
        const mode = snap.exists() ? (snap.data().loginMode || 'thID') : 'thID';
        const radio = document.querySelector(`input[name="login-mode"][value="${mode}"]`);
        if (radio) radio.checked = true;
        updateLoginModeStatus(mode);
    } catch (e) {
        console.error('loadLoginMode error:', e);
    }
}

function updateLoginModeStatus(mode) {
    const statusEl = document.getElementById('login-mode-status');
    if (!statusEl) return;
    statusEl.textContent = mode === 'studentID'
        ? '✅ ปัจจุบัน: รหัสผู้เข้าสอบ'
        : '✅ ปัจจุบัน: รหัสบัตรประชาชน';
}

document.getElementById('save-login-mode-btn')?.addEventListener('click', async () => {
    const selected = document.querySelector('input[name="login-mode"]:checked');
    if (!selected) { alert('กรุณาเลือกรูปแบบการเข้าสู่ระบบ'); return; }
    const mode = selected.value;
    const statusEl = document.getElementById('login-mode-status');
    try {
        statusEl.textContent = 'กำลังบันทึก...';
        await setDoc(doc(db, 'config', 'settings'), { loginMode: mode }, { merge: true });
        updateLoginModeStatus(mode);
    } catch (e) {
        console.error('saveLoginMode error:', e);
        statusEl.textContent = '❌ บันทึกไม่สำเร็จ';
    }
});

// ============= Display Settings =============
function updatePreOralThresholdVisibility() {
    const oralMode = document.querySelector('input[name="oral-exam-mode"]:checked')?.value || 'no';
    const row = document.getElementById('pre-oral-threshold-row');
    if (!row) return;
    if (oralMode === 'not_included') {
        row.classList.remove('hidden');
        row.classList.add('flex');
    } else {
        row.classList.add('hidden');
        row.classList.remove('flex');
    }
}

// Wire oral-exam-mode radios to toggle threshold row
document.querySelectorAll('input[name="oral-exam-mode"]').forEach(radio => {
    radio.addEventListener('change', updatePreOralThresholdVisibility);
});

async function loadDisplaySettings() {
    try {
        const snap = await getDoc(doc(db, 'config', 'displaySettings'));
        if (snap.exists()) {
            const data = snap.data();
            const scoreMode = data.scoreMode || 'raw';
            const oralMode = data.oralMode || 'no';
            const scoreModeEl = document.querySelector(`input[name="score-display-mode"][value="${scoreMode}"]`);
            if (scoreModeEl) scoreModeEl.checked = true;
            const oralModeEl = document.querySelector(`input[name="oral-exam-mode"][value="${oralMode}"]`);
            if (oralModeEl) oralModeEl.checked = true;
            // Restore threshold
            const thresholdEl = document.getElementById('pre-oral-threshold');
            if (thresholdEl && data.preOralThreshold !== undefined && data.preOralThreshold !== null) {
                thresholdEl.value = data.preOralThreshold;
            }
            const unitVal = data.preOralUnit || 'percent';
            const unitEl = document.querySelector(`input[name="pre-oral-unit"][value="${unitVal}"]`);
            if (unitEl) unitEl.checked = true;
        } else {
            // defaults
            const rawEl = document.getElementById('score-mode-raw');
            if (rawEl) rawEl.checked = true;
            const oralNoEl = document.getElementById('oral-no');
            if (oralNoEl) oralNoEl.checked = true;
        }
        updatePreOralThresholdVisibility();
    } catch (e) {
        console.error('loadDisplaySettings error:', e);
    }
}

document.getElementById('save-display-settings-btn')?.addEventListener('click', async () => {
    const scoreMode = document.querySelector('input[name="score-display-mode"]:checked')?.value || 'raw';
    const oralMode = document.querySelector('input[name="oral-exam-mode"]:checked')?.value || 'no';
    const preOralThresholdRaw = document.getElementById('pre-oral-threshold')?.value.trim();
    const preOralThreshold = preOralThresholdRaw !== '' ? Number(preOralThresholdRaw) : null;
    const preOralUnit = document.querySelector('input[name="pre-oral-unit"]:checked')?.value || 'percent';
    const statusEl = document.getElementById('display-settings-status');
    try {
        statusEl.textContent = 'กำลังบันทึก...';
        await setDoc(doc(db, 'config', 'displaySettings'), {
            scoreMode,
            oralMode,
            preOralThreshold: preOralThreshold !== null ? preOralThreshold : null,
            preOralUnit
        }, { merge: true });
        statusEl.textContent = '✅ บันทึกแล้ว';
        setTimeout(() => { statusEl.textContent = ''; }, 3000);
    } catch (e) {
        console.error('saveDisplaySettings error:', e);
        statusEl.textContent = '❌ บันทึกไม่สำเร็จ';
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

// Show score fields based on study plan — dynamic version
const studyPlanSelectEl = document.getElementById("study-plan");
studyPlanSelectEl?.addEventListener("change", function () {
    renderAddFormScoreFields(this.value);
});

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

    // Build scores dynamically from planConfig
    getPlanSubjects(studyPlan).forEach(s => {
        scores[s.key] = parseInt(formData.get(s.key)) || 0;
    });

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
        { wch: 15 }, { wch: 10 }, { wch: 5 }, { wch: 5 }, { wch: 5 }, { wch: 5 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
        { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }
    ];
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "import_template.xlsx");
});

document.getElementById('upload-excel-btn').addEventListener('click', () => {
    openMappingModal();
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

            // Use dynamic config or fallback to defaults
            const cfg = uploadConfig || {
                startRow: 2,
                thID: columnLetterToIndex(DEFAULT_COL_MAP.thID),
                studentID: columnLetterToIndex(DEFAULT_COL_MAP.studentID),
                prefix: columnLetterToIndex(DEFAULT_COL_MAP.prefix),
                name: columnLetterToIndex(DEFAULT_COL_MAP.name),
                surname: columnLetterToIndex(DEFAULT_COL_MAP.surname),
                studyPlan: columnLetterToIndex(DEFAULT_COL_MAP.studyPlan),
                math: columnLetterToIndex(DEFAULT_COL_MAP.math),
                science: columnLetterToIndex(DEFAULT_COL_MAP.science),
                english: columnLetterToIndex(DEFAULT_COL_MAP.english),
                social: columnLetterToIndex(DEFAULT_COL_MAP.social),
                chinese: columnLetterToIndex(DEFAULT_COL_MAP.chinese),
                thai: columnLetterToIndex(DEFAULT_COL_MAP.thai),
                technology: columnLetterToIndex(DEFAULT_COL_MAP.technology)
            };

            const dataStartIndex = cfg.startRow - 1; // Convert 1-based row to 0-based array index
            let hasFatalError = false;

            for (let i = dataStartIndex; i < jsonData.length; i++) {
                const row = jsonData[i];
                const excelRowNumber = i + 1; // Human-readable row number

                // Check if row is empty (no data)
                if (!row || row.every(cell => !cell || String(cell).trim() === '')) {
                    statusDiv.textContent = `หยุดอัปโหลดที่แถวที่ ${excelRowNumber} เนื่องจากไม่มีข้อมูล`;
                    statusDiv.style.color = 'orange';
                    break; // Stop uploading if row is empty
                }

                const thID = cfg.thID !== null ? String(row[cfg.thID] || '').trim() : '';
                const studentID = cfg.studentID !== null ? String(row[cfg.studentID] || '').trim() : '';
                const prefix = cfg.prefix !== null ? (row[cfg.prefix] || '') : '';
                // --- Name / Surname extraction ---
                let name, surname;
                if (cfg.splitNameSurname) {
                    // Both in the same column — split by first space
                    const fullName = cfg.name !== null ? String(row[cfg.name] || '').trim() : '';
                    const spaceIdx = fullName.indexOf(' ');
                    if (spaceIdx > -1) {
                        name = fullName.substring(0, spaceIdx).trim();
                        surname = fullName.substring(spaceIdx + 1).trim();
                    } else {
                        name = fullName;
                        surname = '';
                    }
                } else {
                    name = cfg.name !== null ? (row[cfg.name] || '') : '';
                    surname = cfg.surname !== null ? (row[cfg.surname] || '') : '';
                }
                // cfg.studyPlan: null = ไม่มี, string 'ISMT'/'ILEC'/'IDGT' = แผนตายตัวทั้งไฟล์, number = index คอลัมน์
                const studyPlan = cfg.studyPlan === null ? ''
                    : typeof cfg.studyPlan === 'string' ? cfg.studyPlan
                        : (row[cfg.studyPlan] || '');
                const normalizedStudyPlan = studyPlan.toString().trim();

                let scores = {};
                let avgScore = null;
                let totalScore = 0;
                let errorMessage = '';
                let docId = null;

                // Update status with current row
                statusDiv.textContent = `กำลังอัปโหลดแถวที่ ${excelRowNumber} - ${prefix} ${name || 'ไม่ระบุชื่อ'}...`;
                statusDiv.style.color = 'orange';

                console.log(`Processing row ${excelRowNumber}:`, { thID, studentID, prefix, name, surname, studyPlan, rawRow: row });

                // Check for errors — ข้ามแถวถ้าข้อมูลขาดในคอลัมน์ที่ตั้งค่าไว้
                let missingFields = [];
                if (cfg.thID !== null && !thID) missingFields.push('ปชช');
                if (cfg.studentID !== null && !studentID) missingFields.push('รหัสสอบ');
                if (cfg.prefix !== null && !prefix) missingFields.push('คำนำหน้า');
                if (cfg.name !== null && !name) missingFields.push('ชื่อ');
                if (cfg.surname !== null && !cfg.splitNameSurname && !surname) missingFields.push('นามสกุล');
                if (cfg.studyPlan !== null && !normalizedStudyPlan) missingFields.push('แผนการเรียน');

                if (missingFields.length > 0) {
                    errorMessage = `ข้อมูลขาด: ${missingFields.join(', ')}`;
                    statusDiv.textContent = `⚠️ ข้ามแถวที่ ${excelRowNumber} - ข้อมูลขาดหาย (${missingFields.join(', ')})`;
                    statusDiv.style.color = 'orange';
                    console.warn(`Skipping row ${excelRowNumber} due to missing fields: ${missingFields.join(', ')}`);
                } else if (normalizedStudyPlan && !getPlanKeys().includes(normalizedStudyPlan)) {
                    errorMessage = `แผนการเรียนผิด: ${normalizedStudyPlan}`;
                    statusDiv.textContent = `⚠️ ข้ามแถวที่ ${excelRowNumber} - แผนการเรียน "${normalizedStudyPlan}" ไม่ถูกต้อง`;
                    statusDiv.style.color = 'orange';
                    console.warn(`Skipping row ${excelRowNumber} due to invalid plan: ${normalizedStudyPlan}`);
                } else {
                    // Note: duplicate studentID is fine — setDoc will overwrite existing data
                    // Process scores dynamically from planConfig
                    const getScore = (colIdx) => colIdx !== null ? (Number(row[colIdx]) || 0) : 0;
                    const planSubjects = normalizedStudyPlan ? getPlanSubjects(normalizedStudyPlan) : [];
                    planSubjects.forEach(subj => {
                        // Try to get the column index from cfg using the subject key
                        const colIdx = cfg[subj.key] !== undefined ? cfg[subj.key] : null;
                        scores[subj.key] = getScore(colIdx);
                    });
                    totalScore = normalizedStudyPlan ? calculateTotalScore(normalizedStudyPlan, scores) : 0;
                    // Extract avgScore
                    if (cfg.avgScore !== null && cfg.avgScore !== undefined) {
                        const rawAvg = row[cfg.avgScore];
                        avgScore = rawAvg !== undefined && rawAvg !== '' ? Number(rawAvg) : null;
                    }
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

                // Upload to Firebase (overwrite by studentID as doc key)
                if (!errorMessage) {
                    try {
                        const scoresWithAvg = { ...scores };
                        if (avgScore !== null) scoresWithAvg.avgScore = avgScore;
                        // Use studentID as document ID so re-uploading overwrites existing data
                        const docRef = doc(db, 'students', studentID);
                        await setDoc(docRef, {
                            thID: thID,
                            studentID: studentID,
                            prefix: prefix,
                            name: name,
                            surname: surname,
                            studyPlan: normalizedStudyPlan,
                            scores: scoresWithAvg
                        });
                        docId = studentID;
                        tableRow.setAttribute('data-id', docId);
                        console.log(`Successfully upserted row ${excelRowNumber} (studentID: ${studentID})`);
                    } catch (error) {
                        tableRow.cells[14].textContent = `ข้อผิดพลาด: ${error.message}`;
                        statusDiv.textContent = `เกิดข้อผิดพลาดในแถวที่ ${excelRowNumber}: ${error.message}`;
                        statusDiv.style.color = 'red';
                        console.error(`Error upserting row ${excelRowNumber}:`, error);
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

            if (!hasFatalError) {
                statusDiv.textContent = `อัปโหลดไฟล์: ${fileName} เสร็จสิ้น`;
                statusDiv.style.color = 'green';
            }
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
    const s = scores || {};
    return getPlanSubjects(studyPlan).reduce((sum, subj) => sum + (Number(s[subj.key]) || 0), 0);
}

// ============= Sort State =============
let allStudentsData = []; // { id, data, scores, studyPlan, total }
let sortColumn = null;
let sortDir = 'asc'; // 'asc' | 'desc'

// Load and display students from Firebase
async function loadStudents() {
    const studentTable = document.getElementById('student-table');
    studentTable.innerHTML = '<tr><td colspan="16" class="text-center py-4 text-gray-400">กำลังโหลด...</td></tr>';

    const querySnapshot = await getDocs(collection(db, 'students'));
    const allStudentsRaw = querySnapshot.docs.map((d) => d.data());
    renderStudyPlanStats(allStudentsRaw);

    allStudentsData = querySnapshot.docs.map((docSnapshot) => {
        const data = docSnapshot.data();
        const scores = data.scores || {};
        const studyPlan = data.studyPlan || data.study_plan || '-';
        const total = calculateTotalScore(studyPlan, scores);
        const avgScore = scores.avgScore !== undefined ? scores.avgScore : null;
        return { id: docSnapshot.id, data, scores, studyPlan, total, avgScore };
    });

    renderStudentsTable();
}

// Collect all unique subject keys across all plans (for table columns)
function getAllSubjectColumns() {
    const seen = new Map(); // key -> { key, label }
    getPlanKeys().forEach(planKey => {
        getPlanSubjects(planKey).forEach(subj => {
            if (!seen.has(subj.key)) seen.set(subj.key, subj);
        });
    });
    return Array.from(seen.values());
}

function renderTableScoreHeaders() {
    const placeholder = document.getElementById('table-score-headers');
    if (!placeholder) return;
    const allSubjs = getAllSubjectColumns();
    // Build new th elements and insert them before the placeholder
    const parent = placeholder.parentElement;
    // Remove existing dynamic score ths
    parent.querySelectorAll('.dynamic-score-th').forEach(el => el.remove());
    // Remove the placeholder
    placeholder.remove();
    // Find the "รวม" th
    const totalTh = parent.querySelector('[data-sort="total"]');
    allSubjs.forEach(subj => {
        const th = document.createElement('th');
        th.className = 'py-3 px-4 text-center font-bold border-b-2 border-secondary sortable cursor-pointer select-none dynamic-score-th';
        th.dataset.sort = subj.key;
        th.innerHTML = `${subj.label} <span class="sort-icon">⇅</span>`;
        parent.insertBefore(th, totalTh);
    });
}

function getSortValue(item, col) {
    if (col === 'total') return item.total;
    if (col === 'avgScore') return item.avgScore ?? -Infinity;
    // Check if col is any known subject key
    const allSubjs = getAllSubjectColumns();
    if (allSubjs.some(s => s.key === col)) {
        return item.scores[col] ?? -Infinity;
    }
    if (col === 'studyPlan') return item.studyPlan || '';
    return (item.data[col] || '').toString();
}

function renderStudentsTable(filterFn = null) {
    const studentTable = document.getElementById('student-table');
    studentTable.innerHTML = '';

    // Update table score headers from config
    renderTableScoreHeaders();

    const allSubjs = getAllSubjectColumns();

    let items = filterFn ? allStudentsData.filter(filterFn) : [...allStudentsData];

    // Apply sort
    if (sortColumn) {
        items.sort((a, b) => {
            const va = getSortValue(a, sortColumn);
            const vb = getSortValue(b, sortColumn);
            if (typeof va === 'number' && typeof vb === 'number') {
                return sortDir === 'asc' ? va - vb : vb - va;
            }
            const sa = String(va), sb = String(vb);
            return sortDir === 'asc' ? sa.localeCompare(sb, 'th') : sb.localeCompare(sa, 'th');
        });
    }

    // Update header icons
    document.querySelectorAll('#table-head .sort-icon').forEach(el => el.textContent = '⇅');
    if (sortColumn) {
        const th = document.querySelector(`#table-head [data-sort="${sortColumn}"] .sort-icon`);
        if (th) th.textContent = sortDir === 'asc' ? '↑' : '↓';
    }

    items.forEach(({ id, data, scores, studyPlan, total, avgScore }, idx) => {
        const row = document.createElement('tr');
        row.setAttribute('data-id', id);
        // Score cells: show value if this student's plan uses this subject, otherwise '-'
        const studentSubjectKeys = new Set(getPlanSubjects(studyPlan).map(s => s.key));
        const scoreCells = allSubjs.map(subj => {
            const val = scores[subj.key];
            const inPlan = studentSubjectKeys.has(subj.key);
            return `<td class="${inPlan ? '' : 'text-gray-300'}">${inPlan && val !== undefined ? formatNumber(val, 2) : '-'}</td>`;
        }).join('');
        const avgDisplay = avgScore !== null && avgScore !== undefined ? formatNumber(avgScore, 2) : '-';
        row.innerHTML = `
            <td>${idx + 1}</td>
            <td>${data.thID || '-'}</td>
            <td>${data.studentID || 'ขาดข้อมูล'}</td>
            <td>${data.prefix || '-'}</td>
            <td>${data.name || '-'}</td>
            <td>${data.surname || '-'}</td>
            <td>${studyPlan}</td>
            ${scoreCells}
            <td>${formatNumber(total, 2)}</td>
            <td class="text-center font-semibold text-teal-700 bg-teal-50">${avgDisplay}</td>
            <td>
                <button class="edit-btn">แก้ไข</button>
                <button class="delete-btn">ลบ</button>
            </td>
        `;
        studentTable.appendChild(row);

        row.querySelector('.edit-btn').addEventListener('click', () => editStudentRow(id, row, studyPlan, allSubjs));
        row.querySelector('.delete-btn').addEventListener('click', async () => {
            await deleteDoc(doc(db, 'students', id));
            loadStudents();
        });
    });
}

// Sort header click handler
document.getElementById('table-head')?.addEventListener('click', (e) => {
    const th = e.target.closest('[data-sort]');
    if (!th) return;
    const col = th.dataset.sort;
    if (sortColumn === col) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = col;
        sortDir = 'asc';
    }
    renderStudentsTable();
});

// Delete all students
document.getElementById('delete-all-btn')?.addEventListener('click', async () => {
    const total = allStudentsData.length;
    if (total === 0) { alert('ไม่มีข้อมูลนักเรียนในระบบ'); return; }
    const confirmed = confirm(`⚠️ คุณต้องการลบข้อมูลนักเรียนทั้งหมด ${total} คน ใช่หรือไม่?\n\nการกระทำนี้ไม่สามารถย้อนกลับได้!`);
    if (!confirmed) return;
    try {
        const snapshot = await getDocs(collection(db, 'students'));
        const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, 'students', d.id)));
        await Promise.all(deletePromises);
        alert(`✅ ลบข้อมูลนักเรียน ${total} คน เรียบร้อยแล้ว`);
        loadStudents();
    } catch (e) {
        console.error('Delete all error:', e);
        alert('❌ เกิดข้อผิดพลาดในการลบข้อมูล');
    }
});


// Edit student row — dynamic version
function editStudentRow(id, row, studyPlan, allSubjs) {
    // Re-derive if called from external context lacking the args
    if (!allSubjs) allSubjs = getAllSubjectColumns();
    if (!studyPlan) studyPlan = row.children[6]?.textContent || '';

    const cells = row.children;
    const thID = cells[1].textContent;
    const studentID = cells[2].textContent === 'ขาดข้อมูล' ? '' : cells[2].textContent;
    const prefix = cells[3].textContent;
    const name = cells[4].textContent;
    const surname = cells[5].textContent;

    // Read current score values (cells 7 to 7+allSubjs.length-1)
    const currentScores = {};
    allSubjs.forEach((subj, i) => {
        const cellText = cells[7 + i]?.textContent || '-';
        currentScores[subj.key] = cellText === '-' ? '' : cellText;
    });

    const planSubjectKeys = new Set(getPlanSubjects(studyPlan).map(s => s.key));
    const totalScore = calculateTotalScore(studyPlan, currentScores);

    // Columns 1–6: identity fields
    cells[1].innerHTML = `<input type="text" value="${escapeHtml(thID)}" maxlength="13">`;
    cells[2].innerHTML = `<input type="text" value="${escapeHtml(studentID)}" maxlength="8">`;
    cells[3].innerHTML = `
        <select>
            <option value="เด็กชาย" ${prefix === 'เด็กชาย' ? 'selected' : ''}>เด็กชาย</option>
            <option value="เด็กหญิง" ${prefix === 'เด็กหญิง' ? 'selected' : ''}>เด็กหญิง</option>
            <option value="นาย" ${prefix === 'นาย' ? 'selected' : ''}>นาย</option>
            <option value="นางสาว" ${prefix === 'นางสาว' ? 'selected' : ''}>นางสาว</option>
        </select>`;
    cells[4].innerHTML = `<input type="text" value="${escapeHtml(name)}">`;
    cells[5].innerHTML = `<input type="text" value="${escapeHtml(surname)}">`;
    cells[6].innerHTML = `<select>${getPlanKeys().map(k =>
        `<option value="${k}" ${studyPlan === k ? 'selected' : ''}>${k}</option>`
    ).join('')}</select>`;

    // Score cells — enable only if the subject belongs to the student's current plan
    allSubjs.forEach((subj, i) => {
        const inPlan = planSubjectKeys.has(subj.key);
        const planDef = getPlanSubjects(studyPlan).find(s => s.key === subj.key);
        const fm = planDef?.fullMark ?? 9999;
        cells[7 + i].innerHTML = `<input type="number" class="edit-score-input" data-key="${subj.key}" value="${currentScores[subj.key] || 0}" min="0" max="${fm}" ${inPlan ? '' : 'disabled'} style="width:60px">`;
    });

    const totalCellIndex = 7 + allSubjs.length;
    const avgScoreCellIndex = totalCellIndex + 1;
    const actionCellIndex = totalCellIndex + 2;
    cells[totalCellIndex].innerHTML = `<span id="edit-total-cell">${totalScore}</span>`;
    // avgScore cell is read-only in edit mode
    if (cells[avgScoreCellIndex]) {
        const curAvg = cells[avgScoreCellIndex].textContent;
        cells[avgScoreCellIndex].innerHTML = `<span class="text-teal-600 font-semibold">${curAvg}</span>`;
    }
    cells[actionCellIndex].innerHTML = `
        <button class="save-btn" data-id="${id}">บันทึก</button>
        <button class="cancel-btn" data-id="${id}">ยกเลิก</button>
    `;

    // When study plan changes, toggle score inputs enabled/disabled
    cells[6].querySelector('select').addEventListener('change', function () {
        const newPlan = this.value;
        const newPlanKeys = new Set(getPlanSubjects(newPlan).map(s => s.key));
        allSubjs.forEach((subj, i) => {
            const inp = cells[7 + i].querySelector('input');
            if (inp) {
                inp.disabled = !newPlanKeys.has(subj.key);
                if (!newPlanKeys.has(subj.key)) inp.value = 0;
            }
        });
        // Recalculate total
        const newScores = {};
        allSubjs.forEach((subj, i) => {
            const inp = cells[7 + i].querySelector('input');
            newScores[subj.key] = parseInt(inp?.value) || 0;
        });
        const tc = document.getElementById('edit-total-cell');
        if (tc) tc.textContent = calculateTotalScore(newPlan, newScores);
    });

    if (cells[actionCellIndex]) {
        cells[actionCellIndex].querySelector('.save-btn').addEventListener('click', () => saveStudent(id, row, allSubjs));
        cells[actionCellIndex].querySelector('.cancel-btn').addEventListener('click', () => loadStudents());
    }
}

// Save edited student — dynamic version
async function saveStudent(id, row, allSubjs) {
    if (!allSubjs) allSubjs = getAllSubjectColumns();
    const cells = row.children;
    const studentID = cells[2].querySelector('input').value;
    const studyPlan = cells[6].querySelector('select').value;
    if (!allSubjs) allSubjs = getAllSubjectColumns();

    if (!studentID || !cells[1].querySelector('input').value || !cells[3].querySelector('select').value || !cells[4].querySelector('input').value || !cells[5].querySelector('input').value || !studyPlan) {
        alert('กรุณากรอกข้อมูลให้ครบถ้วน');
        return;
    }

    if (studentID && await checkDuplicateStudentID(studentID, id)) {
        alert('รหัสนักเรียนนี้มีอยู่ในระบบแล้ว');
        return;
    }

    // Collect scores dynamically from enabled inputs
    const scores = {};
    const planSubjKeys = new Set(getPlanSubjects(studyPlan).map(s => s.key));
    allSubjs.forEach((subj, i) => {
        if (planSubjKeys.has(subj.key)) {
            const inp = cells[7 + i].querySelector('input');
            scores[subj.key] = parseInt(inp?.value) || 0;
        }
    });

    // Preserve existing avgScore (read-only, not editable from inline edit)
    const existingItem = allStudentsData.find(item => item.id === id);
    const existingAvgScore = existingItem?.avgScore;
    if (existingAvgScore !== null && existingAvgScore !== undefined) {
        scores.avgScore = existingAvgScore;
    }

    try {
        if (id) {
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

// Search functionality — filter from local data
document.getElementById('search-btn').addEventListener('click', () => {
    const searchInput = document.getElementById('search-input').value.trim().toLowerCase();
    if (!searchInput) {
        renderStudentsTable();
        return;
    }
    renderStudentsTable((item) => {
        const { data } = item;
        const name = (data.name || '').toLowerCase();
        const surname = (data.surname || '').toLowerCase();
        const studentID = (data.studentID || '').toString().toLowerCase();
        const thID = (data.thID || '').toString().toLowerCase();
        return name.includes(searchInput) || surname.includes(searchInput) ||
            `${name} ${surname}`.includes(searchInput) ||
            studentID.includes(searchInput) || thID.includes(searchInput);
    });
});

// Search on Enter key
document.getElementById('search-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('search-btn').click();
});