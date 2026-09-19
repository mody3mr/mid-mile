import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 1. كود الحماية: التحقق فوراً إذا كان المستخدم مسجل دخول بالفعل
const savedUser = localStorage.getItem('loggedInUser');
if (savedUser) {
    // لو مسجل دخول، يتم توجيهه للوحة التحكم فوراً ولا يمكنه البقاء في صفحة الدخول
    window.location.replace("main.html");
}

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

const hridInput = document.getElementById('hrid');
const statusText = document.getElementById('hridStatus');
const pinInput = document.getElementById('pincode');
const loginBtn = document.getElementById('loginBtn');
const loginForm = document.getElementById('loginForm');

let typingTimer;
let isHridValid = false;
let currentUserData = null;

function showToast(message, type = 'error') {
    const toast = document.getElementById('toastNotification');
    const icon = document.getElementById('toastIcon');
    const msg = document.getElementById('toastMessage');

    msg.textContent = message;
    toast.className = 'fixed top-0 left-1/2 transform -translate-x-1/2 transition-all duration-300 z-[100] flex items-center gap-3 px-6 py-3 rounded-xl shadow-2xl font-bold text-sm pointer-events-none w-max max-w-[90%]';

    if (type === 'error') {
        toast.classList.add('bg-red-900', 'border', 'border-red-500', 'text-white');
        icon.className = 'fas fa-exclamation-circle text-red-400 text-lg';
    } else if (type === 'success') {
        toast.classList.add('bg-green-900', 'border', 'border-green-500', 'text-white');
        icon.className = 'fas fa-check-circle text-green-400 text-lg';
    }

    toast.classList.remove('opacity-0', '-translate-y-full');
    toast.classList.add('opacity-100', 'translate-y-6');

    setTimeout(() => {
        toast.classList.remove('opacity-100', 'translate-y-6');
        toast.classList.add('opacity-0', '-translate-y-full');
    }, 3000);
}

if (hridInput) {
    hridInput.addEventListener('input', () => {
        clearTimeout(typingTimer);
        const val = hridInput.value.trim();
        
        statusText.textContent = '';
        pinInput.disabled = true;
        loginBtn.disabled = true;
        isHridValid = false;
        currentUserData = null;
        pinInput.value = '';

        if (val.length > 0) {
            statusText.textContent = 'Checking...';
            statusText.className = 'text-xs mt-1 text-gray-400 h-4';
            typingTimer = setTimeout(() => checkHrid(val), 500);
        }
    });
}

async function checkHrid(hrid) {
    try {
        const docRef = doc(db, "users", hrid);
        const docSnap = await getDoc(docRef);

        // Ignore a delayed response for an HR ID the user has already changed.
        if (hridInput.value.trim() !== hrid) return;

        if (docSnap.exists()) {
            currentUserData = docSnap.data();
            
            const displayName = currentUserData.name ? currentUserData.name : 'HR ID verified';
            statusText.textContent = '✓ ' + displayName;
            statusText.className = 'text-xs mt-1 text-green-400 h-4';
            
            pinInput.disabled = false;
            loginBtn.disabled = false;
            isHridValid = true;
            pinInput.focus();
        } else {
            statusText.textContent = '✗ HR ID not found';
            statusText.className = 'text-xs mt-1 text-red-500 h-4';
        }
    } catch (error) {
        console.error("Firebase Error: ", error);
        statusText.textContent = '⚠️ تأكد من اتصال الإنترنت أو صلاحيات فايربيس';
        statusText.className = 'text-xs mt-1 text-yellow-500 h-4';
    }
}

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!isHridValid || !currentUserData) return;

        const pinVal = pinInput.value.trim();
        if (pinVal.length < 4) {
            showToast("الرقم السري قصير جداً", "error");
            return;
        }

        const originalHTML = loginBtn.innerHTML;
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الدخول...';
        loginBtn.disabled = true;

        try {
            if (currentUserData.pinCode) {
                if (currentUserData.pinCode === pinVal) {
                    localStorage.setItem('loggedInUser', JSON.stringify({hrid: hridInput.value.trim(), ...currentUserData}));
                    
                    // 2. التعديل هنا: استخدام replace لمنع الرجوع لصفحة الدخول
                    window.location.replace("main.html");
                } else {
                    showToast("الرقم السري (PIN) غير صحيح", "error");
                }
            } else {
                const hrid = hridInput.value.trim();
                await updateDoc(doc(db, "users", hrid), { pinCode: pinVal });
                const updatedSnap = await getDoc(doc(db, "users", hrid));
                localStorage.setItem('loggedInUser', JSON.stringify({hrid: hrid, ...updatedSnap.data()}));
                
                showToast("تم إنشاء الرقم السري بنجاح!", "success");
                setTimeout(() => {
                    // التعديل هنا أيضاً
                    window.location.replace("main.html");
                }, 1500); 
            }
        } catch(error) {
            showToast("حدث خطأ أثناء الاتصال.", "error");
        } finally {
            loginBtn.innerHTML = originalHTML;
            loginBtn.disabled = false;
        }
    });
}
