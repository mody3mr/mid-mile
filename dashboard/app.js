// استدعاء مكتبات فايربيس
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDocs, updateDoc, onSnapshot, addDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// بيانات الربط الخاصة بك
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

// -----------------------------------------
// 1. إدارة الموظفين
// -----------------------------------------
const usersRef = collection(db, "users");

// جلب الموظفين لحظياً وعرضهم في الجدول
onSnapshot(usersRef, (snapshot) => {
    const tbody = document.getElementById('employeesTableBody');
    tbody.innerHTML = '';
    
    if (snapshot.empty) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500">لا يوجد موظفين مسجلين.</td></tr>';
        return;
    }

    snapshot.forEach(docSnap => {
        const user = docSnap.data();
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-700/50 transition';
        tr.innerHTML = `
            <td class="p-4">${user.name || '---'}</td>
            <td class="p-4 font-bold text-blue-400">${docSnap.id}</td>
            <td class="p-4 tracking-widest">${user.pinCode || '<span class="text-gray-500 text-xs">لم يتم الإنشاء</span>'}</td>
            <td class="p-4">
                <button onclick="resetPin('${docSnap.id}')" class="text-xs bg-red-900/50 text-red-400 hover:bg-red-600 hover:text-white px-2 py-1 rounded border border-red-800 transition">تصفير الـ PIN</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
});

// إضافة موظف جديد
window.addEmployee = async function() {
    const name = document.getElementById('newEmpName').value.trim();
    const hrid = document.getElementById('newEmpHrid').value.trim();

    if (!name || !hrid) {
        alert("يرجى إدخال اسم المندوب والـ HRID");
        return;
    }

    try {
        await setDoc(doc(db, "users", hrid), {
            name: name,
            pinCode: null, // لم يتم إنشاؤه بعد
            createdAt: new Date()
        });
        alert("تم إضافة المندوب بنجاح!");
        document.getElementById('newEmpName').value = '';
        document.getElementById('newEmpHrid').value = '';
    } catch (error) {
        console.error("Error adding employee:", error);
        alert("حدث خطأ أثناء الإضافة.");
    }
}

// تصفير الـ PIN (يجعل المندوب ينشئ واحد جديد عند الدخول القادم)
window.resetPin = async function(hrid) {
    if(confirm(`هل أنت متأكد من تصفير الـ PIN للموظف صاحب المعرف ${hrid}؟`)) {
        await updateDoc(doc(db, "users", hrid), { pinCode: null });
        alert("تم تصفير الرقم السري بنجاح.");
    }
}

// -----------------------------------------
// 2. إدارة الأوردرات
// -----------------------------------------
const ordersRef = collection(db, "orders");

// إنشاء أوردر كمسودة (Draft)
window.createDraftOrder = async function() {
    const product = document.getElementById('newOrderProduct').value.trim();
    const barcode = document.getElementById('newOrderBarcode').value.trim();
    const hrid = document.getElementById('newOrderHrid').value.trim();

    if (!product || !barcode || !hrid) {
        alert("يرجى ملء جميع الحقول.");
        return;
    }

    try {
        await addDoc(ordersRef, {
            productName: product,
            barcode: barcode,
            hrid: hrid,
            status: 'Draft',
            createdAt: new Date()
        });
        alert("تم إنشاء الأوردر كمسودة (Draft) بنجاح!");
        document.getElementById('newOrderProduct').value = '';
        document.getElementById('newOrderBarcode').value = '';
        document.getElementById('newOrderHrid').value = '';
    } catch (error) {
        alert("حدث خطأ أثناء الإنشاء.");
    }
}

// جلب الأوردرات للأدمن والتحكم بحالتها
onSnapshot(ordersRef, (snapshot) => {
    const container = document.getElementById('adminOrdersContainer');
    container.innerHTML = '';
    
    snapshot.forEach(docSnap => {
        const order = docSnap.data();
        const orderId = docSnap.id;
        
        const div = document.createElement('div');
        div.className = 'bg-gray-700/50 p-4 rounded-lg border border-gray-600 flex flex-col md:flex-row justify-between items-center gap-4';
        
        div.innerHTML = `
            <div>
                <div class="font-bold text-lg">${order.productName} <span class="text-xs bg-blue-900 text-blue-300 px-2 py-1 rounded ml-2">للمندوب: ${order.hrid}</span></div>
                <div class="text-sm text-gray-400 mt-1">الباركود: ${order.barcode}</div>
            </div>
            <div class="flex items-center gap-2">
                <select onchange="updateOrderStatus('${orderId}', this.value)" class="bg-gray-900 border border-gray-600 text-white text-sm rounded-lg p-2 focus:ring-blue-500">
                    <option value="Draft" ${order.status === 'Draft' ? 'selected' : ''}>مسودة (Draft)</option>
                    <option value="Waiting" ${order.status === 'Waiting' ? 'selected' : ''}>انتظار (Waiting)</option>
                    <option value="Ready" ${order.status === 'Ready' ? 'selected' : ''}>جاهز (Ready)</option>
                    <option value="Done" ${order.status === 'Done' ? 'selected' : ''}>تم التسليم (Done)</option>
                    <option value="Rejected" ${order.status === 'Rejected' ? 'selected' : ''}>مرفوض (Rejected)</option>
                </select>
            </div>
        `;
        container.appendChild(div);
    });
});

window.updateOrderStatus = async function(orderId, newStatus) {
    try {
        await updateDoc(doc(db, "orders", orderId), { status: newStatus });
    } catch (error) {
        alert("خطأ في تحديث الحالة");
    }
}

// -----------------------------------------
// 3. تحكم النظام (الإشعارات والخروج الإجباري)
// -----------------------------------------
const systemRef = doc(db, "system", "controls");

window.sendGlobalNotification = async function() {
    const text = document.getElementById('globalNotificationText').value.trim();
    if (!text) return alert("اكتب نص الإشعار أولاً");
    
    try {
        await setDoc(systemRef, {
            globalMessage: text,
            messageTime: new Date().getTime()
        }, { merge: true });
        alert("تم إرسال الإشعار لجميع المناديب!");
        document.getElementById('globalNotificationText').value = '';
    } catch (error) {
        alert("حدث خطأ.");
    }
}

window.forceLogoutAll = async function() {
    if(confirm("هل أنت متأكد من إخراج جميع المناديب من النظام الآن؟")) {
        try {
            await setDoc(systemRef, {
                forceLogoutTrigger: new Date().getTime() // تحديث الوقت يجبر الأجهزة على الخروج
            }, { merge: true });
            alert("تم إرسال أمر تسجيل الخروج لجميع الأجهزة!");
        } catch(error) {
            alert("حدث خطأ.");
        }
    }
}
