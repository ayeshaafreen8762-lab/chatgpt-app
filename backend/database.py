import os
from contextlib import contextmanager
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from dotenv import load_dotenv

load_dotenv()

# Database URL configuration (defaults to local SQLite, overridable with Neon/Supabase PostgreSQL)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./omni_ai.db")

# Convert legacy postgres:// scheme for SQLAlchemy compatibility
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

is_sqlite = DATABASE_URL.startswith("sqlite")

connect_args = {}
if is_sqlite:
    connect_args = {"check_same_thread": False}

# SQLAlchemy engine
engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
)

Base = declarative_base()

# Plain session factory used internally
_SessionFactory = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class SessionLocal:
    """
    Dual-use session class:
    - Call `SessionLocal()` to get a raw Session (used by FastAPI `Depends(database.get_db)`)
    - Use `with SessionLocal() as db:` for explicit context-manager blocks (background saves in main.py)
    """

    def __new__(cls) -> Session:  # type: ignore[override]
        return _SessionFactory()

    @classmethod
    def context(cls) -> "ContextManagerSession":
        """Returns a context manager that yields and auto-closes a session."""
        return ContextManagerSession()


class ContextManagerSession:
    """Helper for `with database.SessionLocal.context() as db:` usage."""

    def __init__(self):
        self._session: Session = _SessionFactory()

    def __enter__(self) -> Session:
        return self._session

    def __exit__(self, exc_type, exc_val, exc_tb):
        try:
            if exc_type:
                self._session.rollback()
            else:
                self._session.commit()
        finally:
            self._session.close()
        return False


def init_db():
    """Initializes tables and enables pgvector extension if on PostgreSQL."""
    if not is_sqlite:
        try:
            with engine.connect() as conn:
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
                conn.commit()
                print("pgvector extension initialized or already present.")
        except Exception as e:
            print(f"pgvector extension check note (can be ignored on standard DB): {e}")

    Base.metadata.create_all(bind=engine)
    print("Database tables initialized successfully.")


def get_db():
    """FastAPI dependency that yields a scoped session and closes it on request end."""
    db: Session = _SessionFactory()
    try:
        yield db
    finally:
        db.close()

