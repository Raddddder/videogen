# Online API Deployment

This project exposes the FastAPI backend as the online API. The frontend can run locally or online and call the deployed backend through `VITE_API_BASE_URL`.

## Render Staging

1. Push the branch that contains `backend/Dockerfile` to GitHub.
2. Open <https://dashboard.render.com/> and create a new Web Service.
3. Choose **Build and deploy from a Git repository** and select the `videogen` repo.
4. Configure the service:

| Field | Value |
| --- | --- |
| Name | `videogen-api` |
| Branch | `feature/backend-online-api` for staging, later `main` |
| Region | `Singapore` |
| Runtime | `Docker` |
| Root Directory | leave empty |
| Dockerfile Path | `backend/Dockerfile` |
| Instance Type | `Free` for first staging test |

5. Add environment variables:

```env
VSME_ENV=staging
CORS_ALLOW_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
CORS_ALLOW_CREDENTIALS=false
ASR_PROVIDER=mock
LLM_PROVIDER=mock
ARK_API_KEY=
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_MODEL=Doubao-Seed-2.0-lite
```

6. Click **Create Web Service** and wait for the Docker build to finish.
7. Open `https://your-render-service.onrender.com/health`. A healthy staging API returns JSON with `status: "ok"`.

## Local Frontend Against Render

Create `frontend/.env.local` locally:

```env
VITE_API_BASE_URL=https://your-render-service.onrender.com
```

Then run:

```bash
npm --prefix frontend run dev
```

The local frontend will call the Render API instead of a local FastAPI server.

## After Merge

After the staging branch is reviewed and merged, switch the Render service branch from `feature/backend-online-api` to `main`, then redeploy. If the frontend is deployed later, append its public domain to `CORS_ALLOW_ORIGINS`, separated by a comma.
