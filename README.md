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

The root `package.json` forwards these commands to the `frontend` workspace, so repo-root builds work in CI/CD platforms like Cloudflare Pages.

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
