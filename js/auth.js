import { supabase } from './supabase.js';
import { saveSessionStart, showMessage } from './utils.js';

async function ensureProfile(user) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw new Error(`Помилка профілю: ${error.message}`);
  if (profile) return profile;

  const { error: insertError } = await supabase.from('profiles').insert({
    id: user.id,
    full_name: user.user_metadata?.full_name || '',
    email: user.email,
    role: 'user'
  });

  if (insertError) throw new Error(`Помилка профілю: ${insertError.message}`);
  return { role: 'user' };
}

function setBusy(form, busy) {
  form.querySelector('button[type="submit"]').disabled = busy;
}

const registerForm = document.getElementById('register-form');
registerForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const fullName = document.getElementById('reg-fullname').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const confirmPassword = document.getElementById('reg-confirm-password').value;
  const message = document.getElementById('reg-message');

  if (password !== confirmPassword) {
    showMessage(message, 'Паролі не збігаються!', true);
    return;
  }

  showMessage(message, 'Реєстрація...');
  setBusy(registerForm, true);

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    });

    if (error) throw error;
    if (!data.user) throw new Error('Supabase не повернув створеного користувача.');

    if (data.session) {
      await ensureProfile(data.user);
      saveSessionStart(data.user.id);
      showMessage(message, 'Реєстрацію завершено. Перехід до входу...');
    } else {
      showMessage(message, 'Акаунт створено. Підтвердіть електронну пошту, щоб увійти.');
    }

    window.setTimeout(() => { window.location.href = 'index.html'; }, 1800);
  } catch (error) {
    showMessage(message, `Помилка: ${error.message || 'Не вдалося завершити реєстрацію.'}`, true);
    setBusy(registerForm, false);
  }
});

const loginForm = document.getElementById('login-form');
loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const message = document.getElementById('login-message');

  showMessage(message, 'Вхід...');
  setBusy(loginForm, true);

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const profile = await ensureProfile(data.user);
    saveSessionStart(data.user.id);

    const destinations = {
      admin: 'admin.html',
      manager: 'manager.html',
      user: 'dashboard.html'
    };
    window.location.href = destinations[profile.role] || destinations.user;
  } catch (error) {
    showMessage(message, `Помилка: ${error.message || 'Не вдалося увійти.'}`, true);
    setBusy(loginForm, false);
  }
});
