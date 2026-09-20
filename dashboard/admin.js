import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    addDoc,
    collection,
    doc,
    getFirestore,
    getDoc,
    deleteDoc,
    onSnapshot,
    serverTimestamp,
    setDoc,
    updateDoc,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ==========================================
// إعدادات الفايربيس (Firebase Config)
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyAOUYXOYqzk2Moc_JP6AaBObSVEoaqQdoE",
    authDomain: "mid-mile-176a4.firebaseapp.com",
    databaseURL: "https://mid-mile-176a4-default-rtdb.firebaseio.com",
    projectId: "mid-mile-176a4",
    storageBucket: "mid-mile-176a4.firebasestorage.app",
    messagingSenderId: "165073334799",
    appId: "1:165073334799:web:1967479338ae8a4b65697a"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ==========================================
// مراجع قواعد البيانات (Database References)
// ==========================================
const usersRef = collection(db, "users");
const ordersRef = collection(db, "orders");
const teamsRef = collection(db, "teams");
const trucksRef = collection(db, "trucks");
const branchMappingsRef = collection(db, "branchMappings");
const systemRef = doc(db, "system", "controls");
const notificationsRef = collection(db, "notifications");
const shiftManagersRef = collection(db, "shiftManagers");
const branchesDirRef = collection(db, "branchesDirectory");

// ==========================================
// متغيرات عامة (Global Variables)
// ==========================================
let allOrders = [];
let barcodeToProductMap = new Map();
let trucksList = [];
let branchMappingsMap = new Map();
let currentSheetData = [];
let processedOrdersToUpload = [];

let allUsers = [];
let carAssignments = {};
let assignedReps = {};
let allDirectoryBranches = [];

// ==========================================
// دوال مساعدة وتنظيف (Helper Functions)
// ==========================================
function getElement(id) {
    return document.getElementById(id);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function cleanBranchName(name) {
    if (!name) return "";
    return String(name).replace(/\s*\(\d+\)\s*$/g, '').trim();
}

function showToast(message, type = "error") {
    const toast = getElement("toastNotification");
    const icon = getElement("toastIcon");
    const text = getElement("toastMessage");
    
    if (!toast || !icon || !text) return;

    text.textContent = message;
    
    if (type === "success") {
        toast.className = "fixed top-4 left-1/2 -translate-x-1/2 transition-all duration-300 z-[100] flex items-center gap-3 px-6 py-3 rounded-xl shadow-2xl font-bold text-sm pointer-events-none w-max max-w-[90%] bg-green-900 border border-green-500 text-white opacity-0 -translate-y-4";
        icon.className = "fas fa-check-circle text-green-400 text-lg";
    } else {
        toast.className = "fixed top-4 left-1/2 -translate-x-1/2 transition-all duration-300 z-[100] flex items-center gap-3 px-6 py-3 rounded-xl shadow-2xl font-bold text-sm pointer-events-none w-max max-w-[90%] bg-red-900 border border-red-500 text-white opacity-0 -translate-y-4";
        icon.className = "fas fa-exclamation-circle text-red-400 text-lg";
    }

    setTimeout(() => {
        toast.classList.remove("opacity-0", "-translate-y-4");
        toast.classList.add("opacity-100", "translate-y-0");
    }, 10);

    clearTimeout(showToast.timeout);
    showToast.timeout = setTimeout(() => {
        toast.classList.remove("opacity-100", "translate-y-0");
        toast.classList.add("opacity-0", "-translate-y-4");
    }, 3000);
}

function setBusy(button, busy, label = "جاري التنفيذ...") {
    if (!button) return;
    
    if (busy) {
        button.dataset.originalHtml = button.innerHTML;
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${label}`;
        button.disabled = true;
        button.classList.add("opacity-60", "cursor-wait");
    } else {
        button.innerHTML = button.dataset.originalHtml || button.innerHTML;
        button.disabled = false;
        button.classList.remove("opacity-60", "cursor-wait");
    }
}

function formatDate(value) {
    if (!value) return "";
    let date = value;
    
    if (typeof value?.toDate === "function") {
        date = value.toDate();
    } else if (typeof value === "number") {
        date = new Date(value < 100000000000 ? value * 1000 : value);
    }
    
    const parsed = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(parsed.getTime())) return "";
    
    return new Intl.DateTimeFormat('ar-EG', { 
        dateStyle: 'medium', 
        timeStyle: 'short' 
    }).format(parsed);
}


// ==========================================
// تحديث تاب الإحصائيات (8 كروت احترافية)
// ==========================================
function updateStatistics() {
    // 1. إجمالي المناديب
    if(getElement("stat-total-reps")) {
        getElement("stat-total-reps").textContent = allUsers.length;
    }

    // 2. إجمالي الفروع بالدليل
    if(getElement("stat-total-branches")) {
        getElement("stat-total-branches").textContent = allDirectoryBranches.length;
    }

    // 3. عدد موظفي الفروع
    let totalStaff = 0;
    allDirectoryBranches.forEach(branch => {
        if (branch.staff && branch.staff.length > 0) {
            totalStaff += branch.staff.length;
        }
    });
    if(getElement("stat-branch-staff")) {
        getElement("stat-branch-staff").textContent = totalStaff;
    }

    // حسابات الأوردرات لليوم الحالي
    const todayStr = new Date().toDateString();
    let readyCount = 0;
    let doneTodayCount = 0;
    let assignedTodayCount = 0;
    let openAssignedCount = 0;
    let uniqueVisits = new Set(); // لحساب عدد الزيارات

    allOrders.forEach(order => {
        const orderDateStr = order.createdAt?.toDate ? order.createdAt.toDate().toDateString() : "";
        const isToday = orderDateStr === todayStr;
        const hasRep = order.hrid && order.hrid !== "";

        // أوردرات جاهزة (بغض النظر عن اليوم)
        if (order.status === "Ready") {
            readyCount++;
        }
        
        // تم التسليم اليوم والزيارات
        if (order.status === "Done" && isToday) {
            doneTodayCount++;
            if (order.branch) {
                // نضيف الفرع في الـ Set عشان نمنع تكرار نفس الفرع في نفس اليوم
                uniqueVisits.add(order.branch + "_" + order.hrid);
            }
        }

        // الأوردرات المسنودة اليوم
        if (hasRep && isToday && order.status !== "Pending" && order.status !== "Resolved") {
            assignedTodayCount++;
            // مسنودة ولم تغلق (ليست Done)
            if (order.status !== "Done" && order.status !== "Rejected") {
                openAssignedCount++;
            }
        }
    });

    if(getElement("stat-ready-orders")) getElement("stat-ready-orders").textContent = readyCount;
    if(getElement("stat-done-orders")) getElement("stat-done-orders").textContent = doneTodayCount;
    if(getElement("stat-today-visits")) getElement("stat-today-visits").textContent = uniqueVisits.size;
    if(getElement("stat-assigned-orders")) getElement("stat-assigned-orders").textContent = assignedTodayCount;
    if(getElement("stat-open-orders")) getElement("stat-open-orders").textContent = openAssignedCount;
}


// ==========================================
// 1. إعدادات النظام (Odoo ومديري الشيفت)
// ==========================================

// جلب حساب أودو المسجل وعرضه
onSnapshot(doc(db, "system", "odoo_credentials"), (docSnap) => {
    const userLabel = getElement("currentOdooUser");
    if (!userLabel) return;
    
    if (docSnap.exists() && docSnap.data().username) {
        userLabel.textContent = docSnap.data().username;
        userLabel.classList.replace("text-red-400", "text-green-400");
    } else {
        userLabel.textContent = "لا يوجد حساب مسجل حالياً";
        userLabel.classList.replace("text-green-400", "text-red-400");
    }
});

// حفظ بيانات Odoo
getElement("odooSettingsForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const username = getElement("odooUsername").value.trim();
    const password = getElement("odooPassword").value;
    const btn = e.target.querySelector("button");
    
    if (!username || !password) {
        return showToast("برجاء إدخال اسم المستخدم وكلمة المرور");
    }

    setBusy(btn, true, "جاري الحفظ...");
    
    try {
        await setDoc(doc(db, "system", "odoo_credentials"), { 
            username: username, 
            password: password, 
            updatedAt: serverTimestamp() 
        });
        showToast("تم حفظ بيانات أودو بنجاح", "success");
        e.target.reset(); // تصفير الفورم بعد الحفظ
    } catch(err) {
        console.error(err);
        showToast("تعذر حفظ البيانات");
    } finally {
        setBusy(btn, false);
    }
});

// إضافة مدير شيفت (برابط الصورة URL)
getElement("shiftManagerForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const name = getElement("smName").value.trim();
    const whatsapp = getElement("smWhatsapp").value.trim();
    const imageUrl = getElement("smImageUrl").value.trim();
    const btn = e.target.querySelector("button");

    if (!name || !whatsapp || !imageUrl) {
        return showToast("برجاء إكمال جميع البيانات ورابط الصورة");
    }

    setBusy(btn, true, "جاري الإضافة...");

    try {
        await addDoc(shiftManagersRef, { 
            name: name, 
            whatsapp: whatsapp, 
            image: imageUrl, 
            createdAt: serverTimestamp() 
        });
        e.target.reset();
        showToast("تم إضافة المدير بنجاح", "success");
    } catch(err) {
        console.error(err);
        showToast("تعذر إضافة المدير");
    } finally {
        setBusy(btn, false);
    }
});

// جلب وعرض مديري الشيفت
onSnapshot(shiftManagersRef, (snapshot) => {
    const tbody = getElement("shiftManagersTableBody");
    if (!tbody) return;
    
    tbody.innerHTML = "";
    
    if (snapshot.empty) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-gray-500 font-bold">لا يوجد مديرين مسجلين</td></tr>';
        return;
    }
    
    snapshot.forEach(docSnap => {
        const sm = docSnap.data();
        tbody.innerHTML += `
            <tr class="hover:bg-gray-700/50 transition">
                <td class="p-3 text-center">
                    <img src="${escapeHtml(sm.image)}" class="w-12 h-12 rounded-full mx-auto object-cover border-2 border-gray-600 shadow" onerror="this.src='https://via.placeholder.com/50?text=Error'">
                </td>
                <td class="p-3 font-bold text-white">${escapeHtml(sm.name)}</td>
                <td class="p-3 text-gray-300 font-mono" dir="ltr">${escapeHtml(sm.whatsapp)}</td>
                <td class="p-3 text-center">
                    <button onclick="deleteDoc(doc(db, 'shiftManagers', '${docSnap.id}'))" class="text-xs font-bold bg-red-900/50 text-red-400 hover:bg-red-600 hover:text-white px-4 py-2 rounded-lg transition shadow">
                        حذف المدير
                    </button>
                </td>
            </tr>
        `;
    });
});


// ==========================================
// 2. دليل الفروع وموظفي الاستلام
// ==========================================

// إضافة فرع للدليل
getElement("branchForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const btn = e.target.querySelector("button");
    const staff = [];
    
    // تجميع بيانات الموظفين
    document.querySelectorAll(".staff-row").forEach(row => {
        const staffName = row.querySelector(".staff-name").value.trim();
        const staffPhone = row.querySelector(".staff-phone").value.trim();
        
        if (staffName || staffPhone) {
            staff.push({ 
                id: Date.now().toString() + Math.random().toString(36).substr(2, 5), 
                name: staffName, 
                phone: staffPhone 
            });
        }
    });

    setBusy(btn, true, "جاري الحفظ...");

    try {
        await addDoc(branchesDirRef, {
            name: getElement("brName").value.trim(),
            hours: getElement("brHours").value.trim(),
            location: getElement("brLocation").value.trim(),
            manager: getElement("brManager").value.trim(),
            permit: getElement("brPermit").value.trim(),
            staff: staff,
            createdAt: serverTimestamp()
        });
        
        e.target.reset();
        getElement("branchFormPanel").classList.add("hidden");
        getElement("dynamicStaffContainer").innerHTML = "";
        window.addStaffField(); // إضافة حقل فارغ للمرة القادمة
        
        showToast("تم حفظ بيانات الفرع بنجاح", "success");
    } catch(err) {
        console.error(err);
        showToast("تعذر حفظ بيانات الفرع");
    } finally {
        setBusy(btn, false);
    }
});

// جلب وعرض الفروع بالدليل
onSnapshot(branchesDirRef, (snapshot) => {
    allDirectoryBranches = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderDirectoryBranches();
    updateStatistics(); // تحديث الإحصائيات بعد الجلب
});

function renderDirectoryBranches() {
    const tbody = getElement("branchesTableBody");
    if (!tbody) return;
    
    const search = getElement("searchBranchInput")?.value.toLowerCase() || "";
    tbody.innerHTML = "";
    
    const filteredBranches = allDirectoryBranches.filter(b => b.name.toLowerCase().includes(search));
    
    if (filteredBranches.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-gray-500 font-bold">لا توجد فروع مسجلة بالدليل</td></tr>';
        return;
    }

    filteredBranches.forEach(branch => {
        let staffHtml = '<span class="text-gray-500 text-xs">لا يوجد موظفين</span>';
        
        if (branch.staff && branch.staff.length > 0) {
            staffHtml = branch.staff.map(s => `
                <div class="text-xs bg-gray-900 border border-gray-600 p-2 mb-1.5 rounded-lg flex justify-between items-center gap-2 shadow-inner">
                    <span class="font-bold text-gray-300">${escapeHtml(s.name)} <br> <span dir="ltr" class="text-blue-300 font-mono">${escapeHtml(s.phone)}</span></span>
                    <button onclick="transferStaff('${branch.id}', '${s.id}', '${escapeHtml(s.name)}')" class="text-blue-400 hover:text-blue-300 bg-blue-900/30 p-1.5 rounded transition" title="نقل الموظف لفرع آخر">
                        <i class="fas fa-exchange-alt"></i>
                    </button>
                </div>
            `).join("");
        }

        tbody.innerHTML += `
            <tr class="hover:bg-gray-700/50 transition">
                <td class="p-4 font-bold text-blue-400">${escapeHtml(branch.name)}</td>
                <td class="p-4 text-sm text-gray-300">${escapeHtml(branch.hours)}</td>
                <td class="p-4 text-sm text-gray-300">${escapeHtml(branch.manager)}</td>
                <td class="p-4 w-64">${staffHtml}</td>
                <td class="p-4 text-center">
                    <button onclick="deleteDirBranch('${branch.id}')" class="text-xs font-bold bg-red-900/50 text-red-400 hover:bg-red-600 hover:text-white px-4 py-2 rounded-lg transition shadow">
                        حذف الفرع
                    </button>
                </td>
            </tr>
        `;
    });
}

getElement("searchBranchInput")?.addEventListener("input", renderDirectoryBranches);

window.deleteDirBranch = (id) => {
    window.UI.openModal(
        "تأكيد الحذف", 
        "<p class='text-red-400 font-bold'>هل أنت متأكد من حذف الفرع من الدليل نهائياً؟</p>", 
        "حذف نهائي", 
        "bg-red-600", 
        async () => {
            try {
                await deleteDoc(doc(db, "branchesDirectory", id));
                showToast("تم الحذف بنجاح", "success");
            } catch(e) {
                showToast("تعذر الحذف");
            }
        }
    );
};

// نقل موظف من فرع لفرع آخر
window.transferStaff = (currentBranchId, staffId, staffName) => {
    let branchOptions = `<option value="">اختر الفرع الجديد...</option>`;
    
    allDirectoryBranches.forEach(branch => {
        if (branch.id !== currentBranchId) {
            branchOptions += `<option value="${branch.id}">${escapeHtml(branch.name)}</option>`;
        }
    });
    
    const htmlContent = `
        <p class="mb-3 text-gray-300">نقل الموظف <span class="text-yellow-400 font-bold">${staffName}</span> إلى فرع آخر:</p>
        <select id="transferBranchSelect" class="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white mb-2 outline-none focus:border-blue-500 shadow-inner">
            ${branchOptions}
        </select>
    `;
    
    window.UI.openModal(
        "نقل موظف", 
        htmlContent, 
        "تأكيد النقل", 
        "bg-blue-600", 
        async () => {
            const targetBranchId = getElement("transferBranchSelect").value;
            
            if (!targetBranchId) {
                return showToast("يجب اختيار فرع الوجهة أولاً");
            }
            
            const sourceBranch = allDirectoryBranches.find(b => b.id === currentBranchId);
            const targetBranch = allDirectoryBranches.find(b => b.id === targetBranchId);
            
            const staffMemberToMove = sourceBranch.staff.find(s => s.id === staffId);
            const newSourceStaff = sourceBranch.staff.filter(s => s.id !== staffId);
            const newTargetStaff = [...(targetBranch.staff || []), staffMemberToMove];

            try {
                await updateDoc(doc(db, "branchesDirectory", currentBranchId), { staff: newSourceStaff });
                await updateDoc(doc(db, "branchesDirectory", targetBranchId), { staff: newTargetStaff });
                showToast("تم نقل الموظف بنجاح", "success");
            } catch(e) {
                console.error(e);
                showToast("تعذر نقل الموظف");
            }
        }
    );
};


// ==========================================
// 3. إدارة الفرق والشاحنات 
// ==========================================

getElement("teamForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = getElement("newTeamName").value.trim();
    if (!name) return;
    
    const btn = e.target.querySelector('button');
    setBusy(btn, true, "جاري الإضافة...");
    
    try {
        await addDoc(teamsRef, { name: name, createdAt: serverTimestamp() });
        getElement("newTeamName").value = "";
        showToast("تم إضافة التيم بنجاح", "success");
    } catch (e) {
        showToast("تعذر إضافة التيم");
    } finally {
        setBusy(btn, false);
    }
});

onSnapshot(teamsRef, (snapshot) => {
    const tbody = getElement("teamsTableBody");
    const selectsToUpdate = [getElement("newEmpTeam"), getElement("targetTeamValue")];
    
    if (tbody) tbody.innerHTML = "";
    let optionsHtml = '<option value="">اختر التيم...</option>';

    if (snapshot.empty && tbody) {
        tbody.innerHTML = '<tr><td colspan="3" class="p-6 text-center text-gray-500 font-bold">لا توجد فرق مسجلة</td></tr>';
    }
    
    snapshot.forEach(docSnap => {
        const teamName = escapeHtml(docSnap.data().name);
        optionsHtml += `<option value="${teamName}">${teamName}</option>`;
        
        if (tbody) {
            tbody.innerHTML += `
                <tr class="hover:bg-gray-700/50 transition">
                    <td class="p-4 font-bold text-white">${teamName}</td>
                    <td class="p-4 text-gray-400 text-sm">${formatDate(docSnap.data().createdAt)}</td>
                    <td class="p-4 text-center">
                        <button onclick="deleteDoc(doc(db, 'teams', '${docSnap.id}'))" class="text-xs font-bold bg-red-900/50 text-red-400 px-4 py-2 rounded-lg hover:bg-red-600 hover:text-white transition shadow">
                            حذف التيم
                        </button>
                    </td>
                </tr>
            `;
        }
    });
    
    selectsToUpdate.forEach(selectEl => {
        if (selectEl) selectEl.innerHTML = optionsHtml;
    });
});

// الشاحنات (إضافة، تعديل، وترتيب أبجدي)
getElement("truckForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = getElement("newTruckName").value.trim();
    if (!name) return;
    
    const btn = e.target.querySelector('button');
    setBusy(btn, true, "جاري الإضافة...");
    
    try {
        await addDoc(trucksRef, { name: name, createdAt: serverTimestamp() });
        getElement("newTruckName").value = "";
        showToast("تم إضافة الشاحنة بنجاح", "success");
    } catch (e) {
        showToast("تعذر إضافة الشاحنة");
    } finally {
        setBusy(btn, false);
    }
});

onSnapshot(trucksRef, (snapshot) => {
    const tbody = getElement("trucksTableBody");
    const selectsToUpdate = [getElement("targetCarValue")];
    
    let trucksArray = [];
    
    snapshot.forEach(docSnap => {
        trucksArray.push({ id: docSnap.id, ...docSnap.data() });
    });

    // ترتيب الشاحنات أبجدياً بناءً على طلبك
    trucksArray.sort((a, b) => a.name.localeCompare(b.name, 'ar'));

    trucksList = trucksArray.map(t => t.name);
    
    if (tbody) tbody.innerHTML = "";
    let optionsHtml = '<option value="">اختر العربية...</option>';

    if (trucksArray.length === 0 && tbody) {
        tbody.innerHTML = '<tr><td colspan="3" class="p-6 text-center text-gray-500 font-bold">لا توجد شاحنات مسجلة</td></tr>';
    }
    
    trucksArray.forEach(truck => {
        const carName = escapeHtml(truck.name);
        optionsHtml += `<option value="${carName}">${carName}</option>`;
        
        if (tbody) {
            tbody.innerHTML += `
                <tr class="hover:bg-gray-700/50 transition">
                    <td class="p-4 font-bold text-white">${carName}</td>
                    <td class="p-4 text-gray-400 text-sm">${formatDate(truck.createdAt)}</td>
                    <td class="p-4 text-center">
                        <button onclick="editTruck('${truck.id}', '${carName}')" class="text-xs font-bold bg-blue-900/50 text-blue-400 px-4 py-2 rounded-lg hover:bg-blue-600 hover:text-white transition shadow ml-2">
                            تعديل
                        </button>
                        <button onclick="deleteDoc(doc(db, 'trucks', '${truck.id}'))" class="text-xs font-bold bg-red-900/50 text-red-400 px-4 py-2 rounded-lg hover:bg-red-600 hover:text-white transition shadow">
                            حذف
                        </button>
                    </td>
                </tr>
            `;
        }
    });
    
    selectsToUpdate.forEach(selectEl => {
        if (selectEl) selectEl.innerHTML = optionsHtml;
    });
});

window.editTruck = (id, oldName) => {
    const htmlContent = `
        <label class="block text-sm font-bold text-gray-400 mb-2">اسم العربية أو رقمها الجديد:</label>
        <input type="text" id="editTruckNameInp" value="${oldName}" class="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white outline-none focus:border-blue-500 shadow-inner">
    `;
    
    window.UI.openModal(
        "تعديل بيانات الشاحنة", 
        htmlContent, 
        "حفظ التعديل", 
        "bg-blue-600", 
        async () => {
            const newName = getElement("editTruckNameInp").value.trim();
            if (!newName) return showToast("يجب إدخال اسم للشاحنة");
            
            try {
                await updateDoc(doc(db, "trucks", id), { name: newName });
                showToast("تم تعديل الشاحنة بنجاح", "success");
            } catch(e) {
                console.error(e);
                showToast("تعذر حفظ التعديل");
            }
        }
    );
};


// ==========================================
// 4. إدارة المناديب
// ==========================================

onSnapshot(usersRef, (snapshot) => {
    const tbody = getElement("employeesTableBody");
    const repsDataList = getElement("repsDataList");
    
    if (tbody) tbody.innerHTML = "";
    if (repsDataList) repsDataList.innerHTML = "";
    
    allUsers = [];

    snapshot.forEach((docSnap) => {
        const user = docSnap.data();
        const hrid = docSnap.id;
        
        allUsers.push({ id: hrid, name: user.name, car: user.car });
        
        if (repsDataList) {
            repsDataList.innerHTML += `<option value="${hrid}">${user.name} (${hrid})</option>`;
        }

        if (!tbody) return;
        
        const isSuspended = user.status === 'suspended';
        
        tbody.innerHTML += `
            <tr class="hover:bg-gray-700/50 transition">
                <td class="p-4 font-bold text-white">${escapeHtml(user.name)}</td>
                <td class="p-4 text-blue-400 font-bold">${escapeHtml(hrid)}</td>
                <td class="p-4 text-gray-300 font-mono" dir="ltr">${escapeHtml(user.mobile)}</td>
                <td class="p-4 text-gray-300">${escapeHtml(user.team)}</td>
                <td class="p-4 text-center tracking-widest font-mono text-gray-400 font-bold">${user.pinCode || '----'}</td>
                <td class="p-4 text-center">
                    <button onclick="updateDoc(doc(db, 'users', '${hrid}'), { pinCode: null })" class="text-xs bg-red-900/50 hover:bg-red-600 text-red-400 hover:text-white px-3 py-2 rounded-lg transition mr-1 shadow" title="تصفير الرقم السري">
                        <i class="fas fa-key"></i>
                    </button>
                    <button onclick="updateDoc(doc(db, 'users', '${hrid}'), { status: '${isSuspended ? 'active' : 'suspended'}' })" class="text-xs ${isSuspended ? 'bg-green-900/50 hover:bg-green-600 text-green-400' : 'bg-orange-900/50 hover:bg-orange-600 text-orange-400'} hover:text-white px-3 py-2 rounded-lg transition shadow" title="${isSuspended ? 'تفعيل' : 'تعطيل حساب المندوب'}">
                        <i class="fas ${isSuspended ? 'fa-user-check' : 'fa-user-slash'}"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    updateStatistics(); // تحديث الإحصائيات
});

getElement("employeeForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const name = getElement("newEmpName").value.trim();
    const hrid = getElement("newEmpHrid").value.trim();
    const mobile = getElement("newEmpMobile").value.trim();
    const team = getElement("newEmpTeam").value;

    if (!name || !hrid || !mobile || !team) {
        return showToast("برجاء إكمال جميع بيانات المندوب");
    }

    const btn = e.target.querySelector('button');
    setBusy(btn, true, "جاري الحفظ...");
    
    try {
        const existingUser = await getDoc(doc(db, "users", hrid));
        if (existingUser.exists()) {
            return showToast("هذا المندوب (HRID) مسجل بالفعل");
        }
        
        await setDoc(doc(db, "users", hrid), { 
            name: name, 
            mobile: mobile, 
            team: team, 
            car: "", 
            status: "active", 
            pinCode: null, 
            createdAt: serverTimestamp(), 
            updatedAt: serverTimestamp() 
        });
        
        e.target.reset();
        getElement("employeeFormPanel")?.classList.add("hidden");
        showToast("تم تسجيل المندوب بنجاح", "success");
    } catch (err) {
        console.error(err);
        showToast("تعذر تسجيل المندوب");
    } finally {
        setBusy(btn, false);
    }
});


// ==========================================
// 5. إدارة الأوردرات (رفع الشيت وتوزيعه)
// ==========================================

onSnapshot(branchMappingsRef, (snapshot) => {
    branchMappingsMap.clear();
    snapshot.forEach(docSnap => {
        branchMappingsMap.set(docSnap.id, docSnap.data());
    });
});

getElement("excelFileInput")?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    
    reader.onload = (evt) => {
        try {
            const data = evt.target.result;
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            currentSheetData = XLSX.utils.sheet_to_json(worksheet);
            
            if (currentSheetData.length > 0) {
                setupMappingWizard(currentSheetData);
            } else {
                showToast("ملف الإكسيل فارغ أو غير صالح");
            }
        } catch(error) {
            console.error(error);
            showToast("حدث خطأ أثناء قراءة ملف الإكسيل");
        }
        e.target.value = ""; 
    };
    
    reader.readAsArrayBuffer(file);
});

function setupMappingWizard(data) {
    getElement("uploadPromptContainer").classList.add("hidden");
    getElement("groupedOrdersContainer").classList.add("hidden");
    getElement("sheetMappingWizard").classList.remove("hidden");

    let uniqueBranches = new Set();
    let uniqueCategories = new Set();

    data.forEach(row => {
        const productNameRaw = row['Stock Moves/Product/Name'];
        const barcodeRaw = row['Stock Moves/Product/Breadfast Barcode'];
        
        if (!productNameRaw || !barcodeRaw) return;

        const branchRaw = row['Stock Moves/Destination Location'];
        const categoryRaw = row['Stock Moves/Internal Type'];
        
        if (branchRaw !== undefined) uniqueBranches.add(cleanBranchName(branchRaw));
        if (categoryRaw !== undefined) uniqueCategories.add(String(categoryRaw).trim());
    });

    const newBranchesBody = getElement("newBranchesTableBody");
    const savedBranchesBody = getElement("savedBranchesTableBody");
    const categoriesContainer = getElement("categoriesContainer");
    
    newBranchesBody.innerHTML = "";
    savedBranchesBody.innerHTML = "";
    categoriesContainer.innerHTML = "";
    
    let newCount = 0;
    let savedCount = 0;
    
    let carOptions = `<option value="">-- اختر العربية --</option>`;
    trucksList.forEach(car => {
        carOptions += `<option value="${escapeHtml(car)}">${escapeHtml(car)}</option>`;
    });

    uniqueBranches.forEach(branch => {
        const branchId = branch.replace(/[\/\.#$\[\]]/g, '_'); 
        
        if (branchMappingsMap.has(branchId)) {
            savedCount++;
            const mapping = branchMappingsMap.get(branchId);
            const statusHtml = mapping.ignored 
                ? `<span class="text-red-400 font-bold">متجاهل</span>` 
                : `<span class="text-green-400 font-bold">${escapeHtml(mapping.car)}</span>`;
            
            savedBranchesBody.innerHTML += `
                <tr class="hover:bg-gray-700/50 transition">
                    <td class="p-4 font-bold text-gray-300">${escapeHtml(branch)}</td>
                    <td class="p-4">${statusHtml}</td>
                    <td class="p-4 text-gray-400">تم حفظ الإعدادات مسبقاً</td>
                </tr>
            `;
        } else {
            newCount++;
            newBranchesBody.innerHTML += `
                <tr class="hover:bg-gray-700/50 new-branch-row transition" data-branch="${escapeHtml(branch)}" data-branch-id="${escapeHtml(branchId)}">
                    <td class="p-4 font-bold text-yellow-400">${escapeHtml(branch)}</td>
                    <td class="p-4">
                        <select class="branch-car-select w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white outline-none focus:border-blue-500 shadow-inner">
                            ${carOptions}
                        </select>
                    </td>
                    <td class="p-4">
                        <input type="text" class="branch-ignore-input w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white outline-none focus:border-red-500 shadow-inner" placeholder="اكتب سبب التجاهل إن وجد...">
                    </td>
                </tr>
            `;
        }
    });

    if (newCount === 0) {
        newBranchesBody.innerHTML = '<tr><td colspan="3" class="p-6 text-center text-green-400 font-bold"><i class="fas fa-check-circle text-2xl mb-2 block"></i> جميع فروع الشيت معرفة مسبقاً وجاهزة</td></tr>';
    }
    
    getElement("newBranchesCount").textContent = newCount;
    getElement("savedBranchesCount").textContent = savedCount;

    uniqueCategories.forEach(cat => {
        categoriesContainer.innerHTML += `
            <label class="flex items-center gap-3 bg-gray-900 px-4 py-3 rounded-lg border border-gray-600 cursor-pointer hover:border-yellow-500 transition shadow-inner">
                <input type="checkbox" value="${escapeHtml(cat)}" class="category-exclude-checkbox w-5 h-5 text-yellow-500 bg-gray-800 border-gray-600 rounded focus:ring-yellow-500">
                <span class="text-sm font-bold text-gray-300">${escapeHtml(cat)}</span>
            </label>
        `;
    });
}

getElement("processSheetBtn")?.addEventListener("click", async (e) => {
    const btn = e.target;
    let hasErrors = false;
    let newMappingsToSave = [];

    document.querySelectorAll('.new-branch-row').forEach(row => {
        const car = row.querySelector('.branch-car-select').value;
        const ignoreReason = row.querySelector('.branch-ignore-input').value.trim();
        
        if (!car && !ignoreReason) {
            row.classList.add("border", "border-red-500");
            hasErrors = true;
        } else {
            row.classList.remove("border-red-500");
            newMappingsToSave.push({
                id: row.dataset.branchId,
                data: {
                    branchName: row.dataset.branch,
                    car: car || null,
                    ignored: !!ignoreReason,
                    reason: ignoreReason || null,
                    createdAt: serverTimestamp()
                }
            });
        }
    });

    if (hasErrors) {
        return showToast("برجاء تعيين عربية أو تجاهل الفرع للفروع المؤشرة بالأحمر");
    }

    const excludedCategories = Array.from(document.querySelectorAll('.category-exclude-checkbox:checked')).map(cb => cb.value);
    
    setBusy(btn, true, "جاري المعالجة والتقسيم...");

    try {
        for (const mapping of newMappingsToSave) {
            await setDoc(doc(db, "branchMappings", mapping.id), mapping.data);
            branchMappingsMap.set(mapping.id, mapping.data);
        }

        processedOrdersToUpload = [];
        let groupedDataByCar = {}; 

        currentSheetData.forEach(row => {
            const productNameRaw = row['Stock Moves/Product/Name'];
            const barcodeRaw = row['Stock Moves/Product/Breadfast Barcode'];
            
            if (!productNameRaw || !barcodeRaw) return;

            const branchRaw = row['Stock Moves/Destination Location'];
            const categoryRaw = row['Stock Moves/Internal Type'];
            
            const branch = branchRaw !== undefined ? cleanBranchName(branchRaw) : "";
            const category = categoryRaw !== undefined ? String(categoryRaw).trim() : "";
            const branchId = branch.replace(/[\/\.#$\[\]]/g, '_');

            if (excludedCategories.includes(category)) return;

            const mapping = branchMappingsMap.get(branchId);
            if (!mapping || mapping.ignored) return;

            const carName = mapping.car;
            const productObj = {
                productName: String(productNameRaw).trim(),
                productId: row['Stock Moves/Product/Internal Reference'] || "",
                barcode: String(barcodeRaw).trim(),
                quantity: row['Stock Moves/Quantity'] || 1,
                category: category || "غير مصنف",
                orderRef: row['Stock Moves/Reference'] || "",
                branch: branch,
                car: carName
            };

            if (!groupedDataByCar[carName]) groupedDataByCar[carName] = { branches: {} };
            if (!groupedDataByCar[carName].branches[branch]) groupedDataByCar[carName].branches[branch] = { categories: {} };
            if (!groupedDataByCar[carName].branches[branch].categories[category]) groupedDataByCar[carName].branches[branch].categories[category] = [];
            
            groupedDataByCar[carName].branches[branch].categories[category].push(productObj);
            
            processedOrdersToUpload.push(productObj);
        });

        carAssignments = {}; 
        assignedReps = {};
        
        renderCarsAccordion(groupedDataByCar, "carsAccordionContainer", true);

        getElement("sheetMappingWizard").classList.add("hidden");
        getElement("groupedOrdersContainer").classList.remove("hidden");
        
    } catch (error) {
        console.error(error);
        showToast("حدث خطأ أثناء معالجة بيانات الشيت");
    } finally {
        setBusy(btn, false);
    }
});

function renderCarsAccordion(groupedDataByCar, containerId, isAssignMode) {
    const container = getElement(containerId);
    if (!container) return;
    
    container.innerHTML = "";

    let repsOptions = `<option value="">-- اختر المندوب للإسناد --</option>`;
    allUsers.forEach(u => {
        repsOptions += `<option value="${u.id}">${escapeHtml(u.name)} (${u.id})</option>`;
    });

    for (const [carName, carData] of Object.entries(groupedDataByCar)) {
        const safeCarId = carName.replace(/\W/g, '_');
        let branchesHtml = "";

        for (const [branchName, branchData] of Object.entries(carData.branches)) {
            let categoriesHtml = "";
            
            for (const [category, products] of Object.entries(branchData.categories)) {
                let productsRows = products.map(p => `
                    <tr class="hover:bg-gray-800/50 transition">
                        <td class="p-3 font-bold text-gray-200">${escapeHtml(p.productName)}</td>
                        <td class="p-3 font-mono text-gray-400" dir="ltr">${escapeHtml(p.barcode)}</td>
                        <td class="p-3 text-center text-blue-300 font-bold">${escapeHtml(p.quantity)}</td>
                    </tr>
                `).join("");
                
                categoriesHtml += `
                    <div class="mt-4 border border-gray-600 rounded-lg overflow-hidden bg-gray-800 shadow">
                        <div class="bg-gray-700 p-3 flex justify-between items-center cursor-pointer hover:bg-gray-600 transition" onclick="toggleAccordion(this)">
                            <span class="font-bold text-yellow-400 text-sm flex items-center gap-2">
                                <i class="fas fa-tag"></i> ${escapeHtml(category)} 
                                <span class="text-xs bg-yellow-900 text-yellow-200 px-2 py-0.5 rounded-full shadow">${products.length} صنف</span>
                            </span>
                            <i class="fas fa-chevron-down chevron text-gray-400 text-sm"></i>
                        </div>
                        <div class="accordion-content p-0 border-0">
                            <div class="overflow-x-auto">
                                <table class="w-full text-xs text-right">
                                    <thead class="bg-gray-900 text-gray-400 border-b border-gray-700">
                                        <tr>
                                            <th class="p-3 font-bold">المنتج</th>
                                            <th class="p-3 font-bold">الباركود</th>
                                            <th class="p-3 font-bold text-center">الكمية</th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-gray-700">
                                        ${productsRows}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                `;
            }
            
            branchesHtml += `
                <div class="mt-6 pl-4 border-r-4 border-green-500 bg-gray-900/30 p-4 rounded-l-xl">
                    <h5 class="text-lg font-bold text-green-400 flex items-center gap-2">
                        <i class="fas fa-map-marker-alt"></i> ${escapeHtml(branchName)}
                    </h5>
                    ${categoriesHtml}
                </div>
            `;
        }

        let assignUiHtml = "";
        if (isAssignMode) {
            assignUiHtml = `
                <div id="assign_ui_${safeCarId}" class="flex flex-col md:flex-row gap-3 w-full md:w-auto bg-gray-900 p-3 rounded-xl border border-gray-600 shadow-inner">
                    <select id="assign_select_${safeCarId}" class="px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm outline-none focus:border-blue-500 w-full md:w-64">
                        ${repsOptions}
                    </select>
                    <button onclick="assignCarToRep('${escapeHtml(carName)}', '${safeCarId}')" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold text-sm shadow-lg transition w-full md:w-auto border border-blue-500">
                        <i class="fas fa-user-plus mr-1"></i> إسناد للمندوب
                    </button>
                </div>
                
                <div id="assigned_ui_${safeCarId}" class="hidden flex flex-col md:flex-row items-center justify-between gap-4 w-full md:w-auto bg-green-900/40 p-3 rounded-xl border border-green-600 shadow-inner">
                    <span class="text-green-400 font-bold text-sm flex items-center gap-2">
                        <i class="fas fa-check-circle text-lg"></i> تم الإسناد لـ: 
                        <span id="assigned_name_${safeCarId}" class="text-white bg-green-800 px-3 py-1 rounded-lg"></span>
                    </span>
                    <button onclick="cancelCarAssignment('${escapeHtml(carName)}', '${safeCarId}')" class="text-xs font-bold bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg shadow-lg transition border border-red-500 w-full md:w-auto">
                        <i class="fas fa-times mr-1"></i> إلغاء الإسناد
                    </button>
                </div>
            `;
        }

        container.innerHTML += `
            <div class="bg-gray-800 border-2 ${isAssignMode ? 'border-blue-800/50' : 'border-gray-700'} rounded-2xl shadow-2xl overflow-hidden mb-8">
                <div class="bg-gray-700 p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-5 border-b border-gray-600">
                    <div class="flex items-center cursor-pointer flex-1" onclick="toggleAccordion(this.parentElement)">
                        <div class="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center border border-gray-600 shadow-inner">
                            <i class="fas fa-chevron-down chevron transition-transform text-lg text-blue-400"></i>
                        </div>
                        <h4 class="text-2xl font-bold text-white ml-4 flex items-center gap-3">
                            <i class="fas fa-truck text-blue-400 text-3xl"></i> ${escapeHtml(carName)}
                        </h4>
                    </div>
                    ${assignUiHtml}
                </div>
                <div class="accordion-content p-0 border-0">
                    <div class="p-6 bg-gray-800/50">
                        ${branchesHtml}
                    </div>
                </div>
            </div>
        `;
    }
}

window.assignCarToRep = (carName, safeCarId) => {
    const selectEl = getElement(`assign_select_${safeCarId}`);
    const selectedHrid = selectEl.value;
    
    if (!selectedHrid) return showToast("برجاء اختيار مندوب من القائمة");
    
    const rep = allUsers.find(u => u.id === selectedHrid);
    let hasOtherCars = false;
    
    if (assignedReps[selectedHrid] && assignedReps[selectedHrid].length > 0) hasOtherCars = true;
    if (rep.car && rep.car !== carName) hasOtherCars = true;

    if (hasOtherCars) {
        window.UI.openModal(
            "تنبيه إسناد متعدد", 
            `
            <div class="bg-orange-900/20 p-4 rounded-lg border border-orange-900/50">
                <p class="text-gray-300 mb-2">المندوب <span class="text-yellow-400 font-bold text-lg">${rep.name}</span> لديه بالفعل سيارة مُسندة.</p>
                <p class="text-sm text-gray-400">هل أنت متأكد من رغبتك في إضافة هذه السيارة لعهدته أيضاً؟</p>
            </div>
            `, 
            "نعم، قم بالإسناد", 
            "bg-orange-600 border-orange-500", 
            () => {
                finalizeAssignment(carName, safeCarId, rep);
            }
        );
    } else {
        finalizeAssignment(carName, safeCarId, rep);
    }
};

function finalizeAssignment(carName, safeCarId, rep) {
    carAssignments[carName] = rep.id;
    
    if (!assignedReps[rep.id]) {
        assignedReps[rep.id] = [];
    }
    assignedReps[rep.id].push(carName);
    
    getElement(`assign_ui_${safeCarId}`).classList.add('hidden');
    getElement(`assigned_ui_${safeCarId}`).classList.remove('hidden');
    getElement(`assigned_name_${safeCarId}`).innerText = rep.name;
    
    showToast(`تم إسناد ${carName} للمندوب ${rep.name}`, "success");
}

window.cancelCarAssignment = (carName, safeCarId) => {
    const hrid = carAssignments[carName];
    
    if (hrid) {
        delete carAssignments[carName];
        if (assignedReps[hrid]) {
            assignedReps[hrid] = assignedReps[hrid].filter(c => c !== carName);
        }
    }
    
    getElement(`assigned_ui_${safeCarId}`).classList.add('hidden');
    getElement(`assign_ui_${safeCarId}`).classList.remove('hidden');
    getElement(`assign_select_${safeCarId}`).value = "";
};

// حفظ الأوردرات في الداتا بيز
getElement("confirmAndUploadOrdersBtn")?.addEventListener("click", async (e) => {
    if (processedOrdersToUpload.length === 0) return;
    
    const btn = e.target;
    
    window.UI.openModal(
        "تأكيد الاعتماد", 
        `
        <div class="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
            <p class='text-white font-bold mb-2'><i class="fas fa-question-circle text-blue-400"></i> هل أنت متأكد من حفظ وتوزيع هذه الأوردرات؟</p>
            <p class='text-sm text-gray-400'>بمجرد الحفظ سيتم ربط الأوردرات بالمناديب وإرسالها لتطبيقاتهم فوراً لبدء العمل.</p>
        </div>
        `, 
        "نعم، اعتمد وحفظ الأوردرات", 
        "bg-green-600 border-green-500", 
        async () => {
            setBusy(btn, true, "جاري رفع الأوردرات للسيستم...");
            
            try {
                let batch = writeBatch(db);
                let count = 0;
                
                for (const order of processedOrdersToUpload) {
                    order.hrid = carAssignments[order.car] || "";
                    order.status = "Draft"; 
                    order.createdAt = serverTimestamp();
                    order.updatedAt = serverTimestamp();
                    
                    batch.set(doc(ordersRef), order);
                    count++;
                    
                    if (count === 400) { 
                        await batch.commit(); 
                        batch = writeBatch(db); 
                        count = 0; 
                    }
                }
                if (count > 0) await batch.commit();

                // تحديث سيارات المناديب
                let userBatch = writeBatch(db);
                let updatedUsersCount = 0;
                
                for (const [carName, hrid] of Object.entries(carAssignments)) {
                    if (hrid) { 
                        userBatch.update(doc(db, "users", hrid), { 
                            car: carName, 
                            updatedAt: serverTimestamp() 
                        }); 
                        updatedUsersCount++; 
                    }
                }
                if (updatedUsersCount > 0) await userBatch.commit();

                showToast("تم الاعتماد ورفع الأوردرات بنجاح!", "success");
                
                getElement("groupedOrdersContainer").classList.add("hidden");
                getElement("uploadPromptContainer").classList.remove("hidden");
                
                processedOrdersToUpload = []; 
                currentSheetData = []; 
                carAssignments = {}; 
                assignedReps = {};
                
            } catch (error) { 
                console.error(error);
                showToast("حدث خطأ أثناء رفع الأوردرات"); 
            } finally { 
                setBusy(btn, false); 
            }
        }
    );
});

// سجل الأوردرات الموزعة
const dateFilterInput = getElement("dbOrdersDateFilter");
if (dateFilterInput) {
    dateFilterInput.valueAsDate = new Date();
    dateFilterInput.addEventListener("change", renderDbOrdersByDate);
}

function renderDbOrdersByDate() {
    const container = getElement("dbCarsAccordionContainer");
    if (!container) return;
    
    const selectedDateStr = dateFilterInput.value;
    if (!selectedDateStr) return;
    
    const targetDate = new Date(selectedDateStr).toDateString();
    getElement("displayFilteredDate").innerText = `(تاريخ: ${new Date(targetDate).toLocaleDateString('ar-EG')})`;

    const filteredOrders = allOrders.filter(o => {
        if (o.status === "Pending" || o.status === "Resolved") return false;
        const oDate = o.createdAt?.toDate ? o.createdAt.toDate().toDateString() : null;
        return oDate === targetDate;
    });

    if (filteredOrders.length === 0) {
        container.innerHTML = `
            <div class="text-center text-gray-500 py-12 bg-gray-800 rounded-xl border border-gray-700 border-dashed">
                <i class="fas fa-calendar-times text-6xl mb-4 opacity-30 text-gray-400"></i>
                <h3 class="text-xl font-bold text-gray-400">لا توجد أوردرات</h3>
                <p class="mt-2 text-sm">لم يتم توزيع أي أوردرات في هذا التاريخ المختار.</p>
            </div>
        `;
        return;
    }

    let groupedDataByCar = {};
    
    filteredOrders.forEach(o => {
        const carName = o.car || "بدون سيارة";
        const branch = o.branch || "غير محدد";
        const category = o.category || "غير مصنف";

        if (!groupedDataByCar[carName]) groupedDataByCar[carName] = { branches: {} };
        if (!groupedDataByCar[carName].branches[branch]) groupedDataByCar[carName].branches[branch] = { categories: {} };
        if (!groupedDataByCar[carName].branches[branch].categories[category]) groupedDataByCar[carName].branches[branch].categories[category] = [];
        
        groupedDataByCar[carName].branches[branch].categories[category].push(o);
    });

    renderCarsAccordion(groupedDataByCar, "dbCarsAccordionContainer", false);
}


// ==========================================
// 6. الأوردرات المعلقة والمرتجعات (النظام المتسلسل)
// ==========================================

const pendingHridInput = getElement("newOrderHrid");
const pendingBranchSelect = getElement("newOrderBranch");
const pendingProductSelect = getElement("newOrderProduct");
const pendingBarcodeInp = getElement("newOrderBarcode");

// الخطوة 1: عند كتابة كود المندوب -> جلب الفروع الخاصة به فقط
pendingHridInput?.addEventListener("input", (e) => {
    const hrid = e.target.value.trim();
    
    pendingBranchSelect.innerHTML = '<option value="">اختر الفرع...</option>';
    pendingProductSelect.innerHTML = '<option value="">أدخل الفرع أولاً...</option>';
    pendingBarcodeInp.value = "";
    
    if (!hrid) return;

    const branches = new Set();
    
    allOrders.forEach(o => {
        if (o.hrid === hrid && o.branch && o.status !== 'Pending' && o.status !== 'Resolved') {
            branches.add(o.branch);
        }
    });

    if (branches.size === 0) {
        pendingBranchSelect.innerHTML = '<option value="">لا يوجد فروع مسجلة لعمل هذا المندوب</option>';
    } else {
        branches.forEach(b => {
            pendingBranchSelect.innerHTML += `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`;
        });
    }
});

// الخطوة 2: عند اختيار الفرع -> جلب المنتجات
pendingBranchSelect?.addEventListener("change", (e) => {
    const branch = e.target.value;
    const hrid = pendingHridInput.value.trim();
    
    pendingProductSelect.innerHTML = '<option value="">اختر المنتج...</option>';
    pendingBarcodeInp.value = "";
    
    if (!branch || !hrid) return;

    const productsMap = new Map();
    
    allOrders.forEach(o => {
        if (o.hrid === hrid && o.branch === branch && o.productName && o.status !== 'Pending' && o.status !== 'Resolved') {
            productsMap.set(o.barcode, o.productName);
        }
    });

    if (productsMap.size === 0) {
        pendingProductSelect.innerHTML = '<option value="">لا توجد منتجات مسجلة في هذا الفرع</option>';
    } else {
        productsMap.forEach((name, barcode) => {
            pendingProductSelect.innerHTML += `<option value="${escapeHtml(barcode)}">${escapeHtml(name)}</option>`;
        });
    }
});

// الخطوة 3: عند اختيار المنتج -> كتابة الباركود أوتوماتيكياً
pendingProductSelect?.addEventListener("change", (e) => {
    pendingBarcodeInp.value = e.target.value;
});

// الخطوة 4: حفظ الأوردر المعلق
getElement("orderForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    
    const hrid = pendingHridInput.value.trim();
    const branch = pendingBranchSelect.value;
    const barcode = pendingBarcodeInp.value.trim();
    const notes = getElement("newOrderNotes").value.trim();
    const productName = pendingProductSelect.options[pendingProductSelect.selectedIndex]?.text;

    if (!barcode || !hrid || !branch || !productName) {
        return showToast("برجاء إكمال جميع خطوات التسلسل واختيار المنتج");
    }

    savePendingOrder(barcode, productName, hrid, branch, notes);
});

async function savePendingOrder(barcode, productName, hrid, branch, notes) {
    try {
        let car = "";
        const userDoc = await getDoc(doc(db, "users", hrid));
        if (userDoc.exists()) { 
            car = userDoc.data().car || ""; 
        }

        await addDoc(ordersRef, { 
            productName: productName, 
            barcode: barcode, 
            hrid: hrid, 
            branch: branch, 
            car: car, 
            notes: notes || "معلق", 
            status: "Pending", 
            createdAt: serverTimestamp(), 
            updatedAt: serverTimestamp() 
        });
        
        pendingHridInput.value = ""; 
        pendingBranchSelect.innerHTML = '<option value="">أدخل المندوب أولاً...</option>';
        pendingProductSelect.innerHTML = '<option value="">أدخل الفرع أولاً...</option>';
        pendingBarcodeInp.value = ""; 
        getElement("newOrderNotes").value = "";
        
        showToast("تم تسجيل الأوردر كمعلق بنجاح", "success");
    } catch (e) { 
        console.error(e);
        showToast("تعذر إنشاء الأوردر المعلق"); 
    }
}

// جلب وعرض الأوردرات الشاملة (للفلاتر والمعلقات والإحصائيات)
onSnapshot(ordersRef, (snapshot) => {
    allOrders = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        if (data.barcode && data.productName) {
            barcodeToProductMap.set(data.barcode.trim(), data.productName);
        }
        return { id: docSnap.id, ...data };
    });
    
    allOrders.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    
    renderPendingOrders();
    renderDbOrdersByDate(); 
    updateStatistics(); // تحديث الإحصائيات الحية
});

function renderPendingOrders() {
    const container = getElement("adminPendingOrdersContainer");
    if (!container) return;
    
    const search = getElement("adminOrderSearch")?.value.trim().toLowerCase() || "";
    const filter = getElement("adminOrderFilter")?.value || "all";

    const filtered = allOrders.filter((order) => {
        const status = order.status;
        if (status !== 'Pending' && status !== 'Resolved') return false;
        
        const product = String(order.productName || "").toLowerCase();
        const barcode = String(order.barcode || "").toLowerCase();
        const rep = String(order.hrid || "").toLowerCase();
        const branchSearch = String(order.branch || "").toLowerCase();
        
        const matchSearch = !search || (`${product} ${barcode} ${rep} ${branchSearch}`.includes(search));
        return matchSearch && (filter === "all" || status === filter);
    });

    container.innerHTML = "";
    
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="text-center text-gray-500 py-12 bg-gray-800 rounded-xl border border-gray-700 border-dashed">
                <i class="fas fa-check-double text-6xl mb-4 opacity-30 text-green-400"></i>
                <h3 class="text-xl font-bold text-gray-400">لا توجد أوردرات معلقة</h3>
                <p class="mt-2 text-sm">جميع الأوردرات تم تسويتها أو لا توجد مرتجعات مسجلة.</p>
            </div>
        `;
        return;
    }

    filtered.forEach((order) => {
        const status = order.status;
        const repName = allUsers.find(u => u.id === order.hrid)?.name || order.hrid;
        const orderDate = formatDate(order.createdAt);
        
        const isResolved = status === 'Resolved';
        const cardBorder = isResolved ? 'border-green-700' : 'border-orange-700';
        const statusBg = isResolved ? 'bg-green-900/50 text-green-400' : 'bg-orange-900/50 text-orange-400';

        const div = document.createElement("div");
        div.className = `bg-gray-800 p-5 rounded-xl border ${cardBorder} flex flex-col md:flex-row justify-between items-start gap-6 hover:bg-gray-700/80 transition shadow-lg`;
        
        div.innerHTML = `
            <div class="min-w-0 flex-1 w-full">
                <!-- العنوان الرئيسي: الفرع -->
                <div class="font-bold text-xl text-green-400 mb-4 border-b border-gray-700 pb-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div class="flex items-start gap-2 leading-relaxed">
                        <i class="fas fa-map-marker-alt mt-1"></i> 
                        <span class="break-words">${escapeHtml(order.branch || 'فرع غير محدد')}</span>
                    </div>
                    <span class="text-sm bg-blue-900/50 text-blue-300 px-4 py-2 rounded-lg w-max shadow border border-blue-800 font-bold">
                        <i class="fas fa-user mr-1"></i> المندوب: ${escapeHtml(repName)}
                    </span>
                </div>
                
                <!-- تفاصيل المنتج -->
                <div class="bg-gray-900/80 p-4 rounded-xl border border-gray-700 shadow-inner">
                    <div class="font-bold text-yellow-400 mb-3 text-lg flex items-center gap-2">
                        <i class="fas fa-box text-gray-400"></i> ${escapeHtml(order.productName)}
                    </div>
                    <div class="flex flex-wrap gap-3 text-sm text-gray-300">
                        <span dir="ltr" class="bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-600 font-mono shadow-sm">
                            <i class="fas fa-barcode text-gray-500 mr-2"></i>${escapeHtml(order.barcode)}
                        </span>
                        <span class="bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-600 shadow-sm font-bold">
                            <i class="fas fa-calendar-alt text-gray-500 mr-2"></i>تاريخ المشكلة: ${escapeHtml(orderDate)}
                        </span>
                        ${order.quantity > 1 ? `<span class="bg-blue-900/30 text-blue-300 px-3 py-1.5 rounded-lg border border-blue-800 font-bold shadow-sm">الكمية: ${escapeHtml(order.quantity)}</span>` : ''}
                    </div>
                </div>
                
                <!-- السبب -->
                <div class="mt-4 text-base text-orange-400 font-bold bg-orange-900/20 p-3 rounded-lg border border-orange-900/50 shadow-inner">
                    <i class="fas fa-exclamation-triangle mr-2 text-lg"></i> سبب التعليق: ${escapeHtml(order.notes)}
                </div>
            </div>
            
            <!-- أدوات التحكم -->
            <div class="flex flex-col gap-3 w-full md:w-56 mt-2 md:mt-0 shrink-0">
                <div class="bg-gray-900/50 p-3 rounded-xl border border-gray-700 shadow-inner">
                    <label class="block text-xs font-bold text-gray-400 mb-2 text-center">حالة الأوردر</label>
                    <select data-order-status="${escapeHtml(order.id)}" class="bg-gray-800 border ${cardBorder} text-white font-bold rounded-lg p-3 outline-none focus:border-blue-500 w-full shadow cursor-pointer text-sm">
                        <option value="Pending" ${status === 'Pending' ? 'selected' : ''}>قيد التعليق والمتابعة</option>
                        <option value="Resolved" ${status === 'Resolved' ? 'selected' : ''}>تم الحل / تسوية</option>
                    </select>
                </div>
                
                <div class="flex gap-2 w-full mt-1">
                    <button onclick="editPendingOrder('${escapeHtml(order.id)}', '${escapeHtml(order.notes)}')" class="bg-blue-900/50 hover:bg-blue-600 text-blue-300 hover:text-white px-3 py-2.5 rounded-lg transition text-sm font-bold flex-1 shadow border border-blue-800">
                        <i class="fas fa-edit mb-1 block text-lg"></i> تعديل
                    </button>
                    <button onclick="deletePendingOrder('${escapeHtml(order.id)}')" class="bg-red-900/50 hover:bg-red-600 text-red-300 hover:text-white px-3 py-2.5 rounded-lg transition text-sm font-bold flex-1 shadow border border-red-800">
                        <i class="fas fa-trash-alt mb-1 block text-lg"></i> حذف
                    </button>
                </div>
            </div>
        `;
        
        div.querySelector("[data-order-status]").addEventListener("change", async (e) => {
            try {
                await updateDoc(doc(db, "orders", order.id), { 
                    status: e.target.value, 
                    updatedAt: serverTimestamp() 
                });
                showToast("تم تحديث حالة الأوردر بنجاح", "success");
            } catch(err) {
                showToast("تعذر تحديث الحالة");
            }
        });
        
        container.appendChild(div);
    });
}

window.deletePendingOrder = (orderId) => {
    window.UI.openModal(
        "تأكيد الحذف النهائي", 
        `
        <div class="bg-red-900/20 p-4 rounded-lg border border-red-900/50 text-center">
            <i class="fas fa-exclamation-circle text-5xl text-red-500 mb-4 block"></i>
            <p class='text-red-400 font-bold text-lg mb-2'>تحذير: سيتم حذف هذا السجل نهائياً!</p>
            <p class="text-gray-300 text-sm">هل أنت متأكد من حذف هذا الأوردر المعلق من قاعدة البيانات؟ لا يمكن التراجع عن هذه الخطوة.</p>
        </div>
        `, 
        "نعم، احذف السجل", 
        "bg-red-600 hover:bg-red-700 border-red-500", 
        async () => {
            try {
                await deleteDoc(doc(db, "orders", orderId));
                showToast("تم حذف الأوردر المعلق بنجاح", "success");
            } catch(e) {
                showToast("تعذر الحذف");
            }
        }
    );
};

window.editPendingOrder = (orderId, currentNotes) => {
    const html = `
        <label class="block text-sm font-bold text-gray-300 mb-2">تعديل سبب التعليق أو المشكلة:</label>
        <textarea id="editPendingNotes" rows="3" class="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white outline-none focus:border-blue-500 shadow-inner">${currentNotes}</textarea>
    `;
    
    window.UI.openModal(
        "تعديل تفاصيل التعليق", 
        html, 
        "حفظ التعديل", 
        "bg-blue-600 hover:bg-blue-700 border-blue-500", 
        async () => {
            const newNotes = getElement("editPendingNotes").value.trim();
            if(!newNotes) return showToast("يجب كتابة السبب بوضوح");
            
            try {
                await updateDoc(doc(db, "orders", orderId), { 
                    notes: newNotes, 
                    updatedAt: serverTimestamp() 
                });
                showToast("تم تعديل السبب بنجاح", "success");
            } catch(e) {
                showToast("تعذر حفظ التعديل");
            }
        }
    );
};


// ==========================================
// 7. الإشعارات والتنبيهات
// ==========================================
window.sendNotification = async () => {
    const type = getElement("notificationTargetType").value;
    let target = "";
    
    if (type === 'rep') target = getElement("targetRepValue").value;
    else if (type === 'team') target = getElement("targetTeamValue").value;
    else if (type === 'car') target = getElement("targetCarValue").value;
                 
    const message = getElement("globalNotificationText").value.trim();
    
    if (!message || (type !== 'all' && !target)) {
        return showToast("برجاء إكمال البيانات وكتابة الرسالة");
    }
    
    const btn = document.querySelector('[onclick="sendNotification()"]'); 
    setBusy(btn, true, "جاري إرسال الإشعار...");
    
    try {
        await addDoc(notificationsRef, { 
            message: message, 
            type: type, 
            target: target, 
            timestamp: serverTimestamp(), 
            readBy: [] 
        });
        
        if (type === 'all') {
            await setDoc(systemRef, { 
                globalMessage: message, 
                messageTime: Date.now() 
            }, { merge: true });
        }
        
        getElement("globalNotificationText").value = ""; 
        showToast("تم إرسال الإشعار بنجاح", "success");
    } catch(e) { 
        console.error(e);
        showToast("خطأ في الاتصال بالخادم أثناء الإرسال"); 
    } finally { 
        setBusy(btn, false); 
    }
};

// خروج إجباري
window.forceLogoutAll = async () => { 
    try { 
        await setDoc(systemRef, { forceLogoutTrigger: Date.now() }, { merge: true }); 
        showToast("تم إرسال أمر الخروج الإجباري لجميع الأجهزة", "success"); 
    } catch(e) { 
        showToast("تعذر إرسال أمر الخروج"); 
    } 
};

// فلاتر البحث الخاصة بالمعلقات
getElement("adminOrderSearch")?.addEventListener("input", renderPendingOrders);
getElement("adminOrderFilter")?.addEventListener("change", renderPendingOrders);

// إظهار وإخفاء فورم المندوب
getElement("toggleEmployeeFormBtn")?.addEventListener("click", () => {
    getElement("employeeFormPanel")?.classList.toggle("hidden");
});
