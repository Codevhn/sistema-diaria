const GUIDE_URL = new URL("../data/guia_suenos.json", import.meta.url);

let guideCache = null;
let guidePromise = null;

async function fetchGuide() {
  if (typeof fetch !== "function") {
    throw new Error("fetch API no disponible en este entorno");
  }
  const response = await fetch(GUIDE_URL.href, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Error ${response.status} al leer guia_suenos.json`);
  }
  return response.json();
}

export async function loadGuide(force = false) {
  if (!force && guideCache) return guideCache;
  if (!guidePromise) {
    guidePromise = fetchGuide()
      .then((data) => {
        guideCache = data;
        return data;
      })
      .catch((err) => {
        guidePromise = null;
        throw err;
      });
  }
  return guidePromise;
}
