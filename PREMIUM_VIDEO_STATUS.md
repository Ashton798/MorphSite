# 真实产品发布短片接入

当前工作台视频模型：OpenAI Next 网关 doubao-seedance-2-5-260628。将其作为质量优先候选，尚未生成成片，不能宣称已验证为最佳模型。

真实协议探测：
- POST /v1/videos multipart veo3.1-pro 返回 model does not exist。
- Seedance 2.5 接受 JSON 请求形状：model、prompt、content(text + first_frame image_url)、duration=5、resolution=720p、generate_audio=true。
- 实际创建返回 HTTP 403，内嵌 insufficient_user_quota。未返回任务 ID，未得到成片。
- 通过完整 /api/brand/video 路由再次验证，前端得到明确额度不足提示。

实现：
- 网关视频适配器，服务端独立读取 .env.openai-next.local，密钥不进入前端。
- 复用持久化 ProviderTask 与 Idempotency-Key；查询原任务、下载最终文件，付费创建无自动重试。
- 工作台移除自动快速静态图片+配音交付，compatible 模式改为真正的视频模型调用。
- 请求原生声音；不使用 TTS 覆盖网关视频音轨。
- 镜头：微距材质与光线变化、真实环绕视差、完整产品揭幕；原创电子音效；保持参考产品包装颜色标识。

验证：生产构建通过；50 项前端测试通过；43 项原后端测试通过；新增 2 项视频协议模拟测试通过。

阻塞：平台视频上游额度不足。需要平台账号余额/渠道额度处理后才可生成并验收运动、产品一致性、时长与音轨。任务查询与最终下载协议目前仅模拟测试，等待成功的真实任务验证。
