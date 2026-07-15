/**
 * LiveRoomLK — LiveKit-powered live room.
 *
 * This is the new transport layer for live sessions. It uses LiveKit Cloud
 * (an SFU) instead of mesh WebRTC, eliminating glare, one-way audio bugs,
 * and signaling reliability issues.
 *
 * Activated via URL flag `?lk=1` while we validate it. Old LiveRoom.tsx
 * remains the default until we promote this one.
 *
 * Preserved features (Phase 2):
 *  - Audio publish/subscribe (the actual reliability fix)
 *  - Camera publish/subscribe
 *  - Screen share publish/subscribe (desktop only — mobile shows toast)
 *  - Members panel (LiveKit participants)
 *  - Live chat (still uses live_chat_messages + Supabase Realtime)
 *  - Leave / session end
 *  - Mentor force-mute (via LiveKit data channel + admin permission)
 *  - Mentor kick (LiveKit removeParticipant via edge call — TODO Phase 3)
 *  - RTL Hebrew UI matching existing LiveRoom look
 *
 * Deferred to Phase 3 (still uses old LiveRoom for now if needed):
 *  - Collaborative drawing overlay
 *  - Mentor recording (will move to LiveKit egress)
 *  - Screen-share approval flow (mentor approves student request)
 *  - Room lock
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useRemoteParticipants,
  useTracks,
  useRoomContext,
  ParticipantTile,
  TrackRefContext,
  GridLayout,
  ConnectionStateToast,
} from '@livekit/components-react';
import {
  Track,
  RoomEvent,
  ConnectionState,
  Participant,
  RemoteParticipant,
  DataPacket_Kind,
} from 'livekit-client';
import '@livekit/components-styles';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff,
  PhoneOff, Users, MessageSquare, Send, X, Wifi, WifiOff,
  UserX, Volume2, VolumeX,
} from 'lucide-react';

interface Props {
  sessionId: string;
  mentorId: string;
  userId: string;
  userName: string;
  sessionTitle: string;
  isMentor?: boolean;
  onClose: () => void;
}

interface ChatMessage {
  id: string;
  user_id: string;
  display_name: string;
  message: string;
  created_at: string;
}

const isScreenShareSupported = (): boolean => {
  try {
    return typeof navigator !== 'undefined'
      && !!navigator.mediaDevices
      && typeof navigator.mediaDevices.getDisplayMedia === 'function';
  } catch {
    return false;
  }
};

// ────────────────────────────────────────────────────────────────────
// Outer wrapper — fetches token from edge function, then mounts <LiveKitRoom>
// ────────────────────────────────────────────────────────────────────
export default function LiveRoomLK(props: Props) {
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('livekit-token', {
          body: {
            sessionId: props.sessionId,
            displayName: props.userName,
          },
        });
        if (cancelled) return;
        if (error) {
          throw new Error(error.message || 'Failed to fetch token');
        }
        if (!data?.token || !data?.url) {
          throw new Error('Invalid token response');
        }
        setToken(data.token);
        setServerUrl(data.url);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('[LiveRoomLK] token fetch failed:', msg);
        setTokenError(msg);
        toast({
          title: 'שגיאת התחברות',
          description: 'לא ניתן להצטרף ללייב. נסה שוב.',
          variant: 'destructive',
        });
      }
    })();
    return () => { cancelled = true; };
  }, [props.sessionId, props.userName, toast]);

  if (tokenError) {
    return (
      <div className="fixed inset-0 z-[200] bg-background flex items-center justify-center" dir="rtl">
        <div className="bg-card rounded-2xl card-shadow p-8 max-w-md w-full mx-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <WifiOff className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-2">שגיאת התחברות</h2>
          <p className="text-sm text-muted-foreground mb-6">{tokenError}</p>
          <button
            onClick={props.onClose}
            className="h-11 px-6 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 transition-all"
          >
            סגור
          </button>
        </div>
      </div>
    );
  }

  if (!token || !serverUrl) {
    return (
      <div className="fixed inset-0 z-[200] bg-background flex items-center justify-center" dir="rtl">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center mx-auto animate-pulse">
            <Wifi className="w-5 h-5 text-primary-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">מתחבר לשרת הלייב...</p>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect={true}
      audio={false}
      video={false}
      onDisconnected={() => {
        // Trigger close when LiveKit disconnects (e.g. mentor ended session)
        props.onClose();
      }}
      data-lk-theme="default"
      style={{ height: '100vh' }}
    >
      <RoomAudioRenderer />
      <ConnectionStateToast />
      <RoomInner {...props} />
    </LiveKitRoom>
  );
}

// ────────────────────────────────────────────────────────────────────
// Inner room — has access to LiveKit context via hooks
// ────────────────────────────────────────────────────────────────────
function RoomInner({ sessionId, mentorId, userId, userName, sessionTitle, isMentor = false, onClose }: Props) {
  const { toast } = useToast();
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();

  const [micEnabled, setMicEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // ── Subscribe to all camera + screen share tracks for the grid ──
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  // ── Listen for moderation data messages (force-mute) ──
  useEffect(() => {
    const handleData = (
      payload: Uint8Array,
      participant?: RemoteParticipant,
    ) => {
      try {
        const text = new TextDecoder().decode(payload);
        const msg = JSON.parse(text);
        if (msg.type === 'force-mute' && msg.targetIdentity === userId) {
          if (localParticipant.isMicrophoneEnabled) {
            localParticipant.setMicrophoneEnabled(false).catch(() => {});
            setMicEnabled(false);
            toast({
              title: 'הושתקת על ידי המנטור',
              description: 'המיקרופון שלך הושתק.',
            });
          }
        }
      } catch {
        // ignore non-JSON data
      }
    };
    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [room, userId, localParticipant, toast]);

  // ── Detect remote screen share for "X is sharing screen" hint ──
  const screenShareTrack = tracks.find(
    (t) => t.source === Track.Source.ScreenShare && t.publication?.isSubscribed,
  );

  // ── Chat: load + subscribe via existing Supabase table ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from('live_chat_messages') as any)
        .select('id, user_id, display_name, message, created_at')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
        .limit(100);
      if (!cancelled && data) setChatMessages(data);
    })();

    const channel = supabase
      .channel(`live-chat-lk-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_chat_messages',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          setChatMessages((prev) => {
            const m = payload.new as ChatMessage;
            if (prev.some((x) => x.id === m.id)) return prev;
            return [...prev, m];
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // ── Mic toggle ──
  const toggleMic = useCallback(async () => {
    try {
      const newState = !micEnabled;
      await localParticipant.setMicrophoneEnabled(newState);
      setMicEnabled(newState);
    } catch (err) {
      console.error('[LiveRoomLK] mic toggle failed:', err);
      toast({
        title: 'שגיאת מיקרופון',
        description: 'לא ניתן להפעיל את המיקרופון. בדוק הרשאות.',
        variant: 'destructive',
      });
    }
  }, [micEnabled, localParticipant, toast]);

  // ── Camera toggle ──
  const toggleCamera = useCallback(async () => {
    try {
      const newState = !cameraEnabled;
      await localParticipant.setCameraEnabled(newState);
      setCameraEnabled(newState);
    } catch (err) {
      console.error('[LiveRoomLK] camera toggle failed:', err);
      toast({
        title: 'שגיאת מצלמה',
        description: 'לא ניתן להפעיל את המצלמה. בדוק הרשאות.',
        variant: 'destructive',
      });
    }
  }, [cameraEnabled, localParticipant, toast]);

  // ── Screen share toggle ──
  const toggleScreenShare = useCallback(async () => {
    if (!isScreenShareSupported()) {
      toast({
        title: 'שיתוף מסך לא זמין',
        description: 'שיתוף מסך אינו נתמך במכשיר נייד. השתמש במחשב.',
        variant: 'destructive',
      });
      return;
    }
    try {
      const newState = !screenSharing;
      await localParticipant.setScreenShareEnabled(newState);
      setScreenSharing(newState);
    } catch (err) {
      console.error('[LiveRoomLK] screen share toggle failed:', err);
      // User-cancelled the picker → not an error
      if (err instanceof Error && err.name === 'NotAllowedError') return;
      toast({
        title: 'שגיאת שיתוף מסך',
        description: 'לא ניתן לשתף את המסך כעת.',
        variant: 'destructive',
      });
    }
  }, [screenSharing, localParticipant, toast]);

  // ── Audio output mute (deafen-equivalent: mute all subscribed audio) ──
  const toggleAudio = useCallback(() => {
    const next = !audioMuted;
    setAudioMuted(next);
    // Mute remote audio elements via DOM (RoomAudioRenderer renders <audio> tags)
    document.querySelectorAll<HTMLAudioElement>('audio').forEach((el) => {
      el.muted = next;
    });
  }, [audioMuted]);

  // ── Force-mute a remote participant (mentor only) ──
  const forceMute = useCallback(async (target: Participant) => {
    if (!isMentor) return;
    try {
      const payload = new TextEncoder().encode(
        JSON.stringify({ type: 'force-mute', targetIdentity: target.identity }),
      );
      await room.localParticipant.publishData(payload, { reliable: true });
      toast({
        title: 'בקשת השתקה נשלחה',
        description: `${target.name || 'המשתמש'} הושתק.`,
      });
    } catch (err) {
      console.error('[LiveRoomLK] force mute failed:', err);
    }
  }, [isMentor, room, toast]);

  // ── Send chat ──
  const sendChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || isSending) return;
    setIsSending(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('live_chat_messages') as any).insert({
        session_id: sessionId,
        user_id: userId,
        display_name: userName,
        message: text,
      });
      if (error) throw error;
      setChatInput('');
    } catch (err) {
      console.error('[LiveRoomLK] chat send failed:', err);
      toast({
        title: 'שגיאת שליחה',
        description: 'לא ניתן לשלוח את ההודעה.',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  }, [chatInput, isSending, sessionId, userId, userName, toast]);

  // ── Leave room ──
  const handleLeave = useCallback(async () => {
    try {
      // Mentor ending session → mark inactive in DB
      if (isMentor && mentorId === userId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('live_sessions') as any)
          .update({ status: 'ended', ended_at: new Date().toISOString() })
          .eq('id', sessionId);
      }
      await room.disconnect();
    } finally {
      onClose();
    }
  }, [isMentor, mentorId, userId, sessionId, room, onClose]);

  // ── Connection state ──
  const connectionState = room.state;
  const allParticipants = [localParticipant, ...remoteParticipants];

  return (
    <div className="fixed inset-0 z-[200] bg-background flex flex-col" dir="rtl">
      {/* Header */}
      <div className="h-14 bg-card border-b border-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
            <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{sessionTitle}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <span>{allParticipants.length} משתתפים</span>
              <span className="text-muted-foreground/50">•</span>
              <span className="flex items-center gap-1">
                {connectionState === ConnectionState.Connected ? (
                  <><Wifi className="w-3 h-3 text-emerald-500" /> מחובר</>
                ) : (
                  <><WifiOff className="w-3 h-3 text-amber-500" /> מתחבר...</>
                )}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowMembers((v) => !v); setShowChat(false); }}
            className={`h-9 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              showMembers ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
            aria-label="משתתפים"
          >
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">{allParticipants.length}</span>
          </button>
          <button
            onClick={() => { setShowChat((v) => !v); setShowMembers(false); }}
            className={`h-9 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              showChat ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
            aria-label="צ'אט"
          >
            <MessageSquare className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-lg bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center"
            aria-label="סגור"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Video grid */}
        <div className="flex-1 min-w-0 bg-background p-2 sm:p-4 overflow-hidden">
          {screenShareTrack ? (
            // Speaker view: screen share large, others as strip
            <div className="h-full flex flex-col gap-2">
              <div className="flex-1 min-h-0 rounded-xl overflow-hidden bg-black">
                <TrackRefContext.Provider value={screenShareTrack}>
                  <ParticipantTile />
                </TrackRefContext.Provider>
              </div>
              <div className="h-24 sm:h-28 flex gap-2 overflow-x-auto shrink-0">
                {tracks
                  .filter((t) => t.source === Track.Source.Camera)
                  .map((trackRef) => (
                    <div
                      key={`${trackRef.participant.identity}-${trackRef.source}`}
                      className="aspect-video h-full rounded-lg overflow-hidden bg-card shrink-0"
                    >
                      <TrackRefContext.Provider value={trackRef}>
                        <ParticipantTile />
                      </TrackRefContext.Provider>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <GridLayout tracks={tracks.filter((t) => t.source === Track.Source.Camera)} style={{ height: '100%' }}>
              <ParticipantTile />
            </GridLayout>
          )}
        </div>

        {/* Members panel — desktop side, mobile drawer */}
        <AnimatePresence>
          {showMembers && (
            <>
              {/* Mobile backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="md:hidden fixed inset-0 bg-black/50 z-40"
                onClick={() => setShowMembers(false)}
              />
              <motion.div
                initial={{ x: '100%', opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: '100%', opacity: 0 }}
                transition={{ type: 'tween', duration: 0.25 }}
                className="md:relative md:w-[280px] md:shrink-0 fixed inset-y-14 end-0 w-[85vw] max-w-[320px] z-50 bg-card border-s border-border flex flex-col"
              >
                <div className="h-12 px-4 border-b border-border flex items-center justify-between shrink-0">
                  <p className="text-sm font-bold text-foreground">משתתפים ({allParticipants.length})</p>
                  <button
                    onClick={() => setShowMembers(false)}
                    className="md:hidden text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {allParticipants.map((p) => (
                    <ParticipantRow
                      key={p.identity}
                      participant={p}
                      isLocal={p.identity === userId}
                      isMentor={isMentor}
                      mentorId={mentorId}
                      onForceMute={forceMute}
                    />
                  ))}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Chat panel */}
        <AnimatePresence>
          {showChat && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="md:hidden fixed inset-0 bg-black/50 z-40"
                onClick={() => setShowChat(false)}
              />
              <motion.div
                initial={{ x: '100%', opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: '100%', opacity: 0 }}
                transition={{ type: 'tween', duration: 0.25 }}
                className="md:relative md:w-[320px] md:shrink-0 fixed inset-y-14 end-0 w-[85vw] max-w-[360px] z-50 bg-card border-s border-border flex flex-col"
              >
                <div className="h-12 px-4 border-b border-border flex items-center justify-between shrink-0">
                  <p className="text-sm font-bold text-foreground">צ'אט</p>
                  <button
                    onClick={() => setShowChat(false)}
                    className="md:hidden text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
                  {chatMessages.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8">אין הודעות עדיין</p>
                  ) : chatMessages.map((m) => (
                    <div key={m.id} className={`flex flex-col ${m.user_id === userId ? 'items-end' : 'items-start'}`}>
                      <p className="text-[10px] text-muted-foreground mb-0.5">{m.display_name}</p>
                      <div className={`max-w-[85%] rounded-xl px-3 py-1.5 text-sm ${
                        m.user_id === userId
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground'
                      }`}>
                        {m.message}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-2 border-t border-border flex gap-2 shrink-0">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
                    placeholder="הודעה..."
                    className="flex-1 h-9 px-3 text-sm bg-muted text-foreground rounded-lg outline-none"
                    disabled={isSending}
                  />
                  <button
                    onClick={sendChat}
                    disabled={isSending || !chatInput.trim()}
                    className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom controls */}
      <div className="h-16 sm:h-20 bg-card border-t border-border flex items-center justify-center gap-2 sm:gap-3 px-2 shrink-0">
        <ControlButton
          active={micEnabled}
          activeIcon={<Mic className="w-5 h-5" />}
          inactiveIcon={<MicOff className="w-5 h-5" />}
          activeColor="bg-emerald-500/20 text-emerald-500"
          inactiveColor="bg-muted text-muted-foreground"
          onClick={toggleMic}
          label={micEnabled ? 'השתק' : 'הפעל מיקרופון'}
        />
        <ControlButton
          active={!audioMuted}
          activeIcon={<Volume2 className="w-5 h-5" />}
          inactiveIcon={<VolumeX className="w-5 h-5" />}
          activeColor="bg-[rgba(226,181,78,0.20)] text-[#e2b54e]"
          inactiveColor="bg-muted text-muted-foreground"
          onClick={toggleAudio}
          label={audioMuted ? 'הפעל שמע' : 'השתק שמע'}
        />
        <ControlButton
          active={cameraEnabled}
          activeIcon={<Video className="w-5 h-5" />}
          inactiveIcon={<VideoOff className="w-5 h-5" />}
          activeColor="bg-[rgba(226,181,78,0.20)] text-[#e2b54e]"
          inactiveColor="bg-muted text-muted-foreground"
          onClick={toggleCamera}
          label={cameraEnabled ? 'כבה מצלמה' : 'הפעל מצלמה'}
        />
        <ControlButton
          active={screenSharing}
          activeIcon={<Monitor className="w-5 h-5" />}
          inactiveIcon={<MonitorOff className="w-5 h-5" />}
          activeColor="bg-amber-500/20 text-amber-500"
          inactiveColor="bg-muted text-muted-foreground"
          onClick={toggleScreenShare}
          label={screenSharing ? 'הפסק שיתוף' : 'שתף מסך'}
        />
        <button
          onClick={handleLeave}
          className="h-11 px-3 sm:px-5 bg-destructive text-destructive-foreground rounded-xl flex items-center gap-2 hover:opacity-90 transition-all font-medium text-sm"
          aria-label="עזוב לייב"
        >
          <PhoneOff className="w-4 h-4" />
          <span className="hidden sm:inline">{isMentor && mentorId === userId ? 'סיים לייב' : 'עזוב'}</span>
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Subcomponents
// ────────────────────────────────────────────────────────────────────
function ControlButton({
  active, activeIcon, inactiveIcon, activeColor, inactiveColor, onClick, label,
}: {
  active: boolean;
  activeIcon: React.ReactNode;
  inactiveIcon: React.ReactNode;
  activeColor: string;
  inactiveColor: string;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`h-11 w-11 sm:h-12 sm:w-12 rounded-xl flex items-center justify-center transition-all hover:scale-105 ${
        active ? activeColor : inactiveColor
      }`}
    >
      {active ? activeIcon : inactiveIcon}
    </button>
  );
}

function ParticipantRow({
  participant, isLocal, isMentor, mentorId, onForceMute,
}: {
  participant: Participant;
  isLocal: boolean;
  isMentor: boolean;
  mentorId: string;
  onForceMute: (p: Participant) => void;
}) {
  const isMicOn = participant.isMicrophoneEnabled;
  const isCamOn = participant.isCameraEnabled;
  const isSpeaking = participant.isSpeaking;
  const isParticipantMentor = participant.identity === mentorId;
  const showForceMute = isMentor && !isLocal && isMicOn;

  return (
    <div className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
      isSpeaking ? 'bg-emerald-500/10 ring-1 ring-emerald-500/40' : 'hover:bg-muted/50'
    }`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
        isParticipantMentor ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
      }`}>
        {(participant.name || participant.identity).charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {participant.name || 'משתמש'}
          {isLocal && <span className="text-muted-foreground"> (אתה)</span>}
          {isParticipantMentor && <span className="text-primary text-[10px] ms-1">מנטור</span>}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {isMicOn ? <Mic className="w-3.5 h-3.5 text-emerald-500" /> : <MicOff className="w-3.5 h-3.5 text-muted-foreground" />}
        {isCamOn && <Video className="w-3.5 h-3.5 text-[#e2b54e]" />}
        {showForceMute && (
          <button
            onClick={() => onForceMute(participant)}
            className="ms-1 p-1 rounded hover:bg-destructive/20 text-destructive"
            title="השתק"
          >
            <UserX className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
