import { supabase } from './supabase.js';
import { clearSessionStart, escapeHtml, formatDate, showMessage } from './utils.js';

const requestStatuses = [
  ['new', 'Нова'],
  ['in_progress', 'У роботі'],
  ['waiting', 'Очікування'],
  ['completed', 'Завершена'],
  ['rejected', 'Відхилена']
];

const userRoles = [
  ['user', 'Користувач'],
  ['manager', 'Менеджер'],
  ['admin', 'Адміністратор']
];

let requests = [];
let users = [];
let adminId;

const adminMessage = document.getElementById('admin-message');

async function initAdmin() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    window.location.href = 'index.html';
    return;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single();

  if (profileError || profile.role !== 'admin') {
    await supabase.auth.signOut();
    window.location.href = 'index.html';
    return;
  }

  adminId = user.id;
  document.getElementById('admin-name').textContent = profile.full_name || user.email || 'Адміністратор';
  document.getElementById('logout-btn').addEventListener('click', () => logOut(user.id));
  connectTabs();
  connectFilters();
  connectTableActions();
  await Promise.all([loadRequests(), loadUsers()]);
}

function connectTabs() {
  document.querySelectorAll('[data-admin-tab]').forEach((button) => {
    button.addEventListener('click', () => showTab(button.dataset.adminTab));
  });
}

function connectFilters() {
  document.getElementById('admin-search').addEventListener('input', renderRequests);
  document.getElementById('admin-filter-status').addEventListener('change', renderRequests);
  document.getElementById('users-search').addEventListener('input', renderUsers);
  document.getElementById('users-filter-role').addEventListener('change', renderUsers);
}

function connectTableActions() {
  const requestTable = document.getElementById('admin-requests-body');
  const userTable = document.getElementById('admin-users-body');

  requestTable.addEventListener('change', updateRequestStatus);
  requestTable.addEventListener('click', editRequestComment);
  userTable.addEventListener('change', updateUserRole);
  userTable.addEventListener('click', deleteUser);
}

async function logOut(userId) {
  const { error } = await supabase.auth.signOut();
  if (error) {
    showMessage(adminMessage, `Не вдалося вийти: ${error.message}`, true);
    return;
  }

  clearSessionStart(userId);
  window.location.href = 'index.html';
}

function showTab(name) {
  document.querySelectorAll('[data-admin-tab]').forEach((button) => {
    const active = button.dataset.adminTab === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });

  document.getElementById('requests-panel').classList.toggle('hidden', name !== 'requests');
  document.getElementById('users-panel').classList.toggle('hidden', name !== 'users');
}

async function loadRequests() {
  const { data, error } = await supabase
    .from('repair_requests')
    .select('*, profiles(full_name)')
    .order('created_at', { ascending: false });

  if (error) {
    showMessage(adminMessage, `Не вдалося завантажити заявки: ${error.message}`, true);
    return;
  }

  requests = data || [];
  updateStats();
  renderRequests();
}

async function loadUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    showMessage(adminMessage, `Не вдалося завантажити користувачів: ${error.message}`, true);
    return;
  }

  users = data || [];
  updateStats();
  renderUsers();
}

function updateStats() {
  document.getElementById('stat-new').textContent =
    requests.filter((request) => request.status === 'new').length;
  document.getElementById('stat-active').textContent =
    requests.filter((request) => ['in_progress', 'waiting'].includes(request.status)).length;
  document.getElementById('stat-completed').textContent =
    requests.filter((request) => request.status === 'completed').length;
  document.getElementById('stat-users').textContent = users.length;
}

function renderRequests() {
  const search = document.getElementById('admin-search').value.trim().toLocaleLowerCase('uk');
  const status = document.getElementById('admin-filter-status').value;
  const filtered = requests.filter((request) => {
    const text = [
      request.id,
      request.profiles?.full_name,
      request.title,
      request.equipment_type
    ].join(' ').toLocaleLowerCase('uk');

    return text.includes(search) && (!status || request.status === status);
  });

  const rows = filtered.map((request) => `
    <tr>
      <td>${escapeHtml(request.id)}</td>
      <td>${formatDate(request.created_at)}</td>
      <td>${escapeHtml(request.profiles?.full_name || 'Невідомо')}</td>
      <td>${escapeHtml(request.equipment_type)}</td>
      <td>${escapeHtml(request.title)}</td>
      <td>
        <select data-status-id="${escapeHtml(request.id)}" aria-label="Статус заявки ${escapeHtml(request.id)}">
          ${requestStatuses.map(([value, label]) => `
            <option value="${value}" ${request.status === value ? 'selected' : ''}>${label}</option>
          `).join('')}
        </select>
      </td>
      <td><span class="priority-badge priority-${escapeHtml(request.priority)}">${escapeHtml(request.priority)}</span></td>
      <td><button class="button-secondary button-small" type="button" data-comment-id="${escapeHtml(request.id)}">Коментар</button></td>
    </tr>
  `);

  document.getElementById('admin-requests-body').innerHTML =
    rows.join('') || '<tr><td class="table-empty" colspan="8">Заявок за цими умовами не знайдено.</td></tr>';
}

function renderUsers() {
  const search = document.getElementById('users-search').value.trim().toLocaleLowerCase('uk');
  const role = document.getElementById('users-filter-role').value;
  const filtered = users.filter((user) => {
    const text = [user.full_name, user.email, user.id].join(' ').toLocaleLowerCase('uk');
    return text.includes(search) && (!role || user.role === role);
  });

  const rows = filtered.map((user) => {
    const isCurrentAdmin = user.id === adminId;
    return `
      <tr>
        <td>
          <strong>${escapeHtml(user.full_name || 'Без імені')}</strong>
          <small class="user-id">${escapeHtml(user.id)}</small>
          ${isCurrentAdmin ? '<span class="current-user-label">Це ви</span>' : ''}
        </td>
        <td>${escapeHtml(user.email || '—')}</td>
        <td>${formatDate(user.created_at)}</td>
        <td>
          <select data-role-id="${escapeHtml(user.id)}" aria-label="Роль користувача ${escapeHtml(user.full_name)}" ${isCurrentAdmin ? 'disabled' : ''}>
            ${userRoles.map(([value, label]) => `
              <option value="${value}" ${user.role === value ? 'selected' : ''}>${label}</option>
            `).join('')}
          </select>
        </td>
        <td>${isCurrentAdmin
          ? '<span class="text-muted">Ваш акаунт</span>'
          : `<button class="button-danger button-small" type="button" data-delete-id="${escapeHtml(user.id)}" data-user-name="${escapeHtml(user.full_name || user.email || 'користувача')}">Видалити</button>`}
        </td>
      </tr>
    `;
  });

  document.getElementById('admin-users-body').innerHTML =
    rows.join('') || '<tr><td class="table-empty" colspan="5">Користувачів за цими умовами не знайдено.</td></tr>';
}

async function updateRequestStatus(event) {
  const select = event.target.closest('[data-status-id]');
  if (!select) return;

  select.disabled = true;
  try {
    const { error } = await supabase
      .from('repair_requests')
      .update({ status: select.value })
      .eq('id', select.dataset.statusId);
    if (error) throw error;
  } catch (error) {
    select.disabled = false;
    showMessage(adminMessage, `Не вдалося змінити статус: ${error.message}`, true);
    return;
  }

  showMessage(adminMessage, 'Статус заявки оновлено.');
  await loadRequests();
}

async function editRequestComment(event) {
  const button = event.target.closest('[data-comment-id]');
  if (!button) return;

  const comment = window.prompt('Введіть коментар адміністратора:');
  if (comment === null) return;

  try {
    const { error } = await supabase
      .from('repair_requests')
      .update({ admin_comment: comment.trim() || null })
      .eq('id', button.dataset.commentId);
    if (error) throw error;
  } catch (error) {
    showMessage(adminMessage, `Не вдалося зберегти коментар: ${error.message}`, true);
    return;
  }

  showMessage(adminMessage, 'Коментар до заявки збережено.');
}

async function updateUserRole(event) {
  const select = event.target.closest('[data-role-id]');
  if (!select) return;

  const user = users.find((item) => item.id === select.dataset.roleId);
  const oldRole = user?.role;
  select.disabled = true;

  try {
    const { error } = await supabase
      .from('profiles')
      .update({ role: select.value })
      .eq('id', select.dataset.roleId);
    if (error) throw error;
  } catch (error) {
    select.disabled = false;
    select.value = oldRole;
    showMessage(adminMessage, `Не вдалося змінити роль: ${error.message}`, true);
    return;
  }

  showMessage(adminMessage, 'Роль користувача оновлено.');
  await loadUsers();
}

async function deleteUser(event) {
  const button = event.target.closest('[data-delete-id]');
  if (!button) return;

  const userName = button.dataset.userName;
  const confirmed = window.confirm(
    `Видалити акаунт «${userName}» і всі його заявки? Цю дію не можна скасувати.`
  );
  if (!confirmed) return;

  button.disabled = true;
  try {
    const { error } = await supabase.functions.invoke('admin-delete-user', {
      body: { userId: button.dataset.deleteId }
    });
    if (error) throw error;
  } catch (error) {
    button.disabled = false;
    showMessage(adminMessage, `Не вдалося видалити акаунт: ${error.message}`, true);
    return;
  }

  showMessage(adminMessage, `Акаунт «${userName}» видалено.`);
  await Promise.all([loadUsers(), loadRequests()]);
}

initAdmin().catch((error) => {
  showMessage(adminMessage, `Помилка панелі адміністратора: ${error.message}`, true);
});
