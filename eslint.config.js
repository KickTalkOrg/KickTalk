const js = require("@eslint/js");
const globals = require("globals");
const react = require("eslint-plugin-react");
const reactHooks = require("eslint-plugin-react-hooks");
const n = require("eslint-plugin-n");
const importPlugin = require("eslint-plugin-import");

module.exports = [
  // Ignore build, vendor and manual testing directories
  {
    ignores: [
      "manual-tests/**",
      "dist/**",
      "out/**",
      "node_modules/**",
      ".lgtm-data/**",
    ],
  },

  // ESLint recommended base for JS
  js.configs.recommended,

  // Project language options
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // Tame noisy rules for initial pass
      "no-unused-vars": [
        "warn",
        {
          ignoreRestSiblings: true,
          args: "none",
          varsIgnorePattern: "^(React|_|__|___)$",
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-case-declarations": "warn",
      "no-constant-binary-expression": "warn",
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-useless-catch": "warn",
    },
  },

  // Node-specific contexts: main & preload
  {
    files: ["src/main/**", "src/preload/**"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      n,
      import: importPlugin,
    },
    rules: {
      // Keep defaults; enable stricter rules later as desired.
    },
  },

  // Renderer context: React + browser
  {
    files: ["src/renderer/**"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      import: importPlugin,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      // Keep defaults; enable stricter rules later as desired.
    },
  },
];
