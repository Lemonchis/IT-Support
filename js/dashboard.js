import { supabase } from './supabase.js';
import { clearSessionStart, escapeHtml, formatDate, showMessage } from './utils.js';
import { initNotifications, showRequestHistory } from './notifications.js';

let requests = [];
const statusNames = {
  new: 'Нова',
  in_progress: 'У роботі',
  waiting: 'Очікування',
  completed: 'Завершена',
  rejected: 'Відхилена'
};

async function initDashboard() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    window.location.href = 'index.html';
    return;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single();

  document.getElementById('user-name').textContent =
    profileError ? user.email || 'Користувач' : profile.full_name || 'Користувач';

  document.getElementById('logout-btn').addEventListener('click', async () => {
    const { error: logoutError } = await supabase.auth.signOut();
    if (logoutError) {
      showMessage(document.getElementById('dashboard-message'), `Не вдалося вийти: ${logoutError.message}`, true);
      return;
    }

    clearSessionStart(user.id);
    window.location.href = 'index.html';
  });

  document.getElementById('search-requests').addEventListener('input', filterRequests);
  document.getElementById('filter-status').addEventListener('change', filterRequests);
  document.getElementById('user-requests-body').addEventListener('click', openRequestHistory);
  document.getElementById('request-history-close').addEventListener('click', () => {
    document.getElementById('request-history-dialog').close();
  });
  initNotifications(user.id);
  await loadRequests(user.id);
}

async function loadRequests(userId) {
  const loader = document.getElementById('loading-indicator');
  const message = document.getElementById('dashboard-message');
  loader.classList.remove('hidden');
  loader.textContent = 'Завантаження...';

  const { data, error } = await supabase
    .from('repair_requests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  loader.classList.add('hidden');
  if (error) {
    showMessage(message, `Не вдалося завантажити заявки: ${error.message}`, true);
    return;
  }

  requests = data || [];
  renderRequests(requests);
}

function renderRequests(list) {
  const tbody = document.getElementById('user-requests-body');
  if (!list.length) {
    tbody.innerHTML = '<tr><td class="table-empty" colspan="6">Заявок поки немає.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map((request) => `
    <tr data-request-row="${escapeHtml(request.id)}">
      <td>${escapeHtml(request.id)}</td>
      <td>${formatDate(request.created_at)}</td>
      <td><strong>${escapeHtml(request.title)}</strong><br><small>${escapeHtml(request.description)}</small></td>
      <td><span class="status-badge status-${escapeHtml(request.status)}">${escapeHtml(statusNames[request.status] || request.status)}</span></td>
      <td>${escapeHtml([request.admin_comment, request.resolution].filter(Boolean).join(' · ') || '—')}</td>
      <td><button class="button-secondary button-small" type="button" data-history-id="${escapeHtml(request.id)}" data-history-title="${escapeHtml(request.title)}">Історія</button></td>
    </tr>
  `).join('');
}

function openRequestHistory(event) {
  const button = event.target.closest('[data-history-id]');
  if (!button) return;
  showRequestHistory(button.dataset.historyId, button.dataset.historyTitle)
    .catch((error) => {
      showMessage(document.getElementById('dashboard-message'), `Не вдалося завантажити історію: ${error.message}`, true);
    });
}

function filterRequests() {
  const search = document.getElementById('search-requests').value.trim().toLocaleLowerCase('uk');
  const status = document.getElementById('filter-status').value;
  const filtered = requests.filter((request) => {
    const text = `${request.title} ${request.description || ''}`.toLocaleLowerCase('uk');
    return text.includes(search) && (!status || request.status === status);
  });

  renderRequests(filtered);
}

initDashboard().catch((error) => {
  showMessage(document.getElementById('dashboard-message'), `Помилка кабінету: ${error.message}`, true);
});
