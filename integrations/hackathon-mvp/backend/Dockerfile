FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg fonts-noto-cjk curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
RUN mkdir -p /app/data /app/uploads /app/outputs

ENV DATABASE_URL=sqlite:////app/data/promo.db \
    UPLOAD_DIR=/app/uploads \
    OUTPUT_DIR=/app/outputs \
    FONT_PATH=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc \
    FFMPEG_PATH=ffmpeg

EXPOSE 8002
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD curl -fsS http://127.0.0.1:8002/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002"]
