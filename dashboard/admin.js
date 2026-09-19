import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    addDoc, collection, doc, getFirestore, getDocs, deleteDoc, 
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

// متغيرات عامة لتخزين البيانات بالذاكرة
let allOrders = [];
let barcodeToProductMap = new Map(); 
let trucksList = [];
let branchMappingsMap = new Map(); // الخريطة المحفوظة للفروع
let currentSheetData = []; // بيانات الشيت المرفوع حالياً

// --------------------------------------------------
// دوال مساعدة للواجهة
// --------------------------------------------------
function getElement(id) { return document.getElementById(id); }
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }

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
    if (typeof value?.toDate === "function") date = value.toDate();
    if (typeof value === "number") date = new Date(value < 100000000000 ? value * 1000 : value);
    const parsed = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(parsed.getTime())) return "";
    return new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

// --------------------------------------------------
// 1. إدارة الفرق (Teams) و الشاحنات (Cars)
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
    } catch (e) { showToast("خطأ في الإضافة"); } finally { setBusy(btn, false); }
});

onSnapshot(teamsRef, (snapshot) => {
    const tbody = getElement("teamsTableBody");
    const selects = [getElement("newEmpTeam"), getElement("targetTeamValue")];
    if (tbody) tbody.innerHTML = "";
    let optionsHtml = '<option value="">اختر التيم...</option>';

    if(snapshot.empty && tbody) tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center">لا توجد فرق</td></tr>';
    snapshot.forEach(docSnap => {
        const teamName = escapeHtml(docSnap.data().name);
        optionsHtml += `<option value="${teamName}">${teamName}</option>`;
        if (tbody) {
            tbody.innerHTML += `<tr class="hover:bg-gray-700/50">
                <td class="p-4">${teamName}</td><td class="p-4 text-gray-400 text-xs">${formatDate(docSnap.data().createdAt)}</td>
                <td class="p-4 text-center"><button onclick="deleteTeam('${docSnap.id}', '${teamName}')" class="text-xs bg-red-900/50 text-red-400 px-2 py-1 rounded">حذف</button></td>
            </tr>`;
        }
    });
    selects.forEach(sel => { if(sel) sel.innerHTML = optionsHtml; });
});

window.deleteTeam = (id, name) => {
    window.UI.openModal("تأكيد", `حذف تيم ${name}؟`, "حذف", "bg-red-600", async () => {
        await deleteDoc(doc(db, "teams", id)); showToast("تم الحذف", "success");
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
    } catch (e) { showToast("خطأ في الإضافة"); } finally { setBusy(btn, false); }
});

onSnapshot(trucksRef, (snapshot) => {
    const tbody = getElement("trucksTableBody");
    const selects = [getElement("newEmpCar"), getElement("targetCarValue")];
    trucksList = [];
    if (tbody) tbody.innerHTML = "";
    let optionsHtml = '<option value="">اختر العربية...</option>';

    if(snapshot.empty && tbody) tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center">لا توجد شاحنات</td></tr>';
    snapshot.forEach(docSnap => {
        const carName = escapeHtml(docSnap.data().name);
        trucksList.push(carName);
        optionsHtml += `<option value="${carName}">${carName}</option>`;
        if (tbody) {
            tbody.innerHTML += `<tr class="hover:bg-gray-700/50">
                <td class="p-4">${carName}</td><td class="p-4 text-gray-400 text-xs">${formatDate(docSnap.data().createdAt)}</td>
                <td class="p-4 text-center"><button onclick="deleteTruck('${docSnap.id}', '${carName}')" class="text-xs bg-red-900/50 text-red-400 px-2 py-1 rounded">حذف</button></td>
            </tr>`;
        }
    });
    selects.forEach(sel => { if(sel) sel.innerHTML = optionsHtml; });
});

window.deleteTruck = (id, name) => {
    window.UI.openModal("تأكيد", `حذف عربية ${name}؟`, "حذف", "bg-red-600", async () => {
        await deleteDoc(doc(db, "trucks", id)); showToast("تم الحذف", "success");
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

    snapshot.forEach((docSnap) => {
        const user = docSnap.data();
        const hrid = docSnap.id;
        totalReps++;
        if (repsDataList) repsDataList.innerHTML += `<option value="${hrid}">${user.name}</option>`;

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
                    <button onclick="resetPin('${hrid}')" class="text-xs bg-red-900/50 text-red-400 px-2 py-1 rounded"><i class="fas fa-key"></i></button>
                    <button onclick="openEditEmployeeModal('${hrid}', '${escapeHtml(user.name)}', '${escapeHtml(user.mobile)}', '${escapeHtml(user.team)}', '${escapeHtml(user.car || '')}')" class="text-xs bg-blue-900/50 text-blue-400 px-2 py-1 rounded"><i class="fas fa-edit"></i></button>
                    <button onclick="toggleEmployeeStatus('${hrid}', '${user.status}')" class="text-xs ${isSuspended ? 'bg-green-900/50 text-green-400' : 'bg-orange-900/50 text-orange-400'} px-2 py-1 rounded"><i class="fas ${isSuspended ? 'fa-user-check' : 'fa-user-slash'}"></i></button>
                </td>
            </tr>
        `;
    });
    if(getElement("stat-total-reps")) getElement("stat-total-reps").textContent = totalReps;
});

getElement("employeeForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = getElement("newEmpName").value.trim();
    const hrid = getElement("newEmpHrid").value.trim();
    const mobile = getElement("newEmpMobile").value.trim();
    const team = getElement("newEmpTeam").value;
    const car = getElement("newEmpCar").value;

    if (!name || !hrid || !mobile || !team || !car) return showToast("برجاء ملء جميع البيانات");

    const btn = e.target.querySelector('button');
    setBusy(btn, true, "حفظ...");
    try {
        const existing = await getDoc(doc(db, "users", hrid));
        if (existing.exists()) return showToast("الـ HRID موجود بالفعل");
        
        await setDoc(doc(db, "users", hrid), {
            name, mobile, team, car, status: "active", pinCode: null,
            createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        });
        e.target.reset(); getElement("employeeFormPanel")?.classList.add("hidden");
        showToast("تم إضافة المندوب", "success");
    } catch (err) { showToast("تعذر الإضافة"); } finally { setBusy(btn, false); }
});

window.openEditEmployeeModal = (hrid, name, mobile, team, car) => {
    const html = `
        <input type="text" id="editModalName" value="${name}" class="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white mb-2" placeholder="الاسم">
        <input type="text" id="editModalMobile" value="${mobile}" class="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white mb-2" placeholder="الموبايل">
        <p class="text-xs text-gray-400 mb-1">تعديل التيم (الحالي: ${team})</p>
        <select id="editModalTeam" class="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white mb-2">${getElement("newEmpTeam").innerHTML}</select>
        <p class="text-xs text-gray-400 mb-1">تعديل العربية (الحالية: ${car})</p>
        <select id="editModalCar" class="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white mb-2">${getElement("newEmpCar").innerHTML}</select>
    `;
    window.UI.openModal("تعديل بيانات المندوب", html, "حفظ", "bg-blue-600", async () => {
        const nName = getElement("editModalName").value;
        const nMobile = getElement("editModalMobile").value;
        const nTeam = getElement("editModalTeam").value || team;
        const nCar = getElement("editModalCar").value || car;
        await updateDoc(doc(db, "users", hrid), { name: nName, mobile: nMobile, team: nTeam, car: nCar });
        showToast("تم التعديل", "success");
    });
};

window.toggleEmployeeStatus = (hrid, status) => {
    const ns = status === 'suspended' ? 'active' : 'suspended';
    window.UI.openModal("تأكيد", `تغيير حالة المندوب؟`, "تأكيد", "bg-orange-600", async () => {
        await updateDoc(doc(db, "users", hrid), { status: ns }); showToast("تم بنجاح", "success");
    });
};

window.resetPin = (hrid) => {
    window.UI.openModal("تصفير الـ PIN", `مسح الرقم السري؟`, "مسح", "bg-red-600", async () => {
        await updateDoc(doc(db, "users", hrid), { pinCode: null }); showToast("تم التصفير", "success");
    });
};

// --------------------------------------------------
// 3. إدارة الأوردرات (الرفع الأوتوماتيكي والتقسيم)
// --------------------------------------------------

// جلب التعيينات المحفوظة للفروع من الفايربيس
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
        const data = evt.target.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        currentSheetData = XLSX.utils.sheet_to_json(worksheet);
        
        if(currentSheetData.length > 0) {
            setupMappingWizard(currentSheetData);
        } else {
            showToast("الشيت فارغ أو غير صالح");
        }
        e.target.value = ""; // تصفير الـ input
    };
    reader.readAsArrayBuffer(file);
});

function setupMappingWizard(data) {
    getElement("uploadPromptContainer").classList.add("hidden");
    getElement("sheetMappingWizard").classList.remove("hidden");

    let uniqueBranches = new Set();
    let uniqueCategories = new Set();

    data.forEach(row => {
        const branch = row['Stock Moves/Destination Location'];
        const category = row['Stock Moves/Internal Type'];
        if(branch) uniqueBranches.add(branch.trim());
        if(category) uniqueCategories.add(category.trim());
    });

    const newBranchesBody = getElement("newBranchesTableBody");
    const savedBranchesBody = getElement("savedBranchesTableBody");
    const categoriesContainer = getElement("categoriesContainer");
    
    newBranchesBody.innerHTML = "";
    savedBranchesBody.innerHTML = "";
    categoriesContainer.innerHTML = "";

    let newCount = 0;
    let savedCount = 0;

    // تجهيز دروب داون العربيات للـ Select
    let carOptions = `<option value="">-- اختر العربية --</option>`;
    trucksList.forEach(car => { carOptions += `<option value="${escapeHtml(car)}">${escapeHtml(car)}</option>`; });

    uniqueBranches.forEach(branch => {
        // الـ ID في فايربيس ما ينفعش يكون فيه سلاش، بنعمله Sanitize
        const branchId = branch.replace(/[\/\.#$\[\]]/g, '_'); 
        
        if (branchMappingsMap.has(branchId)) {
            // فرع محفوظ مسبقاً
            savedCount++;
            const mapping = branchMappingsMap.get(branchId);
            const statusHtml = mapping.ignored 
                ? `<span class="text-red-400">متجاهل (${escapeHtml(mapping.reason)})</span>`
                : `<span class="text-green-400">مُعين لعربية: ${escapeHtml(mapping.car)}</span>`;
                
            savedBranchesBody.innerHTML += `
                <tr class="hover:bg-gray-700/50">
                    <td class="p-3">${escapeHtml(branch)}</td>
                    <td class="p-3">${mapping.ignored ? '-' : escapeHtml(mapping.car)}</td>
                    <td class="p-3">${statusHtml}</td>
                </tr>
            `;
        } else {
            // فرع جديد محتاج تعيين
            newCount++;
            newBranchesBody.innerHTML += `
                <tr class="hover:bg-gray-700/50 new-branch-row" data-branch="${escapeHtml(branch)}" data-branch-id="${escapeHtml(branchId)}">
                    <td class="p-3 font-bold text-yellow-400">${escapeHtml(branch)}</td>
                    <td class="p-3">
                        <select class="branch-car-select w-full px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white outline-none focus:border-blue-500">
                            ${carOptions}
                        </select>
                    </td>
                    <td class="p-3">
                        <input type="text" class="branch-ignore-input w-full px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white outline-none focus:border-red-500" placeholder="أو اكتب سبب التجاهل هنا...">
                    </td>
                </tr>
            `;
        }
    });

    if (newCount === 0) {
        newBranchesBody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-green-400 font-bold"><i class="fas fa-check-circle"></i> جميع الفروع في هذا الشيت معرفة مسبقاً</td></tr>';
    }

    getElement("newBranchesCount").textContent = newCount;
    getElement("savedBranchesCount").textContent = savedCount;

    // كاتيجوريز (لتجاهل اقسام معينة)
    uniqueCategories.forEach(cat => {
        categoriesContainer.innerHTML += `
            <label class="flex items-center gap-2 bg-gray-900 px-3 py-2 rounded border border-gray-600 cursor-pointer hover:border-yellow-500 transition">
                <input type="checkbox" value="${escapeHtml(cat)}" class="category-exclude-checkbox w-4 h-4 text-yellow-500 bg-gray-800 border-gray-600 rounded focus:ring-yellow-500">
                <span class="text-sm text-gray-300">${escapeHtml(cat)}</span>
            </label>
        `;
    });
}

// زر معالجة الشيت وحفظ الأوردرات
getElement("processSheetBtn")?.addEventListener("click", async (e) => {
    const btn = e.target;
    const newBranchRows = document.querySelectorAll('.new-branch-row');
    let hasErrors = false;
    let newMappingsToSave = [];

    // 1. التحقق من الفروع الجديدة
    newBranchRows.forEach(row => {
        const branch = row.dataset.branch;
        const branchId = row.dataset.branchId;
        const car = row.querySelector('.branch-car-select').value;
        const ignoreReason = row.querySelector('.branch-ignore-input').value.trim();

        if (!car && !ignoreReason) {
            row.classList.add("border", "border-red-500");
            hasErrors = true;
        } else {
            row.classList.remove("border-red-500");
            newMappingsToSave.push({
                id: branchId,
                data: {
                    branchName: branch,
                    car: car || null,
                    ignored: !!ignoreReason,
                    reason: ignoreReason || null,
                    createdAt: serverTimestamp()
                }
            });
        }
    });

    if (hasErrors) return showToast("برجاء تعيين عربية أو كتابة سبب تجاهل لجميع الفروع الجديدة المؤشرة بالأحمر");

    // 2. تجميع الكاتيجوريز المستبعدة
    const excludedCategories = Array.from(document.querySelectorAll('.category-exclude-checkbox:checked')).map(cb => cb.value);

    setBusy(btn, true, "جاري الحفظ والتقسيم...");

    try {
        // حفظ الفروع الجديدة في الفايربيس (عشان تفضل ثابتة)
        for (const mapping of newMappingsToSave) {
            await setDoc(doc(db, "branchMappings", mapping.id), mapping.data);
            // إضافتها محلياً عشان نستخدمها فوراً في الفلترة
            branchMappingsMap.set(mapping.id, mapping.data);
        }

        // 3. فلترة الشيت وإعداد الأوردرات
        const ordersToUpload = [];
        
        currentSheetData.forEach(row => {
            const branch = row['Stock Moves/Destination Location']?.trim();
            const category = row['Stock Moves/Internal Type']?.trim();
            const branchId = branch?.replace(/[\/\.#$\[\]]/g, '_');

            // لو الكاتيجوري مستبعد، نتجاهل الصف
            if (excludedCategories.includes(category)) return;

            // لو الفرع متجاهل، نتجاهل الصف
            const mapping = branchMappingsMap.get(branchId);
            if (!mapping || mapping.ignored) return;

            // تجهيز الأوردر وربطه بالعربية
            ordersToUpload.push({
                productName: row['Stock Moves/Product/Name'] || "بدون اسم",
                productId: row['Stock Moves/Product/Internal Reference'] || "",
                barcode: row['Stock Moves/Product/Breadfast Barcode'] || "",
                quantity: row['Stock Moves/Quantity'] || 1,
                category: category || "",
                orderRef: row['Stock Moves/Reference'] || "",
                branch: branch,
                car: mapping.car, // <-- هنا السر: ربطنا الأوردر بالعربية المخصصة للفرع
                status: "Draft",
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        });

        // 4. رفع الأوردرات بنظام الباتشات للسرعة
        let batch = writeBatch(db);
        let count = 0;
        let totalUploaded = 0;

        for (const order of ordersToUpload) {
            // تجاهل لو مفيش باركود
            if(!order.barcode) continue; 
            
            const newOrderRef = doc(ordersRef);
            batch.set(newOrderRef, order);
            count++;
            totalUploaded++;

            if (count === 400) {
                await batch.commit();
                batch = writeBatch(db);
                count = 0;
            }
        }
        if (count > 0) await batch.commit(); // رفع المتبقي

        showToast(`تم توزيع ورفع ${totalUploaded} منتج بنجاح!`, "success");
        getElement("sheetMappingWizard").classList.add("hidden");
        getElement("uploadPromptContainer").classList.remove("hidden");
        currentSheetData = [];

    } catch (error) {
        console.error(error);
        showToast("حدث خطأ أثناء رفع وتوزيع الأوردرات");
    } finally {
        setBusy(btn, false);
    }
});


// --------------------------------------------------
// 4. إدارة الأوردرات المعلقة (البحث والمتابعة)
// --------------------------------------------------
onSnapshot(ordersRef, (snapshot) => {
    allOrders = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        if(data.barcode && data.productName) barcodeToProductMap.set(data.barcode.trim(), data.productName);
        return { id: docSnap.id, ...data };
    });
    allOrders.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    renderOrders();
});

function statusClasses(status) {
    const classes = { Draft: "bg-gray-700 text-gray-300", Ready: "bg-blue-900/30 text-blue-400 border-blue-700", Done: "bg-green-900/30 text-green-400 border-green-700", Rejected: "bg-red-900/30 text-red-400 border-red-700" };
    return classes[status] || classes.Draft;
}
function statusLabel(status) {
    const labels = { Draft: "مسودة", Ready: "جاهز", Done: "تم التسليم", Rejected: "مرفوض" };
    return labels[status] || status;
}

function renderOrders() {
    const container = getElement("adminOrdersContainer");
    if (!container) return;
    
    const search = getElement("adminOrderSearch")?.value.trim().toLowerCase() || "";
    const filter = getElement("adminOrderFilter")?.value || "all";
    let readyCount = 0, doneTodayCount = 0;
    const today = new Date().toDateString();

    const filtered = allOrders.filter((order) => {
        const status = order.status || "Draft";
        const product = String(order.productName || "").toLowerCase();
        const barcode = String(order.barcode || "").toLowerCase();
        const carOrHrid = String(order.car || order.hrid || "").toLowerCase();
        
        if (status === 'Ready') readyCount++;
        if (status === 'Done') {
            const orderDate = order.updatedAt?.toDate ? order.updatedAt.toDate().toDateString() : null;
            if(orderDate === today) doneTodayCount++;
        }
        const matchSearch = !search || `${product} ${barcode} ${carOrHrid}`.includes(search);
        return matchSearch && (filter === "all" || status === filter);
    });

    if(getElement("stat-ready-orders")) getElement("stat-ready-orders").textContent = readyCount;
    if(getElement("stat-done-orders")) getElement("stat-done-orders").textContent = doneTodayCount;

    container.innerHTML = "";
    if (filtered.length === 0) return container.innerHTML = '<div class="text-center text-gray-500 py-8">لا توجد أوردرات.</div>';

    filtered.forEach((order) => {
        const status = order.status || "Draft";
        const div = document.createElement("div");
        div.className = "bg-gray-800 p-4 rounded-lg border border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-gray-700/50";
        div.innerHTML = `
            <div class="min-w-0 flex-1">
                <div class="font-bold text-lg break-words text-white">${escapeHtml(order.productName)} 
                    <span class="text-xs bg-yellow-900/50 text-yellow-300 px-2 py-1 rounded inline-block mt-1 mr-2"><i class="fas fa-truck text-xs"></i> ${escapeHtml(order.car || 'يدوي')}</span>
                    ${order.quantity > 1 ? `<span class="text-xs bg-blue-900/50 text-blue-300 px-2 py-1 rounded">كمية: ${order.quantity}</span>` : ''}
                </div>
                <div class="text-sm text-gray-400 mt-1 flex gap-3">
                    <span dir="ltr"><i class="fas fa-barcode"></i> ${escapeHtml(order.barcode)}</span>
                    ${order.branch ? `<span class="text-green-400"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(order.branch)}</span>` : ''}
                </div>
            </div>
            <div class="flex flex-col md:flex-row items-center gap-2">
                <span class="text-xs px-3 py-1.5 rounded border ${statusClasses(status)} font-bold text-center">${statusLabel(status)}</span>
                <select data-order-status="${escapeHtml(order.id)}" class="bg-gray-900 border border-gray-600 text-white text-sm rounded-lg p-2 outline-none focus:border-blue-500">
                    ${["Draft", "Ready", "Done", "Rejected"].map((v) => `<option value="${v}" ${status === v ? "selected" : ""}>${statusLabel(v)}</option>`).join("")}
                </select>
            </div>
        `;
        div.querySelector("[data-order-status]").addEventListener("change", (e) => updateOrderStatus(order.id, e.target.value));
        container.appendChild(div);
    });
}

async function updateOrderStatus(orderId, newStatus) {
    try { await updateDoc(doc(db, "orders", orderId), { status: newStatus, updatedAt: serverTimestamp() }); showToast("تم التحديث", "success"); }
    catch (e) { showToast("تعذر التحديث"); }
}

// --------------------------------------------------
// 5. الإشعارات وخروج الجميع
// --------------------------------------------------
window.sendNotification = async () => {
    const type = getElement("notificationTargetType").value;
    let target = type === 'rep' ? getElement("targetRepValue").value : 
                 type === 'team' ? getElement("targetTeamValue").value : 
                 type === 'car' ? getElement("targetCarValue").value : "";
    const msg = getElement("globalNotificationText").value.trim();
    if (!msg || (type !== 'all' && !target)) return showToast("أكمل البيانات");
    const btn = document.querySelector('[onclick="sendNotification()"]');
    setBusy(btn, true, "إرسال...");
    try {
        await addDoc(notificationsRef, { message: msg, type, target, timestamp: serverTimestamp(), readBy: [] });
        if(type==='all') await setDoc(systemRef, { globalMessage: msg, messageTime: Date.now() }, { merge: true });
        getElement("globalNotificationText").value = ""; showToast("تم الإرسال", "success");
    } catch(e) { showToast("خطأ"); } finally { setBusy(btn, false); }
};

window.forceLogoutAll = async () => {
    try { await setDoc(systemRef, { forceLogoutTrigger: Date.now() }, { merge: true }); showToast("تم التنفيذ", "success"); }
    catch(e) { showToast("خطأ"); }
};

// فلاتر الأوردرات اليدوية والمعلقة
getElement("adminOrderSearch")?.addEventListener("input", renderOrders);
getElement("adminOrderFilter")?.addEventListener("change", renderOrders);
getElement("toggleEmployeeFormBtn")?.addEventListener("click", () => getElement("employeeFormPanel")?.classList.toggle("hidden"));

window.updateOrderStatus = updateOrderStatus;
