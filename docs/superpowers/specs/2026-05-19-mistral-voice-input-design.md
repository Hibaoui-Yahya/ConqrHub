# Design — Mistral Voice Input (STT) for AI features

**Date:** 2026-05-19
**Status:** Approved (brainstorming complete, awaiting implementation plan)
**Surfaces:** AI Chat, Editor "Ask AI", Search "AI Answers", Page Editor (dictation)

## Summary

Add a single shared `<MicButton/>` to every text-input surface that powers an AI feature. Pressing it records audio in the browser, uploads it to a new server endpoint, transcribes via **Mistral Voxtral Small** (`voxtral-small-2507`), runs a **two-pass correction step with context** using the existing `AiProviderService.generate()` (Mistral Large), then inserts the corrected text into the input as editable plain text. The user reviews and sends — no separate confirmation modal.

## Goals

- One reusable voice-input component across 4 surfaces (chat, Ask AI, search, page editor).
- Use the best Mistral STT model (Voxtral Small) via Mistral's OpenAI-compatible `/v1/audio/transcriptions` endpoint.
- Correct obvious mishearings, punctuation, and proper-noun mistakes using surrounding page/chat context.
- Tap-to-start / tap-to-stop with a 60-second hard cap.
- Multilingual auto-detect (no language hint sent).
- Admin-gateable per workspace; globally gateable via env var.
- No new credentials — reuse `MISTRAL_API_KEY`.
- Privacy-respecting: audio is in-memory only; no transcript content in logs.

## Non-goals

- Streaming partial transcripts. Voxtral's API is one-shot file upload; live caption-style is out of scope.
- Recordings longer than 60 seconds (dictating an entire long-form page in one shot — explicitly out, can be reconsidered later).
- A separate confirmation modal or diff-against-raw UI. The input field itself is the confirmation surface.
- Voice output / TTS. Out of scope.
- Self-hosted Whisper or alternative STT providers (the env var `AI_STT_MODEL` exists for operators to override, but only Mistral Voxtral is supported and tested).

## Architecture

```
┌──────────────────────────────────────┐
│  Client                              │
│                                      │
│   <MicButton context={...}/>         │
│       │                              │
│       ▼                              │
│   use-voice-input (MediaRecorder)    │
│       │                              │
│       ▼  audio/webm;opus blob        │
│   stt-service.transcribe()           │
└───────────┬──────────────────────────┘
            │ POST multipart/form-data
            ▼
┌──────────────────────────────────────┐
│  Server (apps/server/src/ee/ai/stt)  │
│                                      │
│   SttController                      │
│       │ JwtAuthGuard, workspace      │
│       ▼                              │
│   SttService.transcribeAndCorrect()  │
│       │                              │
│       ├─► fetch Mistral              │
│       │   /v1/audio/transcriptions   │
│       │   model=voxtral-small-2507   │
│       │           │                  │
│       │           ▼ raw              │
│       │                              │
│       ├─► PageRepo (resolve context) │
│       │           │                  │
│       │           ▼                  │
│       └─► AiProviderService          │
│             .generate(correction)    │
│             model=mistral-large      │
│                   │                  │
│                   ▼ corrected        │
│                                      │
│   Response: { raw, corrected, ... }  │
└──────────────────────────────────────┘
```

## File layout

### New: `apps/client/src/ee/voice-input/`

- `mic-button.tsx` — button + visual states (idle / recording / transcribing).
- `use-voice-input.ts` — hook wrapping `MediaRecorder`. Returns `{ state, start, stop, cancel, elapsedMs }`.
- `stt-service.ts` — `transcribe(audio, context)` posting to `/api/ee/ai/stt`.
- `types.ts` — `SttContext` discriminated union.
- `voice-input.module.css` — pulsing recording indicator, states.

### New: `apps/server/src/ee/ai/stt/`

- `stt.module.ts`
- `stt.controller.ts` — `POST /api/ee/ai/stt` (`JwtAuthGuard`), multipart/form-data.
- `stt.service.ts` — orchestrates Mistral transcription + context-aware correction.
- `stt.service.spec.ts` — unit tests with mocked Mistral HTTP and `AiProviderService`.
- `dto/stt-request.dto.ts` — zod schema for the `context` field.

### Modified

- `apps/client/src/ee/ai-chat/components/chat-input.tsx` — add `<MicButton/>` to the left action row.
- `apps/client/src/features/editor/` — Ask-AI prompt component (exact file located during implementation) gains `<MicButton/>`; a new `/voice` slash command for page-editor dictation.
- `apps/client/src/features/search/` — AI Answers input gains `<MicButton/>`.
- `apps/server/src/ee/ai/ai.module.ts` — register `SttModule`.
- `apps/server/src/integrations/environment/environment.service.ts` — add `getAiSttEnabled()`, `getAiSttModel()`.
- Workspace settings schema — add `aiSttEnabled boolean default true` (new migration).
- Workspace info DTO returned to client — surface `aiSttEnabled` so the client knows whether to render the button.
- Settings → AI page — admin toggle for `aiSttEnabled`.

## Data flow

1. User taps `<MicButton/>`. `useVoiceInput.start()` calls `getUserMedia({ audio: true })` and starts `MediaRecorder` (`audio/webm;codecs=opus`, 64 kbps). Button shows pulsing red dot + live timer.
2. User taps again or 60s cap fires. Recorder stops; blob finalized. Button switches to "transcribing" spinner.
3. Client assembles `SttContext` based on surface:
   - **chat**: `{ kind: 'chat', chatId, mentions: <currently @-mentioned page ids> }`
   - **ask-ai**: `{ kind: 'ask-ai', pageId }`
   - **search**: `{ kind: 'search' }`
   - **page**: `{ kind: 'page', pageId, cursorContextHint?: string }`
4. `FormData(audio, context)` → `POST /api/ee/ai/stt`.
5. Server validates: size ≤ 5 MB, mime in allow-list, STT enabled at workspace + env level.
6. `SttService.transcribeAndCorrect`:
   - **a. Transcribe.** Direct `fetch` to `https://api.mistral.ai/v1/audio/transcriptions` with `model=voxtral-small-2507`, `file=<blob>`, no language param (auto-detect). Returns `raw`.
   - **b. Resolve context server-side.** For `kind=chat|page|ask-ai`, fetch page title and a short excerpt (≤ 500 chars) from `PageRepo`. For mentions, fetch titles by id. Context is resolved on the server (not trusted from client) to prevent prompt-injection via the context payload.
   - **c. Build correction prompt.**
     - *System:* "You correct speech-to-text transcripts. Fix punctuation, capitalization, and obvious mishearings. Preserve the speaker's wording — do not paraphrase, summarize, translate, or add content. Output only the corrected transcript, no preamble or explanation."
     - *User:* `"Proper nouns to preserve verbatim: {workspace name}, {current page title}, {mention titles}.\nNearby text: \"{excerpt}\"\nRaw transcript: \"{raw}\"\n\nReturn only the corrected transcript."`
   - **d. Generate.** `aiProvider.generate({ system, prompt, temperature: 0.1, maxOutputTokens: ceil(1.5 * len(raw words)) })`. On any error, falls back to `raw` silently (logged).
7. Response: `200 { raw, corrected, durationMs, model: 'voxtral-small-2507' }`.
8. Client calls `onTranscript(corrected)`. Host input inserts at cursor with a leading space if non-empty; focus moves to input. User reviews and clicks Send.

## Configuration

### Env vars

- `AI_STT_ENABLED` — boolean, default `true` when `MISTRAL_API_KEY` is set, else `false`. Global kill switch.
- `AI_STT_MODEL` — default `voxtral-small-2507`. Allows operator override.

### Workspace setting

- `workspace.ai_stt_enabled` — boolean column, default `true`. New migration.
- Surfaced in `WorkspaceInfo` API response so the client can hide the mic button when disabled.
- Admin toggle in Settings → AI.

The mic button is rendered only when **both** the env flag and the workspace flag are `true` AND `MediaRecorder` is feature-detected available.

## Error handling

| Scenario | Behavior |
|---|---|
| Mic permission denied | Toast: "Microphone access denied. Enable it in browser settings." Button to idle. |
| `MediaRecorder` unavailable (old browser) | Button not rendered. Feature-detect on mount. |
| 60s cap reached | Auto-stop, transcribe what we have, toast: "Recording stopped at 60-second limit." |
| User cancels mid-recording (Esc or cancel control) | Discard blob, no request sent. |
| Network failure during upload | Toast: "Couldn't reach the server. Try again." Button to idle. |
| Mistral 4xx/5xx | Toast: "Transcription failed." Full error logged server-side. |
| Correction step fails or times out | Silent fallback to `raw`. Logged server-side. Client never sees an error. |
| AI not configured or STT disabled | Mic button hidden. Server returns 503 `{ code: 'STT_DISABLED' }` if hit anyway. |
| Audio blob > 5 MB | Server returns 413; client toast. Practically unreachable at 60s/64kbps ≈ 480 KB. |
| User exceeds rate limit | Toast: "Too many transcription requests. Try again later." (Server 429.) |

## Security & privacy

- Audio buffer held in memory on the server only; never written to disk, blob storage, or queue.
- Discarded immediately after the Mistral request returns.
- `JwtAuthGuard` + workspace-scoped: user must belong to the workspace whose context they're transcribing against.
- Rate limit: 30 transcription requests / user / hour (reuse existing throttler).
- Audit log entry per request: `{ userId, workspaceId, kind, durationMs, audioBytes, success, errorCode? }`. **No transcript content logged.**
- Context payload from the client is structurally validated; context strings used in the correction prompt are resolved server-side from the database (not trusted from client) to prevent prompt-injection.

## Testing

### Server unit (`stt.service.spec.ts`)
- Happy path: Mistral returns `raw`, correction returns `corrected`, response shape correct.
- Transcription HTTP 500 → 502 surfaced to client, no correction call made.
- Correction throws → response uses `raw` for both fields; error logged.
- Oversized buffer → 413, Mistral never called.
- `kind: 'page'` resolves page title + excerpt via `PageRepo`; correction prompt includes them.
- `kind: 'search'` skips page-context lookup entirely.
- Workspace-scope mismatch (user requests context for a page they can't see) → 403.

### Server controller (`stt.controller.spec.ts`)
- Missing JWT → 401.
- `AI_STT_ENABLED=false` → 503 `{ code: 'STT_DISABLED' }`.
- Workspace `aiSttEnabled=false` → 503.
- Invalid mime → 415.
- Valid request → 200 with expected shape.

### Client unit (`use-voice-input.spec.tsx`)
- Permission denied surfaces error state.
- 60s timeout auto-stops and produces blob.
- Manual stop produces blob.
- Cancel discards blob, no fetch issued.

### Manual smoke (documented in PR)
- Record short utterance on each of the 4 surfaces in Chrome, Firefox, Safari.
- Verify French + English auto-detect.
- Verify corrected proper nouns when current page has an unusual title (e.g., page named "Voxtral migration plan" → utterance "let's discuss voxtral migration" should preserve "Voxtral" capitalization).
- Verify mic button disappears when admin toggles `aiSttEnabled` off.

## Open questions

None at design approval time. Implementation may surface small ones (exact file paths for Ask-AI prompt and search input, slash-command registration pattern) — resolved during the implementation plan phase.

## References

- Mistral Voxtral docs: https://docs.mistral.ai/capabilities/audio/
- Existing AI provider service: [ai-provider.service.ts](../../../apps/server/src/ee/ai/providers/ai-provider.service.ts)
- Existing chat input: [chat-input.tsx](../../../apps/client/src/ee/ai-chat/components/chat-input.tsx)
