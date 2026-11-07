import { supabase } from './supabase.js';
import { formatDate } from './utils.js';

const statusNames = {
  new: 'Нова',
  in_progress: 'У роботі',
  waiting: 'Очікування',
  completed: 'Завершена',
  rejected: 'Відхилена'
};

export function initNotifications(userId) {
  const button = document.getElementById('notifications-button');
  const panel = document.getElementById('notifications-panel');
  const list = document.getElementById('notifications-list');
  const count = document.getElementById('notifications-count');
  const message = document.getElementById('notifications-message');
  const markAllButton = document.getElementById('notifications-mark-all');
  let refreshTimer;

  const showError = (text) => {
    message.textContent = text;
    message.classList.remove('hidden');
  };

  const refresh = async () => {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, request_id, title, body, created_at, read_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      showError(`Не вдалося завантажити сповіщення: ${error.message}`);
      return;
    }

    message.classList.add('hidden');
    const notifications = data || [];
    const unreadCount = notifications.filter((notification) => !notification.read_at).length;
    count.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
    count.classList.toggle('hidden', unreadCount === 0);
    list.replaceChildren();

    if (!notifications.length) {
      const empty = document.createElement('p');
      empty.className = 'notification-empty';
      empty.textContent = 'Поки що сповіщень немає.';
      list.append(empty);
      return;
    }

    notifications.forEach((notification) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `notification-item${notification.read_at ? '' : ' notification-unread'}`;
      item.dataset.notificationId = notification.id;
      item.dataset.requestId = notification.request_id;

      const title = document.createElement('strong');
      title.textContent = notification.title;
      const body = document.createElement('span');
      body.textContent = notification.body;
      const date = document.createElement('time');
      date.dateTime = notification.created_at;
      date.textContent = formatDate(notification.created_at, true);

      item.append(title, body, date);
      list.append(item);
    });
  };

  button.addEventListener('click', async () => {
    const isOpen = panel.classList.toggle('hidden');
    button.setAttribute('aria-expanded', String(!isOpen));
    if (!isOpen) await refresh();
  });

  markAllButton.addEventListener('click', async () => {
    markAllButton.disabled = true;
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('read_at', null);
      if (error) throw error;
      await refresh();
    } catch (error) {
      showError(`Не вдалося оновити сповіщення: ${error.message}`);
    } finally {
      markAllButton.disabled = false;
    }
  });

  list.addEventListener('click', async (event) => {
    const item = event.target.closest('[data-notification-id]');
    if (!item) return;

    item.disabled = true;
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', item.dataset.notificationId)
        .eq('user_id', userId);
      if (error) throw error;
      await refresh();
      panel.classList.add('hidden');
      button.setAttribute('aria-expanded', 'false');

      const requestRow = [...document.querySelectorAll('[data-request-row]')]
        .find((row) => row.dataset.requestRow === item.dataset.requestId);
      requestRow?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      requestRow?.classList.add('request-highlight');
      if (requestRow) {
        window.setTimeout(() => requestRow.classList.remove('request-highlight'), 1800);
      }
    } catch (error) {
      item.disabled = false;
      showError(`Не вдалося позначити сповіщення прочитаним: ${error.message}`);
    }
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.notification-widget') && !panel.classList.contains('hidden')) {
      panel.classList.add('hidden');
      button.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      panel.classList.add('hidden');
      button.setAttribute('aria-expanded', 'false');
    }
  });

  refresh();
  refreshTimer = window.setInterval(refresh, 30000);
  window.addEventListener('pagehide', () => window.clearInterval(refreshTimer), { once: true });
}

export async function showRequestHistory(requestId, requestTitle) {
  const dialog = document.getElementById('request-history-dialog');
  const title = document.getElementById('request-history-title');
  const list = document.getElementById('request-history-list');
  const message = document.getElementById('request-history-message');
  title.textContent = requestTitle;
  list.replaceChildren();
  message.classList.add('hidden');
  dialog.showModal();

  const { data, error } = await supabase
    .from('request_status_history')
    .select('old_status, new_status, created_at')
    .eq('request_id', String(requestId))
    .order('created_at', { ascending: false });

  if (error) {
    message.textContent = `Не вдалося завантажити історію: ${error.message}`;
    message.classList.remove('hidden');
    return;
  }

  if (!data.length) {
    message.textContent = 'Історія ще порожня.';
    message.classList.remove('hidden');
    return;
  }

  data.forEach((change) => {
    const item = document.createElement('li');
    const changeText = document.createElement('strong');
    changeText.textContent = change.old_status
      ? `${statusNames[change.old_status] || change.old_status} → ${statusNames[change.new_status] || change.new_status}`
      : `Заявку створено зі статусом «${statusNames[change.new_status] || change.new_status}»`;
    const date = document.createElement('time');
    date.dateTime = change.created_at;
    date.textContent = formatDate(change.created_at, true);
    item.append(changeText, date);
    list.append(item);
  });
}
