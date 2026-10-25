# MorphSite 完整部署包

这是 MorphSite 的本机可部署源码包，包含 Next.js 前端、FastAPI 营销素材后端、API 路由、生成流程、数据库初始化代码和媒体目录结构。

## 环境要求

- Windows 10/11
- Node.js 20.9 或更高版本
- Python 3.12
- FFmpeg，并加入 PATH
- 可用的模型服务 Key（没有 Key 也可以启动本地 Demo 模式）

## 快速启动

1. 复制 `.env.example` 为 `.env.local`，填写前端需要的模型配置。
2. 复制 `integrations/hackathon-mvp/backend/.env.example` 为 `integrations/hackathon-mvp/backend/.env`，填写营销素材后端配置。
3. 双击 `INSTALL-WINDOWS.ps1`，安装 Node 和 Python 依赖。
4. 双击 `START-MORPHSITE.ps1`。
5. 打开 `http://localhost:3000`，工作台地址为 `http://localhost:3000/studio`。

首次启动可能需要几分钟下载依赖。脚本不会自动上传或公开任何文件。

## 配置说明

服务端密钥只放在 `.env.local` 和 `integrations/hackathon-mvp/backend/.env`，不要使用 `NEXT_PUBLIC_` 前缀，也不要把这两个文件上传到公共仓库或 WordPress 媒体库。

`MORPHSITE_AI=off` 可以在没有 Key 时运行确定性本地演示。要使用真实生成能力，需要按 `.env.example` 和后端 `.env.example` 配置对应供应商，并打开相应的成本授权开关。

## 启动结构

- 前端：Next.js `http://127.0.0.1:3000`
- 营销后端：FastAPI `http://127.0.0.1:8002`
- 数据库：后端目录下的 SQLite `data/promo.db`
- 上传文件：`integrations/hackathon-mvp/uploads/`
- 生成结果：`integrations/hackathon-mvp/outputs/`

## 生产部署

本包可以部署到一台 Windows/Linux 服务器，但需要单独配置域名、HTTPS、持久化磁盘、反向代理和环境变量。WordPress 不能直接运行 Next.js 和 FastAPI；如果要接入 WordPress，应把 MorphSite 部署到独立 Node/Python 服务，再在 WordPress 中使用链接、iframe 或反向代理接入。不要把 API Key 放进 WordPress 前端代码。
