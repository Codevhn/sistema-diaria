import { parseDrawDate, formatDateISO, getTodayISODate } from '../date-utils.js';

const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const allowed = date => date && date.getFullYear() >= 1900 && date.getFullYear() <= 9999;
const monthTitle = date => `${monthNames[date.getMonth()]} de ${date.getFullYear()}`;
const fullDate = new Intl.DateTimeFormat('es-HN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export function calendarDays(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

export function shiftCalendarMonth(date, step) {
  const result = new Date(date.getFullYear(), date.getMonth() + step, 1);
  const last = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(date.getDate(), last));
  return result;
}

export function initDayPickers() {
  const input = document.getElementById('day-fecha');
  const select = document.getElementById('day-pais');
  const dateRoot = document.getElementById('day-date-picker');
  const countryRoot = document.getElementById('day-country-picker');
  if (!input || !select || !dateRoot || !countryRoot) return () => {};
  const controls = [dateRoot, countryRoot].map(root => ({ root, trigger: root.querySelector('.day-picker__trigger'), popup: root.querySelector('.day-picker__popup') }));
  const [dateControl, countryControl] = controls;
  const grid = document.getElementById('day-calendar-grid');
  const months = document.getElementById('day-calendar-months');
  const year = document.getElementById('day-calendar-year');
  const title = document.getElementById('day-calendar-title');
  const monthPanel = document.getElementById('day-calendar-month-panel');
  const datePanel = document.getElementById('day-calendar-date-panel');
  let viewDate = parseDrawDate(input.value) || parseDrawDate(getTodayISODate());

  const close = control => {
    control.popup.hidden = true;
    control.trigger.setAttribute('aria-expanded', 'false');
  };
  function setMonthMode(open) {
    monthPanel.hidden = !open;
    datePanel.hidden = open;
    title.setAttribute('aria-expanded', String(open));
    if (open) {
      year.value = String(viewDate.getFullYear());
      renderMonths();
      months.querySelector('[aria-pressed="true"]')?.focus();
    }
  }
  function choose(date) {
    input.value = formatDateISO(date);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    close(dateControl);
    dateControl.trigger.focus();
  }
  function focusDate(date) {
    if (!allowed(date)) return;
    viewDate = date;
    renderCalendar();
    grid.querySelector(`[data-date="${formatDateISO(date)}"]`)?.focus();
  }
  function renderCalendar() {
    title.textContent = `${monthTitle(viewDate)} ▾`;
    title.setAttribute('aria-label', `Cambiar mes y año, ${monthTitle(viewDate)}`);
    grid.setAttribute('aria-label', monthTitle(viewDate));
    grid.replaceChildren();
    const today = getTodayISODate();
    const selected = input.value;
    const focusValue = formatDateISO(viewDate);
    const days = calendarDays(viewDate);
    for (let week = 0; week < 6; week++) {
      const row = document.createElement('div');
      row.setAttribute('role', 'row');
      for (const day of days.slice(week * 7, week * 7 + 7)) {
        const value = formatDateISO(day);
        const cell = document.createElement('div');
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-selected', String(value === selected));
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn-ghost';
        button.dataset.date = value;
        button.textContent = String(day.getDate());
        button.setAttribute('aria-label', fullDate.format(day));
        button.tabIndex = value === focusValue ? 0 : -1;
        button.disabled = !allowed(day);
        button.classList.toggle('is-adjacent', day.getMonth() !== viewDate.getMonth());
        button.classList.toggle('is-selected', value === selected);
        if (value === today) button.setAttribute('aria-current', 'date');
        button.addEventListener('click', () => choose(day));
        button.addEventListener('keydown', event => {
          const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -(day.getDay() + 6) % 7, End: 6 - (day.getDay() + 6) % 7 }[event.key];
          if (offset !== undefined) {
            event.preventDefault();
            const next = new Date(day);
            next.setDate(next.getDate() + offset);
            focusDate(next);
          } else if (event.key === 'PageUp' || event.key === 'PageDown') {
            event.preventDefault();
            focusDate(shiftCalendarMonth(day, (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1)));
          }
        });
        cell.appendChild(button);
        row.appendChild(cell);
      }
      grid.appendChild(row);
    }
  }
  function renderMonths() {
    months.replaceChildren();
    monthNames.forEach((name, index) => {
      const button = document.createElement('button');
      button.type = 'button';
        button.className = 'btn-ghost';
      button.textContent = name;
      button.disabled = !Number.isInteger(year.valueAsNumber) || year.valueAsNumber < 1900 || year.valueAsNumber > 9999;
      button.setAttribute('aria-pressed', String(index === viewDate.getMonth() && Number(year.value) === viewDate.getFullYear()));
      button.addEventListener('click', () => {
        viewDate = new Date(Number(year.value), index, 1);
        setMonthMode(false);
        focusDate(viewDate);
      });
      months.appendChild(button);
    });
  }
  function sync() {
    const date = parseDrawDate(input.value);
    dateControl.trigger.firstElementChild.textContent = date ? new Intl.DateTimeFormat('es-HN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date) : 'Seleccionar fecha';
    const selected = select.selectedOptions[0];
    countryControl.trigger.firstElementChild.textContent = selected?.value || 'País';
    countryControl.popup.replaceChildren();
    [...select.options].forEach(option => {
      const button = document.createElement('button');
      button.type = 'button';
        button.className = 'btn-ghost';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(option.selected));
      button.textContent = option.value === 'HN' ? 'Honduras · HN' : option.textContent;
      button.disabled = option.disabled;
      button.addEventListener('click', () => {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        close(countryControl);
        countryControl.trigger.focus();
      });
      countryControl.popup.appendChild(button);
    });
  }
  for (const control of controls) {
    control.trigger.addEventListener('click', () => {
      const opening = control.popup.hidden;
      controls.forEach(close);
      if (!opening) return;
      sync();
      if (control === dateControl) {
        viewDate = parseDrawDate(input.value) || parseDrawDate(getTodayISODate());
        setMonthMode(false);
        renderCalendar();
      }
      control.popup.hidden = false;
      control.trigger.setAttribute('aria-expanded', 'true');
      control.popup.querySelector('[tabindex="0"], [role="option"][aria-selected="true"]')?.focus();
    });
    control.trigger.addEventListener('keydown', event => {
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        if (control.popup.hidden) control.trigger.click();
      }
    });
    control.root.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !control.popup.hidden) {
        event.preventDefault();
        close(control);
        control.trigger.focus();
      }
      if (control === countryControl && !control.popup.hidden && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        const options = [...control.popup.querySelectorAll('button:not(:disabled)')];
        const current = options.indexOf(document.activeElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        event.preventDefault();
        options[next]?.focus();
      }
    });
    control.root.addEventListener('focusout', event => {
      if (event.relatedTarget && !control.root.contains(event.relatedTarget)) close(control);
    });
  }
  document.addEventListener('pointerdown', event => controls.forEach(control => {
    if (!control.root.contains(event.target)) close(control);
  }));
  dateRoot.querySelectorAll('[data-month-step]').forEach(button => button.addEventListener('click', () => {
    const next = shiftCalendarMonth(viewDate, Number(button.dataset.monthStep));
    if (allowed(next)) { viewDate = next; setMonthMode(false); renderCalendar(); }
  }));
  title.addEventListener('click', () => setMonthMode(monthPanel.hidden));
  year.addEventListener('input', renderMonths);
  year.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); months.querySelector('button:not(:disabled)')?.focus(); }
  });
  document.getElementById('day-calendar-today').addEventListener('click', () => choose(parseDrawDate(getTodayISODate())));
  input.addEventListener('change', sync);
  select.addEventListener('change', sync);
  sync();
  return sync;
}
