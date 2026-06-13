import { ref, onMounted } from "vue";
import { computeHitTrackerStats } from "@motors/hit-tracker.js";
import { betaCredibleInterval } from "@motors/stats-utils.js";

export function useHitTracker(recentWindow = 30) {
  const stats   = ref(null);
  const ci      = ref(null);   // IC95% del hit-rate acumulado
  const loading = ref(false);
  const error   = ref(null);

  async function load() {
    loading.value = true;
    error.value   = null;
    try {
      const s = await computeHitTrackerStats({ recent: recentWindow });
      stats.value = s;
      if (s.resolved > 0) {
        ci.value = betaCredibleInterval(s.hits, s.resolved);
      }
    } catch (e) {
      error.value = e?.message ?? String(e);
    } finally {
      loading.value = false;
    }
  }

  onMounted(load);

  return { stats, ci, loading, error, reload: load };
}
