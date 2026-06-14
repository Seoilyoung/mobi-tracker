// ==========================================
// 1. 이벤트 제어 및 항목 조작
// ==========================================
function toggleAbyssSchedule() { document.getElementById('abyss-timeline').classList.toggle('hidden'); }
function saveAbyssTime() {
    const val = document.getElementById('input-abyss').value; if(!val) { showToast('시간을 선택해주세요.'); return; }
    appState.global.abyss.baseTime = new Date(val).toISOString(); document.getElementById('add-wrap-abyss').classList.add('hidden'); saveData(); renderGlobal();
}

function cycleTownColor(categoryId, townName) { if (!appState.global.towns[categoryId][townName]) return; let curColor = appState.global.towns[categoryId][townName].color; let idx = pastelColors.indexOf(curColor); appState.global.towns[categoryId][townName].color = pastelColors[(idx + 1) % pastelColors.length]; saveData(); renderCharacterTasks(); }

function moveBlock(categoryId, type, idOrName, direction) {
    const activeChar = appState.characters.find(c => c.id === appState.activeTabId); let globalTasks = appState.global.tasksTemplate[categoryId].filter(t => !activeChar.hiddenTasks.includes(t.id)).map(t => ({...t, isGlobal: true})); let customTasks = (activeChar.customTasks && activeChar.customTasks[categoryId]) ? activeChar.customTasks[categoryId].map(t => ({...t, isGlobal: false})) : []; let allTasks = [...globalTasks, ...customTasks];
    let isInnerTownTask = false; let targetTownName = null; if (type === 'task') { let t = allTasks.find(x => x.id === idOrName); if (t && t.town) { isInnerTownTask = true; targetTownName = t.town; } }
    let blocks = []; if (isInnerTownTask) { blocks = allTasks.filter(t => t.town === targetTownName).sort((a,b) => a.order - b.order); } else { let townMap = {}; allTasks.forEach(t => { if (t.town) { townMap[t.town] = true; } else { blocks.push({ id: t.id, order: t.order, isTask: true, taskObj: t }); } }); for (let tName in townMap) { blocks.push({ id: tName, order: appState.global.towns[categoryId][tName].order, isTask: false }); } blocks.sort((a,b) => a.order - b.order); }
    const idx = blocks.findIndex(b => b.id === idOrName); if (idx === -1) return; const targetIdx = direction === 'up' ? idx - 1 : idx + 1; if (targetIdx < 0 || targetIdx >= blocks.length) return;
    const curBlock = blocks[idx]; const tgtBlock = blocks[targetIdx]; const tempOrder = curBlock.order; curBlock.order = tgtBlock.order; tgtBlock.order = tempOrder;
    if (isInnerTownTask) { updateTaskOrder(categoryId, curBlock.id, curBlock.taskObj.isGlobal, curBlock.order); updateTaskOrder(categoryId, tgtBlock.id, tgtBlock.taskObj.isGlobal, tgtBlock.order); } else {
        if (curBlock.isTask) updateTaskOrder(categoryId, curBlock.id, curBlock.taskObj.isGlobal, curBlock.order); else appState.global.towns[categoryId][curBlock.id].order = curBlock.order;
        if (tgtBlock.isTask) updateTaskOrder(categoryId, tgtBlock.id, tgtBlock.taskObj.isGlobal, tgtBlock.order); else appState.global.towns[categoryId][tgtBlock.id].order = tgtBlock.order;
    }
    saveData(); renderCharacterTasks();
}
function updateTaskOrder(categoryId, taskId, isGlobal, newOrder) { if (isGlobal) { let t = appState.global.tasksTemplate[categoryId].find(x => x.id === taskId); if(t) t.order = newOrder; } else { appState.characters.forEach(c => { if (c.customTasks[categoryId]) { let t = c.customTasks[categoryId].find(x => x.id === taskId); if(t) t.order = newOrder; } }); } }

document.addEventListener('click', function(event) { if (event.target.closest('.add-wrap') || event.target.closest('.toggle-btn') || event.target.closest('.icon-btn') || event.target.closest('.modal-box') || event.target.classList.contains('char-chip') || event.target.closest('.inline-form-box')) return; document.querySelectorAll('.grid .add-wrap:not(.hidden)').forEach(el => el.classList.add('hidden')); resetEventForm(); if (currentlyEditingTask) cancelEdit(currentlyEditingTask.categoryId, currentlyEditingTask.taskId); });

function closeEventForm() { document.getElementById('add-wrap-event').classList.add('hidden'); resetEventForm(); }
function toggleEventInput() {
    const wrap = document.getElementById(`add-wrap-event`); if (!wrap.classList.contains('hidden') && editingEventId === null) { closeEventForm(); return; }
    resetEventForm(); wrap.classList.remove('hidden');
    let chipsHtml = `<div class="target-chars-wrap" id="chips-event-new">`; appState.characters.forEach(c => { chipsHtml += `<div class="char-chip selected" onclick="this.classList.toggle('selected')" data-char-id="${c.id}">${c.name}</div>`; }); chipsHtml += `</div>`;
    wrap.innerHTML = `<div class="inline-form-box">${chipsHtml}<div class="form-row"><input type="text" id="input-ev-period" placeholder="기간 (예: ~6.30 또는 12.20~01.10)" style="max-width: 250px;"><input type="text" id="input-ev-title" placeholder="이벤트 제목"></div><div class="form-row day-selector" id="event-day-selector">${['월','화','수','목','금','토','일'].map(d => `<button type="button" class="day-btn" onclick="toggleEventDay(this, '${d}')">${d}</button>`).join('')}</div><div class="form-row"><input type="text" id="input-ev-memo1" placeholder="메모 1"><input type="text" id="input-ev-memo2" placeholder="메모 2"></div><div class="form-actions"><button type="button" class="btn-cancel" onclick="closeEventForm()">취소</button><button type="button" class="btn-submit" onclick="submitEvent()">추가</button></div></div>`;
    setTimeout(() => wrap.scrollIntoView({ behavior: 'smooth', block: 'end' }), 10);
}
function editEvent(id) {
    const ev = appState.global.event.find(e => e.id === id); if (!ev) return;
    const wrap = document.getElementById(`add-wrap-event`); wrap.classList.remove('hidden');
    let chipsHtml = `<div class="target-chars-wrap" id="chips-event-${id}">`; appState.characters.forEach(c => { let isSelected = !ev.targetChars || ev.targetChars.includes('all') || ev.targetChars.includes(c.id); chipsHtml += `<div class="char-chip ${isSelected ? 'selected' : ''}" onclick="this.classList.toggle('selected')" data-char-id="${c.id}">${c.name}</div>`; }); chipsHtml += `</div>`;
    wrap.innerHTML = `<div class="inline-form-box">${chipsHtml}<div class="form-row"><input type="text" id="input-ev-period" placeholder="기간 (예: ~6.30 또는 12.20~01.10)" style="max-width: 250px;" value="${ev.period || ''}"><input type="text" id="input-ev-title" placeholder="이벤트 제목" value="${ev.title || ''}"></div><div class="form-row day-selector" id="event-day-selector">${['월','화','수','목','금','토','일'].map(d => `<button type="button" class="day-btn ${ev.days && ev.days.includes(d) ? 'selected' : ''}" onclick="toggleEventDay(this, '${d}')">${d}</button>`).join('')}</div><div class="form-row"><input type="text" id="input-ev-memo1" placeholder="메모 1" value="${ev.memo1 || ''}"><input type="text" id="input-ev-memo2" placeholder="메모 2" value="${ev.memo2 || ''}"></div><div class="form-actions"><button type="button" class="btn-cancel" onclick="closeEventForm()">취소</button><button type="button" class="btn-submit edit" id="btn-submit-event" onclick="submitEvent()">수정</button></div></div>`;
    selectedEventDays = [...(ev.days || [])]; editingEventId = id; setTimeout(() => wrap.scrollIntoView({ behavior: 'smooth', block: 'end' }), 10);
}
function submitEvent() {
    const period = document.getElementById('input-ev-period').value.trim(); const title = document.getElementById('input-ev-title').value.trim(); const memo1 = document.getElementById('input-ev-memo1').value.trim(); const memo2 = document.getElementById('input-ev-memo2').value.trim(); if (!title) { showToast('이벤트 제목은 필수입니다.'); return; } const days = [...selectedEventDays];
    const tid = editingEventId || 'new'; const chipWrap = document.getElementById(`chips-event-${tid}`); const selectedCharIds = Array.from(chipWrap.querySelectorAll('.char-chip.selected')).map(c => c.dataset.charId); if (selectedCharIds.length === 0) { showToast('최소 하나 이상의 캐릭터를 선택하세요.'); return; } const targetChars = selectedCharIds.length === appState.characters.length ? ['all'] : selectedCharIds;
    if (editingEventId) { const evIndex = appState.global.event.findIndex(e => e.id === editingEventId); if (evIndex > -1) { appState.global.event[evIndex] = { ...appState.global.event[evIndex], period, title, days, memo1, memo2, targetChars }; } } else { appState.global.event.push({ id: genId(), period, title, days, memo1, memo2, targetChars }); }
    closeEventForm(); saveData(); renderTabs(); renderGlobal(); renderCharacterTasks(); 
}
function resetEventForm() { editingEventId = null; selectedEventDays = []; }
function toggleEventDay(btn, day) { btn.classList.toggle('selected'); if (btn.classList.contains('selected')) { if (!selectedEventDays.includes(day)) selectedEventDays.push(day); } else { selectedEventDays = selectedEventDays.filter(d => d !== day); } }

function toggleInput(categoryId) {
    const wrap = document.getElementById(`add-wrap-${categoryId}`); if(!wrap) return;
    if(categoryId === 'memo' || categoryId === 'abyss' || categoryId === 'notice') { 
        wrap.classList.toggle('hidden'); if(!wrap.classList.contains('hidden') && categoryId === 'abyss' && appState.global.abyss.baseTime) { try { const d = new Date(appState.global.abyss.baseTime); const localStr = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0,16); document.getElementById('input-abyss').value = localStr; } catch(e) {} } return; 
    }
    if(wrap.classList.contains('hidden')) { wrap.classList.remove('hidden'); wrap.innerHTML = getTaskFormHTML(categoryId); setTimeout(() => wrap.scrollIntoView({ behavior: 'smooth', block: 'end' }), 10); } else { wrap.classList.add('hidden'); }
}
function toggleCompleted(categoryId) { uiState.showCompleted[categoryId] = !uiState.showCompleted[categoryId]; renderCharacterTasks(); }
function editTask(categoryId, taskId, isGlobal) { if (currentlyEditingTask && currentlyEditingTask.taskId === 'new') { document.getElementById(`add-wrap-${currentlyEditingTask.categoryId}`).classList.add('hidden'); } currentlyEditingTask = { categoryId, taskId, isGlobal }; renderCharacterTasks(); setTimeout(() => { const editBox = document.querySelector('.inline-form-box'); if(editBox) editBox.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, 10); }
function cancelEdit(categoryId, taskId) { if(taskId === 'new') { document.getElementById(`add-wrap-${categoryId}`).classList.add('hidden'); } currentlyEditingTask = null; renderCharacterTasks(); }
function saveTask(categoryId, taskId, isGlobal) {
    const tid = taskId; const fid = `${categoryId}-${tid}`; const isTrade = categoryId.includes('trade'); const isIndiv = document.getElementById(`indiv-${fid}`).checked; const isShared = !isIndiv; const isPaused = document.getElementById(`paused-${fid}`).checked; const town = document.getElementById(`town-${fid}`).value.trim(); const npc = isTrade ? document.getElementById(`npc-${fid}`).value.trim() : '';
    let label = '', fromItem = '', fromQty = 0, toItem = '', toQty = 0;
    if (isTrade) { fromItem = document.getElementById(`from-${fid}`).value.trim(); fromQty = Number(document.getElementById(`from-qty-${fid}`).value); toItem = document.getElementById(`to-${fid}`).value.trim(); toQty = Number(document.getElementById(`to-qty-${fid}`).value); if (!fromItem || !fromQty || !toItem || !toQty) { showToast('교환 정보를 모두 입력하세요.'); return; } } else { label = document.getElementById(`label-${fid}`).value.trim(); if (!label) { showToast('내용을 입력하세요.'); return; } }
    const chipWrap = document.getElementById(`chips-${fid}`); const selectedCharIds = Array.from(chipWrap.querySelectorAll('.char-chip.selected')).map(c => c.dataset.charId); if (selectedCharIds.length === 0) { showToast('최소 하나 이상의 캐릭터를 선택하세요.'); return; } const isAll = selectedCharIds.length === appState.characters.length;
    if (town && !appState.global.towns[categoryId][town]) { appState.global.towns[categoryId][town] = { order: Date.now(), color: pastelColors[0] }; }
    let tOrder = Date.now(); if (taskId !== 'new') { let oldT = isGlobal ? appState.global.tasksTemplate[categoryId].find(t=>t.id===taskId) : appState.characters.find(c=>c.id===appState.activeTabId).customTasks[categoryId].find(t=>t.id===taskId); if(oldT) tOrder = oldT.order; if (isGlobal) appState.global.tasksTemplate[categoryId] = appState.global.tasksTemplate[categoryId].filter(t => t.id !== taskId); else appState.characters.forEach(c => c.customTasks[categoryId] = c.customTasks[categoryId].filter(t => t.id !== taskId)); }
    let taskData = { id: taskId === 'new' ? genId() : taskId, isShared, town, npc, order: tOrder, isPaused }; if (isTrade) { taskData.type = 'trade'; taskData.fromItem = fromItem; taskData.fromQty = fromQty; taskData.toItem = toItem; taskData.toQty = toQty; } else { taskData.type = 'normal'; taskData.label = label; }
    if (isAll) { appState.global.tasksTemplate[categoryId].push(taskData); appState.characters.forEach(c => c.hiddenTasks = c.hiddenTasks.filter(id => id !== taskData.id)); } else { appState.characters.forEach(c => { if (selectedCharIds.includes(c.id)) c.customTasks[categoryId].push({...taskData}); }); }
    currentlyEditingTask = null; if(taskId === 'new') document.getElementById(`add-wrap-${categoryId}`).classList.add('hidden'); saveData(); renderTabs(); renderCharacterTasks();
}

function toggleTask(taskId, isChecked, isShared, categoryId) {
    if (isShared) { appState.global.sharedChecks[taskId] = isChecked; } else { appState.characters.find(c => c.id === appState.activeTabId).checks[taskId] = isChecked; } saveData(); 
    const checkbox = document.getElementById(taskId); if(checkbox) { const li = checkbox.closest('.task-item'); if(li) { if(isChecked) li.classList.add('checked'); else li.classList.remove('checked'); if(!uiState.showCompleted[categoryId]) { if(isChecked) li.classList.add('hidden-task'); else li.classList.remove('hidden-task'); } } } 
    updateTabStatus(appState.activeTabId);
}

// ==========================================
// 2. 캐릭터 및 모달 제어
// ==========================================
function addNotice() {
    const title = document.getElementById('input-notice-title').value.trim(); let url = document.getElementById('input-notice-url').value.trim(); if(!title) { showToast('공지 제목을 입력하세요.'); return; } if (url && !url.startsWith('http://') && !url.startsWith('https://')) { url = 'https://' + url; }
    appState.global.notices.unshift({ id: genId(), title, url }); document.getElementById('input-notice-title').value = ''; document.getElementById('input-notice-url').value = ''; document.getElementById('add-wrap-notice').classList.add('hidden'); saveData(); renderGlobal();
}
function deleteNotice(id) { if(!confirm("이 공지사항을 내역에서 삭제하시겠습니까?")) return; appState.global.notices = appState.global.notices.filter(n => n.id !== id); saveData(); renderGlobal(); }
function addMemo() { const val = document.getElementById('input-memo').value.trim(); if (!val) return; appState.global.memo.push({ id: genId(), label: val }); document.getElementById('input-memo').value = ''; document.getElementById('add-wrap-memo').classList.add('hidden'); saveData(); renderGlobal(); }

let managingCharId = null;
function switchTab(charId) { appState.activeTabId = charId; currentlyEditingTask = null; saveData(); renderTabs(); renderCharacterTasks(); }
function addNewCharacter() { document.getElementById('char-add-name').value = ''; document.getElementById('char-add-modal').classList.add('show'); setTimeout(() => document.getElementById('char-add-name').focus(), 100); }
function closeCharAddModal() { document.getElementById('char-add-modal').classList.remove('show'); }
function submitNewCharacter() { const nameInput = document.getElementById('char-add-name'); const name = nameInput.value.trim(); if (name) { appState.characters.push({ id: genId(), name: name, checks: {}, customTasks: { 'daily': [], 'daily-trade': [], 'weekly': [], 'weekly-trade': [] }, hiddenTasks: [] }); appState.activeTabId = appState.characters[appState.characters.length-1].id; saveData(); renderAll(); closeCharAddModal(); } else { showToast("캐릭터 이름을 입력해주세요."); nameInput.focus(); } }
function manageCharacter(charId) { const char = appState.characters.find(c => c.id === charId); if (!char) return; managingCharId = charId; document.getElementById('char-edit-name').value = char.name; document.getElementById('char-modal').classList.add('show'); }
function closeCharModal() { managingCharId = null; document.getElementById('char-modal').classList.remove('show'); }
function saveCharacterName() { if (!managingCharId) return; const newName = document.getElementById('char-edit-name').value.trim(); if (newName) { const char = appState.characters.find(c => c.id === managingCharId); if (char) char.name = newName; saveData(); renderTabs(); } closeCharModal(); }
function deleteCharacter() {
    if (!managingCharId) return; if (appState.characters.length <= 1) { showToast("최소 1개의 캐릭터는 남겨두어야 합니다."); return; } const char = appState.characters.find(c => c.id === managingCharId);
    if (confirm(`정말 [${char.name}] 캐릭터를 삭제하시겠습니까?\n이 캐릭터의 모든 숙제 체크 내역이 사라집니다.`)) { appState.characters = appState.characters.filter(c => c.id !== managingCharId); appState.activeTabId = appState.characters[0].id; saveData(); renderAll(); closeCharModal(); }
}

function deleteGlobal(type, id) { if (!confirm("삭제하시겠습니까?")) return; appState.global[type] = appState.global[type].filter(i => i.id !== id); saveData(); renderTabs(); renderGlobal(); renderCharacterTasks(); }
function openDeleteModal(category, taskId, isGlobal) { deleteTarget = { category, taskId, isGlobal }; document.getElementById('delete-modal').classList.add('show'); }
function closeDeleteModal() { deleteTarget = null; document.getElementById('delete-modal').classList.remove('show'); }
function executeDelete(type) {
    if (!deleteTarget) return; const { category, taskId, isGlobal } = deleteTarget; const activeChar = appState.characters.find(c => c.id === appState.activeTabId);
    if (type === 'all') { if (isGlobal) appState.global.tasksTemplate[category] = appState.global.tasksTemplate[category].filter(t => t.id !== taskId); appState.characters.forEach(char => { if (char.customTasks[category]) char.customTasks[category] = char.customTasks[category].filter(t => t.id !== taskId); delete char.checks[taskId]; delete appState.global.sharedChecks[taskId]; if (char.hiddenTasks) char.hiddenTasks = char.hiddenTasks.filter(id => id !== taskId); }); } else if (type === 'local') { if (isGlobal) { if (!activeChar.hiddenTasks) activeChar.hiddenTasks = []; activeChar.hiddenTasks.push(taskId); } else { activeChar.customTasks[category] = activeChar.customTasks[category].filter(t => t.id !== taskId); } delete activeChar.checks[taskId]; }
    closeDeleteModal(); saveData(); renderTabs(); renderCharacterTasks();
}