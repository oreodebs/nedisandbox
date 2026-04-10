# NediProject

Repository structure:

- `backend/`: backend services and backend-only environment files
- `frontend/`: React + TypeScript + Vite dashboard app

Frontend commands:

```bash
npm run dev
```

```bash
npm run build
```

The root `package.json` forwards these commands into `frontend`, and its `postinstall` runs a clean install in `frontend` so repo-root CI/CD platforms like Cloudflare Pages pick up the correct frontend lockfile.

Useful frontend data scripts:

```bash
cd frontend
python scripts/aggregate_data.py
```

```bash
cd frontend
node scripts/backfill-access-coverage-infrastructure.mjs
```

```bash
cd frontend
python preaggregate_dashboard_data.py
```
