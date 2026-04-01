# NediProject

Repository structure:

- `backend/`: backend services and backend-only environment files
- `frontend/`: React + TypeScript + Vite dashboard app

Frontend commands:

```bash
cd frontend
npm run dev
```

```bash
cd frontend
npm run build
```

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
