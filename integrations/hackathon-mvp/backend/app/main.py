"""宣传内容生成器 - FastAPI 后端入口。"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .database import init_db
from .routes import bailian, chat, files, generations, projects

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("数据库已初始化（%s）", settings.database_url)
    logger.info("Mock 模式：%s", "开启" if settings.mock_mode else "关闭")
    yield


app = FastAPI(title="宣传内容生成器", version="0.1.0", lifespan=lifespan)

# 开发环境允许前端跨域（生产可收紧为具体域名）
app.add_middleware(chat.ChatBodyLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    """把 FastAPI 默认的英文校验错误转为中文提示。"""
    for err in exc.errors():
        loc = err.get("loc", ())
        if "image" in loc or "images" in loc:
            return JSONResponse(status_code=422, content={"detail": "请先上传商品照片"})
    return JSONResponse(status_code=422, content={"detail": "请求参数有误，请检查填写内容"})


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "mock_mode": settings.mock_mode,
        "capabilities": {
            "text": settings.google_text_configured,
            "image": settings.google_image_configured,
            "video": settings.google_video_configured,
            "tts": settings.google_tts_configured,
            "ffmpeg": settings.ffmpeg_available,
            "bailian": {
                "credentials": settings.bailian_credentials_configured,
                "application_key": settings.bailian_key_is_application_key,
                "region": settings.dashscope_region,
                "text": settings.bailian_text_configured,
                "image": settings.bailian_image_configured,
                "video": settings.bailian_video_configured,
                "tts": settings.bailian_tts_configured,
            },
        },
    }


app.include_router(generations.router)
app.include_router(files.router)
app.include_router(chat.router)
app.include_router(projects.router)
app.include_router(bailian.router)
