export default [
  {
    files: ["js/**/*.js", "tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module"
    },
    rules: {
      // Détection d'erreurs certaines, sans imposer de reformatage global.
      "no-debugger": "error",
      "no-unreachable": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-unsafe-finally": "error",
      "valid-typeof": "error"
    }
  }
];
