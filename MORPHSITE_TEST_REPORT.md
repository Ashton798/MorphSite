# MorphSite 集成交付与测试报告

报告日期：2026-10-25（中国标准时间）

## 1. 结论

MorphSite 的核心代码闭环已经完成到“可配置真实百炼服务、可验证发布、固定二维码、可降级本地媒体”的阶段。前端生产构建、BrandSpec 校验、网站生成/修改状态管理、发布生命周期、二维码内容、本地海报和 FFmpeg 视频均已自动化验证。

当前不能声称已经完成真实公网和中国大陆手机验收，原因是工作区没有普通百炼 API Key、Workspace ID、已批准的付费额度、真实 HTTPS 域名或部署资源。所有付费开关保持关闭，本次没有发起百炼图片、视频或 TTS 计费请求，也没有把 localhost 伪装成公网地址。

## 2. 功能状态

| 功能 | 状态 | 实际模型/引擎 | 是否可能付费 | 当前问题 |
|---|---|---|---|---|
| AI 网站生成 | 已通过 Mock 测试 | `qwen3.8-flash` Provider 协议；BrandSpec Zod/Pydantic 校验 | 真实调用可能付费 | 未配置普通百炼 Key/Workspace，未做真实最小调用 |
| 对话式网站修改 | 已通过 Mock 测试 | `qwen3.8-flash`；标题、配色、布局等安全本地操作已真实验证 | 真实 Qwen 调用可能付费 | 尚未使用真实百炼响应联调 |
| 上传产品图片 | 已真实验证（代码与自动化） | 浏览器上传、BrandSpec 资源引用 | 否 | 未做真实手机浏览器上传 |
| 主题/布局/撤销/版本 | 已真实验证（自动化） | React + BrandSpec 快照历史 | 否 | 未完成浏览器人工回归 |
| AI 图片生成/编辑 | 已通过 Mock 测试 | `wan2.7-image`，结果下载并持久化为真实 PNG/JPEG | 是 | 费用未批准，未发起真实请求 |
| 海报下载 | 已真实验证 | 本地 Pillow/排版引擎 | 否 | 浏览器下载动作尚未人工点击验证 |
| AI 视频生成 | 已通过 Mock 测试 | `wan2.7-i2v` / `wan2.7-t2v`，官方异步任务协议 | 是 | 费用未批准，未发起真实任务 |
| FFmpeg 视频合成 | 已真实验证 | FFmpeg 程序化合成 | 否 | 已生成并完整解码 MP4；浏览器播放尚未人工验证 |
| TTS 配音 | 已通过 Mock 测试 | `qwen-audio-3.1-tts-flash`，音频下载并持久化 | 是 | 费用未批准，未真实试听 |
| 网站发布 | 已通过 Mock/单元测试 | 固定 slug、已验证 BrandSpec 快照、归属权令牌 | 否 | 没有真实 HTTPS 部署；发布前探测会正确阻止伪发布 |
| 二维码生成 | 已真实验证（文件/载荷） | `qrcode`，512 px、白边、PNG 下载 | 否 | 尚无真实公网地址，未做手机扫码 |
| 重新发布/取消发布 | 已真实验证（自动化） | 同一项目保持原 slug；取消后 404；重发恢复 | 否 | 未做公网回归 |
| 中国大陆扫码访问 | 未完成 | — | 云资源/域名可能付费 | 必须部署后由真人用移动/联通/电信和微信实测 |

## 3. 本次实现

### 百炼 Provider 分层

- `TextProvider`：通过 FastAPI 服务端调用 Qwen，Next.js 不接触 API Key。
- `ImageProvider`：接入万相图片同步接口；源图可使用 Base64；临时结果会下载到受控持久化目录。
- `VideoProvider`：创建一次异步任务，持久化 `task_id`，查询状态，不虚构百分比；`Idempotency-Key` 防止重复付费创建。
- `TTSProvider`：调用 Qwen TTS，并将临时音频下载为持久化文件。
- 每种 Provider 独立处理鉴权、超时、结果解析和错误；不自动重试付费请求。
- 400、401、402、403、404、429、503、504 被分类为参数、鉴权、结算、权限或免费额度、模型/端点、速率限制、服务异常和网关超时，不再混为“生成失败”。

### 成本与密钥安全

- 普通百炼 Key 只允许存在于 FastAPI `.env`；Next.js 仅访问 FastAPI。
- 不再仅凭 Key 前缀判断用途；服务端必须显式标记 `DASHSCOPE_API_KEY_KIND=application`，并以一次受控真实请求验证用途与权限。
- 文本、图片、视频、TTS 均有独立费用批准开关，默认全部为 `false`。
- 视频创建必须提供幂等键；失败后不会自动重复创建付费任务。
- `.gitignore` 已覆盖 `.env*`（保留示例文件）、数据库、上传、生成媒体、发布数据和日志。
- 当前工作区没有发现 Coding Plan Key；本地环境文件中存在既有 Gemini 凭据，未在报告或日志中输出。若该凭据曾外泄，应在对应控制台撤销并轮换。
- 当前目录不是 Git 仓库，因此无法检查提交历史中的历史泄露；只能完成当前工作区与压缩包内容扫描。

### 发布与二维码

- 新公开路由：`/s/[slug]`，无需登录，只读取已发布快照。
- 每个项目首次发布生成唯一 slug；重新发布更新快照和版本但不改变 slug，因此旧二维码继续有效。
- 发布、覆盖和取消发布均校验项目与所有者令牌。
- `PUBLIC_SITE_URL` 必须是公网 HTTPS，拒绝 localhost、127.0.0.1、私网 IP、带凭据 URL 和带路径伪域名。
- 发布前执行一次有超时的 DNS/TLS/HTTP 就绪探测，拒绝重定向和非成功响应；探测失败不会写入“发布成功”。
- 二维码输出为 512 px PNG，内容与公开 URL 完全一致，并支持重新生成显示、复制链接、下载和新窗口打开。

## 4. 自动化测试结果

| 测试轮次 | 命令 | 结果 |
|---|---|---|
| TypeScript | `npm run typecheck` | 通过 |
| Next.js 生产构建 | `npm run build` | 通过；Next.js 16.4.3；包含 `/s/[slug]` |
| 前端/领域测试 | `npm test` | 46/46 通过 |
| 后端 Provider/媒体测试 | 见下方 pytest 命令 | 23/23 通过 |
| 本地媒体验收 | `python scripts/verify-media.py` | 海报 1080×1440；MP4 310,672 bytes；完整解码通过 |
| 真实百炼最小调用 | 未执行 | 无普通 Key/Workspace，费用未批准 |
| 浏览器端到端 | 未完成 | 当前沙箱不能稳定连接其本机回环端口；不能把该限制写成产品成功 |
| 公网/手机/微信 | 未完成 | 缺少部署、域名、HTTPS 与真人网络环境 |

后端测试环境说明：项目 `.venv312` 已安装运行依赖但未包含 pytest。验收时仅把系统中的纯 Python pytest 运行器复制到 `test-results/pytest-runtime`，业务依赖仍来自 `.venv312`，没有联网安装或修改全局 Python。

## 5. VOID COFFEE 验收结果

已验证的组成部分：

1. 咖啡店需求可转为受控 BrandSpec，未知字段和任意脚本会被拒绝。
2. 标题、奶油白配色、布局修改可作为快照更新，其他字段保持不变，可撤销。
3. 用户上传产品图可以成为 Hero 资源；AI 图片失败不阻断网站。
4. 发布生命周期验证了唯一 slug、同 slug 重发、原二维码载荷不变、取消后不可访问。
5. 已实际生成 VOID COFFEE 海报和 FFmpeg MP4，并验证视频完整解码。

仍待完成的真实闭环：

1. 用用户提供的普通百炼 Key 对 `qwen3.8-flash` 做一次最小真实调用。
2. 部署 FastAPI、Next.js、数据库和持久化媒体到真实 HTTPS 域名。
3. 发布 VOID COFFEE，生成指向该域名的二维码。
4. 用中国大陆手机流量及微信扫码访问，修改后重新发布，再用原二维码复验。

## 6. 启动方式

### 前端

```powershell
cd C:\Users\asus\Desktop\1024opc
npm install
npm run dev
```

生产模式：

```powershell
npm run build
npm start
```

### 后端

```powershell
cd C:\Users\asus\Desktop\1024opc\integrations\hackathon-mvp\backend
.venv312\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8002
```

也可在项目根目录运行：

```powershell
npm run dev:backend
```

开发时先启动后端，再启动前端。前端 `AI_PROVIDER=bailian` 时通过 `MARKETING_BACKEND_URL` 访问后端。

### 后端 `.env` 必填项

```dotenv
DASHSCOPE_API_KEY=由用户填写的普通百炼_API_Key
DASHSCOPE_WORKSPACE_ID=同地域_Workspace_ID
DASHSCOPE_REGION=cn-beijing
# 如需覆盖，必须与上方地域完全一致
# DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/api/v1

BAILIAN_TEXT_MODEL=qwen3.8-flash
BAILIAN_IMAGE_MODEL=wan2.7-image
BAILIAN_VIDEO_I2V_MODEL=wan2.7-i2v
BAILIAN_VIDEO_T2V_MODEL=wan2.7-t2v
BAILIAN_TTS_MODEL=qwen-audio-3.1-tts-flash

BAILIAN_TEXT_COST_APPROVED=false
BAILIAN_IMAGE_COST_APPROVED=false
BAILIAN_VIDEO_COST_APPROVED=false
BAILIAN_TTS_COST_APPROVED=false
```

仅在用户核对费用、余额和模型权限后，逐项把相应开关改为 `true`。不要一次性开启所有媒体能力。

### 公网发布配置

```dotenv
PUBLIC_SITE_URL=https://真实域名
MORPHSITE_PUBLIC_PROBE=on
MORPHSITE_PUBLISH_DIR=持久化发布目录
```

未配置或探测失败时，发布接口应返回“未配置公网发布/公网地址不可用”，不会生成 localhost 二维码。

## 7. 测试命令

```powershell
cd C:\Users\asus\Desktop\1024opc
npm run typecheck
npm test
npm run build
python scripts\verify-media.py
```

后端 Provider 回归（在已安装 pytest 的标准开发环境中）：

```powershell
cd integrations\hackathon-mvp\backend
.venv312\Scripts\python.exe -m pytest `
  tests\test_bailian_provider.py `
  tests\test_google_genai.py `
  tests\test_local_marketing.py -q
```

## 8. 日志与排错

- Next 生产服务日志样例：`test-results/production-server.log`。
- VOID COFFEE 媒体验收：`test-results/coffee-acceptance/result.json`。
- FastAPI 默认写控制台日志；生产部署应由 systemd/Docker 收集到受限日志目录，禁止记录 Authorization header、API Key 或完整上游响应。
- 401：检查 Key 类型和地域；Coding Plan Key 不可使用。
- 403：检查 Workspace/模型权限和免费额度是否耗尽。
- 404：检查模型 ID、地域和端点是否匹配。
- 429：检查额度/限流/余额；不要盲目重试。
- 400：检查参数、输入格式、分辨率、时长和媒体 URL。
- 503/504：记录请求 ID 和阶段，允许用户稍后手动重试；付费视频任务先查旧 `task_id`，不要重建。

## 9. 待用户完成

1. 撤销任何已暴露的 Coding Plan Key；创建普通百炼业务 Key，并只写入后端 `.env`。
2. 确认 Key、Workspace ID、模型和 endpoint 属于同一地域。
3. 先只批准文本调用，完成一次 `qwen3.8-flash` 最小实测。
4. 图片、TTS、视频按成本从低到高逐项批准；视频只创建一次最小合理任务。
5. 选择部署路线：比赛阶段可评估阿里云香港；长期内地部署需先完成适用的 ICP 备案与合规手续。
6. 配置真实域名、HTTPS、持久数据库和对象存储；多实例生产环境应从本地 JSON/SQLite 升级到 PostgreSQL + 对象存储。
7. 用中国移动、联通、电信及微信内置浏览器完成真人扫码记录。

## 10. 中国大陆真人验收记录模板

| 日期/城市 | 运营商 | 终端/浏览器 | 首屏耗时 | 图片/CSS/JS | 交互 | 原二维码重发后 | 结果/截图 |
|---|---|---|---:|---|---|---|---|
| 待填写 | 中国移动 | 微信 | — | — | — | — | 待真人实测 |
| 待填写 | 中国联通 | Android Chrome | — | — | — | — | 待真人实测 |
| 待填写 | 中国电信 | iPhone Safari | — | — | — | — | 待真人实测 |

## 11. 官方接口依据

- 百炼 API Key：https://help.aliyun.com/zh/model-studio/get-api-key
- 万相图片：https://help.aliyun.com/zh/model-studio/wan-image-generation-and-editing-api-reference
- 图生视频：https://help.aliyun.com/zh/model-studio/image-to-video-general-api-reference
- Qwen TTS：https://help.aliyun.com/zh/model-studio/qwen-audio-tts-http-api

