import { ref, onMounted } from "vue";
import { DB } from "@motors/storage.js";

export function useDraws() {
  const draws   = ref([]);
  const loading = ref(false);
  const error   = ref(null);

  async function load() {
    loading.value = true;
    error.value   = null;
    try {
      draws.value = await DB.listDraws({ excludeTest: true });
    } catch (e) {
      error.value = e?.message ?? String(e);
    } finally {
      loading.value = false;
    }
  }

  onMounted(load);

  return { draws, loading, error, reload: load };
}
