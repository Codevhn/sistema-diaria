const BROWSER = ["document","window","console","setTimeout","clearTimeout","setInterval","clearInterval","AbortController","localStorage","sessionStorage","Intl","requestAnimationFrame","fetch","URLSearchParams","CustomEvent","FormData"];
export default [
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: Object.fromEntries(BROWSER.map(g => [g, "readonly"])),
    },
    rules: { "no-undef": "error", "no-unused-vars": "off" },
  },
];
