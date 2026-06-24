// ==========================================
// 1. 상태 토글 및 입력창 UI 제어
// ==========================================
function toggleInput(categoryId) {
    const wrap = document.getElementById(`add-wrap-${categoryId}`); 
    if(!wrap) return;

    if (categoryId === 'memo' || categoryId === 'abyss' || categoryId === 'notice') { 
        wrap.classList.toggle('hidden'); 
        if (!wrap.classList.contains('hidden') && categoryId === 'abyss' && appState.global.abyss.baseTime) { 
            try { 
                const d = new Date(appState.global.abyss.baseTime); 
                document.getElementById('input-abyss').value = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0,16); 
            } catch(e) {} 
        } return; 
    }
    if (wrap.classList.contains('hidden')) { 
        wrap.classList.remove('hidden'); wrap.innerHTML = getTaskFormHTML(categoryId); 
        setTimeout(() => wrap.scrollIntoView({ behavior: 'smooth', block: 'end' }), 10); 
    } else { wrap.classList.add('hidden'); }
}

function toggleCompleted(categoryId) { 
    uiState.showCompleted[categoryId] = !uiState.showCompleted[categoryId]; renderCharacterTasks(); 
}

document.addEventListener('click', function(event) { 
    if (event.target.closest('.add-wrap') || event.target.closest('.toggle-btn') || event.target.closest('.icon-btn') || event.target.closest('.modal-box') || event.target.classList.contains('char-chip') || event.target.closest('.inline-form-box')) return; 
    document.querySelectorAll('.grid .add-wrap:not(.hidden)').forEach(el => el.classList.add('hidden')); 
    resetEventForm(); 
    if (currentlyEditingTask) cancelEdit(currentlyEditingTask.categoryId, currentlyEditingTask.taskId); 
});

// ==========================================
// 2. 개별 숙제(Task) 조작 및 저장
// ==========================================
function saveTask(categoryId, taskId, isGlobal) {
    const tid = taskId; const fid = `${categoryId}-${tid}`; const isTrade = categoryId.includes('trade'); const isIndiv = document.getElementById(`indiv-${fid}`).checked; const isShared = !isIndiv; const isPaused = document.getElementById(`paused-${fid}`).checked; const town = document.getElementById(`town-${fid}`).value.trim(); const npc = isTrade ? document.getElementById(`npc-${fid}`).value.trim() : '';
    let label = '', fromItem = '', fromQty = 0, toItem = '', toQty = 0;
    
    if (isTrade) { 
        fromItem = document.getElementById(`from-${fid}`).value.trim(); fromQty = Number(document.getElementById(`from-qty-${fid}`).value); toItem = document.getElementById(`to-${fid}`).value.trim(); toQty = Number(document.getElementById(`to-qty-${fid}`).value); 
        if (!fromItem || !fromQty || !toItem || !toQty) { showToast('교환 정보를 모두 입력하세요.'); return; } 
    } else { 
        label = document.getElementById(`label-${fid}`).value.trim(); if (!label) { showToast('내용을 입력하세요.'); return; } 
    }
    
    const chipWrap = document.getElementById(`chips-${fid}`); const selectedCharIds = Array.from(chipWrap.querySelectorAll('.char-chip.selected')).map(c => c.dataset.charId); 
    if (selectedCharIds.length === 0) { showToast('최소 하나 이상의 캐릭터를 선택하세요.'); return; } 
    
    const isAll = selectedCharIds.length === appState.characters.length;

    updateAppState(() => {
        if (town && !appState.global.towns[categoryId][town]) { appState.global.towns[categoryId][town] = { order: Date.now(), color: pastelColors[0] }; }
        let tOrder = Date.now(); 
        if (taskId !== 'new') { 
            let oldT = isGlobal ? appState.global.tasksTemplate[categoryId].find(t=>t.id===taskId) : appState.characters.find(c=>c.id===appState.activeTabId).customTasks[categoryId].find(t=>t.id===taskId); 
            if (oldT) tOrder = oldT.order; 
            if (isGlobal) appState.global.tasksTemplate[categoryId] = appState.global.tasksTemplate[categoryId].filter(t => t.id !== taskId); else appState.characters.forEach(c => c.customTasks[categoryId] = c.customTasks[categoryId].filter(t => t.id !== taskId)); 
        }
        
        let taskData = { id: taskId === 'new' ? genId() : taskId, isShared, town, npc, order: tOrder, isPaused }; 
        if (isTrade) { taskData.type = 'trade'; taskData.fromItem = fromItem; taskData.fromQty = fromQty; taskData.toItem = toItem; taskData.toQty = toQty; } else { taskData.type = 'normal'; taskData.label = label; }
        
        if (isAll) { appState.global.tasksTemplate[categoryId].push(taskData); appState.characters.forEach(c => c.hiddenTasks = c.hiddenTasks.filter(id => id !== taskData.id)); } 
        else { appState.characters.forEach(c => { if (selectedCharIds.includes(c.id)) c.customTasks[categoryId].push({...taskData}); }); }
        
        currentlyEditingTask = null; 
        if (taskId === 'new') document.getElementById(`add-wrap-${categoryId}`).classList.add('hidden'); 
    }, [renderTabs, renderCharacterTasks]);
}

function editTask(categoryId, taskId, isGlobal) { 
    if (currentlyEditingTask && currentlyEditingTask.taskId === 'new') document.getElementById(`add-wrap-${currentlyEditingTask.categoryId}`).classList.add('hidden'); 
    currentlyEditingTask = { categoryId, taskId, isGlobal }; renderCharacterTasks(); 
    setTimeout(() => { const editBox = document.querySelector('.inline-form-box'); if(editBox) editBox.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, 10); 
}

function cancelEdit(categoryId, taskId) { 
    if (taskId === 'new') document.getElementById(`add-wrap-${categoryId}`).classList.add('hidden'); 
    currentlyEditingTask = null; renderCharacterTasks(); 
}

function toggleTask(taskId, isChecked, isShared, categoryId) {
    updateAppState(() => {
        if (isShared) appState.global.sharedChecks[taskId] = isChecked; else appState.characters.find(c => c.id === appState.activeTabId).checks[taskId] = isChecked; 
    }, []); 
    
    const checkbox = document.getElementById(taskId); 
    if (checkbox) { 
        const li = checkbox.closest('.task-item'); 
        if (li) { 
            isChecked ? li.classList.add('checked') : li.classList.remove('checked'); 
            if (!uiState.showCompleted[categoryId]) { 
                isChecked ? li.classList.add('hidden-task') : li.classList.remove('hidden-task'); 
            } 
            const subList = li.closest('.town-task-list'); 
            if (subList) {
                const header = subList.previousElementSibling; 
                if (header && header.classList.contains('town-group-header')) {
                    const visibleTasks = subList.querySelectorAll('.task-item:not(.hidden-task)');
                    if (visibleTasks.length === 0) {
                        header.classList.add('hidden');
                    } else {
                        header.classList.remove('hidden');
                    }
                }
            }
        } 
    } 
    updateTabStatus(appState.activeTabId);
}

// ==========================================
// 3. 순서 이동 및 마을(그룹) 설정
// ==========================================
function moveBlock(categoryId, type, idOrName, direction) {
    updateAppState(() => {
        const activeChar = appState.characters.find(c => c.id === appState.activeTabId); 
        let globalTasks = appState.global.tasksTemplate[categoryId].filter(t => !activeChar.hiddenTasks.includes(t.id)).map(t => ({...t, isGlobal: true})); 
        let customTasks = (activeChar.customTasks && activeChar.customTasks[categoryId]) ? activeChar.customTasks[categoryId].map(t => ({...t, isGlobal: false})) : []; 
        let allTasks = [...globalTasks, ...customTasks];
        
        let isInnerTownTask = false; let targetTownName = null; 
        if (type === 'task') { let t = allTasks.find(x => x.id === idOrName); if (t && t.town) { isInnerTownTask = true; targetTownName = t.town; } }
        
        let blocks = []; 
        if (isInnerTownTask) { blocks = allTasks.filter(t => t.town === targetTownName).sort((a,b) => a.order - b.order); } 
        else { let townMap = {}; allTasks.forEach(t => { if (t.town) townMap[t.town] = true; else blocks.push({ id: t.id, order: t.order, isTask: true, taskObj: t }); }); 
            for (let tName in townMap) blocks.push({ id: tName, order: appState.global.towns[categoryId][tName].order, isTask: false }); blocks.sort((a,b) => a.order - b.order); }
        
        const idx = blocks.findIndex(b => b.id === idOrName); if (idx === -1) return; 
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1; if (targetIdx < 0 || targetIdx >= blocks.length) return;
        
        const curBlock = blocks[idx]; const tgtBlock = blocks[targetIdx]; const tempOrder = curBlock.order; curBlock.order = tgtBlock.order; tgtBlock.order = tempOrder;
        
        if (isInnerTownTask) { updateTaskOrder(categoryId, curBlock.id, curBlock.taskObj.isGlobal, curBlock.order); updateTaskOrder(categoryId, tgtBlock.id, tgtBlock.taskObj.isGlobal, tgtBlock.order); } 
        else {
            if (curBlock.isTask) updateTaskOrder(categoryId, curBlock.id, curBlock.taskObj.isGlobal, curBlock.order); else appState.global.towns[categoryId][curBlock.id].order = curBlock.order;
            if (tgtBlock.isTask) updateTaskOrder(categoryId, tgtBlock.id, tgtBlock.taskObj.isGlobal, tgtBlock.order); else appState.global.towns[categoryId][tgtBlock.id].order = tgtBlock.order;
        }
    }, [renderCharacterTasks]);
}

function updateTaskOrder(categoryId, taskId, isGlobal, newOrder) { 
    if (isGlobal) { let t = appState.global.tasksTemplate[categoryId].find(x => x.id === taskId); if(t) t.order = newOrder; } 
    else { appState.characters.forEach(c => { if (c.customTasks[categoryId]) { let t = c.customTasks[categoryId].find(x => x.id === taskId); if(t) t.order = newOrder; } }); } 
}

function cycleTownColor(categoryId, townName) { 
    updateAppState(() => {
        if (!appState.global.towns[categoryId][townName]) return; 
        let curColor = appState.global.towns[categoryId][townName].color; let idx = pastelColors.indexOf(curColor); 
        appState.global.towns[categoryId][townName].color = pastelColors[(idx + 1) % pastelColors.length]; 
    }, [renderCharacterTasks]);
}

// ==========================================
// 4. 기간 한정 이벤트 제어
// ==========================================
function toggleEventInput() {
    const wrap = document.getElementById(`add-wrap-event`); 
    if (!wrap.classList.contains('hidden') && editingEventId === null) { closeEventForm(); return; }
    resetEventForm(); wrap.classList.remove('hidden');
    let chipsHtml = `<div class="target-chars-wrap" id="chips-event-new">`; appState.characters.forEach(c => { chipsHtml += `<div class="char-chip selected" onclick="this.classList.toggle('selected')" data-char-id="${c.id}">${escapeHTML(c.name)}</div>`; }); chipsHtml += `</div>`;
    wrap.innerHTML = `<div class="inline-form-box">${chipsHtml}<div class="form-row"><input type="text" id="input-ev-period" placeholder="기간 (예: ~6.30 또는 12.20~01.10)" class="w-100"><input type="text" id="input-ev-title" placeholder="이벤트 제목"></div><div class="form-row day-selector" id="event-day-selector">${['월','화','수','목','금','토','일'].map(d => `<button type="button" class="day-btn" onclick="toggleEventDay(this, '${d}')">${d}</button>`).join('')}</div><div class="form-row"><input type="text" id="input-ev-memo1" placeholder="메모 1"><input type="text" id="input-ev-memo2" placeholder="메모 2"></div><div class="form-actions"><button type="button" class="btn-cancel" onclick="closeEventForm()">취소</button><button type="button" class="btn-submit" onclick="submitEvent()">추가</button></div></div>`;
    setTimeout(() => wrap.scrollIntoView({ behavior: 'smooth', block: 'end' }), 10);
}

function editEvent(id) {
    const ev = appState.global.event.find(e => e.id === id); 
    if (!ev) return;
    
    editingEventId = id;
    selectedEventDays = [...(ev.days || [])]; // 선택된 요일 데이터 복사
    renderGlobal();
}

function cancelEditEvent() {
    editingEventId = null;
    selectedEventDays = [];
    renderGlobal();
}

function saveInlineEvent(id) {
    const period = document.getElementById(`inline-ev-period-${id}`).value.trim();
    const title = document.getElementById(`inline-ev-title-${id}`).value.trim();
    const memo1 = document.getElementById(`inline-ev-memo1-${id}`).value.trim();
    const memo2 = document.getElementById(`inline-ev-memo2-${id}`).value.trim();
    if (!title) { showToast('이벤트 제목은 필수입니다.'); return; }
    
    const chipWrap = document.getElementById(`inline-chips-event-${id}`);
    const selectedCharIds = Array.from(chipWrap.querySelectorAll('.char-chip.selected')).map(c => c.dataset.charId);
    if (selectedCharIds.length === 0) { showToast('최소 하나 이상의 캐릭터를 선택하세요.'); return; }

    updateAppState(() => {
        const targetChars = selectedCharIds.length === appState.characters.length ? ['all'] : selectedCharIds;
        const evIndex = appState.global.event.findIndex(e => e.id === id);
        if (evIndex > -1) {
            appState.global.event[evIndex] = { ...appState.global.event[evIndex], period, title, days: [...selectedEventDays], memo1, memo2, targetChars };
        }
        editingEventId = null;
        selectedEventDays = [];
    }, [renderTabs, renderGlobal, renderCharacterTasks]);
}

function submitEvent() {
    const period = document.getElementById('input-ev-period').value.trim(); const title = document.getElementById('input-ev-title').value.trim(); const memo1 = document.getElementById('input-ev-memo1').value.trim(); const memo2 = document.getElementById('input-ev-memo2').value.trim(); 
    if (!title) { showToast('이벤트 제목은 필수입니다.'); return; } 
    const days = [...selectedEventDays];
    const tid = editingEventId || 'new'; const chipWrap = document.getElementById(`chips-event-${tid}`); const selectedCharIds = Array.from(chipWrap.querySelectorAll('.char-chip.selected')).map(c => c.dataset.charId); 
    if (selectedCharIds.length === 0) { showToast('최소 하나 이상의 캐릭터를 선택하세요.'); return; } 
    
    updateAppState(() => {
        const targetChars = selectedCharIds.length === appState.characters.length ? ['all'] : selectedCharIds;
        if (editingEventId) { const evIndex = appState.global.event.findIndex(e => e.id === editingEventId); if (evIndex > -1) { appState.global.event[evIndex] = { ...appState.global.event[evIndex], period, title, days, memo1, memo2, targetChars }; } } 
        else { appState.global.event.push({ id: genId(), period, title, days, memo1, memo2, targetChars }); }
        closeEventForm(); 
    }, [renderTabs, renderGlobal, renderCharacterTasks]);
}

function resetEventForm() { editingEventId = null; selectedEventDays = []; }
function closeEventForm() { document.getElementById('add-wrap-event').classList.add('hidden'); resetEventForm(); }
function toggleEventDay(btn, day) { btn.classList.toggle('selected'); if (btn.classList.contains('selected')) { if (!selectedEventDays.includes(day)) selectedEventDays.push(day); } else { selectedEventDays = selectedEventDays.filter(d => d !== day); } }

// ==========================================
// 5. 공지사항, 공통 메모, 어비스 제어
// ==========================================
function toggleAbyssSchedule() { document.getElementById('abyss-timeline').classList.toggle('hidden'); }
function saveAbyssTime() {
    const val = document.getElementById('input-abyss').value; if(!val) { showToast('시간을 선택해주세요.'); return; }
    updateAppState(() => {
        appState.global.abyss.baseTime = new Date(val).toISOString(); 
        document.getElementById('add-wrap-abyss').classList.add('hidden'); 
    }, [renderGlobal]);
}

function addNotice() {
    const title = document.getElementById('input-notice-title').value.trim(); let url = document.getElementById('input-notice-url').value.trim(); 
    if(!title) { showToast('공지 제목을 입력하세요.'); return; } if (url && !url.startsWith('http://') && !url.startsWith('https://')) { url = 'https://' + url; }
    updateAppState(() => {
        appState.global.notices.unshift({ id: genId(), title, url }); 
        document.getElementById('input-notice-title').value = ''; document.getElementById('input-notice-url').value = ''; document.getElementById('add-wrap-notice').classList.add('hidden'); 
    }, [renderGlobal]);
}

let editingNoticeId = null; 

function editNotice(id) {
    editingNoticeId = id;
    renderGlobal(); 
}

function cancelEditNotice() {
    editingNoticeId = null;
    renderGlobal();
}

function saveInlineNotice(id) {
    const title = document.getElementById(`inline-notice-title-${id}`).value.trim();
    let url = document.getElementById(`inline-notice-url-${id}`).value.trim();
    
    if (!title) { showToast('공지 제목을 입력하세요.'); return; }
    if (url && !url.startsWith('http://') && !url.startsWith('https://')) { 
        url = 'https://' + url; 
    }
    
    updateAppState(() => {
        const target = appState.global.notices.find(n => n.id === id);
        if (target) {
            target.title = title;
            target.url = url;
        }
        editingNoticeId = null;
    }, [renderGlobal]);
}

function deleteNotice(id) { 
    // 🌟 공지사항 제목 표시
    const notice = appState.global.notices.find(n => n.id === id);
    const titleStr = notice ? `[${notice.title}] ` : '';
    if(!confirm(`${titleStr}공지사항을 삭제하시겠습니까?`)) return; 
    
    updateAppState(() => { appState.global.notices = appState.global.notices.filter(n => n.id !== id); }, [renderGlobal]); 
}

let editingMemoId = null; // 🌟 메모 수정 모드 추적용 변수

function addMemo() { 
    const val = document.getElementById('input-memo').value.trim(); 
    if (!val) return; 

    updateAppState(() => {
        if (editingMemoId) {
            // 🌟 [수정 모드] 기존 메모 덮어쓰기
            const target = appState.global.memo.find(m => m.id === editingMemoId);
            if (target) target.label = val;
            
            editingMemoId = null; // 상태 초기화
            const btn = document.getElementById('btn-memo-save');
            if (btn) { btn.innerText = '저장'; btn.style.backgroundColor = ''; btn.style.color = ''; }
        } else {
            // 🌟 [신규 추가 모드]
            appState.global.memo.push({ id: genId(), label: val }); 
        }
        
        document.getElementById('input-memo').value = ''; 
        document.getElementById('add-wrap-memo').classList.add('hidden'); 
    }, [renderGlobal]); 
}

// 🌟 메모 수정 모드 진입 함수 새로 추가
function editMemo(id) {
    editingMemoId = id;
    renderGlobal(); // 수정 버튼을 누르면 화면을 다시 그려서 인라인 폼을 띄움
}

function cancelEditMemo() {
    editingMemoId = null;
    renderGlobal();
}

function saveInlineMemo(id) {
    const val = document.getElementById(`inline-memo-${id}`).value.trim();
    if (!val) { showToast('메모 내용을 입력해주세요.'); return; }
    
    updateAppState(() => {
        const target = appState.global.memo.find(m => m.id === id);
        if (target) target.label = val;
        editingMemoId = null;
    }, [renderGlobal]);
}

// ==========================================
// 6. 탭 이동 및 캐릭터, 글로벌 데이터 삭제 
// ==========================================
let managingCharId = null;
function switchTab(charId) { updateAppState(() => { appState.activeTabId = charId; currentlyEditingTask = null; }, [renderTabs, renderCharacterTasks]); }

function addNewCharacter() { document.getElementById('char-add-name').value = ''; document.getElementById('char-add-modal').classList.add('show'); setTimeout(() => document.getElementById('char-add-name').focus(), 100); }
function closeCharAddModal() { document.getElementById('char-add-modal').classList.remove('show'); }
function submitNewCharacter() { 
    const nameInput = document.getElementById('char-add-name'); const name = nameInput.value.trim(); 
    if (name) { 
        updateAppState(() => {
            appState.characters.push({ id: genId(), name: name, checks: {}, customTasks: { 'daily': [], 'daily-trade': [], 'weekly': [], 'weekly-trade': [] }, hiddenTasks: [] }); 
            appState.activeTabId = appState.characters[appState.characters.length-1].id; closeCharAddModal(); 
        }); 
    } else { showToast("캐릭터 이름을 입력해주세요."); nameInput.focus(); } 
}

function manageCharacter(charId) { const char = appState.characters.find(c => c.id === charId); if (!char) return; managingCharId = charId; document.getElementById('char-edit-name').value = char.name; document.getElementById('char-modal').classList.add('show'); }
function closeCharModal() { managingCharId = null; document.getElementById('char-modal').classList.remove('show'); }
function saveCharacterName() { 
    if (!managingCharId) return; const newName = document.getElementById('char-edit-name').value.trim(); 
    if (newName) { updateAppState(() => { const char = appState.characters.find(c => c.id === managingCharId); if (char) char.name = newName; closeCharModal(); }, [renderTabs]); } 
}

function deleteCharacter() {
    if (!managingCharId) return; if (appState.characters.length <= 1) { showToast("최소 1개의 캐릭터는 남겨두어야 합니다."); return; } const char = appState.characters.find(c => c.id === managingCharId);
    if (confirm(`정말 [${char.name}] 캐릭터를 삭제하시겠습니까?\n이 캐릭터의 모든 숙제 체크 내역이 사라집니다.`)) { 
        updateAppState(() => {
            appState.characters = appState.characters.filter(c => c.id !== managingCharId); appState.activeTabId = appState.characters[0].id; closeCharModal(); 
        }); 
    }
}

function deleteGlobal(type, id) { 
    // 🌟 이벤트 기간 및 공통 메모 내용 표시
    let itemName = '';
    if (type === 'event') {
        const ev = appState.global.event.find(e => e.id === id);
        // 기간(period)이 있으면 함께 출력
        itemName = ev ? `이벤트 [${ev.period}] ${ev.title} ` : '이 항목';
    } else if (type === 'memo') {
        const memo = appState.global.memo.find(m => m.id === id);
        itemName = memo ? `메모 [${memo.label}]` : '이 항목';
    }
    
    if (!confirm(`${itemName}을(를) 삭제하시겠습니까?`)) return; 
    
    updateAppState(() => { appState.global[type] = appState.global[type].filter(i => i.id !== id); }, [renderTabs, renderGlobal, renderCharacterTasks]); 
}

function openDeleteModal(category, taskId, isGlobal) { 
    deleteTarget = { category, taskId, isGlobal }; 
    
    // 🌟 개별 숙제 이름 및 마을 추출
    let taskName = '';
    let targetTask = null;

    if (isGlobal) {
        targetTask = appState.global.tasksTemplate[category].find(t => t.id === taskId);
    } else {
        const activeChar = appState.characters.find(c => c.id === appState.activeTabId);
        if (activeChar && activeChar.customTasks[category]) {
            targetTask = activeChar.customTasks[category].find(t => t.id === taskId);
        }
    }

    if (targetTask) {
        let baseName = targetTask.type === 'trade' ? `${targetTask.fromItem} → ${targetTask.toItem}` : targetTask.label;
        // 마을(town) 정보가 있으면 대괄호로 앞에 추가
        taskName = targetTask.town ? `[${targetTask.town}] ${baseName}` : baseName;
    }

    const modalTitle = document.querySelector('#delete-modal h3');
    if (modalTitle) {
        modalTitle.innerText = taskName ? `삭제: ${taskName}` : '항목 삭제';
    }
    
    document.getElementById('delete-modal').classList.add('show'); 
}

function closeDeleteModal() { deleteTarget = null; document.getElementById('delete-modal').classList.remove('show'); }

function executeDelete(type) {
    if (!deleteTarget) return; const { category, taskId, isGlobal } = deleteTarget; 
    updateAppState(() => {
        const activeChar = appState.characters.find(c => c.id === appState.activeTabId);
        if (type === 'all') { 
            if (isGlobal) appState.global.tasksTemplate[category] = appState.global.tasksTemplate[category].filter(t => t.id !== taskId); 
            appState.characters.forEach(char => { if (char.customTasks[category]) char.customTasks[category] = char.customTasks[category].filter(t => t.id !== taskId); delete char.checks[taskId]; delete appState.global.sharedChecks[taskId]; if (char.hiddenTasks) char.hiddenTasks = char.hiddenTasks.filter(id => id !== taskId); }); 
        } else if (type === 'local') { 
            if (isGlobal) { if (!activeChar.hiddenTasks) activeChar.hiddenTasks = []; activeChar.hiddenTasks.push(taskId); } else { activeChar.customTasks[category] = activeChar.customTasks[category].filter(t => t.id !== taskId); } delete activeChar.checks[taskId]; 
        }
        closeDeleteModal(); 
    }, [renderTabs, renderCharacterTasks]);
}

// ==========================================
// 7. 이벤트 바인딩
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-notice-add-toggle')?.addEventListener('click', () => toggleInput('notice'));
    document.getElementById('btn-notice-save')?.addEventListener('click', addNotice);
    document.getElementById('btn-event-add-toggle')?.addEventListener('click', toggleEventInput);
    document.getElementById('btn-memo-add-toggle')?.addEventListener('click', () => toggleInput('memo'));
    document.getElementById('btn-memo-save')?.addEventListener('click', addMemo);
    document.getElementById('input-memo')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') addMemo(); });
    document.getElementById('btn-noti-toggle')?.addEventListener('click', requestNotificationPermission);
    document.getElementById('btn-abyss-schedule')?.addEventListener('click', toggleAbyssSchedule);
    document.getElementById('btn-abyss-edit')?.addEventListener('click', () => toggleInput('abyss'));
    document.getElementById('btn-abyss-cancel')?.addEventListener('click', () => toggleInput('abyss'));
    document.getElementById('btn-abyss-save')?.addEventListener('click', saveAbyssTime);
    document.getElementById('btn-char-add-submit')?.addEventListener('click', submitNewCharacter);
    document.getElementById('btn-char-add-cancel')?.addEventListener('click', closeCharAddModal);
    document.getElementById('char-add-name')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') submitNewCharacter(); });
    document.getElementById('char-add-modal')?.addEventListener('click', function(e) { if (e.target === this) closeCharAddModal(); });
    document.getElementById('btn-del-local')?.addEventListener('click', () => executeDelete('local'));
    document.getElementById('btn-del-all')?.addEventListener('click', () => executeDelete('all'));
    document.getElementById('btn-del-cancel')?.addEventListener('click', closeDeleteModal);
    document.getElementById('delete-modal')?.addEventListener('click', function(e) { if (e.target === this) closeDeleteModal(); });
    document.getElementById('btn-char-edit-save')?.addEventListener('click', saveCharacterName);
    document.getElementById('btn-char-edit-cancel')?.addEventListener('click', closeCharModal);
    document.getElementById('btn-char-delete')?.addEventListener('click', deleteCharacter);
    document.getElementById('char-edit-name')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') saveCharacterName(); });
    document.getElementById('char-modal')?.addEventListener('click', function(e) { if (e.target === this) closeCharModal(); });
    document.getElementById('auth-btn')?.addEventListener('click', () => { if (typeof linkGoogleAccount === 'function') linkGoogleAccount(); });
    document.getElementById('theme-toggle')?.addEventListener('click', () => { if (typeof toggleDarkMode === 'function') toggleDarkMode(); });
});