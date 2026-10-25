# MorphSite

2026 · 1024 黑客松 OPC 赛道。一句话生成完整品牌世界：网站、海报、视频分镜。

**已接入真实大模型。** 输入一句中文简报（可附产品图），服务端调用 AI 生成品牌名、调性、6 个网站区块、海报排版与 4 幅分镜，并生成一张主视觉图；随后可以用自然语言持续修改。所有模型输出都必须先转成经过 Zod 校验的 `BrandSpec` 才能渲染，模型无法注入组件、HTML、CSS 或 JS。

未接入登录、支付或数据库；不会渲染真实视频（分镜是静态方案）。

## 启动

需要 Node.js 20.9+（推荐当前受支持的 LTS）与 npm。依赖版本记录在 `package-lock.json`，首次安装用 `npm ci`。

```bash
npm ci
npm run dev
```

打开：

- 首页：<http://localhost:3000>
- 工作台：<http://localhost:3000/studio>
- 直接载入演示：<http://localhost:3000/studio?demo=1>
- 海报：<http://localhost:3000/studio?demo=1&view=poster>
- 分镜：<http://localhost:3000/studio?demo=1&view=video>

端口占用时以终端打印的地址为准；也可用 `npm run dev -- --port 3002`。

生产模式：

```bash
npm run build
npm start
```

### AI 配置

密钥只在服务端使用，绝不加 `NEXT_PUBLIC_` 前缀，浏览器不会拿到它。

```bash
cp .env.example .env.local   # 然后填入 AI_API_KEY
```

| 变量 | 说明 |
| --- | --- |
| `AI_BASE_URL` | OpenAI 兼容端点，默认 `https://api.openai-next.com` |
| `AI_API_KEY` | 服务端密钥（必填） |
| `AI_CHAT_MODEL` | 生成 / 编辑文案，默认 `gpt-4o` |
| `AI_VISION_MODEL` | 上传产品图时用的多模态模型，默认 `gpt-4o` |
| `AI_IMAGE_MODEL` | 主视觉生图，默认 `gpt-image-1` |
| `AI_IMAGE_ENABLED` | `off` 关闭生图（只出文字品牌） |
| `MORPHSITE_AI` | `off` = 完全不联网，退回确定性 Demo |

未配置 `AI_API_KEY` 时接口返回 503，前端自动退回本地演示品牌，并在界面明确标注 `LOCAL DEMO`；配置正常时标注 `AI CONNECTED` 与模型名。

Geist 字体由 npm 包本地提供，咖啡图是仓库自带的原创 SVG 演示插画，`.env` 之外不需要任何远端服务。

## MorphSite 集成

此压缩包中的 MVP 后端已作为素材生成服务接入 MorphSite，源代码快照位于 `integrations/hackathon-mvp/`。MVP 的 `dev.sh` 不在压缩包中，因此不能使用 README 中的一键命令。请从 MorphSite 根目录启动：

```bash
# 终端 1：启动营销素材 FastAPI 后端（Windows PowerShell）
cd integrations/hackathon-mvp/backend
.venv312\\Scripts\\Activate.ps1  # 推荐 Python 3.12；Python 3.14 没有本项目锁定依赖的 Windows wheel
copy .env.example .env
uvicorn app.main:app --reload --port 8002

# 终端 2：启动 MorphSite
cd C:\\Users\\asus\\Desktop\\1024opc
$env:MARKETING_BACKEND_URL="http://127.0.0.1:8002"
npm run dev -- --port 3101
```

打开 `http://localhost:3101/studio`，点击右侧 **营销素材 · 文案 / 海报 / 短视频**。如果营销后端未启动，Website、Poster、Video 和 MorphSite 原有 AI 功能仍可用；营销面板会显示服务不可用，而不会阻塞工作台。

### 营销素材演示流程

1. 打开 `/studio`，点击 **使用演示品牌**，或从首页输入品牌/商品简报生成自己的 BrandSpec 网站。
2. 打开右侧 **营销素材**，填写品牌名、商品名、推广需求，选择宣传风格和发布平台。
3. 上传 JPG/PNG/WEBP 商品图；内置 SVG 演示图只用于网站预览，不能直接提交给素材后端。
4. 点击 **① 生成推广网页**：输入会进入 MorphSite 原有 Website/BrandSpec 流程。
5. 点击 **② 生成营销素材**：创建 MVP 后端任务，面板轮询进度，显示文案、海报和视频。
6. 可复制文案，下载 PNG/MP4；刷新 Studio 后按当前 BrandSpec 恢复最近任务。
7. 模型选择中带“示例”的结果来自 MVP mock provider，不代表真实模型调用；真实模型只有在后端配置后才会显示为可用。

- `GOOGLE_API_KEY`：Google AI Studio API Key。若你曾在聊天、截图或代码中公开过 Key，请先撤销并换新 Key；不要用旧 Key 做验收。
- `GOOGLE_TEXT_ENABLED=true`：允许在文案模型下拉框选择 Gemini；默认 `false`，不会覆盖用户选择的 Mock / 兼容模型。
- `GOOGLE_IMAGE_ENABLED=true`：启用 Gemini 图片海报生成；默认 `false`。
- `GOOGLE_VIDEO_ENABLED=true`：启用 Veo 异步视频生成；默认 `false`，需要账号/项目具备对应模型权限与额度。面板必须明确确认单次预算（`GOOGLE_VIDEO_MAX_COST_USD`）；此设置是用户授权门槛，不是 Google 端计费硬上限。
- `GOOGLE_TTS_ENABLED=true`：可选生成 WAV 配音；本地 FFmpeg 视频会尝试合入配音，失败时保留独立 MP4 与 WAV。Veo 原生音轨不会被自动替换。
- `GOOGLE_TEXT_MODEL` / `GOOGLE_IMAGE_MODEL` / `GOOGLE_VIDEO_MODEL` / `GOOGLE_TTS_MODEL`：默认分别是 `gemini-2.5-flash`、`gemini-2.5-flash-image`、`veo-3.1-generate-preview`、`gemini-2.5-flash-preview-tts`；这些只是配置默认值，真实可用性以账号权限及模型列表为准。

Google Key 只放在 `integrations/hackathon-mvp/backend/.env`，MorphSite 前端不会读取或暴露它。SDK 使用官方 `google-genai`；模型失败时结果须标为 Mock / 本地模板或不可用，不冒充 Google 产出。没有新 Key 时可离线执行 `cd integrations/hackathon-mvp/backend && .venv312/Scripts/python.exe tests/void_coffee_acceptance.py` 验证 VOID COFFEE Mock 文案、本地海报及 FFmpeg 视频，不产生 Google 费用。


前端只读取 `MARKETING_BACKEND_URL`（非密钥），服务端代理负责请求 FastAPI。MVP 后端密钥继续只放在 `integrations/hackathon-mvp/backend/.env`：`COPYWRITING_*`、`POSTER_*`，不要使用 `NEXT_PUBLIC_` 前缀。`POSTER_MODE=local` 会生成本地模板海报；`POSTER_MODE=ai` 需要额外配置图片模型。

本机已检测到 FFmpeg，但是否可用以 FastAPI 后端的 `FFMPEG_PATH` 为准。若 FFmpeg 未安装或路径不对，任务仍会保留文案与海报，并明确显示视频不可用；配置 FFmpeg 后重新生成即可。


1. 在首页输入一句话并上传产品图，点击 **Generate**。简报按当前模式启动生成并交接给 Studio；AI 未启用时明确提示并载入 VOID COFFEE 演示。
2. 或直接打开 `/studio`，点击 **使用演示品牌**。右侧立即出现包含六个区块的宣传网站。
3. 在左侧输入 **改成粉色**：AI 返回 `setTheme` 操作，网站切换为 Soft Minimal，背景、强调色和视觉排版都会变化。
4. 输入 **故事区块改成：我们只做当季花材，每周三清晨从近郊花田直接运回**：AI 只改该区块正文，其他字段原样保留。
5. 点击右上角 **撤销修改**：恢复上一版，支持连续撤销最近 12 次有效操作，包括 AI 生成、AI 修改、上传和主题切换。
6. 切换 **Noir Luxury / Soft Minimal / Bold Future**、**桌面端 / 移动端**、**Website / Poster / Video**。
7. 上传 JPG、PNG 或 WebP，图片会在网站、海报和分镜参考帧中显示；上传失败会给出原因。
8. 点击下载图标，导出 **BrandSpec JSON**（含图片数据）。它不是网站 ZIP、海报图片或视频文件。

AI 不可用（未配 key、`MORPHSITE_AI=off`、超时、限流）时，界面会明确报错并保留上一版作品，不会静默退回演示数据覆盖你的内容。

不支持的指令（例如「给我做一部电影」）会明确提示“没有修改作品”，不会消耗撤销记录。标题中包含“粉色”时，仍按改标题处理。

## 目前能做什么

- 首页品牌视觉、真正运行的 Three.js WebGL 粒子宇宙（约 48,000 个桌面粒子 / 12,000 个移动端粒子）、滚动形态插值、鼠标视差、圆柱曲面空间文字与 WebGL 降级视觉，尊重减少动态效果偏好。
- 双栏工作台、历史消息、图片上传、真实状态驱动的三个预览；Studio 使用同一套深色玻璃 / 细线视觉，但不叠加 WebGL。
- 三套完整品牌主题；容器查询让 390px 预览真的重排，不是把桌面页面缩小。
- 原子校验与有界历史快照；未知或无效修改不覆盖已有作品。
- AI 生成 / 编辑失败、坏 JSON、越权操作都不会破坏当前作品，且可继续撤销。
- 在**同一浏览器标签页**中刷新可恢复最近作品及最多 60 条消息（`sessionStorage`）。撤销历史只在内存中，刷新后重置；关闭标签页通常会清空草稿。不是云端保存。
- 图片完全在浏览器内处理，文件上限 8 MB，支持 JPG / PNG / WebP，缩至最长边 1600px；拒绝 SVG、损坏图片和超大分辨率。当前不提供内容识别。
- 草稿存储失败有明确提示；可导出 JSON 备份。当前未做 JSON 导入。

## 项目结构

```text
app/
  page.tsx                   首页
  studio/page.tsx            工作台路由
  api/brand/generate/route.ts  简报 → BrandSpec（服务端）
  api/brand/edit/route.ts      指令 → 白名单操作（服务端）
  api/brand/status/route.ts    模式与模型名
  layout.tsx                 全局布局、字体、页面元数据
  globals.css                UI tokens、品牌主题消费、容器查询与响应式样式
  immersive.css              首页沉浸式布局、原生粘性滚动与降级样式
  studio-visual.css          工作台视觉覆盖（不改变品牌主题数据）
components/
  home-composer.tsx          首页输入、图片与工作台交接
  site-nav.tsx               透明 / 滚动导航、可访问的移动菜单
  motion-elements.tsx        复用的 Motion 滚动渐入
  immersive/immersive-hero.tsx    场景控制、滚动状态、减少动画及输入交接
  immersive/particle-universe.tsx  Three.js 懒加载入口、WebGL 降级
  immersive/particle-scene.ts    BufferGeometry / ShaderMaterial / morph targets / 3D 曲面字
  immersive/particle-data.ts      宇宙、网页、海报、视频四组确定性粒子目标
  remake-demo.tsx                 BrandSpec 主题切换演示
  image-upload.tsx           可复用上传控件
  studio-workspace.tsx       状态协调、临时保存、JSON 导出
  studio-chat.tsx            对话区域
  studio-activity.tsx        请求状态驱动的加载提示
  generation-provider.tsx   跨路由生成状态（沿用队友实现）
  preview-toolbar.tsx        作品 / 尺寸 / 主题 / 撤销控制
  brand-preview.tsx          BrandSpec 驱动的网站与预览调度
  poster-preview.tsx         海报基础排版
  storyboard-preview.tsx     可选帧的静态分镜
  website/
    hero.tsx
    product-showcase.tsx
    story.tsx
    promotion.tsx
    gallery.tsx
    cta.tsx
    shared.tsx               区块公共类型、文案与图片组件
lib/
  ai/                        服务端 AI 层（仅 route handler 引用，永不进浏览器）
    config.ts                读取 env、超时与开关
    client.ts                OpenAI 兼容调用、超时/错误归一、JSON 宽松解析
    prompts.ts               BrandSpec 生成与编辑的系统提示词、模型输出 schema
    draft.ts                 模型 draft → 固定骨架 BrandSpec 的归一化
    ops.ts                   9 种白名单编辑操作 + 纯函数应用
    contracts.ts             请求/响应 schema（含图片地址校验）
    rate-limit.ts            内存令牌桶
  ai-client.ts              浏览器侧 fetch 封装 + 二次校验
  brand-spec.ts              Zod 模型、三套主题、VOID COFFEE 数据、纯修改函数
  website-registry.ts        穷尽式组件注册表
  studio-state.ts            Reducer、12 步撤销、保存与交接数据校验
  image-upload.ts            客户端图片解码、压缩、限制
  preview-theme.ts           BrandSpec → CSS 变量
public/assets/
  void-coffee.svg            原创演示产品插画
scripts/check_browser.py     跨平台浏览器验收服务管理器（默认强制离线）
  
tests/
  brand-spec.test.ts         数据 / 注册表 / 状态单元测试
  ai.test.ts                 归一化、白名单操作、坏 JSON、越权字段
  browser_smoke.py           Playwright 端到端验收（确定性、离线）
  browser_immersive.py       WebGL、四形态、鼠标、暂停、降级、可见控件与 AI 传输模拟
  particle-data.test.ts      粒子目标数组、确定性与边界检查
  browser_ai.py              Playwright 真实 AI 验收（花钱、约 2 分钟）
```

构建配置：`package.json`、`package-lock.json`、`tsconfig.json`、`postcss.config.mjs`、`next.config.mjs`、`next-env.d.ts`、`.gitignore`。`AGENTS.md` 由当前 Next 开发服务器自动生成并保留。

### 视觉重构说明

首页 Hero 使用单个 `THREE.Points` 系统和 `ShaderMaterial`，没有为粒子创建独立 Mesh。粒子目标位置在同一 BufferGeometry 中保存为 Universe / Website / Poster / Video 四组属性，滚动只更新一个 `uProgress`，由顶点着色器完成插值。桌面默认约 48,000 粒子、移动端约 12,000 粒子；像素比上限为 1.5 / 1.25，并在低帧率持续出现时降到 DPR 1 与 65% 绘制量。场景仅在可见时渲染，切页会释放 geometry、material、texture 和 WebGL context。

WebGL 不可用时会隐藏 canvas，保留静态深色渐变、品牌排版和输入框；`prefers-reduced-motion` 会暂停连续动画并将形态停在离散状态。首页保留真实的简报 → sessionStorage → Studio 交接，AI 是否调用由服务端状态决定，视觉层没有伪造生成结果。

### 数据流

`用户描述 / 图片 → 现有 AI 生成流程（或明确标注的 Demo reducer）→ BrandSpecSchema.parse → 历史快照 → 组件注册表 → 网站 / 海报 / 分镜`

`BrandSpec` 包含 `brand`、`campaign`、`theme`、`assets`、`website`、`poster`、`video`。调色、改标题、上传都是纯函数；标题修改只改网站主标题、Hero 标题与海报标题，不覆盖简报或其他区块。预览不执行模型生成的 HTML / JavaScript。

要扩展区块：先扩展 Zod 的类型白名单，增加 `components/website/` 下的组件，再在 `websiteRegistry` 注册。TypeScript 的穷尽式 `Record` 会检查遗漏的渲染器。

## 检查与测试

```bash
npm run typecheck
npm test
npm run build
```

`npm run lint` 当前是类型检查的别名，不是 ESLint 扫描。

浏览器测试另需 Python 与 Playwright：

```bash
python -m pip install playwright
python -m playwright install chromium
npm run test:browser
npm run test:browser:production
```

自动化脚本使用 3100（开发）或 3101（生产）端口；测试前关闭本项目已经运行的 `next dev`，避免开发锁冲突。测试自行启动并停止整个进程树，Windows 下不会遗留 Next 子进程。

也可对已有服务器运行：

```bash
python tests/browser_smoke.py --base-url http://localhost:3000
python tests/browser_immersive.py --base-url http://localhost:3000
```

测试覆盖：数据校验、保留无关字段、改色、改标题、连续撤销、上传跨预览同步、坏文件提示、导出、刷新恢复、三个主题、真实容器重排、320 / 375 / 390 / 414 / 768 / 1280px 页面、1280×800 首屏 CTA 和减少动画偏好。截图和服务日志位于 `test-results/`（已忽略，不应提交）。

沉浸式浏览器测试会拦截 AI 状态及传输，使用明确的测试数据验证交接，不会产生供应商费用，也不代表一次真实模型调用。截图位于 `test-results/immersive/`。

## 尚未实现

- 逐镜头真实画面、语音、配乐、视频渲染与 MP4 导出（分镜是静态方案）。
- 海报 PNG / PDF 导出、网站静态打包、在线发布、域名绑定。
- 商家订阅、预约、交易后端。演示网站的导航 CTA 可跳转区块；需要后端的订阅按钮明确禁用。
- 持久数据库、跨设备项目、多人协作、JSON 导入与重做。
- 完整物理流体与电影级景深后处理。当前采用粒子 Shader、低分辨率阻尼波场和深度相关点大小；不是 Navier–Stokes 流体模拟。
- 全量真机性能基准。Chrome 自动化已经覆盖桌面和手机布局，但低端 GPU、Safari / Firefox 仍需真机验收，不能保证所有设备 60fps。

## AI 接入架构

浏览器永远不直连供应商，密钥不出服务端。

```text
首页简报 + 产品图
      ↓ sessionStorage
/api/brand/generate  ──→  gpt-4o（有图则 gpt-4o vision）→ AiDraft
      ↓                      ↓ draftToBrandSpec 归一化 + Zod 校验
      ↓                   gpt-image-1 生主视觉（失败不影响文字品牌）
      ↓
   BrandSpec  ──→  组件注册表  ──→  网站 / 海报 / 分镜
      ↓
/api/brand/edit  ──→  gpt-4o 返回白名单操作（setTitle / setTheme / setSection …）
                         ↓ applyOps 纯函数 → 重新校验 → 一次性提交历史快照
```

三个路由：

- `POST /api/brand/generate`：简报（+ 可选图片）→ 完整 `BrandSpec`。结构化输出用 `response_format: json_object`，模型返回的原始 draft 由 `lib/ai/draft.ts` 归一化：区块类型、顺序、id 与按钮目标全部由服务端固定，模型只提供文案；主题只能从三套预设里选。
- `POST /api/brand/edit`：当前 spec + 中文指令 → 类型化操作列表。`lib/ai/ops.ts` 只接受 9 种操作，别名会被归一化，未知或越权操作直接丢弃；每条操作映射到纯函数，应用后重新校验，失败则保留上一版。
- `GET /api/brand/status`：返回是否启用、模型名与生图开关，供界面标注模式，不泄漏密钥。

安全与失败处理：75s 超时、内存令牌桶限流（生成 12 次/分、修改 24 次/分）、上传图片在服务端按 `ImageSourceSchema` 重新校验（拒绝 `javascript:` 与 SVG）、所有错误都返回结构化中文提示且不覆盖已有作品。AI 返回坏 JSON、字段缺失、越权操作、超时都会保留上一版并可继续撤销。

真实调用会花钱：`npm run test:browser` 默认注入 `MORPHSITE_AI=off` 跑确定性测试；要跑真实 AI 验收用 `python tests/browser_ai.py --base-url http://127.0.0.1:3211`（约 2 分钟，产生 2 次生成 + 2 次修改费用）。
