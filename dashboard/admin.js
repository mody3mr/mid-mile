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
    writeBatch
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

let allOrders = [];

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

function getValue(data, keys, fallback = "") {
    for (const key of keys) {
        if (data?.[key] !== undefined && data[key] !== null && String(data[key]).trim() !== "") {
            return data[key];
        }
    }
    return fallback;
}

function normalizeStatus(status) {
    const value = String(status || "Draft").trim().toLowerCase();
    const aliases = { draft: "Draft", waiting: "Waiting", ready: "Ready", done: "Done", delivered: "Done", rejected: "Rejected" };
    return aliases[value] || "Draft";
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

function statusLabel(status) {
    const labels = { Draft: "مسودة", Waiting: "انتظار", Ready: "جاهز", Done: "تم التسليم", Rejected: "مرفوض" };
    return labels[status] || status;
}

function statusClasses(status) {
    const classes = {
        Draft: "bg-gray-700 text-gray-300 border-gray-600",
        Waiting: "bg-yellow-900/30 text-yellow-400 border-yellow-700/50",
        Ready: "bg-blue-900/30 text-blue-400 border-blue-700/50",
        Done: "bg-green-900/30 text-green-400 border-green-700/50",
        Rejected: "bg-red-900/30 text-red-400 border-red-700/50"
    };
    return classes[status] || classes.Draft;
}

function renderEmployees(snapshot) {
    const tbody = getElement("employeesTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (snapshot.empty) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500">لا يوجد موظفين مسجلين.</td></tr>';
        return;
    }

    const rows = [];
    snapshot.forEach((docSnap) => {
        const user = docSnap.data();
        const tr = document.createElement("tr");
        tr.className = "hover:bg-gray-700/50 transition";
        tr.innerHTML = `
            <td class="p-4">${escapeHtml(user.name || "---")}</td>
            <td class="p-4 font-bold text-blue-400" dir="ltr">${escapeHtml(docSnap.id)}</td>
            <td class="p-4 tracking-widest" dir="ltr">${user.pinCode ? escapeHtml(user.pinCode) : '<span class="text-gray-500 text-xs">لم يتم الإنشاء</span>'}</td>
            <td class="p-4">
                <button type="button" data-reset-pin="${escapeHtml(docSnap.id)}" class="text-xs bg-red-900/50 text-red-400 hover:bg-red-600 hover:text-white px-2 py-1 rounded border border-red-800 transition">تصفير الـ PIN</button>
            </td>
        `;
        tr.querySelector("[data-reset-pin]").addEventListener("click", () => resetPin(docSnap.id));
        rows.push(tr);
    });
    rows.forEach((row) => tbody.appendChild(row));
}

onSnapshot(usersRef, renderEmployees, () => {
    const tbody = getElement("employeesTableBody");
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-red-400">تعذر تحميل الموظفين. تحقق من صلاحيات Firebase.</td></tr>';
});

async function addEmployee() {
    const nameInput = getElement("newEmpName");
    const hridInput = getElement("newEmpHrid");
    const name = nameInput?.value.trim();
    const hrid = hridInput?.value.trim();
    if (!name || !hrid) return showToast("اكتب اسم المندوب والـ HRID أولاً");
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
            name,
            pinCode: null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        nameInput.value = "";
        hridInput.value = "";
        getElement("employeeFormPanel")?.classList.add("hidden");
        showToast("تم إضافة المندوب بنجاح", "success");
    } catch (error) {
        console.error("Error adding employee:", error);
        showToast("تعذر إضافة المندوب. تحقق من صلاحيات Firebase");
    } finally {
        setBusy(button, false);
    }
}

async function resetPin(hrid) {
    if (!window.confirm(`هل أنت متأكد من تصفير الـ PIN للموظف ${hrid}؟`)) return;
    try {
        await updateDoc(doc(db, "users", hrid), { pinCode: null, updatedAt: serverTimestamp() });
        showToast("تم تصفير الرقم السري", "success");
    } catch (error) {
        console.error("Error resetting PIN:", error);
        showToast("تعذر تصفير الرقم السري");
    }
}

function renderOrders() {
    const container = getElement("adminOrdersContainer");
    if (!container) return;
    const search = getElement("adminOrderSearch")?.value.trim().toLowerCase() || "";
    const filter = getElement("adminOrderFilter")?.value || "all";
    const filtered = allOrders.filter((order) => {
        const status = normalizeStatus(order.status);
        const product = String(getValue(order, ["productName", "product", "item"])).toLowerCase();
        const barcode = String(getValue(order, ["barcode", "code"])).toLowerCase();
        const hrid = String(getValue(order, ["hrid", "agentHrid", "userHrid"])).toLowerCase();
        return (filter === "all" || status === filter) && (!search || `${product} ${barcode} ${hrid}`.includes(search));
    });

    container.innerHTML = "";
    if (filtered.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-500 py-8">لا توجد أوردرات مطابقة.</div>';
        return;
    }

    filtered.forEach((order) => {
        const status = normalizeStatus(order.status);
        const product = getValue(order, ["productName", "product", "item"], "منتج");
        const barcode = getValue(order, ["barcode", "code"], "غير متوفر");
        const hrid = getValue(order, ["hrid", "agentHrid", "userHrid"], "غير محدد");
        const createdAt = formatDate(order.createdAt);
        const div = document.createElement("div");
        div.className = "bg-gray-700/50 p-4 rounded-lg border border-gray-600 flex flex-col md:flex-row justify-between items-start md:items-center gap-4";
        div.innerHTML = `
            <div class="min-w-0">
                <div class="font-bold text-lg break-words">${escapeHtml(product)} <span class="text-xs bg-blue-900 text-blue-300 px-2 py-1 rounded inline-block mt-1" dir="ltr">HRID: ${escapeHtml(hrid)}</span></div>
                <div class="text-sm text-gray-400 mt-1" dir="ltr"><i class="fas fa-barcode ml-1"></i> ${escapeHtml(barcode)}</div>
                ${createdAt ? `<div class="text-xs text-gray-500 mt-1">${escapeHtml(createdAt)}</div>` : ""}
            </div>
            <div class="flex items-center gap-2 w-full md:w-auto">
                <span class="text-xs px-2 py-1 rounded border ${statusClasses(status)}">${statusLabel(status)}</span>
                <select data-order-status="${escapeHtml(order.id)}" class="flex-1 md:flex-none bg-gray-900 border border-gray-600 text-white text-sm rounded-lg p-2 focus:ring-blue-500">
                    ${["Draft", "Waiting", "Ready", "Done", "Rejected"].map((value) => `<option value="${value}" ${status === value ? "selected" : ""}>${statusLabel(value)}</option>`).join("")}
                </select>
            </div>
        `;
        div.querySelector("[data-order-status]").addEventListener("change", (event) => updateOrderStatus(order.id, event.target.value));
        container.appendChild(div);
    });
}

onSnapshot(ordersRef, (snapshot) => {
    allOrders = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    allOrders.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || a.createdAt || 0;
        const bTime = b.createdAt?.toMillis?.() || b.createdAt || 0;
        return bTime - aTime;
    });
    renderOrders();
}, () => {
    const container = getElement("adminOrdersContainer");
    if (container) container.innerHTML = '<div class="text-center text-red-400 py-8">تعذر تحميل الأوردرات. تحقق من صلاحيات Firebase.</div>';
});

async function createDraftOrder() {
    const productInput = getElement("newOrderProduct");
    const barcodeInput = getElement("newOrderBarcode");
    const hridInput = getElement("newOrderHrid");
    const product = productInput?.value.trim();
    const barcode = barcodeInput?.value.trim();
    const hrid = hridInput?.value.trim();
    if (!product || !barcode || !hrid) return showToast("املأ بيانات الأوردر الثلاثة أولاً");

    const button = getElement("orderForm")?.querySelector('button[type="submit"]');
    setBusy(button, true, "جاري الإنشاء...");
    try {
        await addDoc(ordersRef, { productName: product, barcode, hrid, status: "Draft", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        productInput.value = "";
        barcodeInput.value = "";
        hridInput.value = "";
        showToast("تم إنشاء الأوردر كمسودة", "success");
    } catch (error) {
        console.error("Error creating order:", error);
        showToast("تعذر إنشاء الأوردر");
    } finally {
        setBusy(button, false);
    }
}

async function updateOrderStatus(orderId, newStatus) {
    try {
        await updateDoc(doc(db, "orders", orderId), { status: normalizeStatus(newStatus), updatedAt: serverTimestamp() });
        showToast("تم تحديث حالة الأوردر", "success");
    } catch (error) {
        console.error("Error updating order:", error);
        showToast("تعذر تحديث حالة الأوردر");
    }
}

function parseDelimitedText(text, delimiter) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (char === '"' && text[index + 1] === '"' && quoted) {
            cell += '"';
            index += 1;
        } else if (char === '"') {
            quoted = !quoted;
        } else if (char === delimiter && !quoted) {
            row.push(cell.trim());
            cell = "";
        } else if ((char === "\n" || char === "\r") && !quoted) {
            if (char === "\r" && text[index + 1] === "\n") index += 1;
            row.push(cell.trim());
            if (row.some(Boolean)) rows.push(row);
            row = [];
            cell = "";
        } else {
            cell += char;
        }
    }
    row.push(cell.trim());
    if (row.some(Boolean)) rows.push(row);
    return rows;
}

function normalizeHeader(header) {
    return String(header || "").toLowerCase().replace(/[\s_\-]/g, "");
}

function findHeader(headers, candidates) {
    const normalized = headers.map(normalizeHeader);
    return candidates.map(normalizeHeader).reduce((found, candidate) => found >= 0 ? found : normalized.indexOf(candidate), -1);
}

async function importOrders(file) {
    const text = await file.text();
    const delimiter = text.includes("\t") ? "\t" : ",";
    const rows = parseDelimitedText(text.replace(/^\uFEFF/, ""), delimiter);
    if (rows.length < 2) throw new Error("empty-file");

    const headers = rows[0];
    const productIndex = findHeader(headers, ["productName", "product", "item", "اسم المنتج", "المنتج"]);
    const barcodeIndex = findHeader(headers, ["barcode", "code", "الباركود"]);
    const hridIndex = findHeader(headers, ["hrid", "agentHrid", "userHrid", "مندوب", "معرف المندوب"]);
    const statusIndex = findHeader(headers, ["status", "الحالة"]);
    const hasHeaders = productIndex >= 0 || barcodeIndex >= 0 || hridIndex >= 0;
    const startAt = hasHeaders ? 1 : 0;
    const productAt = hasHeaders ? productIndex : 0;
    const barcodeAt = hasHeaders ? barcodeIndex : 1;
    const hridAt = hasHeaders ? hridIndex : 2;
    const statusAt = hasHeaders ? statusIndex : 3;
    const orders = rows.slice(startAt).map((row) => ({
        productName: row[productAt] || "",
        barcode: row[barcodeAt] || "",
        hrid: row[hridAt] || "",
        status: normalizeStatus(row[statusAt] || "Draft")
    })).filter((order) => order.productName && order.barcode && order.hrid);

    if (!orders.length) throw new Error("invalid-rows");
    for (let start = 0; start < orders.length; start += 450) {
        const batch = writeBatch(db);
        orders.slice(start, start + 450).forEach((order) => {
            batch.set(doc(ordersRef), { ...order, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        });
        await batch.commit();
    }
    return orders.length;
}

async function sendGlobalNotification() {
    const input = getElement("globalNotificationText");
    const text = input?.value.trim();
    if (!text) return showToast("اكتب نص الإشعار أولاً");
    const button = document.querySelector('[onclick="sendGlobalNotification()"]');
    setBusy(button, true, "جاري الإرسال...");
    try {
        await setDoc(systemRef, { globalMessage: text, messageTime: Date.now(), globalMessageUpdatedAt: serverTimestamp() }, { merge: true });
        input.value = "";
        showToast("تم إرسال الإشعار لجميع المناديب", "success");
    } catch (error) {
        console.error("Error sending notification:", error);
        showToast("تعذر إرسال الإشعار");
    } finally {
        setBusy(button, false);
    }
}

async function clearGlobalNotification() {
    try {
        await setDoc(systemRef, { globalMessage: "", messageTime: Date.now(), globalMessageUpdatedAt: serverTimestamp() }, { merge: true });
        showToast("تم مسح الإشعار", "success");
    } catch (error) {
        console.error("Error clearing notification:", error);
        showToast("تعذر مسح الإشعار");
    }
}

async function forceLogoutAll() {
    if (!window.confirm("هل أنت متأكد من إخراج جميع المناديب من النظام الآن؟")) return;
    const button = document.querySelector('[onclick="forceLogoutAll()"]');
    setBusy(button, true, "جاري الإرسال...");
    try {
        await setDoc(systemRef, { forceLogoutTrigger: Date.now() }, { merge: true });
        showToast("تم إرسال أمر تسجيل الخروج لجميع الأجهزة", "success");
    } catch (error) {
        console.error("Error forcing logout:", error);
        showToast("تعذر إرسال أمر تسجيل الخروج");
    } finally {
        setBusy(button, false);
    }
}

getElement("toggleEmployeeFormBtn")?.addEventListener("click", () => getElement("employeeFormPanel")?.classList.toggle("hidden"));
getElement("employeeForm")?.addEventListener("submit", (event) => { event.preventDefault(); addEmployee(); });
getElement("orderForm")?.addEventListener("submit", (event) => { event.preventDefault(); createDraftOrder(); });
getElement("adminOrderSearch")?.addEventListener("input", renderOrders);
getElement("adminOrderFilter")?.addEventListener("change", renderOrders);
getElement("ordersImportBtn")?.addEventListener("click", () => getElement("ordersImportInput")?.click());
getElement("ordersImportInput")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const button = getElement("ordersImportBtn");
    setBusy(button, true, "جاري الاستيراد...");
    try {
        const count = await importOrders(file);
        showToast(`تم استيراد ${count} أوردر بنجاح`, "success");
    } catch (error) {
        console.error("Error importing orders:", error);
        showToast(error.message === "invalid-rows" ? "الملف لا يحتوي على صفوف صحيحة" : "تعذر قراءة ملف الشيت");
    } finally {
        event.target.value = "";
        setBusy(button, false);
    }
});

getElement("globalNotificationText")?.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") sendGlobalNotification();
});

window.addEmployee = addEmployee;
window.resetPin = resetPin;
window.createDraftOrder = createDraftOrder;
window.updateOrderStatus = updateOrderStatus;
window.sendGlobalNotification = sendGlobalNotification;
window.clearGlobalNotification = clearGlobalNotification;
window.forceLogoutAll = forceLogoutAll;
