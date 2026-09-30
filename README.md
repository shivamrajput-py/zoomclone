# Video Conferencing Platform (Zoom Clone)

A full-stack Zoom clone built as an SDE Fullstack Assignment: it replicates Zoom's look and core meeting workflows — create, join and schedule meetings, then meet with real audio/video, chat, polls and host controls.

## 🚀 Live Demo & Submission Links

| | Link |
|---|---|
| **Live App** | _[deploy and add link here]_ |
| **GitHub Repository** | _[add public repo link here]_ |

> **Evaluator:** The app uses [VideoSDK.live](https://videosdk.live) for real audio/video. To test meetings end-to-end, open the link in two separate browser windows (one incognito) — the first gets host controls, the second joins as a guest.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Zustand, Axios |
| Backend | Python 3.10+ · FastAPI · Uvicorn · Pydantic v2 |
| Database | SQLite · SQLAlchemy 2 ORM |
| Realtime | FastAPI WebSockets (presence, chat, polls, reactions, host controls) |
| Audio / video | WebRTC through [VideoSDK.live](https://videosdk.live) (managed SFU) |

## Features

### Core (from the assignment)
- **Landing dashboard** — Home / Meetings / History tabs, live clock, New Meeting / Join / Schedule tiles, Upcoming and Recent sections, profile and settings placeholders.
- **Instant meeting** — one click creates a meeting with a unique numeric Zoom-style ID (e.g. `892-573-401`) and a shareable invite link, then drops you in the room.
- **Join meeting** — by Meeting ID **or a pasted invite link**; you enter a display name first; the meeting is validated before you join.
- **Schedule meeting** — topic, description, date/time picker, duration; an ID and invite link are generated, stored in the database, and shown under Upcoming.

### In the meeting
- Pre-join screen with camera preview and mic/camera toggles.
- Real multi-party audio/video, gallery and speaker views, screen share, whiteboard, Picture-in-Picture, recording (VideoSDK cloud recording).
- Chat (with file attachments), polls with live results, emoji reactions, raise hand.
- Chat and polls are saved on the server, so late joiners and reconnecting users get the history.

### Bonus
- **Responsive** — desktop, tablet and phone layouts (sidebar becomes a drawer, compact control bar with a "More" sheet on small screens, row actions always visible on touch devices).
- **Host controls** — mute all / mute one, remove participant, lock meeting, waiting room (admit / deny), and per-meeting permissions (share screen, chat, unmute themselves), enforced on the server.
- **End meeting for all**, with the meeting then listed under Recent.

## How it fits together

```
 Browser (Next.js)
   │  REST  ── create / schedule / list / join / claim token / end ──►  FastAPI ──► SQLite
   │  WebSocket ── presence, chat, polls, reactions, host controls ──►  (one socket per participant)
   │
   └── WebRTC media ──────────────────────────────────────────────►  VideoSDK SFU
        (token signed by FastAPI; the API secret never reaches the browser)
```

- **FastAPI owns the meeting.** It creates meetings and rooms, decides who is host, holds lock / waiting-room / permission state, stores chat and polls, and signs the media tokens.
- **VideoSDK only carries audio and video.** A participant's media token is issued by our backend, scoped to one room and one participant, and only the host's token can moderate others (mute/remove).
- **The waiting room is enforced at the token.** A guest held in the waiting room is never given a media token, so they cannot reach the room or its streams until the host admits them.

### Why VideoSDK instead of hand-rolled WebRTC?
The assignment grades meeting workflows, database design and code quality; it does not ask for a custom media stack. A peer-to-peer WebRTC mesh needs every browser to upload to every other and degrades past ~4–6 people, and it needs TURN servers to work on strict networks. A managed SFU avoids both, so time went into the parts being evaluated. Everything *around* the call (signalling of who is in the meeting, permissions, persistence, security) is our own FastAPI + WebSocket code.

## Project structure

```
backend/
  app/
    main.py            # app factory only: CORS, routers, exception handlers
    core/              # config (env), database/session, exceptions, time helpers
    models/            # SQLAlchemy models: Meeting, Participant, Message, Poll…
    schemas/           # Pydantic request/response models
    services/          # business rules (meetings, participants, chat, polls, VideoSDK)
    api/               # REST routes + host-token guard
    ws/                # WebSocket: events (validated), room manager, handlers, endpoint
  seed.py              # sample data
  tests/               # pytest: REST + WebSocket behaviour
frontend/src/
  app/                 # pages: dashboard, /join, /schedule, /meeting/[id]
  components/meeting/  # pre-join, session, control bar, tiles, waiting room…
  components/panels/   # chat, participants, polls panels
  hooks/               # useMeetingSocket (reconnecting WebSocket) + room state reducer
  lib/                 # API client, types, config, host-token storage, ID parsing
```

## Database Schema

```
meetings
  id                TEXT PK          -- Zoom-style numeric ID, e.g. 892-573-401 (ddd-ddd-ddd)
  title             TEXT NOT NULL
  description       TEXT
  host_name         TEXT
  host_token        TEXT             -- secret held by the creator; proves host identity
  videosdk_room_id  TEXT
  status            TEXT             -- scheduled | live | ended        (indexed)
  is_instant        BOOLEAN
  waiting_room, locked                                   BOOLEAN
  allow_share, allow_chat, allow_unmute                  BOOLEAN   -- what guests may do
  scheduled_at      DATETIME         -- UTC, null for instant meetings  (indexed)
  duration_minutes  INTEGER
  created_at, started_at, ended_at   DATETIME

participants                         -- one row per person per join
  id INTEGER PK · meeting_id FK→meetings · display_name
  role (host|cohost|participant) · session_key · admitted BOOLEAN
  joined_at · left_at

messages    id PK · meeting_id FK · sender_name · text · sent_at
polls       id PK · meeting_id FK · question · is_open · created_at
poll_options id PK · poll_id FK · text
poll_votes  id PK · poll_id FK · option_id FK · participant_id FK · voted_at
            UNIQUE(poll_id, participant_id)        -- one vote each; re-voting changes it
```

All child tables use foreign keys with `ON DELETE CASCADE` (SQLite foreign-key enforcement is switched on). **Recent meetings** are simply meetings with `status = 'ended'`, so there is no duplicated "history" table to keep in sync.

## Setup

### Prerequisites
- Python 3.10+
- Node.js 18+
- A free [VideoSDK](https://app.videosdk.live) account (API key + secret) for real audio/video

### 1. Backend

```bash
cd backend
python -m venv venv
# Windows:  venv\Scripts\activate        macOS/Linux:  source venv/bin/activate
pip install -r requirements.txt

cp .env.example .env        # then fill in VIDEOSDK_API_KEY and VIDEOSDK_SECRET

python seed.py              # sample data (safe to re-run — never drops existing data)
uvicorn app.main:app --reload --port 8000
```

API: `http://localhost:8000` · interactive docs: `http://localhost:8000/docs`

| Backend env var | Purpose | Default |
|---|---|---|
| `VIDEOSDK_API_KEY`, `VIDEOSDK_SECRET` | sign media tokens / create rooms | — (required for calls) |
| `DATABASE_URL` | SQLAlchemy URL | `sqlite:///./zoomclone.db` |
| `CORS_ORIGINS` | JSON list of allowed frontend origins | `["http://localhost:3000","http://127.0.0.1:3000"]` |
| `DEFAULT_HOST_NAME` | host name on new meetings | `Alex Johnson` |

### 2. Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # optional locally; see below
npm run dev
```

Open `http://localhost:3000`. To try a meeting alone, open the meeting link in a second (incognito) window as the guest.

| Frontend env var | Purpose | Default |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | backend origin (REST **and** WebSocket) | `http://localhost:8000` |

### 3. Tests

```bash
cd backend
pip install -r requirements-dev.txt
pytest
```

32 tests cover the REST API and the WebSocket protocol (auth, presence, chat persistence, host-only enforcement, waiting room, remove, mute, polls, ending a meeting). VideoSDK calls are mocked, so tests need no network or credentials.

## API

### REST (`/api`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/meetings/instant` | Create an instant meeting (returns the creator's `host_token`) |
| POST | `/meetings/schedule` | Schedule a meeting (title, description, `scheduled_at`, duration) |
| GET | `/meetings/upcoming` | Future scheduled meetings, soonest first |
| GET | `/meetings/recent` | Ended meetings, most recent first |
| GET | `/meetings/{id}` | Look up / validate a meeting |
| POST | `/meetings/{id}/join` | Register a participant; returns a `session_key` and, unless waiting, a media token |
| POST | `/meetings/{id}/participants/{pid}/token` | Claim a media token after the host admits you |
| POST | `/meetings/{id}/leave` | Record leaving |
| POST | `/meetings/{id}/end` | End the meeting — **host token required** (`X-Host-Token`) |
| DELETE | `/meetings/{id}` | Delete a meeting — **host token required** |

### WebSocket: `/api/ws/{meeting_id}?participant_id=…&key=…`

Authenticated with the participant's `session_key` from `/join`; the role always comes from the server.
On connect the server sends a `state` snapshot (roster, controls, chat history, polls, your votes), so reconnecting is self-healing.

- **Any participant:** `chat`, `reaction`, `raise-hand`, `poll-vote`
- **Host only:** `poll-create`, `poll-close`, `set-controls` (lock, waiting room, allow_share/chat/unmute), `admit`, `deny`, `remove`, `mute`, `end-meeting`
- **Server → client:** `state`, `participant-joined/left`, `waiting-joined/left`, `controls-updated`, `chat`, `reaction`, `hand`, `poll-created/updated`, `vote-recorded`, `admitted`, `denied`, `removed`, `meeting-ended`, `error`

## Assumptions and design notes

1. **No login required** — as instructed, a default user ("Alex Johnson") is assumed to be signed in. Host identity is instead a per-meeting secret (`host_token`) returned to the creator and remembered in that browser's `localStorage`, so the creator can reload, or start a scheduled meeting later, as host. A different browser is a guest.
2. **Times are stored in UTC** and shown in the viewer's local timezone. Upcoming lists only future, not-yet-started meetings.
3. **Joining a scheduled meeting starts it** (it moves to *live* and leaves Upcoming).
4. **Host controls are enforced server-side**: guests get `forbidden` for host-only events, waiting-room guests get no media token, removed guests can't claim a new one, and only host tokens carry VideoSDK moderation rights (mute/remove).
5. **Chat attachments** are uploaded to VideoSDK's temporary file storage; the message stores only the link and metadata.
6. **Sample data** — `python seed.py` loads upcoming and past meetings (with participants, chat and a poll).

## Known limitations

- The WebSocket room registry is **in memory**, so run the backend as a **single worker/process**. Scaling out would need a shared pub/sub (e.g. Redis).
- SQLite is fine for this scope; on hosts with an ephemeral disk the data resets on each deploy (re-run `python seed.py`).
- Closing a tab doesn't mark a participant as "left" in the database (that would break quick reconnects); leaving, being removed, or the meeting ending does.
- In development you may see `ERROR_OPERATION_IN_PROGRESS` in the console: React's dev-only Strict Mode runs the join effect twice. It doesn't happen in a production build.
- Cloud recording depends on your VideoSDK plan.

## Deployment notes

- **Frontend** (e.g. Vercel): set `NEXT_PUBLIC_API_URL` to the deployed backend URL. It is baked in at build time, so redeploy after changing it.
- **Backend** (e.g. Render / Railway): start with `uvicorn app.main:app --host 0.0.0.0 --port $PORT` (one worker). Set `VIDEOSDK_API_KEY`, `VIDEOSDK_SECRET`, and `CORS_ORIGINS` to a JSON list containing your frontend origin, e.g. `["https://your-app.vercel.app"]`.
- Serve both over **HTTPS**: browsers only allow camera/microphone on secure origins, and an `https://` API URL makes the app use `wss://` for the WebSocket automatically.
