import { supabase } from './supabase.js';
import { showMessage } from './utils.js';

const form = document.getElementById('create-request-form');

form?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const message = document.getElementById('create-message');
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  showMessage(message, 'Створюємо заявку...');

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!user) {
      window.location.href = 'index.html';
      return;
    }

    const request = {
      user_id: user.id,
      title: document.getElementById('req-title').value.trim(),
      equipment_type: document.getElementById('req-equipment').value,
      inventory_number: document.getElementById('req-inventory').value.trim() || null,
      location: document.getElementById('req-location').value.trim(),
      description: document.getElementById('req-description').value.trim(),
      status: 'new',
      priority: 'medium'
    };

    const { error } = await supabase.from('repair_requests').insert(request);
    if (error) throw error;

    showMessage(message, 'Заявку успішно створено!');
    window.setTimeout(() => { window.location.href = 'dashboard.html'; }, 1000);
  } catch (error) {
    showMessage(message, `Помилка: ${error.message || 'Не вдалося створити заявку.'}`, true);
    submitButton.disabled = false;
  }
});
