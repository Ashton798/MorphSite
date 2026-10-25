"""SQLAlchemy models for the compatible marketing task layer and the unified
MorphSite project/output records.

The original ``GenerationTask`` table remains the source of truth for existing
clients.  The additional records are additive: old tasks continue to work and
new Studio clients can attach project, BrandSpec and output metadata without
changing the existing BrandSpec contract.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_id() -> str:
    return uuid.uuid4().hex


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    name: Mapped[str] = mapped_column(String(200), default="Untitled project")
    description: Mapped[str] = mapped_column(Text, default="")
    active_brand_spec_version_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class BrandSpecVersion(Base):
    __tablename__ = "brand_spec_versions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    project_id: Mapped[str] = mapped_column(String(32), ForeignKey("projects.id"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    spec_json: Mapped[str] = mapped_column(Text)
    prompt: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(40), default="studio")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    project_id: Mapped[str] = mapped_column(String(32), ForeignKey("projects.id"), index=True)
    title: Mapped[str] = mapped_column(String(200), default="Creative brief")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    conversation_id: Mapped[str] = mapped_column(String(32), ForeignKey("conversations.id"), index=True)
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    project_id: Mapped[str] = mapped_column(String(32), ForeignKey("projects.id"), index=True)
    kind: Mapped[str] = mapped_column(String(30), default="image")
    path: Mapped[str] = mapped_column(Text)
    mime_type: Mapped[str] = mapped_column(String(100), default="application/octet-stream")
    original_name: Mapped[str] = mapped_column(String(255), default="asset")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class GeneratedOutput(Base):
    __tablename__ = "generated_outputs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    project_id: Mapped[str] = mapped_column(String(32), ForeignKey("projects.id"), index=True)
    task_id: Mapped[str | None] = mapped_column(String(32), ForeignKey("generation_tasks.id"), nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(30))
    path: Mapped[str | None] = mapped_column(Text, nullable=True)
    mime_type: Mapped[str] = mapped_column(String(100), default="application/octet-stream")
    provider: Mapped[str] = mapped_column(String(80), default="local-template")
    is_mock: Mapped[bool] = mapped_column(default=True)
    metadata_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ProviderTask(Base):
    """Durable mapping for one paid asynchronous provider invocation."""
    __tablename__ = "provider_tasks"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    idempotency_key: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    provider: Mapped[str] = mapped_column(String(40), default="bailian")
    kind: Mapped[str] = mapped_column(String(30))
    model: Mapped[str] = mapped_column(String(100))
    external_task_id: Mapped[str | None] = mapped_column(String(128), nullable=True, unique=True)
    status: Mapped[str] = mapped_column(String(20), default="creating")
    stage: Mapped[str] = mapped_column(String(30), default="creating")
    source_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    output_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class GenerationTask(Base):
    __tablename__ = "generation_tasks"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    project_id: Mapped[str | None] = mapped_column(String(32), ForeignKey("projects.id"), nullable=True, index=True)
    product_name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    style: Mapped[str] = mapped_column(String(50))
    platform: Mapped[str] = mapped_column(String(50))
    poster_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    video_mode: Mapped[str] = mapped_column(String(30), default="local")
    video_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    audio_mode: Mapped[str] = mapped_column(String(30), default="none")
    voiceover: Mapped[bool] = mapped_column(default=False)
    brand_spec_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 用户选择的文案模型 id（mock / default / google-gemini / models.json 中的自定义 id）
    model_id: Mapped[str] = mapped_column(String(100), default="mock")

    # 原图路径：JSON 数组字符串（支持多张，第一张为主图）
    source_image_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    poster_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    video_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    audio_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # 文案以 JSON 字符串存储（SQLite 兼容；PostgreSQL 可改为 JSONB）
    copy_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending/processing/completed/failed
    stage: Mapped[str] = mapped_column(String(20), default="analysis")  # analysis/copywriting/poster/video/completed
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
