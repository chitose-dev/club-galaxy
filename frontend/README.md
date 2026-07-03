# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## 環境変数（接続先バックエンド）

`VITE_API_BASE_URL` で API 接続先を指定する（`.env.example` 参照。実値は
gitignore 済みの `.env.local` に置く）。接続先解決は `src/api/apiBase.ts` に
一本化されている。

- **ローカル開発（`npm run dev`）**: 未設定でよい。未設定時は相対 URL
  （`/api/...`）で動き、`vite.config.ts` の proxy（`/api` →
  `http://localhost:3001`）経由でローカル backend に繋ぐ。
  **本番 URL へは決してフォールバックしない**（ローカルから誤って本番へ
  書き込む事故を防ぐため）。別ポートで動かす場合のみ明示設定する。
- **本番ビルド（`npm run build`）**: `VITE_API_BASE_URL` は **必須**。
  未設定だと `vite.config.ts` の build 時ガードでビルドが失敗する
  （デプロイ後の実行時に API エラーになるより前に止める。既定の本番
  フォールバックは廃止済み）。

本リポジトリでは本番 Cloud Run 向けの接続先を `frontend/.env.production` に
明示済みのため、`Dockerfile` / `deploy.yml` は追加の env 注入なしで本番
ビルドが可能。

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
