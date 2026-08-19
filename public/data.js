// ==========================================
// 1. Firebase 설정 및 초기화
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
    try { firebase.initializeApp(firebaseConfig); } 
    catch(e) { console.error("Firebase 초기화 에러:", e); }
}

const db = firebase.firestore();
db.enablePersistence().catch(err => { console.warn("오프라인 모드 활성화 실패:", err); });

let docRef = null; 
let isServerSynced = false; // 🌟 자동 초기화용 전역 자물쇠

// ==========================================
// 2. 전역 상태 변수 및 기본 데이터 포맷
// ==========================================
const genId = () => Math.random().toString(36).substr(2, 9);
const pastelColors = ['#4a90e2', '#ff8787', '#fcc419', '#69db7c', '#b197fc', '#3bc9db', '#ffa8a8', '#e599f7', '#8ce99a', '#74c0fc'];

const categoriesInfo = [
    { id: 'daily', title: '☀️ 일일 숙제' }, 
    { id: 'daily-trade', title: '⚖️ 일일 물물 교환' },
    { id: 'weekly', title: '📅 주간 숙제' }, 
    { id: 'weekly-trade', title: '⚖️ 주간 물물 교환' }
];

let DEFAULT_STATE = null;

// 만약 템플릿 문서가 삭제됐을 경우를 대비한 최소 뼈대
const FALLBACK_STATE = { 
    global: { notices: [], event: [], memo: [], towns: { 'daily': {}, 'daily-trade': {}, 'weekly': {}, 'weekly-trade': {} }, tasksTemplate: { 'daily': [], 'daily-trade': [], 'weekly': [], 'weekly-trade': [] }, sharedChecks: {}, abyss: { baseTime: "" } }, 
    characters: [], 
    activeTabId: "" 
};

let uiState = { showCompleted: { 'daily': false, 'daily-trade': false, 'weekly': false, 'weekly-trade': false } };
let appState = null;
let editingEventId = null; 
let selectedEventDays = []; 
let currentlyEditingTask = null; 
let deleteTarget = null;
let countdownInterval = null;
let notifiedAbyssTime = null;

// ==========================================
// 3. 인증 및 초기 데이터 로드 (Firebase 템플릿 적용)
// ==========================================
firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
        document.getElementById('landing-page')?.classList.add('hidden');
        
        // 🌟 신규/기존 유저 상관없이 아직 DEFAULT_STATE가 없다면 파이어베이스에서 템플릿을 읽어옴
        if (!DEFAULT_STATE) {
            try {
                const templateSnap = await db.collection("mabi_tracker").doc("DEFAULT_TEMPLATE").get();
                if (templateSnap.exists) {
                    DEFAULT_STATE = templateSnap.data(); // DB 템플릿 적용
                } else {
                    DEFAULT_STATE = JSON.parse(JSON.stringify(FALLBACK_STATE)); 
                }
            } catch (error) {
                console.error("템플릿 로드 실패, 기본 뼈대 사용:", error);
                DEFAULT_STATE = JSON.parse(JSON.stringify(FALLBACK_STATE));
            }
        }

        docRef = db.collection("mabi_tracker").doc(user.uid);
        
        const isLinked = user.providerData.some(p => p.providerId === 'google.com');
        const authBtn = document.getElementById('auth-btn');
        if (authBtn) {
            authBtn.innerText = isLinked ? '✅' : '💾'; 
            authBtn.title = isLinked ? '구글 계정과 안전하게 연동됨' : '구글 계정 연동 (데이터 백업)';
        }
        
        loadData();
    } else {
        // 로그인 정보가 없으면 랜딩 페이지 표시
        document.getElementById('loading-spinner')?.classList.add('fade-out');
        document.getElementById('landing-page')?.classList.remove('hidden');
    }
});

// 🌟 [신규 추가] '새로 시작하기' 버튼 누를 때 동작
function startNewAnonymous() {
    document.getElementById('loading-spinner')?.classList.remove('fade-out'); // 로딩 켜기
    firebase.auth().signInAnonymously().catch(error => {
        console.error("익명 로그인 실패:", error);
        document.getElementById('loading-spinner')?.classList.add('fade-out');
        showToast("신규 생성 중 오류가 발생했습니다.");
    });
}

// 🌟 [신규 추가] '구글 계정 로그인' 버튼 누를 때 동작
function loginExistingGoogle() {
    document.getElementById('loading-spinner')?.classList.remove('fade-out'); // 로딩 켜기
    const provider = new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(provider).catch((error) => {
        console.error("구글 로그인 실패:", error);
        document.getElementById('loading-spinner')?.classList.add('fade-out');
        showToast("로그인 중 오류가 발생했습니다. 브라우저 팝업 차단을 확인해 주세요.");
    });
}

function linkGoogleAccount() {
    const user = firebase.auth().currentUser;
    if (!user) { showToast("로그인 상태를 확인 중입니다."); return; }
    if (user.providerData.some(p => p.providerId === 'google.com')) { showToast("✅ 이미 구글 계정과 안전하게 연동되어 있습니다."); return; }

    const provider = new firebase.auth.GoogleAuthProvider();
    user.linkWithPopup(provider).then(() => {
        showToast("🎉 구글 계정 연동 성공! 이제 기기를 바꿔도 데이터가 유지됩니다.");
        document.getElementById('auth-btn').innerText = '✅';
    }).catch((error) => {
        if (error.code === 'auth/credential-already-in-use') {
            firebase.auth().signInWithCredential(error.credential).then(() => { showToast("🔄 기존에 백업된 데이터로 성공적으로 로그인되었습니다!"); })
            .catch(() => showToast("기존 데이터를 불러오는 중 오류가 발생했습니다."));
        } else { showToast("연동 중 오류가 발생했습니다. 브라우저 팝업 차단을 확인해 주세요."); }
    });
}

// ==========================================
// 4. 데이터 로드 및 저장 통제 (사용자 조작 락 해제 및 무한 로딩 수정)
// ==========================================
function loadData() {
    // (상단 setTimeout 부분은 그대로 유지)
    setTimeout(() => { 
        if (!isServerSynced) {
            isServerSynced = true; 
            if (!appState) {
                appState = JSON.parse(JSON.stringify(DEFAULT_STATE));
                renderAll();
            }
            checkAndApplyAutoResets(); 
            document.getElementById('loading-spinner')?.classList.add('fade-out');
            document.querySelector('.container')?.classList.add('loaded');
        }
    }, 3000);

    docRef.onSnapshot((doc) => {
        const isFromCache = doc.metadata.fromCache;
        if (!isFromCache) {
            isServerSynced = true; 
        }

        const newData = doc.exists ? doc.data() : JSON.parse(JSON.stringify(DEFAULT_STATE));
        
        if (isServerSynced && appState && JSON.stringify(appState) === JSON.stringify(newData)) {
            return;
        }

        appState = newData;
        cleanupEmptyTowns(); 
        
        // 🌟 [순서 수정] 뼈대(DOM)를 먼저 그려서 에러를 방지합니다.
        renderAll();
        
        // 🌟 [순서 수정] 화면이 준비된 상태에서 초기화 검사를 진행합니다.
        checkAndApplyAutoResets(); 

        if (countdownInterval) clearInterval(countdownInterval);
        countdownInterval = setInterval(updateAbyssCountdown, 1000);
        
        // 🌟 (기존에 맨 밑에 있던 renderAll(); 은 위로 올렸으므로 여기서 삭제합니다)

        // 정상적으로 서버에서 데이터를 받았을 때 스피너 제거
        document.getElementById('loading-spinner')?.classList.add('fade-out');
        document.querySelector('.container')?.classList.add('loaded');
    }, (error) => {
        console.error("Firebase 데이터 읽기 에러:", error);
        document.getElementById('loading-spinner')?.classList.add('fade-out');
    });
}
function saveData() { 
    // 🌟 수동 저장 제한 해제! 사용자가 버튼 누르면 자물쇠 상관없이 즉각 저장
    if (!appState || !docRef) return; 
    cleanupEmptyTowns(); 
    docRef.set(appState).catch(err => console.error("Firebase 저장 에러: ", err)); 
}

function updateAppState(updaterFn, renderFns = [renderAll]) {
    // 🌟 수동 갱신 제한 해제! 토스트 메시지 띄우지 않고 바로 명령 수행
    if (updaterFn) updaterFn(); 
    saveData(); 
    if (renderFns && renderFns.length > 0) { renderFns.forEach(fn => fn()); } 
}

function cleanupEmptyTowns() { 
    categoriesInfo.forEach(cat => { 
        if (!appState.global.towns[cat.id]) return; 
        let usedTowns = new Set(); 
        appState.global.tasksTemplate[cat.id].forEach(t => { if (t.town) usedTowns.add(t.town); }); 
        appState.characters.forEach(c => { c.customTasks[cat.id].forEach(t => { if (t.town) usedTowns.add(t.town); }); }); 
        for (let tName in appState.global.towns[cat.id]) { if (!usedTowns.has(tName)) delete appState.global.towns[cat.id][tName]; } 
    }); 
}

// ==========================================
// 5. 초기화 및 유틸리티 함수
// ==========================================
function checkAndApplyAutoResets() {
    // 🌟 자동 초기화는 여전히 자물쇠(isServerSynced)가 풀려야만 작동 (데이터 롤백 대참사 방어)
    if (!appState || !appState.global || !isServerSynced) return;

    const now = new Date(); let lastDaily = new Date(now);
    if (now.getHours() < 6) lastDaily.setDate(lastDaily.getDate() - 1);
    lastDaily.setHours(6, 0, 0, 0);
    
    let lastWeekly = new Date(lastDaily); let dayOfWeek = lastWeekly.getDay(); 
    lastWeekly.setDate(lastWeekly.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    
    let needsSave = false;
    
    if (!appState.global.lastDailyReset || appState.global.lastDailyReset < lastDaily.getTime()) {
        appState.global.lastDailyReset = lastDaily.getTime(); needsSave = true;
        for (let tid in appState.global.sharedChecks) {
            let isDaily = ['daily', 'daily-trade'].some(cat => appState.global.tasksTemplate[cat].some(t => t.id === tid) || appState.characters.some(c => c.customTasks[cat].some(t => t.id === tid)));
            if (isDaily|| tid.startsWith('evtask-')) delete appState.global.sharedChecks[tid];
        }
        appState.characters.forEach(char => {
            ['daily', 'daily-trade'].forEach(cat => { appState.global.tasksTemplate[cat].forEach(t => delete char.checks[t.id]); if (char.customTasks[cat]) char.customTasks[cat].forEach(t => delete char.checks[t.id]); });
            appState.global.event.forEach(ev => delete char.checks[`evtask-${ev.id}`]);
        });
    }
    
    if (!appState.global.lastWeeklyReset || appState.global.lastWeeklyReset < lastWeekly.getTime()) {
        appState.global.lastWeeklyReset = lastWeekly.getTime(); needsSave = true;
        for (let tid in appState.global.sharedChecks) {
            let isWeekly = ['weekly', 'weekly-trade'].some(cat => appState.global.tasksTemplate[cat].some(t => t.id === tid) || appState.characters.some(c => c.customTasks[cat].some(t => t.id === tid)));
            if (isWeekly) delete appState.global.sharedChecks[tid];
        }
        appState.characters.forEach(char => { ['weekly', 'weekly-trade'].forEach(cat => { appState.global.tasksTemplate[cat].forEach(t => delete char.checks[t.id]); if (char.customTasks[cat]) char.customTasks[cat].forEach(t => delete char.checks[t.id]); }); });
    }
    
    if (needsSave) {
        saveData();
        renderTabs();
        renderCharacterTasks();
    }
}

setInterval(() => { if (appState) checkAndApplyAutoResets(); }, 60000);

function formatDateKor(isoStr, includeYear=true) {
    if (!isoStr) return ""; const d = new Date(isoStr); const y = d.getFullYear(); const m = d.getMonth() + 1; const day = d.getDate(); const week = ['일','월','화','수','목','금','토'][d.getDay()]; let h = d.getHours(); const min = String(d.getMinutes()).padStart(2, '0'); const ampm = h >= 12 ? '오후' : '오전'; h = h % 12; if (h === 0) h = 12;
    return `${includeYear ? y+'년 ' : ''}${m}월 ${day}일(${week}) ${ampm} ${h}시 ${min}분`;
}

function getEventStatusClass(periodStr) {
    try {
        if (!periodStr) return 'ev-status-ongoing';
        const parts = periodStr.split('~').map(s => s.trim()); const startStr = parts[0] || ''; const endStr = parts.length > 1 ? parts[1] : ''; const now = new Date(); const currentYear = now.getFullYear();
        function extractRaw(dStr) {
            if (!dStr) return null; const dParts = dStr.split(/[./-]/);
            if (dParts.length === 2) return { hasYear: false, m: parseInt(dParts[0]), d: parseInt(dParts[1]) };
            if (dParts.length === 3) { let y = parseInt(dParts[0]); if (y < 100) y += 2000; return { hasYear: true, y: y, m: parseInt(dParts[1]), d: parseInt(dParts[2]) }; } return null;
        }
        let sRaw = extractRaw(startStr); let eRaw = extractRaw(endStr);
        function inferYear(m, d) {
            const d1 = new Date(currentYear - 1, m - 1, d); const d2 = new Date(currentYear, m - 1, d); const d3 = new Date(currentYear + 1, m - 1, d);
            const diff1 = Math.abs(now - d1); const diff2 = Math.abs(now - d2); const diff3 = Math.abs(now - d3);
            return (Math.min(diff1, diff2, diff3) === diff2) ? currentYear : ((Math.min(diff1, diff2, diff3) === diff1) ? currentYear - 1 : currentYear + 1);
        }
        if (sRaw && eRaw) {
            if (!eRaw.hasYear && !sRaw.hasYear) { let inferredEndYear = inferYear(eRaw.m, eRaw.d); eRaw.y = inferredEndYear; sRaw.y = (sRaw.m > eRaw.m) ? inferredEndYear - 1 : inferredEndYear; }
            else if (!sRaw.hasYear && eRaw.hasYear) { sRaw.y = (sRaw.m > eRaw.m) ? eRaw.y - 1 : eRaw.y; }
            else if (sRaw.hasYear && !eRaw.hasYear) { eRaw.y = (sRaw.m > eRaw.m) ? sRaw.y + 1 : sRaw.y; }
        } else { if (sRaw && !sRaw.hasYear) sRaw.y = inferYear(sRaw.m, sRaw.d); if (eRaw && !eRaw.hasYear) eRaw.y = inferYear(eRaw.m, eRaw.d); }
        let startDate = sRaw ? new Date(sRaw.y, sRaw.m - 1, sRaw.d, 0, 0, 0) : null; let endDate = eRaw ? new Date(eRaw.y, eRaw.m - 1, eRaw.d, 23, 59, 59) : null;
        
        if (endDate && now > endDate) return 'ev-status-ended'; 
        if (startDate && now < startDate) return 'ev-status-upcoming'; 
        
        if (endDate && now.getFullYear() === endDate.getFullYear() && now.getMonth() === endDate.getMonth() && now.getDate() === endDate.getDate()) { return 'ev-status-closing'; }

        return 'ev-status-ongoing';
    } catch(e) { return 'ev-status-ongoing'; }
}

function getCharCompletionStatus(char) {
    let dailyTotal = 0, dailyChecked = 0; let weeklyTotal = 0, weeklyChecked = 0;
    const now = new Date();
    if (now.getHours() < 6) { now.setDate(now.getDate() - 1); }
    const todayDay = ['일', '월', '화', '수', '목', '금', '토'][now.getDay()];
    categoriesInfo.forEach(cat => {
        const isDaily = cat.id.includes('daily');
        if (cat.id === 'daily') {
            appState.global.event.forEach(ev => {
                const status = getEventStatusClass(ev.period); const isForThisChar = !ev.targetChars || ev.targetChars.includes('all') || ev.targetChars.includes(char.id);
                if (cat.id === 'daily') {
            appState.global.event.forEach(ev => {
                const status = getEventStatusClass(ev.period); const isForThisChar = !ev.targetChars || ev.targetChars.includes('all') || ev.targetChars.includes(char.id);
                if ((status === 'ev-status-ongoing' || status === 'ev-status-closing') && ev.days && ev.days.includes(todayDay) && isForThisChar) { 
                    dailyTotal++; 
                    // ✨ 공유 여부에 따라 체크 내역을 다르게 읽어오도록 수정
                    const isEvChecked = ev.isShared ? !!appState.global.sharedChecks[`evtask-${ev.id}`] : !!char.checks[`evtask-${ev.id}`];
                    if (isEvChecked) dailyChecked++; 
                }
            });
        }
            });
        }
        appState.global.tasksTemplate[cat.id].forEach(t => {
            if (char.hiddenTasks && char.hiddenTasks.includes(t.id)) return; if (t.isPaused) return;
            const isChecked = t.isShared ? !!appState.global.sharedChecks[t.id] : !!char.checks[t.id];
            if (isDaily) { dailyTotal++; if (isChecked) dailyChecked++; } else { weeklyTotal++; if (isChecked) weeklyChecked++; }
        });
        if (char.customTasks && char.customTasks[cat.id]) {
            char.customTasks[cat.id].forEach(t => {
                if (t.isPaused) return; const isChecked = t.isShared ? !!appState.global.sharedChecks[t.id] : !!char.checks[t.id];
                if (isDaily) { dailyTotal++; if (isChecked) dailyChecked++; } else { weeklyTotal++; if (isChecked) weeklyChecked++; }
            });
        }
    });
    if (dailyTotal === 0 && weeklyTotal === 0) return 'green';
    if (!(dailyTotal > 0 ? dailyTotal === dailyChecked : true)) return 'red';
    if ((dailyTotal > 0 ? dailyTotal === dailyChecked : true) && !(weeklyTotal > 0 ? weeklyTotal === weeklyChecked : true)) return 'yellow';
    return 'green';
}