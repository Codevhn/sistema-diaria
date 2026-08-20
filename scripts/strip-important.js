#!/usr/bin/env node
/**
 * strip-important.js
 * Elimina todos los !important de mac-theme.css.
 * Seguro porque mac-theme.css carga DESPUÉS de style.css en el cascade,
 * y los !important que se conservaron en style.css (.hidden, roles) no son
 * objetivo de mac-theme.css.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = resolve(__dirname, "../src/mac-theme.css");
const css = readFileSync(filePath, "utf-8");

const before = (css.match(/!important/g) || []).length;
const result = css.replace(/\s*!important/g, "");
const after = (result.match(/!important/g) || []).length;

console.log(`!important antes: ${before}`);
console.log(`!important después: ${after}`);
console.log(`Eliminados: ${before - after}`);

writeFileSync(filePath, result, "utf-8");
console.log(`✓ Escrito: ${filePath}`);
