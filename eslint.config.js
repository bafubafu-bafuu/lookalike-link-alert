import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'artifacts/**', 'coverage/**', 'test-results/**', 'playwright-report/**', 'src/core/confusables.json'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.mjs', '**/*.js'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly', Buffer: 'readonly', fetch: 'readonly', URL: 'readonly' } },
  },
  { rules: { '@typescript-eslint/no-explicit-any': 'error' } },
);
