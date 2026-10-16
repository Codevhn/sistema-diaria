import { requireAuthOrRedirect } from './auth.js';
import { applyRoleToDOM, checkBanOrRedirect } from './roles.js';
import { revealBootWhenReady, setBootStatus } from './boot-loader.js';

let startupSession;

// The document guard and app share one validation, without bypassing permissions.
export function prepareStartupSession() {
  if (!startupSession) startupSession = (async () => {
    setBootStatus('Validando tu sesión…');
    const user = await requireAuthOrRedirect('./login.html');
    if (!user) throw new Error('Redirigiendo a login por sesión inválida.');
    setBootStatus('Comprobando tus permisos…');
    if (await checkBanOrRedirect('./login.html')) throw new Error('Usuario baneado.');
    await applyRoleToDOM();
    document.documentElement.classList.remove('auth-locked');
    window.__LD_AUTH_UNLOCKED__ = true;
    revealBootWhenReady();
    return user;
  })();
  return startupSession;
}
