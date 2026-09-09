import os
import json
import uuid
import time
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException, Request, Depends, Response, status, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from sqlalchemy.orm import Session

import database
import models
import auth
import rag_engine
import groq_client
import models_config

load_dotenv()

# Initialize Database tables
try:
    database.init_db()
except Exception as db_err:
    print(f"Database initialization note: {db_err}")

app = FastAPI(
    title="OmniAI Doubt-Solving Platform API",
    description="Production-Ready Multi-User AI Learning Platform with FastAPI, Groq SSE Streaming, pgvector RAG, and Visual Doubt Generation",
    version="2.2.0",
)

# Robust CORS Configuration
raw_origins = os.getenv("ALLOWED_ORIGINS") or os.getenv("FRONTEND_URL") or "http://localhost:3000,http://127.0.0.1:3000"
allowed_origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
# Always include local dev + Firebase production hosting URLs
for default_origin in [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "https://chatgpt-app-1c53a.web.app",
    "https://chatgpt-app-1c53a.firebaseapp.com",
]:
    if default_origin not in allowed_origins:
        allowed_origins.append(default_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https://chatgpt-app-1c53a\.(web|firebaseapp)\.app|http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Model list is now managed in models_config.py — do not edit here.

# Schemas
class UserRegister(BaseModel):
    email: str
    password: str
    fullName: Optional[str] = ""
    remember_me: Optional[bool] = True

class UserLogin(BaseModel):
    email: str
    password: str
    remember_me: Optional[bool] = True

class UserGoogleAuth(BaseModel):
    email: str
    fullName: Optional[str] = ""
    uid: Optional[str] = None
    photoURL: Optional[str] = None
    idToken: Optional[str] = None
    remember_me: Optional[bool] = True

class PasswordReset(BaseModel):
    oldPassword: str
    newPassword: str

class ChatStreamRequest(BaseModel):
    message: Optional[str] = None
    prompt: Optional[str] = None
    sessionId: Optional[str] = None
    # model_id is the new canonical field; "model" kept for backward compatibility
    model_id: Optional[str] = None
    model: Optional[str] = None
    customEndpoint: Optional[str] = None
    documentId: Optional[str] = None
    imageUrl: Optional[str] = None
    history: Optional[List[Any]] = None
    messages: Optional[List[Dict[str, Any]]] = None

class CreateSessionRequest(BaseModel):
    title: Optional[str] = "New Doubt Session"
    model: Optional[str] = None  # defaults to models_config.get_default_model_id()

# System Endpoints
@app.get("/")
@app.get("/health")
@app.get("/api/health")
def read_root():
    return {
        "status": "online",
        "service": "OmniAI Doubt-Solving API",
        "version": "2.2.0",
        "db": "Connected (pgvector & SQLite supported)",
    }

@app.get("/api/models")
def get_models():
    """Returns the live-verified model list. Safe to expose — no API keys included."""
    return {"models": models_config.public_model_list()}

# Authentication Endpoints with 30-Day Persistent Remember-Me
@app.post("/api/auth/register")
@app.post("/api/auth/signup")
def register_user(payload: UserRegister, response: Response, db: Session = Depends(database.get_db)):
    if not payload.email or not payload.password:
        raise HTTPException(status_code=400, detail="Email and password are required")
    
    clean_email = payload.email.lower().strip()
    existing = db.query(models.DBUser).filter(models.DBUser.email == clean_email).first()
    if existing:
        raise HTTPException(status_code=400, detail="User with this email already exists")
    
    hashed_pwd = auth.hash_password(payload.password)
    user = models.DBUser(
        email=clean_email,
        hashed_password=hashed_pwd,
        full_name=payload.fullName or "",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    remember_flag = True if payload.remember_me is None else payload.remember_me
    token, expire_mins = auth.create_access_token(
        {"sub": user.email, "id": user.id},
        remember_me=remember_flag
    )
    
    max_age_secs = expire_mins * 60
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        max_age=max_age_secs,
        samesite="lax",
        secure=False,
    )
    response.set_cookie(
        key="omniai_token",
        value=token,
        httponly=False,
        max_age=max_age_secs,
        samesite="lax",
        secure=False,
    )

    return {
        "message": "Registration successful",
        "token": token,
        "expiresIn": max_age_secs,
        "user": {"id": user.id, "email": user.email, "fullName": user.full_name},
    }

@app.post("/api/auth/login")
def login_user(payload: UserLogin, response: Response, db: Session = Depends(database.get_db)):
    clean_email = payload.email.lower().strip()
    user = db.query(models.DBUser).filter(models.DBUser.email == clean_email).first()
    if not user or not auth.verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    remember_flag = True if payload.remember_me is None else payload.remember_me
    token, expire_mins = auth.create_access_token(
        {"sub": user.email, "id": user.id},
        remember_me=remember_flag
    )
    
    max_age_secs = expire_mins * 60
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        max_age=max_age_secs,
        samesite="lax",
        secure=False,
    )
    response.set_cookie(
        key="omniai_token",
        value=token,
        httponly=False,
        max_age=max_age_secs,
        samesite="lax",
        secure=False,
    )

    return {
        "message": "Login successful",
        "token": token,
        "expiresIn": max_age_secs,
        "user": {"id": user.id, "email": user.email, "fullName": user.full_name},
    }

@app.post("/api/auth/google")
def google_auth_user(payload: UserGoogleAuth, response: Response, db: Session = Depends(database.get_db)):
    if not payload.email:
        raise HTTPException(status_code=400, detail="Google email is required")
    
    clean_email = payload.email.lower().strip()
    user = db.query(models.DBUser).filter(models.DBUser.email == clean_email).first()
    
    if not user:
        # Auto-create user account on first Google Sign-In
        random_pwd = hashlib.sha256((clean_email + str(payload.uid or "google_auth")).encode("utf-8")).hexdigest()
        hashed_pwd = auth.hash_password(random_pwd)
        user = models.DBUser(
            email=clean_email,
            hashed_password=hashed_pwd,
            full_name=payload.fullName or clean_email.split("@")[0],
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    elif payload.fullName and not user.full_name:
        user.full_name = payload.fullName
        db.commit()
        db.refresh(user)
        
    remember_flag = True if payload.remember_me is None else payload.remember_me
    token, expire_mins = auth.create_access_token(
        {"sub": user.email, "id": user.id},
        remember_me=remember_flag
    )
    
    max_age_secs = expire_mins * 60
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        max_age=max_age_secs,
        samesite="lax",
        secure=False,
    )
    response.set_cookie(
        key="omniai_token",
        value=token,
        httponly=False,
        max_age=max_age_secs,
        samesite="lax",
        secure=False,
    )

    return {
        "message": "Google authentication successful",
        "token": token,
        "expiresIn": max_age_secs,
        "user": {"id": user.id, "email": user.email, "fullName": user.full_name},
    }

@app.post("/api/auth/logout")
def logout_user(response: Response):
    for c in ["access_token", "omniai_token", "token"]:
        response.delete_cookie(key=c, path="/")
    return {"message": "Logged out successfully"}

@app.get("/api/auth/me")
def get_me(current_user: models.DBUser = Depends(auth.get_current_user)):
    return {
        "user": {
            "id": current_user.id,
            "email": current_user.email,
            "fullName": current_user.full_name,
        }
    }

@app.post("/api/auth/reset-password")
def reset_password(
    payload: PasswordReset,
    current_user: models.DBUser = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    if not auth.verify_password(payload.oldPassword, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(payload.newPassword) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
        
    current_user.hashed_password = auth.hash_password(payload.newPassword)
    db.commit()
    return {"message": "Password updated successfully"}

# Sessions Endpoints
@app.get("/api/chat/sessions")
def get_chat_sessions(
    current_user: Optional[models.DBUser] = Depends(auth.get_optional_current_user),
    db: Session = Depends(database.get_db),
):
    user_id = current_user.id if current_user else None
    query = db.query(models.DBChatSession)
    if user_id:
        query = query.filter(models.DBChatSession.user_id == user_id)
    else:
        query = query.filter(models.DBChatSession.user_id == None)
        
    sessions = query.order_by(models.DBChatSession.created_at.desc()).limit(50).all()
    return {
        "sessions": [
            {
                "id": s.id,
                "title": s.title,
                "model": s.model,
                "created_at": s.created_at,
            }
            for s in sessions
        ]
    }

@app.post("/api/chat/sessions")
def create_session(
    payload: CreateSessionRequest,
    current_user: Optional[models.DBUser] = Depends(auth.get_optional_current_user),
    db: Session = Depends(database.get_db),
):
    sess_id = f"sess_{uuid.uuid4().hex[:12]}"
    # Validate requested model or fall back to default
    requested_model = payload.model
    if requested_model and not models_config.get_model_by_id(requested_model):
        requested_model = models_config.get_default_model_id()
    new_sess = models.DBChatSession(
        id=sess_id,
        user_id=current_user.id if current_user else None,
        title=payload.title or "New Doubt Session",
        model=requested_model or models_config.get_default_model_id(),
        created_at=time.time(),
    )
    db.add(new_sess)
    db.commit()
    db.refresh(new_sess)
    return {"session": {"id": new_sess.id, "title": new_sess.title, "model": new_sess.model}}

@app.get("/api/chat/sessions/{session_id}/messages")
def get_session_messages(
    session_id: str,
    db: Session = Depends(database.get_db),
):
    msgs = (
        db.query(models.DBChatMessage)
        .filter(models.DBChatMessage.session_id == session_id)
        .order_by(models.DBChatMessage.timestamp.asc())
        .all()
    )
    return {
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "files": json.loads(m.files_json) if m.files_json else [],
                "timestamp": m.timestamp,
            }
            for m in msgs
        ]
    }

@app.delete("/api/chat/sessions/{session_id}")
def delete_session(
    session_id: str,
    current_user: Optional[models.DBUser] = Depends(auth.get_optional_current_user),
    db: Session = Depends(database.get_db),
):
    query = db.query(models.DBChatSession).filter(models.DBChatSession.id == session_id)
    if current_user:
        query = query.filter(models.DBChatSession.user_id == current_user.id)
    session = query.first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(session)
    db.commit()
    return {"message": "Session deleted"}

# Document Upload & RAG Pipeline
@app.post("/api/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    current_user: Optional[models.DBUser] = Depends(auth.get_optional_current_user),
    db: Session = Depends(database.get_db),
):
    try:
        file_bytes = await file.read()
        filename = file.filename or "uploaded_file"
        file_size = len(file_bytes)
        
        extracted_text, page_count, doc_type = rag_engine.parse_document_file(filename, file_bytes)
        
        doc_id = f"doc_{uuid.uuid4().hex[:12]}"
        db_doc = models.DBDocument(
            id=doc_id,
            user_id=current_user.id if current_user else None,
            filename=filename,
            file_type=doc_type,
            file_size=file_size,
            page_count=page_count,
            extracted_text=extracted_text[:100000],
            created_at=time.time(),
        )
        db.add(db_doc)
        
        raw_chunks = rag_engine.chunk_text(extracted_text, chunk_size=800, overlap=150)
        for idx, c in enumerate(raw_chunks):
            embedding_vec = rag_engine.generate_embedding(c["content"])
            chunk_row = models.DBDocumentChunk(
                id=c["id"],
                document_id=doc_id,
                chunk_index=idx,
                content=c["content"],
                metadata_json=json.dumps(c.get("metadata", {})),
                embedding_json=json.dumps(embedding_vec),
            )
            db.add(chunk_row)
            
        db.commit()
        db.refresh(db_doc)

        return {
            "document": {
                "id": db_doc.id,
                "filename": db_doc.filename,
                "fileType": db_doc.file_type,
                "fileSize": db_doc.file_size,
                "pageCount": db_doc.page_count,
                "chunkCount": len(raw_chunks),
                "previewSnippet": extracted_text[:300],
            }
        }
    except Exception as err:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Document processing failed: {str(err)}")

@app.get("/api/documents/{document_id}")
def get_document_details(
    document_id: str,
    db: Session = Depends(database.get_db),
):
    doc = db.query(models.DBDocument).filter(models.DBDocument.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    chunks = db.query(models.DBDocumentChunk).filter(models.DBDocumentChunk.document_id == document_id).all()
    return {
        "document": {
            "id": doc.id,
            "filename": doc.filename,
            "fileType": doc.file_type,
            "fileSize": doc.file_size,
            "pageCount": doc.page_count,
            "extractedText": doc.extracted_text,
            "chunks": [
                {
                    "id": ch.id,
                    "index": ch.chunk_index,
                    "content": ch.content,
                    "metadata": json.loads(ch.metadata_json) if ch.metadata_json else {},
                }
                for ch in chunks
            ]
        }
    }

# Dynamic Groq Chat Streaming Endpoint with RAG + SSE + Model Switcher
@app.post("/api/chat/stream")
async def chat_stream_endpoint(
    req: ChatStreamRequest,
    current_user: Optional[models.DBUser] = Depends(auth.get_optional_current_user),
    db: Session = Depends(database.get_db),
):
    """
    Real-time Groq LLM SSE stream with model validation and single-hop fallback.

    Request body fields:
      model_id  : preferred model (validated against models_config; new canonical field)
      model     : legacy alias for model_id (still accepted for backward compat)

    SSE event stream:
      First event : {"sessionId": "...", "model_used": "...", "fallback_triggered": bool,
                     "original_model": "..." (only when fallback_triggered is True)}
      Content     : {"content": "<delta>", "chunk": "<delta>"}
      Final       : [DONE]
    """
    # ── 1. Resolve and validate model_id ────────────────────────────────────────
    # Accept either model_id (new) or model (legacy); model_id takes precedence.
    raw_model_id = (req.model_id or req.model or "").strip()
    requested_cfg = models_config.get_model_by_id(raw_model_id) if raw_model_id else None

    if not requested_cfg:
        # Unknown or missing model_id — fall back to default silently
        requested_cfg = models_config.get_model_by_id(models_config.get_default_model_id())

    resolved_model_id: str = requested_cfg["id"]  # type: ignore[index]
    fallback_triggered = False
    original_model_id: Optional[str] = None

    # ── 2. Determine user prompt ─────────────────────────────────────────────────
    user_prompt = ""
    if req.prompt and req.prompt.strip():
        user_prompt = req.prompt.strip()
    elif req.message and req.message.strip():
        user_prompt = req.message.strip()
    elif req.messages and len(req.messages) > 0:
        last_msg = req.messages[-1]
        user_prompt = last_msg.get("content", "").strip()

    if not user_prompt:
        raise HTTPException(status_code=400, detail="Missing user prompt or message")

    # ── 3. Create session if needed ──────────────────────────────────────────────
    session_id = req.sessionId
    if not session_id:
        session_id = f"sess_{uuid.uuid4().hex[:12]}"
        title = user_prompt[:35]
        new_sess = models.DBChatSession(
            id=session_id,
            user_id=current_user.id if current_user else None,
            title=title,
            model=resolved_model_id,
        )
        db.add(new_sess)
        db.commit()

    # ── 4. RAG Context Retrieval ─────────────────────────────────────────────────
    rag_context_text = ""
    if req.documentId:
        try:
            chunks = (
                db.query(models.DBDocumentChunk)
                .filter(models.DBDocumentChunk.document_id == req.documentId)
                .all()
            )
            chunk_dicts = [
                {
                    "id": ch.id,
                    "content": ch.content,
                    "embedding_json": ch.embedding_json,
                    "metadata": json.loads(ch.metadata_json) if ch.metadata_json else {}
                }
                for ch in chunks
            ]
            top_chunks = rag_engine.retrieve_top_k_chunks(user_prompt, chunk_dicts, k=3)
            if top_chunks:
                rag_snippets = []
                for tc in top_chunks:
                    p = tc.get("metadata", {}).get("page", 1)
                    rag_snippets.append(f"[Reference Page {p}]:\n{tc['content']}")
                rag_context_text = "\n\n=== RETRIEVED DOCUMENT CONTEXT ===\n" + "\n\n".join(rag_snippets) + "\n==================================\n"
        except Exception as rag_err:
            print(f"RAG retrieval warning: {rag_err}")

    # ── 5. Assemble message history ──────────────────────────────────────────────
    prepared_messages: List[Dict[str, Any]] = []

    if req.messages and len(req.messages) > 1:
        for m in req.messages[:-1]:
            prepared_messages.append({"role": m.get("role", "user"), "content": m.get("content", "")})
    elif req.history:
        for h in req.history[-6:]:
            if isinstance(h, dict):
                prepared_messages.append({"role": h.get("role", "user"), "content": h.get("content", "")})
            elif hasattr(h, "role") and hasattr(h, "content"):
                prepared_messages.append({"role": h.role, "content": h.content})

    effective_query = user_prompt
    if rag_context_text:
        effective_query = f"{rag_context_text}\nUser Question/Doubt: {user_prompt}"

    prepared_messages.append({"role": "user", "content": effective_query})

    # ── 6. Save user message ─────────────────────────────────────────────────────
    try:
        user_msg_id = f"msg_{uuid.uuid4().hex[:12]}"
        db_user_msg = models.DBChatMessage(
            id=user_msg_id,
            session_id=session_id,
            role="user",
            content=user_prompt,
            timestamp=time.time(),
        )
        db.add(db_user_msg)
        db.commit()
    except Exception as save_err:
        db.rollback()
        print(f"User message save warning: {save_err}")

    # ── 7. Resolve actual model (with single-hop fallback on error) ──────────────
    #
    # Strategy: try the requested model. If the first SSE chunk we receive back
    # is an error payload with code RATE_LIMIT_429 / GROQ_SERVER_ERROR_* / TIMEOUT,
    # we swap to the next model in the fallback chain and restart the stream.
    # Max one fallback hop. Auth checks are fully preserved throughout.
    #
    # We implement this by wrapping the generator: we buffer the first real content
    # chunk. If it's an error code we care about we can restart; otherwise we
    # relay the buffer and continue. Because SSE is push-only and we cannot
    # "un-send" already-written bytes, the fallback must be decided BEFORE we
    # begin yielding to the client. We therefore do a non-streaming probe for the
    # fallback decision only when the model's first response is a fatal error code.

    _model_cfg = requested_cfg
    _model_used = resolved_model_id
    _fallback_triggered = False
    _original_model_id: Optional[str] = None

    async def sse_event_generator():
        nonlocal _model_cfg, _model_used, _fallback_triggered, _original_model_id

        collected_chunks: List[str] = []
        emitted_done = False

        # Buffer first error to decide on fallback before emitting to client
        # We collect ALL sse events from the primary model into a small look-ahead
        # buffer. If it turns out to be a retriable error, we swap model and restart.
        primary_events: List[str] = []
        primary_error_code: Optional[str] = None
        primary_got_content = False

        # --- Probe-style: collect first batch of SSE events from primary model ---
        try:
            async for sse_chunk in groq_client.stream_groq_chat(
                messages=prepared_messages,
                model=_model_cfg["id"],
                has_image=bool(req.imageUrl),
                image_url=req.imageUrl,
                custom_endpoint=req.customEndpoint,
                is_reasoning_model=_model_cfg.get("reasoning", False),
                model_used=_model_cfg["id"],
            ):
                primary_events.append(sse_chunk)
                if sse_chunk.startswith("data: "):
                    data_part = sse_chunk[6:].strip()
                    if data_part != "[DONE]":
                        try:
                            parsed = json.loads(data_part)
                            if parsed.get("error") and not parsed.get("content"):
                                primary_error_code = parsed.get("error", "")
                            elif parsed.get("content") or parsed.get("chunk"):
                                primary_got_content = True
                                break  # Got real content — no fallback needed; stream remaining
                        except Exception:
                            pass
                    elif data_part == "[DONE]":
                        break
        except Exception as probe_err:
            primary_error_code = str(probe_err)

        # --- Decide: fallback or continue with primary? ---
        retriable_codes = ("RATE_LIMIT_429", "TIMEOUT", "CONNECT_ERROR")
        need_fallback = (
            not primary_got_content
            and primary_error_code is not None
            and any(code in str(primary_error_code) for code in retriable_codes)
        )

        if need_fallback:
            fallback_cfg = models_config.get_fallback_model(_model_cfg["id"])
            if fallback_cfg:
                _original_model_id = _model_cfg["id"]
                _model_cfg = fallback_cfg
                _model_used = fallback_cfg["id"]
                _fallback_triggered = True
                primary_events = []  # discard primary error events
                primary_got_content = False
                # Re-run stream with fallback model
                try:
                    async for sse_chunk in groq_client.stream_groq_chat(
                        messages=prepared_messages,
                        model=_model_cfg["id"],
                        has_image=bool(req.imageUrl),
                        image_url=req.imageUrl,
                        custom_endpoint=req.customEndpoint,
                        is_reasoning_model=_model_cfg.get("reasoning", False),
                        model_used=_model_cfg["id"],
                        fallback_triggered=True,
                        original_model=_original_model_id,
                    ):
                        primary_events.append(sse_chunk)
                        if sse_chunk.startswith("data: "):
                            data_part = sse_chunk[6:].strip()
                            if data_part != "[DONE]":
                                try:
                                    parsed = json.loads(data_part)
                                    if parsed.get("content") or parsed.get("chunk"):
                                        primary_got_content = True
                                        break
                                except Exception:
                                    pass
                            elif data_part == "[DONE]":
                                break
                except Exception as fb_err:
                    print(f"Fallback stream error: {fb_err}")

        # --- Emit metadata event first ---
        meta: Dict[str, Any] = {
            "sessionId": session_id,
            "model_used": _model_used,
            "fallback_triggered": _fallback_triggered,
        }
        if _fallback_triggered and _original_model_id:
            meta["original_model"] = _original_model_id
        yield f"data: {json.dumps(meta)}\n\n"

        # --- Relay buffered events ---
        for sse_chunk in primary_events:
            yield sse_chunk
            if sse_chunk.startswith("data: "):
                data_part = sse_chunk[6:].strip()
                if data_part == "[DONE]":
                    emitted_done = True
                else:
                    try:
                        payload = json.loads(data_part)
                        delta = payload.get("content") or payload.get("chunk")
                        if delta:
                            collected_chunks.append(delta)
                    except Exception:
                        pass

        if emitted_done:
            pass  # Already done from buffer
        else:
            # Continue streaming remaining chunks from the chosen model
            try:
                async for sse_chunk in groq_client.stream_groq_chat(
                    messages=prepared_messages,
                    model=_model_cfg["id"],
                    has_image=bool(req.imageUrl),
                    image_url=req.imageUrl,
                    custom_endpoint=req.customEndpoint,
                    is_reasoning_model=_model_cfg.get("reasoning", False),
                    model_used=_model_cfg["id"],
                    fallback_triggered=_fallback_triggered,
                    original_model=_original_model_id,
                ):
                    yield sse_chunk
                    if sse_chunk.startswith("data: "):
                        data_part = sse_chunk[6:].strip()
                        if data_part == "[DONE]":
                            emitted_done = True
                        else:
                            try:
                                payload = json.loads(data_part)
                                delta = payload.get("content") or payload.get("chunk")
                                if delta:
                                    collected_chunks.append(delta)
                            except Exception:
                                pass
            except Exception as stream_err:
                print(f"SSE continuation stream error: {stream_err}")
                err_payload = f"⚠️ Streaming interrupted: {str(stream_err)}"
                yield f"data: {json.dumps({'content': err_payload, 'chunk': err_payload, 'error': str(stream_err)})}\n\n"

        if not emitted_done:
            yield "data: [DONE]\n\n"

        # --- Save full assistant response to database ---
        full_response = "".join(collected_chunks).strip()
        if full_response:
            try:
                with database.SessionLocal.context() as local_db:
                    asst_msg_id = f"msg_{uuid.uuid4().hex[:12]}"
                    db_asst_msg = models.DBChatMessage(
                        id=asst_msg_id,
                        session_id=session_id,
                        role="assistant",
                        content=full_response,
                        timestamp=time.time(),
                    )
                    local_db.add(db_asst_msg)
                    local_db.commit()
            except Exception as save_asst_err:
                print(f"Error saving assistant message: {save_asst_err}")

    return StreamingResponse(
        sse_event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

# Export Chat History
@app.get("/api/user/export")
def export_user_chats(
    format: str = "json",
    current_user: models.DBUser = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    sessions = (
        db.query(models.DBChatSession)
        .filter(models.DBChatSession.user_id == current_user.id)
        .order_by(models.DBChatSession.created_at.desc())
        .all()
    )

    export_data = []
    for s in sessions:
        msgs = (
            db.query(models.DBChatMessage)
            .filter(models.DBChatMessage.session_id == s.id)
            .order_by(models.DBChatMessage.timestamp.asc())
            .all()
        )
        export_data.append({
            "sessionId": s.id,
            "title": s.title,
            "model": s.model,
            "createdAt": s.created_at,
            "messages": [
                {
                    "role": m.role,
                    "content": m.content,
                    "timestamp": m.timestamp,
                }
                for m in msgs
            ]
        })

    if format == "markdown":
        md_lines = [f"# OmniAI Chat History Export - {current_user.email}\n"]
        for sess in export_data:
            md_lines.append(f"## {sess['title']} ({sess['model']})\n")
            for m in sess["messages"]:
                role_name = "User" if m["role"] == "user" else "OmniAI Assistant"
                md_lines.append(f"**{role_name}**:\n{m['content']}\n")
            md_lines.append("---\n")
        return Response(content="\n".join(md_lines), media_type="text/markdown")

    return JSONResponse(content={"export": export_data})
