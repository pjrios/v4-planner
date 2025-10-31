# v4-planner

Project workspace for an offline-first teaching agenda. See [plan.md](./plan.md) for roadmap details and [tasks.md](./tasks.md) for actionable backlog items.

## Getting started

1. Install dependencies
   ```bash
   npm install
   ```
2. Run the development server
   ```bash
   npm run dev
   ```

The project is scaffolded with **Vite + React + TypeScript** and includes TailwindCSS, ESLint, and Prettier-friendly lint rules. When running locally on a MacBook Air M1, install a recent LTS version of Node.js (>= 18) via [fnm](https://github.com/Schniz/fnm) or [nvm](https://github.com/nvm-sh/nvm) to ensure native dependencies compile correctly on Apple Silicon.

### Development data

- In development (`npm run dev`) the app seeds a representative dataset (trimesters, groups, schedules, lessons, rubrics, and templates) into IndexedDB the first time it loads.
- Clear browser storage or run `await db.delete()` in the console to reset the sample data if you want to start fresh.
- The seeding utility is skipped automatically if records already exist, so it will not overwrite local planning work.

## Available scripts

- `npm run dev` – start the Vite development server.
- `npm run build` – type-check and build the production bundle.
- `npm run preview` – preview the production build locally.
- `npm run lint` – run ESLint on the TypeScript source files.

## Tech stack snapshot

- [React 18](https://react.dev/) with [TypeScript](https://www.typescriptlang.org/)
- [Vite 5](https://vitejs.dev/) for development/build tooling
- [Tailwind CSS](https://tailwindcss.com/) for utility-first styling
- [ESLint](https://eslint.org/) with TypeScript and React presets

Next steps for development are tracked in [tasks.md](./tasks.md).
