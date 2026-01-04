import { auth, db, doc, getDoc, updateDoc, onAuthStateChanged } from "./firebase.js";

// ตรวจสอบว่าผู้ใช้ล็อกอินหรือไม่
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "index.html";
    } else {
        loadStudentData();
    }
});

// โหลดข้อมูลนักเรียนจาก Firestore
async function loadStudentData() {
    const urlParams = new URLSearchParams(window.location.search);
    const studentId = urlParams.get("id");
    if (!studentId) {
        alert("ไม่พบรหัสนักเรียน");
        window.location.href = "admin_dashboard.html";
        return;
    }

    try {
        const studentDoc = await getDoc(doc(db, "students", studentId));
        if (studentDoc.exists()) {
            const studentData = studentDoc.data();
            fillForm(studentData);
        } else {
            alert("ไม่พบนักเรียนในระบบ");
            window.location.href = "admin_dashboard.html";
        }
    } catch (error) {
        console.error("Error loading student data:", error);
    }
}

// เติมข้อมูลลงในฟอร์ม
function fillForm(data) {
    const form = document.getElementById("edit-student-form");
    form.thID.value = data.thID || "";
    form.prefix.value = data.prefix || "";
    form.name.value = data.name || "";
    form.surname.value = data.surname || "";
    form.studentID.value = data.studentID || "";
    form.study_plan.value = data.study_plan || "";

    // แสดงคะแนนตามแผนการเรียน
    showSections(data.study_plan);

    form.math.value = data.math || "";
    form.science.value = data.science || "";
    form.english.value = data.english || "";
    form.chinese.value = data.chinese || "";
    form.social.value = data.social || "";
    form.thai.value = data.thai || "";
    form.technology.value = data.technology || "";
}

// บันทึกการแก้ไขข้อมูล
const editForm = document.getElementById("edit-student-form");
editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const urlParams = new URLSearchParams(window.location.search);
    const studentId = urlParams.get("id");

    const form = event.target;
    const updatedData = {
        thID: form.thID.value || "",
        prefix: form.prefix.value || "",
        name: form.name.value || "",
        surname: form.surname.value || "",
        studentID: form.studentID.value || "",
        study_plan: form.study_plan.value || "",
        math: form.math.value ? parseFloat(form.math.value) : null,
        science: form.science.value ? parseFloat(form.science.value) : null,
        english: form.english.value ? parseFloat(form.english.value) : null,
        chinese: form.chinese.value ? parseFloat(form.chinese.value) : null,
        social: form.social.value ? parseFloat(form.social.value) : null,
        thai: form.thai.value ? parseFloat(form.thai.value) : null,
        technology: form.technology.value ? parseFloat(form.technology.value) : null,
    };

    if (updatedData.study_plan === "ILEC" && updatedData.english > 60) {
        alert("คะแนนภาษาอังกฤษสำหรับแผนการเรียนต่างประเทศต้องไม่เกิน 60");
        return;
    }

    try {
        await updateDoc(doc(db, "students", studentId), updatedData);
        alert("บันทึกข้อมูลสำเร็จ");
        window.location.href = "admin_dashboard.html";
    } catch (error) {
        console.error("Error updating student data:", error);
    }
});

// แสดง/ซ่อนช่องกรอกคะแนนตามแผนการเรียน
function showSections(plan) {
    const sections = [
        "math-section", "science-section", "english-section",
        "chinese-section", "social-section", "thai-section", "technology-section"
    ];
    sections.forEach(section => document.getElementById(section).classList.add("hidden"));

    if (plan === "ISMT") {
        toggleSections(["math-section", "science-section", "english-section"]);
    } else if (plan === "ILEC") {
        toggleSections(["chinese-section", "social-section", "thai-section", "english-section"]);
    } else if (plan === "IDGT" || plan === "IDGT + ISMT") {
        toggleSections(["math-section", "science-section", "english-section", "technology-section"]);
    }
}

function toggleSections(sectionIds) {
    sectionIds.forEach(section => {
        document.getElementById(section).classList.remove("hidden");
    });
}

// แสดง/ซ่อนช่องคะแนนตามการเปลี่ยนแผนการเรียน
const studyPlanSelect = document.getElementById("study-plan");
studyPlanSelect.addEventListener("change", function () {
    showSections(this.value);
});
