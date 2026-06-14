// ==========================================
// 1. Firebase 및 초기 설정
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyCYs0C4Z-7WFPoZGf2TSWTna9gnLKYTHt8",
    authDomain: "mobi-checker.firebaseapp.com",
    projectId: "mobi-checker",
    storageBucket: "mobi-checker.firebasestorage.app",
    messagingSenderId: "558569400000",
    appId: "1:558569400000:web:85f63f71131ab4f0582f25"
};

if (!firebase.apps.length) {
    try { firebase.initializeApp(firebaseConfig); } catch(e) { console.error("Firebase 초기화 에러:", e); }
}
const db = firebase.firestore();
db.enablePersistence().catch(err => { console.warn("오프라인 모드 활성화 실패:", err); });

let docRef = null; 

// 🌟 익명 로그인 및 고유 방 배정 (연동 상태 UI 업데이트 포함)
firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        docRef = db.collection("mabi_tracker").doc(user.uid);
        
        // 버튼 아이콘 변경 (구글 연동 여부 확인)
        const isLinked = user.providerData.some(p => p.providerId === 'google.com');
        const authBtn = document.getElementById('auth-btn');
        if (authBtn) {
            if (isLinked) {
                authBtn.innerText = '✅';
                authBtn.title = '구글 계정과 안전하게 연동됨';
            } else {
                authBtn.innerText = '💾';
                authBtn.title = '구글 계정 연동 (데이터 백업)';
            }
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', loadData);
        } else {
            loadData();
        }
    } else {
        firebase.auth().signInAnonymously().catch((error) => {
            console.error("익명 로그인 실패:", error);
        });
    }
});

const genId = () => Math.random().toString(36).substr(2, 9);
const pastelColors = ['#4a90e2', '#ff8787', '#fcc419', '#69db7c', '#b197fc', '#3bc9db', '#ffa8a8', '#e599f7', '#8ce99a', '#74c0fc'];

const DEFAULT_STATE = {
    global: {
        lastDailyReset: 0, lastWeeklyReset: 0,
        abyss: { baseTime: "" }, 
        notices: [],
        event: [{ id: genId(), period: "06.01 ~ 06.30", title: "샘플 이벤트", days: ['토', '일'], memo1: "", memo2: "", targetChars: ['all'] }],
        memo: [{ id: genId(), label: "내일 길드 레이드 20시" }],
        towns: { 'daily': { '티르코네일': { order: 1000, color: '#4a90e2' } }, 'daily-trade': { '티르코네일': { order: 1000, color: '#ff8787' } }, 'weekly': {}, 'weekly-trade': {} },
        sharedChecks: {}, 
        tasksTemplate: { 
            'daily': [{ id: "d1", label: "일일 퀘스트 완료", town: "티르코네일", isShared: false, order: 1, isPaused: false }], 
            'daily-trade': [{ id: "dt1", type: "trade", town: "티르코네일", npc: "엔델리온", fromItem: "우유", fromQty: 10, toItem: "마나허브", toQty: 2, isShared: false, order: 1, isPaused: false }], 
            'weekly': [{ id: "w1", label: "주간 레이드 참여", isShared: false, order: 1, isPaused: false }], 
            'weekly-trade': [] 
        }
    },
    characters: Array.from({length: 6}, (_, i) => ({ 
        id: `char-${i+1}`, name: `캐릭터 ${i+1}`, checks: {},
        customTasks: { 'daily': [], 'daily-trade': [], 'weekly': [], 'weekly-trade': [] },
        hiddenTasks: []
    })),
    activeTabId: "char-1"
};

const categoriesInfo = [
    { id: 'daily', title: '☀️ 일일 숙제' }, { id: 'daily-trade', title: '⚖️ 일일 물물 교환' },
    { id: 'weekly', title: '📅 주간 숙제' }, { id: 'weekly-trade', title: '⚖️ 주간 물물 교환' }
];

// ==========================================
// 2. 전역 상태 변수들
// ==========================================
let uiState = { showCompleted: { 'daily': false, 'daily-trade': false, 'weekly': false, 'weekly-trade': false } };
let appState = null;
let isLocalUpdate = false;
let editingEventId = null; 
let selectedEventDays = []; 
let currentlyEditingTask = null; 
let deleteTarget = null;
let countdownInterval = null;
let notifiedAbyssTime = null;

// ==========================================
// 3. 유틸리티 및 통신 함수
// ==========================================
function formatDateKor(isoStr, includeYear=true) {
    if(!isoStr) return "";
    const d = new Date(isoStr);
    const y = d.getFullYear(); const m = d.getMonth() + 1; const day = d.getDate();
    const week = ['일','월','화','수','목','금','토'][d.getDay()];
    let h = d.getHours(); const min = String(d.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? '오후' : '오전'; h = h % 12; if(h === 0) h = 12;
    return `${includeYear ? y+'년 ' : ''}${m}월 ${day}일(${week}) ${ampm} ${h}시 ${min}분`;
}

function getEventStatusClass(periodStr) {
    try {
        if (!periodStr) return 'ev-status-ongoing';
        const parts = periodStr.split('~').map(s => s.trim());
        const startStr = parts[0] || ''; const endStr = parts.length > 1 ? parts[1] : '';
        const now = new Date(); const currentYear = now.getFullYear();
        function extractRaw(dStr) {
            if (!dStr) return null;
            const dParts = dStr.split(/[./-]/);
            if (dParts.length === 2) return { hasYear: false, m: parseInt(dParts[0]), d: parseInt(dParts[1]) };
            if (dParts.length === 3) { let y = parseInt(dParts[0]); if (y < 100) y += 2000; return { hasYear: true, y: y, m: parseInt(dParts[1]), d: parseInt(dParts[2]) }; }
            return null;
        }
        let sRaw = extractRaw(startStr); let eRaw = extractRaw(endStr);
        function inferYear(m, d) {
            const d1 = new Date(currentYear - 1, m - 1, d); const d2 = new Date(currentYear, m - 1, d); const d3 = new Date(currentYear + 1, m - 1, d);
            const diff1 = Math.abs(now - d1); const diff2 = Math.abs(now - d2); const diff3 = Math.abs(now - d3);
            let minDiff = Math.min(diff1, diff2, diff3);
            if (minDiff === diff2) return currentYear; if (minDiff === diff1) return currentYear - 1; return currentYear + 1;
        }
        let startDate = null; let endDate = null;
        if (sRaw && eRaw) {
            if (!eRaw.hasYear && !sRaw.hasYear) {
                let inferredEndYear = inferYear(eRaw.m, eRaw.d); eRaw.y = inferredEndYear;
                if (sRaw.m > eRaw.m) sRaw.y = inferredEndYear - 1; else sRaw.y = inferredEndYear;
            } else if (!sRaw.hasYear && eRaw.hasYear) {
                if (sRaw.m > eRaw.m) sRaw.y = eRaw.y - 1; else sRaw.y = eRaw.y;
            } else if (sRaw.hasYear && !eRaw.hasYear) {
                if (sRaw.m > eRaw.m) eRaw.y = sRaw.y + 1; else eRaw.y = sRaw.y;
            }
        } else {
            if (sRaw && !sRaw.hasYear) sRaw.y = inferYear(sRaw.m, sRaw.d);
            if (eRaw && !eRaw.hasYear) eRaw.y = inferYear(eRaw.m, eRaw.d);
        }
        if (sRaw) startDate = new Date(sRaw.y, sRaw.m - 1, sRaw.d, 0, 0, 0);
        if (eRaw) endDate = new Date(eRaw.y, eRaw.m - 1, eRaw.d, 23, 59, 59);
        if (endDate && now > endDate) return 'ev-status-ended';
        if (startDate && now < startDate) return 'ev-status-upcoming';
        return 'ev-status-ongoing';
    } catch(e) { return 'ev-status-ongoing'; }
}

function getCharCompletionStatus(char) {
    let dailyTotal = 0, dailyChecked = 0; let weeklyTotal = 0, weeklyChecked = 0;
    const todayDay = ['일', '월', '화', '수', '목', '금', '토'][new Date().getDay()];
    categoriesInfo.forEach(cat => {
        const isDaily = cat.id.includes('daily');
        if (cat.id === 'daily') {
            appState.global.event.forEach(ev => {
                const status = getEventStatusClass(ev.period);
                const isForThisChar = !ev.targetChars || ev.targetChars.includes('all') || ev.targetChars.includes(char.id);
                if (status === 'ev-status-ongoing' && ev.days && ev.days.includes(todayDay) && isForThisChar) { const tid = `evtask-${ev.id}`; dailyTotal++; if (!!char.checks[tid]) dailyChecked++; }
            });
        }
        appState.global.tasksTemplate[cat.id].forEach(t => {
            if (char.hiddenTasks && char.hiddenTasks.includes(t.id)) return;
            if (t.isPaused) return;
            const isChecked = t.isShared ? !!appState.global.sharedChecks[t.id] : !!char.checks[t.id];
            if (isDaily) { dailyTotal++; if (isChecked) dailyChecked++; } else { weeklyTotal++; if (isChecked) weeklyChecked++; }
        });
        if (char.customTasks && char.customTasks[cat.id]) {
            char.customTasks[cat.id].forEach(t => {
                if (t.isPaused) return;
                const isChecked = t.isShared ? !!appState.global.sharedChecks[t.id] : !!char.checks[t.id];
                if (isDaily) { dailyTotal++; if (isChecked) dailyChecked++; } else { weeklyTotal++; if (isChecked) weeklyChecked++; }
            });
        }
    });
    const isDailyComplete = dailyTotal > 0 ? dailyTotal === dailyChecked : true;
    const isWeeklyComplete = weeklyTotal > 0 ? weeklyTotal === weeklyChecked : true;
    if (dailyTotal === 0 && weeklyTotal === 0) return 'green';
    if (!isDailyComplete) return 'red';
    if (isDailyComplete && !isWeeklyComplete) return 'yellow';
    return 'green';
}

function checkAndApplyAutoResets() {
    if (!appState || !appState.global) return;
    const now = new Date(); let lastDaily = new Date(now);
    if (now.getHours() < 6) lastDaily.setDate(lastDaily.getDate() - 1);
    lastDaily.setHours(6, 0, 0, 0);
    let lastWeekly = new Date(lastDaily); let dayOfWeek = lastWeekly.getDay(); let daysSinceMonday = (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
    lastWeekly.setDate(lastWeekly.getDate() - daysSinceMonday);
    let needsSave = false;
    
    if (!appState.global.lastDailyReset || appState.global.lastDailyReset < lastDaily.getTime()) {
        appState.global.lastDailyReset = lastDaily.getTime(); needsSave = true;
        for(let tid in appState.global.sharedChecks) {
            let isDaily = ['daily', 'daily-trade'].some(cat => appState.global.tasksTemplate[cat].some(t=>t.id===tid) || appState.characters.some(c=>c.customTasks[cat].some(t=>t.id===tid)));
            if(isDaily) delete appState.global.sharedChecks[tid];
        }
        appState.characters.forEach(char => {
            ['daily', 'daily-trade'].forEach(cat => {
                appState.global.tasksTemplate[cat].forEach(t => delete char.checks[t.id]);
                if(char.customTasks[cat]) char.customTasks[cat].forEach(t => delete char.checks[t.id]);
            });
            appState.global.event.forEach(ev => delete char.checks[`evtask-${ev.id}`]);
        });
    }
    if (!appState.global.lastWeeklyReset || appState.global.lastWeeklyReset < lastWeekly.getTime()) {
        appState.global.lastWeeklyReset = lastWeekly.getTime(); needsSave = true;
        for(let tid in appState.global.sharedChecks) {
            let isWeekly = ['weekly', 'weekly-trade'].some(cat => appState.global.tasksTemplate[cat].some(t=>t.id===tid) || appState.characters.some(c=>c.customTasks[cat].some(t=>t.id===tid)));
            if(isWeekly) delete appState.global.sharedChecks[tid];
        }
        appState.characters.forEach(char => {
            ['weekly', 'weekly-trade'].forEach(cat => {
                appState.global.tasksTemplate[cat].forEach(t => delete char.checks[t.id]);
                if(char.customTasks[cat]) char.customTasks[cat].forEach(t => delete char.checks[t.id]);
            });
        });
    }
    if (needsSave) saveData();
}

setInterval(() => { if (appState) { checkAndApplyAutoResets(); renderTabs(); renderCharacterTasks(); } }, 60000);

function loadData() {
    docRef.onSnapshot((doc) => {
        if (isLocalUpdate) { isLocalUpdate = false; return; }
        
        if (doc.exists) {
            appState = doc.data();
        } else { 
            appState = JSON.parse(JSON.stringify(DEFAULT_STATE));
        }
        
        cleanupEmptyTowns(); 
        checkAndApplyAutoResets(); 
        if(countdownInterval) clearInterval(countdownInterval);
        countdownInterval = setInterval(updateAbyssCountdown, 1000);
        
        renderAll();

        // 로딩 스피너 해제
        const spinner = document.getElementById('loading-spinner');
        const container = document.querySelector('.container');
        if (spinner) spinner.classList.add('fade-out');
        if (container) container.classList.add('loaded');
    }, (error) => { console.error("Firebase 데이터 읽기 에러:", error); });
}

function saveData() { 
    if (!appState || !docRef) return; 
    cleanupEmptyTowns(); 
    isLocalUpdate = true; 
    docRef.set(appState).catch(err => { console.error("Firebase 저장 에러: ", err); isLocalUpdate = false; }); 
}

function cleanupEmptyTowns() { categoriesInfo.forEach(cat => { if (!appState.global.towns[cat.id]) return; let usedTowns = new Set(); appState.global.tasksTemplate[cat.id].forEach(t => { if(t.town) usedTowns.add(t.town); }); appState.characters.forEach(c => { c.customTasks[cat.id].forEach(t => { if(t.town) usedTowns.add(t.town); }); }); for (let tName in appState.global.towns[cat.id]) { if (!usedTowns.has(tName)) delete appState.global.towns[cat.id][tName]; } }); }

// ==========================================
// 🌟 구글 계정 연동 & 백업 불러오기 함수
// ==========================================
function linkGoogleAccount() {
    const user = firebase.auth().currentUser;
    if (!user) { showToast("로그인 상태를 확인 중입니다."); return; }

    // 이미 연동되어 있다면 안내만 띄우고 종료
    const isLinked = user.providerData.some(p => p.providerId === 'google.com');
    if (isLinked) {
        showToast("✅ 이미 구글 계정과 안전하게 연동되어 있습니다.");
        return;
    }

    const provider = new firebase.auth.GoogleAuthProvider();
    
    // 1. 현재 익명 계정에 구글 계정을 묶어보는 시도 (백업)
    user.linkWithPopup(provider).then((result) => {
        showToast("🎉 구글 계정 연동 성공! 이제 기기를 바꿔도 데이터가 유지됩니다.");
        document.getElementById('auth-btn').innerText = '✅';
        document.getElementById('auth-btn').title = '구글 계정과 안전하게 연동됨';
    }).catch((error) => {
        // 2. 만약 에러가 났는데, 그 이유가 "이 구글 계정은 예전에 이미 연동한 적이 있다" 라면?
        if (error.code === 'auth/credential-already-in-use') {
            const credential = error.credential;
            // 익명 계정을 버리고 그 즉시 기존 구글 계정 데이터로 강제 로그인 (데이터 복구 모드)
            firebase.auth().signInWithCredential(credential).then((result) => {
                showToast("🔄 기존에 백업된 데이터로 성공적으로 로그인되었습니다!");
            }).catch((err) => {
                showToast("기존 데이터를 불러오는 중 오류가 발생했습니다.");
            });
        } else {
            console.error("구글 연동 에러:", error);
            showToast("연동 중 오류가 발생했습니다. 브라우저 팝업 차단을 확인해 주세요.");
        }
    });
}