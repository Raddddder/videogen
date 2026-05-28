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
ASR_API_KEY=
ASR_BASE_URL=
ASR_MODEL=
ASR_PUBLIC_BASE_URL=https://your-render-service.onrender.com
ASR_LANGUAGE_HINTS=zh,en
LLM_PROVIDER=ark
LLM_MODEL=ep-20260508213828-7ntjl
LLM_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
LLM_API_KEY=
DASHSCOPE_API_KEY=
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/api/v1
DASHSCOPE_WEBSOCKET_URL=wss://dashscope.aliyuncs.com/api-ws/v1/inference
ARK_API_KEY=
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_MODEL=ep-20260508213828-7ntjl
FFMPEG_BIN=ffmpeg
FFPROBE_BIN=ffprobe
MAX_SAMPLE_UPLOAD_BYTES=52428800
```

For the official competition LLM, use Ark:

```env
LLM_PROVIDER=ark
LLM_MODEL=ep-20260508213828-7ntjl
LLM_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
LLM_API_KEY=<set in secret env>
```

6. Click **Create Web Service** and wait for the Docker build to finish.
7. Open `https://your-render-service.onrender.com/health`. A healthy staging API returns JSON with `status: "ok"`.

To enable DashScope sentence-level ASR in staging, switch:

```env
ASR_PROVIDER=dashscope
ASR_MODEL=fun-asr
DASHSCOPE_API_KEY=<set in Render secret env>
ASR_PUBLIC_BASE_URL=https://your-render-service.onrender.com
ASR_TIMEOUT_SEC=180
```

`fun-asr` receives `file_urls`, so the URL must be reachable from DashScope. A local `http://127.0.0.1:8000` URL will not work unless it is exposed through a public tunnel.

For local-upload ASR without a public file URL, use DashScope realtime:

```env
ASR_PROVIDER=dashscope_realtime
ASR_MODEL=fun-asr-realtime
DASHSCOPE_API_KEY=<set in local .env or Render secret env>
DASHSCOPE_WEBSOCKET_URL=wss://dashscope.aliyuncs.com/api-ws/v1/inference
ASR_LANGUAGE_HINTS=zh
ASR_TIMEOUT_SEC=180
```

This path extracts `asr_audio.wav` locally and sends it through the DashScope SDK/WebSocket.

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

## FFmpeg Runtime

真实样例视频上传依赖 `ffprobe` 读取元信息，并依赖 `ffmpeg` 抽封面帧。`backend/Dockerfile` 已安装 Debian 包 `ffmpeg`，所以 Docker/Render 路径可以直接使用。

本机直接运行 FastAPI 时，需要先安装 FFmpeg：

```bash
brew install ffmpeg
```

如果机器上的二进制不在 PATH 里，可以用环境变量指定绝对路径：

```env
FFMPEG_BIN=/opt/homebrew/bin/ffmpeg
FFPROBE_BIN=/opt/homebrew/bin/ffprobe
```

## After Merge

After the staging branch is reviewed and merged, switch the Render service branch from `feature/backend-online-api` to `main`, then redeploy. If the frontend is deployed later, append its public domain to `CORS_ALLOW_ORIGINS`, separated by a comma.
