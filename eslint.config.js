import js from '@eslint/js';
import vuePlugin from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import tsParser from '@typescript-eslint/parser';

const browserGlobals = {
  console: 'readonly',
  document: 'readonly',
  window: 'readonly',
  MediaQueryList: 'readonly',
  MediaQueryListEvent: 'readonly',
  ImportMetaEnv: 'readonly',
};

const nodeGlobals = {
  module: 'readonly',
  __dirname: 'readonly',
  process: 'readonly',
  console: 'readonly',
};

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '*.d.ts',
      'vite.config.js',
    ],
  },
  js.configs.recommended,
  ...vuePlugin.configs['flat/recommended'],
  {
    files: ['**/*.ts', '**/*.vue'],
    languageOptions: {
      parser: vueParser,
      globals: browserGlobals,
      parserOptions: {
        parser: tsParser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-console': 'off',
      'vue/multi-word-component-names': 'off',
      'vue/html-self-closing': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
    },
  },
  {
    files: ['*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: nodeGlobals,
    },
    rules: {
      'no-unused-vars': 'off',
    },
  },
  {
    files: ['*.js', '*.mjs', '*.ts', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: nodeGlobals,
    },
    rules: {
      'no-unused-vars': 'off',
    },
  },
];
