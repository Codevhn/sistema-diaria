import { describe, expect, it } from 'vitest';
import { renderRelativosAlertaHTML } from '../src/relativos-engine.js';

const alert = (overrides = {}) => ({ padA: '98', padB: '79', diasDesde: 1, fechaA: '2026-10-11', horarioA: '11:00', ...overrides });

describe('presentación de relativos', () => {
  it('agrupa orígenes y candidatos conservando apariciones con fechas y horarios distintos', () => {
    const alerts = [alert(), alert(), alert({ padB: '32' }), alert({ diasDesde: 2, fechaA: '2026-10-10' }), alert({ horarioA: '15:00' })];
    const html = renderRelativosAlertaHTML(alerts, null, { '98': { simbolo: 'Bailes' } });
    expect(html.match(/<article /g)).toHaveLength(1);
    expect(html.match(/class="rel-alerta__candidate"/g)).toHaveLength(2);
    expect(html).toContain('3 apariciones recientes');
    expect(html).toContain('2026-10-10');
    expect(html).toContain('15:00');
    expect(html).toContain('Ayer');
    expect(html).toContain('2 relativos · 1 origen');
    expect(alerts).toHaveLength(5);
  });
  it('escapa símbolos y horarios que se insertan en HTML', () => {
    const html = renderRelativosAlertaHTML([alert({ horarioA: '<img onerror=alert(1)>' })], null, { '98': { simbolo: '<script>bad</script>' } });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });
  it('muestra un estado vacío y distingue las ventanas acumuladas del azar', () => {
    const window = { rate: .058, baseline: .059, lift: .99, pctVsAzar: -1 };
    const html = renderRelativosAlertaHTML([], { windows: { 1: window, 2: window, 3: window }, totalTriggers: 13075 });
    expect(html).toContain('No hay disparadores activos');
    expect(html).toContain('Esperado por azar: 5.9%');
    expect(html).toContain('son acumuladas');
    expect(html).not.toContain('patrón real');
  });
});

import { renderRelativosHTML } from '../src/relativos-engine.js';

describe('tarjetas de relativos vencidos', () => {
  const overdue = { a: 17, b: 42, padA: '17', padB: '42', diasDesde: 45, mean: 20.5, sigma: 12.1, hitRate: .66, hits: 75, urgencia: 2, fechaA: '2026-08-28', horarioA: '11AM', fuente: 'diaria' };
  it('conserva los pares y sus estadísticas y permite consultar los que exceden el límite', () => {
    const html = renderRelativosHTML([overdue, { ...overdue, a: 5, padA: '05' }], { '17': { simbolo: 'Joven' }, '42': { simbolo: 'Madre' } }, 1);
    expect(html.match(/<article /g)).toHaveLength(2);
    expect(html).toContain('Ver 1 relaciones más');
    for (const value of ['Joven', 'Madre', '20.5', '66', '75 coincidencias', '2026-08-28', '>05</strong>']) expect(html).toContain(value);
    expect(html).not.toContain('deben venir');
  });
  it('escapa los datos y admite estados vacíos o inválidos', () => {
    expect(renderRelativosHTML([{ ...overdue, horarioA: '<img>' }])).toContain('&lt;img&gt;');
    expect(renderRelativosHTML([])).toContain('No hay relativos');
    expect(renderRelativosHTML(null)).toContain('Error al calcular');
  });
});
