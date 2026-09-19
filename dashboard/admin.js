import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    addDoc, collection, doc, getFirestore, getDoc, deleteDoc, 
    onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

// مراجع قواعد البيانات
const usersRef = collection(db, "users");
const ordersRef = collection(db, "orders");
const teamsRef = collection(db, "teams");
const trucksRef = collection(db, "trucks");
const branchMappingsRef = collection(db, "branchMappings");
const systemRef = doc(db, "system", "controls");
const notificationsRef = collection(db, "notifications");
const shiftManagersRef = collection(db, "shiftManagers");
const branchesDirRef = collection(db, "branchesDirectory");

// متغيرات عامة لتخزين البيانات
let allOrders = [];
let trucksList = [];
let branchMappingsMap = new Map(); 
let currentSheetData = []; 
let processedOrdersToUpload = [];

let allUsers = []; 
let carAssignments = {}; 
let assignedReps = {}; 
let allDirectoryBranches = [];

// --------------------------------------------------
// دوال مساعدة وتنظيف
// --------------------------------------------------
function getElement(id) { 
    return document.getElementById(id); 
}

function escapeHtml(value) { 
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); 
}

function cleanBranchName(name) { 
    return name ? String(name).replace(/\s*\(\d+\)\s*$/g, '').trim() : ""; 
}

function showToast(message, type = "error") {
    const toast = getElement("toastNotification");
    const icon = getElement("toastIcon");
    const text = getElement("toastMessage");
    if (!toast || !icon || !text) return;

    text.textContent = message;
    toast.className = "fixed top-4 left-1/2 -translate-x-1/2 transition-all duration-300 z-[100] flex items-center gap-3 px-6 py-3 rounded-xl shadow-2xl font-bold text-sm pointer-events-none w-max max-w-[90%]";
    
    if (type === "success") {
        toast.classList.add("bg-green-900", "border", "border-green-500", "text-white");
        icon.className = "fas fa-check-circle text-green-400 text-lg";
    } else {
        toast.classList.add("bg-red-900", "border", "border-red-500", "text-white");
        icon.className = "fas fa-exclamation-circle text-red-400 text-lg";
    }
    
    toast.classList.remove("opacity-0", "-translate-y-4");
    toast.classList.add("opacity-100", "translate-y-0");
    
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
    } else {
        button.innerHTML = button.dataset.originalHtml || button.innerHTML;
        button.disabled = false;
    }
}

function formatDate(value) {
    if (!value) return "";
    let date = value;
    if (typeof value?.toDate === "function") date = value.toDate();
    if (typeof value === "number") date = new Date(value < 100000000000 ? value * 1000 : value);
    const parsed = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(parsed.getTime())) return "";
    return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}

// --------------------------------------------------
// 1. إدارة الفرق والشاحنات
// --------------------------------------------------
getElement("teamForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = getElement("newTeamName").value.trim();
    if (!name) return;
    const btn = e.target.querySelector('button'); 
    setBusy(btn, true, "إضافة...");
    try { 
        await addDoc(teamsRef, { name, createdAt: serverTimestamp() }); 
        getElement("newTeamName").value = ""; 
        showToast("تم إضافة التيم", "success"); 
    } catch (e) { 
        showToast("خطأ في الإضافة"); 
    } finally { 
        setBusy(btn, false); 
    }
});

onSnapshot(teamsRef, (snapshot) => {
    const tbody = getElement("teamsTableBody");
    const selects = [getElement("newEmpTeam"), getElement("targetTeamValue")];
    if (tbody) tbody.innerHTML = "";
    let optionsHtml = '<option value="">اختر التيم...</option>';

    if(snapshot.empty && tbody) {
        tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center">لا توجد فرق مسجلة</td></tr>';
    }
    
    snapshot.forEach(docSnap => {
        const teamName = escapeHtml(docSnap.data().name);
        optionsHtml += `<option value="${teamName}">${teamName}</option>`;
        if (tbody) {
            tbody.innerHTML += `
                <tr class="hover:bg-gray-700/50">
                    <td class="p-4">${teamName}</td>
                    <td class="p-4 text-gray-400 text-xs">${formatDate(docSnap.data().createdAt)}</td>
                    <td class="p-4 text-center">
                        <button onclick="deleteTeam('${docSnap.id}', '${teamName}')" class="text-xs bg-red-900/50 text-red-400 px-2 py-1 rounded">حذف</button>
                    </td>
                </tr>
            `;
        }
    });
    selects.forEach(sel => { if(sel) sel.innerHTML = optionsHtml; });
});

window.deleteTeam = (id, name) => { 
    window.UI.openModal("تأكيد", `حذف تيم ${name}؟`, "حذف", "bg-red-600", async () => { 
        await deleteDoc(doc(db, "teams", id)); 
        showToast("تم الحذف", "success"); 
    }); 
};

getElement("truckForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = getElement("newTruckName").value.trim();
    if (!name) return;
    const btn = e.target.querySelector('button'); 
    setBusy(btn, true, "إضافة...");
    try { 
        await addDoc(trucksRef, { name, createdAt: serverTimestamp() }); 
        getElement("newTruckName").value = ""; 
        showToast("تم إضافة العربية", "success"); 
    } catch (e) { 
        showToast("خطأ"); 
    } finally { 
        setBusy(btn, false); 
    }
});

onSnapshot(trucksRef, (snapshot) => {
    const tbody = getElement("trucksTableBody");
    const selects = [getElement("targetCarValue")];
    trucksList = [];
    if (tbody) tbody.innerHTML = "";
    let optionsHtml = '<option value="">اختر العربية...</option>';

    if(snapshot.empty && tbody) {
        tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center">لا توجد شاحنات</td></tr>';
    }
    
    snapshot.forEach(docSnap => {
        const carName = escapeHtml(docSnap.data().name);
        trucksList.push(carName);
        optionsHtml += `<option value="${carName}">${carName}</option>`;
        if (tbody) {
            tbody.innerHTML += `
                <tr class="hover:bg-gray-700/50">
                    <td class="p-4">${carName}</td>
                    <td class="p-4 text-gray-400 text-xs">${formatDate(docSnap.data().createdAt)}</td>
                    <td class="p-4 text-center">
                        <button onclick="deleteTruck('${docSnap.id}', '${carName}')" class="text-xs bg-red-900/50 text-red-400 px-2 py-1 rounded">حذف</button>
                    </td>
                </tr>
            `;
        }
    });
    selects.forEach(sel => { if(sel) sel.innerHTML = optionsHtml; });
});

window.deleteTruck = (id, name) => { 
    window.UI.openModal("تأكيد", `حذف عربية ${name}؟`, "حذف", "bg-red-600", async () => { 
        await deleteDoc(doc(db, "trucks", id)); 
        showToast("تم الحذف", "success"); 
    }); 
};

// --------------------------------------------------
// 2. إدارة المناديب
// --------------------------------------------------
onSnapshot(usersRef, (snapshot) => {
    const tbody = getElement("employeesTableBody");
    const repsDataList = getElement("repsDataList");
    
    if (tbody) tbody.innerHTML = "";
    if (repsDataList) repsDataList.innerHTML = "";
    
    let totalReps = 0;
    allUsers = [];

    snapshot.forEach((docSnap) => {
        const user = docSnap.data();
        const hrid = docSnap.id;
        
        totalReps++;
        allUsers.push({ id: hrid, name: user.name, car: user.car });
        
        if (repsDataList) {
            repsDataList.innerHTML += `<option value="${hrid}">${user.name} (${hrid})</option>`;
        }

        if (!tbody) return;
        const isSuspended = user.status === 'suspended';
        
        tbody.innerHTML += `
            <tr class="hover:bg-gray-700/50">
                <td class="p-4">${escapeHtml(user.name)}</td>
                <td class="p-4 text-blue-400 font-bold">${escapeHtml(hrid)}</td>
                <td class="p-4" dir="ltr">${escapeHtml(user.mobile)}</td>
                <td class="p-4">${escapeHtml(user.team)}</td>
                <td class="p-4 text-yellow-400 font-bold">${escapeHtml(user.car || 'غير محدد')}</td>
                <td class="p-4 text-center tracking-widest">${user.pinCode || '-'}</td>
                <td class="p-4 text-center">
                    <button onclick="resetPin('${hrid}')" class="text-xs bg-red-900/50 text-red-400 px-2 py-1 rounded mb-1"><i class="fas fa-key"></i></button>
                    <button onclick="openEditEmployeeModal('${hrid}', '${escapeHtml(user.name)}', '${escapeHtml(user.mobile)}', '${escapeHtml(user.team)}')"><i class="fas fa-edit text-blue-400 ml-2"></i></button>
                    <button onclick="toggleEmployeeStatus('${hrid}', '${user.status}')"><i class="fas ${isSuspended ? 'fa-user-check text-green-400' : 'fa-user-slash text-orange-400'} ml-2"></i></button>
                </td>
            </tr>
        `;
    });
    
    if(getElement("stat-total-reps")) {
        getElement("stat-total-reps").textContent = totalReps;
    }
});

getElement("employeeForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = getElement("newEmpName").value.trim();
    const hrid = getElement("newEmpHrid").value.trim();
    const mobile = getElement("newEmpMobile").value.trim();
    const team = getElement("newEmpTeam").value;

    if (!name || !hrid || !mobile || !team) return showToast("برجاء ملء جميع البيانات");

    const btn = e.target.querySelector('button'); 
    setBusy(btn, true, "حفظ...");
    
    try {
        const existing = await getDoc(doc(db, "users", hrid));
        if (existing.exists()) return showToast("الـ HRID موجود بالفعل");
        
        await setDoc(doc(db, "users", hrid), { 
            name, 
            mobile, 
            team, 
            car: "", 
            status: "active", 
            pinCode: null, 
            createdAt: serverTimestamp(), 
            updatedAt: serverTimestamp() 
        });
        
        e.target.reset(); 
        getElement("employeeFormPanel")?.classList.add("hidden"); 
        showToast("تم الإضافة", "success");
    } catch (err) { 
        showToast("تعذر الإضافة"); 
    } finally { 
        setBusy(btn, false); 
    }
});

window.openEditEmployeeModal = (hrid, name, mobile, team) => {
    const html = `
        <input type="text" id="editModalName" value="${name}" class="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white mb-2" placeholder="الاسم">
        <input type="text" id="editModalMobile" value="${mobile}" class="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white mb-2" placeholder="الموبايل">
        <p class="text-xs text-gray-400 mb-1">تعديل التيم (الحالي: ${team})</p>
        <select id="editModalTeam" class="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white mb-2">
            ${getElement("newEmpTeam").innerHTML}
        </select>
    `;
    window.UI.openModal("تعديل بيانات", html, "حفظ", "bg-blue-600", async () => {
        await updateDoc(doc(db, "users", hrid), { 
            name: getElement("editModalName").value, 
            mobile: getElement("editModalMobile").value, 
            team: getElement("editModalTeam").value || team 
        }); 
        showToast("تم التعديل", "success");
    });
};

window.toggleEmployeeStatus = (hrid, status) => { 
    const ns = status === 'suspended' ? 'active' : 'suspended'; 
    window.UI.openModal("تأكيد", `تغيير حالة المندوب؟`, "تأكيد", "bg-orange-600", async () => { 
        await updateDoc(doc(db, "users", hrid), { status: ns }); 
    }); 
};

window.resetPin = (hrid) => { 
    window.UI.openModal("تصفير الـ PIN", `مسح الرقم السري؟`, "مسح", "bg-red-600", async () => { 
        await updateDoc(doc(db, "users", hrid), { pinCode: null }); 
        showToast("تم التصفير", "success"); 
    }); 
};

// --------------------------------------------------
// 3. دليل الفروع (التاب الجديد)
// --------------------------------------------------
getElement("branchForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
        name: getElement("brName").value.trim(),
        hours: getElement("brHours").value.trim(),
        location: getElement("brLocation").value.trim(),
        manager: getElement("brManager").value.trim(),
        staff: getElement("brStaff").value.trim(),
        permit: getElement("brPermit").value.trim(),
        createdAt: serverTimestamp()
    };
    
    const btn = e.target.querySelector("button");
    setBusy(btn, true, "حفظ...");
    
    try {
        await addDoc(branchesDirRef, data);
        e.target.reset();
        getElement("branchFormPanel").classList.add("hidden");
        showToast("تم إضافة بيانات الفرع للدليل", "success");
    } catch(e) {
        showToast("تعذر الإضافة");
    } finally {
        setBusy(btn, false);
    }
});

onSnapshot(branchesDirRef, (snapshot) => {
    allDirectoryBranches = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
    renderDirectoryBranches();
});

function renderDirectoryBranches() {
    const tbody = getElement("branchesTableBody");
    if (!tbody) return;
    
    const search = getElement("searchBranchInput")?.value.toLowerCase() || "";
    tbody.innerHTML = "";
    
    const filtered = allDirectoryBranches.filter(b => b.name.toLowerCase().includes(search));
    
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500">لا توجد فروع مسجلة بالدليل</td></tr>';
        return;
    }

    filtered.forEach(b => {
        tbody.innerHTML += `
            <tr class="hover:bg-gray-700/50">
                <td class="p-3 font-bold text-blue-400">${escapeHtml(b.name)}</td>
                <td class="p-3 text-gray-300 text-sm">${escapeHtml(b.hours)}</td>
                <td class="p-3 text-gray-300 text-sm">${escapeHtml(b.manager)}</td>
                <td class="p-3 text-center">
                    <button onclick="deleteDirBranch('${b.id}')" class="text-xs bg-red-900/50 text-red-400 hover:bg-red-600 hover:text-white px-2 py-1 rounded transition">حذف</button>
                </td>
            </tr>
        `;
    });
}

getElement("searchBranchInput")?.addEventListener("input", renderDirectoryBranches);

window.deleteDirBranch = (id) => {
    window.UI.openModal("تأكيد الحذف", "<p class='text-red-400'>هل أنت متأكد من حذف الفرع من الدليل نهائياً؟</p>", "حذف", "bg-red-600", async () => {
        try {
            await deleteDoc(doc(db, "branchesDirectory", id));
            showToast("تم الحذف بنجاح", "success");
        } catch(e) {
            showToast("تعذر الحذف");
        }
    });
};

// --------------------------------------------------
// 4. إدارة الأوردرات (رفع الإكسيل وتوزيع العربيات)
// --------------------------------------------------
onSnapshot(branchMappingsRef, (snapshot) => {
    branchMappingsMap.clear();
    snapshot.forEach(docSnap => { branchMappingsMap.set(docSnap.id, docSnap.data()); });
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
            
            if(currentSheetData.length > 0) {
                setupMappingWizard(currentSheetData);
            } else {
                showToast("الشيت فارغ أو غير صالح");
            }
        } catch(error) { 
            showToast("خطأ في قراءة ملف الإكسيل"); 
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
        
        if(branchRaw !== undefined) uniqueBranches.add(cleanBranchName(branchRaw));
        if(categoryRaw !== undefined) uniqueCategories.add(String(categoryRaw).trim());
    });

    const newBranchesBody = getElement("newBranchesTableBody");
    const savedBranchesBody = getElement("savedBranchesTableBody");
    const categoriesContainer = getElement("categoriesContainer");
    
    newBranchesBody.innerHTML = ""; 
    savedBranchesBody.innerHTML = ""; 
    categoriesContainer.innerHTML = "";
    
    let newCount = 0, savedCount = 0;
    
    let carOptions = `<option value="">-- اختر العربية --</option>`;
    trucksList.forEach(car => { carOptions += `<option value="${escapeHtml(car)}">${escapeHtml(car)}</option>`; });

    uniqueBranches.forEach(branch => {
        const branchId = branch.replace(/[\/\.#$\[\]]/g, '_'); 
        if (branchMappingsMap.has(branchId)) {
            savedCount++;
            const mapping = branchMappingsMap.get(branchId);
            const statusHtml = mapping.ignored ? `<span class="text-red-400">متجاهل</span>` : `<span class="text-green-400">${escapeHtml(mapping.car)}</span>`;
            
            savedBranchesBody.innerHTML += `
                <tr class="hover:bg-gray-700/50">
                    <td class="p-3">${escapeHtml(branch)}</td>
                    <td class="p-3">${statusHtml}</td>
                    <td class="p-3">مسجل</td>
                </tr>
            `;
        } else {
            newCount++;
            newBranchesBody.innerHTML += `
                <tr class="hover:bg-gray-700/50 new-branch-row" data-branch="${escapeHtml(branch)}" data-branch-id="${escapeHtml(branchId)}">
                    <td class="p-3 font-bold text-yellow-400">${escapeHtml(branch)}</td>
                    <td class="p-3"><select class="branch-car-select w-full px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white outline-none focus:border-blue-500">${carOptions}</select></td>
                    <td class="p-3"><input type="text" class="branch-ignore-input w-full px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white outline-none focus:border-red-500" placeholder="سبب التجاهل..."></td>
                </tr>
            `;
        }
    });

    if (newCount === 0) {
        newBranchesBody.innerHTML = '<tr><td colspan="3" class="text-center text-green-400 font-bold"><i class="fas fa-check-circle"></i> الفروع معرفة مسبقاً</td></tr>';
    }
    
    getElement("newBranchesCount").textContent = newCount; 
    getElement("savedBranchesCount").textContent = savedCount;

    uniqueCategories.forEach(cat => {
        categoriesContainer.innerHTML += `
            <label class="flex items-center gap-2 bg-gray-900 px-3 py-2 rounded border border-gray-600 cursor-pointer hover:border-yellow-500 transition">
                <input type="checkbox" value="${escapeHtml(cat)}" class="category-exclude-checkbox w-4 h-4 text-yellow-500 bg-gray-800 border-gray-600 rounded focus:ring-yellow-500">
                <span class="text-sm text-gray-300">${escapeHtml(cat)}</span>
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
                data: { branchName: row.dataset.branch, car: car || null, ignored: !!ignoreReason, reason: ignoreReason || null, createdAt: serverTimestamp() } 
            });
        }
    });

    if (hasErrors) return showToast("برجاء تعيين عربية أو تجاهل الفرع");
    
    const excludedCategories = Array.from(document.querySelectorAll('.category-exclude-checkbox:checked')).map(cb => cb.value);
    setBusy(btn, true, "جاري المعالجة...");

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

            const branch = row['Stock Moves/Destination Location'] !== undefined ? cleanBranchName(row['Stock Moves/Destination Location']) : "";
            const category = row['Stock Moves/Internal Type'] !== undefined ? String(row['Stock Moves/Internal Type']).trim() : "";
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
        showToast("خطأ"); 
    } finally { 
        setBusy(btn, false); 
    }
});

function renderCarsAccordion(groupedDataByCar, containerId, isAssignMode) {
    const container = getElement(containerId);
    if(!container) return;
    container.innerHTML = "";

    let repsOptions = `<option value="">-- اختر المندوب --</option>`;
    allUsers.forEach(u => repsOptions += `<option value="${u.id}">${escapeHtml(u.name)} (${u.id})</option>`);

    for (const [carName, carData] of Object.entries(groupedDataByCar)) {
        const safeCarId = carName.replace(/\W/g, '_');
        let branchesHtml = "";

        for (const [branchName, branchData] of Object.entries(carData.branches)) {
            let categoriesHtml = "";
            for (const [category, products] of Object.entries(branchData.categories)) {
                let productsRows = products.map(p => `
                    <tr>
                        <td class="p-2">${escapeHtml(p.productName)}</td>
                        <td class="p-2" dir="ltr">${escapeHtml(p.barcode)}</td>
                        <td class="p-2 text-center text-blue-300 font-bold">${escapeHtml(p.quantity)}</td>
                    </tr>
                `).join("");
                
                categoriesHtml += `
                    <div class="mt-3 border border-gray-600 rounded-lg overflow-hidden bg-gray-800">
                        <div class="bg-gray-700 p-2 flex justify-between items-center cursor-pointer" onclick="toggleAccordion(this)">
                            <span class="font-bold text-yellow-400 text-sm">${escapeHtml(category)} <span class="text-xs bg-yellow-900 px-2 rounded ml-2">${products.length}</span></span>
                            <i class="fas fa-chevron-down chevron text-gray-400 text-sm"></i>
                        </div>
                        <div class="accordion-content p-0 border-0">
                            <table class="w-full text-xs text-right">
                                <thead class="bg-gray-900 text-gray-400">
                                    <tr><th class="p-2">المنتج</th><th class="p-2">الباركود</th><th class="p-2 text-center">الكمية</th></tr>
                                </thead>
                                <tbody class="divide-y divide-gray-700">
                                    ${productsRows}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }
            branchesHtml += `
                <div class="mt-4 pl-4 border-r-2 border-green-500">
                    <h5 class="text-md font-bold text-green-400">${escapeHtml(branchName)}</h5>
                    ${categoriesHtml}
                </div>
            `;
        }

        let assignUiHtml = "";
        if (isAssignMode) {
            assignUiHtml = `
                <div id="assign_ui_${safeCarId}" class="flex flex-col md:flex-row gap-2 w-full md:w-auto bg-gray-900 p-2 rounded-lg border border-gray-600">
                    <select id="assign_select_${safeCarId}" class="px-3 py-1.5 bg-gray-800 border border-gray-600 rounded text-white text-sm outline-none focus:border-blue-500">${repsOptions}</select>
                    <button onclick="assignCarToRep('${escapeHtml(carName)}', '${safeCarId}')" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded font-bold text-sm">إسناد</button>
                </div>
                <div id="assigned_ui_${safeCarId}" class="hidden flex flex-col md:flex-row items-center gap-3 w-full md:w-auto bg-green-900/30 p-2 rounded-lg border border-green-700">
                    <span class="text-green-400 font-bold text-sm"><i class="fas fa-check-circle ml-1"></i> مُسند لـ: <span id="assigned_name_${safeCarId}"></span></span>
                    <button onclick="cancelCarAssignment('${escapeHtml(carName)}', '${safeCarId}')" class="text-xs bg-red-600 text-white px-2 py-1 rounded">إلغاء</button>
                </div>
            `;
        }

        container.innerHTML += `
            <div class="bg-gray-800 border ${isAssignMode ? 'border-blue-800' : 'border-gray-600'} rounded-xl shadow-lg overflow-hidden">
                <div class="bg-gray-700 p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div class="flex items-center cursor-pointer flex-1" onclick="toggleAccordion(this.parentElement)">
                        <i class="fas fa-chevron-down chevron transition-transform text-xl text-blue-400 ml-3"></i>
                        <h4 class="text-xl font-bold text-white"><i class="fas fa-truck text-blue-400 ml-2"></i> سيارة: ${escapeHtml(carName)}</h4>
                    </div>
                    ${assignUiHtml}
                </div>
                <div class="accordion-content p-0 border-0"><div class="p-4 bg-gray-800/50">${branchesHtml}</div></div>
            </div>
        `;
    }
}

window.assignCarToRep = (carName, safeCarId) => {
    const selectEl = getElement(`assign_select_${safeCarId}`);
    const selectedHrid = selectEl.value;
    
    if (!selectedHrid) return showToast("اختر مندوب أولاً");
    
    const rep = allUsers.find(u => u.id === selectedHrid);
    let hasOtherCars = false;
    
    if (assignedReps[selectedHrid] && assignedReps[selectedHrid].length > 0) hasOtherCars = true;
    if (rep.car && rep.car !== carName) hasOtherCars = true;

    if (hasOtherCars) {
        window.UI.openModal("تنبيه إسناد", `<p>المندوب <span class="text-yellow-400">${rep.name}</span> معه سيارة مسندة. هل تريد إسناد هذه أيضاً؟</p>`, "إسناد", "bg-orange-600", () => finalizeAssignment(carName, safeCarId, rep));
    } else { 
        finalizeAssignment(carName, safeCarId, rep); 
    }
};

function finalizeAssignment(carName, safeCarId, rep) {
    carAssignments[carName] = rep.id;
    if (!assignedReps[rep.id]) assignedReps[rep.id] = [];
    assignedReps[rep.id].push(carName);
    
    getElement(`assign_ui_${safeCarId}`).classList.add('hidden');
    getElement(`assigned_ui_${safeCarId}`).classList.remove('hidden');
    getElement(`assigned_name_${safeCarId}`).innerText = rep.name;
    
    showToast(`تم إسناد ${carName} لـ ${rep.name}`, "success");
}

window.cancelCarAssignment = (carName, safeCarId) => {
    const hrid = carAssignments[carName];
    if (hrid) {
        delete carAssignments[carName];
        if (assignedReps[hrid]) assignedReps[hrid] = assignedReps[hrid].filter(c => c !== carName);
    }
    
    getElement(`assigned_ui_${safeCarId}`).classList.add('hidden');
    getElement(`assign_ui_${safeCarId}`).classList.remove('hidden');
    getElement(`assign_select_${safeCarId}`).value = "";
};

getElement("confirmAndUploadOrdersBtn")?.addEventListener("click", async (e) => {
    if (processedOrdersToUpload.length === 0) return;
    
    const btn = e.target;
    window.UI.openModal("تأكيد", "حفظ الأوردرات وإرسالها للمناديب؟", "حفظ", "bg-green-600", async () => {
        setBusy(btn, true, "جاري الرفع...");
        
        try {
            let batch = writeBatch(db);
            let count = 0;
            
            for (const order of processedOrdersToUpload) {
                order.hrid = carAssignments[order.car] || "";
                order.status = "Draft"; 
                order.createdAt = serverTimestamp();
                
                batch.set(doc(ordersRef), order);
                count++;
                
                if (count === 400) { 
                    await batch.commit(); 
                    batch = writeBatch(db); 
                    count = 0; 
                }
            }
            if (count > 0) await batch.commit();

            let userBatch = writeBatch(db);
            let uc = 0;
            for (const [carName, hrid] of Object.entries(carAssignments)) {
                if (hrid) { 
                    userBatch.update(doc(db, "users", hrid), { car: carName }); 
                    uc++; 
                }
            }
            if(uc > 0) await userBatch.commit();

            showToast("تم الاعتماد والرفع بنجاح!", "success");
            getElement("groupedOrdersContainer").classList.add("hidden");
            getElement("uploadPromptContainer").classList.remove("hidden");
            
            processedOrdersToUpload = []; 
            currentSheetData = []; 
            carAssignments = {}; 
            assignedReps = {};
        } catch (error) { 
            showToast("خطأ أثناء الرفع"); 
        } finally { 
            setBusy(btn, false); 
        }
    });
});

// سجل الداتا بيز مفلتر بالتاريخ
const dateFilterInput = getElement("dbOrdersDateFilter");
if(dateFilterInput) {
    dateFilterInput.valueAsDate = new Date();
    dateFilterInput.addEventListener("change", renderDbOrdersByDate);
}

function renderDbOrdersByDate() {
    const container = getElement("dbCarsAccordionContainer");
    if (!container) return;
    
    const selectedDateStr = dateFilterInput.value;
    if(!selectedDateStr) return;
    
    const targetDate = new Date(selectedDateStr).toDateString();
    getElement("displayFilteredDate").innerText = `(تاريخ: ${new Date(targetDate).toLocaleDateString('ar-EG')})`;

    const filteredOrders = allOrders.filter(o => {
        if (o.status === "Pending" || o.status === "Resolved") return false;
        const oDate = o.createdAt?.toDate ? o.createdAt.toDate().toDateString() : null;
        return oDate === targetDate;
    });

    if (filteredOrders.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-500 py-8">لا توجد أوردرات موزعة في هذا التاريخ.</div>';
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


// --------------------------------------------------
// 5. الأوردرات المعلقة (Pending Orders) - النظام التسلسلي
// --------------------------------------------------
const pendingHridInput = getElement("newOrderHrid");
const pendingBranchSelect = getElement("newOrderBranch");
const pendingProductSelect = getElement("newOrderProduct");
const pendingBarcodeInp = getElement("newOrderBarcode");

pendingHridInput?.addEventListener("input", (e) => {
    const hrid = e.target.value.trim();
    
    pendingBranchSelect.innerHTML = '<option value="">اختر الفرع...</option>';
    pendingProductSelect.innerHTML = '<option value="">أدخل الفرع أولاً...</option>';
    pendingBarcodeInp.value = "";
    
    if(!hrid) return;

    const branches = new Set();
    allOrders.forEach(o => {
        if (o.hrid === hrid && o.branch && o.status !== 'Pending' && o.status !== 'Resolved') {
            branches.add(o.branch);
        }
    });

    if (branches.size === 0) {
        pendingBranchSelect.innerHTML = '<option value="">لا يوجد فروع مسجلة لهذا المندوب</option>';
    } else {
        branches.forEach(b => {
            pendingBranchSelect.innerHTML += `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`;
        });
    }
});

pendingBranchSelect?.addEventListener("change", (e) => {
    const branch = e.target.value;
    const hrid = pendingHridInput.value.trim();
    
    pendingProductSelect.innerHTML = '<option value="">اختر المنتج...</option>';
    pendingBarcodeInp.value = "";
    
    if(!branch || !hrid) return;

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

pendingProductSelect?.addEventListener("change", (e) => {
    pendingBarcodeInp.value = e.target.value;
});

getElement("orderForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    
    const hrid = pendingHridInput.value.trim();
    const branch = pendingBranchSelect.value;
    const barcode = pendingBarcodeInp.value.trim();
    const notes = getElement("newOrderNotes").value.trim();
    
    const productName = pendingProductSelect.options[pendingProductSelect.selectedIndex]?.text;

    if (!barcode || !hrid || !branch || !productName) return showToast("برجاء إكمال جميع الخطوات");

    savePendingOrder(barcode, productName, hrid, branch, notes);
});

async function savePendingOrder(barcode, productName, hrid, branch, notes) {
    try {
        let car = "";
        const userDoc = await getDoc(doc(db, "users", hrid));
        if (userDoc.exists()) { car = userDoc.data().car || ""; }

        await addDoc(ordersRef, { 
            productName, barcode, hrid, branch, car, 
            notes: notes || "معلق", status: "Pending", 
            createdAt: serverTimestamp(), updatedAt: serverTimestamp() 
        });
        
        pendingHridInput.value = ""; 
        pendingBranchSelect.innerHTML = '<option value="">أدخل المندوب أولاً...</option>';
        pendingProductSelect.innerHTML = '<option value="">أدخل الفرع أولاً...</option>';
        pendingBarcodeInp.value = ""; 
        getElement("newOrderNotes").value = "";
        
        showToast("تم إنشاء الأوردر المعلق بنجاح", "success");
    } catch (e) { 
        showToast("تعذر إنشاء الأوردر"); 
    }
}

onSnapshot(ordersRef, (snapshot) => {
    allOrders = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        if(data.barcode && data.productName) barcodeToProductMap.set(data.barcode.trim(), data.productName);
        return { id: docSnap.id, ...data };
    });
    
    allOrders.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    
    renderPendingOrders();
    renderDbOrdersByDate(); 
});

function renderPendingOrders() {
    const container = getElement("adminPendingOrdersContainer");
    if (!container) return;
    
    const search = getElement("adminOrderSearch")?.value.trim().toLowerCase() || "";
    const filter = getElement("adminOrderFilter")?.value || "all";

    const filtered = allOrders.filter((order) => {
        const status = order.status;
        if(status !== 'Pending' && status !== 'Resolved') return false;
        
        const product = String(order.productName || "").toLowerCase();
        const barcode = String(order.barcode || "").toLowerCase();
        const rep = String(order.hrid || "").toLowerCase();
        
        const matchSearch = !search || `${product} ${barcode} ${rep}`.includes(search);
        return matchSearch && (filter === "all" || status === filter);
    });

    container.innerHTML = "";
    if (filtered.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-500 py-8">لا توجد أوردرات معلقة.</div>';
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
        div.className = `bg-gray-800 p-4 rounded-lg border ${cardBorder} flex flex-col md:flex-row justify-between items-start gap-4 hover:bg-gray-700/50 transition`;
        
        div.innerHTML = `
            <div class="min-w-0 flex-1 w-full">
                <!-- العنوان الرئيسي: اسم الفرع -->
                <div class="font-bold text-xl text-green-400 mb-2 border-b border-gray-700 pb-2 flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <div><i class="fas fa-map-marker-alt"></i> ${escapeHtml(order.branch || 'فرع غير محدد')}</div>
                    <span class="text-xs bg-blue-900/50 text-blue-300 px-2 py-1 rounded w-max"><i class="fas fa-user"></i> المندوب: ${escapeHtml(repName)}</span>
                </div>
                
                <!-- التفاصيل (المنتج والباركود والتاريخ) -->
                <div class="text-sm text-gray-300 mt-2 flex flex-wrap gap-4 items-center">
                    <span class="font-bold text-yellow-400"><i class="fas fa-box"></i> ${escapeHtml(order.productName)}</span>
                    <span dir="ltr" class="text-gray-400"><i class="fas fa-barcode"></i> ${escapeHtml(order.barcode)}</span>
                    <span class="text-gray-500"><i class="fas fa-calendar-alt"></i> ${escapeHtml(orderDate)}</span>
                </div>
                
                <!-- السبب -->
                <div class="mt-3 text-sm text-orange-400 font-bold bg-gray-900 p-2 rounded">
                    <i class="fas fa-exclamation-triangle"></i> السبب: ${escapeHtml(order.notes)}
                </div>
            </div>
            
            <!-- أزرار الإجراءات (التحكم والتعديل والحذف) -->
            <div class="flex flex-col md:items-end gap-2 w-full md:w-auto mt-2 md:mt-0">
                <select data-order-status="${escapeHtml(order.id)}" class="bg-gray-900 border ${cardBorder} text-white text-sm rounded-lg p-2 outline-none focus:border-blue-500 w-full">
                    <option value="Pending" ${status === 'Pending' ? 'selected' : ''}>قيد التعليق</option>
                    <option value="Resolved" ${status === 'Resolved' ? 'selected' : ''}>تم الحل / تسوية</option>
                </select>
                
                <div class="flex gap-2 w-full justify-end mt-1">
                    <button onclick="editPendingOrder('${escapeHtml(order.id)}', '${escapeHtml(order.notes)}')" class="bg-blue-900/50 hover:bg-blue-600 text-blue-300 hover:text-white px-3 py-1.5 rounded transition text-xs flex-1">تعديل السبب</button>
                    <button onclick="deletePendingOrder('${escapeHtml(order.id)}')" class="bg-red-900/50 hover:bg-red-600 text-red-300 hover:text-white px-3 py-1.5 rounded transition text-xs flex-1">حذف الأوردر</button>
                </div>
            </div>
        `;
        
        div.querySelector("[data-order-status]").addEventListener("change", (e) => {
            updateDoc(doc(db, "orders", order.id), { status: e.target.value, updatedAt: serverTimestamp() });
            showToast("تم تحديث حالة الأوردر", "success");
        });
        
        container.appendChild(div);
    });
}

window.deletePendingOrder = (orderId) => {
    window.UI.openModal("تأكيد الحذف", "<p class='text-red-400'>هل أنت متأكد من حذف هذا الأوردر المعلق نهائياً؟</p>", "حذف نهائي", "bg-red-600", async () => {
        try {
            await deleteDoc(doc(db, "orders", orderId));
            showToast("تم حذف الأوردر", "success");
        } catch(e) {
            showToast("تعذر حذف الأوردر");
        }
    });
};

window.editPendingOrder = (orderId, currentNotes) => {
    const html = `
        <label class="block text-sm text-gray-400 mb-1">سبب التعليق الجديد:</label>
        <input type="text" id="editPendingNotes" value="${currentNotes}" class="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white outline-none focus:border-blue-500">
    `;
    window.UI.openModal("تعديل سبب التعليق", html, "حفظ التعديل", "bg-blue-600", async () => {
        const newNotes = getElement("editPendingNotes").value.trim();
        try {
            await updateDoc(doc(db, "orders", orderId), { notes: newNotes, updatedAt: serverTimestamp() });
            showToast("تم تعديل السبب بنجاح", "success");
        } catch(e) {
            showToast("تعذر التعديل");
        }
    });
};


// --------------------------------------------------
// 6. الإعدادات والإشعارات
// --------------------------------------------------
getElement("odooSettingsForm")?.addEventListener("submit", async(e)=>{
    e.preventDefault();
    const username = getElement("odooEmail")?.value.trim(); 
    const password = getElement("odooPassword").value;
    const btn = e.target.querySelector("button");
    setBusy(btn, true, "حفظ...");
    try {
        await setDoc(doc(db, "system", "odoo_credentials"), { username, password, updatedAt: serverTimestamp() });
        showToast("تم حفظ البيانات", "success");
    } catch(err) {
        showToast("تعذر الحفظ");
    } finally { setBusy(btn, false); }
});

const shiftManagersRef = collection(db, "shiftManagers");

getElement("shiftManagerForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
        name: getElement("smName").value.trim(),
        phone: getElement("smPhone").value.trim(),
        whatsapp: getElement("smWhatsapp").value.trim(),
        createdAt: serverTimestamp()
    };
    const btn = e.target.querySelector("button");
    setBusy(btn, true, "إضافة...");
    try {
        await addDoc(shiftManagersRef, data);
        e.target.reset();
        showToast("تم إضافة المدير", "success");
    } catch(e) {
        showToast("خطأ");
    } finally {
        setBusy(btn, false);
    }
});

onSnapshot(shiftManagersRef, (snapshot) => {
    const tbody = getElement("shiftManagersTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (snapshot.empty) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500">لا يوجد مديرين مسجلين</td></tr>';
        return;
    }
    snapshot.forEach(docSnap => {
        const sm = docSnap.data();
        tbody.innerHTML += `
            <tr class="hover:bg-gray-700/50">
                <td class="p-3">${escapeHtml(sm.name)}</td>
                <td class="p-3" dir="ltr">${escapeHtml(sm.phone)}</td>
                <td class="p-3" dir="ltr">${escapeHtml(sm.whatsapp)}</td>
                <td class="p-3 text-center">
                    <button onclick="deleteShiftManager('${docSnap.id}')" class="text-xs bg-red-900/50 text-red-400 px-2 py-1 rounded">حذف</button>
                </td>
            </tr>
        `;
    });
});

window.deleteShiftManager = (id) => {
    window.UI.openModal("تأكيد", "حذف المدير؟", "حذف", "bg-red-600", async () => {
        await deleteDoc(doc(db, "shiftManagers", id));
        showToast("تم الحذف", "success");
    });
};

window.sendNotification = async () => {
    const type = getElement("notificationTargetType").value;
    let target = type === 'rep' ? getElement("targetRepValue").value : 
                 type === 'team' ? getElement("targetTeamValue").value : 
                 type === 'car' ? getElement("targetCarValue").value : "";
                 
    const msg = getElement("globalNotificationText").value.trim();
    if (!msg || (type !== 'all' && !target)) return showToast("أكمل البيانات المطلوبة");
    
    const btn = document.querySelector('[onclick="sendNotification()"]'); 
    setBusy(btn, true, "إرسال...");
    
    try {
        await addDoc(notificationsRef, { message: msg, type, target, timestamp: serverTimestamp(), readBy: [] });
        if(type === 'all') await setDoc(systemRef, { globalMessage: msg, messageTime: Date.now() }, { merge: true });
        
        getElement("globalNotificationText").value = ""; 
        showToast("تم إرسال الإشعار", "success");
    } catch(e) { 
        showToast("خطأ في الإرسال"); 
    } finally { 
        setBusy(btn, false); 
    }
};

window.forceLogoutAll = async () => { 
    try { 
        await setDoc(systemRef, { forceLogoutTrigger: Date.now() }, { merge: true }); 
        showToast("تم التنفيذ بنجاح", "success"); 
    } catch(e) { 
        showToast("خطأ"); 
    } 
};

getElement("adminOrderSearch")?.addEventListener("input", renderPendingOrders);
getElement("adminOrderFilter")?.addEventListener("change", renderPendingOrders);
