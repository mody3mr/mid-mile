import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, query, where, onSnapshot, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
const loggedInUser = JSON.parse(localStorage.getItem('loggedInUser'));

// لو مش مسجل يحوله لصفحة الدخول اللي في نفس المسار
if (!loggedInUser) {
    window.location.replace("index.html");
} else {
    const fullName = loggedInUser.name || loggedInUser.hrid;
    document.getElementById('userNameHeader').innerText = fullName;
    
    let initials = "NA";
    if (fullName) {
        const nameParts = fullName.trim().split(" ");
        if (nameParts.length >= 2) {
            initials = (nameParts[0][0] + nameParts[1][0]).toUpperCase();
        } else {
            initials = fullName.substring(0, 2).toUpperCase();
        }
    }
    document.getElementById('userInitials').innerText = initials;
}

function showToast(message, type = 'error') {
    const toast = document.getElementById('toastNotification');
    const icon = document.getElementById('toastIcon');
    const msg = document.getElementById('toastMessage');

    msg.textContent = message;
    toast.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 transition-all duration-300 z-[100] flex items-center gap-3 px-6 py-3 rounded-xl shadow-2xl font-bold text-sm pointer-events-none w-max max-w-[90%]';

    if (type === 'error') {
        toast.classList.add('bg-red-900', 'border', 'border-red-500', 'text-white');
        icon.className = 'fas fa-exclamation-circle text-red-400 text-lg';
    } else if (type === 'success') {
        toast.classList.add('bg-green-900', 'border', 'border-green-500', 'text-white');
        icon.className = 'fas fa-check-circle text-green-400 text-lg';
    }

    toast.classList.remove('opacity-0', '-translate-y-full');
    toast.classList.add('opacity-100', 'translate-y-4');

    setTimeout(() => {
        toast.classList.remove('opacity-100', 'translate-y-4');
        toast.classList.add('opacity-0', '-translate-y-full');
    }, 3000);
}

// تغيير الـ PIN
document.getElementById('savePinBtn')?.addEventListener('click', async () => {
    const oldPin = document.getElementById('oldPin').value.trim();
    const newPin = document.getElementById('newPin').value.trim();
    const btn = document.getElementById('savePinBtn');

    if (oldPin.length < 4 || newPin.length < 4) return showToast("الرقم السري يجب أن لا يقل عن 4 أرقام", "error");

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
    btn.disabled = true;

    try {
        const userRef = doc(db, "users", loggedInUser.hrid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists() && userSnap.data().pinCode === oldPin) {
            await updateDoc(userRef, { pinCode: newPin });
            loggedInUser.pinCode = newPin;
            localStorage.setItem('loggedInUser', JSON.stringify(loggedInUser));
            
            showToast("تم تغيير الرقم السري بنجاح!", "success");
            setTimeout(() => {
                document.getElementById('changePinModal').classList.add('hidden');
                document.getElementById('oldPin').value = '';
                document.getElementById('newPin').value = '';
            }, 1000);
        } else {
            showToast("الرقم السري الحالي غير صحيح", "error");
        }
    } catch (error) {
        showToast("حدث خطأ أثناء الاتصال بالخادم", "error");
    } finally {
        btn.innerHTML = 'حفظ التغييرات';
        btn.disabled = false;
    }
});

// جلب المديرين
onSnapshot(collection(db, "managers"), (snapshot) => {
    const managersContainer = document.getElementById('managersContainer');
    if (!managersContainer) return;
    managersContainer.innerHTML = '';
    
    if (snapshot.empty) {
        managersContainer.innerHTML = '<span class="text-xs text-gray-500">لا يوجد مديرين حالياً</span>';
        return;
    }

    snapshot.forEach((doc) => {
        const manager = doc.data();
        const phone = String(manager.phone || '').replace(/\D/g, '').replace(/^20/, '').replace(/^0/, '');
        const btn = document.createElement('button');
        btn.className = 'text-xs font-medium text-indigo-400 hover:text-indigo-300 transition underline underline-offset-2';
        btn.innerText = manager.name || 'مدير الشيفت';
        btn.onclick = () => window.openManagerModal(manager.name || 'مدير الشيفت', phone);
        managersContainer.appendChild(btn);
    });
}, (error) => {
    const managersContainer = document.getElementById('managersContainer');
    if (managersContainer) managersContainer.innerHTML = '<span class="text-xs text-red-400">خطأ بالتحميل</span>';
});

// جلب الأوردرات
const ordersContainer = document.getElementById('ordersContainer');
let allOrders = [];

function getStatusStyle(status) {
    switch (String(status || 'draft').toLowerCase()) {
        case 'draft': return '<span class="px-2 py-1 bg-gray-700 text-gray-300 rounded text-xs border border-gray-600">مسودة</span>';
        case 'waiting': return '<span class="px-2 py-1 bg-yellow-900/30 text-yellow-500 rounded text-xs border border-yellow-700/50">انتظار</span>';
        case 'ready': return '<span class="px-2 py-1 bg-blue-900/30 text-blue-400 rounded text-xs border border-blue-700/50">جاهز</span>';
        case 'done': return '<span class="px-2 py-1 bg-green-900/30 text-green-400 rounded text-xs border border-green-700/50">مسلم</span>';
        case 'rejected': return '<span class="px-2 py-1 bg-red-900/30 text-red-400 rounded text-xs border border-red-700/50">مرفوض</span>';
        default: return `<span class="px-2 py-1 bg-gray-600 text-white rounded text-xs">${status}</span>`;
    }
}

function renderOrders(ordersToRender) {
    if (!ordersContainer) return;
    ordersContainer.innerHTML = '';
    document.getElementById('ordersCount').innerText = ordersToRender.length;
    if (ordersToRender.length === 0) return ordersContainer.innerHTML = '<div class="text-center text-gray-500 py-8">لا توجد أوردرات حالياً.</div>';
    
    ordersToRender.forEach(order => {
        const div = document.createElement('div');
        div.className = 'bg-gray-800 p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center border border-gray-700 mb-3 hover:bg-gray-700 transition shadow-sm';
        const escapeHtml = (value) => String(value ?? '').replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#039;' })[char]);
        div.innerHTML = `<div><h4 class="font-bold text-white mb-1">${escapeHtml(order.productName || 'منتج')}</h4><div class="text-sm text-gray-400"><i class="fas fa-barcode ml-1"></i> الباركود: ${escapeHtml(order.barcode || 'غير متوفر')}</div></div><div class="mt-3 md:mt-0">${getStatusStyle(order.status || 'draft')}</div>`;
        ordersContainer.appendChild(div);
    });
}

if (ordersContainer) {
    const q = query(collection(db, "orders"), where("hrid", "==", loggedInUser.hrid));
    onSnapshot(q, (snapshot) => {
        allOrders = [];
        snapshot.forEach((d) => allOrders.push({ id: d.id, ...d.data() }));
        renderOrders(allOrders);
        document.getElementById('statDeliveries').innerText = allOrders.filter(o => o.status?.toLowerCase() === 'done').length;
        document.getElementById('statRejected').innerText = allOrders.filter(o => o.status?.toLowerCase() === 'rejected').length;
        document.getElementById('statAttendance').innerText = allOrders.filter(o => o.status?.toLowerCase() === 'waiting').length;
        document.getElementById('statAbsence').innerText = allOrders.filter(o => o.status?.toLowerCase() === 'ready').length;
        document.getElementById('statDelays').innerText = allOrders.filter(o => o.status?.toLowerCase() === 'draft').length;
    });

    document.getElementById('orderFilter')?.addEventListener('change', (e) => {
        const v = e.target.value;
        renderOrders(v === 'all' ? allOrders : allOrders.filter(o => o.status?.toLowerCase() === v));
    });
}

document.querySelectorAll('.order-view-btn').forEach((button) => {
    button.addEventListener('click', () => {
        const view = button.dataset.orderView;
        const filter = document.getElementById('orderFilter');
        const matchingOrders = view === 'active'
            ? allOrders.filter((order) => !['done', 'rejected'].includes(String(order.status || '').toLowerCase()))
            : view === 'completed'
                ? allOrders.filter((order) => ['done', 'rejected'].includes(String(order.status || '').toLowerCase()))
                : allOrders;
        if (filter) filter.value = 'all';
        renderOrders(matchingOrders);
        document.querySelectorAll('.order-view-btn').forEach((item) => {
            item.classList.remove('bg-blue-600', 'text-white', 'shadow');
            item.classList.add('text-gray-400', 'hover:bg-gray-700', 'hover:text-white');
        });
        button.classList.remove('text-gray-400', 'hover:bg-gray-700', 'hover:text-white');
        button.classList.add('bg-blue-600', 'text-white', 'shadow');
        document.getElementById('ordersContainer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
});

// قرارات النظام (إشعارات وخروج)
let hasLoadedSystemControls = false;
onSnapshot(doc(db, "system", "controls"), (docSnap) => {
    if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.forceLogoutTrigger && hasLoadedSystemControls) {
            localStorage.removeItem('loggedInUser');
            document.getElementById('sysMsgTitle').innerText = "تحديث النظام";
            document.getElementById('sysMsgTitle').classList.replace("text-white", "text-red-400");
            document.getElementById('systemMessageText').innerText = "قام مدير النظام بإنهاء جميع الجلسات. جاري تحويلك لصفحة الدخول...";
            document.getElementById('closeSysMsgBtn').classList.add('hidden');
            document.getElementById('ackSysMsgBtn').classList.add('hidden');
            document.getElementById('systemMessageModal').classList.remove('hidden');
            
            setTimeout(() => { window.location.replace("index.html"); }, 3000);
        }
        else if (data.globalMessage) {
            const messageKey = `lastSystemMessage:${loggedInUser.hrid}`;
            const messageVersion = String(data.messageTime || data.globalMessage);
            if (localStorage.getItem(messageKey) === messageVersion) {
                hasLoadedSystemControls = true;
                return;
            }
            document.getElementById('sysMsgTitle').innerText = "إشعار من الإدارة";
            document.getElementById('sysMsgTitle').classList.replace("text-red-400", "text-white");
            document.getElementById('systemMessageText').innerText = data.globalMessage;
            document.getElementById('closeSysMsgBtn').classList.remove('hidden');
            document.getElementById('ackSysMsgBtn').classList.remove('hidden');
            document.getElementById('systemMessageModal').classList.remove('hidden');
            localStorage.setItem(messageKey, messageVersion);
        }
    }
    hasLoadedSystemControls = true;
});
