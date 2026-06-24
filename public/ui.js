// ==========================================
// 1. 공통 UI, 알림 & 보안 제어
// ==========================================
// 🛡️ XSS 방어용 텍스트 변환 함수 (HTML 태그 무력화)
function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, function(match) {
        const escape = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
        return escape[match];
    });
}

function initDarkMode() {
    const savedTheme = localStorage.getItem('theme');
    const btn = document.getElementById('theme-toggle');
    if (savedTheme === 'dark' && btn) { btn.innerText = '☀️'; }
}

function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark-mode');
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.innerText = isDark ? '☀️' : '🌙';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}
document.addEventListener('DOMContentLoaded', initDarkMode);

function showToast(msg) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div'); toast.className = 'toast'; toast.innerText = msg; // innerText는 자동 이스케이프 됨
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 2500);
}

function requestNotificationPermission() {
    if (!("Notification" in window)) { showToast("이 브라우저는 알림 기능을 지원하지 않습니다."); return; }
    Notification.requestPermission().then(permission => {
        if (permission === "granted") { showToast("🔔 알림이 켜졌습니다! 어비스 구멍 시간이 되면 알려드릴게요."); new Notification("마비노기 모바일 트래커", { body: "이렇게 알림이 올 거예요!" }); } 
        else { showToast("알림이 차단되어 있습니다. 브라우저 설정에서 알림을 허용해주세요."); }
    });
}

// ==========================================
// 2. 어비스 구멍 UI
// ==========================================
function renderAbyssSchedule() {
    if (!appState || !appState.global || !appState.global.abyss) return;
    const baseTimeStr = appState.global.abyss.baseTime; if (!baseTimeStr) return;
    const baseDate = new Date(baseTimeStr); if (isNaN(baseDate.getTime())) return;

    const intervalMs = 130500000; 
    let nowMs = Date.now(); let baseMs = baseDate.getTime();
    let elapsed = nowMs - baseMs; let cycles = Math.floor(elapsed / intervalMs); if (cycles < 0) cycles = 0; 

    let times = []; for(let i = 0; i < 5; i++) { times.push(new Date(baseMs + (cycles + i) * intervalMs)); }
    let nextTime = times.find(t => t.getTime() > Date.now()); if (!nextTime) nextTime = times[times.length - 1]; 

    document.getElementById('abyss-next-time').innerText = formatDateKor(nextTime.toISOString(), false);
    document.getElementById('abyss-countdown').dataset.target = nextTime.getTime();
    updateAbyssCountdown();

    let timelineHtml = '';
    times.forEach((t, index) => {
        let isPast = t.getTime() < Date.now();
        let itemClass = index === 0 ? 'base-time' : 'future-time'; if (isPast) itemClass += ' past-time';
        timelineHtml += `<div class="timeline-item ${itemClass}">${formatDateKor(t.toISOString(), true)}</div>`;
    });
    document.getElementById('abyss-timeline').innerHTML = timelineHtml;
}

function updateAbyssCountdown() {
    const el = document.getElementById('abyss-countdown'); if (!el || !el.dataset.target) return;
    const targetTime = parseInt(el.dataset.target); const diff = targetTime - Date.now();
    if (diff <= 0) {
        el.innerText = "발생 중 (또는 지남)"; el.style.color = "var(--danger)";
        if (diff > -60000 && notifiedAbyssTime !== targetTime && Notification.permission === "granted") {
            new Notification("🌌 어비스 구멍 발생!", { body: "지금 어비스 구멍이 열렸습니다! 게임에 접속하세요." }); notifiedAbyssTime = targetTime; 
        }
        if (diff < -60000) renderAbyssSchedule(); 
    } else {
        const h = Math.floor(diff / (1000 * 60 * 60)); const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        el.innerText = `${h > 0 ? h+'시간 ' : ''}${m}분 남음`; el.style.color = "var(--text-muted)";
        if (notifiedAbyssTime !== targetTime) { notifiedAbyssTime = null; }
    }
}

// ==========================================
// 3. 전역 항목 (공지사항, 메모, 이벤트) UI
// ==========================================
function renderGlobal() {
    renderAbyssSchedule(); 
    
    let noticeHtml = '';
    if (appState.global.notices.length === 0) { 
        noticeHtml = `<li class="task-item" style="color:var(--text-muted); justify-content:center; font-size:0.9rem; border:none;">등록된 공지사항이 없습니다.</li>`; 
    } else {
        appState.global.notices.forEach(n => {
            if (editingNoticeId === n.id) {
                // [수정 모드] 회색 인라인 폼
                noticeHtml += `<li class="task-item edit-mode" style="padding: 0; border: none; background: transparent;">
                    <div class="inline-form-box" style="margin: 0; box-shadow: none;">
                        <div class="form-row">
                            <input type="text" id="inline-notice-title-${n.id}" placeholder="공지 제목" value="${escapeHTML(n.title)}" style="flex: 1;">
                            <input type="text" id="inline-notice-url-${n.id}" placeholder="링크 URL (선택)" value="${escapeHTML(n.url || '')}" style="flex: 1;">
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn-cancel" onclick="cancelEditNotice()">취소</button>
                            <button type="button" class="btn-submit edit" onclick="saveInlineNotice('${n.id}')">수정</button>
                        </div>
                    </div>
                </li>`;
            } else {
                // [일반 모드] (수정 ✏️ 버튼 추가)
                const safeTitle = escapeHTML(n.title);
                const safeUrl = escapeHTML(n.url);
                let titleHTML = n.url ? `<a href="${safeUrl}" target="_blank" style="color:var(--text-main); text-decoration:none; font-weight:bold;">• ${safeTitle} 🔗</a>` : `<span>• ${safeTitle}</span>`;
                
                noticeHtml += `<li class="task-item" style="padding: 6px 0;">
                    <div class="task-content" style="font-size:0.95rem;">${titleHTML}</div>
                    <div class="action-btns">
                        <button class="icon-btn edit-btn" onclick="editNotice('${n.id}')" title="수정">✏️</button>
                        <button class="icon-btn delete-btn" onclick="deleteNotice('${n.id}')">✕</button>
                    </div>
                </li>`;
            }
        });
    }
    document.getElementById('list-notice').innerHTML = noticeHtml;
    
    let eventHtml = '';
    appState.global.event.forEach(ev => {
        if (editingEventId === ev.id) {
            let chipsHtml = `<div class="target-chars-wrap" id="inline-chips-event-${ev.id}">`;
            appState.characters.forEach(c => {
                let isSelected = !ev.targetChars || ev.targetChars.includes('all') || ev.targetChars.includes(c.id);
                chipsHtml += `<div class="char-chip ${isSelected ? 'selected' : ''}" onclick="this.classList.toggle('selected')" data-char-id="${c.id}">${escapeHTML(c.name)}</div>`;
            });
            chipsHtml += `</div>`;
            let daysHtml = ['월','화','수','목','금','토','일'].map(d => `<button type="button" class="day-btn ${ev.days && ev.days.includes(d) ? 'selected' : ''}" onclick="toggleEventDay(this, '${d}')">${d}</button>`).join('');

            eventHtml += `<li class="event-item edit-mode" style="padding: 0; border: none;">
                <div class="inline-form-box" style="margin: 0; box-shadow: none;">
                    ${chipsHtml}
                    <div class="form-row">
                        <input type="text" id="inline-ev-period-${ev.id}" placeholder="기간" class="w-100" value="${escapeHTML(ev.period || '')}">
                        <input type="text" id="inline-ev-title-${ev.id}" placeholder="이벤트 제목" value="${escapeHTML(ev.title || '')}">
                    </div>
                    <div class="form-row">
                        <input type="text" id="inline-ev-url-${ev.id}" placeholder="링크 URL (선택사항)" class="w-100" value="${escapeHTML(ev.url || '')}">
                    </div>
                    <div class="form-row day-selector">${daysHtml}</div>
                    <div class="form-row">
                        <input type="text" id="inline-ev-memo1-${ev.id}" placeholder="메모 1" value="${escapeHTML(ev.memo1 || '')}">
                        <input type="text" id="inline-ev-memo2-${ev.id}" placeholder="메모 2" value="${escapeHTML(ev.memo2 || '')}">
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn-cancel" onclick="cancelEditEvent()">취소</button>
                        <button type="button" class="btn-submit edit" onclick="saveInlineEvent('${ev.id}')">수정</button>
                    </div>
                </div>
            </li>`;
        } else {
            const statusClass = getEventStatusClass(ev.period); 
            const daysStr = (ev.days && ev.days.length > 0) ? `[${ev.days.join(', ')}]` : '';
            
            // ✨ 제목을 링크로 감싸기 로직
            const safeTitle = escapeHTML(ev.title);
            const safeUrl = escapeHTML(ev.url);
            let titleHTML = ev.url 
                ? `<a href="${safeUrl}" target="_blank" style="color:var(--text-main); text-decoration:none; font-weight:bold;">${safeTitle} 🔗</a>` 
                : safeTitle;

            eventHtml += `<li class="event-item"><div class="event-grid"><span class="col-period ${statusClass}">${escapeHTML(ev.period)}</span><span class="col-title">${titleHTML}</span><span class="col-days">${daysStr}</span><span class="col-memo1">${escapeHTML(ev.memo1)}</span><span class="col-memo2">${escapeHTML(ev.memo2)}</span><div class="col-actions"><button class="icon-btn edit-btn" onclick="editEvent('${ev.id}')" title="수정">✏️</button><button class="icon-btn delete-btn" onclick="deleteGlobal('event', '${ev.id}')" title="삭제">✕</button></div></div></li>`;
        }
    });
    document.getElementById('list-event').innerHTML = eventHtml;
    
    let memoHtml = '';
    appState.global.memo.forEach(memo => { 
        if (editingMemoId === memo.id) {
            memoHtml += `<li class="task-item edit-mode" style="padding: 0; border: none; background: transparent;">
                <div class="inline-form-box" style="margin: 0; box-shadow: none;">
                    <div class="form-row">
                        <input type="text" id="inline-memo-${memo.id}" value="${escapeHTML(memo.label)}" style="flex: 1;" onkeypress="if(event.key==='Enter') saveInlineMemo('${memo.id}')">
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn-cancel" onclick="cancelEditMemo()">취소</button>
                        <button type="button" class="btn-submit edit" onclick="saveInlineMemo('${memo.id}')">수정</button>
                    </div>
                </div>
            </li>`;
        } else {
            memoHtml += `<li class="task-item">
                <div class="task-content"><span>• ${escapeHTML(memo.label)}</span></div>
                <div class="action-btns">
                    <button class="icon-btn edit-btn" onclick="editMemo('${memo.id}')" title="수정">✏️</button>
                    <button class="icon-btn delete-btn" onclick="deleteGlobal('memo', '${memo.id}')">✕</button>
                </div>
            </li>`; 
        }
    });
    document.getElementById('list-memo').innerHTML = memoHtml;
}

// ==========================================
// 4. 입력 폼 및 캐릭터 탭 UI 생성
// ==========================================
function getTaskFormHTML(categoryId, task = null, isGlobal = true) {
    const isTrade = categoryId.includes('trade'); const tid = task ? task.id : 'new'; const fid = `${categoryId}-${tid}`; 
    const vTown = task && task.town ? escapeHTML(task.town) : ''; const vNpc = task && task.npc ? escapeHTML(task.npc) : ''; const vLabel = task && !isTrade ? escapeHTML(task.label) : ''; const vFrom = task && isTrade ? escapeHTML(task.fromItem) : ''; const vFromQ = task && isTrade ? task.fromQty : ''; const vTo = task && isTrade ? escapeHTML(task.toItem) : ''; const vToQ = task && isTrade ? task.toQty : '';
    const isIndiv = task ? !task.isShared : true; const isPaused = task ? !!task.isPaused : false;
    
    let chipsHtml = `<div class="target-chars-wrap" id="chips-${fid}">`;
    appState.characters.forEach(c => {
        let isSelected = true; if (task) { if (isGlobal) { if (c.hiddenTasks && c.hiddenTasks.includes(tid)) isSelected = false; } else { if (!c.customTasks[categoryId].some(t => t.id === tid)) isSelected = false; } }
        chipsHtml += `<div class="char-chip ${isSelected ? 'selected' : ''}" onclick="this.classList.toggle('selected')" data-char-id="${c.id}">${escapeHTML(c.name)}</div>`;
    });
    chipsHtml += `</div>`;
    
    let inputsHtml = isTrade ? `<div class="form-row"><input type="text" id="npc-${fid}" placeholder="NPC 이름 (선택)" value="${vNpc}"></div><div class="trade-input-row" style="padding:0; background:transparent;"><input type="text" id="from-${fid}" placeholder="보유 템" value="${vFrom}"><input type="number" id="from-qty-${fid}" placeholder="수량" value="${vFromQ}"><span class="trade-arrow-icon">→</span><input type="text" id="to-${fid}" placeholder="목표 템" value="${vTo}"><input type="number" id="to-qty-${fid}" placeholder="수량" value="${vToQ}"></div>` : `<div class="form-row"><input type="text" id="label-${fid}" placeholder="숙제 내용..." value="${vLabel}"></div>`;
    let moveBtnsHtml = task ? `<button type="button" class="action-icon-btn" onclick="moveBlock('${categoryId}', 'task', '${tid}', 'up')" title="위로 이동">▲</button><button type="button" class="action-icon-btn" onclick="moveBlock('${categoryId}', 'task', '${tid}', 'down')" title="아래로 이동">▼</button>` : '';
        
    return `<div class="inline-form-box">${chipsHtml}<div class="form-row"><label class="checkbox-label" title="체크 해제 시 원정대(계정) 전체 공유됩니다"><input type="checkbox" id="indiv-${fid}" ${isIndiv ? 'checked' : ''}> 개별</label><label class="checkbox-label" style="color:var(--danger)" title="당분간 하지 않을 항목은 비활성화 해두세요"><input type="checkbox" id="paused-${fid}" ${isPaused ? 'checked' : ''}> ⏸️ 비활성화</label><input type="text" id="town-${fid}" placeholder="마 마을 이름 (선택: 같은 마을끼리 묶임)" value="${vTown}"></div>${inputsHtml}<div class="form-actions">${moveBtnsHtml}<button type="button" class="btn-cancel" onclick="cancelEdit('${categoryId}', '${tid}')">취소</button><button type="button" class="btn-submit ${task ? 'edit' : ''}" onclick="saveTask('${categoryId}', '${tid}', ${isGlobal})">${task ? '수정' : '추가'}</button></div></div>`;
}

function renderTabs() {
    const container = document.getElementById('tabs-container'); container.innerHTML = '';
    appState.characters.forEach(char => {
        const btn = document.createElement('button'); const isActive = appState.activeTabId === char.id; btn.className = `tab-btn ${isActive ? 'active' : ''}`;
        if (isActive) btn.title = "한 번 더 누르면 설정을 엽니다";
        const status = getCharCompletionStatus(char); let statusClass = status === 'red' ? 'status-red' : status === 'yellow' ? 'status-yellow' : 'status-green';
        btn.innerHTML = `${escapeHTML(char.name)} <span class="status-check ${statusClass}">✔</span>`; btn.dataset.charId = char.id; btn.onclick = () => { isActive ? manageCharacter(char.id) : switchTab(char.id); }; container.appendChild(btn);
    });
    const addBtn = document.createElement('button'); addBtn.className = 'tab-btn tab-add-btn'; addBtn.innerText = '+ 캐릭 추가'; addBtn.onclick = addNewCharacter; container.appendChild(addBtn);
    const hint = document.createElement('span'); hint.className = 'tab-hint'; hint.innerHTML = '💡 활성화된 탭 한 번 더 클릭 시 설정'; container.appendChild(hint);
}

function updateTabStatus(charId) { 
    const char = appState.characters.find(c => c.id === charId); if (!char) return; 
    const status = getCharCompletionStatus(char); const statusClass = status === 'red' ? 'status-red' : status === 'yellow' ? 'status-yellow' : 'status-green'; 
    const tabBtn = document.querySelector(`.tab-btn[data-char-id="${charId}"]`); if (tabBtn) { const checkSpan = tabBtn.querySelector('.status-check'); if (checkSpan) checkSpan.className = `status-check ${statusClass}`; } 
}

// ==========================================
// 5. 숙제 목록(Task) 렌더링
// ==========================================
function renderAll() { renderGlobal(); renderTabs(); renderTaskCards(); renderCharacterTasks(); }

function renderTaskCards() {
    const container = document.getElementById('character-content'); 
    let cardsHtml = '';
    categoriesInfo.forEach(cat => {
        cardsHtml += `<div class="card"><div class="card-header"><h2>${cat.title}</h2><div class="toggle-group"><button class="toggle-btn" onclick="toggleCompleted('${cat.id}')" id="btn-toggle-${cat.id}" title="완료 항목 보기/숨기기">∨</button><button class="toggle-btn" onclick="toggleInput('${cat.id}')" title="항목 열기">＋</button></div></div><ul class="task-list" id="list-${cat.id}"></ul><div class="add-wrap hidden" id="add-wrap-${cat.id}"></div></div>`;
    });
    container.innerHTML = cardsHtml;
    categoriesInfo.forEach(cat => { document.getElementById(`add-wrap-${cat.id}`).innerHTML = getTaskFormHTML(cat.id); });
}

function renderCharacterTasks() {
    const activeChar = appState.characters.find(c => c.id === appState.activeTabId); if (!activeChar) return;
    const todayDay = ['일', '월', '화', '수', '목', '금', '토'][new Date().getDay()];
    
    categoriesInfo.forEach(cat => {
        let globalTasks = appState.global.tasksTemplate[cat.id].filter(t => !activeChar.hiddenTasks.includes(t.id)).map(t => ({...t, isGlobal: true}));
        let customTasks = (activeChar.customTasks && activeChar.customTasks[cat.id]) ? activeChar.customTasks[cat.id].map(t => ({...t, isGlobal: false})) : [];
        let allTasks = [...globalTasks, ...customTasks]; let blocks = []; let townMap = {};
        
        allTasks.forEach(task => { if (task.town) { if (!townMap[task.town]) townMap[task.town] = []; townMap[task.town].push(task); } else { blocks.push({ type: 'task', order: task.order || 0, task: task }); } });
        for (let tName in townMap) { let tOrder = appState.global.towns[cat.id]?.[tName]?.order || 0; let tColor = appState.global.towns[cat.id]?.[tName]?.color || 'var(--primary)'; let sTasks = townMap[tName].sort((a, b) => (a.order || 0) - (b.order || 0)); blocks.push({ type: 'town', name: tName, order: tOrder, color: tColor, tasks: sTasks }); }
        blocks.sort((a, b) => a.order - b.order);
        
        if (cat.id === 'daily') {
            appState.global.event.forEach(ev => {
                const status = getEventStatusClass(ev.period); const isForThisChar = !ev.targetChars || ev.targetChars.includes('all') || ev.targetChars.includes(activeChar.id);
                // 🌟 핵심 수정: '진행 중'이거나 '마감 임박'인 경우 모두 일일 숙제 목록에 추가
                if ((status === 'ev-status-ongoing' || status === 'ev-status-closing') && ev.days && ev.days.includes(todayDay) && isForThisChar) { 
                    blocks.unshift({ type: 'task', order: -99999, task: { id: `evtask-${ev.id}`, label: `🎉 [이벤트] ${escapeHTML(ev.title)}`, type: 'normal', isEventInject: true } }); 
                }
            });
        }
        
        let listHtml = '';
        blocks.forEach(block => {
            if (block.type === 'town') {
                let hasVisibleTasks = block.tasks.some(t => { if (currentlyEditingTask && currentlyEditingTask.taskId === t.id) return true; let isChecked = t.isShared ? !!appState.global.sharedChecks[t.id] : !!activeChar.checks[t.id]; return !((isChecked && !uiState.showCompleted[cat.id]) || (t.isPaused && !uiState.showCompleted[cat.id])); });
                if (!hasVisibleTasks) return; 
                listHtml += `<div class="town-group-header" style="border-left-color: ${block.color};"><div class="town-title" style="color: ${block.color};">📍 ${escapeHTML(block.name)}</div><div class="action-btns"><button class="icon-btn" onclick="cycleTownColor('${cat.id}', '${block.name}')" title="색상 변경">🎨</button><button class="icon-btn" onclick="moveBlock('${cat.id}', 'town', '${block.name}', 'up')" title="위로">▲</button><button class="icon-btn" onclick="moveBlock('${cat.id}', 'town', '${block.name}', 'down')" title="아래로">▼</button></div></div><ul class="town-task-list">`;
                block.tasks.forEach(t => listHtml += renderTaskItemStr(cat.id, t, activeChar)); 
                listHtml += `</ul>`; 
            } else { listHtml += renderTaskItemStr(cat.id, block.task, activeChar); }
        });
        document.getElementById(`list-${cat.id}`).innerHTML = listHtml;
        
        const toggleBtn = document.getElementById(`btn-toggle-${cat.id}`); if (toggleBtn) toggleBtn.innerText = uiState.showCompleted[cat.id] ? '∧' : '∨';
    });
}

function renderTaskItemStr(categoryId, task, activeChar) {
    if (currentlyEditingTask && currentlyEditingTask.taskId === task.id) { return `<li class="task-item edit-mode">${getTaskFormHTML(categoryId, task, task.isGlobal)}</li>`; }
    let isChecked = task.isShared ? !!appState.global.sharedChecks[task.id] : !!activeChar.checks[task.id];
    let isHidden = (isChecked && !uiState.showCompleted[categoryId]) || (task.isPaused && !uiState.showCompleted[categoryId]);
    let hiddenClass = isHidden ? 'hidden-task' : ''; let pausedClass = task.isPaused ? 'paused-task' : '';
    let labelHTML = '';
    
    if (task.type === 'trade') {
        let npcHTML = task.npc ? `<div class="task-npc-label">👤 ${escapeHTML(task.npc)}</div>` : '';
        labelHTML = `<div class="trade-label-wrap">${npcHTML}<div class="trade-grid"><span class="trade-item from-item">${escapeHTML(task.fromItem)}</span><span class="trade-qty from-qty">${task.fromQty}개</span><span class="trade-arrow">→</span><span class="trade-item to-item">${escapeHTML(task.toItem)}</span><span class="trade-qty to-qty">${task.toQty}개</span></div></div>`;
    } else { labelHTML = `<label style="flex:1; cursor:pointer; ${task.isEventInject ? 'color: var(--primary); font-weight: bold;' : ''}" for="${task.id}">${escapeHTML(task.label)}</label>`; }
    
    let actionBtnsHTML = task.isEventInject ? `<div style="width: 50px; margin-left: 10px;"></div>` : `<div class="action-btns"><button class="icon-btn" onclick="editTask('${categoryId}', '${task.id}', ${task.isGlobal})" title="수정">✏️</button><button class="icon-btn delete-btn" onclick="openDeleteModal('${categoryId}', '${task.id}', ${task.isGlobal})" title="삭제">✕</button></div>`;
        
    return `<li class="task-item ${isChecked ? 'checked' : ''} ${hiddenClass} ${pausedClass}"><div class="task-content"><input type="checkbox" id="${task.id}" ${isChecked ? 'checked' : ''} onchange="toggleTask('${task.id}', this.checked, ${task.isShared}, '${categoryId}')">${labelHTML}</div>${actionBtnsHTML}</li>`;
}