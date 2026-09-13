import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import prettier from 'eslint-config-prettier';
import turbo from 'eslint-config-turbo/flat';
import globals from 'globals';

/** @type {import('eslint').Linter.Config[]} */
export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  ...turbo,
  prettier,
  ...svelte.configs['flat/prettier'],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        NodeJS: true
      }
    }
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser
      }
    }
  },
  {
    files: ['**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: ts.parser
      }
    }
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { varsIgnorePattern: '^\\$\\$(Props|Events|Slots)$' }
      ],
      // TODO: migrate links and goto calls to $app/paths resolve()
      'svelte/no-navigation-without-resolve': 'warn',
      // TODO: move reactive Date usage to SvelteDate
      'svelte/prefer-svelte-reactivity': 'warn'
    }
  },
  {
    ignores: [
      '**/build/',
      '**/.svelte-kit/',
      '**/.svelte-check/',
      '**/dist/',
      '**/node_modules/',
      '**/src-tauri/target/',
      '**/src-tauri/gen/'
    ]
  }
];
