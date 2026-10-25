# OpenAI Next 接入状态

服务端 .env.local / .env.production.local 当前配置为 compatible 网关。配置文件中的 Key 未输出到聊天或前端。backend/.env.openai-next.local 同步保存了相同配置，作为填写副本；运行时 Next.js 读取项目根目录环境文件。

真实验证：
- /v1/models HTTP 200。
- Gemini 2.5 Flash 图像识别 HTTP 200，约 3.5 秒，正确识别粉色玫瑰与绿色花茎。
- 千问 qwen3-vl-flash 本次 HTTP 404；豆包 lite 本次多模态请求 HTTP 400。没有把模型列表视为调用成功。
- gpt-image-1.5 /v1/images/edits 真实参考图编辑 HTTP 200，约 37 秒；输出 test-results/next-image-edit.png。
- 网站生成接口 HTTP 200，约 8.7 秒；携带参考图修改产品展示段落 HTTP 200、changed=true。

实现：
- 图片生成带上传图时走 multipart /v1/images/edits，原图优化失败不会静默改成纯文字生图。
- 网站生成支持模型按产品生成七项配色与三种布局选择；用户明确指定产品优先等布局时确定性优先执行。
- 现有网站对话修改可携带产品图；主视觉再生成也保留上传参考图。
- 优化图片、精修、换背景被识别为媒体修改，避免误建新产品。
- compatible 网关模式视频使用 5 秒 FFmpeg 图像合成和已验证的百炼 TTS；本次尚未验证网关 Seedance 视频协议。
- SQLite 连接等待时间调整到 30 秒，缓解图片、视频、作品存档同时写入的锁冲突。

限制：网站仍由六种受控区块组成，未实现任意 HTML 自由生成；模型可以改变内容、布局与配色。包装、标识一致性仍需对具体产品视觉验收。配音继续由百炼提供。
