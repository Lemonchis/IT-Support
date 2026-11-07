import { supabase } from './supabase.js';
import { clearSessionStart, escapeHtml, formatDate, showMessage } from './utils.js';

const priorityNames = {
  low: 'Низький',
  medium: 'Середній',
  high: 'Високий',
  critical: 'Критичний'
};
const requestStatuses = [
  ['new', 'Нова'],
  ['in_progress', 'У роботі'],
  ['waiting', 'Очікування'],
  ['completed', 'Завершена'],
  ['rejected', 'Відхилена']
];
const statusNames = Object.fromEntries(requestStatuses);
let requests = [];

function toLocalDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

async function initManager() {
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

  if (profileError) throw new Error(`Не вдалося завантажити профіль: ${profileError.message}`);
  if (!['manager', 'admin'].includes(profile.role)) {
    window.location.href = 'dashboard.html';
    return;
  }

  document.getElementById('manager-name').textContent = profile.full_name || user.email || 'Менеджер';
  document.getElementById('logout-btn').addEventListener('click', () => logOut(user.id));
  document.getElementById('manager-requests-body').addEventListener('change', updateRequest);
  document.getElementById('manager-search').addEventListener('input', renderRequests);
  document.getElementById('manager-filter-priority').addEventListener('change', renderRequests);
  document.getElementById('manager-filter-status').addEventListener('change', renderRequests);
  document.getElementById('manager-export-report').addEventListener('click', exportReport);
  await loadManagerData();
}

async function logOut(userId) {
  const { error } = await supabase.auth.signOut();
  if (error) {
    showMessage(document.getElementById('manager-message'), `Не вдалося вийти: ${error.message}`, true);
    return;
  }

  clearSessionStart(userId);
  window.location.href = 'index.html';
}

async function loadManagerData() {
  const loader = document.getElementById('manager-loading');
  loader.classList.remove('hidden');
  const { data, error } = await supabase
    .from('repair_requests')
    .select('*, profiles(full_name)')
    .order('created_at', { ascending: false });

  loader.classList.add('hidden');
  if (error) {
    showMessage(document.getElementById('manager-message'), `Не вдалося завантажити заявки: ${error.message}`, true);
    return;
  }

  requests = data || [];
  updateManagerStats();
  renderRequests();
}

function updateManagerStats() {
  const activeRequests = requests.filter((request) => ['in_progress', 'waiting'].includes(request.status));
  const overdueRequests = requests.filter((request) =>
    request.due_at
    && new Date(request.due_at).getTime() < Date.now()
    && !['completed', 'rejected'].includes(request.status)
  );
  document.getElementById('manager-stat-total').textContent = String(requests.length);
  document.getElementById('manager-stat-new').textContent =
    String(requests.filter((request) => request.status === 'new').length);
  document.getElementById('manager-stat-active').textContent = String(activeRequests.length);
  document.getElementById('manager-stat-overdue').textContent = String(overdueRequests.length);
  document.getElementById('manager-stat-completed').textContent =
    String(requests.filter((request) => request.status === 'completed').length);
}

function renderRequests() {
  const tbody = document.getElementById('manager-requests-body');
  const filtered = getFilteredRequests();
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td class="table-empty" colspan="7">Заявок за цими умовами не знайдено.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map((request) => `
    <tr>
      <td>${escapeHtml(request.id)}</td>
      <td>${formatDate(request.created_at)}</td>
      <td>${escapeHtml(request.profiles?.full_name || 'Невідомо')}</td>
      <td>${escapeHtml(request.title)}</td>
      <td>
        <select data-status-id="${escapeHtml(request.id)}" aria-label="Статус заявки ${escapeHtml(request.id)}">
          ${requestStatuses.map(([value, name]) =>
            `<option value="${value}" ${request.status === value ? 'selected' : ''}>${name}</option>`
          ).join('')}
        </select>
      </td>
      <td>
        <select data-priority-id="${escapeHtml(request.id)}" aria-label="Пріоритет заявки ${escapeHtml(request.id)}">
          ${Object.entries(priorityNames).map(([value, name]) =>
            `<option value="${value}" ${request.priority === value ? 'selected' : ''}>${name}</option>`
          ).join('')}
        </select>
      </td>
      <td>
        <input type="datetime-local" data-due-id="${escapeHtml(request.id)}"
          aria-label="Термін виконання заявки ${escapeHtml(request.id)}"
          value="${toLocalDateTime(request.due_at)}">
        ${request.due_at && new Date(request.due_at).getTime() < Date.now() && !['completed', 'rejected'].includes(request.status)
          ? '<small class="deadline-overdue">Прострочено</small>'
          : ''}
      </td>
    </tr>
  `).join('');
}

function getFilteredRequests() {
  const search = document.getElementById('manager-search').value.trim().toLocaleLowerCase('uk');
  const priority = document.getElementById('manager-filter-priority').value;
  const status = document.getElementById('manager-filter-status').value;
  return requests.filter((request) => {
    const text = `${request.id} ${request.profiles?.full_name || ''} ${request.title || ''}`
      .toLocaleLowerCase('uk');
    return text.includes(search)
      && (!priority || request.priority === priority)
      && (!status || request.status === status);
  });
}

function exportReport() {
  const headers = ['Номер заявки', 'Дата створення', 'Заявник', 'Проблема', 'Статус', 'Пріоритет', 'Термін виконання'];
  const rows = getFilteredRequests().map((request) => [
    request.id,
    formatDate(request.created_at, true),
    request.profiles?.full_name || 'Невідомо',
    request.title,
    statusNames[request.status] || request.status,
    priorityNames[request.priority] || request.priority,
    request.due_at ? formatDate(request.due_at, true) : 'Не встановлено'
  ]);
  const csv = [headers, ...rows].map((row) => row.map((value) => {
    const text = String(value ?? '').replace(/^[=+\-@]/, "'$&");
    return `"${text.replace(/"/g, '""')}"`;
  }).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'it-support-report.csv';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function updateRequest(event) {
  const select = event.target.closest('[data-priority-id], [data-status-id], [data-due-id]');
  if (!select) return;

  const isStatus = select.hasAttribute('data-status-id');
  const isDueDate = select.hasAttribute('data-due-id');
  const requestId = isStatus ? select.dataset.statusId : isDueDate ? select.dataset.dueId : select.dataset.priorityId;
  const request = requests.find((item) => String(item.id) === requestId);
  const field = isStatus ? 'status' : isDueDate ? 'due_at' : 'priority';
  const oldValue = request?.[field];
  select.disabled = true;
  try {
    const result = isStatus
      ? await supabase.rpc('update_request_status', {
        p_request_id: select.dataset.statusId,
        p_status: select.value
      })
      : isDueDate
        ? await supabase
          .from('repair_requests')
          .update({ due_at: select.value ? new Date(select.value).toISOString() : null })
          .eq('id', select.dataset.dueId)
      : await supabase
        .from('repair_requests')
        .update({ priority: select.value })
        .eq('id', select.dataset.priorityId);
    const { error } = result;
    if (error) throw error;
  } catch (error) {
    select.disabled = false;
    select.value = isDueDate ? toLocalDateTime(oldValue) : oldValue;
    const fieldName = isStatus ? 'статус' : isDueDate ? 'термін' : 'пріоритет';
    showMessage(document.getElementById('manager-message'), `Не вдалося змінити ${fieldName}: ${error.message}`, true);
    return;
  }

  const fieldName = isStatus ? 'Статус' : isDueDate ? 'Термін' : 'Пріоритет';
  showMessage(document.getElementById('manager-message'), `${fieldName} заявки оновлено.`);
  await loadManagerData();
}

initManager().catch((error) => {
  showMessage(document.getElementById('manager-message'), `Помилка панелі: ${error.message}`, true);
});
