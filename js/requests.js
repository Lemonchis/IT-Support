import { supabase } from './supabase.js';
import { showMessage } from './utils.js';

const form = document.getElementById('create-request-form');

form?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const message = document.getElementById('create-message');
  const submitButton = form.querySelector('button[type="submit"]');
  const title = document.getElementById('req-title').value.trim();
  const location = document.getElementById('req-location').value.trim();
  const description = document.getElementById('req-description').value.trim();
  const phone = document.getElementById('req-phone').value.trim();
  if (!title || !location || !description || !phone) {
    showMessage(message, 'Заповніть назву, місце, опис проблеми та контактний телефон.', true);
    return;
  }

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
      title,
      equipment_type: document.getElementById('req-equipment').value,
      inventory_number: document.getElementById('req-inventory').value.trim() || null,
      location,
      description,
      contact_phone: phone,
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
