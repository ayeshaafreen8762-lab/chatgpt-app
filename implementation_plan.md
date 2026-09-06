# Critical Bug Fixes — Implementation Plan

This plan resolves the four critical bugs reported prior to public deployment:
1. **BUG 1**: Mermaid diagram syntax generation, client-side auto-sanitization, parser validation, and clean text fallback.
2. **BUG 2**: Text input duplication/looping caused by cumulative speech transcript concatenation in `ChatInputBar.tsx`.
3. **BUG 3**: Document upload (PDF & DOCX) end-to-end verification and error handling in chat and RAG pipeline.
4. **BUG 4**: Microphone recognition lifecycle (single-utterance / clean toggle, preventing unintentional restart loops).

---

## Proposed Changes

### Component 1: Visual Rendering & Mermaid Reliability (`BUG 1`)

#### [MODIFY] [groq_client.py](file:///c:/Users/ayesh/Downloads/chatgpt-app/backend/groq_client.py)
- Strengthen `SYSTEM_DOUBT_SOLVER_PROMPT` with strict Mermaid syntax rules:
  - Always declare `flowchart TD` or `flowchart LR`.
  - Always quote node label text: `node_id["Label with symbols (x+y)"]`.
  - Explicitly prohibit reserved keyword node IDs (`end`, `subgraph`, `graph`, `default`, `style`).
  - Add explicit few-shot examples for flowcharts, decision trees, and sequence diagrams.

#### [MODIFY] [VisualRenderer.tsx](file:///c:/Users/ayesh/Downloads/chatgpt-app/components/VisualRenderer.tsx)
- Add a robust `sanitizeMermaidCode` helper function:
  - Auto-quotes unquoted node labels with special characters `()[]{}:,"`.
  - Renames reserved keywords used as node IDs (e.g., `end[` -> `node_end[`).
  - Normalizes `graph TD` to `flowchart TD`.
  - Strips stray markdown fences.
- Use `mermaid.parse` before `mermaid.render` inside a `try/catch` block.
- Suppress Mermaid 11 default DOM error element pollution (`mermaid.initialize({ suppressErrorRendering: true })`).
- If parsing or rendering fails, display a clean fallback card (*"Diagram couldn't be generated as a visual graphic — here is the structured outline"*) with an optional collapsible "View diagram code" toggle, instead of a raw syntax error dump.

---

### Component 2: Speech Recognition & Text Input State (`BUG 2` & `BUG 4`)

#### [MODIFY] [useSpeechRecognition.ts](file:///c:/Users/ayesh/Downloads/chatgpt-app/hooks/useSpeechRecognition.ts)
- Refactor transcript tracking to separate `finalTranscript` and `interimTranscript`.
- Correctly compute the total transcript for the current utterance across all `event.results` (rather than slice index appending).
- Pass `{ fullTranscript, isFinal }` to callback.
- Add clean stop / abort lifecycle management so the microphone does not keep looping or re-opening on its own.

#### [MODIFY] [VoiceInputButton.tsx](file:///c:/Users/ayesh/Downloads/chatgpt-app/components/VoiceInputButton.tsx) & [ChatInputBar.tsx](file:///c:/Users/ayesh/Downloads/chatgpt-app/components/ChatInputBar.tsx)
- Snapshot the base `inputText` when the mic starts.
- Replace `inputText` with `${baseText} ${fullTranscript}` rather than accumulating `(prev) => prev + txt` on every delta.
- Ensure the mic button cleanly stops after an utterance or when clicked to stop.

---

### Component 3: Document Upload & RAG Verification (`BUG 3`)

#### [MODIFY] [app/chat/page.tsx](file:///c:/Users/ayesh/Downloads/chatgpt-app/app/chat/page.tsx) & [DocumentPreviewCard.tsx](file:///c:/Users/ayesh/Downloads/chatgpt-app/components/DocumentPreviewCard.tsx)
- Ensure upload errors show a clear user toast/banner if a malformed file is uploaded.
- Confirm full chunk details and extracted text preview render cleanly in the UI.

---

## Verification Plan

### Automated & API Tests
- Test 5 different Mermaid diagram prompts via Groq streaming (algorithms, physics processes, math derivation flows, system architectures, decision trees) to verify valid Mermaid generation.
- Test PDF & DOCX upload endpoints and RAG question answering.
- Run `npx tsc --noEmit` to verify type safety.

### Browser End-to-End Verification
- Open the application in the browser.
- **Test Diagram Generation**: Trigger "Generate Visual Diagram" and verify 5 different prompts render crisp SVG diagrams without Mermaid 11 syntax errors.
- **Test Text & Voice Input**: Type text, test voice input / mic toggle, speak full sentences, verify zero duplication/looping ("Physics class...").
- **Test Document Upload**: Upload real PDF and DOCX documents, verify preview card appears, ask document-grounded questions, verify AI cites the document.
- **Test Model Switcher**: Switch between models and verify persistence and responses.
