# 可用真实视频模型

当前默认 grok-imagine-video，使用用户提供的 OpenAI Next API。根目录 Next.js 环境文件与后端 .env.openai-next.local 已同步，服务已重启。

真实测试：Veo 3.1 与 Sora 2 在 /v1/videos 返回模型不存在；Grok 返回 HTTP 200 与真实任务 ID，约 44 秒完成。

成片：/api/marketing/files/8919170d531e4cb5b8c418f2e236a8cb_bailian.mp4。
ffprobe: 5.041667 秒，H264 视频 + AAC 音频；音轨 mean_volume=-37dB、max_volume=-14.8dB，非静音。浏览器可加载播放。
抽帧显示玫瑰角度、花瓣层次与透视变化，是生成的动态画面。参考图带茎玫瑰被改成台座花头，产品结构保真不达标；已加强完整产品轮廓、不删部件约束，新约束尚未另行付费验证。

适配器真实查询成功并成功下载结果；支持非 Seedance 模型 duration 字符串。下载只允许 HTTPS，精确放行实测结果 CDN 以兼容本机代理合成 DNS。
生产构建与两项视频协议测试通过。任务记录已持久化，查询原任务不重复付费。
