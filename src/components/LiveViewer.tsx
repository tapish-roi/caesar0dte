/**
 * LiveViewer — Student-side live stream viewer with live chat.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Mic, MicOff, Volume2, VolumeX, Users, Wifi,
  WifiOff, X, ChevronDown, MessageSquare, Send,
} from 'lucide-react';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

interface ChatMessage {
  id: string;
  user_id: string;
  display_name: string;
  message: string;
  created_at: string;
}

interface Props {
  sessionId: string;
  mentorId: string;
  userId: string;
  userName: string;
  sessionTitle: string;
  onClose: () => void;
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'failed';

export default function LiveViewer({ sessionId, mentorId, userId, userName, sessionTitle, onClose }: Props) {
  const { toast } = useToast();
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [micEnabled, setMicEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState('');
  const [showMicMenu, setShowMicMenu] = useState(false);
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSendingMsg, setIsSendingMsg] = useState(false);

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const signalChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const chatChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── Load audio devices ──
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const mics = devices.filter(d => d.kind === 'audioinput');
      setAudioDevices(mics);
      if (mics.length > 0) setSelectedMic(mics[0].deviceId);
    });
  }, []);

  // ── Load existing chat messages ──
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from('live_chat_messages') as any)
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at')
      .then(({ data }: { data: ChatMessage[] | null }) => {
        if (data) setChatMessages(data);
      });
  }, [sessionId]);

  // ── Subscribe to realtime chat ──
  useEffect(() => {
    const channel = supabase
      .channel(`live-chat-${sessionId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'live_chat_messages',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        setChatMessages(prev => [...prev, payload.new as ChatMessage]);
      })
      .subscribe();
    chatChannelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  // ── Auto-scroll chat ──
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ── Init WebRTC ──
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      pc.ontrack = (event) => {
        if (cancelled) return;
        const [remoteStream] = event.streams;
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
        setHasRemoteStream(true);
        setStatus('connected');
      };

      pc.onconnectionstatechange = () => {
        if (cancelled) return;
        const state = pc.connectionState;
        if (state === 'connected') setStatus('connected');
        if (state === 'disconnected' || state === 'failed') setStatus('disconnected');
      };

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
        stream.getAudioTracks().forEach(track => pcRef.current?.addTrack(track, stream));
        setMicEnabled(true);
        toast({ title: 'מיקרופון הופעל' });
      } catch {
        toast({ title: 'לא ניתן לגשת למיקרופון', variant: 'destructive' });
      }
    }
  }, [micEnabled, selectedMic, toast]);

  // ── Send chat message ──
  const sendMessage = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || isSendingMsg) return;
    setIsSendingMsg(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('live_chat_messages') as any).insert({
        session_id: sessionId,
        user_id: userId,
        display_name: userName || 'תלמיד',
        message: text,
      });
      setChatInput('');
    } catch {
      toast({ title: 'שגיאה בשליחת ההודעה', variant: 'destructive' });
    } finally {
      setIsSendingMsg(false);
    }
  }, [chatInput, isSendingMsg, sessionId, userId, userName, toast]);

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
        className="relative w-full max-w-5xl mx-4 bg-card rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />
            <span className="text-sm font-bold text-destructive uppercase tracking-wide">LIVE</span>
            <span className="text-sm font-medium text-foreground">{sessionTitle}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-medium flex items-center gap-1 ${statusColor[status]}`}>
              {status === 'connected' ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              {statusLabel[status]}
            </span>
            <button
              onClick={() => setShowChat(v => !v)}
              className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-xs transition-all ${
                showChat ? 'border-primary/40 bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
              }`}
              title="צ'אט"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">צ'אט</span>
              {chatMessages.length > 0 && (
                <span className="bg-primary text-primary-foreground text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                  {chatMessages.length > 99 ? '99+' : chatMessages.length}
                </span>
              )}
            </button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body: video + chat */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Video area */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="bg-foreground/5 flex-1 relative flex items-center justify-center">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className={`w-full h-full object-contain transition-opacity ${hasRemoteStream ? 'opacity-100' : 'opacity-0'}`}
              />
              {!hasRemoteStream && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                  {status === 'connecting' ? (
                    <>
                      <div className="w-8 h-8 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm">ממתין לשידור...</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-10 h-10 opacity-40" />
                      <span className="text-sm">החיבור אבד</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="px-4 py-3 flex items-center gap-2.5 border-t border-border shrink-0 bg-card flex-wrap">
              <button
                onClick={() => setSoundEnabled(v => !v)}
                className={`flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-medium border transition-all ${
                  soundEnabled ? 'border-border text-foreground hover:bg-muted' : 'border-destructive/30 bg-destructive/10 text-destructive'
                }`}
              >
                {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                {soundEnabled ? 'שמע' : 'מושתק'}
              </button>

              <div className="relative">
                <button
                  onClick={() => setShowMicMenu(v => !v)}
                  className={`flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-medium border transition-all ${
                    micEnabled ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  {micEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                  {micEnabled ? 'מיק פעיל' : 'מיקרופון'}
                  {audioDevices.length > 1 && <ChevronDown className="w-3 h-3" />}
                </button>
                {showMicMenu && audioDevices.length > 1 && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute bottom-full mb-1 right-0 bg-card border border-border rounded-xl shadow-lg overflow-hidden min-w-[190px] z-10"
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

              <button
                onClick={toggleMic}
                className={`h-8 w-8 flex items-center justify-center rounded-xl border transition-all ${
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
                className="h-8 px-3 rounded-xl border border-destructive/30 text-destructive text-xs font-medium hover:bg-destructive/10 transition-all"
              >
                עזוב לייב
              </button>
            </div>
          </div>

          {/* Chat panel */}
          <AnimatePresence>
            {showChat && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 280, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="border-r border-border flex flex-col bg-card shrink-0 overflow-hidden"
                style={{ minWidth: 0 }}
              >
                {/* Chat header */}
                <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">צ'אט לייב</span>
                  <span className="text-xs text-muted-foreground mr-auto">{chatMessages.length}</span>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0">
                  {chatMessages.length === 0 && (
                    <div className="text-center py-6 text-muted-foreground">
                      <MessageSquare className="w-8 h-8 opacity-20 mx-auto mb-2" />
                      <p className="text-xs">עוד לא נשלחו הודעות</p>
                    </div>
                  )}
                  {chatMessages.map(msg => (
                    <div key={msg.id} className={`flex flex-col gap-0.5 ${msg.user_id === userId ? 'items-end' : 'items-start'}`}>
                      <span className="text-[10px] text-muted-foreground font-medium px-1">
                        {msg.user_id === userId ? 'אתה' : msg.display_name}
                      </span>
                      <div className={`max-w-[85%] px-3 py-1.5 rounded-2xl text-xs leading-relaxed ${
                        msg.user_id === userId
                          ? 'bg-primary text-primary-foreground rounded-tl-sm'
                          : 'bg-muted text-foreground rounded-tr-sm'
                      }`}>
                        {msg.message}
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                {/* Input */}
                <div className="p-3 border-t border-border shrink-0">
                  <div className="flex gap-2">
                    <input
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                      placeholder="כתוב הודעה..."
                      maxLength={300}
                      className="flex-1 h-9 px-3 bg-surface ring-1 ring-border rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-right"
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!chatInput.trim() || isSendingMsg}
                      className="h-9 w-9 flex items-center justify-center bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-all disabled:opacity-40 shrink-0"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
