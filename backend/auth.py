import os
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt
from fastapi import Request, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

import database
import models

# Configuration
JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-omniai-jwt-key-2026-production-ready")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
DEFAULT_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440")) # 24 hours standard
REMEMBER_ME_EXPIRE_MINUTES = 43200 # 30 days for persistent session

security = HTTPBearer(auto_error=False)

def hash_password(password: str) -> str:
    """Hashes password using passlib bcrypt with hashlib fallback."""
    try:
        from passlib.context import CryptContext
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        return pwd_context.hash(password)
    except Exception:
        salt = os.getenv("HASH_SALT", "omniai_secure_salt_2026")
        return hashlib.sha256((password + salt).encode("utf-8")).hexdigest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain password against stored hash."""
    try:
        from passlib.context import CryptContext
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        if pwd_context.verify(plain_password, hashed_password):
            return True
    except Exception:
        pass
    
    salt = os.getenv("HASH_SALT", "omniai_secure_salt_2026")
    fallback_hash = hashlib.sha256((plain_password + salt).encode("utf-8")).hexdigest()
    return fallback_hash == hashed_password

def create_access_token(
    data: dict,
    remember_me: bool = False,
    expires_delta: Optional[timedelta] = None
) -> tuple[str, int]:
    """
    Creates a JWT access token and returns (token, expire_minutes).
    If remember_me is True, duration is 30 days (43,200 minutes).
    """
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    
    if expires_delta:
        expire = now + expires_delta
        expire_minutes = int(expires_delta.total_seconds() / 60)
    elif remember_me:
        expire_minutes = REMEMBER_ME_EXPIRE_MINUTES
        expire = now + timedelta(minutes=expire_minutes)
    else:
        expire_minutes = DEFAULT_EXPIRE_MINUTES
        expire = now + timedelta(minutes=expire_minutes)
    
    to_encode.update({"exp": expire, "iat": now})
    token = jwt.encode(to_encode, JWT_SECRET, algorithm=ALGORITHM)
    return token, expire_minutes

def decode_access_token(token: str) -> Optional[dict]:
    """Decodes and validates a JWT token."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        return payload
    except Exception:
        return None

def extract_token_from_request(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[str]:
    """Extracts JWT token from Bearer header, query param, or HTTP-only cookies."""
    if credentials and credentials.credentials:
        return credentials.credentials
    
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header.split(" ")[1].strip()
    
    # Check cookies
    for cookie_name in ["access_token", "omniai_token", "token"]:
        cookie_val = request.cookies.get(cookie_name)
        if cookie_val:
            return cookie_val.strip()
            
    # Check query param (for SSE or websocket connections if needed)
    token_query = request.query_params.get("token")
    if token_query:
        return token_query.strip()
        
    return None

def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(database.get_db),
) -> models.DBUser:
    """FastAPI dependency: enforces JWT authentication and returns current DBUser."""
    token = extract_token_from_request(request, credentials)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token missing",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication session",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_email = payload.get("sub")
    user = db.query(models.DBUser).filter(models.DBUser.email == user_email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account no longer exists",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return user

def get_optional_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(database.get_db),
) -> Optional[models.DBUser]:
    """FastAPI dependency: returns current DBUser if token is present & valid, else None."""
    try:
        return get_current_user(request, credentials, db)
    except HTTPException:
        return None
