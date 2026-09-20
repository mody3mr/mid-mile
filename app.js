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

// -------------------------------------------------------------------
// 1. جلب وحفظ دليل الفروع في الميموري لسرعة الفتح
// -------------------------------------------------------------------
let allBranchesDir = [];
onSnapshot(collection(db, "branchesDirectory"), (snapshot) => {
    allBranchesDir = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
});

// دالة فتح مودال تفاصيل الفرع
window.viewBranchDetails = function(branchName) {
    if (!branchName) return showToast("اسم الفرع غير مسجل للأوردر");
    
    // البحث عن الفرع في الدليل بالاسم
    const branchInfo = allBranchesDir.find(b => b.name.trim().toLowerCase() === branchName.trim().toLowerCase());
    
    if (!branchInfo) {
        return showToast("بيانات هذا الفرع غير مسجلة في الدليل من قبل الإدارة", "error");
    }

    document.getElementById('bmName').innerText = branchInfo.name || 'بدون اسم';
    document.getElementById('bmHours').innerText = `مواعيد العمل: ${branchInfo.hours || 'غير محدد'}`;
    document.getElementById('bmLocation').innerText = branchInfo.location || 'غير متوفر';
    document.getElementById('bmManager').innerText = branchInfo.manager || 'غير متوفر';
    document.getElementById('bmPermit').innerText = branchInfo.permit || 'لا توجد تعليمات خاصة';

    const staffContainer = document.getElementById('bmStaffContainer');
    staffContainer.innerHTML = '';

    if (branchInfo.staff && branchInfo.staff.length > 0) {
        branchInfo.staff.forEach(member => {
            const normalizedPhone = String(member.phone || '').replace(/\D/g, '').replace(/^20/, '').replace(/^0/, '');
            
            staffContainer.innerHTML += `
                <div class="bg-gray-900 p-3 rounded-lg border border-gray-700 flex flex-col gap-2">
                    <span class="font-bold text-gray-300 text-sm"><i class="fas fa-user-circle text-gray-500 mr-1"></i> ${member.name}</span>
                    <div class="flex gap-2">
                        <a href="tel:+20${normalizedPhone}" class="flex-1 bg-blue-900/50 hover:bg-blue-600 text-blue-300 hover:text-white py-1.5 rounded text-xs text-center transition border border-blue-800 font-bold">
                            <i class="fas fa-phone mr-1"></i> اتصال
                        </a>
                        <a href="https://wa.me/20${normalizedPhone}" target="_blank" class="flex-1 bg-green-900/50 hover:bg-green-600 text-green-300 hover:text-white py-1.5 rounded text-xs text-center transition border border-green-800 font-bold">
                            <i class="fab fa-whatsapp mr-1"></i> واتساب
                        </a>
                    </div>
                </div>
            `;
        });
    } else {
        staffContainer.innerHTML = '<p class="text-xs text-gray-500">لا يوجد موظفين مسجلين للتواصل المباشر</p>';
    }

    document.getElementById('branchModal').classList.remove('hidden');
};


// -------------------------------------------------------------------
// 2. جلب مديري الشيفت
// -------------------------------------------------------------------
onSnapshot(collection(db, "shiftManagers"), (snapshot) => {
    const managersContainer = document.getElementById('managersContainer');
    if (!managersContainer) return;
    managersContainer.innerHTML = '';
    
    if (snapshot.empty) {
        managersContainer.innerHTML = '<span class="text-xs text-gray-500">لا يوجد مديرين</span>';
        return;
    }

    snapshot.forEach((docSnap) => {
        const manager = docSnap.data();
        managersContainer.innerHTML += `
            <button onclick="openManagerModal('${escapeHtml(manager.name)}', '${escapeHtml(manager.whatsapp)}', '${escapeHtml(manager.image)}')" class="w-8 h-8 rounded-full overflow-hidden border border-gray-600 shadow transition hover:scale-110 focus:outline-none" title="${escapeHtml(manager.name)}">
                <img src="${escapeHtml(manager.image)}" onerror="this.src='breadfast-logo (1).png'" class="w-full h-full object-cover">
            </button>
        `;
    });
}, (error) => {
    const managersContainer = document.getElementById('managersContainer');
    if (managersContainer) managersContainer.innerHTML = '<span class="text-xs text-red-400">خطأ بالتحميل</span>';
});


// -------------------------------------------------------------------
// 3. جلب الأوردرات وعرضها
// -------------------------------------------------------------------
const ordersContainer = document.getElementById('ordersContainer');
let allOrders = [];

function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function getStatusStyle(status) {
    switch (String(status || 'draft').toLowerCase()) {
        case 'draft': return '<span class="px-2 py-1 bg-gray-700 text-gray-300 rounded text-xs border border-gray-600 font-bold">مسودة / تجهيز</span>';
        case 'waiting': return '<span class="px-2 py-1 bg-yellow-900/30 text-yellow-500 rounded text-xs border border-yellow-700/50 font-bold">انتظار</span>';
        case 'ready': return '<span class="px-2 py-1 bg-blue-900/30 text-blue-400 rounded text-xs border border-blue-700/50 font-bold">جاهز للتوصيل</span>';
        case 'done': return '<span class="px-2 py-1 bg-green-900/30 text-green-400 rounded text-xs border border-green-700/50 font-bold"><i class="fas fa-check mr-1"></i> مسلم</span>';
        case 'pending': return '<span class="px-2 py-1 bg-orange-900/30 text-orange-400 rounded text-xs border border-orange-700/50 font-bold"><i class="fas fa-exclamation-circle mr-1"></i> معلق/مرفوض</span>';
        case 'resolved': return '<span class="px-2 py-1 bg-teal-900/30 text-teal-400 rounded text-xs border border-teal-700/50 font-bold"><i class="fas fa-check-double mr-1"></i> تمت التسوية</span>';
        default: return `<span class="px-2 py-1 bg-gray-600 text-white rounded text-xs font-bold">${status}</span>`;
    }
}

function renderOrders(ordersToRender) {
    if (!ordersContainer) return;
    ordersContainer.innerHTML = '';
    document.getElementById('ordersCount').innerText = ordersToRender.length;
    
    if (ordersToRender.length === 0) {
        return ordersContainer.innerHTML = '<div class="text-center text-gray-500 py-8 border border-gray-700 rounded-xl border-dashed mt-4">لا توجد أوردرات في هذه القائمة.</div>';
    }
    
    ordersToRender.forEach(order => {
        const branchName = order.branch || 'فرع غير محدد';
        
        const div = document.createElement('div');
        div.className = 'bg-gray-800 p-4 rounded-xl flex flex-col md:flex-row justify-between items-start border border-gray-700 mb-4 shadow-sm';
        
        div.innerHTML = `
            <div class="w-full">
                <!-- اسم الفرع وزرار التفاصيل -->
                <div class="flex justify-between items-start mb-3 border-b border-gray-700 pb-3">
                    <h4 class="font-bold text-green-400 text-lg leading-tight w-2/3"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(branchName)}</h4>
                    ${branchName !== 'فرع غير محدد' ? `<button onclick="viewBranchDetails('${escapeHtml(branchName)}')" class="bg-gray-700 hover:bg-gray-600 text-blue-400 text-xs px-3 py-1.5 rounded-lg border border-gray-600 transition shadow"><i class="fas fa-info-circle mr-1"></i> الاستلام</button>` : ''}
                </div>
                
                <!-- بيانات الأوردر -->
                <div class="bg-gray-900/50 p-3 rounded-lg">
                    <h5 class="font-bold text-yellow-400 mb-2">${escapeHtml(order.productName || 'منتج غير معروف')}</h5>
                    <div class="text-sm text-gray-400 flex flex-wrap gap-3">
                        <span class="bg-gray-800 px-2 py-1 rounded" dir="ltr"><i class="fas fa-barcode"></i> ${escapeHtml(order.barcode || 'غير متوفر')}</span>
                        ${order.quantity ? `<span class="bg-blue-900/30 text-blue-300 px-2 py-1 rounded">الكمية: ${escapeHtml(order.quantity)}</span>` : ''}
                    </div>
                    ${order.notes ? `<div class="mt-2 text-xs text-orange-400 bg-orange-900/20 p-2 rounded"><i class="fas fa-comment-dots mr-1"></i> ملاحظات: ${escapeHtml(order.notes)}</div>` : ''}
                </div>
                
                <!-- الحالة -->
                <div class="mt-3 flex justify-end w-full">
                    ${getStatusStyle(order.status)}
                </div>
            </div>
        `;
        ordersContainer.appendChild(div);
    });
}

if (ordersContainer) {
    const q = query(collection(db, "orders"), where("hrid", "==", loggedInUser.hrid));
    onSnapshot(q, (snapshot) => {
        allOrders = [];
        snapshot.forEach((d) => allOrders.push({ id: d.id, ...d.data() }));
        
        // فرز بحيث الأحدث يظهر فوق
        allOrders.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        
        renderOrders(allOrders);
        
        // إحصائيات المندوب
        document.getElementById('statDeliveries').innerText = allOrders.filter(o => o.status?.toLowerCase() === 'done' || o.status?.toLowerCase() === 'resolved').length;
        document.getElementById('statRejected').innerText = allOrders.filter(o => o.status?.toLowerCase() === 'pending').length;
        document.getElementById('statAttendance').innerText = allOrders.filter(o => o.status?.toLowerCase() === 'waiting').length;
        document.getElementById('statAbsence').innerText = allOrders.filter(o => o.status?.toLowerCase() === 'ready').length;
        document.getElementById('statDelays').innerText = allOrders.filter(o => o.status?.toLowerCase() === 'draft').length;
    });

    document.getElementById('orderFilter')?.addEventListener('change', (e) => {
        const v = e.target.value;
        if (v === 'all') {
            renderOrders(allOrders);
        } else if (v === 'done') {
            renderOrders(allOrders.filter(o => o.status?.toLowerCase() === 'done' || o.status?.toLowerCase() === 'resolved'));
        } else if (v === 'pending') {
            renderOrders(allOrders.filter(o => o.status?.toLowerCase() === 'pending'));
        }
    });
}

document.querySelectorAll('.order-view-btn').forEach((button) => {
    button.addEventListener('click', () => {
        const view = button.dataset.orderView;
        const filter = document.getElementById('orderFilter');
        
        const matchingOrders = view === 'active'
            ? allOrders.filter((order) => !['done', 'resolved', 'pending'].includes(String(order.status || '').toLowerCase()))
            : view === 'completed'
                ? allOrders.filter((order) => ['done', 'resolved', 'pending'].includes(String(order.status || '').toLowerCase()))
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


// -------------------------------------------------------------------
// 4. تغيير الـ PIN والتحكم من النظام
// -------------------------------------------------------------------
document.getElementById('savePinBtn')?.addEventListener('click', async () => {
    const oldPin = document.getElementById('oldPin').value.trim();
    const newPin = document.getElementById('newPin').value.trim();
    const btn = document.getElementById('savePinBtn');

    if (oldPin.length < 4 || newPin.length < 4) return showToast("الرقم السري يجب أن لا يقل عن 4 أرقام", "error");

    setBusy(btn, true, "جاري الحفظ...");

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
        setBusy(btn, false);
    }
});

let hasLoadedSystemControls = false;
onSnapshot(doc(db, "system", "controls"), (docSnap) => {
    if (docSnap.exists()) {
        const data = docSnap.data();
        
        if (data.forceLogoutTrigger && hasLoadedSystemControls) {
            localStorage.removeItem('loggedInUser');
            document.getElementById('sysMsgTitle').innerText = "طوارئ النظام";
            document.getElementById('sysMsgTitle').classList.replace("text-white", "text-red-400");
            document.getElementById('systemMessageText').innerText = "تم إنهاء جلستك من قبل الإدارة. يرجى تسجيل الدخول مجدداً.";
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
