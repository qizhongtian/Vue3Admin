/**
 * ESLint 扁平配置（ESLint 10 + typescript-eslint 8 + eslint-plugin-vue 10）
 *
 * 设计取舍：
 *  - 采用 typescript-eslint 的 recommended 而非 strict：基础框架追求的是
 *    「挡住真实缺陷（未使用变量、误用 await、类型守卫遗漏）」，
 *    而不是用 no-explicit-any 这类规则把存量代码全部标红；
 *  - Vue 文件使用 vue-eslint-parser，<script lang="ts"> 内交由
 *    typescript-eslint parser 处理；
 *  - node 侧配置文件（vite.config.ts / build / tests）单独放宽，
 *    允许 process 等全局对象。
 */
import eslintPluginVue from 'eslint-plugin-vue'
import ts from 'typescript-eslint'

export default ts.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'dist-coverage/**',
      '**/*.d.ts',
      '.workbuddy/**',
      '.pnpm-store/**',
    ],
  },

  // TypeScript 文件（含 <script> 之外的 .ts）
  ...ts.configs.recommended,

  // Vue SFC：模板与 <script> 一起解析
  ...eslintPluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
        sourceType: 'module',
        ecmaVersion: 'latest',
        extraFileExtensions: ['.vue'],
      },
    },
  },

  {
    rules: {
      // ---- TypeScript ----
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',

      // ---- Vue ----
      // 单文件页面组件（如 login/index.vue）允许单词命名，避免无意义改名
      'vue/multi-word-component-names': 'off',
      // 属性换行交给 Prettier，这里只保证可读性底线
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/attributes-order': 'warn',
      'vue/no-unused-refs': 'error',
      /**
       * 关闭「过滤器已废弃」检查：
       * 本项目在 <template> 中使用 TypeScript 类型断言（如 `modelValue[key] as string`），
       * 其中的 `|` 会被该规则误判为废弃的过滤器语法（Vue 3 已移除过滤器）。
       */
      'vue/no-deprecated-filter': 'off',

      // ---- 通用 ----
      // 统一走 src/utils/logger，仅放行 warn/error
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  // Node 侧脚本：构建配置、工具脚本、测试文件
  {
    files: [
      'vite.config.ts',
      'build/**/*.ts',
      'tests/**/*.ts',
      'eslint.config.js',
      'commitlint.config.js',
    ],
    rules: {
      'no-console': 'off',
    },
  },

  // 日志模块本身是 console 的唯一合法出口，允许直接调用
  {
    files: ['src/utils/logger.ts'],
    rules: {
      'no-console': 'off',
    },
  },
)
