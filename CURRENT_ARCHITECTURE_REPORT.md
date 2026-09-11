# MusicSync Current Architecture Report

**Scope:** Read-only inspection of the current implementation.

**Code changes made while producing this report:** None.

## 1. Executive Summary

The repository contains an Express/Mongoose backend in `backend`, a React/Vite frontend in `frontend`, a separate legacy filesystem music server in `MusicServer`, and an Expo mobile project.

The active web application contains two playback systems:

1. A legacy global playback system in `frontend/src/App.jsx` and `backend/server.js`.
2. The active Room playback system in `RoomPage.jsx`, `MusicPlayer.jsx`, and the `room:*` Socket.IO handlers.

The global player is disabled with `SHOW_MUSIC_PLAYER = false`, but its socket listeners and backend handlers remain active.

Room playback state exists in multiple places:

- MongoDB `Room.playback`.
- Backend process memory in `roomPlaybackStates`.
- React state in `RoomPage`.
- React state in `App` for legacy playback.
- The browser's HTML audio element.

The active Room system uses server-generated timestamps for Room song selection, play, and seek. However, the initiating client also performs an optimistic local update before receiving the authoritative broadcast, so the initiating and remote clients do not initially follow identical paths.

## 2. Repository Architecture

### Backend

`backend/server.js` is the active entrypoint. It creates Express, creates an HTTP server, initializes Socket.IO, registers `/auth`, `/chat`, and `/rooms`, exposes song endpoints, connects to MongoDB, and starts listening.

`backend/db.js` connects through `MONGODB_URI` or `MONGO_URI`.

`backend/r2.js` configures the Cloudflare R2 S3 client used for audio storage.

HTTP authentication is implemented by `backend/middleware/auth.js`. It expects:

```http
Authorization: Bearer <JWT>
```

The middleware verifies `JWT_SECRET` and assigns `req.user.userId`.

Socket authentication is implemented in `backend/server.js`. The client sends:

```js
io(SOCKET_URL, { auth: { token } })
```

The server verifies the token from `socket.handshake.auth.token` and assigns `socket.userId`.

There is no React Router, React Context provider, custom socket hook, or custom audio hook. Navigation is conditional rendering controlled by `App.jsx` state.

### Frontend socket ownership

`App.jsx` creates one authenticated Socket.IO connection. `ChatsPage.jsx` creates another authenticated connection. `RoomPage.jsx` receives and reuses the App-level socket.

## 3. Room Architecture

### Room schema

`backend/models/Room.js` stores:

```js
{
    roomCode: String,
    owner: User ObjectId,
    members: [User ObjectId],
    lastActivity: Date,
    playback: {
        songId: Song ObjectId,
        isPlaying: Boolean,
        position: Number,
        updatedAt: Date,
        startedAt: Date
    },
    createdAt: Date,
    updatedAt: Date
}
```

`roomCode` is unique and immutable. `owner` is indexed. `lastActivity` is indexed. There is a compound index on `{ members: 1, updatedAt: -1 }`.

Members are stored as an array of MongoDB ObjectIds referencing `User`. There is no separate RoomMember model and no array-level uniqueness constraint.

### Create Room

The frontend `HomeDashboard` calls `App.handleCreateRoom()`, which calls `createRoom()` in `frontend/src/api.js`.

The request is:

```http
POST /rooms
```

with no request body and the authenticated Bearer token.

The backend route:

1. Generates a unique `ROOM-XXXXXXXX` code.
2. Sets the authenticated user as owner.
3. Adds the user as the first member.
4. Initializes empty playback state.
5. Saves the Room.
6. Populates owner and members.
7. Returns `{ success: true, room }`.

The frontend stores `room.id` in React state and in `localStorage['activeRoomId']`, then renders `RoomPage`.

### Room metadata

```http
GET /rooms/:roomId
```

Requires the authenticated user to already be in `room.members`. It returns serialized owner, members, timestamps, member count, and playback fields.

### Room playlist

```http
GET /rooms/:roomId/playlist
```

Requires Room membership. It dynamically finds all Songs where `uploadedBy` is one of the Room members, groups them by uploader, and returns the grouped playlist. There is no separate persisted playlist collection.

### Leave Room

```http
POST /rooms/:roomId/leave
```

Requires membership. The owner cannot leave. Non-owners are removed from `members`, `lastActivity` is updated, and `room:playlist_updated` is emitted. There is no owner transfer or Room deletion route.

## 4. Room Invitations

There is no separate invitation model. Invitations are stored as `Message` documents:

```js
{
    kind: 'room_invite',
    room: Room ObjectId,
    invitee: User ObjectId,
    conversation: Conversation ObjectId,
    sender: User ObjectId,
    content: String
}
```

### Send invitation

```http
POST /rooms/:roomId/invite
```

Body:

```json
{ "friendId": "..." }
```

The route verifies Room membership, verifies an accepted Friendship, rejects users already in the Room, obtains the direct Conversation, rejects an existing matching invite, creates a `room_invite` Message, updates the Conversation last-message summary, emits `chat:message`, and returns the Message and Room.

### Join invitation

```http
POST /rooms/:roomId/join
```

Body:

```json
{ "messageId": "..." }
```

The backend requires a Message matching:

```js
{
    _id: messageId,
    kind: 'room_invite',
    room: room._id,
    invitee: req.user.userId
}
```

If valid, the user is appended to `room.members`, the Room is saved, playlist/member events are emitted, and the serialized Room is returned.

Invitations:

- Do not expire.
- Are not deleted after use.
- Are not marked consumed.
- Can be reused after leaving.
- Do not re-check Friendship status during join.
- Remain visible in DM history.

### Frontend invitation flow

`RoomPage` loads accepted friends through `GET /chat/inbox`. Clicking Send Invite calls `sendRoomInvite()`.

`ChatsPage` renders `room_invite` Messages with a Join room button. The button calls `joinRoomInvite(roomId, message._id)`. On success, `onRoomJoined()` updates App's `activeRoomId`, which renders `RoomPage`.

## 5. Friends Architecture

`backend/models/Friendship.js` stores:

```js
{
    sender: User ObjectId,
    recipient: User ObjectId,
    pairKey: String,
    status: 'pending' | 'accepted' | 'rejected',
    createdAt: Date,
    updatedAt: Date
}
```

`pairKey` is unique and sparse. It is generated by sorting the two user IDs and joining them with `:`.

Indexes exist on:

```js
{ recipient: 1, status: 1, createdAt: -1 }
{ sender: 1, status: 1, createdAt: -1 }
```

### Lookup

```http
GET /chat/lookup?listenerId=12345
```

Requires authentication, validates five digits, rejects self lookup, and returns the public User plus any existing relationship status.

### Send request

```http
POST /chat/requests
```

Body:

```json
{ "listenerId": "12345" }
```

The backend finds the recipient, rejects self-requests, checks both directions and `pairKey` for an existing relationship, then creates a pending Friendship.

### Accept/reject

```http
PATCH /chat/requests/:id
```

Body:

```json
{ "status": "accepted" }
```

or:

```json
{ "status": "rejected" }
```

Only the addressed recipient can update a pending request. Rejected relationships remain stored and prevent another request.

### Accepted friends

```http
GET /chat/inbox
```

The route finds pending and accepted relationships involving the authenticated user, builds accepted friend records, loads Conversations, and attaches latest-message information. Friends are sorted by latest message timestamp.

There is no friendship deletion route.

## 6. Direct Messages

### Conversation schema

`backend/models/Conversation.js` stores:

```js
{
    participantKey: String,
    participants: [User ObjectId],
    lastMessage: {
        content: String,
        sender: User ObjectId,
        createdAt: Date
    },
    createdAt: Date,
    updatedAt: Date
}
```

`participantKey` is unique and immutable. It is the sorted pair of the two user IDs, enforcing one Conversation per pair.

### Message schema

`backend/models/Message.js` stores:

```js
{
    conversation: Conversation ObjectId,
    sender: User ObjectId,
    content: String,
    kind: 'text' | 'room_invite',
    room: Room ObjectId | null,
    invitee: User ObjectId | null,
    createdAt: Date,
    updatedAt: Date
}
```

Indexes include:

```js
{ conversation: 1, createdAt: 1 }
{ sender: 1 }
{ kind: 1 }
```

### Open Conversation

```http
POST /chat/conversations/with/:friendId
```

The frontend calls `openConversation()`, then `fetchMessages()`, sets the history in React, and emits `chat:join`.

The backend requires an accepted Friendship, rejects self-conversations, and creates or retrieves the Conversation by `participantKey`.

### Fetch messages

```http
GET /chat/conversations/:conversationId/messages
```

The backend authorizes Conversation access, loads up to 500 messages, populates senders, and sorts oldest first.

### Send message

```http
POST /chat/conversations/:conversationId/messages
```

The backend validates content, authorizes access, saves the Message, updates Conversation last-message fields, and emits `chat:message` to both the Conversation Socket.IO room and the recipient's personal user room.

Messages are persisted through REST. Socket.IO is used for live notification and delivery. Offline users receive messages from MongoDB when `fetchMessages()` runs after refresh or reopening the conversation.

`ChatsPage` deduplicates messages by `_id` because a message can arrive through both delivery paths.

## 7. Socket.IO Architecture

The backend initializes Socket.IO in `backend/server.js` and stores the instance on the Express app as `app.set('io', io)`.

On connection, the backend:

1. Verifies JWT authentication.
2. Sets `socket.userId`.
3. Joins `user:<userId>`.
4. Emits the legacy global `playback_state`.

The frontend creates two authenticated sockets:

- App-level socket in `App.jsx`.
- ChatsPage socket in `ChatsPage.jsx`.

RoomPage reuses the App-level socket.

## 8. Complete Socket Event Table

| Event | Emitted by | Backend/client receiver | Payload | Current behavior |
|---|---|---|---|---|
| `connect` | Socket.IO client | App | Internal socket data | Logs connection |
| `disconnect` | Socket.IO client | App | Reason | Logs disconnect |
| `connect_error` | Socket.IO client | App/ChatsPage | Error | Logs or displays error |
| `chat:join` | ChatsPage | Backend | `conversationId`, optional callback | Verifies Conversation access and joins `conversation:<id>` |
| `chat:leave` | ChatsPage | Backend | `conversationId` | Leaves Conversation room |
| `chat:message` | Backend routes | ChatsPage | Persisted Message object | Adds live DM or Room invitation |
| `room:join` | RoomPage | Backend | `roomId`, callback | Verifies membership, joins `room:<id>`, sends current playback |
| `room:leave` | RoomPage | Backend | `roomId` | Leaves Room socket room |
| `room:playlist_updated` | Backend room routes | RoomPage | `{ roomId, playlist }` | Replaces Room playlist |
| `room:members_updated` | Backend join route | No active frontend listener | `{ roomId, room }` | Currently ignored by RoomPage |
| `room:select_song` | RoomPage | Backend | `{ roomId, songId, shouldPlay, position, startedAt }` | Persists playing state and broadcasts Room playback |
| `room:playback_state` | Backend | RoomPage | `{ roomId, currentSongId, playbackState, playbackPosition, lastUpdatedAt, startedAt }` | Selects song and controls MusicPlayer |
| `room:play` | Room MusicPlayer | Backend | `{ roomId, songId, position, playbackState }` | Persists playing state |
| `room:pause` | Room MusicPlayer | Backend | `{ roomId, songId, position, playbackState }` | Persists paused state |
| `room:seek` | Room MusicPlayer | Backend | `{ roomId, songId, position, playbackState }` | Persists position and current play state |
| `playback_state` | Backend | App socket | `{ currentSongId, isPlaying, position, updatedAt }` | Legacy global playback |
| `change_current_song` | App library | Backend | String or `{ songId, shouldPlay, position }` | Mutates global playback |
| `play` | Legacy MusicPlayer | Backend | `{ songId?, position? }` | Mutates global playback |
| `pause` | Legacy MusicPlayer | Backend | `{ songId?, position? }` | Mutates global playback |
| `seek` | Legacy MusicPlayer | Backend | `{ songId?, position? }` | Mutates global playback |
| `song_ended` | Legacy MusicPlayer | Backend | `{ songId }` | Selects a random global song |

## 9. Socket Room Membership

Authenticated sockets automatically join:

```text
user:<userId>
```

`chat:join` joins:

```text
conversation:<conversationId>
```

`room:join` joins:

```text
room:<roomId>
```

Room membership is checked against the MongoDB Room members array before `socket.join()`.

RoomPage emits `room:leave` during cleanup. Socket.IO also removes memberships automatically when a socket disconnects.

There is no reconnect handler in RoomPage that re-emits `room:join`. Reconnection therefore restores the authenticated user room but not necessarily the active Room socket membership.

Multiple tabs or devices use independent sockets. MongoDB membership is shared, but Socket.IO membership is per connection.

## 10. Audio Architecture

`MusicPlayer.jsx` owns one HTML audio element:

```jsx
<audio ref={audioRef} preload="metadata" />
```

The element is stored in `useRef` and is not recreated on normal React renders.

When the song ID changes, the player pauses, resets `currentTime`, sets `/songs/:id/stream`, and calls `load()`.

Registered audio events:

- `loadedmetadata`
- `canplay`
- `timeupdate`
- `play`
- `pause`
- `seeked`
- `ended`
- `error`

The implementation does not register `seeking`, `canplaythrough`, `input`, or `change` listeners.

### Event effects

- `loadedmetadata` updates duration.
- `canplay` starts pending remote playback.
- `timeupdate` updates React current time.
- `play` updates `isPlaying` and emits local Play unless suppressed.
- `pause` updates `isPlaying` and emits local Pause unless suppressed.
- `seeked` emits local Seek unless suppressed.
- `ended` resets local state and emits the configured ended callback.
- `error` displays an error and sets local playing state false.

## 11. Song Selection Flow

When User A clicks a Room song:

1. `RoomPage.handleSelectSong()` runs.
2. A client-side `startAt = Date.now() + 750` is calculated.
3. `selectedSong` is updated immediately.
4. `roomPlaybackCommand` is updated immediately.
5. MusicPlayer loads the new audio source.
6. RoomPage emits `room:select_song`.
7. The backend validates Room membership and verifies that the Song belongs to a Room member.
8. The backend ignores the client `shouldPlay`, `position`, and `startedAt` values.
9. The backend always persists playing position zero and its own `startedAt = Date.now() + 750`.
10. The backend emits `room:playback_state` to the Room.
11. User A and User B receive the broadcast.
12. Each client selects the song and creates a playback command.
13. Each MusicPlayer loads the source, calculates position, waits for readiness if needed, and attempts playback.

User A follows an optimistic local path first. User B follows only the server broadcast path.

## 12. Play Flow

When User A presses Play:

1. MusicPlayer calls `audio.play()`.
2. The native `play` event fires after successful playback.
3. MusicPlayer calls RoomPage's `onLocalPlay` unless suppressed.
4. RoomPage emits `room:play`.
5. The backend loads Room state and verifies membership.
6. The backend persists `playing`, the current position, and `startedAt = Date.now() + 650`.
7. The backend broadcasts `room:playback_state`.
8. User B applies the command and schedules/starts playback.
9. User A also receives the broadcast despite already playing.

The implementation uses `Date.now()`, future `startedAt` values, and elapsed-time calculations. It does not use a synchronized protocol beyond Unix epoch timestamps.

## 13. Pause Flow

When User A presses Pause:

1. MusicPlayer calls `audio.pause()`.
2. The native `pause` event fires.
3. MusicPlayer reads the local `audio.currentTime`.
4. RoomPage emits `room:pause` with that position.
5. The backend verifies membership.
6. The backend persists paused state, the client-reported position, and `startedAt: null`.
7. The backend broadcasts `room:playback_state`.
8. Other clients apply the supplied position and pause.

The backend does not independently calculate elapsed position from timestamps.

## 14. Seek Flow

The seek range input uses `onChange={handleSeek}`. `handleSeek()` directly assigns `audio.currentTime` and updates React state.

The native `seeked` event emits `room:seek`. Because the range input changes continuously, multiple seek events can be sent during one drag.

`handleSeekCommit()` exists but is empty.

The backend persists the supplied position. If the stored Room state is playing, it creates a new future `startedAt = Date.now() + 400`; otherwise `startedAt` is cleared.

Remote clients receive the resulting Room playback state and apply the position and play/pause state.

## 15. Authoritative Playback State

There is no single authoritative location.

### MongoDB

`Room.playback` stores `songId`, `isPlaying`, `position`, `updatedAt`, and `startedAt`.

### Backend memory

`roomPlaybackStates` stores the latest serialized Room playback payload in a process-local Map. It is lost on backend restart.

### Legacy backend memory

The separate global `playbackState` stores `currentSongId`, `isPlaying`, `position`, and `updatedAt`. It is not Room-scoped or persisted.

### React

RoomPage stores `roomPlaybackState` and `roomPlaybackCommand`. App stores legacy playback state and commands.

### Browser audio

The actual `<audio>` element owns current local play/pause state and `currentTime`.

These locations can temporarily disagree.

## 16. Local vs Remote Event Handling

MusicPlayer uses refs to distinguish native events caused by local actions from events caused by remote commands:

```js
pendingRemotePlayRef
suppressPlayEventRef
suppressPauseEventRef
suppressSeekEventRef
```

Remote `play`, `pause`, and `currentTime` assignments set suppression flags before invoking the audio operation. Local button actions do not set those flags, so their native events emit Room playback events.

The server broadcasts Room state to the initiating socket as well as other Room sockets. The suppression flags attempt to prevent remote playback from being rebroadcast, but there is no event ID or source-socket tracking.

## 17. Socket Listener Lifecycle

### App

The App socket effect depends on:

```js
[authSession?.token, isAuthenticated]
```

It registers `connect`, `disconnect`, `connect_error`, and `playback_state`. Cleanup disconnects the socket.

### ChatsPage

The ChatsPage socket effect depends on:

```js
[token]
```

It registers `chat:message` and `connect_error`. Cleanup disconnects the socket.

### RoomPage

The RoomPage socket effect depends on:

```js
[flattenedSongs, roomId, socket]
```

It emits `room:join`, registers `room:playlist_updated` and `room:playback_state`, and cleans up by emitting `room:leave` and calling `socket.off()` without handler references.

Because `flattenedSongs` is a dependency, playlist changes tear down and recreate Room listeners and Room membership.

The Room effect emits `room:join` before registering the playback-state listener, so the initial state event can race with listener registration.

## 18. Audio Lifecycle

When a song changes:

1. The existing audio is paused.
2. `currentTime` is reset to zero.
3. The old source is replaced or removed.
4. `audio.load()` is called.
5. Audio event listeners are registered.
6. Cleanup later pauses audio and removes listeners.

Remote playback waits for `readyState >= 2` or the `canplay` event before calling `audio.play()`.

It does not wait for `canplaythrough`.

A scheduled remote play uses `setTimeout()` until the supplied `startedAt` timestamp.

## 19. Autoplay Handling

Remote `audio.play()` Promise rejections are handled by `handleRemotePlayFailure()`.

For `NotAllowedError`, the UI displays:

```text
Tap Play to allow playback on this device.
```

Other remote failures display:

```text
Remote playback could not start on this device.
```

Local playback failures display:

```text
Playback was blocked or the audio could not be loaded.
```

A failed remote client does not emit pause, alter MongoDB, or reconcile its local state with the Room.

## 20. Late Join Behavior

A joining client:

1. Joins through the REST invitation endpoint.
2. Mounts RoomPage.
3. Loads Room metadata and playlist.
4. Emits `room:join`.
5. Receives Room playback state from the backend.
6. Selects the current Song.
7. Calculates elapsed position from `startedAt`.
8. Attempts playback.

The initial playback event can be missed because the backend emits it immediately during `room:join`, while RoomPage registers the listener after emitting the join event.

If the current song is not yet in `flattenedSongs`, RoomPage stores playback state but does not immediately create a MusicPlayer command. Playlist changes can cause the effect to rerun and request the state again.

Browser autoplay restrictions can prevent automatic playback. The server remains marked as playing if a late joiner's playback is rejected.

## 21. Reconnect Behavior

On disconnect, Socket.IO removes the socket from user, conversation, and Room socket rooms.

On reconnect:

- The socket is authenticated again.
- It rejoins `user:<userId>`.
- It receives legacy global `playback_state`.
- RoomPage does not explicitly rejoin the Room.
- ChatsPage does not explicitly rejoin the active Conversation.

Page refresh preserves JWT/user session, `activeRoomId`, MongoDB membership, MongoDB Room playback, messages, invitations, and songs.

Page refresh loses React playback state, the audio element, Socket.IO membership, and the process-local playback Map is lost if the backend restarts.

## 22. Legacy/Duplicate Code

The backend retains a global playback system with:

- `change_current_song`
- `play`
- `pause`
- `seek`
- `song_ended`
- `playback_state`

These are separate from the Room events and broadcast globally with no Room ID.

App retains the corresponding global playback state, callbacks, and socket listener even though `SHOW_MUSIC_PLAYER` is false.

There are two authenticated frontend Socket.IO connections in the same browser when ChatsPage is mounted.

The backend emits `room:members_updated`, but RoomPage has no listener.

Room uploads do not emit playlist updates to currently open Rooms.

## 23. Concrete Failure Points

1. The initiating client and remote clients follow different song-selection paths.
2. The client-generated song-selection timestamp is ignored by the backend and replaced with another timestamp.
3. The initiating client can already be playing when it processes its own authoritative broadcast.
4. The initial Room playback event can arrive before RoomPage registers its listener.
5. Reconnect does not restore Room Socket.IO membership.
6. Room cleanup uses event-wide `socket.off()` on a shared socket.
7. Playlist changes recreate the Room socket effect.
8. Seek events can be emitted repeatedly while dragging.
9. Every Room playback update waits for MongoDB load/save before broadcasting.
10. Pause position is client-reported rather than server-calculated.
11. Failed remote autoplay does not reconcile Room state.
12. Playback state exists in several competing locations.
13. Legacy global playback is not Room-isolated.
14. Room play/pause/seek handlers do not validate that supplied song IDs belong to Room members.
15. Malformed song IDs can fail during ObjectId construction.
16. Room member updates are emitted but not consumed by the frontend.
17. Invitations are not expired or consumed.
18. Two browser sockets can receive personal broadcasts independently.
19. Restored `activeRoomId` can render RoomPage before `socketRef.current` is available.
20. The song stream endpoint is not protected by HTTP authentication.

## 24. Full End-to-End Data Flow

### User A selects Song X

```text
RoomPage.handleSelectSong
→ client-side startAt calculated
→ selectedSong React state updated
→ roomPlaybackCommand React state updated
→ MusicPlayer loads Song X stream
→ room:select_song emitted
→ backend verifies Room membership
→ backend verifies Song belongs to a Room member
→ backend ignores client timing fields
→ backend persists Room.playback
→ backend updates roomPlaybackStates
→ room:playback_state broadcast
→ User A and User B receive event
→ each RoomPage selects Song X
→ each MusicPlayer applies position/timestamp
→ each MusicPlayer waits for canplay if necessary
→ each MusicPlayer attempts audio.play()
```

### User A presses Play

```text
MusicPlayer.handlePlay
→ audio.play()
→ native play event
→ RoomPage onLocalPlay
→ room:play emitted
→ backend loads and validates Room
→ backend persists playing position and future startedAt
→ backend broadcasts room:playback_state
→ User A reapplies authoritative state
→ User B schedules/applies playback
```

### User A presses Pause

```text
MusicPlayer.handlePause
→ audio.pause()
→ native pause event
→ local audio.currentTime read
→ room:pause emitted
→ backend persists paused state and client position
→ backend clears startedAt
→ room:playback_state broadcast
→ Room clients apply position and pause
```

### User A seeks to 45 seconds

```text
range onChange
→ audio.currentTime = 45
→ native seeked event
→ room:seek emitted
→ possibly repeated during drag
→ backend persists position 45
→ backend creates future startedAt if Room is playing
→ room:playback_state broadcast
→ remote clients apply position and play/pause state
```

### User C joins while playing

```text
Join room button
→ POST /rooms/:roomId/join
→ invitation Message validated
→ User C added to Room.members
→ App stores activeRoomId
→ RoomPage mounts
→ Room metadata and playlist fetched
→ room:join emitted
→ backend verifies membership
→ socket joins room:<roomId>
→ backend sends current Room playback
→ RoomPage selects current song
→ MusicPlayer loads stream
→ elapsed playback position calculated from startedAt
→ automatic audio.play() attempted
→ browser autoplay policy may reject playback
```

## 25. Files Inspected

### Backend

- `backend/server.js` — Express, Socket.IO, song endpoints, global playback, Room socket handlers.
- `backend/db.js` — MongoDB connection.
- `backend/r2.js` — R2 client.
- `backend/middleware/auth.js` — JWT HTTP authentication.
- `backend/models/User.js` — User schema.
- `backend/models/Song.js` — Song schema.
- `backend/models/Room.js` — Room and persisted playback schema.
- `backend/models/Friendship.js` — Friendship schema.
- `backend/models/Conversation.js` — Conversation schema.
- `backend/models/Message.js` — Text and Room invitation message schema.
- `backend/services/chatService.js` — Friendship authorization, Conversation creation, message creation.
- `backend/routes/auth.js` — Signup, signin, current-user routes.
- `backend/routes/chat.js` — Friend requests, inbox, conversations, messages.
- `backend/routes/rooms.js` — Room creation, membership, playlist, invitations, join, leave.
- `backend/package.json` — Backend scripts and dependencies.

### Frontend

- `frontend/src/main.jsx` — React bootstrap.
- `frontend/src/App.jsx` — Authentication, navigation, App socket, active Room state, legacy playback.
- `frontend/src/api.js` — REST API functions and stored authentication.
- `frontend/src/components/AuthScreen.jsx` — Authentication UI.
- `frontend/src/components/HomeDashboard.jsx` — Home page and recent chats.
- `frontend/src/components/ChatsPage.jsx` — Friends, DMs, invitations, second socket.
- `frontend/src/components/RoomPage.jsx` — Room UI, playlist, invitations, Room socket, Room playback.
- `frontend/src/components/MusicPlayer.jsx` — HTML audio lifecycle and playback controls.
- `frontend/src/components/SongLibrary.jsx` — Library and song selection.
- `frontend/src/components/ProfilePage.jsx` — Profile UI.
- `frontend/src/components/UploadSong.jsx` — Upload UI.
- `frontend/package.json` — Frontend scripts and dependencies.
- `frontend/vite.config.js` — Vite configuration.
- `frontend/eslint.config.js` — ESLint configuration.

### Separate or legacy areas

- `MusicServer/server.js` — Separate filesystem music server on port 5000; no Room or Socket.IO implementation.
- `mobile-frontend/mobile/src` — Expo application; no discovered active Room, Socket.IO, or audio synchronization implementation.
- `mobile-frontend/mobile/AGENTS.md` — Mobile instructions.
- `mobile-frontend/mobile/CLAUDE.md` — Mobile notes.
- `mobile-frontend/mobile/package.json` — Mobile dependencies and scripts.
