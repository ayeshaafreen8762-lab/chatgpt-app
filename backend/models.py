import time
from sqlalchemy import Column, Integer, String, Text, ForeignKey, Float, DateTime, func
from sqlalchemy.orm import relationship
from database import Base, is_sqlite

# Try importing pgvector Vector type if installed and on PostgreSQL
USE_VECTOR_TYPE = False
if not is_sqlite:
    try:
        from pgvector.sqlalchemy import Vector
        USE_VECTOR_TYPE = True
    except ImportError:
        USE_VECTOR_TYPE = False

class DBUser(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    sessions = relationship("DBChatSession", back_populates="user", cascade="all, delete-orphan")
    documents = relationship("DBDocument", back_populates="user", cascade="all, delete-orphan")

class DBChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(String(100), primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    title = Column(String(255), default="New Analysis")
    model = Column(String(100), default="llama-3.3-70b-versatile")
    custom_endpoint_url = Column(String(500), nullable=True)
    created_at = Column(Float, default=time.time)

    user = relationship("DBUser", back_populates="sessions")
    messages = relationship("DBChatMessage", back_populates="session", cascade="all, delete-orphan")

class DBChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(String(100), primary_key=True, index=True)
    session_id = Column(String(100), ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(20), nullable=False)  # "user" or "assistant"
    content = Column(Text, nullable=False)
    files_json = Column(Text, nullable=True)
    timestamp = Column(Float, default=time.time)

    session = relationship("DBChatSession", back_populates="messages")

class DBDocument(Base):
    __tablename__ = "documents"

    id = Column(String(100), primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    filename = Column(String(255), nullable=False)
    file_type = Column(String(50), nullable=False)
    file_size = Column(Integer, default=0)
    page_count = Column(Integer, default=1)
    extracted_text = Column(Text, nullable=True)
    created_at = Column(Float, default=time.time)

    user = relationship("DBUser", back_populates="documents")
    chunks = relationship("DBDocumentChunk", back_populates="document", cascade="all, delete-orphan")

class DBDocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(String(100), primary_key=True, index=True)
    document_id = Column(String(100), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    metadata_json = Column(Text, nullable=True)  # page number, section, etc.
    embedding_json = Column(Text, nullable=True) # Fallback for JSON array representation
    
    # Optional pgvector native column if supported
    if USE_VECTOR_TYPE:
        from pgvector.sqlalchemy import Vector
        embedding = Column(Vector(384), nullable=True)

    document = relationship("DBDocument", back_populates="chunks")
