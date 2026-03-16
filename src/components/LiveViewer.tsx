/**
 * LiveViewer — Student-side live stream viewer component.
 *
 * Flow:
 * 1. Student opens the live post → LiveViewer mounts.
 * 2. Sends a "join" signal to mentor via live_signals.
 * 3. Waits for mentor's "offer" signal, sets remote description.
 * 4. Creates answer, sends back.
 * 5. ICE candidates are exchanged.
 * 6. Remote video/audio stream plays.
 * 7. Student can optionally enable their own microphone.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Mic, MicOff, Volume2, VolumeX, Users, Wifi,
  WifiOff, X, ChevronDown,
} from 'lucide-react';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

interface Props {
  sessionId: string;
  mentorId: string;
  userId: string;
  sessionTitle: string;
  onClose: () => void;
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'failed';

export default function LiveViewer({ sessionId, mentorId, userId, sessionTitle, onClose }: Props) {
  const { toast } = useToast();
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [micEnabled, setMicEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState('');
  const [showMicMenu, setShowMicMenu] = useState(false);
  const [hasRemoteStream, setHasRemoteStream] = useState(false);

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const signalChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Load audio devices ──
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const mics = devices.filter(d => d.kind === 'audioinput');
      setAudioDevices(mics);
      if (mics.length > 0) setSelectedMic(mics[0].deviceId);
    });
  }, []);

  // ── Init WebRTC ──
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      // Handle remote stream
      pc.ontrack = (event) => {
        if (cancelled) return;
        const [remoteStream] = event.streams;
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
        setHasRemoteStream(true);
        setStatus('connected');
      };

      pc.onconnectionstatechange = () => {
        if (cancelled) return;
        const state = pc.connectionState;
        if (state === 'connected') setStatus('connected');
        if (state === 'disconnected' || state === 'failed') setStatus('disconnected');
      };

      // Subscribe to signals directed at this user
      const channel = supabase
        .channel(`live-viewer-${sessionId}-${userId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'live_signals',
          filter: `session_id=eq.${sessionId}`,
        }, async (payload) => {
          if (cancelled) return;
          const sig = payload.new as {
            id: string;
            from_user_id: string;
            to_user_id: string;
            signal_type: string;
            payload: Record<string, unknown>;
          };

          // Only handle signals TO this user from mentor
          if (sig.to_user_id !== userId) return;

          if (sig.signal_type === 'offer' && sig.from_user_id === mentorId) {
            await pc.setRemoteDescription(new RTCSessionDescription(sig.payload as unknown as RTCSessionDescriptionInit));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.from('live_signals') as any).insert({
              session_id: sessionId,
              from_user_id: userId,
              to_user_id: mentorId,
              signal_type: 'answer',
              payload: { type: answer.type, sdp: answer.sdp },
            });
          } else if (sig.signal_type === 'ice-candidate') {
            if (sig.payload.candidate) {
              await pc.addIceCandidate(new RTCIceCandidate(sig.payload as unknown as RTCIceCandidateInit));
            }
          }
        })
        .subscribe();

      signalChannelRef.current = channel;

      // ICE from viewer side
      pc.onicecandidate = async (e) => {
        if (cancelled || !e.candidate) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('live_signals') as any).insert({
          session_id: sessionId,
          from_user_id: userId,
          to_user_id: mentorId,
          signal_type: 'ice-candidate',
          payload: e.candidate.toJSON(),
        });
      };

      // Signal "join" to mentor
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('live_signals') as any).insert({
        session_id: sessionId,
        from_user_id: userId,
        to_user_id: mentorId,
        signal_type: 'join',
        payload: {},
      });
    }

    init().catch(() => setStatus('failed'));

    return () => {
      cancelled = true;
      pcRef.current?.close();
      micStreamRef.current?.getTracks().forEach(t => t.stop());
      if (signalChannelRef.current) supabase.removeChannel(signalChannelRef.current);
    };
  }, [sessionId, mentorId, userId]);

  // ── Sync sound ──
  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.muted = !soundEnabled;
  }, [soundEnabled]);

  // ── Toggle mic ──
  const toggleMic = useCallback(async () => {
    if (micEnabled) {
      micStreamRef.current?.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
      // Remove audio senders
      pcRef.current?.getSenders()
        .filter(s => s.track?.kind === 'audio')
        .forEach(s => pcRef.current?.removeTrack(s));
      setMicEnabled(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: selectedMic ? { deviceId: { exact: selectedMic } } : true,
        });
        micStreamRef.current = stream;
        stream.getAudioTracks().forEach(track => {
          pcRef.current?.addTrack(track, stream);
        });
        setMicEnabled(true);
        toast({ title: 'מיקרופון הופעל' });
      } catch {
        toast({ title: 'לא ניתן לגשת למיקרופון', variant: 'destructive' });
      }
    }
  }, [micEnabled, selectedMic, toast]);

  const statusColor: Record<ConnectionStatus, string> = {
    connecting: 'text-amber-500',
    connected: 'text-accent',
    disconnected: 'text-muted-foreground',
    failed: 'text-destructive',
  };
  const statusLabel: Record<ConnectionStatus, string> = {
    connecting: 'מתחבר...',
    connected: 'מחובר',
    disconnected: 'מנותק',
    failed: 'שגיאת חיבור',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" dir="rtl">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 10 }}
        className="relative w-full max-w-3xl bg-card rounded-2xl shadow-2xl border border-border overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-card">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-bold text-red-500 uppercase tracking-wide">LIVE</span>
            <span className="text-sm font-medium text-foreground">{sessionTitle}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-medium flex items-center gap-1 ${statusColor[status]}`}>
              {status === 'connected' ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              {statusLabel[status]}
            </span>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Video */}
        <div className="bg-slate-950 aspect-video relative flex items-center justify-center">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={`w-full h-full object-contain transition-opacity ${hasRemoteStream ? 'opacity-100' : 'opacity-0'}`}
          />

          {!hasRemoteStream && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400">
              {status === 'connecting' ? (
                <>
                  <div className="w-8 h-8 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">ממתין לשידור...</span>
                </>
              ) : status === 'disconnected' || status === 'failed' ? (
                <>
                  <WifiOff className="w-10 h-10 opacity-40" />
                  <span className="text-sm">החיבור אבד</span>
                </>
              ) : null}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="px-5 py-4 flex items-center gap-3 border-t border-border">
          {/* Sound */}
          <button
            onClick={() => setSoundEnabled(v => !v)}
            className={`flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-medium border transition-all ${
              soundEnabled ? 'border-border text-foreground hover:bg-muted' : 'border-destructive/30 bg-destructive/10 text-destructive'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            {soundEnabled ? 'שמע' : 'מושתק'}
          </button>

          {/* Mic picker */}
          <div className="relative">
            <button
              onClick={() => setShowMicMenu(v => !v)}
              className={`flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-medium border transition-all ${
                micEnabled ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {micEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
              {micEnabled ? 'מיקרופון פעיל' : 'הפעל מיקרופון'}
              {audioDevices.length > 1 && <ChevronDown className="w-3 h-3" />}
            </button>

            {showMicMenu && audioDevices.length > 1 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute bottom-full mb-1 right-0 bg-card border border-border rounded-xl shadow-lg overflow-hidden min-w-[200px] z-10"
              >
                {audioDevices.map(d => (
                  <button
                    key={d.deviceId}
                    onClick={() => { setSelectedMic(d.deviceId); setShowMicMenu(false); }}
                    className={`w-full text-right px-4 py-2.5 text-xs hover:bg-muted/50 transition-colors ${
                      selectedMic === d.deviceId ? 'text-primary font-medium' : 'text-foreground'
                    }`}
                  >
                    {d.label || `מיקרופון ${d.deviceId.slice(0, 6)}`}
                  </button>
                ))}
              </motion.div>
            )}
          </div>

          {/* Toggle mic on/off */}
          <button
            onClick={toggleMic}
            className={`h-9 w-9 flex items-center justify-center rounded-xl border transition-all ${
              micEnabled
                ? 'border-primary bg-primary text-primary-foreground hover:opacity-90'
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
            title={micEnabled ? 'השתק' : 'הפעל מיקרופון'}
          >
            {micEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </button>

          <div className="flex-1" />

          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            צופה עכשיו
          </span>

          <button
            onClick={onClose}
            className="h-9 px-4 rounded-xl border border-destructive/30 text-destructive text-xs font-medium hover:bg-destructive/10 transition-all"
          >
            עזוב לייב
          </button>
        </div>
      </motion.div>
    </div>
  );
}
