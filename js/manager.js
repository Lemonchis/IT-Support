import { supabase } from './supabase.js';
import { clearSessionStart, escapeHtml, formatDate, showMessage } from './utils.js';

const priorityNames = {
  low: 'Низький',
  medium: 'Середній',
  high: 'Високий',
  critical: 'Критичний'
};

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
  document.getElementById('manager-requests-body').addEventListener('change', updatePriority);
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

  renderRequests(data || []);
}

function renderRequests(requests) {
  const tbody = document.getElementById('manager-requests-body');
  if (!requests.length) {
    tbody.innerHTML = '<tr><td class="table-empty" colspan="7">Заявок поки немає.</td></tr>';
    return;
  }

  tbody.innerHTML = requests.map((request) => `
    <tr>
      <td>${escapeHtml(request.id)}</td>
      <td>${formatDate(request.created_at)}</td>
      <td>${escapeHtml(request.profiles?.full_name || 'Невідомо')}</td>
      <td>${escapeHtml(request.title)}</td>
      <td><span class="status-badge status-${escapeHtml(request.status)}">${escapeHtml(request.status)}</span></td>
      <td>
        <select data-request-id="${escapeHtml(request.id)}" aria-label="Пріоритет заявки ${escapeHtml(request.id)}">
          ${Object.entries(priorityNames).map(([value, name]) =>
            `<option value="${value}" ${request.priority === value ? 'selected' : ''}>${name}</option>`
          ).join('')}
        </select>
      </td>
      <td>${formatDate(request.created_at)}</td>
    </tr>
  `).join('');
}

async function updatePriority(event) {
  const select = event.target.closest('[data-request-id]');
  if (!select) return;

  select.disabled = true;
  try {
    const { error } = await supabase
      .from('repair_requests')
      .update({ priority: select.value })
      .eq('id', select.dataset.requestId);
    if (error) throw error;
  } catch (error) {
    select.disabled = false;
    showMessage(document.getElementById('manager-message'), `Не вдалося змінити пріоритет: ${error.message}`, true);
    return;
  }

  showMessage(document.getElementById('manager-message'), 'Пріоритет заявки оновлено.');
  await loadManagerData();
}

initManager().catch((error) => {
  showMessage(document.getElementById('manager-message'), `Помилка панелі: ${error.message}`, true);
});
