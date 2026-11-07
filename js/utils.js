export function escapeHtml(value) {
  const characters = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return String(value ?? '').replace(/[&<>"']/g, (character) => characters[character]);
}

export function formatDate(value, withTime = false) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  const options = withTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'short' };
  return new Intl.DateTimeFormat('uk-UA', options).format(date);
}

export function showMessage(element, message, isError = false) {
  if (!element) return;
  element.textContent = message;
  element.style.color = isError ? 'red' : 'green';
  element.classList.toggle('message-error', isError);
  element.classList.toggle('message-success', !isError);
  element.classList.remove('hidden');
}

export function sessionKey(userId) {
  return `it-support-session-start:${userId}`;
}

export function saveSessionStart(userId, time = Date.now()) {
  localStorage.setItem(sessionKey(userId), String(time));
}

export function clearSessionStart(userId) {
  localStorage.removeItem(sessionKey(userId));
}

export function getSessionStart(user) {
  const savedTime = Number(localStorage.getItem(sessionKey(user.id)));
  if (Number.isFinite(savedTime) && savedTime > 0) return savedTime;

  const lastLogin = Date.parse(user.last_sign_in_at || '');
  const startTime = Number.isFinite(lastLogin) && lastLogin > 0 ? lastLogin : Date.now();
  saveSessionStart(user.id, startTime);
  return startTime;
}
