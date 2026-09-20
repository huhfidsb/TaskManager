// Supabase接続情報
const SUPABASE_URL = 'https://sdoviywawxvyeecbrjep.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_t2aaxAOvsaVqUUkqiUGKaA_lLvRzsut';

let supabaseClient;
try {
    const { createClient } = window.supabase;
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
    console.error("Supabase初期化エラー", e);
}

let folders = [];
let folderTasks = [];
let unfiledTasks = [];
let currentFolder = null;
let isShowingCompleted = false;

// ページ読み込み時にログイン状態を判定
window.onload = async () => {
    if (!supabaseClient) return;
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        showApp(session.user);
    } else {
        showAuth();
    }
};

// --- 画面表示切り替え ---
function showApp(user) {
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('app-section').style.display = 'block';
    if (user) {
        document.getElementById('user-email-display').innerText = user.email;
    }
    fetchFolders();
    fetchUnfiledTasks();
    initNotificationCheck();
}

function showAuth() {
    document.getElementById('auth-section').style.display = 'block';
    document.getElementById('app-section').style.display = 'none';
}

// --- 認証機能 ---
async function handleSignUp() {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    if (!email || !password) return alert('メールアドレスとパスワードを入力してください。');

    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) {
        alert('登録エラー: ' + error.message);
    } else {
        alert('アカウントを作成しました！');
        showApp(data.user);
    }
}

async function handleSignIn() {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    if (!email || !password) return alert('メールアドレスとパスワードを入力してください。');

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
        alert('ログインエラー: ' + error.message);
    } else {
        showApp(data.user);
    }
}

async function handleSignOut() {
    await supabaseClient.auth.signOut();
    showAuth();
}

// --- フォルダ（ファイル詳細）画面切り替え ---
function openFolder(folder) {
    currentFolder = folder;
    document.getElementById('view-top').style.display = 'none';
    document.getElementById('view-folder-detail').style.display = 'block';
    document.getElementById('current-folder-title').innerText = '📁 ' + folder.name;
    switchTab(false);
}

function closeFolder() {
    currentFolder = null;
    document.getElementById('view-top').style.display = 'block';
    document.getElementById('view-folder-detail').style.display = 'none';
    fetchFolders();
    fetchUnfiledTasks();
}

// --- フォルダ操作 ---
async function fetchFolders() {
    const { data, error } = await supabaseClient.from('folders').select('*').order('created_at', { ascending: true });
    if (!error) {
        folders = data || [];
        renderFolders();
    }
}

function renderFolders() {
    const grid = document.getElementById('folder-grid');
    grid.innerHTML = '';

    if (folders.length === 0) {
        grid.innerHTML = '<p style="color:#8e8e93; grid-column: 1/-1;">ファイルがまだありません。上のフォームから作成してください。</p>';
        return;
    }

    folders.forEach(folder => {
        const card = document.createElement('div');
        card.className = 'folder-card';
        card.style.cssText = 'background: var(--card-bg); border: 2px solid #e5e5ea; border-radius: 12px; padding: 15px; text-align: center; cursor: pointer;';
        card.onclick = () => openFolder(folder);

       const safeFolderName = folder.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');

        card.innerHTML = `
            <button style="position: absolute; top: 8px; right: 8px; background: #ff3b30; color: white; border: none; border-radius: 50%; width: 22px; height: 22px; font-size: 12px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;" 
                title="ファイルを削除" onclick="deleteFolder('${folder.id}', '${safeFolderName}', event)">×</button>
            <div style="font-size: 28px; margin-bottom: 5px;">📁</div>
            <div style="font-weight: bold; font-size: 14px; word-break: break-all; padding-right: 10px;">${folder.name}</div>
        `;
        grid.appendChild(card);
    });
}

async function addFolder() {
    const input = document.getElementById('new-folder-name');
    if (!input.value) return alert('ファイル名を入力してください。');

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return alert('ログインが必要です。');

    const { error } = await supabaseClient.from('folders').insert([{ 
        user_id: user.id, 
        name: input.value 
    }]);

    if (error) alert('ファイル作成エラー: ' + error.message);
    else {
        input.value = '';
        fetchFolders();
    }
}

// --- タブ切り替え ---
function switchTab(showCompleted) {
    isShowingCompleted = showCompleted;
    document.getElementById('tab-active').classList.toggle('active', !showCompleted);
    document.getElementById('tab-completed').classList.toggle('active', showCompleted);
    document.getElementById('task-form-group').style.display = showCompleted ? 'none' : 'block';
    document.getElementById('list-title').innerText = showCompleted ? '完了したタスクの履歴' : '未完了のタスク';
    fetchFolderTasks();
}

// --- 日数計算 ---
function calculateDaysRemaining(deadlineStr) {
    if (!deadlineStr) return 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const deadline = new Date(deadlineStr); deadline.setHours(0, 0, 0, 0);
    return Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
}

// --- ファイル外（単発）タスク ---
async function fetchUnfiledTasks() {
    const { data, error } = await supabaseClient
        .from('tasks')
        .select('*')
        .is('folder_id', null)
        .eq('is_completed', false)
        .order('deadline', { ascending: true });

    if (!error) {
        unfiledTasks = data || [];
        renderUnfiledTasks();
        checkAndSendNotifications();
    }
}

function renderUnfiledTasks() {
    const listElement = document.getElementById('unfiled-task-list');
    listElement.innerHTML = '';

    unfiledTasks.forEach((task) => {
        const daysRemaining = calculateDaysRemaining(task.deadline);
        const li = document.createElement('li');
        li.className = 'task-item';
        li.id = `task-card-${task.id}`;
        const displayDeadline = task.deadline ? task.deadline.replace('T', ' ').slice(0, 16) : '';
        const memoHtml = task.detail ? `<div class="task-memo">${task.detail}</div>` : '';

        const safeTitle = task.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const safeDetail = (task.detail || '').replace(/'/g, "\\'").replace(/\n/g, '\\n');

        li.innerHTML = `
            <div class="task-info">
                <h3>${task.title}</h3>
                <p>期限: ${displayDeadline} (あと ${daysRemaining} 日)</p>
                ${memoHtml}
            </div>
            <div class="task-actions" style="display: flex; gap: 5px;">
                <button style="background-color: #007aff; color: white; width: auto; padding: 4px 8px; font-size: 12px;" 
                    onclick="enableEditMode('${task.id}', '${safeTitle}', '${task.deadline}', '${safeDetail}', true)">編集</button>
                <button class="delete-btn" onclick="completeTask('${task.id}', true)">完了</button>
            </div>`;
        listElement.appendChild(li);
    });
}

async function addUnfiledTask() {
    const titleInput = document.getElementById('top-task-name');
    const deadlineInput = document.getElementById('top-deadline');
    const detailInput = document.getElementById('top-task-detail');

    if (!titleInput.value || !deadlineInput.value) return alert('タスク名と期限を入力してください。');

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return alert('ログインが必要です。');

    const { error } = await supabaseClient.from('tasks').insert([{
        user_id: user.id,
        folder_id: null,
        title: titleInput.value,
        deadline: deadlineInput.value,
        detail: detailInput.value
    }]);

    if (error) alert('追加エラー: ' + error.message);
    else {
        titleInput.value = ''; deadlineInput.value = ''; detailInput.value = '';
        fetchUnfiledTasks();
    }
}

// --- ファイル内タスク ---
async function fetchFolderTasks() {
    if (!currentFolder) return;

    const { data, error } = await supabaseClient
        .from('tasks')
        .select('*')
        .eq('folder_id', currentFolder.id)
        .eq('is_completed', isShowingCompleted)
        .order('deadline', { ascending: true });

    if (!error) {
        folderTasks = data || [];
        renderFolderTasks();
        checkAndSendNotifications();
    }
}

function renderFolderTasks() {
    const listElement = document.getElementById('folder-task-list');
    listElement.innerHTML = '';

    folderTasks.forEach((task) => {
        const daysRemaining = calculateDaysRemaining(task.deadline);
        const li = document.createElement('li');
        li.className = 'task-item';
        li.id = `task-card-${task.id}`;
        const displayDeadline = task.deadline ? task.deadline.replace('T', ' ').slice(0, 16) : '';
        const memoHtml = task.detail ? `<div class="task-memo">${task.detail}</div>` : '';

        const safeTitle = task.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const safeDetail = (task.detail || '').replace(/'/g, "\\'").replace(/\n/g, '\\n');

        if (!isShowingCompleted) {
            li.innerHTML = `
                <div class="task-info">
                    <h3>${task.title}</h3>
                    <p>期限: ${displayDeadline} (あと ${daysRemaining} 日)</p>
                    ${memoHtml}
                </div>
                <div class="task-actions" style="display: flex; gap: 5px;">
                    <button style="background-color: #007aff; color: white; width: auto; padding: 4px 8px; font-size: 12px;" 
                        onclick="enableEditMode('${task.id}', '${safeTitle}', '${task.deadline}', '${safeDetail}', false)">編集</button>
                    <button class="delete-btn" onclick="completeTask('${task.id}', false)">完了</button>
                </div>`;
        } else {
            li.innerHTML = `
                <div class="task-info">
                    <h3><s>${task.title}</s></h3>
                    <p>完了日時: ${task.completed_at ? task.completed_at.replace('T', ' ').slice(0, 16) : '不明'}</p>
                    ${memoHtml}
                </div>
                <div class="task-actions">
                    <button class="restore-btn" style="background-color: #e5f9e5; color: #34c759;" onclick="restoreTask('${task.id}')">復元</button>
                </div>`;
        }
        listElement.appendChild(li);
    });
}

async function addTask() {
    const titleInput = document.getElementById('task-name');
    const deadlineInput = document.getElementById('deadline');
    const detailInput = document.getElementById('task-detail');

    if (!titleInput.value || !deadlineInput.value) return alert('タスク名と期限を入力してください。');

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return alert('ログインが必要です。');

    const { error } = await supabaseClient.from('tasks').insert([{
        user_id: user.id,
        folder_id: currentFolder.id,
        title: titleInput.value,
        deadline: deadlineInput.value,
        detail: detailInput.value
    }]);

    if (error) alert('追加エラー: ' + error.message);
    else {
        titleInput.value = ''; deadlineInput.value = ''; detailInput.value = '';
        fetchFolderTasks();
    }
}

async function completeTask(taskId, isUnfiled) {
    const { error } = await supabaseClient.from('tasks').update({
        is_completed: true,
        completed_at: new Date().toISOString()
    }).eq('id', taskId);

    if (error) alert('完了エラー: ' + error.message);
    else {
        if (isUnfiled) fetchUnfiledTasks();
        else fetchFolderTasks();
    }
}

async function restoreTask(taskId) {
    const { error } = await supabaseClient.from('tasks').update({
        is_completed: false,
        completed_at: null
    }).eq('id', taskId);

    if (error) alert('復元エラー: ' + error.message);
    else fetchFolderTasks();
}

// --- インライン編集機能 ---
// --- インライン編集機能 ---
function enableEditMode(taskId, title, deadline, detail, isUnfiled) {
    const taskCard = document.getElementById(`task-card-${taskId}`);
    if (!taskCard) return;

    const formattedDeadline = deadline ? deadline.slice(0, 16) : '';

    taskCard.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
            <input type="text" id="edit-title-${taskId}" value="${title.replace(/"/g, '&quot;')}" placeholder="タスク名" required style="margin: 0; font-size: 14px;">
            
            <!-- カレンダー選択専用（手打ち禁止 & タップでカレンダーを自動表示） -->
            <input type="datetime-local" id="edit-deadline-${taskId}" value="${formattedDeadline}" required 
                onkeydown="return false" onclick="this.showPicker && this.showPicker()" style="margin: 0; font-size: 14px; cursor: pointer;">
            
            <textarea id="edit-detail-${taskId}" placeholder="メモ（任意）" style="margin: 0; font-size: 13px; height: 50px;">${(detail || '').replace(/</g, '&lt;')}</textarea>
            <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 5px;">
                <button style="background: #8e8e93; color: white; width: auto; padding: 5px 12px; font-size: 12px;" onclick="${isUnfiled ? 'fetchUnfiledTasks()' : 'fetchFolderTasks()'}">キャンセル</button>
                <button style="background: #34c759; color: white; width: auto; padding: 5px 12px; font-size: 12px;" onclick="saveInlineEdit('${taskId}', ${isUnfiled})">保存</button>
            </div>
        </div>
    `;
}

async function saveInlineEdit(taskId, isUnfiled) {
    const newTitle = document.getElementById(`edit-title-${taskId}`).value.trim();
    const newDeadline = document.getElementById(`edit-deadline-${taskId}`).value;
    const newDetail = document.getElementById(`edit-detail-${taskId}`).value.trim();

    if (!newTitle || !newDeadline) {
        return alert("タスク名と期限を入力してください。");
    }

    const { error } = await supabaseClient.from('tasks').update({
        title: newTitle,
        deadline: newDeadline,
        detail: newDetail
    }).eq('id', taskId);

    if (error) {
        alert("更新エラー: " + error.message);
    } else {
        if (isUnfiled) fetchUnfiledTasks();
        else fetchFolderTasks();
    }
}

// --- 通知機能 ---
async function requestNotificationPermission() {
    if (!("Notification" in window)) {
        alert("お使いのブラウザはWeb通知に対応していません。");
        return;
    }

    const permission = await Notification.requestPermission();
    if (permission === "granted") {
        alert("通知が許可されました！期限7日前からのリマインドが届きます。");
        document.getElementById('notification-banner').style.display = 'none';
        checkAndSendNotifications();
    } else {
        alert("通知が拒否されました。ブラウザの設定から許可できます。");
    }
}

function checkAndSendNotifications() {
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    const allTasks = [...folderTasks, ...unfiledTasks];
    
    allTasks.forEach(task => {
        if (task.is_completed) return;

        const days = calculateDaysRemaining(task.deadline);

        if (days >= 0 && days <= 7) {
            const lastNotifiedKey = `notified_${task.id}_${new Date().toISOString().slice(0, 10)}`;
            if (!localStorage.getItem(lastNotifiedKey)) {
                const message = days === 0 ? `【本日締切】「${task.title}」の期限です！` : `「${task.title}」の締切まで あと ${days} 日です！`;
                
                new Notification("絶対忘れないタスク", {
                    body: message,
                    icon: "https://cdn-icons-png.flaticon.com/512/3119/3119338.png"
                });

                localStorage.setItem(lastNotifiedKey, "true");
            }
        }
    });
}

function initNotificationCheck() {
    if ("Notification" in window && Notification.permission === "granted") {
        document.getElementById('notification-banner').style.display = 'none';
        checkAndSendNotifications();
    }
}
async function deleteFolder(folderId, folderName, event) {
    if (event) event.stopPropagation();

    if (!confirm(`ファイル「${folderName}」を削除してもよろしいですか？\n※ファイル内のタスクもすべて削除されます。`)) {
        return;   
    }

    //①ファイル内のタスクを削除//
    const { error: taskError } = await supabaseClient
        .from('tasks')
        .delete()
        .eq('folder_id', folderId);

    if (taskError) {
         return alert("タスク削除エラー: " + taskError.message);
    }
    
    //②ファイル自体を削除
    const { error: folderError } = await supabaseClient
        .from('folders')
        .delete()
        .eq('id', folderId);

    if (folderError) {
        alert("ファイル削除エラー: " + folderError.message);
    } else {
         fetchFolders();
    }
}

async function deleteCurrentFolder() {
    if (!currentFolder) return;
    await deleteFolder(currentFolder.id, currentFolder.name, null);
    closeFolder();
}
