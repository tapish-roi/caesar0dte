/**
 * LiveBroadcast — Mentor-side live streaming component.
 *
 * Flow:
 * 1. Mentor selects screen source (window / full screen) via getDisplayMedia
 * 2. Mentor optionally picks a microphone
 * 3. On "Go Live": creates a live_session row, publishes a community post of type "live",
 *    then waits for viewer join signals via Supabase Realtime.
 * 4. For each viewer that joins, opens a WebRTC PeerConnection and sends the stream.
 * 5. "End Live" closes all connections and marks session as ended.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Monitor, Wifi, MicOff, Mic, X, Users, Radio,
  MonitorPlay, Maximize2, ChevronDown,
} from 'lucide-react';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

interface Props {
  mentorId: string;
  onClose: () => void;
  onPostCreated?: (postId: string) => void;
}

type ShareMode = 'screen' | 'window' | null;

export default function LiveBroadcast({ mentorId, onClose, onPostCreated }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState<'setup' | 'live'>('setup');
  const [shareMode, setShareMode] = useState<ShareMode>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState<string>('');
  const [micEnabled, setMicEnabled] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [postId, setPostId] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [liveTitle, setLiveTitle] = useState('');
  const [showMicMenu, setShowMicMenu] = useState(false);

  const previewRef = useRef<HTMLVideoElement>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const sessionIdRef = useRef<string | null>(null);
  const signalChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Load audio devices ──
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const mics = devices.filter(d => d.kind === 'audioinput');
      setAudioDevices(mics);
      if (mics.length > 0) setSelectedMic(mics[0].deviceId);
    });
  }, []);

  // ── Preview local stream ──
  useEffect(() => {
    if (previewRef.current && localStream) {
      previewRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // ── Pick screen/window ──
  const pickScreen = useCallback(async (type: 'screen' | 'window') => {
    try {
      // Stop previous screen stream
      screenStreamRef.current?.getTracks().forEach(t => t.stop());

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: type === 'window' ? 'window' : 'monitor',
          frameRate: 30,
        } as MediaTrackConstraints,
        audio: false, // we'll mix mic separately
      });
      screenStreamRef.current = stream;
      setShareMode(type);

      // Stop on native browser "Stop sharing" button
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        setLocalStream(null);
        setShareMode(null);
        screenStreamRef.current = null;
      });

      // Combine with mic if already acquired
      const combined = buildCombinedStream(stream, micStreamRef.current);
      setLocalStream(combined);
    } catch (err) {
      if ((err as DOMException).name !== 'NotAllowedError') {
        toast({ title: 'שגיאה בשיתוף המסך', variant: 'destructive' });
      }
    }
  }, [toast]);

  // ── Pick mic ──
  const acquireMic = useCallback(async (deviceId: string) => {
    try {
      micStreamRef.current?.getTracks().forEach(t => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
      micStreamRef.current = stream;
      // rebuild combined stream
      if (screenStreamRef.current) {
        const combined = buildCombinedStream(screenStreamRef.current, stream);
        setLocalStream(combined);
      }
    } catch {
      toast({ title: 'לא ניתן לגשת למיקרופון', variant: 'destructive' });
    }
  }, [toast]);

  // ── Toggle mic ──
  const toggleMic = useCallback(() => {
    const tracks = micStreamRef.current?.getAudioTracks();
    if (!tracks?.length) return;
    tracks.forEach(t => { t.enabled = !t.enabled; });
    setMicEnabled(e => !e);
  }, []);

  // ── Build combined MediaStream ──
  function buildCombinedStream(video: MediaStream, audio: MediaStream | null): MediaStream {
    const tracks: MediaStreamTrack[] = [];
    video.getVideoTracks().forEach(t => tracks.push(t));
    audio?.getAudioTracks().forEach(t => tracks.push(t));
    return new MediaStream(tracks);
  }

  // ── Go Live ──
  const goLive = useCallback(async () => {
    if (!localStream || !shareMode) return;
    setIsStarting(true);
    try {
      // 1. Create session
      const title = liveTitle.trim() || 'לייב סשן';
      const { data: session, error: sessErr } = await supabase
        .from('live_sessions')
        .insert({ mentor_id: mentorId, title, status: 'active' })
        .select('id')
        .single();
      if (sessErr) throw sessErr;

      sessionIdRef.current = session.id;
      setSessionId(session.id);

      // 2. Publish community post
      const { data: post, error: postErr } = await supabase
        .from('community_posts')
        .insert({
          mentor_id: mentorId,
          content: title,
          post_type: 'live',
          is_pinned: false,
        })
        .select('id')
        .single();
      if (postErr) throw postErr;
      setPostId(post.id);
      onPostCreated?.(post.id);

      // 3. Subscribe to viewer join signals
      const channel = supabase
        .channel(`live-${session.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'live_signals',
          filter: `session_id=eq.${session.id}`,
        }, async (payload) => {
          const sig = payload.new as {
            id: string;
            from_user_id: string;
            to_user_id: string;
            signal_type: string;
            payload: Record<string, unknown>;
          };
          // Only handle signals TO mentor
          if (sig.to_user_id !== mentorId) return;

          if (sig.signal_type === 'join') {
            await handleViewerJoin(sig.from_user_id, session.id);
          } else if (sig.signal_type === 'answer') {
            const pc = peersRef.current.get(sig.from_user_id);
            if (pc) {
              await pc.setRemoteDescription(new RTCSessionDescription(sig.payload as unknown as RTCSessionDescriptionInit));
            }
          } else if (sig.signal_type === 'ice-candidate') {
            const pc = peersRef.current.get(sig.from_user_id);
            if (pc && sig.payload.candidate) {
              await pc.addIceCandidate(new RTCIceCandidate(sig.payload as unknown as RTCIceCandidateInit));
            }
          }
        })
        .subscribe();

      signalChannelRef.current = channel;
      setStep('live');
    } catch {
      toast({ title: 'שגיאה בהתחלת הלייב', variant: 'destructive' });
    } finally {
      setIsStarting(false);
    }
  }, [localStream, shareMode, liveTitle, mentorId, onPostCreated, toast]);

  // ── Handle new viewer joining ──
  const handleViewerJoin = useCallback(async (viewerId: string, sessId: string) => {
    const stream = localStream ?? screenStreamRef.current;
    if (!stream) return;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peersRef.current.set(viewerId, pc);
    setViewerCount(c => c + 1);

    // Add tracks
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    // ICE candidates
    pc.onicecandidate = async (e) => {
      if (!e.candidate) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('live_signals') as any).insert({
        session_id: sessId,
        from_user_id: mentorId,
        to_user_id: viewerId,
        signal_type: 'ice-candidate',
        payload: e.candidate.toJSON(),
      });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        peersRef.current.delete(viewerId);
        setViewerCount(c => Math.max(0, c - 1));
      }
    };

    // Create and send offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('live_signals') as any).insert({
      session_id: sessId,
      from_user_id: mentorId,
      to_user_id: viewerId,
      signal_type: 'offer',
      payload: { type: offer.type, sdp: offer.sdp },
    });
  }, [localStream, mentorId]);

  // ── End Live ──
  const endLive = useCallback(async () => {
    const sessId = sessionIdRef.current;

    // Close all peer connections
    peersRef.current.forEach(pc => pc.close());
    peersRef.current.clear();

    // Stop tracks
    localStream?.getTracks().forEach(t => t.stop());
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current?.getTracks().forEach(t => t.stop());

    // Remove channel
    if (signalChannelRef.current) {
      supabase.removeChannel(signalChannelRef.current);
    }

    if (sessId) {
      // Mark session ended
      await supabase.from('live_sessions').update({
        status: 'ended',
        ended_at: new Date().toISOString(),
      }).eq('id', sessId);
    }

    // Update post to "ended" by appending to content
    if (postId) {
      await supabase.from('community_posts').update({
        content: (liveTitle.trim() || 'לייב סשן') + ' (הסתיים)',
      }).eq('id', postId);
    }

    toast({ title: 'הלייב הסתיים' });
    onClose();
  }, [localStream, liveTitle, postId, onClose, toast]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      if (step !== 'live') {
        localStream?.getTracks().forEach(t => t.stop());
        micStreamRef.current?.getTracks().forEach(t => t.stop());
        screenStreamRef.current?.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // ── UI ──
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" dir="rtl">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        className="relative w-full max-w-2xl bg-card rounded-2xl shadow-2xl border border-border overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            {step === 'live' ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />
                <span className="text-sm font-bold text-destructive uppercase tracking-wider">LIVE</span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />{viewerCount}
                </span>
              </>
            ) : (
              <>
                <Radio className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">הגדרת לייב</span>
              </>
            )}
          </div>
          {step === 'setup' && (
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="p-6 space-y-5">

          {/* ── SETUP STEP ── */}
          {step === 'setup' && (
            <>
              {/* Session title */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">כותרת הסשן</label>
                <input
                  value={liveTitle}
                  onChange={e => setLiveTitle(e.target.value)}
                  placeholder="לדוגמה: מסחר חי על S&P500 — גישת הבוקר"
                  className="w-full h-11 px-4 bg-background ring-1 ring-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all text-right"
                />
              </div>

              {/* Screen sharing */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">שיתוף מסך</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => pickScreen('screen')}
                    className={`flex flex-col items-center gap-2.5 p-4 rounded-xl border transition-all ${
                      shareMode === 'screen'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground'
                    }`}
                  >
                    <Maximize2 className="w-6 h-6" />
                    <span className="text-xs font-medium">כל המסך</span>
                    {shareMode === 'screen' && <span className="text-[10px] text-primary/70">✓ נבחר</span>}
                  </button>
                  <button
                    onClick={() => pickScreen('window')}
                    className={`flex flex-col items-center gap-2.5 p-4 rounded-xl border transition-all ${
                      shareMode === 'window'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground'
                    }`}
                  >
                    <MonitorPlay className="w-6 h-6" />
                    <span className="text-xs font-medium">חלון ספציפי</span>
                    {shareMode === 'window' && <span className="text-[10px] text-primary/70">✓ נבחר</span>}
                  </button>
                </div>
              </div>

              {/* Preview */}
              {localStream && (
                <div className="rounded-xl overflow-hidden bg-foreground/5 border border-border aspect-video relative">
                  <video
                    ref={previewRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute top-2 right-2 px-2 py-0.5 bg-foreground/60 rounded-full text-[10px] text-background flex items-center gap-1">
                    <Monitor className="w-3 h-3" />
                    תצוגה מקדימה
                  </div>
                </div>
              )}

              {/* Microphone */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">מיקרופון</label>
                <div className="flex gap-2">
                  {/* Mic selector */}
                  <div className="relative flex-1">
                    <button
                      onClick={() => setShowMicMenu(v => !v)}
                      className="w-full flex items-center gap-2 h-10 px-3 bg-background ring-1 ring-border rounded-xl text-sm text-foreground hover:ring-accent transition-all"
                    >
                      <Mic className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 text-right truncate text-sm">
                        {audioDevices.find(d => d.deviceId === selectedMic)?.label || 'מיקרופון ברירת מחדל'}
                      </span>
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    </button>
                    <AnimatePresence>
                      {showMicMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className="absolute top-full mt-1 right-0 left-0 z-10 bg-card border border-border rounded-xl shadow-lg overflow-hidden"
                        >
                          {audioDevices.length === 0 ? (
                            <div className="px-4 py-3 text-xs text-muted-foreground">לא נמצאו מיקרופונים</div>
                          ) : audioDevices.map(d => (
                            <button
                              key={d.deviceId}
                              onClick={() => {
                                setSelectedMic(d.deviceId);
                                setShowMicMenu(false);
                                acquireMic(d.deviceId);
                              }}
                              className={`w-full text-right px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors ${
                                selectedMic === d.deviceId ? 'text-primary font-medium' : 'text-foreground'
                              }`}
                            >
                              {d.label || `מיקרופון ${d.deviceId.slice(0, 6)}`}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Acquire mic button */}
                  <button
                    onClick={() => acquireMic(selectedMic)}
                    className="h-10 px-4 rounded-xl bg-muted text-foreground text-xs font-medium hover:bg-muted/80 transition-all shrink-0"
                  >
                    בדוק
                  </button>
                </div>
              </div>

              {/* Go Live button */}
              <button
                onClick={goLive}
                disabled={!localStream || !shareMode || isStarting}
                className="w-full h-12 bg-destructive text-destructive-foreground rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-40 hover:opacity-90"
              >
                {isStarting ? (
                  <><div className="w-4 h-4 border-2 border-destructive-foreground border-t-transparent rounded-full animate-spin" />מכין לייב...</>
                ) : (
                  <><Wifi className="w-4 h-4" />התחל לייב</>
                )}
              </button>
            </>
          )}

          {/* ── LIVE STEP ── */}
          {step === 'live' && (
            <>
              {/* Live preview */}
              <div className="rounded-xl overflow-hidden bg-foreground/5 border border-border aspect-video relative">
                <video
                  ref={previewRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-contain"
                />
                <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 bg-destructive rounded-full text-destructive-foreground text-xs font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-destructive-foreground animate-pulse" />
                  LIVE
                </div>
                <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 bg-foreground/50 rounded-full text-background text-xs">
                  <Users className="w-3 h-3" />
                  {viewerCount} צופים
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleMic}
                  className={`flex items-center gap-2 h-10 px-4 rounded-xl border text-sm font-medium transition-all ${
                    micEnabled
                      ? 'border-border text-foreground hover:bg-muted'
                      : 'border-destructive/30 bg-destructive/10 text-destructive'
                  }`}
                >
                  {micEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                  {micEnabled ? 'מיקרופון פעיל' : 'מיקרופון כבוי'}
                </button>

                <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-xl">
                  <MonitorPlay className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground truncate">
                    {shareMode === 'screen' ? 'שיתוף כל המסך' : 'שיתוף חלון'}
                  </span>
                </div>

                <button
                  onClick={endLive}
                  className="h-10 px-5 bg-destructive text-destructive-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-all"
                >
                  סיים לייב
                </button>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                התלמידים שלך יכולים לצפות בלייב ולהפעיל מיקרופון מתוך עמוד הקהילה
              </p>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
