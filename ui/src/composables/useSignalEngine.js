import { ref } from "vue";
import { ejecutarMotorSeñales } from "@motors/signal-engine.js";

export function useSignalEngine() {
  const result  = ref(null);   // { candidatos, eliminados, contexto, universo, ... }
  const loading = ref(false);
  const error   = ref(null);

  async function run({ pais = "HN", turno = null, fecha = null } = {}) {
    loading.value = true;
    error.value   = null;
    result.value  = null;
    try {
      result.value = await ejecutarMotorSeñales({ pais, turno, fecha });
    } catch (e) {
      error.value = e?.message ?? String(e);
    } finally {
      loading.value = false;
    }
  }

  return { result, loading, error, run };
}
