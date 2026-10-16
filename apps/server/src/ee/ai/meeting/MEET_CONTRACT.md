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
  | audio timeline (`startMs + durationMs` of any chunk) | 4 h (+2 min grace) | `MEETING_CAPTURE_MAX_MINUTES` (1–1440) |
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
