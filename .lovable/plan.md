

## Diagnosis: Why Audio Is Unreliable

Looking at the current architecture: `LiveRoom.tsx` uses **mesh WebRTC** (every participant connects directly to every other participant) with Supabase Realtime as the signaling channel. This is the root of the instability.

**Concrete failure modes I can identify:**

1. **Mesh topology doesn't scale and is fragile.** With N participants you have N×(N-1)/2 peer connections. Every join/leave triggers a storm of offers/answers. One failed handshake = one-way audio for that pair only — exactly the "I hear them, they don't hear me" symptom you're describing.

2. **Glare / SDP collisions.** When two peers create offers simultaneously (common when several people join at once), one side's `setRemoteDescription` fails silently. We added pre-reserved audio transceivers recently, which helped, but didn't eliminate the race. There's no "polite peer" pattern implemented.

3. **No ICE restart on network changes.** Mobile users switching Wi-Fi → 4G keep a dead connection. The other side still sees them as "connected."

4. **Signaling is fire-and-forget.** Supabase Realtime broadcasts have no delivery guarantee. If an `answer` or `ice_candidate` is dropped, the connection is permanently broken — no retry, no ack.

5. **No connection health monitoring.** We don't watch `iceConnectionState === 'failed'` and renegotiate. Dead peers stay in the participant list with a green dot.

6. **Track lifecycle bugs.** Mute/unmute uses `replaceTrack`, but if the transceiver direction is wrong (`recvonly` instead of `sendrecv`) the other side never gets the unmute. This is intermittent based on join order.

This is why fixes feel like whack-a-mole — the architecture itself is the problem, not any single bug.

---

## The Three Real Options

### Option A — Harden the existing mesh (1–2 days, low risk, ceiling ~6 people)

Keep WebRTC mesh + Supabase signaling. Add the missing reliability layers:

- Implement the **"Perfect Negotiation" pattern** (polite/impolite peer roles) — this is the W3C-standard fix for glare. Eliminates SDP collisions deterministically.
- Add **signaling ACKs + retries** — every offer/answer/ICE message gets an ID; sender retries until acked.
- Add **ICE restart on `iceConnectionState === 'failed'`** — auto-recover from network drops without rejoining.
- Add **per-peer health watchdog** using `RTCPeerConnection.getStats()` — detect zero inbound packets for 5s → renegotiate that peer only.
- Force **`sendrecv` direction** on all transceivers at creation time, never let them drift to `recvonly`.
- **TURN server**: confirm we have one configured. Without TURN, ~15% of users (corporate/symmetric NAT) silently fail. *(I'd need to check your current ICE config.)*

Trade-off: Audio reliability goes from ~70% to ~95% for groups ≤6. Above 6 participants, mesh CPU/bandwidth still degrades. No code rewrite of the UI, drawing, recording, screen-share-approval, or moderation features.

### Option B — SFU (Selective Forwarding Unit) via LiveKit (3–5 days, medium risk, scales to 100+)

Replace the WebRTC mesh layer with **LiveKit Cloud** (or self-hosted). Each participant connects to ONE server, server forwards streams.

- Solves audio reliability **definitively** — server-mediated, no glare, no mesh storms, automatic reconnect, automatic ICE restart, built-in TURN.
- LiveKit React SDK gives us `<RoomAudioRenderer>`, `<ParticipantTile>`, mute/unmute hooks — we wire our existing UI to their primitives.
- Recording becomes server-side (better quality, no tab-capture hack).
- Screen sharing works identically on desktop AND becomes more reliable on mobile (still subject to OS limits).
- ~$0 for low usage on LiveKit Cloud free tier; self-host on a $5 VPS.

Keep: All UI, drawing overlay (it's canvas-on-top, transport-agnostic), Q&A, recording prompt UI, moderation controls, mentor/student roles, RLS, invitations.

Replace: Just `LiveRoom.tsx`'s WebRTC + signaling internals (~600 lines) with LiveKit hooks.

Trade-off: Adds an external dependency. Costs scale with minutes used (free tier covers small mentor groups easily).

### Option C — Daily.co or Agora drop-in (2–3 days, lowest implementation risk, paid)

Use a fully-managed video API. They give you `<DailyCall>` / `<AgoraVideoCall>` components — drop in, done.

- Most reliable audio/video on the market, period. This is what Zoom-alternatives use.
- Mobile screen share works where the OS allows it.
- Recording, transcription, noise suppression all built-in.

Trade-off: Paid from day one (Daily: $4/1000 participant-minutes). Less control over the UI internals — drawing overlay still works, but moderation hooks need to map to their API. Vendor lock-in.

---

## My Recommendation

**Option B (LiveKit).** Here's why for your specific case:

- Your symptoms (intermittent one-way audio, "sometimes works") are *textbook mesh failure*. Option A patches them but the ceiling is still ~6 people and complexity stays high.
- LiveKit is open-source, has a generous free cloud tier, and the React SDK matches your stack exactly.
- The recent work we did (UI, mobile layout, drawing, recording prompt, screen-share approval, moderation, RTL) is **all preserved** — only the WebRTC plumbing inside `LiveRoom.tsx` gets swapped.
- Audio reliability becomes a solved problem, not a perpetual debugging task.

**If you want to stay 100% in-house with no third party, pick A.** It's a real improvement and buys you 6 months. But you'll be back here when the group grows.

---

## Plan if You Approve Option B (LiveKit)

1. **Set up LiveKit Cloud account** — you create the project, share the API key + secret as Lovable Cloud secrets (`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`).
2. **New edge function `livekit-token`** — generates a signed JWT per user with their role (mentor=can-publish+admin, student=can-publish+can-subscribe). Uses existing Supabase auth.
3. **Refactor `LiveRoom.tsx`** internals only:
   - Remove: peer connection map, signaling channel, offer/answer/ICE handlers, transceiver management (~600 lines).
   - Add: `<LiveKitRoom>` wrapper, `useLocalParticipant`, `useRemoteParticipants`, `useTracks` hooks (~200 lines).
   - Keep: All current UI, drawing overlay, controls bar, mobile drawers, members panel, chat, moderation buttons (force-mute, kick, lock), recording prompt, screen-share approval flow.
4. **Map our moderation actions to LiveKit:**
   - Force-mute → `participant.setTrackSubscriptionPermissions` + server-side mute via Room Service API
   - Kick → `roomService.removeParticipant`
   - Room lock → token issuance gate in edge function
5. **Mobile screen-share** — LiveKit handles capability detection; we keep our Hebrew "not supported" toast as fallback.
6. **Recording** — move from tab-capture to LiveKit's `egress` API (server-side MP4). Keeps the same "Save recording?" prompt.
7. **Migration safety**: Build behind a feature flag (`USE_LIVEKIT=true`). Old code stays for one release cycle for rollback.
8. **Test matrix**: 1-on-1 desktop, 1-on-1 mobile, 4-person mixed, mentor mute student, student request screen share, mentor leave/rejoin, mobile network switch (Wi-Fi→4G).

**What I need from you to proceed with B:**
- LiveKit account (free tier, takes 2 min: livekit.io/cloud)
- API Key, API Secret, and WSS URL — paste them as secrets when prompted

**What I need to proceed with A instead:**
- Just approval. I'll start by reading current ICE config and `LiveRoom.tsx` signaling section, then ship the perfect-negotiation + ACK/retry + ICE-restart patches.

Pick A, B, or C and I'll execute.

