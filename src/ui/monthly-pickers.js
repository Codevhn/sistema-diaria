// Controles de mes que heredan los tokens del tema, sin ventanas nativas del navegador.
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const title = value => {
  const [year, month] = value.split('-');
  return MONTHS[Number(month) - 1] ? `${MONTHS[Number(month) - 1]} de ${year}` : 'Seleccionar mes';
};

export function initMonthlyPickers(input, select) {
  const calendar = document.getElementById('mr-calendar');
  const recorded = document.getElementById('mr-recorded-picker');
  const year = document.getElementById('mr-year');
  const months = document.getElementById('mr-calendar-months');
  if (!calendar || !recorded || !year || !months) return () => {};
  const controls = [calendar, recorded].map(root => ({ root, button: root.querySelector('.mr-picker__trigger'), popup: root.querySelector('.mr-picker__popup') }));
  const close = control => { control.popup.hidden = true; control.button.setAttribute('aria-expanded', 'false'); };
  const validYear = () => /^\d{4}$/.test(year.value) && Number(year.value) >= 1900;
  const markMonths = () => {
    months.querySelectorAll('button').forEach((button, index) => {
      button.setAttribute('aria-pressed', String(input.value === `${year.value}-${String(index + 1).padStart(2, '0')}`));
      button.disabled = !validYear();
    });
  };
  MONTHS.forEach((name, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = name;
    button.addEventListener('click', () => {
      if (!validYear()) return;
      input.value = `${year.value}-${String(index + 1).padStart(2, '0')}`;
      close(controls[0]);
      controls[0].button.focus();
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    months.appendChild(button);
  });
  calendar.querySelectorAll('[data-year-step]').forEach(button => button.addEventListener('click', () => {
    year.value = String(Math.min(9999, Math.max(1900, (Number(year.value) || new Date().getFullYear()) + Number(button.dataset.yearStep))));
    markMonths();
  }));
  year.addEventListener('input', markMonths);
  year.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); months.querySelector('button:not(:disabled)')?.focus(); } });
  for (const control of controls) {
    control.button.addEventListener('click', () => {
      const opening = control.popup.hidden;
      controls.forEach(close);
      if (!opening) return;
      if (control === controls[0]) { year.value = input.value.slice(0, 4) || String(new Date().getFullYear()); markMonths(); }
      control.popup.hidden = false;
      control.button.setAttribute('aria-expanded', 'true');
      control.popup.querySelector('[aria-selected="true"], [aria-pressed="true"], button, input')?.focus();
    });
    control.button.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (control.popup.hidden) control.button.click(); }
    });
    control.root.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !control.popup.hidden) { event.preventDefault(); close(control); control.button.focus(); }
      if (control !== controls[1] || control.popup.hidden) return;
      const options = [...control.popup.querySelectorAll('[role="option"]')];
      const index = options.indexOf(document.activeElement);
      const offsets = { ArrowDown: 1, ArrowUp: -1, Home: -index, End: options.length - 1 - index };
      if (event.key in offsets && options.length) { event.preventDefault(); options[(index + offsets[event.key] + options.length) % options.length].focus(); }
    });
    control.root.addEventListener('focusout', event => { if (!control.root.contains(event.relatedTarget)) close(control); });
  }
  document.addEventListener('pointerdown', event => { controls.forEach(control => { if (!control.root.contains(event.target)) close(control); }); });
  return () => {
    controls[0].button.firstElementChild.textContent = title(input.value);
    controls[1].button.firstElementChild.textContent = select.value ? title(select.value) : 'Meses con registros';
    const popup = controls[1].popup;
    popup.replaceChildren();
    [...select.options].filter(option => option.value).forEach(option => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(option.value === select.value));
      button.textContent = title(option.value);
      button.addEventListener('click', () => {
        select.value = option.value;
        close(controls[1]);
        controls[1].button.focus();
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      popup.appendChild(button);
    });
    if (!popup.children.length) { const empty = document.createElement('p'); empty.textContent = 'No hay meses con registros'; popup.appendChild(empty); }
  };
}
