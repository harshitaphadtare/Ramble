import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import noUnsanitized from 'eslint-plugin-no-unsanitized';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/dev-dist/**', '**/node_modules/**', '**/*.config.{js,ts}'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks, 'no-unsanitized': noUnsanitized },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // docs/SECURITY.md §5.4: no HTML sinks, ever.
      'no-unsanitized/method': 'error',
      'no-unsanitized/property': 'error',
      'no-restricted-syntax': [
        'error',
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'Banned: render text, never HTML (SECURITY.md §5.4).' },
      ],
    },
  },
  {
    files: ['apps/api/**/*.ts', 'packages/**/*.ts', 'scripts/**/*.{js,mjs,ts}', 'apps/web/scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
