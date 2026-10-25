"""数据库连接：默认 SQLite，切换 PostgreSQL 只需修改 DATABASE_URL。"""
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings, BACKEND_DIR

# Resolve relative SQLite paths consistently, regardless of the launch directory.
database_url = make_url(settings.database_url)
engine_kwargs: dict = {}
if database_url.get_backend_name() == "sqlite":
    engine_kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}
    if database_url.database and database_url.database != ":memory:":
        db_path = Path(database_url.database)
        if not db_path.is_absolute():
            db_path = BACKEND_DIR / db_path
        db_path.parent.mkdir(parents=True, exist_ok=True)
        database_url = database_url.set(database=str(db_path))

engine = create_engine(database_url, **engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from . import models  # noqa: F401  确保模型已注册

    Base.metadata.create_all(bind=engine)
    _ensure_columns()


def _ensure_columns() -> None:
    """轻量迁移：给已存在的旧表补新列（create_all 不会修改已有表）。
    正式项目建议改用 Alembic。"""
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    if "generation_tasks" not in insp.get_table_names():
        return
    existing = {c["name"] for c in insp.get_columns("generation_tasks")}
    # The backend field is optional for legacy SQLite databases; use a
    # short transaction and explicit defaults so old rows remain readable.
    additions = {
        "project_id": "VARCHAR(32)",
        "model_id": "VARCHAR(100) DEFAULT 'mock'",
        "poster_model": "VARCHAR(100)",
        "video_mode": "VARCHAR(30) DEFAULT 'local'",
        "video_model": "VARCHAR(100)",
        "audio_mode": "VARCHAR(30) DEFAULT 'none'",
        "voiceover": "BOOLEAN DEFAULT 0",
        "brand_spec_json": "TEXT",
        "audio_path": "VARCHAR(500)",
    }
    with engine.begin() as conn:
        for name, definition in additions.items():
            if name not in existing:
                conn.execute(text(f"ALTER TABLE generation_tasks ADD COLUMN {name} {definition}"))
