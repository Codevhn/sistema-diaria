import { buildConsonantGroups, findConsonants } from '../consonants.js';
import { escapeHtml } from '../ui/format.js';

export function initConsonantsPanel({ obtenerGuia }) {
  const root = document.getElementById('view-consonantes');
  if (!root) return { setActive() {} };
  const input = root.querySelector('#consonants-search');
  const output = root.querySelector('#consonants-result');
  const status = root.querySelector('#consonants-status');
  const directory = root.querySelector('#consonants-groups');
  const explanation = root.querySelector('#consonants-rule');
  let index, selected = null, mode = 'ending', length = 3;

  function identity(entry, seed = false) {
    const article = document.createElement('article');
    article.className = seed ? 'consonant-seed' : 'consonant-number';
    article.dataset.number = entry.pad;
    article.innerHTML = `<div class="consonant-identity"><div><strong>${entry.pad}</strong><span>${escapeHtml(entry.symbol)}</span></div><img src="data/img/${entry.pad}.png" alt="" loading="lazy" decoding="async"></div>`;
    const img = article.querySelector('img');
    img.addEventListener('error', () => { if (img.src.endsWith('.png')) img.src = `data/img/${entry.pad}.jpg`; else img.hidden = true; });
    return article;
  }
  function showResult(query) {
    const result = findConsonants(query, index);
    output.replaceChildren();
    if (!result) {
      selected = null;
      status.textContent = 'Ingresa un número del 00 al 99 o el nombre completo de un símbolo de la guía.';
      input.setAttribute('aria-invalid', 'true');
      return;
    }
    input.removeAttribute('aria-invalid');
    selected = result.entry.pad;
    const seed = identity(result.entry, true);
    const detail = document.createElement('div'); detail.className = 'consonant-seed__detail';
    const title = document.createElement('span'); title.textContent = mode === 'ending' ? 'Terminación compartida' : 'Rima consonante';
    const ending = document.createElement('b'); ending.textContent = result.entry.ending ? `-${result.entry.ending}` : 'Sin clasificación';
    const count = document.createElement('span'); count.textContent = `${result.matches.length} ${result.matches.length === 1 ? 'número relacionado' : 'números relacionados'}`;
    detail.append(title, ending, count); seed.append(detail); output.append(seed);
    status.textContent = `${result.entry.pad} ${result.entry.symbol}: ${result.matches.length} coincidencias${result.entry.ending ? ` con -${result.entry.ending}` : ''}.`;
    if (!result.entry.ending || !result.matches.length) {
      const empty = document.createElement('p'); empty.className = 'consonants-empty';
      empty.textContent = !result.entry.ending ? (mode === 'rhyme' ? 'Este nombre no tiene una rima revisada. Puedes buscar por terminación escrita.' : `El nombre es más corto que ${length} letras. Prueba con una terminación más corta.`) : 'No hay otros símbolos con esta terminación en la guía actual. Prueba otra longitud o el otro modo.';
      output.append(empty); return;
    }
    const heading = document.createElement('h3'); heading.textContent = 'Números del mismo grupo';
    const grid = document.createElement('div'); grid.className = 'consonants-grid';
    result.matches.forEach(entry => grid.append(identity(entry)));
    output.append(heading, grid);
  }
  function rebuild() {
    index = buildConsonantGroups(obtenerGuia(), { mode, length });
    root.querySelector('#consonants-length').hidden = mode !== 'ending';
    explanation.textContent = mode === 'ending' ? `Se comparan las últimas ${length} letras de la última palabra, sin distinguir tildes. El grupo puede incluir rimas diferentes.` : 'Se compara la terminación desde la última vocal acentuada. Se mantienen los plurales y se usa la última palabra de cada símbolo.';
    directory.replaceChildren();
    const groups = index.groups.filter(group => group.members.length > 1);
    root.querySelector('#consonants-group-count').textContent = String(groups.length);
    groups.forEach(group => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn-ghost consonants-group';
      button.innerHTML = `<b>-${escapeHtml(group.ending)}</b><span>${group.members.length} números</span><small>${group.members.map(n=>n.pad).join(' · ')}</small>`;
      button.addEventListener('click', () => { input.value = group.members[0].pad; showResult(input.value); output.scrollIntoView({ block: 'start', behavior: 'instant' }); });
      directory.append(button);
    });
    if (!groups.length) directory.textContent = 'No hay grupos compartidos con esta selección.';
    if (selected !== null) showResult(selected);
    else status.textContent = index.entries.length ? 'Busca un número o explora los grupos de la guía.' : 'No se pudo cargar la guía de símbolos. Actualiza la página para reintentar.';
  }
  root.querySelector('#consonants-form').addEventListener('submit', event => {
    event.preventDefault(); showResult(input.value.trim());
  });
  root.querySelectorAll('[data-consonant-mode]').forEach(button => button.addEventListener('click', () => {
    mode = button.dataset.consonantMode;
    root.querySelectorAll('[data-consonant-mode]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    rebuild();
  }));
  root.querySelectorAll('[data-consonant-length]').forEach(button => button.addEventListener('click', () => {
    length = Number(button.dataset.consonantLength);
    root.querySelectorAll('[data-consonant-length]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    rebuild();
  }));
  return { setActive(active) { if (active) rebuild(); } };
}
