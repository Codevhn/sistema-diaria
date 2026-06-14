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

// Load eagerly when the composable module is first imported
loadGuide();

export function useGuide() {
  function sym(numero) {
    if (!guide.value) return "";
    return guide.value[String(numero).padStart(2, "0")]?.simbolo
      ?? guide.value[String(parseInt(numero, 10))]?.simbolo
      ?? "";
  }
  return { guide, sym };
}
