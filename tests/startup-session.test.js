import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const deps = vi.hoisted(() => ({ auth: vi.fn(), ban: vi.fn(), role: vi.fn(), reveal: vi.fn(), status: vi.fn() }));
vi.mock('../src/auth.js', () => ({ requireAuthOrRedirect: deps.auth }));
vi.mock('../src/roles.js', () => ({ checkBanOrRedirect: deps.ban, applyRoleToDOM: deps.role }));
vi.mock('../src/boot-loader.js', () => ({ revealBootWhenReady: deps.reveal, setBootStatus: deps.status }));

describe('sesión compartida durante el arranque', () => {
  let remove;
  beforeEach(() => {
    vi.resetModules(); vi.resetAllMocks();
    remove = vi.fn();
    vi.stubGlobal('document', { documentElement: { classList: { remove } } });
    vi.stubGlobal('window', {});
    deps.auth.mockResolvedValue({ id: 'user' });
    deps.ban.mockResolvedValue(false);
    deps.role.mockResolvedValue('lector');
  });
  afterEach(() => vi.unstubAllGlobals());
  it('comparte la validación entre el documento y la aplicación', async () => {
    const { prepareStartupSession } = await import('../src/startup-session.js');
    const first = prepareStartupSession(), second = prepareStartupSession();
    expect(first).toBe(second);
    expect(await first).toEqual({ id: 'user' });
    expect(deps.auth).toHaveBeenCalledTimes(1);
    expect(deps.ban).toHaveBeenCalledTimes(1);
    expect(deps.role).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('auth-locked');
    expect(deps.reveal).toHaveBeenCalledTimes(1);
  });
  it('no desbloquea mientras los permisos sigan pendientes', async () => {
    let resolveRole;
    deps.role.mockImplementation(() => new Promise(resolve => { resolveRole = resolve; }));
    const { prepareStartupSession } = await import('../src/startup-session.js');
    const ready = prepareStartupSession();
    await vi.waitFor(() => expect(deps.role).toHaveBeenCalled());
    expect(remove).not.toHaveBeenCalled();
    expect(deps.reveal).not.toHaveBeenCalled();
    resolveRole('lector'); await ready;
    expect(remove).toHaveBeenCalledTimes(1);
  });
  it('mantiene bloqueado al usuario sin sesión', async () => {
    deps.auth.mockResolvedValue(null);
    const { prepareStartupSession } = await import('../src/startup-session.js');
    await expect(prepareStartupSession()).rejects.toThrow('sesión inválida');
    expect(deps.ban).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(deps.reveal).not.toHaveBeenCalled();
  });
  it('mantiene bloqueado al usuario baneado', async () => {
    deps.ban.mockResolvedValue(true);
    const { prepareStartupSession } = await import('../src/startup-session.js');
    await expect(prepareStartupSession()).rejects.toThrow('baneado');
    expect(deps.role).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(deps.reveal).not.toHaveBeenCalled();
  });
});
