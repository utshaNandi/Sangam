# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Security & Secret Prevention

Automated secret prevention is enforced locally via pre-commit hooks and remotely via GitHub Actions.

- **Pre-commit hook**: Runs automatically on `git commit` via Git's `core.hooksPath` set to `.githooks`. Configured automatically on `npm install`.
- **Run audit manually**: `npm run audit:secrets`
- **Run scanner self-tests**: `npm run audit:secrets:test`
- **Documentation**: See [docs/SECRET_PREVENTION.md](docs/SECRET_PREVENTION.md) for full details on secret prevention, protected credentials, and incident response.

