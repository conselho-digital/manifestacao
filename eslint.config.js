import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'assets-src', 'public'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      // Segurança: nada de HTML montado a partir de dados
      'no-restricted-properties': [
        'error',
        { object: 'document', property: 'write', message: 'Não use document.write.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "AssignmentExpression[left.property.name='innerHTML'][right.type!='Literal'][right.type!='TemplateLiteral']",
          message: 'innerHTML só com texto fixo (risco de XSS). Use textContent.',
        },
        {
          selector: "AssignmentExpression[left.property.name='innerHTML'] > TemplateLiteral[expressions.length>0]",
          message: 'innerHTML não pode misturar variáveis (risco de XSS). Use textContent.',
        },
        {
          selector: "AssignmentExpression[left.property.name='outerHTML']",
          message: 'Evite outerHTML.',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'warn',
    },
  },
);
