// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  { files: ["supabase/functions/**/*.ts"], languageOptions: { globals: { Deno: "readonly" } } },
  {
    ignores: ["dist/*"],
  }
]);
