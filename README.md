# OmniAI: Open-Source AI Learning & Doubt-Solving Platform

A production-ready, 100% free-to-operate, open-source multi-user ChatGPT-style AI learning and doubt-solving platform. Deployable on free-tier cloud platforms (Vercel, Render, Railway, Neon, Supabase, Groq) with zero local GPU or Python requirements for end-users.

---

## 🚀 Key Features

### 1. Unified Multimodal Chat Input Bar (ChatGPT-Style)
- **Auto-expanding textarea** with smooth responsive height adjustments.
- **Universal Attachment Button (`+`)**: Upload ANY document or image format (`PDF`, `DOCX`, `TXT`, `CSV`, `JSON`, `PNG`, `JPG`, `WEBP`).
- **Webcam Doubt Snapshot**: Direct camera trigger with rotation & cropping controls to snap photos of textbook pages or handwritten math/physics equations.
- **Browser-Native Speech-to-Text**: Click-to-talk microphone button powered by the Web Speech API that transcribes spoken doubts directly into the search bar in real-time.
- **Interactive Action Chips**: "Upload Document", "Take Picture", "Explain Step-by-Step", "Generate Visual Diagram".

### 2. Document & Image Doubt-Solving Panel
- **Interactive Preview Card**: Positioned right above the chat conversation.
- **Extracted Text / RAG Inspector**: Toggle between raw document text and `pgvector` semantic chunks.
- **Dedicated Doubt Query Bar**: Ask questions directly targeting the uploaded file (e.g. *"Solve the 2nd math equation in this photo"*, *"Summarize Page 3"*).

### 3. Visual & Animated Doubt Solving Engine
- **Mermaid.js Flowcharts & Trees**: Dynamic logic maps, architecture diagrams, and algorithm step-by-step traces.
- **Recharts Dynamic Graphing**: Interactive 2D math function plots (quadratic functions, sine/cosine waves, distributions).
- **KaTeX Mathematical Formula Rendering**: Crisp LaTeX notation for standalone display equations (`$$...$$`) and inline variables (`$...$`).
- **Code Playgrounds**: Live preview tabs for HTML/SVG code blocks alongside syntax-highlighted code with a one-click copy button.

### 4. RAG Pipeline & Multi-File Parser
- Multi-format document parser (`pypdf`, `python-docx`, CSV, JSON, Markdown).
- Semantic text chunker with page-marker tracking.
- Free vector embeddings (`all-MiniLM-L6-v2` 384-dim) with `pgvector` on PostgreSQL and fast cosine similarity fallback.

### 5. Multi-User Authentication & Profile Security
- JWT Bearer Tokens with HTTP-Only cookie support and `bcrypt` password hashing.
- Profile modal to manage active sessions, reset password, delete account, and export conversation history to **JSON** or **Markdown (.md)**.

---

## 🛠️ Architecture & Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | Next.js (App Router), TypeScript, Tailwind CSS, Lucide Icons |
| **Visual Rendering** | Mermaid.js, Recharts, KaTeX (`react-katex`) |
| **Audio / Camera** | Web Speech API, `navigator.mediaDevices.getUserMedia` |
| **Backend API** | FastAPI (Python 3.11+), AsyncPG, SQLAlchemy, Pydantic v2 |
| **Hosted LLM Inference** | Groq Cloud API (`llama-3.3-70b-versatile` & `llama-3.2-11b-vision-preview`), SSE real-time streaming |
| **Database & Vectors** | PostgreSQL + `pgvector` (Neon.tech or Supabase free tiers) or SQLite local fallback |

---

## ⚡ Quickstart Guide

### 1. Frontend Setup
```bash
# Install dependencies
npm install --legacy-peer-deps

# Start Next.js development server (runs on http://localhost:3000)
npm run dev
```

### 2. Backend Setup
```bash
cd backend

# Create and activate virtual environment
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables (.env)
cp .env.example .env

# Run FastAPI server (runs on http://localhost:8000)
uvicorn main:app --reload --port 8000
```

---

## ☁️ 100% Free Cloud Deployment

### 1. Database (PostgreSQL with `pgvector`)
1. Create a free project on [Neon.tech](https://neon.tech) or [Supabase](https://supabase.com).
2. Copy the connection string and paste it into `backend/.env`:
   ```env
   DATABASE_URL=postgresql://user:password@ep-cool-fog-12345.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

### 2. Groq Cloud Inference
1. Create a free account on [Groq Console](https://console.groq.com/keys).
2. Generate an API Key and set:
   ```env
   GROQ_API_KEY=gsk_your_free_groq_api_key
   ```

### 3. Backend Deployment (Render or Railway Free Tier)
- Deploy the `/backend` folder as a Python Web Service.
- Set start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`.

### 4. Frontend Deployment (Vercel)
- Import the repo to [Vercel](https://vercel.com).
- Set `NEXT_PUBLIC_BACKEND_URL` to your deployed backend URL.

---

## 📄 License
MIT License - 100% Free and Open-Source.
