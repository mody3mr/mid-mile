import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    query, 
    where, 
    onSnapshot, 
    doc, 
    getDoc, 
    updateDoc,
    serverTimestamp,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ==========================================
// 1. إعدادات الفايربيس (Firebase Config)
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
// 2. حماية الصفحة والتحقق من تسجيل الدخول
// ==========================================
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

// ==========================================
// 3. دوال مساعدة (Helpers)
// ==========================================
function showToast(message, type = 'error') {
    const toast = document.getElementById('toastNotification');
    const icon = document.getElementById('toastIcon');
    const msg = document.getElementById('toastMessage');
    if (!toast) return;

    msg.textContent = message;
    toast.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 transition-all duration-300 z-[100] flex items-center gap-3 px-6 py-3 rounded-xl shadow-2xl font-bold text-sm w-max max-w-[90%]';

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

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
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
    return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}


// ==========================================
// 4. جلب الأدلة (فروع، مديرين شيفت، الخ)
// ==========================================
let allBranchesDir = [];

// جلب دليل الفروع
onSnapshot(collection(db, "branchesDirectory"), (snapshot) => {
    allBranchesDir = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
});

// فتح بوب-أب الفرع
window.viewBranchDetails = function(branchName) {
    if (!branchName) return showToast("اسم الفرع غير مسجل");
    const branchInfo = allBranchesDir.find(b => b.name.trim().toLowerCase() === branchName.trim().toLowerCase());
    
    if (!branchInfo) {
        return showToast("بيانات هذا الفرع غير مسجلة في دليل الإدارة", "error");
    }

    document.getElementById('bmName').innerText = branchInfo.name || 'بدون اسم';
    document.getElementById('bmHours').innerHTML = `<i class="fas fa-clock mr-1 text-blue-400"></i> ${branchInfo.hours || 'غير محدد'}`;
    document.getElementById('bmLocation').innerText = branchInfo.location || 'غير متوفر';
    document.getElementById('bmManager').innerText = branchInfo.manager || 'غير متوفر';
    document.getElementById('bmPermit').innerText = branchInfo.permit || 'لا توجد تعليمات خاصة';

    const staffContainer = document.getElementById('bmStaffContainer');
    staffContainer.innerHTML = '';

    if (branchInfo.staff && branchInfo.staff.length > 0) {
        branchInfo.staff.forEach(member => {
            const normalizedPhone = String(member.phone || '').replace(/\D/g, '').replace(/^20/, '').replace(/^0/, '');
            staffContainer.innerHTML += `
                <div class="bg-gray-800 p-3 rounded-lg border border-gray-600 flex flex-col gap-2 shadow-inner">
                    <span class="font-bold text-gray-200 text-sm"><i class="fas fa-user-circle text-gray-400 mr-1"></i> ${escapeHtml(member.name)}</span>
                    <div class="flex gap-2">
                        <a href="tel:+20${normalizedPhone}" class="flex-1 bg-blue-900/50 hover:bg-blue-600 text-blue-300 hover:text-white py-2 rounded-lg text-xs text-center transition font-bold shadow border border-blue-800">
                            <i class="fas fa-phone mr-1"></i> اتصال
                        </a>
                        <a href="https://wa.me/20${normalizedPhone}" target="_blank" class="flex-1 bg-green-900/50 hover:bg-green-600 text-green-300 hover:text-white py-2 rounded-lg text-xs text-center transition font-bold shadow border border-green-800">
                            <i class="fab fa-whatsapp mr-1 text-sm"></i> واتساب
                        </a>
                    </div>
                </div>
            `;
        });
    } else {
        staffContainer.innerHTML = '<p class="text-xs text-gray-500 font-bold border border-dashed border-gray-700 p-3 rounded-lg text-center">لا يوجد موظفين مسجلين للتواصل המباشر</p>';
    }

    document.getElementById('branchModal').classList.remove('hidden');
};

// جلب مديري الشيفت للفوتر
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
            <button onclick="openManagerModal('${escapeHtml(manager.name)}', '${escapeHtml(manager.whatsapp)}', '${escapeHtml(manager.image)}')" class="w-8 h-8 rounded-full overflow-hidden border border-gray-600 shadow transition hover:scale-110 focus:outline-none ring-2 ring-transparent hover:ring-blue-500" title="${escapeHtml(manager.name)}">
                <img src="${escapeHtml(manager.image)}" onerror="this.src='breadfast-logo (1).png'" class="w-full h-full object-cover bg-gray-800">
            </button>
        `;
    });
});


// ==========================================
// 5. إدارة الأوردرات والفروع (Active & History)
// ==========================================
let allOrders = [];

const q = query(collection(db, "orders"), where("hrid", "==", loggedInUser.hrid));
onSnapshot(q, (snapshot) => {
    allOrders = [];
    snapshot.forEach((d) => allOrders.push({ id: d.id, ...d.data() }));
    
    // الفرز من الأحدث للأقدم
    allOrders.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    
    renderActiveOrders();
    renderHistoryOrders();
    updateSummaryStats();
});

// رسم الأوردرات الحالية (المفتوحة)
function renderActiveOrders() {
    const container = document.getElementById('activeOrdersContainer');
    if (!container) return;

    // استخراج الأوردرات اللي لسه مفتوحة (Draft = مُسند للمندوب) 
    // أي حاجة Done أو Pending أو Resolved مش هتظهر هنا
    const activeOrders = allOrders.filter(o => o.status === 'Draft');

    document.getElementById('activeOrdersCount').innerText = activeOrders.length;

    if (activeOrders.length === 0) {
        container.innerHTML = `
            <div class="text-center text-gray-500 py-12 bg-gray-800 rounded-xl border border-gray-700 border-dashed">
                <i class="fas fa-check-double text-6xl mb-4 opacity-50 text-green-500"></i>
                <h3 class="text-2xl font-bold text-gray-300">عاش يا بطل!</h3>
                <p class="text-base mt-2">لا توجد أوردرات أو فروع مفتوحة حالياً.</p>
                <p class="text-sm mt-1 text-gray-600">لقد قمت بتقفيل جميع الفروع بنجاح.</p>
            </div>
        `;
        return;
    }

    // تجميع الأوردرات حسب الفرع
    let groupedByBranch = {};
    activeOrders.forEach(order => {
        const branchName = order.branch || "فرع غير محدد";
        if (!groupedByBranch[branchName]) {
            groupedByBranch[branchName] = [];
        }
        groupedByBranch[branchName].push(order);
    });

    container.innerHTML = "";

    // رسم الفروع
    for (const [branchName, branchOrders] of Object.entries(groupedByBranch)) {
        
        // تجميع المنتجات داخل الفرع حسب الكاتيجري
        let categoriesHtml = "";
        let groupedByCategory = {};
        
        branchOrders.forEach(o => {
            const cat = o.category || "غير مصنف";
            if(!groupedByCategory[cat]) groupedByCategory[cat] = [];
            groupedByCategory[cat].push(o);
        });

        for (const [category, products] of Object.entries(groupedByCategory)) {
            let productsHtml = "";
            products.forEach(product => {
                const originalQty = product.quantity || 1;
                const actualQty = product.actualQty !== undefined ? product.actualQty : originalQty;
                
                productsHtml += `
                    <div class="bg-gray-800 p-3 rounded-lg border border-gray-600 mb-3 shadow-inner flex flex-col md:flex-row justify-between md:items-center gap-3">
                        <div class="flex-1">
                            <h5 class="font-bold text-yellow-400 mb-1.5 text-base leading-tight">${escapeHtml(product.productName)}</h5>
                            <div class="flex flex-wrap gap-2 text-xs text-gray-400 font-mono">
                                <span class="bg-gray-900 px-2 py-1 rounded border border-gray-700"><i class="fas fa-barcode"></i> ${escapeHtml(product.barcode)}</span>
                                ${product.productId ? `<span class="bg-gray-900 px-2 py-1 rounded border border-gray-700">ID: ${escapeHtml(product.productId)}</span>` : ''}
                            </div>
                        </div>
                        
                        <!-- زر الكمية وتحويله لقلم -->
                        <div class="flex items-center gap-2 mt-2 md:mt-0 bg-gray-900 p-1.5 rounded-lg border border-gray-700">
                            <span class="text-xs font-bold text-gray-400 px-2">الكمية:</span>
                            
                            <!-- الزر الأزرق اللي بيعرض الكمية -->
                            <button id="qty-label-btn-${product.id}" onclick="showEditPen('${product.id}')" class="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-1.5 rounded-md transition shadow text-base">
                                ${actualQty}
                            </button>
                            
                            <!-- زرار القلم المخفي (بيظهر لما تدوس عالرقم) -->
                            <button id="pen-btn-${product.id}" onclick="openEditQtyModal(event, '${product.id}', '${escapeHtml(product.productName)}', ${originalQty}, ${actualQty})" class="hidden bg-yellow-600 hover:bg-yellow-500 text-white font-bold w-10 py-1.5 rounded-md transition shadow text-base">
                                <i class="fas fa-pen"></i>
                            </button>
                        </div>
                    </div>
                `;
            });

            categoriesHtml += `
                <div class="mt-4 border border-gray-700 bg-gray-900/50 rounded-xl overflow-hidden shadow">
                    <div class="bg-gray-800 p-3 flex justify-between items-center border-b border-gray-700">
                        <span class="font-bold text-white text-sm flex items-center gap-2">
                            <i class="fas fa-tag text-purple-400"></i> ${escapeHtml(category)}
                            <span class="bg-gray-700 text-xs px-2 py-0.5 rounded-full text-gray-300 shadow-inner">${products.length} صنف</span>
                        </span>
                    </div>
                    <div class="p-3">
                        ${productsHtml}
                    </div>
                </div>
            `;
        }

        const branchCard = document.createElement('div');
        branchCard.className = "bg-gray-800 border-2 border-blue-900/30 rounded-2xl shadow-xl overflow-hidden mb-6";
        
        branchCard.innerHTML = `
            <div class="bg-gray-700/80 p-4 border-b border-gray-600 flex justify-between items-center cursor-pointer hover:bg-gray-600/80 transition" onclick="toggleAccordion(this)">
                <div class="flex items-center gap-3 flex-1">
                    <div class="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center border border-gray-600 shadow-inner shrink-0">
                        <i class="fas fa-chevron-down chevron transition-transform text-blue-400 text-lg"></i>
                    </div>
                    <div>
                        <h4 class="text-xl font-bold text-white leading-tight flex items-center gap-2 hover:text-blue-300" onclick="event.stopPropagation(); viewBranchDetails('${escapeHtml(branchName)}')">
                            <i class="fas fa-map-marker-alt text-green-400"></i> 
                            <span class="underline underline-offset-4 decoration-dashed decoration-gray-500">${escapeHtml(branchName)}</span>
                        </h4>
                        <p class="text-xs text-gray-400 mt-1 font-bold">الفرع مفتوح - يحتاج تقفيل</p>
                    </div>
                </div>
                <div class="bg-blue-900/50 text-blue-300 font-bold px-3 py-1.5 rounded-lg border border-blue-800 text-sm shadow">
                    ${branchOrders.length} منتج
                </div>
            </div>
            
            <div class="accordion-content p-0 border-0">
                <div class="p-4 bg-gray-800">
                    ${categoriesHtml}
                    
                    <!-- زر تقفيل الفرع -->
                    <div class="mt-6 pt-4 border-t border-gray-700">
                        <button onclick="closeBranchOrders('${escapeHtml(branchName)}')" class="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg transition text-lg border border-green-500 flex justify-center items-center gap-2">
                            <i class="fas fa-check-double text-xl"></i> استلام وتقفيل الفرع نهائياً
                        </button>
                    </div>
                </div>
            </div>
        `;

        container.appendChild(branchCard);
    }
}

// رسم الأوردرات السابقة (المقفولة)
const historyDateFilter = document.getElementById('historyDateFilter');
if (historyDateFilter) {
    historyDateFilter.valueAsDate = new Date();
    historyDateFilter.addEventListener('change', renderHistoryOrders);
}

function renderHistoryOrders() {
    const container = document.getElementById('historyOrdersContainer');
    if (!container || !historyDateFilter) return;

    const selectedDateStr = historyDateFilter.value;
    if (!selectedDateStr) return;
    
    const targetDate = new Date(selectedDateStr).toDateString();

    // استخراج الأوردرات المسلمة في هذا التاريخ
    const historyOrders = allOrders.filter(o => {
        if (o.status !== 'Done') return false; // السابقة يعني اتقفلت
        const oDate = o.updatedAt?.toDate ? o.updatedAt.toDate().toDateString() : null;
        return oDate === targetDate;
    });

    if (historyOrders.length === 0) {
        container.innerHTML = `
            <div class="text-center text-gray-500 py-12 bg-gray-800 rounded-xl border border-gray-700 border-dashed">
                <i class="fas fa-calendar-times text-5xl mb-4 opacity-50 text-gray-400"></i>
                <p class="text-lg font-bold text-gray-300">لا توجد أوردرات مقفلة في هذا اليوم.</p>
            </div>
        `;
        return;
    }

    // تجميع الأوردرات حسب الفرع
    let groupedByBranch = {};
    historyOrders.forEach(order => {
        const branchName = order.branch || "فرع غير محدد";
        if (!groupedByBranch[branchName]) groupedByBranch[branchName] = [];
        groupedByBranch[branchName].push(order);
    });

    container.innerHTML = "";

    // رسم الفروع المقفولة
    for (const [branchName, branchOrders] of Object.entries(groupedByBranch)) {
        
        let productsHtml = "";
        branchOrders.forEach(product => {
            const originalQty = product.quantity || 1;
            const actualQty = product.actualQty !== undefined ? product.actualQty : originalQty;
            const hasShortage = actualQty < originalQty;
            
            productsHtml += `
                <div class="bg-gray-900/50 p-3 rounded-lg border border-gray-700 mb-2 flex flex-col md:flex-row justify-between gap-2 shadow-inner">
                    <div>
                        <h5 class="font-bold text-gray-300 mb-1 text-sm">${escapeHtml(product.productName)}</h5>
                        <div class="text-xs text-gray-500 font-mono"><i class="fas fa-barcode"></i> ${escapeHtml(product.barcode)}</div>
                    </div>
                    <div class="flex flex-col items-end justify-center">
                        <span class="text-sm font-bold ${hasShortage ? 'text-orange-400' : 'text-green-400'}">
                            الكمية: ${actualQty} / ${originalQty}
                        </span>
                        ${hasShortage ? `<span class="text-[10px] text-orange-500 mt-1 bg-orange-900/30 px-2 py-0.5 rounded border border-orange-800">سبب: ${escapeHtml(product.notes)}</span>` : ''}
                    </div>
                </div>
            `;
        });

        const branchCard = document.createElement('div');
        branchCard.className = "bg-gray-800 border border-green-900/50 rounded-xl shadow-lg overflow-hidden mb-4 opacity-80 hover:opacity-100 transition";
        
        branchCard.innerHTML = `
            <div class="bg-gray-700/50 p-4 border-b border-gray-600 flex justify-between items-center cursor-pointer" onclick="toggleAccordion(this)">
                <div class="flex items-center gap-3">
                    <i class="fas fa-chevron-down chevron transition-transform text-gray-400"></i>
                    <h4 class="text-lg font-bold text-gray-300 flex items-center gap-2">
                        <i class="fas fa-check-circle text-green-500"></i> ${escapeHtml(branchName)}
                    </h4>
                </div>
                <span class="text-xs bg-gray-900 text-gray-400 px-2 py-1 rounded font-bold border border-gray-700">${branchOrders.length} منتج</span>
            </div>
            <div class="accordion-content p-0 border-0">
                <div class="p-4 bg-gray-800/80">
                    ${productsHtml}
                </div>
            </div>
        `;

        container.appendChild(branchCard);
    }
}

// تحديث الإحصائيات (Summary Tab)
function updateSummaryStats() {
    let activeCount = 0;
    let pendingCount = 0;
    let historyCount = 0;
    
    // لحساب أيام الحضور (Unique Days with any order update/creation)
    let attendanceDays = new Set();

    allOrders.forEach(o => {
        const status = o.status || 'Draft';
        
        if (status === 'Draft') activeCount++;
        else if (status === 'Pending') pendingCount++;
        else if (status === 'Done' || status === 'Resolved') historyCount++;
        
        // حساب الحضور
        if (o.updatedAt?.toDate) {
            attendanceDays.add(o.updatedAt.toDate().toDateString());
        }
    });

    if(document.getElementById('stat-active')) document.getElementById('stat-active').innerText = activeCount;
    if(document.getElementById('stat-pending')) document.getElementById('stat-pending').innerText = pendingCount;
    if(document.getElementById('stat-history')) document.getElementById('stat-history').innerText = historyCount;
    if(document.getElementById('stat-attendance')) document.getElementById('stat-attendance').innerText = attendanceDays.size;
    // الغياب لا يمكن حسابه بدقة بدون جدول عمل، نتركه 0 مؤقتاً
    if(document.getElementById('stat-absence')) document.getElementById('stat-absence').innerText = "0";
}


// ==========================================
// 6. التحكم في الكميات وتقفيل الفرع
// ==========================================

// إظهار زرار القلم
window.showEditPen = function(orderId) {
    document.getElementById(`qty-label-btn-${orderId}`).classList.add('hidden');
    document.getElementById(`pen-btn-${orderId}`).classList.remove('hidden');
}

// حفظ الكمية المعدلة
window.saveEditedQty = async function() {
    const orderId = document.getElementById('eqOrderId').value;
    const originalQty = parseInt(document.getElementById('eqOriginalQty').value);
    const actualQty = parseInt(document.getElementById('eqActualQty').value);
    const reason = document.getElementById('eqReasonSelect').value;

    if (isNaN(actualQty) || actualQty < 0) {
        return showToast("برجاء إدخال كمية صحيحة");
    }

    if (actualQty < originalQty && !reason) {
        return showToast("يجب اختيار سبب نقص الكمية");
    }

    const btn = document.querySelector('#editQtyModal button[onclick="saveEditedQty()"]');
    setBusy(btn, true, "حفظ...");

    try {
        await updateDoc(doc(db, "orders", orderId), {
            actualQty: actualQty,
            notes: (actualQty < originalQty) ? reason : "", 
            updatedAt: serverTimestamp()
        });
        
        showToast("تم تحديث الكمية بنجاح", "success");
        closeEditQtyModal();
    } catch(err) {
        showToast("حدث خطأ أثناء الحفظ");
    } finally {
        setBusy(btn, false);
    }
}

// تقفيل الفرع بالكامل
window.closeBranchOrders = function(branchName) {
    window.UI.openModal(
        "تأكيد تقفيل الفرع", 
        `
        <div class="bg-gray-900/50 p-4 rounded-lg border border-gray-700 text-center">
            <i class="fas fa-box-open text-5xl text-blue-400 mb-4 block"></i>
            <p class="text-white font-bold text-lg mb-2">هل استلمت جميع المنتجات بنجاح؟</p>
            <p class="text-sm text-gray-400 leading-relaxed">
                بمجرد تأكيد استلام الفرع (<span class="text-yellow-400 font-bold">${escapeHtml(branchName)}</span>)، سيتم إغلاقه ونقله للأوردرات السابقة، ولن تتمكن من تعديل كمياته مرة أخرى.
            </p>
        </div>
        `,
        "نعم، استلمت وقفل الفرع",
        "bg-green-600 hover:bg-green-700 border-green-500",
        async () => {
            try {
                // جلب كل الأوردرات النشطة للفرع ده
                const branchActiveOrders = allOrders.filter(o => o.branch === branchName && o.status === 'Draft');
                
                if (branchActiveOrders.length === 0) return;

                let batch = writeBatch(db);
                
                branchActiveOrders.forEach(order => {
                    const orderRef = doc(db, "orders", order.id);
                    batch.update(orderRef, {
                        status: 'Done',
                        updatedAt: serverTimestamp()
                    });
                });

                await batch.commit();
                showToast("تم تقفيل الفرع بنجاح وعاش يا وحش!", "success");
                
                // هنخليه يعرض الاوردرات السابقة عشان يشوف الفرع وهو مقفول؟ أو يخليه في الحالية
                // الأفضل نسيبه في الحالية عشان يكمل شغله، والسيستم لوحده هيخفي الفرع ده
                
            } catch(e) {
                console.error(e);
                showToast("حدث خطأ أثناء التقفيل");
            }
        }
    );
};

// ==========================================
// 7. تحكم النظام الإجباري (طوارئ الإدارة)
// ==========================================
let hasLoadedSystemControls = false;
onSnapshot(doc(db, "system", "controls"), (docSnap) => {
    if (docSnap.exists()) {
        const data = docSnap.data();
        
        if (data.forceLogoutTrigger && hasLoadedSystemControls) {
            localStorage.removeItem('loggedInUser');
            document.getElementById('sysMsgTitle').innerText = "طوارئ النظام";
            document.getElementById('systemMessageText').innerText = "تم إنهاء جلستك من قبل الإدارة لتحديث النظام. يرجى تسجيل الدخول مجدداً.";
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
            document.getElementById('systemMessageText').innerText = data.globalMessage;
            document.getElementById('closeSysMsgBtn').classList.remove('hidden');
            document.getElementById('ackSysMsgBtn').classList.remove('hidden');
            document.getElementById('systemMessageModal').classList.remove('hidden');
            
            localStorage.setItem(messageKey, messageVersion);
        }
    }
    hasLoadedSystemControls = true;
});
