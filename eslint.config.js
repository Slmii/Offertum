import js from '@eslint/js';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
		ignores: [
			'**/node_modules/**',
			'**/dist/**',
			'**/.output/**',
			'**/.nitro/**',
			'**/.tanstack/**',
			'**/.turbo/**',
			'**/generated/**',
			'**/routeTree.gen.ts'
		]
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		// Global rules — apply to every file matched by ts-eslint above.
		rules: {
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			'@typescript-eslint/consistent-type-imports': 'warn',
			'no-mixed-spaces-and-tabs': ['error', 'smart-tabs'],
			'linebreak-style': ['error', 'unix'],
			curly: 'error'
		}
	},
	{
		// React rules — only apply to JSX/TSX. Plain .ts files don't load React.
		files: ['**/*.tsx', '**/*.jsx'],
		plugins: {
			react: reactPlugin,
			'react-hooks': reactHooks
		},
		languageOptions: {
			parserOptions: {
				ecmaFeatures: { jsx: true }
			}
		},
		settings: {
			react: { version: 'detect' }
		},
		rules: {
			...reactPlugin.configs.recommended.rules,
			...reactHooks.configs.recommended.rules,
			// New JSX transform — `import React` is not required.
			'react/react-in-jsx-scope': 'off',
			'react/no-unescaped-entities': 'off',
			// Disallow redundant `={'...'}` when a plain string literal does.
			'react/jsx-curly-brace-presence': ['error', { props: 'never', children: 'never' }],
			// React 19's new prop-types story — disable since we use TS.
			'react/prop-types': 'off'
		}
	},
	{
		// NestJS reads constructor parameter *types* at runtime via reflect-metadata.
		// `import type` erases the value, breaking dependency injection.
		// Disable the rule for files that participate in the DI graph.
		files: [
			'apps/api/**/*.controller.ts',
			'apps/api/**/*.service.ts',
			'apps/api/**/*.module.ts',
			'apps/api/**/*.resolver.ts',
			'apps/api/**/*.guard.ts',
			'apps/api/**/*.interceptor.ts',
			'apps/api/**/*.pipe.ts',
			'apps/api/**/*.filter.ts',
			'apps/api/**/*.middleware.ts',
			'apps/api/**/*.gateway.ts',
			'apps/api/**/*.function.ts'
		],
		rules: {
			'@typescript-eslint/consistent-type-imports': 'off'
		}
	}
);
