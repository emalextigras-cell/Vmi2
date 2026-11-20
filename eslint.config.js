export default [
  {
    files: ["js/**/*.js", "tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module"
    },
    rules: {
      // Style minimal, non intrusif : ne déclenche pas de reformatage global.
      "no-trailing-spaces": "error",
      "no-mixed-spaces-and-tabs": "error",
      "no-multiple-empty-lines": ["error", { max: 2, maxEOF: 0 }],
      "eol-last": ["error", "always"],

      // Erreurs certaines et faciles à corriger.
      "no-debugger": "error",
      "no-unreachable": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-unsafe-finally": "error",
      "valid-typeof": "error"
    }
  }
];
