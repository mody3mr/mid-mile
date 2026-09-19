import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    addDoc,
    collection,
    doc,
    getFirestore,
    getDoc,
    onSnapshot,
    serverTimestamp,
    setDoc,
    updateDoc,
    writeBatch,
    query,
    where
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
const usersRef = collection(db, "users");
const ordersRef = collection(db, "orders");
const systemRef = doc(db, "system", "controls");
const notificationsRef = collection(db, "notifications");

let allOrders = [];
let allUsers = [];
let barcodeToProductMap = new Map(); // خريطة لتخزين الباركود واسم المنتج المقابل للبحث السريع

// دوال مساعدة
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
    }, 3200);
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
// 1. إدارة الموظفين (المناديب)
// --------------------------------------------------

function renderEmployees(snapshot) {
    const tbody = getElement("employeesTableBody");
    const dataList = getElement("repsDataList");
    
    if (tbody) tbody.innerHTML = "";
    if (dataList) dataList.innerHTML = "";
    allUsers = [];

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
        allUsers.push({ id: hrid, ...user });
        totalReps++;

        // تحديث قائمة البحث المنسدلة للأوردرات
        if (dataList) {
            const option = document.createElement('option');
            option.value = hrid;
            option.text = user.name || "بدون اسم";
            dataList.appendChild(option);
        }

        if (!tbody) return;
        
        const tr = document.createElement("tr");
        tr.className = "hover:bg-gray-700/50 transition";
        const isSuspended = user.status === 'suspended';
        const creationDate = formatDate(user.createdAt) || 'غير متوفر';

        tr.innerHTML = `
            <td class="p-4">${escapeHtml(user.name || "---")}</td>
            <td class="p-4 font-bold text-blue-400" dir="ltr">${escapeHtml(hrid)}</td>
            <td class="p-4" dir="ltr">${escapeHtml(user.mobile || "---")}</td>
            <td class="p-4">${escapeHtml(user.team || "---")}</td>
            <td class="p-4 text-xs text-gray-400">${escapeHtml(creationDate)}</td>
            <td class="p-4 tracking-widest text-center" dir="ltr">${user.pinCode ? escapeHtml(user.pinCode) : '<span class="text-gray-500 text-xs">لم يتم</span>'}</td>
            <td class="p-4">
                <div class="flex items-center justify-center gap-2">
                    <button type="button" data-reset-pin="${escapeHtml(hrid)}" class="text-xs bg-red-900/50 text-red-400 hover:bg-red-600 hover:text-white px-2 py-1 rounded border border-red-800 transition" title="تصفير الـ PIN"><i class="fas fa-key"></i></button>
                    <button type="button" data-edit-emp="${escapeHtml(hrid)}" class="text-xs bg-blue-900/50 text-blue-400 hover:bg-blue-600 hover:text-white px-2 py-1 rounded border border-blue-800 transition" title="تعديل البيانات"><i class="fas fa-edit"></i></button>
                    <button type="button" data-toggle-status="${escapeHtml(hrid)}" data-current-status="${escapeHtml(user.status || 'active')}" class="text-xs ${isSuspended ? 'bg-green-900/50 text-green-400 border-green-800 hover:bg-green-600' : 'bg-orange-900/50 text-orange-400 border-orange-800 hover:bg-orange-600'} hover:text-white px-2 py-1 rounded border transition" title="${isSuspended ? 'تفعيل المندوب' : 'تعطيل المندوب'}">
                        <i class="fas ${isSuspended ? 'fa-user-check' : 'fa-user-slash'}"></i>
                    </button>
                </div>
            </td>
        `;

        tr.querySelector("[data-reset-pin]").addEventListener("click", () => resetPin(hrid));
        tr.querySelector("[data-edit-emp]").addEventListener("click", () => editEmployee(hrid, user.name, user.mobile, user.team));
        tr.querySelector("[data-toggle-status]").addEventListener("click", (e) => toggleEmployeeStatus(hrid, e.currentTarget.dataset.currentStatus));
        rows.push(tr);
    });

    if(tbody) rows.forEach((row) => tbody.appendChild(row));
    const statsEl = getElement("stat-total-reps");
    if(statsEl) statsEl.textContent = totalReps;
}

onSnapshot(usersRef, renderEmployees, (error) => {
    console.error(error);
    const tbody = getElement("employeesTableBody");
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-red-400">تعذر تحميل المناديب. تحقق من الاتصال.</td></tr>';
});

async function addEmployee() {
    const nameInput = getElement("newEmpName");
    const hridInput = getElement("newEmpHrid");
    const mobileInput = getElement("newEmpMobile");
    const teamInput = getElement("newEmpTeam");

    const name = nameInput?.value.trim();
    const hrid = hridInput?.value.trim();
    const mobile = mobileInput?.value.trim();
    const team = teamInput?.value.trim();

    if (!name || !hrid || !mobile || !team) return showToast("برجاء ملء جميع بيانات المندوب");
    if (/\s/.test(hrid)) return showToast("الـ HRID لا يجب أن يحتوي على مسافات");

    const button = getElement("employeeForm")?.querySelector('button[type="submit"]');
    setBusy(button, true, "جاري الحفظ...");
    try {
        const existing = await getDoc(doc(db, "users", hrid));
        if (existing.exists()) {
            showToast("هذا الـ HRID موجود بالفعل");
            return;
        }
        await setDoc(doc(db, "users", hrid), {
            name, mobile, team,
            status: "active",
            pinCode: null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        nameInput.value = ""; hridInput.value = ""; mobileInput.value = ""; teamInput.value = "";
        getElement("employeeFormPanel")?.classList.add("hidden");
        showToast("تم إضافة المندوب بنجاح", "success");
    } catch (error) {
        showToast("تعذر إضافة المندوب.");
    } finally {
        setBusy(button, false);
    }
}

async function editEmployee(hrid, currentName, currentMobile, currentTeam) {
    const newName = prompt("تعديل اسم المندوب:", currentName || "");
    if (newName === null) return;
    const newMobile = prompt("تعديل رقم الموبايل:", currentMobile || "");
    if (newMobile === null) return;
    const newTeam = prompt("تعديل التيم:", currentTeam || "");
    if (newTeam === null) return;

    try {
        await updateDoc(doc(db, "users", hrid), {
            name: newName.trim(), mobile: newMobile.trim(), team: newTeam.trim(), updatedAt: serverTimestamp()
        });
        showToast("تم تعديل البيانات بنجاح", "success");
    } catch (error) {
        showToast("تعذر تعديل البيانات");
    }
}

async function toggleEmployeeStatus(hrid, currentStatus) {
    const newStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
    const actionText = newStatus === 'suspended' ? 'تعطيل' : 'تفعيل';
    if (!window.confirm(`هل أنت متأكد من ${actionText} المندوب ${hrid}؟`)) return;
    
    try {
        await updateDoc(doc(db, "users", hrid), { status: newStatus, updatedAt: serverTimestamp() });
        showToast(`تم ${actionText} المندوب بنجاح`, "success");
    } catch (error) {
        showToast(`تعذر ${actionText} المندوب`);
    }
}

async function resetPin(hrid) {
    if (!window.confirm(`هل أنت متأكد من تصفير الـ PIN للمندوب ${hrid}؟`)) return;
    try {
        await updateDoc(doc(db, "users", hrid), { pinCode: null, updatedAt: serverTimestamp() });
        showToast("تم تصفير الرقم السري", "success");
    } catch (error) {
        showToast("تعذر تصفير الرقم السري");
    }
}


// --------------------------------------------------
// 2. إدارة الأوردرات (المنتجات)
// --------------------------------------------------

function normalizeStatus(status) {
    const value = String(status || "Draft").trim().toLowerCase();
    const aliases = { draft: "Draft", ready: "Ready", done: "Done", delivered: "Done", rejected: "Rejected" };
    return aliases[value] || "Draft";
}

function statusLabel(status) {
    const labels = { Draft: "مسودة", Ready: "جاهز", Done: "تم التسليم", Rejected: "مرفوض" };
    return labels[status] || status;
}

function statusClasses(status) {
    const classes = {
        Draft: "bg-gray-700 text-gray-300 border-gray-600",
        Ready: "bg-blue-900/30 text-blue-400 border-blue-700/50",
        Done: "bg-green-900/30 text-green-400 border-green-700/50",
        Rejected: "bg-red-900/30 text-red-400 border-red-700/50"
    };
    return classes[status] || classes.Draft;
}

function renderOrders() {
    const container = getElement("adminOrdersContainer");
    if (!container) return;
    
    const search = getElement("adminOrderSearch")?.value.trim().toLowerCase() || "";
    const filter = getElement("adminOrderFilter")?.value || "all";
    
    let readyCount = 0;
    let doneTodayCount = 0;
    const today = new Date().toDateString();

    const filtered = allOrders.filter((order) => {
        const status = normalizeStatus(order.status);
        const product = String(order.productName || "").toLowerCase();
        const barcode = String(order.barcode || "").toLowerCase();
        const hrid = String(order.hrid || "").toLowerCase();
        
        // حساب الإحصائيات
        if (status === 'Ready') readyCount++;
        if (status === 'Done') {
            const orderDate = order.updatedAt?.toDate ? order.updatedAt.toDate().toDateString() : null;
            if(orderDate === today) doneTodayCount++;
        }

        const matchSearch = !search || `${product} ${barcode} ${hrid}`.includes(search);
        const matchFilter = filter === "all" || status === filter;
        return matchSearch && matchFilter;
    });

    // تحديث أرقام الإحصائيات
    if(getElement("stat-ready-orders")) getElement("stat-ready-orders").textContent = readyCount;
    if(getElement("stat-done-orders")) getElement("stat-done-orders").textContent = doneTodayCount;

    container.innerHTML = "";
    if (filtered.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-500 py-8">لا توجد أوردرات مطابقة.</div>';
        return;
    }

    filtered.forEach((order) => {
        const status = normalizeStatus(order.status);
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
                <div class="text-xs text-gray-500 mt-2">${formatDate(order.createdAt)}</div>
            </div>
            <div class="flex flex-col md:flex-row items-center gap-2 w-full md:w-auto">
                <span class="text-xs px-3 py-1.5 rounded border ${statusClasses(status)} font-bold w-full md:w-auto text-center">${statusLabel(status)}</span>
                <select data-order-status="${escapeHtml(order.id)}" class="w-full md:w-auto bg-gray-900 border border-gray-600 text-white text-sm rounded-lg p-2 focus:ring-blue-500 outline-none">
                    ${["Draft", "Ready", "Done", "Rejected"].map((value) => `<option value="${value}" ${status === value ? "selected" : ""}>${statusLabel(value)}</option>`).join("")}
                </select>
            </div>
        `;
        div.querySelector("[data-order-status]").addEventListener("change", (event) => updateOrderStatus(order.id, event.target.value));
        container.appendChild(div);
    });
}

onSnapshot(ordersRef, (snapshot) => {
    allOrders = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        // تحديث خريطة الباركود علشان ميزة الإكمال التلقائي
        if(data.barcode && data.productName) {
            barcodeToProductMap.set(data.barcode.trim(), data.productName);
        }
        return { id: docSnap.id, ...data };
    });
    
    allOrders.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || a.createdAt || 0;
        const bTime = b.createdAt?.toMillis?.() || b.createdAt || 0;
        return bTime - aTime;
    });
    
    renderOrders();
});

// ميزة الإكمال التلقائي لاسم المنتج بناءً على الباركود
const barcodeInput = getElement("newOrderBarcode");
const productInput = getElement("newOrderProduct");
if (barcodeInput && productInput) {
    barcodeInput.addEventListener("input", (e) => {
        const code = e.target.value.trim();
        if (barcodeToProductMap.has(code)) {
            productInput.value = barcodeToProductMap.get(code);
            productInput.classList.remove("text-gray-300");
            productInput.classList.add("text-white", "border-blue-500");
        } else {
            productInput.value = ""; // أو ممكن نخليه يكتبه يدوي بس بناءً على طلبك الباركود هو اللي بيجيب الاسم
            productInput.classList.add("text-gray-300");
            productInput.classList.remove("text-white", "border-blue-500");
        }
    });
}

async function createDraftOrder() {
    const barcode = barcodeInput?.value.trim();
    // لو المنتج ملوش اسم متسجل قبل كده، هنسمح للأدمن يكتبه أو ياخد اسم افتراضي مؤقتاً
    let product = productInput?.value.trim(); 
    if(!product && barcodeToProductMap.has(barcode)) product = barcodeToProductMap.get(barcode);
    if(!product) {
        product = prompt("المنتج غير مسجل مسبقاً، برجاء كتابة اسم المنتج ليتم حفظه:");
        if(!product) return showToast("يجب إدخال اسم المنتج");
    }

    const hrid = getElement("newOrderHrid")?.value.trim();
    const notes = getElement("newOrderNotes")?.value.trim();

    if (!barcode || !hrid) return showToast("الباركود والـ HRID مطلوبين");

    const button = getElement("orderForm")?.querySelector('button[type="submit"]');
    setBusy(button, true, "جاري الإنشاء...");
    
    try {
        await addDoc(ordersRef, { 
            productName: product, 
            barcode, 
            hrid, 
            notes: notes || "",
            status: "Draft", // مسودة للادارة فقط
            createdAt: serverTimestamp(), 
            updatedAt: serverTimestamp() 
        });
        
        barcodeInput.value = "";
        productInput.value = "";
        getElement("newOrderHrid").value = "";
        getElement("newOrderNotes").value = "";
        showToast("تم إنشاء الأوردر كمسودة بنجاح", "success");
    } catch (error) {
        showToast("تعذر إنشاء الأوردر");
    } finally {
        setBusy(button, false);
    }
}

async function updateOrderStatus(orderId, newStatus) {
    try {
        await updateDoc(doc(db, "orders", orderId), { 
            status: normalizeStatus(newStatus), 
            updatedAt: serverTimestamp() 
        });
        showToast("تم تحديث حالة الأوردر", "success");
    } catch (error) {
        showToast("تعذر تحديث حالة الأوردر");
    }
}


// --------------------------------------------------
// 3. الإشعارات والتحكم
// --------------------------------------------------

async function sendNotification() {
    const type = getElement("notificationTargetType").value;
    const targetValue = getElement("notificationTargetValue").value.trim();
    const text = getElement("globalNotificationText").value.trim();

    if (!text) return showToast("اكتب نص الإشعار أولاً");
    if (type !== 'all' && !targetValue) return showToast("برجاء تحديد المستهدف (الـ HRID أو التيم أو العربية)");

    const button = document.querySelector('[onclick="sendNotification()"]');
    setBusy(button, true, "جاري الإرسال...");

    try {
        // بناء كائن الإشعار
        const notificationData = {
            message: text,
            type: type, // 'all', 'rep', 'team', 'car'
            target: targetValue, // فارغ لو 'all'
            timestamp: serverTimestamp(),
            readBy: []
        };

        await addDoc(notificationsRef, notificationData);

        // لو كان إشعار عام للكل (للتوافق مع الكود القديم لو المناديب بتسمع من systemRef)
        if(type === 'all') {
            await setDoc(systemRef, { globalMessage: text, messageTime: Date.now() }, { merge: true });
        }

        getElement("globalNotificationText").value = "";
        getElement("notificationTargetValue").value = "";
        showToast("تم إرسال الإشعار بنجاح", "success");
    } catch (error) {
        showToast("تعذر إرسال الإشعار");
    } finally {
        setBusy(button, false);
    }
}

async function forceLogoutAll() {
    if (!window.confirm("تحذير: سيتم إخراج جميع المناديب من النظام فوراً! هل أنت متأكد؟")) return;
    const button = document.querySelector('[onclick="forceLogoutAll()"]');
    setBusy(button, true, "جاري التنفيذ...");
    try {
        await setDoc(systemRef, { forceLogoutTrigger: Date.now() }, { merge: true });
        showToast("تم إرسال أمر تسجيل الخروج لجميع الأجهزة", "success");
    } catch (error) {
        showToast("تعذر إرسال الأمر");
    } finally {
        setBusy(button, false);
    }
}

// --------------------------------------------------
// ربط الأحداث (Event Listeners)
// --------------------------------------------------
getElement("toggleEmployeeFormBtn")?.addEventListener("click", () => getElement("employeeFormPanel")?.classList.toggle("hidden"));
getElement("employeeForm")?.addEventListener("submit", (event) => { event.preventDefault(); addEmployee(); });
getElement("orderForm")?.addEventListener("submit", (event) => { event.preventDefault(); createDraftOrder(); });
getElement("adminOrderSearch")?.addEventListener("input", renderOrders);
getElement("adminOrderFilter")?.addEventListener("change", renderOrders);

// تصدير الدوال للـ Window لتعمل مع HTML onclick
window.addEmployee = addEmployee;
window.resetPin = resetPin;
window.createDraftOrder = createDraftOrder;
window.updateOrderStatus = updateOrderStatus;
window.sendNotification = sendNotification;
window.forceLogoutAll = forceLogoutAll;
window.editEmployee = editEmployee;
window.toggleEmployeeStatus = toggleEmployeeStatus;
