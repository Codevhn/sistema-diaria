// Stress endings reviewed for the 100 symbols in the current Spanish guide.
// Keys are words, not number IDs: changing a symbol never silently reuses its old rhyme.
const RHYMES = {
  avion:'on', pies:'es', mujer:'er', muerto:'erto', tigre:'igre', embarazada:'ada',
  elefante:'ante', navaja:'aja', conejo:'ejo', hombre:'ombre', anillo:'illo', perro:'erro',
  caballo:'allo', gato:'ato', boda:'oda', raton:'on', niña:'iña', joven:'oven', angel:'angel',
  mariposa:'osa', espejo:'ejo', pajaro:'ajaro', ataud:'ud', mono:'ono', sapo:'apo',
  balanza:'anza', bandera:'era', juego:'ego', gallo:'allo', padre:'adre', bolo:'olo',
  alacran:'an', culebra:'ebra', carpintero:'ero', musica:'usica', virgen:'irgen',
  viejita:'ita', suerte:'erte', pistola:'ola', jabon:'on', cielo:'elo', novia:'ovia',
  madre:'adre', pantera:'era', mesas:'esas', iglesia:'esia', familia:'ilia', banco:'anco',
  estrella:'ella', sombra:'ombra', nueva:'eva', policia:'ia', zorrillo:'illo', llanta:'anta',
  licor:'or', olas:'olas', arbol:'arbol', cuchillo:'illo', venado:'ado', selva:'elva',
  dragon:'on', guerra:'erra', lagarto:'arto', coco:'oco', mueble:'eble', pintura:'ura',
  diablo:'ablo', vaca:'aca', ladron:'on', soldado:'ado', oro:'oro', zapatos:'atos',
  arco:'arco', fuego:'ego', edificio:'icio', reina:'eina', palomas:'omas', humo:'umo',
  tienda:'enda', flores:'ores', cafe:'e', rieles:'eles', escuela:'ela', bote:'ote',
  coronas:'onas', casa:'asa', reloj:'oj', leon:'on', platos:'atos', buho:'uo',
  lentes:'entes', tortuga:'uga', aguila:'aguila', cartero:'ero', carro:'arro',
  costurera:'era', dinero:'ero', viejito:'ito', bailes:'ailes', aretes:'etes',
};

// Keep ñ distinct from n; ignore vowel accents for written endings and lookup.
export const normalizeConsonantText = value => String(value ?? '').normalize('NFC').toLowerCase()
  .replace(/[áéíóúü]/g, c => ({á:'a',é:'e',í:'i',ó:'o',ú:'u',ü:'u'})[c])
  .trim().replace(/\s+/g, ' ');

export function buildConsonantGroups(guide = {}, { mode = 'ending', length = 3 } = {}) {
  if (!['ending', 'rhyme'].includes(mode)) throw new Error('Modo de consonantes no válido.');
  if (![2,3,4].includes(length)) throw new Error('Elige una terminación de 2, 3 o 4 letras.');
  const entries = [], groups = new Map();
  for (let numero = 0; numero < 100; numero++) {
    const pad = String(numero).padStart(2,'0');
    const symbol = guide[pad]?.simbolo;
    if (typeof symbol !== 'string' || !symbol.trim()) continue;
    const words = normalizeConsonantText(symbol).match(/[a-zñ]+/g);
    const word = words?.at(-1);
    const ending = mode === 'rhyme' ? (Object.hasOwn(RHYMES, word) ? RHYMES[word] : null) : word?.length >= length ? word.slice(-length) : null;
    const entry = { numero, pad, symbol, ending };
    entries.push(entry);
    if (ending) {
      if (!groups.has(ending)) groups.set(ending, []);
      groups.get(ending).push(entry);
    }
  }
  return { entries, groups: [...groups].map(([ending, members]) => ({ ending, members }))
    .sort((a,b)=>b.members.length-a.members.length || a.ending.localeCompare(b.ending,'es')) };
}

export function findConsonants(query, index) {
  const normalized = normalizeConsonantText(query);
  const numeric = /^\d{1,2}$/.test(normalized);
  const entry = index.entries.find(n => numeric ? n.numero === Number(normalized) : normalizeConsonantText(n.symbol) === normalized);
  if (!entry) return null;
  return { entry, matches: entry.ending ? index.groups.find(g=>g.ending===entry.ending).members.filter(n=>n.numero!==entry.numero) : [] };
}
