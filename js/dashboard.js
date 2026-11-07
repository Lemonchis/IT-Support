import { supabase } from './supabase.js';
import { clearSessionStart, escapeHtml, formatDate, showMessage } from './utils.js';

let requests = [];

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
    tbody.innerHTML = '<tr><td class="table-empty" colspan="5">Заявок поки немає.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map((request) => `
    <tr>
      <td>${escapeHtml(request.id)}</td>
      <td>${formatDate(request.created_at)}</td>
      <td><strong>${escapeHtml(request.title)}</strong><br><small>${escapeHtml(request.description)}</small></td>
      <td><span class="status-badge status-${escapeHtml(request.status)}">${escapeHtml(request.status)}</span></td>
      <td>${escapeHtml(request.admin_comment || '—')}</td>
    </tr>
  `).join('');
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
