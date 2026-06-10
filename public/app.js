// =========================================================================
// 🌟 1. Firebase 환경 설정 (본인의 키값으로 유지해주세요)
// =========================================================================
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
const docRef = db.collection("mabi_tracker").doc("my_data"); 

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

let uiState = { showCompleted: { 'daily': false, 'daily-trade': false, 'weekly': false, 'weekly-trade': false } };
let appState = null;
let isLocalUpdate = false;

let editingEventId = null; 
let selectedEventDays = []; 
let currentlyEditingTask = null; 
let deleteTarget = null;
let countdownInterval = null;
let notifiedAbyssTime = null;

// --- 🌟 알림 권한 요청 ---
function requestNotificationPermission() {
    if (!("Notification" in window)) {
        alert("이 브라우저는 알림 기능을 지원하지 않습니다.");
        return;
    }
    Notification.requestPermission().then(permission => {
        if (permission === "granted") {
            alert("🔔 알림이 켜졌습니다! 어비스 구멍 시간이 되면 알려드릴게요.");
            new Notification("마비노기 모바일 트래커", { body: "이렇게 알림이 올 거예요!" });
        } else {
            alert("알림이 차단되어 있습니다. 브라우저 주소창 왼쪽 자물쇠 아이콘에서 알림을 허용해주세요.");
        }
    });
}

function formatDateKor(isoStr, includeYear=true) {
    if(!isoStr) return "";
    const d = new Date(isoStr);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const week = ['일','월','화','수','목','금','토'][d.getDay()];
    let h = d.getHours();
    const min = String(d.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? '오후' : '오전';
    h = h % 12; if(h === 0) h = 12;
    return `${includeYear ? y+'년 ' : ''}${m}월 ${day}일(${week}) ${ampm} ${h}시 ${min}분`;
}

// --- 🌟 어비스 구멍 스케줄 ---
function renderAbyssSchedule() {
    if(!appState || !appState.global || !appState.global.abyss) return;
    const baseTimeStr = appState.global.abyss.baseTime;
    if(!baseTimeStr) return;

    const baseDate = new Date(baseTimeStr);
    if(isNaN(baseDate.getTime())) return;

    const intervalMs = 130500000; 
    const timelineEl = document.getElementById('abyss-timeline');
    timelineEl.innerHTML = '';

    let times = [];
    for(let i=0; i<5; i++) {
        times.push(new Date(baseDate.getTime() + i * intervalMs));
    }

    let nextTime = times.find(t => t.getTime() > Date.now());
    if(!nextTime) nextTime = times[times.length - 1]; 

    document.getElementById('abyss-next-time').innerText = formatDateKor(nextTime.toISOString(), false);
    document.getElementById('abyss-countdown').dataset.target = nextTime.getTime();
    updateAbyssCountdown();

    times.forEach((t, index) => {
        let isPast = t.getTime() < Date.now();
        let itemClass = index === 0 ? 'base-time' : 'future-time';
        if(isPast) itemClass += ' past-time';
        
        timelineEl.innerHTML += `
            <div class="timeline-item ${itemClass}">
                ${formatDateKor(t.toISOString(), true)}
            </div>
        `;
    });
}

function updateAbyssCountdown() {
    const el = document.getElementById('abyss-countdown');
    if(!el || !el.dataset.target) return;
    
    const targetTime = parseInt(el.dataset.target);
    const diff = targetTime - Date.now();
    
    if(diff <= 0) {
        el.innerText = "발생 중 (또는 지남)";
        el.style.color = "var(--danger)";
        
        if (diff > -60000 && notifiedAbyssTime !== targetTime && Notification.permission === "granted") {
            new Notification("🌌 어비스 구멍 발생!", {
                body: "지금 어비스 구멍이 열렸습니다! 게임에 접속하세요."
            });
            notifiedAbyssTime = targetTime; 
        }

        if(diff < -60000) renderAbyssSchedule(); 
    } else {
        const h = Math.floor(diff / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        el.innerText = `${h > 0 ? h+'시간 ' : ''}${m}분 남음`;
        el.style.color = "var(--text-muted)";
        
        if (notifiedAbyssTime !== targetTime) {
            notifiedAbyssTime = null;
        }
    }
}

function toggleAbyssSchedule() {
    document.getElementById('abyss-timeline').classList.toggle('hidden');
}

function saveAbyssTime() {
    const val = document.getElementById('input-abyss').value; 
    if(!val) { alert('시간을 선택해주세요.'); return; }
    
    appState.global.abyss.baseTime = new Date(val).toISOString();
    document.getElementById('add-wrap-abyss').classList.add('hidden');
    saveData(); renderGlobal();
}

// --- 🌟 상태 및 진행도 ---
function getCharCompletionStatus(char) {
    let dailyTotal = 0, dailyChecked = 0;
    let weeklyTotal = 0, weeklyChecked = 0;
    const todayDay = ['일', '월', '화', '수', '목', '금', '토'][new Date().getDay()];

    categoriesInfo.forEach(cat => {
        const isDaily = cat.id.includes('daily');
        if (cat.id === 'daily') {
            appState.global.event.forEach(ev => {
                const status = getEventStatusClass(ev.period);
                const isForThisChar = !ev.targetChars || ev.targetChars.includes('all') || ev.targetChars.includes(char.id);
                // 진행 중인 이벤트만 반영
                if (status === 'ev-status-ongoing' && ev.days && ev.days.includes(todayDay) && isForThisChar) {
                    const tid = `evtask-${ev.id}`;
                    dailyTotal++;
                    if (!!char.checks[tid]) dailyChecked++;
                }
            });
        }
        appState.global.tasksTemplate[cat.id].forEach(t => {
            if (char.hiddenTasks && char.hiddenTasks.includes(t.id)) return;
            if (t.isPaused) return;
            const isChecked = t.isShared ? !!appState.global.sharedChecks[t.id] : !!char.checks[t.id];
            if (isDaily) { dailyTotal++; if (isChecked) dailyChecked++; }
            else { weeklyTotal++; if (isChecked) weeklyChecked++; }
        });
        if (char.customTasks && char.customTasks[cat.id]) {
            char.customTasks[cat.id].forEach(t => {
                if (t.isPaused) return;
                const isChecked = t.isShared ? !!appState.global.sharedChecks[t.id] : !!char.checks[t.id];
                if (isDaily) { dailyTotal++; if (isChecked) dailyChecked++; }
                else { weeklyTotal++; if (isChecked) weeklyChecked++; }
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
    const now = new Date();
    let lastDaily = new Date(now);
    if (now.getHours() < 6) lastDaily.setDate(lastDaily.getDate() - 1);
    lastDaily.setHours(6, 0, 0, 0);

    let lastWeekly = new Date(lastDaily);
    let dayOfWeek = lastWeekly.getDay(); 
    let daysSinceMonday = (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
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

// --- 🌟 데이터 로드 및 저장 ---
function loadData() {
    docRef.onSnapshot((doc) => {
        if (isLocalUpdate) { isLocalUpdate = false; return; }
        if (doc.exists) {
            appState = doc.data();
            if(!appState.global.lastDailyReset) appState.global.lastDailyReset = 0;
            if(!appState.global.lastWeeklyReset) appState.global.lastWeeklyReset = 0;
            if(!appState.global.towns) appState.global.towns = { 'daily': {}, 'daily-trade': {}, 'weekly': {}, 'weekly-trade': {} };
            if(!appState.global.sharedChecks) appState.global.sharedChecks = {};
            
            if(!appState.global.abyss) appState.global.abyss = { baseTime: "" };
            if(appState.global.abyss.time && !appState.global.abyss.baseTime) {
                appState.global.abyss.baseTime = new Date().toISOString(); 
            }

            if(!appState.global.notices) appState.global.notices = [];
            appState.global.event.forEach(ev => { if(!ev.targetChars) ev.targetChars = ['all']; });

            let pastOrder = 1000;
            categoriesInfo.forEach(cat => {
                if (!appState.global.towns[cat.id]) appState.global.towns[cat.id] = {};
                if (appState.global.tasksTemplate[cat.id]) {
                    appState.global.tasksTemplate[cat.id].forEach((t, idx) => { 
                        if (!t.order) t.order = pastOrder + idx * 10; 
                        if (typeof t.isShared === 'undefined') t.isShared = false;
                    });
                }
                appState.characters.forEach(char => {
                    if(!char.customTasks) char.customTasks = { 'daily': [], 'daily-trade': [], 'weekly': [], 'weekly-trade': [] };
                    if(!char.hiddenTasks) char.hiddenTasks = [];
                    if (char.customTasks[cat.id]) {
                        char.customTasks[cat.id].forEach((t, idx) => { 
                            if (!t.order) t.order = pastOrder + idx * 10 + 5; 
                            if (typeof t.isShared === 'undefined') t.isShared = false;
                        });
                    }
                });
            });
        } else { appState = JSON.parse(JSON.stringify(DEFAULT_STATE)); }
        
        cleanupEmptyTowns();
        checkAndApplyAutoResets(); 
        
        if(countdownInterval) clearInterval(countdownInterval);
        countdownInterval = setInterval(updateAbyssCountdown, 1000);

        renderAll();
    }, (error) => { console.error("Firebase 데이터 읽기 에러:", error); });
}

function saveData() {
    if (!appState) return;
    cleanupEmptyTowns();
    isLocalUpdate = true;
    docRef.set(appState).catch(err => { console.error("Firebase 저장 에러: ", err); isLocalUpdate = false; });
}

function cleanupEmptyTowns() {
    categoriesInfo.forEach(cat => {
        if (!appState.global.towns[cat.id]) return;
        let usedTowns = new Set();
        appState.global.tasksTemplate[cat.id].forEach(t => { if(t.town) usedTowns.add(t.town); });
        appState.characters.forEach(c => { c.customTasks[cat.id].forEach(t => { if(t.town) usedTowns.add(t.town); }); });
        for (let tName in appState.global.towns[cat.id]) {
            if (!usedTowns.has(tName)) delete appState.global.towns[cat.id][tName];
        }
    });
}

// --- 🌟 폼 렌더링 도구 ---
function getTaskFormHTML(categoryId, task = null, isGlobal = true) {
    const isTrade = categoryId.includes('trade');
    const tid = task ? task.id : 'new';
    const fid = `${categoryId}-${tid}`; 
    
    const vTown = task && task.town ? task.town : '';
    const vNpc = task && task.npc ? task.npc : '';
    const vLabel = task && !isTrade ? task.label : '';
    const vFrom = task && isTrade ? task.fromItem : '';
    const vFromQ = task && isTrade ? task.fromQty : '';
    const vTo = task && isTrade ? task.toItem : '';
    const vToQ = task && isTrade ? task.toQty : '';
    
    const isIndiv = task ? !task.isShared : true;
    const isPaused = task ? !!task.isPaused : false;

    let chipsHtml = `<div class="target-chars-wrap" id="chips-${fid}">`;
    appState.characters.forEach(c => {
        let isSelected = true;
        if (task) {
            if (isGlobal) { if (c.hiddenTasks && c.hiddenTasks.includes(tid)) isSelected = false; } 
            else { if (!c.customTasks[categoryId].some(t => t.id === tid)) isSelected = false; }
        }
        chipsHtml += `<div class="char-chip ${isSelected ? 'selected' : ''}" onclick="this.classList.toggle('selected')" data-char-id="${c.id}">${c.name}</div>`;
    });
    chipsHtml += `</div>`;

    let inputsHtml = isTrade ? `
        <div class="form-row">
            <input type="text" id="npc-${fid}" placeholder="NPC 이름 (선택)" value="${vNpc}">
        </div>
        <div class="trade-input-row" style="padding:0; background:transparent;">
            <input type="text" id="from-${fid}" placeholder="보유 템" value="${vFrom}">
            <input type="number" id="from-qty-${fid}" placeholder="수량" value="${vFromQ}">
            <span class="trade-arrow-icon">→</span>
            <input type="text" id="to-${fid}" placeholder="목표 템" value="${vTo}">
            <input type="number" id="to-qty-${fid}" placeholder="수량" value="${vToQ}">
        </div>
    ` : `
        <div class="form-row">
            <input type="text" id="label-${fid}" placeholder="숙제 내용..." value="${vLabel}">
        </div>
    `;

    let moveBtnsHtml = task ? `
        <button type="button" class="action-icon-btn" onclick="moveBlock('${categoryId}', 'task', '${tid}', 'up')" title="위로 이동">▲</button>
        <button type="button" class="action-icon-btn" onclick="moveBlock('${categoryId}', 'task', '${tid}', 'down')" title="아래로 이동">▼</button>
    ` : '';

    return `
        <div class="inline-form-box">
            ${chipsHtml}
            <div class="form-row">
                <label class="checkbox-label" title="체크 해제 시 원정대(계정) 전체 공유됩니다">
                    <input type="checkbox" id="indiv-${fid}" ${isIndiv ? 'checked' : ''}> 개별
                </label>
                <label class="checkbox-label" style="color:var(--danger)" title="당분간 하지 않을 항목은 비활성화 해두세요">
                    <input type="checkbox" id="paused-${fid}" ${isPaused ? 'checked' : ''}> ⏸️ 비활성화
                </label>
                <input type="text" id="town-${fid}" placeholder="마을 이름 (선택: 같은 마을끼리 묶임)" value="${vTown}">
            </div>
            ${inputsHtml}
            <div class="form-actions">
                ${moveBtnsHtml}
                <button type="button" class="btn-cancel" onclick="cancelEdit('${categoryId}', '${tid}')">취소</button>
                <button type="button" class="btn-submit ${task ? 'edit' : ''}" onclick="saveTask('${categoryId}', '${tid}', ${isGlobal})">${task ? '수정' : '추가'}</button>
            </div>
        </div>
    `;
}

function getEventStatusClass(periodStr) {
    try {
        if (!periodStr) return 'ev-status-ongoing';
        const parts = periodStr.split('~').map(s => s.trim());
        if (parts.length !== 2) return 'ev-status-ongoing';
        const now = new Date(); const currentYear = now.getFullYear();
        function parseDate(dStr, isEnd) {
            const dParts = dStr.split(/[./-]/);
            if (dParts.length === 2) return new Date(currentYear, parseInt(dParts[0])-1, parseInt(dParts[1]), isEnd?23:0, isEnd?59:0, isEnd?59:0);
            if (dParts.length === 3) {
                let y = parseInt(dParts[0]); if (y < 100) y += 2000;
                return new Date(y, parseInt(dParts[1])-1, parseInt(dParts[2]), isEnd?23:0, isEnd?59:0, isEnd?59:0);
            }
            return null;
        }
        const startDate = parseDate(parts[0], false); const endDate = parseDate(parts[1], true);
        if (!startDate || !endDate) return 'ev-status-ongoing';
        if (now < startDate) return 'ev-status-upcoming'; 
        if (now > endDate) return 'ev-status-ended';     
        return 'ev-status-ongoing'; 
    } catch(e) { return 'ev-status-ongoing'; }
}

// --- 🌟 전체 렌더링 ---
function renderAll() { renderGlobal(); renderTabs(); renderTaskCards(); renderCharacterTasks(); }

function renderGlobal() {
    renderAbyssSchedule();

    const noticeList = document.getElementById('list-notice');
    noticeList.innerHTML = '';
    if(appState.global.notices.length === 0) {
        noticeList.innerHTML = `<li class="task-item" style="color:var(--text-muted); justify-content:center; font-size:0.9rem; border:none;">등록된 공지사항이 없습니다.</li>`;
    } else {
        appState.global.notices.forEach(n => {
            let titleHTML = n.url ? `<a href="${n.url}" target="_blank" style="color:var(--text-main); text-decoration:none; font-weight:bold;">• ${n.title} 🔗</a>` : `<span>• ${n.title}</span>`;
            noticeList.innerHTML += `
                <li class="task-item" style="padding: 6px 0;">
                    <div class="task-content" style="font-size:0.95rem;">${titleHTML}</div>
                    <button class="icon-btn delete-btn" onclick="deleteNotice('${n.id}')">✕</button>
                </li>`;
        });
    }

    const eventList = document.getElementById('list-event');
    eventList.innerHTML = '';
    appState.global.event.forEach(ev => {
        const statusClass = getEventStatusClass(ev.period);
        const daysStr = (ev.days && ev.days.length > 0) ? `[${ev.days.join(', ')}]` : '';
        eventList.innerHTML += `
            <li class="event-item">
                <div class="event-grid">
                    <span class="col-period ${statusClass}">${ev.period}</span>
                    <span class="col-title">${ev.title}</span>
                    <span class="col-days">${daysStr}</span>
                    <span class="col-memo1">${ev.memo1}</span>
                    <span class="col-memo2">${ev.memo2}</span>
                    <div class="col-actions">
                        <button class="icon-btn edit-btn" onclick="editEvent('${ev.id}')" title="수정">✏️</button>
                        <button class="icon-btn delete-btn" onclick="deleteGlobal('event', '${ev.id}')" title="삭제">✕</button>
                    </div>
                </div>
            </li>
        `;
    });

    const memoList = document.getElementById('list-memo');
    memoList.innerHTML = '';
    appState.global.memo.forEach(memo => {
        memoList.innerHTML += `<li class="task-item"><div class="task-content"><span>• ${memo.label}</span></div><button class="icon-btn delete-btn" onclick="deleteGlobal('memo', '${memo.id}')">✕</button></li>`;
    });
}

function renderTabs() {
    const container = document.getElementById('tabs-container');
    container.innerHTML = '';
    appState.characters.forEach(char => {
        const btn = document.createElement('button');
        const isActive = appState.activeTabId === char.id;
        btn.className = `tab-btn ${isActive ? 'active' : ''}`;
        if(isActive) btn.title = "한 번 더 누르면 이름을 변경합니다";
        
        const status = getCharCompletionStatus(char);
        let statusClass = '';
        if(status === 'red') statusClass = 'status-red';
        else if(status === 'yellow') statusClass = 'status-yellow';
        else if(status === 'green') statusClass = 'status-green';

        btn.innerHTML = `${char.name} <span class="status-check ${statusClass}">✔</span>`;
        btn.onclick = () => { isActive ? renameCharacter(char.id) : switchTab(char.id); };
        container.appendChild(btn);
    });
    const addBtn = document.createElement('button');
    addBtn.className = 'tab-btn tab-add-btn'; addBtn.innerText = '+ 캐릭 추가'; addBtn.onclick = addNewCharacter;
    container.appendChild(addBtn);
}

function renderTaskCards() {
    const container = document.getElementById('character-content');
    container.innerHTML = '';
    categoriesInfo.forEach(cat => {
        container.innerHTML += `
            <div class="card">
                <div class="card-header">
                    <h2>${cat.title}</h2>
                    <div class="toggle-group">
                        <button class="toggle-btn" onclick="toggleCompleted('${cat.id}')" id="btn-toggle-${cat.id}" title="완료 항목 보기/숨기기">∨</button>
                        <button class="toggle-btn" onclick="toggleInput('${cat.id}')" title="항목 열기">＋</button>
                    </div>
                </div>
                <ul class="task-list" id="list-${cat.id}"></ul>
                <div class="add-wrap hidden" id="add-wrap-${cat.id}"></div>
            </div>
        `;
        document.getElementById(`add-wrap-${cat.id}`).innerHTML = getTaskFormHTML(cat.id);
    });
}

function renderCharacterTasks() {
    const activeChar = appState.characters.find(c => c.id === appState.activeTabId);
    if (!activeChar) return;
    const todayDay = ['일', '월', '화', '수', '목', '금', '토'][new Date().getDay()];

    categoriesInfo.forEach(cat => {
        const listEl = document.getElementById(`list-${cat.id}`);
        listEl.innerHTML = '';
        
        let globalTasks = appState.global.tasksTemplate[cat.id].filter(t => !activeChar.hiddenTasks.includes(t.id)).map(t => ({...t, isGlobal: true}));
        let customTasks = (activeChar.customTasks && activeChar.customTasks[cat.id]) ? activeChar.customTasks[cat.id].map(t => ({...t, isGlobal: false})) : [];
        let allTasks = [...globalTasks, ...customTasks];

        let blocks = [];
        let townMap = {};

        allTasks.forEach(task => {
            if (task.town) {
                if (!townMap[task.town]) townMap[task.town] = [];
                townMap[task.town].push(task);
            } else {
                blocks.push({ type: 'task', order: task.order || 0, task: task });
            }
        });

        for (let tName in townMap) {
            let tOrder = appState.global.towns[cat.id]?.[tName]?.order || 0;
            let tColor = appState.global.towns[cat.id]?.[tName]?.color || 'var(--primary)';
            let sTasks = townMap[tName].sort((a, b) => (a.order || 0) - (b.order || 0));
            blocks.push({ type: 'town', name: tName, order: tOrder, color: tColor, tasks: sTasks });
        }

        blocks.sort((a, b) => a.order - b.order);

        if (cat.id === 'daily') {
            appState.global.event.forEach(ev => {
                const status = getEventStatusClass(ev.period);
                const isForThisChar = !ev.targetChars || ev.targetChars.includes('all') || ev.targetChars.includes(activeChar.id);
                // 진행 중인 이벤트만 일일 숙제 목록에 노출
                if (status === 'ev-status-ongoing' && ev.days && ev.days.includes(todayDay) && isForThisChar) {
                    blocks.unshift({ type: 'task', order: -99999, task: { id: `evtask-${ev.id}`, label: `🎉 [이벤트] ${ev.title}`, type: 'normal', isEventInject: true } });
                }
            });
        }

        blocks.forEach(block => {
            if (block.type === 'town') {
                let hasVisibleTasks = block.tasks.some(t => {
                    if (currentlyEditingTask && currentlyEditingTask.taskId === t.id) return true; 
                    let isChecked = t.isShared ? !!appState.global.sharedChecks[t.id] : !!activeChar.checks[t.id];
                    let isHidden = (isChecked && !uiState.showCompleted[cat.id]) || (t.isPaused && !uiState.showCompleted[cat.id]);
                    return !isHidden;
                });
                
                if (!hasVisibleTasks) return; 

                listEl.innerHTML += `
                    <div class="town-group-header" style="border-left-color: ${block.color};">
                        <div class="town-title" style="color: ${block.color};">📍 ${block.name}</div>
                        <div class="action-btns">
                            <button class="icon-btn" onclick="cycleTownColor('${cat.id}', '${block.name}')" title="색상 변경">🎨</button>
                            <button class="icon-btn" onclick="moveBlock('${cat.id}', 'town', '${block.name}', 'up')" title="위로">▲</button>
                            <button class="icon-btn" onclick="moveBlock('${cat.id}', 'town', '${block.name}', 'down')" title="아래로">▼</button>
                        </div>
                    </div>
                `;
                let subList = `<ul class="town-task-list">`;
                block.tasks.forEach(t => subList += renderTaskItemStr(cat.id, t, activeChar));
                subList += `</ul>`;
                listEl.innerHTML += subList;
            } else {
                listEl.innerHTML += renderTaskItemStr(cat.id, block.task, activeChar);
            }
        });
        const toggleBtn = document.getElementById(`btn-toggle-${cat.id}`);
        if(toggleBtn) toggleBtn.innerText = uiState.showCompleted[cat.id] ? '∧' : '∨';
    });
}

function renderTaskItemStr(categoryId, task, activeChar) {
    if (currentlyEditingTask && currentlyEditingTask.taskId === task.id) {
        return `<li class="task-item edit-mode">${getTaskFormHTML(categoryId, task, task.isGlobal)}</li>`;
    }

    let isChecked = task.isShared ? !!appState.global.sharedChecks[task.id] : !!activeChar.checks[task.id];
    let isHidden = (isChecked && !uiState.showCompleted[categoryId]) || (task.isPaused && !uiState.showCompleted[categoryId]);
    let hiddenClass = isHidden ? 'hidden-task' : '';
    let pausedClass = task.isPaused ? 'paused-task' : '';

    let labelHTML = '';
    if (task.type === 'trade') {
        let npcHTML = task.npc ? `<div class="task-npc-label">👤 ${task.npc}</div>` : '';
        labelHTML = `
            <div class="trade-label-wrap">
                ${npcHTML}
                <div class="trade-grid">
                    <span class="trade-item from-item">${task.fromItem}</span>
                    <span class="trade-qty from-qty">${task.fromQty}개</span>
                    <span class="trade-arrow">→</span>
                    <span class="trade-item to-item">${task.toItem}</span>
                    <span class="trade-qty to-qty">${task.toQty}개</span>
                </div>
            </div>
        `;
    } else {
        labelHTML = `<label style="flex:1; cursor:pointer; ${task.isEventInject ? 'color: var(--primary); font-weight: bold;' : ''}" for="${task.id}">${task.label}</label>`;
    }

    let actionBtnsHTML = task.isEventInject ? `<div style="width: 50px; margin-left: 10px;"></div>` : `
        <div class="action-btns">
            <button class="icon-btn" onclick="editTask('${categoryId}', '${task.id}', ${task.isGlobal})" title="수정">✏️</button>
            <button class="icon-btn delete-btn" onclick="openDeleteModal('${categoryId}', '${task.id}', ${task.isGlobal})" title="삭제">✕</button>
        </div>
    `;
    
    return `
        <li class="task-item ${isChecked ? 'checked' : ''} ${hiddenClass} ${pausedClass}">
            <div class="task-content">
                <input type="checkbox" id="${task.id}" ${isChecked ? 'checked' : ''} onchange="toggleTask('${task.id}', this.checked, ${task.isShared})">
                ${labelHTML}
            </div>
            ${actionBtnsHTML}
        </li>
    `;
}

// --- 🌟 기타 유틸리티 함수 ---
function cycleTownColor(categoryId, townName) {
    if (!appState.global.towns[categoryId][townName]) return;
    let curColor = appState.global.towns[categoryId][townName].color;
    let idx = pastelColors.indexOf(curColor);
    appState.global.towns[categoryId][townName].color = pastelColors[(idx + 1) % pastelColors.length];
    saveData(); renderCharacterTasks();
}

function moveBlock(categoryId, type, idOrName, direction) {
    const activeChar = appState.characters.find(c => c.id === appState.activeTabId);
    let globalTasks = appState.global.tasksTemplate[categoryId].filter(t => !activeChar.hiddenTasks.includes(t.id)).map(t => ({...t, isGlobal: true}));
    let customTasks = (activeChar.customTasks && activeChar.customTasks[categoryId]) ? activeChar.customTasks[categoryId].map(t => ({...t, isGlobal: false})) : [];
    let allTasks = [...globalTasks, ...customTasks];

    let isInnerTownTask = false;
    let targetTownName = null;

    if (type === 'task') {
        let t = allTasks.find(x => x.id === idOrName);
        if (t && t.town) { isInnerTownTask = true; targetTownName = t.town; }
    }

    let blocks = [];
    if (isInnerTownTask) {
        blocks = allTasks.filter(t => t.town === targetTownName).sort((a,b) => a.order - b.order);
    } else {
        let townMap = {};
        allTasks.forEach(t => {
            if (t.town) { townMap[t.town] = true; } 
            else { blocks.push({ id: t.id, order: t.order, isTask: true, taskObj: t }); }
        });
        for (let tName in townMap) { blocks.push({ id: tName, order: appState.global.towns[categoryId][tName].order, isTask: false }); }
        blocks.sort((a,b) => a.order - b.order);
    }

    const idx = blocks.findIndex(b => b.id === idOrName);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= blocks.length) return;

    const curBlock = blocks[idx];
    const tgtBlock = blocks[targetIdx];
    
    const tempOrder = curBlock.order;
    curBlock.order = tgtBlock.order;
    tgtBlock.order = tempOrder;

    if (isInnerTownTask) {
        updateTaskOrder(categoryId, curBlock.id, curBlock.taskObj.isGlobal, curBlock.order);
        updateTaskOrder(categoryId, tgtBlock.id, tgtBlock.taskObj.isGlobal, tgtBlock.order);
    } else {
        if (curBlock.isTask) updateTaskOrder(categoryId, curBlock.id, curBlock.taskObj.isGlobal, curBlock.order);
        else appState.global.towns[categoryId][curBlock.id].order = curBlock.order;

        if (tgtBlock.isTask) updateTaskOrder(categoryId, tgtBlock.id, tgtBlock.taskObj.isGlobal, tgtBlock.order);
        else appState.global.towns[categoryId][tgtBlock.id].order = tgtBlock.order;
    }

    saveData(); renderCharacterTasks();
}

function updateTaskOrder(categoryId, taskId, isGlobal, newOrder) {
    if (isGlobal) {
        let t = appState.global.tasksTemplate[categoryId].find(x => x.id === taskId);
        if(t) t.order = newOrder;
    } else {
        appState.characters.forEach(c => {
            if (c.customTasks[categoryId]) {
                let t = c.customTasks[categoryId].find(x => x.id === taskId);
                if(t) t.order = newOrder;
            }
        });
    }
}

document.addEventListener('click', function(event) {
    if (event.target.closest('.add-wrap') || event.target.closest('.toggle-btn') || event.target.closest('.icon-btn') || event.target.closest('.modal-box') || event.target.classList.contains('char-chip') || event.target.closest('.inline-form-box')) return;
    document.querySelectorAll('.grid .add-wrap:not(.hidden)').forEach(el => el.classList.add('hidden'));
    resetEventForm();
    if (currentlyEditingTask) cancelEdit(currentlyEditingTask.categoryId, currentlyEditingTask.taskId);
});

// --- 🌟 이벤트 관리 함수 ---
function closeEventForm() {
    document.getElementById('add-wrap-event').classList.add('hidden');
    resetEventForm();
}

function toggleEventInput() {
    const wrap = document.getElementById(`add-wrap-event`);
    
    if (!wrap.classList.contains('hidden') && editingEventId === null) {
        closeEventForm();
        return;
    }

    resetEventForm();
    wrap.classList.remove('hidden');
    
    let chipsHtml = `<div class="target-chars-wrap" id="chips-event-new">`;
    appState.characters.forEach(c => { chipsHtml += `<div class="char-chip selected" onclick="this.classList.toggle('selected')" data-char-id="${c.id}">${c.name}</div>`; });
    chipsHtml += `</div>`;

    wrap.innerHTML = `
        <div class="inline-form-box">
            ${chipsHtml}
            <div class="form-row">
                <input type="text" id="input-ev-period" placeholder="기간 (06.01 ~ 06.30)" style="max-width: 150px;">
                <input type="text" id="input-ev-title" placeholder="이벤트 제목">
            </div>
            <div class="form-row day-selector" id="event-day-selector">
                ${['월','화','수','목','금','토','일'].map(d => `<button type="button" class="day-btn" onclick="toggleEventDay(this, '${d}')">${d}</button>`).join('')}
            </div>
            <div class="form-row">
                <input type="text" id="input-ev-memo1" placeholder="메모 1">
                <input type="text" id="input-ev-memo2" placeholder="메모 2">
            </div>
            <div class="form-actions">
                <button type="button" class="btn-cancel" onclick="closeEventForm()">취소</button>
                <button type="button" class="btn-submit" onclick="submitEvent()">추가</button>
            </div>
        </div>`;
    setTimeout(() => wrap.scrollIntoView({ behavior: 'smooth', block: 'end' }), 10);
}

function editEvent(id) {
    const ev = appState.global.event.find(e => e.id === id);
    if (!ev) return;
    
    const wrap = document.getElementById(`add-wrap-event`);
    wrap.classList.remove('hidden');
    
    let chipsHtml = `<div class="target-chars-wrap" id="chips-event-${id}">`;
    appState.characters.forEach(c => { 
        let isSelected = !ev.targetChars || ev.targetChars.includes('all') || ev.targetChars.includes(c.id);
        chipsHtml += `<div class="char-chip ${isSelected ? 'selected' : ''}" onclick="this.classList.toggle('selected')" data-char-id="${c.id}">${c.name}</div>`; 
    });
    chipsHtml += `</div>`;

    wrap.innerHTML = `
        <div class="inline-form-box">
            ${chipsHtml}
            <div class="form-row">
                <input type="text" id="input-ev-period" placeholder="기간 (06.01 ~ 06.30)" style="max-width: 150px;" value="${ev.period || ''}">
                <input type="text" id="input-ev-title" placeholder="이벤트 제목" value="${ev.title || ''}">
            </div>
            <div class="form-row day-selector" id="event-day-selector">
                ${['월','화','수','목','금','토','일'].map(d => `<button type="button" class="day-btn ${ev.days && ev.days.includes(d) ? 'selected' : ''}" onclick="toggleEventDay(this, '${d}')">${d}</button>`).join('')}
            </div>
            <div class="form-row">
                <input type="text" id="input-ev-memo1" placeholder="메모 1" value="${ev.memo1 || ''}">
                <input type="text" id="input-ev-memo2" placeholder="메모 2" value="${ev.memo2 || ''}">
            </div>
            <div class="form-actions">
                <button type="button" class="btn-cancel" onclick="closeEventForm()">취소</button>
                <button type="button" class="btn-submit edit" id="btn-submit-event" onclick="submitEvent()">수정</button>
            </div>
        </div>`;
    
    selectedEventDays = [...(ev.days || [])];
    editingEventId = id; 
    setTimeout(() => wrap.scrollIntoView({ behavior: 'smooth', block: 'end' }), 10);
}

function submitEvent() {
    const period = document.getElementById('input-ev-period').value.trim(); 
    const title = document.getElementById('input-ev-title').value.trim();
    const memo1 = document.getElementById('input-ev-memo1').value.trim(); 
    const memo2 = document.getElementById('input-ev-memo2').value.trim();
    if (!title) { alert('이벤트 제목은 필수입니다.'); return; }
    const days = [...selectedEventDays];

    const tid = editingEventId || 'new';
    const chipWrap = document.getElementById(`chips-event-${tid}`);
    const selectedCharIds = Array.from(chipWrap.querySelectorAll('.char-chip.selected')).map(c => c.dataset.charId);
    if (selectedCharIds.length === 0) { alert('최소 하나 이상의 캐릭터를 선택하세요.'); return; }
    const targetChars = selectedCharIds.length === appState.characters.length ? ['all'] : selectedCharIds;

    if (editingEventId) {
        const evIndex = appState.global.event.findIndex(e => e.id === editingEventId);
        if (evIndex > -1) { appState.global.event[evIndex] = { ...appState.global.event[evIndex], period, title, days, memo1, memo2, targetChars }; }
    } else { 
        appState.global.event.push({ id: genId(), period, title, days, memo1, memo2, targetChars }); 
    }
    
    closeEventForm();
    saveData(); renderTabs(); renderGlobal(); renderCharacterTasks(); 
}

function resetEventForm() { editingEventId = null; selectedEventDays = []; }

function toggleEventDay(btn, day) {
    btn.classList.toggle('selected');
    if (btn.classList.contains('selected')) { if (!selectedEventDays.includes(day)) selectedEventDays.push(day); } 
    else { selectedEventDays = selectedEventDays.filter(d => d !== day); }
}

// --- 🌟 인풋 토글 및 수정 관련 ---
function toggleInput(categoryId) {
    const wrap = document.getElementById(`add-wrap-${categoryId}`);
    if(!wrap) return;

    if(categoryId === 'memo' || categoryId === 'abyss' || categoryId === 'notice') { 
        wrap.classList.toggle('hidden'); 
        if(!wrap.classList.contains('hidden') && categoryId === 'abyss' && appState.global.abyss.baseTime) {
            try {
                const d = new Date(appState.global.abyss.baseTime);
                const localStr = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0,16);
                document.getElementById('input-abyss').value = localStr;
            } catch(e) {}
        }
        return; 
    }

    if(wrap.classList.contains('hidden')) { 
        wrap.classList.remove('hidden'); 
        wrap.innerHTML = getTaskFormHTML(categoryId); 
        setTimeout(() => wrap.scrollIntoView({ behavior: 'smooth', block: 'end' }), 10);
    } else { wrap.classList.add('hidden'); }
}

function toggleCompleted(categoryId) {
    uiState.showCompleted[categoryId] = !uiState.showCompleted[categoryId];
    renderCharacterTasks();
}

function editTask(categoryId, taskId, isGlobal) {
    if (currentlyEditingTask && currentlyEditingTask.taskId === 'new') {
        document.getElementById(`add-wrap-${currentlyEditingTask.categoryId}`).classList.add('hidden');
    }
    currentlyEditingTask = { categoryId, taskId, isGlobal };
    renderCharacterTasks(); 
    setTimeout(() => {
        const editBox = document.querySelector('.inline-form-box');
        if(editBox) editBox.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 10);
}

function cancelEdit(categoryId, taskId) {
    if(taskId === 'new') { document.getElementById(`add-wrap-${categoryId}`).classList.add('hidden'); }
    currentlyEditingTask = null;
    renderCharacterTasks();
}

function saveTask(categoryId, taskId, isGlobal) {
    const tid = taskId; 
    const fid = `${categoryId}-${tid}`; 
    const isTrade = categoryId.includes('trade');
    
    const isIndiv = document.getElementById(`indiv-${fid}`).checked; 
    const isShared = !isIndiv;
    const isPaused = document.getElementById(`paused-${fid}`).checked; 
    const town = document.getElementById(`town-${fid}`).value.trim();
    const npc = isTrade ? document.getElementById(`npc-${fid}`).value.trim() : '';
    
    let label = '', fromItem = '', fromQty = 0, toItem = '', toQty = 0;
    if (isTrade) {
        fromItem = document.getElementById(`from-${fid}`).value.trim(); 
        fromQty = Number(document.getElementById(`from-qty-${fid}`).value);
        toItem = document.getElementById(`to-${fid}`).value.trim(); 
        toQty = Number(document.getElementById(`to-qty-${fid}`).value);
        if (!fromItem || !fromQty || !toItem || !toQty) { alert('교환 정보를 모두 입력하세요.'); return; }
    } else {
        label = document.getElementById(`label-${fid}`).value.trim();
        if (!label) { alert('내용을 입력하세요.'); return; }
    }

    const chipWrap = document.getElementById(`chips-${fid}`);
    const selectedCharIds = Array.from(chipWrap.querySelectorAll('.char-chip.selected')).map(c => c.dataset.charId);
    if (selectedCharIds.length === 0) { alert('최소 하나 이상의 캐릭터를 선택하세요.'); return; }
    const isAll = selectedCharIds.length === appState.characters.length;
    
    if (town && !appState.global.towns[categoryId][town]) { appState.global.towns[categoryId][town] = { order: Date.now(), color: pastelColors[0] }; }

    let tOrder = Date.now();
    if (taskId !== 'new') {
        let oldT = isGlobal ? appState.global.tasksTemplate[categoryId].find(t=>t.id===taskId) : appState.characters.find(c=>c.id===appState.activeTabId).customTasks[categoryId].find(t=>t.id===taskId);
        if(oldT) tOrder = oldT.order;
        
        if (isGlobal) appState.global.tasksTemplate[categoryId] = appState.global.tasksTemplate[categoryId].filter(t => t.id !== taskId);
        else appState.characters.forEach(c => c.customTasks[categoryId] = c.customTasks[categoryId].filter(t => t.id !== taskId));
    }

    let taskData = { id: taskId === 'new' ? genId() : taskId, isShared, town, npc, order: tOrder, isPaused };
    if (isTrade) { taskData.type = 'trade'; taskData.fromItem = fromItem; taskData.fromQty = fromQty; taskData.toItem = toItem; taskData.toQty = toQty; } 
    else { taskData.type = 'normal'; taskData.label = label; }

    if (isAll) {
        appState.global.tasksTemplate[categoryId].push(taskData);
        appState.characters.forEach(c => c.hiddenTasks = c.hiddenTasks.filter(id => id !== taskData.id)); 
    } else {
        appState.characters.forEach(c => { if (selectedCharIds.includes(c.id)) c.customTasks[categoryId].push({...taskData}); });
    }
    
    currentlyEditingTask = null;
    if(taskId === 'new') document.getElementById(`add-wrap-${categoryId}`).classList.add('hidden');
    saveData(); renderTabs(); renderCharacterTasks();
}

function toggleTask(taskId, isChecked, isShared) {
    if (isShared) { appState.global.sharedChecks[taskId] = isChecked; } 
    else { appState.characters.find(c => c.id === appState.activeTabId).checks[taskId] = isChecked; }
    saveData(); renderTabs(); renderCharacterTasks();
}

// --- 🌟 공지사항 및 메모 관련 ---
function addNotice() {
    const title = document.getElementById('input-notice-title').value.trim();
    let url = document.getElementById('input-notice-url').value.trim();
    if(!title) { alert('공지 제목을 입력하세요.'); return; }
    if (url && !url.startsWith('http://') && !url.startsWith('https://')) { url = 'https://' + url; }
    appState.global.notices.unshift({ id: genId(), title, url });
    document.getElementById('input-notice-title').value = ''; document.getElementById('input-notice-url').value = '';
    document.getElementById('add-wrap-notice').classList.add('hidden'); saveData(); renderGlobal();
}

function deleteNotice(id) {
    if(!confirm("이 공지사항을 내역에서 삭제하시겠습니까?")) return;
    appState.global.notices = appState.global.notices.filter(n => n.id !== id); saveData(); renderGlobal();
}

function addMemo() { const val = document.getElementById('input-memo').value.trim(); if (!val) return; appState.global.memo.push({ id: genId(), label: val }); document.getElementById('input-memo').value = ''; document.getElementById('add-wrap-memo').classList.add('hidden'); saveData(); renderGlobal(); }

// --- 🌟 기타 전역 및 캐릭터 함수 ---
function switchTab(charId) { appState.activeTabId = charId; currentlyEditingTask = null; saveData(); renderTabs(); renderCharacterTasks(); }
function addNewCharacter() { const name = prompt("새 캐릭터의 이름을 입력하세요:"); if (name) { appState.characters.push({ id: genId(), name: name, checks: {}, customTasks: { 'daily': [], 'daily-trade': [], 'weekly': [], 'weekly-trade': [] }, hiddenTasks: [] }); appState.activeTabId = appState.characters[appState.characters.length-1].id; saveData(); renderAll(); } }
function renameCharacter(charId) { const char = appState.characters.find(c => c.id === charId); if (!char) return; const newName = prompt("캐릭터의 새 닉네임을 입력하세요:", char.name); if (newName !== null && newName.trim() !== "") { char.name = newName.trim(); saveData(); renderTabs(); } }

function deleteGlobal(type, id) { if (!confirm("삭제하시겠습니까?")) return; appState.global[type] = appState.global[type].filter(i => i.id !== id); saveData(); renderTabs(); renderGlobal(); renderCharacterTasks(); }
function openDeleteModal(category, taskId, isGlobal) { deleteTarget = { category, taskId, isGlobal }; document.getElementById('delete-modal').classList.add('show'); }
function closeDeleteModal() { deleteTarget = null; document.getElementById('delete-modal').classList.remove('show'); }

function executeDelete(type) {
    if (!deleteTarget) return; const { category, taskId, isGlobal } = deleteTarget; const activeChar = appState.characters.find(c => c.id === appState.activeTabId);
    if (type === 'all') {
        if (isGlobal) appState.global.tasksTemplate[category] = appState.global.tasksTemplate[category].filter(t => t.id !== taskId);
        appState.characters.forEach(char => {
            if (char.customTasks[category]) char.customTasks[category] = char.customTasks[category].filter(t => t.id !== taskId);
            delete char.checks[taskId]; delete appState.global.sharedChecks[taskId];
            if (char.hiddenTasks) char.hiddenTasks = char.hiddenTasks.filter(id => id !== taskId);
        });
    } else if (type === 'local') {
        if (isGlobal) { if (!activeChar.hiddenTasks) activeChar.hiddenTasks = []; activeChar.hiddenTasks.push(taskId); } 
        else { activeChar.customTasks[category] = activeChar.customTasks[category].filter(t => t.id !== taskId); }
        delete activeChar.checks[taskId];
    }
    closeDeleteModal(); saveData(); renderTabs(); renderCharacterTasks();
}

loadData();