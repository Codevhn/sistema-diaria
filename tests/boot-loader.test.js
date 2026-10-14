import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showBootLoader, hideBootLoader, revealBootWhenReady } from '../src/boot-loader.js';

function element(classes = []) {
  const names = new Set(classes);
  const attributes = new Map();
  return {
    inert: false,
    dataset: {},
    classList: {
      add: name => names.add(name),
      remove: name => names.delete(name),
      contains: name => names.has(name),
    },
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: name => attributes.delete(name),
    getAttribute: name => attributes.get(name),
  };
}

describe('entrada al sistema después del login', () => {
  let root, loader, shell;
  beforeEach(() => {
    root = element(['auth-locked']);
    loader = element(['hidden']);
    shell = [element(), element(), element()];
    vi.stubGlobal('document', {
      documentElement: root,
      getElementById: id => id === 'boot-loader' ? loader : null,
      querySelectorAll: () => shell,
    });
    showBootLoader();
  });
  afterEach(() => vi.unstubAllGlobals());

  function expectCovered() {
    expect(loader.classList.contains('hidden')).toBe(false);
    expect(root.classList.contains('app-booting')).toBe(true);
    expect(shell.every(el => el.inert && el.getAttribute('aria-hidden') === 'true')).toBe(true);
  }
  function expectReady() {
    expect(loader.classList.contains('hidden')).toBe(true);
    expect(root.classList.contains('app-booting')).toBe(false);
    expect(shell.every(el => !el.inert && el.getAttribute('aria-hidden') === undefined)).toBe(true);
  }

  it('mantiene la carga visible si la sesión termina antes que los datos', () => {
    root.classList.remove('auth-locked');
    expect(revealBootWhenReady()).toBe(false);
    expectCovered();
    expect(hideBootLoader()).toBe(true);
    expectReady();
  });

  it('mantiene la carga visible si los datos terminan antes que la sesión', () => {
    expect(hideBootLoader()).toBe(false);
    expectCovered();
    root.classList.remove('auth-locked');
    expect(revealBootWhenReady()).toBe(true);
    expectReady();
  });

  it('vuelve a bloquear la interfaz durante una nueva preparación', () => {
    root.classList.remove('auth-locked');
    hideBootLoader();
    showBootLoader();
    expectCovered();
    expect(revealBootWhenReady()).toBe(false);
    hideBootLoader();
    expectReady();
  });
});
