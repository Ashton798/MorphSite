# 宣传内容生成器（黑客松 MVP）

上传一张商品照片 + 一句宣传需求，自动生成：**宣传海报 + 宣传短视频（MP4）+ 三条宣传文案**。

核心闭环：上传照片 → 填写宣传信息 → 点击生成 → 任务进度 → 展示海报/视频/文案 → 下载。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Next.js 15 + TypeScript + Tailwind CSS |
| 后端 | FastAPI + SQLAlchemy |
| 数据库 | SQLite（通过 `DATABASE_URL` 可直接切换 PostgreSQL） |
| 异步任务 | FastAPI BackgroundTasks（`generation_service.execute_pipeline` 已解耦，可包装为 Celery task） |
| 视频合成 | FFmpeg |
| AI 调用 | 后端 Provider Adapter（`providers/`），API Key 仅存在于后端环境变量 |
| 文件存储 | 本地 `uploads/` + `outputs/`，封装为 `StorageService`，可切换对象存储 |

## 环境要求

- Python 3.11+
- Node.js 18+
- FFmpeg（macOS：`brew install ffmpeg`）

## 一键启动（推荐）

完成下方首次依赖安装后，在项目根目录运行：

```bash
bash dev.sh
```

脚本先启动后端（8002），健康检查成功后启动前端（3000），并自动对齐代理地址。
打开 http://localhost:3000，按 Ctrl+C 同时停止前后端。若端口已占用，先停止旧服务。
也可运行 `BACKEND_PORT=8012 FRONTEND_PORT=3010 bash dev.sh` 使用其它端口。

若沿用之前单独运行的前端，其 `frontend/.env.local` 的 `BACKEND_URL` 必须与后端端口一致。
例如已有配置为 `http://localhost:8002`，后端需使用 `--port 8002`；修改该配置后须重启前端。

## 启动步骤

### 1. 启动后端（端口 8000）

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env   # 默认 MOCK_MODE=true，可直接跑通

uvicorn app.main:app --reload --port 8000
```

验证：打开 http://localhost:8000/health 应返回 `{"status":"ok","mock_mode":true}`。

### 2. 启动前端（端口 3000）

```bash
cd frontend
npm install
npm run dev
```

打开 http://localhost:3000 即可使用。前端通过 Next.js rewrite 将 `/api/*` 代理到后端，无跨域问题，也不接触任何密钥。

## 环境变量（backend/.env）

| 变量 | 说明 | 默认 |
|---|---|---|
| `MOCK_MODE` | 兼容旧版配置；文案由页面模型选择决定，海报由 `POSTER_MODE` 决定，视频使用 FFmpeg | `true` |
| `DATABASE_URL` | 数据库连接串；切 PostgreSQL 改为 `postgresql+psycopg://user:pass@host:5432/db` | SQLite |
| `UPLOAD_DIR` / `OUTPUT_DIR` | 上传 / 产物目录 | `../uploads` `../outputs` |
| `MAX_UPLOAD_MB` | 上传大小上限 | `10` |
| `FFMPEG_PATH` | FFmpeg 路径 | `ffmpeg`（PATH 查找） |
| `FONT_PATH` | 海报/字幕中文字体（Linux 改为 Noto Sans CJK 路径） | macOS 冬青黑体 |
| `COPYWRITING_API_KEY` / `COPYWRITING_BASE_URL` | 文案 Provider（真实模式） | 空 |
| `POSTER_API_KEY` / `POSTER_BASE_URL` | 海报 Provider（真实模式） | 空 |
| `VIDEO_API_KEY` / `VIDEO_BASE_URL` | 视频 Provider（真实模式） | 空 |

⚠️ 所有密钥只在后端读取，绝不进入 Next.js 前端。

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查 |
| POST | `/api/generations` | multipart 提交 `image / product_name / description / style / platform`，返回 `{task_id, status}` |
| GET | `/api/generations/{task_id}` | 查询状态：`status / stage / poster_url / video_url / copy_text / error_message` |
| GET | `/api/files/{filename}` | 访问/下载生成的海报与视频 |

## 接入真实 AI Provider

文案按页面选择的模型调用兼容 Chat Completions 的接口；图片模型见本文「图片模型接入」部分。两者独立配置，视频始终使用本地 FFmpeg 合成。

## 项目结构

```
frontend/            Next.js 前端（单页）
  app/page.tsx       主页面（上传、表单、轮询、结果展示）
  components/        StatusPanel / ResultPanel
  lib/api.ts         API 封装（相对路径，无密钥）
backend/
  app/
    main.py          FastAPI 入口 + /health + CORS + 中文错误
    config.py        环境变量配置
    database.py      SQLAlchemy（SQLite ↔ PostgreSQL 可切换）
    models.py        generation_tasks 表
    schemas.py       Pydantic 模型
    routes/          generations.py / files.py
    services/        generation_service / storage_service / ffmpeg_service
    providers/       base.py（接口）/ mock_provider.py / real_provider.py（占位）
  requirements.txt
  .env.example
uploads/             上传原图
outputs/             生成的海报与视频
```

## 常见问题

- **「未找到 FFmpeg」**：安装 FFmpeg 或在 `.env` 设置 `FFMPEG_PATH`
- **上传报「文件类型不支持」**：仅支持 JPG / PNG / WEBP
- **Linux 下海报中文乱码**：安装中文字体并设置 `FONT_PATH`，如 `/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc`
- **前端报「无法连接服务器」**：确认后端已在 8000 端口启动


## 模型对话与文案

- 默认 `mock` 模型可在没有 API Key 的情况下本地演示，回复和文案明确标记为示例。
- 真实文案模型：在后端 `.env` 设置 `COPYWRITING_BASE_URL`、`COPYWRITING_API_KEY` 和 `COPYWRITING_MODEL`。
- 多模型：参考 `backend/models.example.json` 建立 `backend/models.json`，用 `api_key_env` 引用后端环境变量。点击「刷新模型」即可重新加载。
- 对话会带上商品名、已有活动描述、风格和平台；可将回复填回活动描述，超过 2000 字时提示精简。
- `GET /api/models` 获取模型列表，`POST /api/chat` 发送对话；生成接口使用 `images` 多文件字段（1–5 张）及 `model_id`。
- 真实文案模型可与 `MOCK_MODE=true` 搭配，此时海报和视频仍为本地模板/FFmpeg；图片模型可通过 POSTER_MODE=ai 独立启用，视频继续本地合成。
- 查询任务连续失败后，点击「重新查询任务」继续查询原任务，不重复提交生成。

## 回归验证

```bash
cd backend
.venv/bin/python -m unittest discover -s tests -v
cd ../frontend
node node_modules/typescript/bin/tsc --noEmit
```

后端测试使用临时数据库和临时图片，覆盖模型列表、对话上下文、参数校验、真实 FFmpeg 本地合成与产物下载，不调用外部付费 API。


## 图片模型接入

海报使用独立于文案/对话的图片模型。后端 `.env` 配置：

```dotenv
POSTER_MODE=ai
POSTER_BASE_URL=https://lax.toklens.ai/v1
POSTER_MODEL=gpt-image-2.5-flare
POSTER_API_KEY=填写你自己的密钥
POSTER_SIZE=1024x1536
```

重启后端后生效。基于商品主图调用 `/images/edits`（multipart `image`），请求返回 `b64_json`，保留商品外观并生成竖版宣传海报；视频继续本地 FFmpeg 合成。`POSTER_MODE=local` 可切回模板。图片模型不会出现在「对话与文案模型」列表，页面会单独显示海报模型。历史任务保存使用过的海报模型，切换配置不会改变历史结果标记。

接口失败或超时会明确显示失败，不自动改用模板，也不自动重试付费请求。服务说明：https://toklens.ai/zh/manual 。
