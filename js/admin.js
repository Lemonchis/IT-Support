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
const priorityNames = {
  low: 'Низький',
  medium: 'Середній',
  high: 'Високий',
  critical: 'Критичний'
};

let requests = [];
let users = [];
let adminId;
let editingRequestId;

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
  document.getElementById('admin-filter-priority').addEventListener('change', renderRequests);
  document.getElementById('admin-filter-date-from').addEventListener('change', renderRequests);
  document.getElementById('admin-filter-date-to').addEventListener('change', renderRequests);
  document.getElementById('users-search').addEventListener('input', renderUsers);
  document.getElementById('users-filter-role').addEventListener('change', renderUsers);
}

function connectTableActions() {
  const requestTable = document.getElementById('admin-requests-body');
  const userTable = document.getElementById('admin-users-body');

  requestTable.addEventListener('change', updateRequestStatus);
  requestTable.addEventListener('click', editRequestDetails);
  document.getElementById('request-work-form').addEventListener('submit', saveRequestDetails);
  document.getElementById('request-work-close').addEventListener('click', () => {
    document.getElementById('request-work-dialog').close();
  });
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
    .select('*, profiles(full_name, email)')
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
  const priority = document.getElementById('admin-filter-priority').value;
  const dateFrom = document.getElementById('admin-filter-date-from').value;
  const dateTo = document.getElementById('admin-filter-date-to').value;
  const filtered = requests.filter((request) => {
    const text = [
      request.id,
      request.profiles?.full_name,
      request.profiles?.email,
      request.title,
      request.equipment_type
    ].join(' ').toLocaleLowerCase('uk');

    const requestDate = request.created_at ? request.created_at.slice(0, 10) : '';
    return text.includes(search)
      && (!status || request.status === status)
      && (!priority || request.priority === priority)
      && (!dateFrom || requestDate >= dateFrom)
      && (!dateTo || requestDate <= dateTo);
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
      <td><span class="priority-badge priority-${escapeHtml(request.priority)}">${escapeHtml(priorityNames[request.priority] || request.priority)}</span></td>
      <td><button class="button-secondary button-small" type="button" data-work-details-id="${escapeHtml(request.id)}">Робочі деталі</button></td>
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

function toLocalDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

async function updateRequestStatus(event) {
  const select = event.target.closest('[data-status-id]');
  if (!select) return;

  const request = requests.find((item) => String(item.id) === select.dataset.statusId);
  const previousStatus = request?.status;
  select.disabled = true;
  try {
    const { error } = await supabase
      .from('repair_requests')
      .update({ status: select.value })
      .eq('id', select.dataset.statusId);
    if (error) throw error;
  } catch (error) {
    select.disabled = false;
    select.value = previousStatus;
    showMessage(adminMessage, `Не вдалося змінити статус: ${error.message}`, true);
    return;
  }

  showMessage(adminMessage, 'Статус заявки оновлено.');
  await loadRequests();
}

function editRequestDetails(event) {
  const button = event.target.closest('[data-work-details-id]');
  if (!button) return;

  const request = requests.find((item) => String(item.id) === button.dataset.workDetailsId);
  if (!request) return;

  editingRequestId = request.id;
  document.getElementById('request-work-title').textContent = `Заявка №${request.id}`;
  document.getElementById('request-fault-cause').value = request.fault_cause || '';
  document.getElementById('request-resolution').value = request.resolution || '';
  document.getElementById('request-work-description').value = request.description || '';
  document.getElementById('request-work-equipment').value = [
    request.equipment_type,
    request.inventory_number ? `Інв. № ${request.inventory_number}` : '',
    request.location
  ].filter(Boolean).join(' · ');
  document.getElementById('request-work-contact').value = [
    request.profiles?.email,
    request.contact_phone
  ].filter(Boolean).join(' · ') || 'Не вказано';
  document.getElementById('request-due-at').value = toLocalDateTime(request.due_at);
  document.getElementById('request-admin-comment').value = request.admin_comment || '';
  document.getElementById('request-work-message').classList.add('hidden');
  document.getElementById('request-work-dialog').showModal();
}

async function saveRequestDetails(event) {
  event.preventDefault();
  const saveButton = document.getElementById('request-work-save');
  const message = document.getElementById('request-work-message');
  saveButton.disabled = true;

  const dueAt = document.getElementById('request-due-at').value;
  const updates = {
    fault_cause: document.getElementById('request-fault-cause').value.trim() || null,
    resolution: document.getElementById('request-resolution').value.trim() || null,
    due_at: dueAt ? new Date(dueAt).toISOString() : null,
    admin_comment: document.getElementById('request-admin-comment').value.trim() || null
  };

  try {
    const { error } = await supabase
      .from('repair_requests')
      .update(updates)
      .eq('id', editingRequestId);
    if (error) throw error;

    Object.assign(requests.find((request) => request.id === editingRequestId), updates);
    document.getElementById('request-work-dialog').close();
    showMessage(adminMessage, 'Робочі деталі заявки збережено.');
    renderRequests();
  } catch (error) {
    message.textContent = `Не вдалося зберегти робочі деталі: ${error.message}`;
    message.classList.remove('hidden');
  } finally {
    saveButton.disabled = false;
  }
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
