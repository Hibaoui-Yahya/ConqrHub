# ConqrMeet ↔ ConqrHub meeting API contract

Branch `ltc/improve-meeting-20261016`. This file documents the routes that
were added or changed for ConqrMeet. Routes not listed here behave as before.

Conventions for every route:

- Hub path `/api/ai/meeting/...`. The Meet BFF serves it as `/hubapi/ai/meeting/...`.
- A successful JSON response is wrapped by the Hub interceptor:
  `{ "data": <body>, "success": true, "status": <http code> }`. The bodies
  below are the `data` part.
- An error is **not** wrapped. Its body is
  `{ "statusCode", "message", ... }`, and `message` is French text for the
  user. Errors that the client must branch on also carry a stable `code`
  string (listed per route).
- Access is unchanged. Every active member of the company reads a meeting.
  Only its creator or an Owner/Admin changes it. A write by anyone else gets
  403 with the French read-only message. Another company's meeting, a deleted
  meeting or a malformed id all get 404.

---

## 1. Progressive chunked capture

The recorder uploads audio while it records, every ~10–30 s, per source.

### Model

- **Sources.** `mic` and `system` (tab or screen audio). Each source has its
  own sequence numbers, which start at **0** and grow by **1** per chunk. The
  same number may appear in both sources.
- **Standalone chunk** (`continuation` absent or `false`). The chunk is a
  complete, decodable file with its container header. This is the old
  behaviour, and the single upload at stop is one standalone chunk 0.
- **Continuation chunk** (`continuation=true`). The bytes continue the
  previous sequence of the same source. A `MediaRecorder` started with a
  `timeslice` produces these: only its first part has the WebM header. Send
  that first part as standalone and every later part as continuation.
- **Take.** A standalone chunk plus the continuation chunks after it. At
  processing time the Hub appends the bytes of each take in sequence order and
  reads the result as one file. A page reload starts a new `MediaRecorder`, so
  the first chunk after a reload is **standalone**, at the next sequence
  number. Takes of the same source are placed on the meeting timeline by their
  `startMs`.
- **Timeline.** `startMs` is the chunk's offset from the start of the meeting
  (the start of recording) and `durationMs` is its length. Both are integers
  ≥ 0, in ms. `startMs` of a take is the offset of its first chunk.
- **Limits.** These are server-side and configurable.

  | limit | default | env |
  | --- | --- | --- |
  | audio timeline (`startMs + durationMs` of any chunk) | 2 h (+2 min grace) | `MEETING_CAPTURE_MAX_MINUTES` (1–1440) |
  | stored bytes per meeting, all chunks | 1536 MiB | `MEETING_CAPTURE_MAX_MB` (16–8192) |
  | one chunk | 150 MiB | — |
  | chunks per source | 20 000 | — |
  | highest sequence | 100 000 | — |

  The Hub has no 60-minute limit any more. The values in effect are returned
  by `GET /:id/capture` (`limits`).

### `POST /ai/meeting/start` (unchanged)

Body: `{ title?, consent?, meetingType?, languageConfig?, templateId? }`. The
response is `{ id, title, status: "recording", startedAt }`.

### `POST /ai/meeting/:id/chunk` (changed, additive)

`multipart/form-data` with one file part and these fields:

| field | type | required | meaning |
| --- | --- | --- | --- |
| file part | audio bytes | yes | non-empty, ≤ 150 MiB. Its MIME type is kept, e.g. `audio/webm;codecs=opus` |
| `source` | `mic` \| `system` | no (default `mic`) | |
| `sequence` | integer ≥ 0 | yes (defaults to 0) | per source |
| `startMs` | integer ≥ 0 | yes | offset on the meeting timeline |
| `durationMs` | integer ≥ 0 | yes | |
| `continuation` | `"true"` | no | **new.** Appends to `sequence - 1` of the same source. Refused for sequence 0 |
| `replace` | `"true"` | no | **new.** Overwrite a stored sequence whose bytes differ |

Behaviour:

- **Idempotent re-send.** If the same source and sequence is already stored
  with the same bytes (SHA-256 match), nothing changes and the answer is 201
  with `duplicate: true`. This also works after `stop` (a lost response of the
  last chunk). Retry freely.
- **Different bytes for a stored sequence** are refused with **409**
  `code: "chunk_conflict"` (and `source`, `sequence`, `storedSha256`), unless
  `replace=true`. This protects the recording from a recorder that restarted
  its numbering at 0 after a reload.
- New chunks are accepted only while the status is `recording` (or `created`).
  Otherwise the answer is 400 `Meeting is not recording`.
- Concurrent uploads, for both sources and in any order, are safe because they
  are serialised per meeting.

Response 201 (the old fields are first):

```json
{
  "segmentId": "uuid",
  "text": "",
  "source": "mic",
  "sequence": 12,
  "bytes": 48213,
  "sha256": "hex",
  "continuation": true,
  "duplicate": false,
  "replaced": false,
  "nextSequence": 13,
  "missingSequences": [],
  "totalBytes": 612000,
  "durationMs": 130000
}
```

`nextSequence`, `missingSequences`, `totalBytes` and `durationMs` describe the
chunk's source, or the whole meeting for the last two, after this chunk.

Errors:

| status | code | when |
| --- | --- | --- |
| 400 | — | invalid source or timing, empty file, `continuation` on sequence 0, not recording |
| 403 | — | not the creator or an Owner/Admin |
| 409 | `chunk_conflict` | stored sequence with other bytes, without `replace` |
| 413 | `capture_size_limit` (`maxBytes`) | meeting byte budget exceeded |
| 413 | `capture_chunk_limit` | too many chunks for the source |
| 422 | `capture_duration_limit` (`maxDurationMs`) | chunk ends past the duration limit. Stop the recording |

### `GET /ai/meeting/:id/capture` (new): resume after a reload

The caller must be able to read the meeting. The response is 200:

```json
{
  "meetingId": "uuid",
  "status": "recording",
  "captureKind": "live",
  "recording": true,
  "canEdit": true,
  "startedAt": "2026-10-16T08:00:00.000Z",
  "limits": {
    "maxDurationMs": 14400000,
    "maxBytes": 1610612736,
    "maxChunkBytes": 157286400,
    "maxChunksPerSource": 20000,
    "maxSequence": 100000
  },
  "totalBytes": 612000,
  "durationMs": 130000,
  "sources": {
    "mic": {
      "count": 13,
      "bytes": 400000,
      "lastSequence": 12,
      "nextSequence": 13,
      "missingSequences": [],
      "endMs": 130000,
      "takes": 1,
      "chunks": [
        { "sequence": 0, "startMs": 0, "durationMs": 10000, "bytes": 30000, "sha256": "hex", "continuation": false }
      ]
    },
    "system": { "count": 0, "bytes": 0, "lastSequence": -1, "nextSequence": 0, "missingSequences": [], "endMs": 0, "takes": 0, "chunks": [] }
  }
}
```

Both sources are always present. `missingSequences` lists the numbers absent
between 0 and `lastSequence`, at most 500 of them. `sha256` is `null` for
chunks stored before this release.

To resume after a reload:

1. `GET /:id/capture`. If `recording` is false, the meeting was already
   stopped.
2. Re-send whatever is in `missingSequences` if you still hold those bytes.
3. Start a new `MediaRecorder`. Its first chunk is **standalone**, at
   `sequence = nextSequence` and `startMs = endMs` (or the real elapsed
   offset). Every later chunk is a continuation.

### `POST /ai/meeting/:id/stop` (changed, additive)

Body, JSON, all optional (old clients send `{}`):

```json
{ "expectedLastSequence": { "mic": 41, "system": 40 }, "allowGaps": false }
```

- `expectedLastSequence` is the last sequence the recorder sent per source
  (`-1` for none). It lets the Hub detect a lost final chunk, which no gap
  reveals.
- If sequences are missing, either inside what was stored or after it up to
  `expectedLastSequence`, the answer is **409** `code: "capture_incomplete"`
  with `missing: { "mic": [3, 42] }`, and **nothing changes**: the meeting
  keeps recording, so re-send and call stop again. With `allowGaps: true` the
  Hub stops anyway and processes what it has. The missing passages are lost,
  and a continuation chunk whose take has no header (chunk 0 or the reload
  chunk missing) is skipped.
- On success the response is unchanged: the meeting row plus `canEdit`, with
  `status: "finalizing"`. Processing starts by itself. The `finalizing`
  transition event's `detail` records `chunks`, `takes`, and, when gaps were
  accepted, `missing`, `gapsAccepted` and `unreadableChunks`.
- A second stop on an already stopped meeting still answers 400
  (`Meeting is not recording (status: …)`).

### Assembly and playback (server behaviour)

- Transcription reads each take as one file, its chunks appended in order. A
  source with several takes is mixed on its timeline, as before. Mic and
  system are transcribed separately.
- Playback (`GET /:id/audio`, target `original`):
  - One standalone chunk is played as is, as before.
  - One take with several chunks is stored once as recorded (no re-encoding,
    e.g. `audio/webm`).
  - Several takes or sources are mixed into `audio/mp4`, as before.
  - Until processing has written the playback, `audioAvailable` stays `false`.
- The single-file `POST /ai/meeting/upload` path is unchanged.

---

## 2. Saved AI insights

These save the outputs that ConqrMeet produces through `POST /api/ai/generate`
and that were not kept anywhere before:

- `communication-analysis`, the "AI communication analysis" of the speakers
  tab;
- `qa`, an "Ask about this meeting" question and its answer.

They are stored in their own table, `meeting_insights`.

Permissions follow the other meeting outputs. Every member who reads the
meeting lists its insights. Only the creator or an Owner/Admin saves or
deletes one, and anyone else gets 403 with the read-only message.

### `GET /ai/meeting/:id/insights?kind=` (new)

`kind` is optional and is either `communication-analysis` or `qa`. Any other
value gets 400. The response is 200, newest first, with at most 200 items:

```json
{
  "items": [
    {
      "id": "uuid",
      "kind": "qa",
      "question": "Qui envoie le contrat ?",
      "content": "Paul, lundi prochain.",
      "transcriptVersion": 2,
      "createdAt": "2026-10-16T09:12:00.000Z",
      "author": { "id": "uuid", "name": "Carla Martin", "avatarUrl": null },
      "canDelete": true
    }
  ]
}
```

- `question` is `null` for `communication-analysis`.
- `author` is `null` if the author's account was removed.
- `canDelete` is the caller's edit right.

Insights are not included in `GET /:id`.

### `POST /ai/meeting/:id/insights` (new)

JSON body:

| field | type | required | rule |
| --- | --- | --- | --- |
| `kind` | `communication-analysis` \| `qa` | yes | |
| `question` | string | for `qa` | ≤ 2000 chars. Ignored and stored as `null` for `communication-analysis` |
| `content` | string, Markdown | yes | 1–50 000 chars (trimmed). For `qa` this is the answer |
| `transcriptVersion` | integer ≥ 1 | no | the transcript the insight was produced from |

The response is 201 with one item, in the same shape as the list.

Errors:

- 400 with a French message for an empty content or a `qa` without a
  question;
- 403 for read-only callers;
- 409 `code: "insight_limit"` when the meeting already has 200 insights.

### `DELETE /ai/meeting/:id/insights/:insightId` (new)

The response is 204. The answer is 404 (`Élément introuvable.`) if the item is
not one of this meeting's insights, and 403 for read-only callers. This
removes only the saved item, never the meeting.

---

## 3. Archive and unarchive

Archiving is **not** a deletion. The transcript, documents, proposals, audio,
insights and Hub pages all stay, and an archived meeting stays readable
through every `GET`. Archive and unarchive use the same edit rule as rename:
the creator or an Owner/Admin, and 403 for anyone else. They send no
notification and no e-mail.

### `POST /ai/meeting/:id/archive` (new)

There is no body. The response is 200 with the meeting (the same shape as
`PATCH /:id`): `status: "archived"` and `archivedAt` set. Calling it on an
already archived meeting returns the meeting unchanged.

- It is refused with 409 `code: "meeting_busy"` while the meeting is
  recording or processing.
- While a meeting is archived, these are refused with 409
  `code: "meeting_archived"` (unarchive first):
  - `POST /:id/process`;
  - `POST /:id/transcript/speakers` with `confirm: true`;
  - `POST /:id/documents/:docId/publish`;
  - `POST /:id/publish-bundle`.

  Renaming, markers, insights, evaluations and proposals keep working.

### `POST /ai/meeting/:id/unarchive` (new)

There is no body. The response is 200 with the meeting, restored to the status
it had when it was archived (from the timeline), and `archivedAt: null`. If
that status would restart work, or is unknown, the meeting becomes
`completed`. Calling it on a meeting that is not archived returns the meeting
unchanged.

Meeting objects (`GET /`, `GET /:id`, `PATCH /:id`, …) gain the additive field
`archivedAt` (ISO date or `null`).

---

## 4. List filters: `GET /ai/meeting` (changed, additive)

The existing parameters are unchanged: `limit` (1–100, default 50), `offset`,
`q` (searches the title and the transcript) and `scope` (`mine` | `all`).

New parameters:

| param | value | effect |
| --- | --- | --- |
| `type` | meeting type(s), comma-separated, e.g. `recruitment-interview,daily-standup` | `meetingType` in the list |
| `status` | status(es), comma-separated, from the `meeting_status` enum | `status` in the list. An unknown value gets 400 `Statut inconnu : « … ».` |
| `from` | ISO date `2026-10-01` or date-time | `startedAt ≥ from`. A bare date means 00:00 UTC |
| `to` | ISO date or date-time | `startedAt ≤ to`. A bare date covers the **whole UTC day**. `from` after `to` gets 400 `Période invalide…` |
| `ownerId` | user uuid | meetings created by that person |
| `archived` | `exclude` (default) \| `include` \| `only` | archived meetings are **hidden by default**. `status=archived` implies `include` |

The filters only narrow the list. Read access is unchanged: every member
already reads every meeting of their own company, so `ownerId` may name any
colleague. A person of another company matches nothing. `scope=mine` and
`ownerId` intersect. The response is still `{ items, total }`, and `total`
counts the filtered list. For local-time day boundaries, send date-times with
an offset (`2026-10-16T00:00:00+02:00`).

---

## 5. Action proposals (changed fields, same routes)

`GET /ai/meeting/:id/proposals` keeps its shape. Proposals generated from this
release on fill these fields:

- **`evidence`**: `[{ "segmentIds": ["<transcript segment id>", …], "quote": "…" }]`.
  The ids are the segments of the latest transcript, at the time of analysis,
  that the quote came from, in transcript order (at most 6). A quote that
  matches no segment keeps `segmentIds: []`; the Hub never guesses a
  citation.
- **`validation`**:
  `{ "warnings": [string], "missingFields": ["projectId"] | [], "project": { "projectId": string|null, "source": "space_mapping"|"ambiguous"|"no_mapping"|"no_space"|"lookup_failed", "candidates": [projectId…] } }`.
  - The project comes from the ConqrPlan ↔ Hub space mappings of the
    meeting's space (its own space, then the space it was published into).
    The single primary-mapped project is used, otherwise the single mapped
    project.
  - When a project is found it is also written into `payload.projectId` and
    `missingFields` is `[]`.
  - When none or several are found, `missingFields` is `["projectId"]`, the
    French warning *Aucun projet ConqrPlan n’est associé…* is added, and
    `candidates` lists the mapped projects to choose from.
- **`duplicateCheck`**, one ConqrPlan work-item search per proposal, made as
  the meeting's creator (scope `work-item:read`) with a 5 s timeout. It
  covers the project when one is known, otherwise the whole workspace.
  - On success:
    `{ "searched": true, "searchedAt", "query", "projectId", "scope": "project"|"workspace", "likelyDuplicate": bool, "candidates": [{ "id", "name", "projectId", "identifier", "sequenceId", "state", "stateGroup", "similarity" }] }`.
    `candidates` holds at most 3 items with title similarity ≥ 0.5, sorted.
    `likelyDuplicate` is true when the best candidate scores ≥ 0.8.
  - On failure:
    `{ "searched": false, "reason": "plan_not_connected"|"timeout"|"unavailable"|"empty_title", "candidates": [] }`.
    A failure never blocks or drops a proposal.
- **`riskLevel`**: a likely duplicate is `normal` instead of `safe` and gets
  the French warning *Une tâche ConqrPlan semblable existe peut-être déjà…*.
  `POST /:id/proposals/approve-safe` therefore leaves it for a person to
  decide.

Behaviour changes:

- `approve-safe` no longer skips a proposal for `projectId` when the payload,
  the edited payload or the meeting's space mapping now provides one (for
  example after publication). The skip reason is now French:
  `Champs requis manquants : …`.
- Execution, after approval, uses the space-mapped project when the payload
  has no `projectId`. The failure message when there is none is French.

---

## 6. Linking speakers to members

### `GET /ai/meeting/:id/linkable-members?q=&limit=` (new)

This returns the people a speaker of this meeting may be linked to: the
**active members of the meeting's company**, never a group. It needs the edit
right on the meeting (creator or Owner/Admin), because only editors link
speakers. Anyone else gets 403 with the read-only message, and another company
gets 404.

| param | rule |
| --- | --- |
| `q` | optional, ≤ 100 chars. Matches part of the name or e-mail, case-insensitive. The e-mail is never returned |
| `limit` | 1–50, default 20 |

The response is 200, sorted by name:

```json
{ "items": [{ "id": "uuid", "name": "Colin Martin", "avatarUrl": null }], "hasMore": false }
```

If `hasMore` is true, narrow the search with `q`.

### `POST /ai/meeting/:id/transcript/speakers`: `userLinks` (changed)

The body is unchanged: `{ baseVersion, renames?, merges?, userLinks?, reassign?, confirm? }`.

- `userLinks` maps a speaker label to a member id. A value of `null` or `""`
  removes the link.
- Every id is now validated against the active members of the meeting's
  company. If one is unknown, belongs to another company, is deactivated or is
  malformed, the **whole request** is refused with 400
  `code: "invalid_user_links"` and `invalid: [ids]`, and nothing is written.
- A linked speaker that has no display name yet takes the member's name. This
  counts as an edit, so analysis is re-run with the names when AI is
  available. A name set by a reviewer is kept.
- As before, links are persisted only with `confirm: true`, which writes a
  new canonical transcript version.

### `GET /ai/meeting/:id/transcript` (changed, additive)

`speakers[label].userId` carries the link. The new field
`linkedUsers: { "<userId>": { id, name, avatarUrl } }` describes the linked
people who are still members of the company.

---

## 7. Per-meeting language

`languageConfig: { "language": "<code>" }` is sent at `start`, at `upload` (a
multipart field holding JSON) and at `process`. It now resolves as follows.

| value | transcription | transcript `language` | report language |
| --- | --- | --- | --- |
| `fr`, `fr-CA`, `FR_fr`, `en`, `ar`, … | provider auto-detects (see below) | **the chosen code** (`fr`), over detection | the chosen code, over the account and company defaults |
| `ar_en` (code-switching) | auto-detect: a single-language hint would force or translate one language | what the provider detected | no single language from the meeting: detected, then the account and company defaults (never "Arabic" read from `ar_en`) |
| absent, `""`, `auto`, unknown | auto-detect | detected | detected, then the defaults |

- **What reaches the provider.** Nothing, today. Meeting transcription is the
  diarized Mistral request, which needs segment timestamps, and Mistral
  documents `language` as not compatible with `timestamp_granularities`.
  Sending the language would make the diarized call fail and fall back to the
  single-speaker path. The switch is
  `PROVIDER_ACCEPTS_LANGUAGE_WITH_DIARIZATION` in
  `meeting-stt-language.util.ts`.
- **Recorded on the transcript (version 1).** `processing_config.language`
  holds `{ requested, mode: "single"|"code_switching"|"auto", providerHint, detected }`.
- **Upload.** A malformed `languageConfig` field now answers 400 in French
  instead of a 500.
