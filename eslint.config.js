import babelParser from "@babel/eslint-parser";
import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";

const browserGlobals = {
  AbortController: "readonly",
  Blob: "readonly",
  console: "readonly",
  document: "readonly",
  fetch: "readonly",
  File: "readonly",
  FormData: "readonly",
  Headers: "readonly",
  Image: "readonly",
  localStorage: "readonly",
  matchMedia: "readonly",
  MediaQueryList: "readonly",
  MediaQueryListEvent: "readonly",
  navigator: "readonly",
  Notification: "readonly",
  performance: "readonly",
  requestAnimationFrame: "readonly",
  ResizeObserver: "readonly",
  sessionStorage: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  window: "readonly",
};

const nodeGlobals = {
  AbortSignal: "readonly",
  Buffer: "readonly",
  console: "readonly",
  fetch: "readonly",
  module: "readonly",
  process: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
};

export default [
  {
    ignores: [
      ".next/**",
      ".next-verify/**",
      ".vercel/**",
      "**/dist/**",
      "temp/**",
      ".impeccable/**",
      "node_modules/**",
      "playwright-report/**",
      "public/sw.js",
      "public/swe-worker*",
      "test-results/**",
      "cloudflare/**",
      "vite.config.js",
    ],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}", "*.{ts,tsx}"],
    languageOptions: {
      globals: { ...browserGlobals, ...nodeGlobals },
      parser: babelParser,
      parserOptions: {
        babelOptions: {
          presets: [
            ["@babel/preset-react", { runtime: "automatic" }],
            ["@babel/preset-typescript", { allExtensions: true, isTSX: true }],
          ],
        },
        ecmaFeatures: { jsx: true },
        ecmaVersion: "latest",
        requireConfigFile: false,
        sourceType: "module",
      },
    },
    plugins: {
      "@next/next": nextPlugin,
      "react-hooks": reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...reactHooks.configs.flat.recommended.rules,
      "no-console": "off",
      "no-undef": "off",
      "no-unused-vars": "off",
      "@next/next/no-img-element": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["*.js", "*.mjs", "scripts/**/*.mjs"],
    languageOptions: { globals: nodeGlobals },
    rules: { "no-console": "off", "no-unused-vars": "off" },
  },
];
