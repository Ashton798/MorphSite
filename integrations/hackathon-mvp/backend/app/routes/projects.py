"""Unified MorphSite project, BrandSpec, conversation and output endpoints.

These endpoints are additive to the original /api/generations contract. They are
intended for Studio integrations and keep the BrandSpec JSON opaque to the
backend: the existing TypeScript BrandSpecSchema remains the rendering source
of truth, while the backend stores validated-size version snapshots.
"""
from __future__ import annotations

import json
import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.storage_service import storage_service
from ..models import (
    Asset,
    BrandSpecVersion,
    Conversation,
    ConversationMessage,
    GeneratedOutput,
    Project,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])
_ID = re.compile(r"^[a-f0-9]{32}$")


class ProjectCreate(BaseModel):
    name: str = Field(default="Untitled project", min_length=1, max_length=200)
    description: str = Field(default="", max_length=4000)


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: str
    active_brand_spec_version_id: str | None = None


class BrandSpecVersionCreate(BaseModel):
    spec_json: str = Field(min_length=2, max_length=2_500_000)
    prompt: str = Field(default="", max_length=2000)
    source: str = Field(default="studio", max_length=40)


class BrandSpecVersionResponse(BaseModel):
    id: str
    project_id: str
    version: int
    spec_json: str
    prompt: str
    source: str


class ConversationCreate(BaseModel):
    title: str = Field(default="Creative brief", min_length=1, max_length=200)


class MessageCreate(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str = Field(min_length=1, max_length=16_000)


class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str


class ConversationResponse(BaseModel):
    id: str
    project_id: str
    title: str


class OutputResponse(BaseModel):
    id: str
    project_id: str
    task_id: str | None
    kind: str
    url: str | None
    mime_type: str
    provider: str
    is_mock: bool


class AssetResponse(BaseModel):
    id: str
    project_id: str
    kind: str
    url: str | None
    mime_type: str
    original_name: str


def _require_project(project_id: str, db: Session) -> Project:
    if not _ID.fullmatch(project_id):
        raise HTTPException(status_code=400, detail="项目 ID 无效")
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    return project


@router.post("", response_model=ProjectResponse)
async def create_project(body: ProjectCreate, db: Session = Depends(get_db)):
    project = Project(name=body.name.strip(), description=body.description.strip())
    db.add(project)
    db.commit()
    db.refresh(project)
    return ProjectResponse.model_validate(project, from_attributes=True)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str, db: Session = Depends(get_db)):
    return ProjectResponse.model_validate(_require_project(project_id, db), from_attributes=True)


@router.post("/{project_id}/brand-specs", response_model=BrandSpecVersionResponse)
async def create_brand_spec_version(project_id: str, body: BrandSpecVersionCreate, db: Session = Depends(get_db)):
    project = _require_project(project_id, db)
    try:
        parsed = json.loads(body.spec_json)
    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="BrandSpec JSON 无效") from None
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=422, detail="BrandSpec 必须是 JSON 对象")
    last = db.scalar(select(func.max(BrandSpecVersion.version)).where(BrandSpecVersion.project_id == project.id)) or 0
    version = BrandSpecVersion(
        project_id=project.id,
        version=int(last) + 1,
        spec_json=body.spec_json,
        prompt=body.prompt,
        source=body.source,
    )
    db.add(version)
    db.flush()
    project.active_brand_spec_version_id = version.id
    db.commit()
    db.refresh(version)
    return BrandSpecVersionResponse.model_validate(version, from_attributes=True)


@router.get("/{project_id}/brand-specs", response_model=list[BrandSpecVersionResponse])
async def list_brand_spec_versions(project_id: str, db: Session = Depends(get_db)):
    project = _require_project(project_id, db)
    versions = db.scalars(
        select(BrandSpecVersion)
        .where(BrandSpecVersion.project_id == project.id)
        .order_by(BrandSpecVersion.version.desc())
    ).all()
    return [BrandSpecVersionResponse.model_validate(item, from_attributes=True) for item in versions]


@router.post("/{project_id}/conversations", response_model=ConversationResponse)
async def create_conversation(project_id: str, body: ConversationCreate, db: Session = Depends(get_db)):
    project = _require_project(project_id, db)
    conversation = Conversation(project_id=project.id, title=body.title.strip())
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return ConversationResponse.model_validate(conversation, from_attributes=True)


@router.get("/{project_id}/conversations", response_model=list[ConversationResponse])
async def list_conversations(project_id: str, db: Session = Depends(get_db)):
    project = _require_project(project_id, db)
    conversations = db.scalars(select(Conversation).where(Conversation.project_id == project.id).order_by(Conversation.created_at.desc())).all()
    return [ConversationResponse.model_validate(item, from_attributes=True) for item in conversations]


@router.get("/{project_id}/conversations/{conversation_id}/messages", response_model=list[MessageResponse])
async def list_messages(project_id: str, conversation_id: str, db: Session = Depends(get_db)):
    project = _require_project(project_id, db)
    if not _ID.fullmatch(conversation_id):
        raise HTTPException(status_code=400, detail="会话 ID 无效")
    conversation = db.get(Conversation, conversation_id)
    if conversation is None or conversation.project_id != project.id:
        raise HTTPException(status_code=404, detail="会话不存在")
    messages = db.scalars(select(ConversationMessage).where(ConversationMessage.conversation_id == conversation_id).order_by(ConversationMessage.created_at.asc())).all()
    return [MessageResponse.model_validate(item, from_attributes=True) for item in messages]


@router.post("/{project_id}/conversations/{conversation_id}/messages", response_model=MessageResponse)
async def add_message(project_id: str, conversation_id: str, body: MessageCreate, db: Session = Depends(get_db)):
    project = _require_project(project_id, db)
    if not _ID.fullmatch(conversation_id):
        raise HTTPException(status_code=400, detail="会话 ID 无效")
    conversation = db.get(Conversation, conversation_id)
    if conversation is None or conversation.project_id != project.id:
        raise HTTPException(status_code=404, detail="会话不存在")
    message = ConversationMessage(conversation_id=conversation.id, role=body.role, content=body.content)
    db.add(message)
    db.commit()
    db.refresh(message)
    return MessageResponse.model_validate(message, from_attributes=True)


@router.get("/{project_id}/assets", response_model=list[AssetResponse])
async def list_assets(project_id: str, db: Session = Depends(get_db)):
    project = _require_project(project_id, db)
    assets = db.scalars(
        select(Asset)
        .where(Asset.project_id == project.id)
        .order_by(Asset.created_at.desc())
    ).all()
    return [AssetResponse(id=item.id, project_id=item.project_id, kind=item.kind,
                          url=storage_service.public_url(item.path), mime_type=item.mime_type,
                          original_name=item.original_name) for item in assets]


@router.get("/{project_id}/outputs", response_model=list[OutputResponse])
async def list_outputs(project_id: str, db: Session = Depends(get_db)):
    project = _require_project(project_id, db)
    outputs = db.scalars(
        select(GeneratedOutput)
        .where(GeneratedOutput.project_id == project.id)
        .order_by(GeneratedOutput.created_at.desc())
    ).all()
    return [OutputResponse(id=item.id, project_id=item.project_id, task_id=item.task_id,
                           kind=item.kind, url=storage_service.public_url(item.path),
                           mime_type=item.mime_type, provider=item.provider,
                           is_mock=item.is_mock) for item in outputs]
