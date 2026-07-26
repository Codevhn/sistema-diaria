import { ref } from "vue";

const guide = ref(null);
let promise = null;

async function loadGuide() {
  if (guide.value) return guide.value;
  if (!promise) {
    promise = fetch("./data/guia_suenos.json")
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => { guide.value = data; return data; })
      .catch(() => { promise = null; return {}; });
  }
  return promise;
}

loadGuide();

export function useGuide() {
  function sym(numero) {
    if (!guide.value) return "";
    const key2 = String(numero).padStart(2, "0");
    const key1 = String(parseInt(numero, 10));
    return guide.value[key2]?.simbolo ?? guide.value[key1]?.simbolo ?? "";
  }
  return { guide, sym };
}
