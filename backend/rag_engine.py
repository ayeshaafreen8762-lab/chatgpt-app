import io
import os
import re
import json
import math
import uuid
from typing import List, Dict, Any, Optional

# Document parsers
def extract_text_from_pdf(file_bytes: bytes) -> tuple[str, int]:
    """Extracts text and page count from PDF bytes."""
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(file_bytes))
        num_pages = len(reader.pages)
        pages_text = []
        for idx, page in enumerate(reader.pages):
            txt = (page.extract_text() or "").strip()
            if txt:
                pages_text.append(f"--- [Page {idx + 1}] ---\n{txt}")
        if pages_text:
            return "\n\n".join(pages_text), max(1, num_pages)
        
        # Fallback raw extraction for synthetic or custom encoded PDF streams
        raw = file_bytes.decode("latin1", errors="ignore")
        parts = re.findall(r"\(([^\)\\]{2,})\)", raw)
        if parts:
            return f"--- [Page 1] ---\n" + " ".join(parts), max(1, num_pages)
        return file_bytes.decode("utf-8", errors="ignore"), max(1, num_pages)
    except Exception as e:
        print(f"PDF extract error: {e}")
        return file_bytes.decode("utf-8", errors="ignore"), 1

def extract_text_from_docx(file_bytes: bytes) -> tuple[str, int]:
    """Extracts text from DOCX bytes."""
    try:
        import docx
        doc = docx.Document(io.BytesIO(file_bytes))
        full_text = [p.text for p in doc.paragraphs if p.text.strip()]
        text = "\n".join(full_text)
        # Approximate pages (~400 words per page)
        words = len(text.split())
        pages = max(1, math.ceil(words / 400))
        return text, pages
    except Exception as e:
        print(f"DOCX extract error: {e}")
        return file_bytes.decode("utf-8", errors="ignore"), 1

def extract_text_from_tabular(file_bytes: bytes, filename: str) -> tuple[str, int]:
    """Extracts text from CSV, JSON, TXT, or Code files."""
    try:
        raw_text = file_bytes.decode("utf-8", errors="ignore")
        if filename.endswith(".json"):
            try:
                parsed = json.loads(raw_text)
                return json.dumps(parsed, indent=2), 1
            except Exception:
                return raw_text, 1
        return raw_text, max(1, raw_text.count("\n") // 45 + 1)
    except Exception as e:
        return str(e), 1

def parse_document_file(filename: str, file_bytes: bytes) -> tuple[str, int, str]:
    """Parses any file and returns (extracted_text, page_count, detected_type)."""
    lower = filename.lower()
    if lower.endswith(".pdf"):
        text, pages = extract_text_from_pdf(file_bytes)
        return text, pages, "pdf"
    elif lower.endswith(".docx") or lower.endswith(".doc"):
        text, pages = extract_text_from_docx(file_bytes)
        return text, pages, "docx"
    elif lower.endswith((".csv", ".tsv", ".json", ".txt", ".md", ".py", ".js", ".html")):
        text, pages = extract_text_from_tabular(file_bytes, lower)
        return text, pages, "text"
    elif lower.endswith((".png", ".jpg", ".jpeg", ".webp", ".bmp")):
        return f"[Image Document: {filename}]", 1, "image"
    else:
        # Fallback text
        text, pages = extract_text_from_tabular(file_bytes, lower)
        return text, pages, "generic"

def chunk_text(text: str, chunk_size: int = 800, overlap: int = 150) -> List[Dict[str, Any]]:
    """Splits text into overlapping chunks, tracking page markers if available."""
    if not text or not text.strip():
        return []
    
    # Check for page markers
    page_splits = re.split(r"--- \[Page (\d+)\] ---", text)
    chunks = []
    
    if len(page_splits) > 1:
        # Split with page numbers
        for i in range(1, len(page_splits), 2):
            page_num = int(page_splits[i])
            page_content = page_splits[i + 1].strip()
            
            # Sub-chunk page content if large
            start = 0
            while start < len(page_content):
                end = min(start + chunk_size, len(page_content))
                chunk_str = page_content[start:end].strip()
                if chunk_str:
                    chunks.append({
                        "id": str(uuid.uuid4()),
                        "content": chunk_str,
                        "metadata": {"page": page_num, "start_char": start, "end_char": end}
                    })
                start += (chunk_size - overlap)
                if start >= len(page_content):
                    break
                    
    # Fallback to generic text chunking if page splitting didn't yield chunks
    if not chunks:
        start = 0
        clean_text = text.strip()
        while start < len(clean_text):
            end = min(start + chunk_size, len(clean_text))
            chunk_str = clean_text[start:end].strip()
            if chunk_str:
                chunks.append({
                    "id": str(uuid.uuid4()),
                    "content": chunk_str,
                    "metadata": {"page": 1, "start_char": start, "end_char": end}
                })
            start += (chunk_size - overlap)
            if start >= len(clean_text):
                break
            
    return chunks

# Lightweight Vector Embeddings (Free, Low-RAM, Zero-GPU Requirement)
# Dimension: 384 (standard MiniLM format)
def generate_embedding(text: str) -> List[float]:
    """
    Generates a 384-dimensional vector embedding.
    Uses Hugging Face sentence-transformers if present, or deterministic high-entropy
    token hashing with term frequencies to operate seamlessly with zero GPU/low memory.
    """
    try:
        # Attempt local sentence_transformers if installed and resources permit
        from sentence_transformers import SentenceTransformer
        # Lazy cached model loader
        if not hasattr(generate_embedding, "_model"):
            generate_embedding._model = SentenceTransformer("all-MiniLM-L6-v2")
        vec = generate_embedding._model.encode(text)
        return vec.tolist()
    except Exception:
        pass

    # High-dimensional semantic token hash embedding (384-dim, normalized)
    dim = 384
    vec = [0.0] * dim
    words = re.findall(r"\w+", text.lower())
    if not words:
        return vec
        
    for w in words:
        h = hash(w)
        idx = abs(h) % dim
        sign = 1.0 if (h >> 3) & 1 else -1.0
        vec[idx] += sign

    # L2 normalize
    norm = math.sqrt(sum(x * x for x in vec))
    if norm > 0:
        vec = [round(x / norm, 6) for x in vec]
    return vec

def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    """Calculates cosine similarity between two vector lists."""
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot = sum(a * b for a, b in zip(v1, v2))
    norm_a = math.sqrt(sum(a * a for a in v1))
    norm_b = math.sqrt(sum(b * b for b in v2))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)

def retrieve_top_k_chunks(query: str, chunks: List[Dict[str, Any]], k: int = 4) -> List[Dict[str, Any]]:
    """Retrieves top-k relevant chunks for a user query."""
    if not chunks or not query:
        return []

    q_vec = generate_embedding(query)
    scored = []
    
    for c in chunks:
        c_vec = c.get("embedding")
        if not c_vec and "embedding_json" in c:
            try:
                c_vec = json.loads(c["embedding_json"])
            except Exception:
                c_vec = None
        if not c_vec:
            c_vec = generate_embedding(c["content"])

        sim = cosine_similarity(q_vec, c_vec)
        scored.append((sim, c))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [item[1] for item in scored[:k]]
