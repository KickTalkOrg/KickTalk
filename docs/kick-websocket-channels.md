# Kick WebSocket Channel Guide

This document summarizes which Pusher channel subscriptions deliver which Kick events, how the IDs relate, and example subscribe frames. It reflects what we observe in production and what the app subscribes to for reliability.

## IDs and what they mean

- `streamerId`: Channel (profile) ID of the streamer (e.g., from `GET /api/v2/channels/<slug> -> data.id`).
- `chatroomId`: Chatroom ID used for chat messages (`data.chatroom.id`).
- `livestreamId`: Current livestream session ID when a stream is live (`data.livestream.id`).

These IDs are different; subscribing with the wrong one yields no events.

## Channel patterns and their events

1) `channel.<streamerId>` and `channel_<streamerId>` (public)

- Primary source for streamer lifecycle and channel-level events:
  - `App\Events\StreamerIsLive`
  - `App\Events\StopStreamBroadcast`
  - `App\Events\LivestreamUpdated`
  - Often also: `App\Events\PollUpdateEvent`, `App\Events\PollDeleteEvent`, `App\Events\PinnedMessageCreatedEvent`, `App\Events\PinnedMessageDeletedEvent`
- Notes:
  - Both dot and underscore variants exist in the wild. We subscribe to both for resilience.
  - These events fire on state transitions (e.g., when going live), not continuously.

2) `chatrooms.<chatroomId>` and `chatrooms.<chatroomId>.v2` (public)

- Primary source for chat and moderation events:
  - `App\Events\ChatMessageEvent`
  - `App\Events\MessageDeletedEvent`
  - `App\Events\UserBannedEvent`
  - `App\Events\UserUnbannedEvent`
- Sometimes also carries channel-level updates (e.g., `ChatroomUpdatedEvent`, polls/pins), but do not rely on it for live/on‑off.

3) `chatroom_<chatroomId>` (public, legacy/alias)

- Legacy alias occasionally used in some deployments. Rarely carries unique events today but we include it for completeness.

4) `private-livestream.<livestreamId>` (private, requires auth)

- Livestream-scoped updates; observed to include some of the live lifecycle details while a stream is active.
- Requires auth via `POST https://kick.com/broadcasting/auth` with your `socket_id` and channel name.
- Only exists while the streamer is live (ephemeral). Use alongside the public `channel.<streamerId>`.

## Subscribing examples (raw frames)

Public channels (no auth field required):

```
{"event":"pusher:subscribe","data":{"auth":"","channel":"channel.<streamerId>"}}
{"event":"pusher:subscribe","data":{"auth":"","channel":"channel_<streamerId>"}}
{"event":"pusher:subscribe","data":{"auth":"","channel":"chatrooms.<chatroomId>"}}
{"event":"pusher:subscribe","data":{"auth":"","channel":"chatrooms.<chatroomId>.v2"}}
{"event":"pusher:subscribe","data":{"auth":"","channel":"chatroom_<chatroomId>"}}
```

Private livestream channel (requires auth):

1) Resolve auth:

```
POST https://kick.com/broadcasting/auth
Body: { "socket_id": "<your_socket_id>", "channel_name": "private-livestream.<livestreamId>" }
Headers/Cookies: valid Kick session (Authorization: Bearer <session_token>, cookies for kick_session / XSRF)
```

2) Subscribe with returned `auth`:

```
{"event":"pusher:subscribe","data":{"auth":"<returned_auth>","channel":"private-livestream.<livestreamId>"}}
```

## When do StreamerIsLive / StopStreamBroadcast arrive?

- Typically on `channel.<streamerId>` (and sometimes mirrored elsewhere). They emit only on transitions (when going live or ending), not periodically. If nothing changes while you’re listening, you won’t see them.
- We recommend subscribing to both `channel.<streamerId>` and `private-livestream.<livestreamId>` (when live and authenticated) to maximize coverage.

## App strategy (why multiple subscriptions)

- The app subscribes to all known aliases for robustness across regions/rollouts:
  - Chat: `chatrooms.<id>`, `chatrooms.<id>.v2` (and `chatroom_<id>`)
  - Channel: `channel.<id>`, `channel_<id>`
  - Livestream: `private-livestream.<id>` (with auth when available)
- Incoming events are mapped to chatrooms by parsing the channel name or by matching `streamerId`/`livestreamId` to known chatrooms.
- Unknown/unmapped events are logged and reported to telemetry for analysis.

## Quick ID discovery

- `GET https://kick.com/api/v2/channels/<slug>` →
  - `data.id` → `streamerId`
  - `data.chatroom.id` → `chatroomId`
  - `data.livestream.id` (when live) → `livestreamId`

## Caveats

- Channel usage can change; treat the above as what’s observed today. Keep both dot/underscore variants for channel-level events.
- Private livestream channels require valid auth and only exist while a stream is live.

