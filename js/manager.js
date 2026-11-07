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
let requests = [];

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
  const { data, error } = await supabase
    .from('repair_requests')
    .select('*, profiles(full_name)')
    .order('created_at', { ascending: false });

  if (error) {
    showMessage(document.getElementById('manager-message'), `Не вдалося завантажити заявки: ${error.message}`, true);
    return;
  }

  requests = data || [];
  renderRequests();
}

function renderRequests() {
  const tbody = document.getElementById('manager-requests-body');
  const search = document.getElementById('manager-search').value.trim().toLocaleLowerCase('uk');
  const priority = document.getElementById('manager-filter-priority').value;
  const status = document.getElementById('manager-filter-status').value;
  const filtered = requests.filter((request) => {
    const text = `${request.id} ${request.profiles?.full_name || ''} ${request.title || ''}`
      .toLocaleLowerCase('uk');
    return text.includes(search)
      && (!priority || request.priority === priority)
      && (!status || request.status === status);
  });
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td class="table-empty" colspan="7">Заявок поки немає.</td></tr>';
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
      <td>${formatDate(request.created_at)}</td>
    </tr>
  `).join('');
}

async function updateRequest(event) {
  const select = event.target.closest('[data-priority-id], [data-status-id]');
  if (!select) return;

  const isStatus = select.hasAttribute('data-status-id');
  const request = requests.find((item) => item.id === (isStatus ? select.dataset.statusId : select.dataset.priorityId));
  const field = isStatus ? 'status' : 'priority';
  const oldValue = request?.[field];
  select.disabled = true;
  try {
    const result = isStatus
      ? await supabase.rpc('update_request_status', {
        p_request_id: select.dataset.statusId,
        p_status: select.value
      })
      : await supabase
        .from('repair_requests')
        .update({ priority: select.value })
        .eq('id', select.dataset.priorityId);
    const { error } = result;
    if (error) throw error;
  } catch (error) {
    select.disabled = false;
    select.value = oldValue;
    showMessage(document.getElementById('manager-message'), `Не вдалося змінити ${isStatus ? 'статус' : 'пріоритет'}: ${error.message}`, true);
    return;
  }

  showMessage(document.getElementById('manager-message'), `${isStatus ? 'Статус' : 'Пріоритет'} заявки оновлено.`);
  await loadManagerData();
}

initManager().catch((error) => {
  showMessage(document.getElementById('manager-message'), `Помилка панелі: ${error.message}`, true);
});
