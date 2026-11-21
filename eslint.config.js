export default [
  {
    files: ["js/**/*.js", "tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module"
    },
    rules: {
      // Détection des erreurs certaines et des déclarations inutilisées.
      "no-debugger": "error",
      "no-unreachable": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-unsafe-finally": "error",
      "valid-typeof": "error",
      "no-unused-vars": ["error", {
        args: "none",
        caughtErrors: "none",
        ignoreRestSiblings: true
      }],
      "no-var": "error",
      "no-constant-condition": "error"
    }
  }
];
