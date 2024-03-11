// @ts-check

import eslint from '@eslint/js';
import tslint from 'typescript-eslint';
import eslintConfigPrettier from "eslint-config-prettier";

export default tslint.config(
  eslint.configs.recommended,
  ...tslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    rules: {
      "semi": "error",
      "no-unused-vars": "error"
    }
  },
  // This must be last as it corrects invalid settings
  eslintConfigPrettier
);
