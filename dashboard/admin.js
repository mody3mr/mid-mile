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
    updateDoc
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
const systemRef = doc(db, "system", "controls");
const notificationsRef = collection(db, "notifications");

let allOrders = [];
let barcodeToProductMap = new Map(); 

// --------------------------------------------------
// دوال مساعدة
// --------------------------------------------------
function getElement(id) { return document.getElementById(id); }

function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
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
// 1. إدارة الفرق (Teams)
// --------------------------------------------------
getElement("teamForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameInput = getElement("newTeamName");
    const name = nameInput.value.trim();
    if (!name) return showToast("برجاء إدخال اسم التيم");
    
    const btn = e.target.querySelector('button');
    setBusy(btn, true, "إضافة...");
    try {
        await addDoc(teamsRef, { name, createdAt: serverTimestamp() });
        nameInput.value = "";
        showToast("تم إضافة التيم بنجاح", "success");
    } catch (error) {
        showToast("تعذر إضافة التيم");
    } finally { setBusy(btn, false); }
});

onSnapshot(teamsRef, (snapshot) => {
    const tbody = getElement("teamsTableBody");
    const empTeamSelect = getElement("newEmpTeam");
    const notifTeamSelect = getElement("targetTeamValue");
    
    if (tbody) tbody.innerHTML = "";
    let optionsHtml = '<option value="">اختر التيم...</option>';

    if (snapshot.empty) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-gray-500">لا يوجد فرق مسجلة.</td></tr>';
    } else {
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const teamName = escapeHtml(data.name);
            optionsHtml += `<option value="${teamName}">${teamName}</option>`;
            
            if (tbody) {
                const tr = document.createElement("tr");
                tr.className = "hover:bg-gray-700/50 transition";
                tr.innerHTML = `
                    <td class="p-4">${teamName}</td>
                    <td class="p-4 text-xs text-gray-400">${formatDate(data.createdAt)}</td>
                    <td class="p-4 text-center">
                        <button type="button" onclick="deleteTeam('${docSnap.id}', '${teamName}')" class="text-xs bg-red-900/50 text-red-400 hover:bg-red-600 hover:text-white px-2 py-1 rounded border border-red-800 transition"><i class="fas fa-trash"></i> حذف</button>
                    </td>
                `;
                tbody.appendChild(tr);
            }
        });
    }
    if(empTeamSelect) empTeamSelect.innerHTML = optionsHtml;
    if(notifTeamSelect) notifTeamSelect.innerHTML = optionsHtml;
});

window.deleteTeam = function(id, name) {
    window.UI.openModal(
        "تأكيد الحذف",
        `هل أنت متأكد من حذف التيم: <span class="font-bold text-red-400">${name}</span>؟`,
        "حذف التيم",
        "bg-red-600 hover:bg-red-700",
        async () => {
            try {
                await deleteDoc(doc(db, "teams", id));
                showToast("تم حذف التيم", "success");
            } catch (e) { showToast("تعذر حذف التيم"); }
        }
    );
};

// --------------------------------------------------
// 2. إدارة الشاحنات (Cars)
// --------------------------------------------------
getElement("truckForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameInput = getElement("newTruckName");
    const name = nameInput.value.trim();
    if (!name) return showToast("برجاء إدخال بيانات العربية");
    
    const btn = e.target.querySelector('button');
    setBusy(btn, true, "إضافة...");
    try {
        await addDoc(trucksRef, { name, createdAt: serverTimestamp() });
        nameInput.value = "";
        showToast("تم إضافة العربية بنجاح", "success");
    } catch (error) {
        showToast("تعذر إضافة العربية");
    } finally { setBusy(btn, false); }
});

onSnapshot(trucksRef, (snapshot) => {
    const tbody = getElement("trucksTableBody");
    const notifCarSelect = getElement("targetCarValue");
    
    if (tbody) tbody.innerHTML = "";
    let optionsHtml = '<option value="">اختر العربية...</option>';

    if (snapshot.empty) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-gray-500">لا توجد شاحنات مسجلة.</td></tr>';
    } else {
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const truckName = escapeHtml(data.name);
            optionsHtml += `<option value="${truckName}">${truckName}</option>`;
            
            if (tbody) {
                const tr = document.createElement("tr");
                tr.className = "hover:bg-gray-700/50 transition";
                tr.innerHTML = `
                    <td class="p-4">${truckName}</td>
                    <td class="p-4 text-xs text-gray-400">${formatDate(data.createdAt)}</td>
                    <td class="p-4 text-center">
                        <button type="button" onclick="deleteTruck('${docSnap.id}', '${truckName}')" class="text-xs bg-red-900/50 text-red-400 hover:bg-red-600 hover:text-white px-2 py-1 rounded border border-red-800 transition"><i class="fas fa-trash"></i> حذف</button>
                    </td>
                `;
                tbody.appendChild(tr);
            }
        });
    }
    if(notifCarSelect) notifCarSelect.innerHTML = optionsHtml;
});

window.deleteTruck = function(id, name) {
    window.UI.openModal(
        "تأكيد الحذف",
        `هل أنت متأكد من حذف العربية: <span class="font-bold text-red-400">${name}</span>؟`,
        "حذف العربية",
        "bg-red-600 hover:bg-red-700",
        async () => {
            try {
                await deleteDoc(doc(db, "trucks", id));
                showToast("تم حذف العربية", "success");
            } catch (e) { showToast("تعذر حذف العربية"); }
        }
    );
};

// --------------------------------------------------
// 3. إدارة المناديب
// --------------------------------------------------
onSnapshot(usersRef, (snapshot) => {
    const tbody = getElement("employeesTableBody");
    const repsDataList = getElement("repsDataList"); // الـ Datalist الخاصة بالبحث
    
    if (tbody) tbody.innerHTML = "";
    if (repsDataList) repsDataList.innerHTML = "";

    if (snapshot.empty) {
        if(tbody) tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-gray-500">لا يوجد مناديب مسجلين.</td></tr>';
        getElement("stat-total-reps").textContent = "0";
        return;
    }

    let totalReps = 0;
    const rows = [];
    
    snapshot.forEach((docSnap) => {
        const user = docSnap.data();
        const hrid = docSnap.id;
        totalReps++;

        // تحديث البحث الذكي للمناديب
        if (repsDataList) {
            const option = document.createElement('option');
            option.value = hrid;
            option.text = user.name || "بدون اسم";
            repsDataList.appendChild(option);
        }

        if (!tbody) return;
        const tr = document.createElement("tr");
        tr.className = "hover:bg-gray-700/50 transition";
        const isSuspended = user.status === 'suspended';

        tr.innerHTML = `
            <td class="p-4">${escapeHtml(user.name)}</td>
            <td class="p-4 font-bold text-blue-400" dir="ltr">${escapeHtml(hrid)}</td>
            <td class="p-4" dir="ltr">${escapeHtml(user.mobile)}</td>
            <td class="p-4 text-blue-300 font-bold">${escapeHtml(user.team)}</td>
            <td class="p-4 text-xs text-gray-400">${formatDate(user.createdAt) || 'غير متوفر'}</td>
            <td class="p-4 tracking-widest text-center" dir="ltr">${user.pinCode ? escapeHtml(user.pinCode) : '<span class="text-gray-500 text-xs">لم يتم</span>'}</td>
            <td class="p-4">
                <div class="flex items-center justify-center gap-2">
                    <button type="button" onclick="resetPin('${hrid}')" class="text-xs bg-red-900/50 text-red-400 hover:bg-red-600 hover:text-white px-2 py-1 rounded border border-red-800 transition" title="تصفير الـ PIN"><i class="fas fa-key"></i></button>
                    <button type="button" onclick="openEditEmployeeModal('${hrid}', '${escapeHtml(user.name)}', '${escapeHtml(user.mobile)}', '${escapeHtml(user.team)}')" class="text-xs bg-blue-900/50 text-blue-400 hover:bg-blue-600 hover:text-white px-2 py-1 rounded border border-blue-800 transition" title="تعديل البيانات"><i class="fas fa-edit"></i></button>
                    <button type="button" onclick="toggleEmployeeStatus('${hrid}', '${user.status || 'active'}')" class="text-xs ${isSuspended ? 'bg-green-900/50 text-green-400 border-green-800 hover:bg-green-600' : 'bg-orange-900/50 text-orange-400 border-orange-800 hover:bg-orange-600'} hover:text-white px-2 py-1 rounded border transition" title="${isSuspended ? 'تفعيل المندوب' : 'تعطيل المندوب'}">
                        <i class="fas ${isSuspended ? 'fa-user-check' : 'fa-user-slash'}"></i>
                    </button>
                </div>
            </td>
        `;
        rows.push(tr);
    });

    if(tbody) rows.forEach((row) => tbody.appendChild(row));
    if(getElement("stat-total-reps")) getElement("stat-total-reps").textContent = totalReps;
});

getElement("employeeForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = getElement("newEmpName").value.trim();
    const hrid = getElement("newEmpHrid").value.trim();
    const mobile = getElement("newEmpMobile").value.trim();
    const team = getElement("newEmpTeam").value; // من الدروب داون

    if (!name || !hrid || !mobile || !team) return showToast("برجاء ملء جميع بيانات المندوب");
    if (/\s/.test(hrid)) return showToast("الـ HRID لا يجب أن يحتوي على مسافات");

    const btn = e.target.querySelector('button');
    setBusy(btn, true, "جاري الحفظ...");
    try {
        const existing = await getDoc(doc(db, "users", hrid));
        if (existing.exists()) return showToast("هذا الـ HRID موجود بالفعل");
        
        await setDoc(doc(db, "users", hrid), {
            name, mobile, team, status: "active", pinCode: null,
            createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        });
        
        getElement("employeeForm").reset();
        getElement("employeeFormPanel")?.classList.add("hidden");
        showToast("تم إضافة المندوب بنجاح", "success");
    } catch (error) { showToast("تعذر إضافة المندوب."); } 
    finally { setBusy(btn, false); }
});

window.openEditEmployeeModal = function(hrid, name, mobile, team) {
    const html = `
        <div class="space-y-3">
            <input type="text" id="editModalName" value="${name}" class="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white outline-none focus:border-blue-500" placeholder="اسم المندوب">
            <input type="text" id="editModalMobile" value="${mobile}" class="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white outline-none focus:border-blue-500" placeholder="رقم الموبايل">
            <p class="text-xs text-gray-400 mt-2">التيم الحالي: ${team} (للتعديل اكتب اسم التيم الجديد)</p>
            <input type="text" id="editModalTeam" value="${team}" class="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white outline-none focus:border-blue-500" placeholder="التيم">
        </div>
    `;
    window.UI.openModal("تعديل بيانات المندوب", html, "حفظ التعديلات", "bg-blue-600 hover:bg-blue-700", async () => {
        const nName = getElement("editModalName").value.trim();
        const nMobile = getElement("editModalMobile").value.trim();
        const nTeam = getElement("editModalTeam").value.trim();
        try {
            await updateDoc(doc(db, "users", hrid), { name: nName, mobile: nMobile, team: nTeam, updatedAt: serverTimestamp() });
            showToast("تم تعديل البيانات بنجاح", "success");
        } catch(e) { showToast("تعذر التعديل"); }
    });
};

window.toggleEmployeeStatus = function(hrid, currentStatus) {
    const newStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
    const actionText = newStatus === 'suspended' ? 'تعطيل' : 'تفعيل';
    const color = newStatus === 'suspended' ? 'bg-orange-600' : 'bg-green-600';
    
    window.UI.openModal(
        `تأكيد ${actionText} المندوب`,
        `هل أنت متأكد من ${actionText} حساب المندوب صاحب المعرف: <span class="font-bold">${hrid}</span>؟`,
        actionText,
        color,
        async () => {
            try {
                await updateDoc(doc(db, "users", hrid), { status: newStatus, updatedAt: serverTimestamp() });
                showToast(`تم ${actionText} المندوب بنجاح`, "success");
            } catch (e) { showToast(`تعذر ${actionText} المندوب`); }
        }
    );
};

window.resetPin = function(hrid) {
    window.UI.openModal(
        "تأكيد تصفير الـ PIN",
        `هل أنت متأكد من مسح الرقم السري (PIN) للمندوب صاحب المعرف: <span class="font-bold text-blue-400">${hrid}</span>؟ (سيُطلب منه إنشاء رقم جديد عند الدخول).`,
        "تصفير الرقم",
        "bg-red-600 hover:bg-red-700",
        async () => {
            try {
                await updateDoc(doc(db, "users", hrid), { pinCode: null, updatedAt: serverTimestamp() });
                showToast("تم تصفير الرقم السري", "success");
            } catch (e) { showToast("تعذر التصفير"); }
        }
    );
};


// --------------------------------------------------
// 4. إدارة الأوردرات
// --------------------------------------------------
function statusClasses(status) {
    const classes = { Draft: "bg-gray-700 text-gray-300", Ready: "bg-blue-900/30 text-blue-400 border-blue-700", Done: "bg-green-900/30 text-green-400 border-green-700", Rejected: "bg-red-900/30 text-red-400 border-red-700" };
    return classes[status] || classes.Draft;
}

function statusLabel(status) {
    const labels = { Draft: "مسودة", Ready: "جاهز", Done: "تم التسليم", Rejected: "مرفوض" };
    return labels[status] || status;
}

onSnapshot(ordersRef, (snapshot) => {
    allOrders = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        if(data.barcode && data.productName) barcodeToProductMap.set(data.barcode.trim(), data.productName);
        return { id: docSnap.id, ...data };
    });
    
    allOrders.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    renderOrders();
});

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
        const hrid = String(order.hrid || "").toLowerCase();
        
        if (status === 'Ready') readyCount++;
        if (status === 'Done') {
            const orderDate = order.updatedAt?.toDate ? order.updatedAt.toDate().toDateString() : null;
            if(orderDate === today) doneTodayCount++;
        }

        const matchSearch = !search || `${product} ${barcode} ${hrid}`.includes(search);
        const matchFilter = filter === "all" || status === filter;
        return matchSearch && matchFilter;
    });

    if(getElement("stat-ready-orders")) getElement("stat-ready-orders").textContent = readyCount;
    if(getElement("stat-done-orders")) getElement("stat-done-orders").textContent = doneTodayCount;

    container.innerHTML = "";
    if (filtered.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-500 py-8">لا توجد أوردرات مطابقة.</div>';
        return;
    }

    filtered.forEach((order) => {
        const status = order.status || "Draft";
        const div = document.createElement("div");
        div.className = "bg-gray-800 p-4 rounded-lg border border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition hover:bg-gray-700/50";
        div.innerHTML = `
            <div class="min-w-0 flex-1">
                <div class="font-bold text-lg break-words text-white">${escapeHtml(order.productName || "بدون اسم")} 
                    <span class="text-xs bg-blue-900 text-blue-300 px-2 py-1 rounded inline-block mt-1 mr-2" dir="ltr">HRID: ${escapeHtml(order.hrid)}</span>
                </div>
                <div class="text-sm text-gray-400 mt-1 flex gap-3">
                    <span dir="ltr"><i class="fas fa-barcode ml-1 text-gray-500"></i> ${escapeHtml(order.barcode)}</span>
                    ${order.notes ? `<span class="text-yellow-500"><i class="fas fa-sticky-note ml-1"></i>${escapeHtml(order.notes)}</span>` : ''}
                </div>
            </div>
            <div class="flex flex-col md:flex-row items-center gap-2 w-full md:w-auto">
                <span class="text-xs px-3 py-1.5 rounded border ${statusClasses(status)} font-bold w-full md:w-auto text-center">${statusLabel(status)}</span>
                <select data-order-status="${escapeHtml(order.id)}" class="w-full md:w-auto bg-gray-900 border border-gray-600 text-white text-sm rounded-lg p-2 outline-none focus:border-blue-500">
                    ${["Draft", "Ready", "Done", "Rejected"].map((v) => `<option value="${v}" ${status === v ? "selected" : ""}>${statusLabel(v)}</option>`).join("")}
                </select>
            </div>
        `;
        div.querySelector("[data-order-status]").addEventListener("change", (e) => updateOrderStatus(order.id, e.target.value));
        container.appendChild(div);
    });
}

// ميزة الإكمال التلقائي للباركود
const barcodeInput = getElement("newOrderBarcode");
const productInput = getElement("newOrderProduct");
if (barcodeInput && productInput) {
    barcodeInput.addEventListener("input", (e) => {
        const code = e.target.value.trim();
        if (barcodeToProductMap.has(code)) {
            productInput.value = barcodeToProductMap.get(code);
            productInput.classList.replace("text-gray-300", "text-white");
        } else {
            productInput.value = "";
            productInput.classList.replace("text-white", "text-gray-300");
        }
    });
}

async function saveDraftOrder(barcode, productName, hrid, notes) {
    try {
        await addDoc(ordersRef, { productName, barcode, hrid, notes: notes || "", status: "Draft", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        barcodeInput.value = ""; productInput.value = ""; getElement("newOrderHrid").value = ""; getElement("newOrderNotes").value = "";
        showToast("تم إنشاء الأوردر كمسودة بنجاح", "success");
    } catch (e) { showToast("تعذر إنشاء الأوردر"); }
}

getElement("orderForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const barcode = barcodeInput.value.trim();
    let product = productInput.value.trim();
    const hrid = getElement("newOrderHrid").value.trim();
    const notes = getElement("newOrderNotes").value.trim();

    if (!barcode || !hrid) return showToast("الباركود والـ HRID مطلوبين");

    if (!product && barcodeToProductMap.has(barcode)) product = barcodeToProductMap.get(barcode);
    
    // استخدام المودال في حالة إن المنتج جديد ومش متسجل
    if (!product) {
        const html = `
            <p class="mb-3 text-sm text-gray-300">هذا الباركود غير مسجل مسبقاً، برجاء كتابة اسم المنتج ليتم حفظه في النظام:</p>
            <input type="text" id="modalProductName" class="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white outline-none focus:border-blue-500" placeholder="اسم المنتج هنا...">
        `;
        window.UI.openModal("منتج جديد", html, "حفظ الأوردر", "bg-green-600 hover:bg-green-700", async () => {
            const modalProd = getElement("modalProductName").value.trim();
            if(!modalProd) return showToast("يجب إدخال اسم المنتج");
            await saveDraftOrder(barcode, modalProd, hrid, notes);
        });
    } else {
        saveDraftOrder(barcode, product, hrid, notes);
    }
});

async function updateOrderStatus(orderId, newStatus) {
    try {
        await updateDoc(doc(db, "orders", orderId), { status: newStatus, updatedAt: serverTimestamp() });
        showToast("تم التحديث", "success");
    } catch (error) { showToast("تعذر التحديث"); }
}

// --------------------------------------------------
// 5. الإشعارات والتحكم
// --------------------------------------------------
window.sendNotification = async function() {
    const type = getElement("notificationTargetType").value;
    let targetValue = "";
    
    if (type === 'rep') targetValue = getElement("targetRepValue").value.trim();
    else if (type === 'team') targetValue = getElement("targetTeamValue").value;
    else if (type === 'car') targetValue = getElement("targetCarValue").value;

    const text = getElement("globalNotificationText").value.trim();

    if (!text) return showToast("اكتب نص الإشعار أولاً");
    if (type !== 'all' && !targetValue) return showToast("برجاء تحديد المستهدف من القائمة");

    const button = document.querySelector('[onclick="sendNotification()"]');
    setBusy(button, true, "إرسال...");

    try {
        await addDoc(notificationsRef, { message: text, type, target: targetValue, timestamp: serverTimestamp(), readBy: [] });
        if(type === 'all') { // توافق مع الأجهزة القديمة
            await setDoc(systemRef, { globalMessage: text, messageTime: Date.now() }, { merge: true });
        }
        getElement("globalNotificationText").value = "";
        showToast("تم إرسال الإشعار بنجاح", "success");
    } catch (e) { showToast("تعذر الإرسال"); } 
    finally { setBusy(button, false); }
};

window.forceLogoutAll = async function() {
    try {
        await setDoc(systemRef, { forceLogoutTrigger: Date.now() }, { merge: true });
        showToast("تم إرسال أمر تسجيل الخروج بنجاح", "success");
    } catch (error) { showToast("تعذر إرسال الأمر"); }
};

// فلاتر الأوردرات
getElement("adminOrderSearch")?.addEventListener("input", renderOrders);
getElement("adminOrderFilter")?.addEventListener("change", renderOrders);
getElement("toggleEmployeeFormBtn")?.addEventListener("click", () => getElement("employeeFormPanel")?.classList.toggle("hidden"));

// جعل الدوال متاحة للـ HTML
window.updateOrderStatus = updateOrderStatus;
