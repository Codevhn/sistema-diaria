import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { buildConsonantGroups, findConsonants, normalizeConsonantText } from '../src/consonants.js';
const guide = JSON.parse(fs.readFileSync(new URL('../data/guia_suenos.json', import.meta.url), 'utf8'));
const numbers = result => result.matches.map(n => n.pad);

describe('grupos por terminaciones de los símbolos', () => {
  it('usa los nombres de los 100 símbolos sin clasificarlos por familia ni significado', () => {
    for (const mode of ['ending', 'rhyme']) {
      const index = buildConsonantGroups(guide, { mode });
      expect(index.entries).toHaveLength(100);
      expect(index.entries.every(n=>n.ending && n.symbol === guide[n.pad].simbolo)).toBe(true);
      expect(index.groups.flatMap(g=>g.members).map(n=>n.pad).sort()).toEqual(Object.keys(guide).sort());
    }
  });
  it('reúne las terminaciones escritas -llo y permite estrecharlas a -illo', () => {
    const broad = findConsonants('10', buildConsonantGroups(guide));
    expect(broad.entry.ending).toBe('llo');
    expect(numbers(broad)).toEqual(['12','28','52','57']);
    expect(numbers(findConsonants('Anillo', buildConsonantGroups(guide, { length:4 })))).toEqual(['52','57']);
    expect(numbers(findConsonants('10', buildConsonantGroups(guide, { length:2 })))).toContain('30');
  });
  it('distingue rima consonante de una coincidencia de letras finales', () => {
    const index = buildConsonantGroups(guide, { mode:'rhyme' });
    expect(numbers(findConsonants('10', index))).toEqual(['52','57']);
    expect(numbers(findConsonants('12', index))).toEqual(['28']);
    expect(numbers(findConsonants('11', index))).not.toContain('94');
    expect(numbers(findConsonants('03', index))).not.toContain('62');
    expect(numbers(findConsonants('11', buildConsonantGroups(guide)))).toContain('94');
  });
  it('respeta tildes de acentuación, diptongos y plurales en las rimas revisadas', () => {
    const index = buildConsonantGroups(guide, { mode:'rhyme' });
    expect(numbers(findConsonants('avion', index))).toEqual(['15','39','60','68','87']);
    expect(numbers(findConsonants('Juego', index))).toEqual(['73']);
    expect(numbers(findConsonants('Zapatos', index))).toEqual(['88']);
    expect(numbers(findConsonants('Zapatos', index))).not.toContain('13');
    expect(findConsonants('policia', index).entry.ending).toBe('ia');
    expect(normalizeConsonantText(' NIÑA ')).toBe('niña');
  });
  it('usa la última palabra del símbolo compuesto y no cambia sus nombres originales', () => {
    const custom = {'00':{simbolo:'Luna nueva'},'01':{simbolo:'Cueva'},'02':{simbolo:'Luna vieja'}};
    const result = findConsonants('luna nueva',buildConsonantGroups(custom,{length:4}));
    expect(result.entry.symbol).toBe('Luna nueva');
    expect(result.entry.ending).toBe('ueva');
    expect(numbers(result)).toEqual(['01']);
  });
  it('no fabrica coincidencias para una palabra corta o una rima no revisada', () => {
    const index = buildConsonantGroups({'00':{simbolo:'Sol'}},{length:4});
    expect(findConsonants('00',index)).toMatchObject({entry:{ending:null},matches:[]});
    const unknown = buildConsonantGroups({'00':{simbolo:'Constructor'}},{mode:'rhyme'});
    expect(findConsonants('00',unknown)).toMatchObject({entry:{ending:null},matches:[]});
    expect(findConsonants('99',index)).toBeNull();
    expect(findConsonants('100',index)).toBeNull();
    expect(findConsonants('-1',index)).toBeNull();
    expect(buildConsonantGroups()).toEqual({entries:[],groups:[]});
  });
  it('excluye el número consultado y conserva el orden numérico de cada grupo', () => {
    for(const mode of ['ending','rhyme']){
      const index=buildConsonantGroups(guide,{mode});
      for(const entry of index.entries){
        const result=findConsonants(entry.pad,index);
        expect(result.matches.every(n=>n.numero!==entry.numero&&n.ending===entry.ending)).toBe(true);
        expect(result.matches.map(n=>n.numero)).toEqual(result.matches.map(n=>n.numero).sort((a,b)=>a-b));
      }
    }
    expect(()=>buildConsonantGroups(guide,{length:1})).toThrow();
    expect(()=>buildConsonantGroups(guide,{mode:'assonance'})).toThrow();
  });
});
