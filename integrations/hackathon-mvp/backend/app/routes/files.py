"""文件访问接口：提供生成结果（海报/视频）与上传原图的下载。"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from ..services.storage_service import storage_service

router = APIRouter(prefix="/api/files", tags=["files"])

_MEDIA_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".wav": "audio/wav",
}


@router.get("/{filename}")
async def get_file(filename: str):
    path = storage_service.resolve_public_file(filename)
    if path is None:
        raise HTTPException(status_code=404, detail="文件不存在或已被清理")
    media_type = _MEDIA_TYPES.get(path.suffix.lower(), "application/octet-stream")
    return FileResponse(path, media_type=media_type, filename=path.name)
