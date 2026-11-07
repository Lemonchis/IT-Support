import { supabase } from './supabase.js';
import { clearSessionStart, formatDate, getSessionStart, showMessage as showStatusMessage } from './utils.js';

let profileUser;
let profile = {};
let sessionStart;
let sessionTimer;

const roleNames = {
  user: 'Користувач',
  manager: 'Менеджер',
  admin: 'Адміністратор'
};

function showMessage(message, isError = false) {
  showStatusMessage(document.getElementById('profile-message'), message, isError);
}

function setFormBusy(form, busy) {
  form.querySelectorAll('button, input').forEach((element) => {
    element.disabled = busy;
  });
}

async function getFunctionErrorMessage(error) {
  const response = error?.context;
  if (response instanceof Response) {
    try {
      const details = await response.clone().json();
      if (details.error) return details.error;
    } catch {
      return error.message || 'Сервер не зміг виконати операцію.';
    }
  }

  return error?.message || 'Сервер не зміг виконати операцію.';
}

function updateSessionDuration() {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - sessionStart) / 1000));
  const days = Math.floor(elapsedSeconds / 86400);
  const hours = Math.floor((elapsedSeconds % 86400) / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  const duration = days
    ? `${days} дн. ${hours} год. ${minutes} хв.`
    : hours
      ? `${hours} год. ${minutes} хв.`
      : `${minutes} хв. ${seconds} с.`;
  document.getElementById('profile-session-duration').textContent = duration;
}

async function loadProfile() {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Не вдалося перевірити вхід: ${authError.message}`);
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  profileUser = user;

  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, email, phone, role, created_at')
    .eq('id', user.id)
    .single();
  if (error) throw new Error(`Не вдалося завантажити профіль: ${error.message}`);
  profile = data;

  const displayName = profile.full_name || 'Користувач';
  const roleName = roleNames[profile.role] || 'Користувач';
  document.getElementById('profile-header-name').textContent = displayName;
  document.getElementById('profile-heading').textContent = displayName;
  document.getElementById('profile-avatar').textContent = displayName.trim().slice(0, 1).toLocaleUpperCase('uk');
  document.getElementById('profile-role').textContent = roleName;
  document.getElementById('profile-role-detail').textContent = roleName;
  document.getElementById('profile-email').textContent = profile.email || user.email || 'Немає даних';
  document.getElementById('profile-created-at').textContent = formatDate(profile.created_at || user.created_at, true);
  document.getElementById('profile-last-login').textContent = formatDate(user.last_sign_in_at, true);
  document.getElementById('profile-full-name').value = profile.full_name || '';
  document.getElementById('profile-phone').value = profile.phone || '';

  const homePage = profile.role === 'admin'
    ? 'admin.html'
    : profile.role === 'manager'
      ? 'manager.html'
      : 'dashboard.html';
  document.getElementById('profile-home-link').href = homePage;
  document.getElementById('profile-back-link').href = homePage;

  sessionStart = getSessionStart(user);
  updateSessionDuration();
  sessionTimer = window.setInterval(updateSessionDuration, 1000);
}

document.getElementById('profile-logout').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    clearSessionStart(profileUser.id);
    window.location.href = 'index.html';
  } catch (error) {
    button.disabled = false;
    showMessage(`Не вдалося вийти: ${error.message}`, true);
  }
});

document.getElementById('profile-name-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const fullName = document.getElementById('profile-full-name').value.trim();
  const phone = document.getElementById('profile-phone').value.trim();
  if (!fullName) {
    showMessage('Вкажіть ім’я та прізвище.', true);
    return;
  }

  setFormBusy(form, true);
  showMessage('Зберігаємо ім’я...');
  try {
    const { error } = await supabase.rpc('update_my_contact', {
      p_full_name: fullName,
      p_phone: phone || null
    });
    if (error) {
      const missingFunction = error.code === 'PGRST202' || error.code === '42883';
      const hint = missingFunction
        ? ' У Supabase SQL Editor виконайте supabase/sql/supabase-work-order-fields.sql, щоб створити функцію оновлення контактних даних.'
        : '';
      throw new Error(`Не вдалося зберегти дані: ${error.message}.${hint}`);
    }

    profile.full_name = fullName;
    profile.phone = phone || null;
    document.getElementById('profile-header-name').textContent = fullName;
    document.getElementById('profile-heading').textContent = fullName;
    document.getElementById('profile-avatar').textContent = fullName.slice(0, 1).toLocaleUpperCase('uk');
    showMessage('Контактні дані успішно оновлено.');
  } catch (error) {
    showMessage(`Не вдалося зберегти дані: ${error.message}`, true);
  } finally {
    setFormBusy(form, false);
  }
});

document.getElementById('profile-password-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const currentPassword = document.getElementById('profile-current-password').value;
  const newPassword = document.getElementById('profile-new-password').value;
  const confirmPassword = document.getElementById('profile-confirm-password').value;

  if (newPassword.length < 8) {
    showMessage('Новий пароль має містити щонайменше 8 символів.', true);
    return;
  }
  if (newPassword !== confirmPassword) {
    showMessage('Новий пароль і підтвердження не збігаються.', true);
    return;
  }
  if (newPassword === currentPassword) {
    showMessage('Новий пароль має відрізнятися від поточного.', true);
    return;
  }

  setFormBusy(form, true);
  showMessage('Перевіряємо поточний пароль...');
  try {
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: profileUser.email || profile.email,
      password: currentPassword
    });
    if (verifyError) {
      throw new Error('Поточний пароль неправильний.');
    }

    showMessage('Зберігаємо новий пароль...');
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);

    form.reset();
    showMessage('Пароль успішно змінено.');
  } catch (error) {
    showMessage(`Не вдалося змінити пароль: ${error.message}`, true);
  } finally {
    setFormBusy(form, false);
  }
});

document.getElementById('profile-delete-account').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const confirmation = window.confirm(
    'УВАГА: акаунт буде видалено назавжди, а всі ваші заявки на підтримку також буде безповоротно видалено. Продовжити?'
  );
  if (!confirmation) return;

  button.disabled = true;
  showMessage('Видаляємо акаунт і всі пов’язані заявки...');
  try {
    const { error } = await supabase.functions.invoke('admin-delete-user', {
      body: { userId: profileUser.id }
    });
    if (error) {
      const details = await getFunctionErrorMessage(error);
      throw new Error(details);
    }
  } catch (error) {
    button.disabled = false;
    const deploymentHint = /failed to send a request|function not found|404|fetch/i.test(error.message)
      ? ' Перевірте, чи розгорнуто Supabase Function admin-delete-user у вашому проєкті.'
      : '';
    showMessage(`Не вдалося видалити акаунт: ${error.message}${deploymentHint}`, true);
    return;
  }

  clearSessionStart(profileUser.id);
  await supabase.auth.signOut({ scope: 'local' });
  showMessage('Акаунт і всі пов’язані заявки успішно видалено.');
  window.setTimeout(() => { window.location.href = 'index.html'; }, 2000);
});

loadProfile().catch((error) => showMessage(error.message || 'Не вдалося завантажити профіль.', true));

window.addEventListener('pagehide', () => {
  if (sessionTimer) window.clearInterval(sessionTimer);
});
