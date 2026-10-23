export default {
  extends: ['@commitlint/config-conventional'],
  // 允许的提交类型与 Angular 规范一致
  'type-enum': [
    2,
    'always',
    ['build', 'chore', 'ci', 'docs', 'feat', 'fix', 'perf', 'refactor', 'revert', 'style', 'test'],
  ],
  'subject-max-length': [2, 'always', 100],
}
