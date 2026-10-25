/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // 把 /api 请求代理到 FastAPI 后端，前端代码只用相对路径，不接触任何密钥
    const backend = process.env.BACKEND_URL || "http://localhost:8000";
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
