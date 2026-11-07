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
let editingRequest;

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
  document.getElementById('manager-requests-body').addEventListener('click', openRequestEditor);
  document.getElementById('manager-request-form').addEventListener('submit', saveRequestChanges);
  document.getElementById('manager-request-close').addEventListener('click', () => {
    document.getElementById('manager-request-dialog').close();
  });
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
    tbody.innerHTML = '<tr><td class="table-empty" colspan="8">Заявок за цими умовами не знайдено.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map((request) => `
    <tr>
      <td>${escapeHtml(request.id)}</td>
      <td>${formatDate(request.created_at)}</td>
      <td>${escapeHtml(request.profiles?.full_name || 'Невідомо')}</td>
      <td>${escapeHtml(request.title)}</td>
      <td>
        <span class="status-badge status-${escapeHtml(request.status)}">${escapeHtml(statusNames[request.status] || request.status)}</span>
      </td>
      <td><span class="manager-priority manager-priority-${escapeHtml(request.priority)}">${escapeHtml(priorityNames[request.priority] || request.priority)}</span></td>
      <td>${request.due_at
        ? `<span class="${request.due_at && new Date(request.due_at).getTime() < Date.now() && !['completed', 'rejected'].includes(request.status) ? 'manager-deadline-overdue' : 'manager-deadline'}">${formatDate(request.due_at, true)}</span>`
        : '<span class="manager-no-deadline">Не встановлено</span>'}</td>
      <td><button class="manager-row-action" type="button" data-edit-request="${escapeHtml(request.id)}">Керувати</button></td>
    </tr>
  `).join('');
}

function getFilteredRequests() {
  const search = document.getElementById('manager-search').value.trim().toLocaleLowerCase('uk');
  const priority = document.getElementById('manager-filter-priority').value;
  const status = document.getElementById('manager-filter-status').value;
  return requests.filter((request) => {
    const text = [
      request.id,
      request.profiles?.full_name,
      request.title,
      request.equipment_type,
      request.inventory_number,
      request.location
    ].filter(Boolean).join(' ')
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

function openRequestEditor(event) {
  const button = event.target.closest('[data-edit-request]');
  if (!button) return;

  editingRequest = requests.find((request) => String(request.id) === button.dataset.editRequest);
  if (!editingRequest) return;

  document.getElementById('manager-request-dialog-title').textContent = `Заявка №${editingRequest.id}`;
  document.getElementById('manager-request-status').value = editingRequest.status;
  document.getElementById('manager-request-priority').value = editingRequest.priority;
  document.getElementById('manager-request-due').value = toLocalDateTime(editingRequest.due_at);
  document.getElementById('manager-request-form-message').classList.add('hidden');
  document.getElementById('manager-request-dialog').showModal();
}

async function saveRequestChanges(event) {
  event.preventDefault();
  if (!editingRequest) return;

  const saveButton = document.getElementById('manager-request-save');
  const message = document.getElementById('manager-request-form-message');
  saveButton.disabled = true;
  const status = document.getElementById('manager-request-status').value;
  const priority = document.getElementById('manager-request-priority').value;
  const dueValue = document.getElementById('manager-request-due').value;
  const dueAt = dueValue ? new Date(dueValue).toISOString() : null;
  try {
    const { error } = await supabase
      .from('repair_requests')
      .update({ status, priority, due_at: dueAt })
      .eq('id', editingRequest.id);
    if (error) throw error;
  } catch (error) {
    message.textContent = `Не вдалося оновити заявку: ${error.message}`;
    message.classList.remove('hidden');
  } finally {
    saveButton.disabled = false;
  }

  if (message.classList.contains('hidden')) {
    document.getElementById('manager-request-dialog').close();
    showMessage(document.getElementById('manager-message'), 'Зміни заявки збережено.');
  } else {
    return;
  }
  await loadManagerData();
}

initManager().catch((error) => {
  showMessage(document.getElementById('manager-message'), `Помилка панелі: ${error.message}`, true);
});
