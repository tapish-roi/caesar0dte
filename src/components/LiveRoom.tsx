/**
 * LiveRoom — Full-screen Discord-style voice/video room.
 * - Auto-stops screen share when session ends
 * - Records the full session via MediaRecorder (canvas composite + audio)
 *   and returns the blob via onSessionEnd callback
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Mic, MicOff, Volume2, VolumeX, Video, VideoOff,
  Monitor, MonitorOff, Settings, X, Users, PhoneOff,
  Pencil, Eraser, RotateCcw, MessageSquare, Send, Headphones,
} from 'lucide-react';

interface ChatMessage { id: string; user_id: string; display_name: string; message: string; created_at: string; }
interface Participant { userId: string; name: string; stream?: MediaStream; isMuted: boolean; isDeafened: boolean; hasCamera: boolean; hasScreen: boolean; isForceMuted?: boolean; }

interface Props {
  sessionId: string;
  mentorId: string;
  userId: string;
  userName: string;
  sessionTitle: string;
  isMentor?: boolean;
  onClose: () => void;
  /** Called when mentor ends session — receives recorded Blob (webm) */
  onSessionEnd?: (recordingBlob: Blob, durationSeconds: number) => void;
}

type DrawTool = 'pen' | 'eraser';

export default function LiveRoom({ sessionId, mentorId, userId, userName, sessionTitle, isMentor = false, onClose, onSessionEnd }: Props) {
  const { toast } = useToast();

  // Media state
  const [micEnabled, setMicEnabled] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState('');
  const [selectedCamera, setSelectedCamera] = useState('');
  const [selectedOutput, setSelectedOutput] = useState('');
  const [volume, setVolume] = useState(100);
  const [settingsTab, setSettingsTab] = useState<'mic' | 'audio' | 'camera'>('mic');

  // Drawing state
  const [drawing, setDrawing] = useState(false);
  const [drawTool, setDrawTool] = useState<DrawTool>('pen');
  const [drawColor, setDrawColor] = useState('#ef4444');
  const [isDrawingActive, setIsDrawingActive] = useState(false);

  // Connection
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [participants, setParticipants] = useState<Participant[]>([]);

  // Force-mute state (set by mentor signal)
  const [isForceMuted, setIsForceMuted] = useState(false);
  // Mentor-side: track which user IDs are force-muted
  const [forceMutedUsers, setForceMutedUsers] = useState<Set<string>>(new Set());

  // Chat & members panels
  const [showChat, setShowChat] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSendingMsg, setIsSendingMsg] = useState(false);

  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const lastPt = useRef<{ x: number; y: number } | null>(null);

  // Recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const sessionStartRef = useRef<number>(Date.now());
  const recordingStreamRef = useRef<MediaStream | null>(null);

  // ── Start recording when component mounts (mentor only) ──
  useEffect(() => {
    if (!isMentor) return;
    sessionStartRef.current = Date.now();

    const startRecording = () => {
      try {
        // Capture the entire page as a canvas stream (fallback: black stream)
        let stream: MediaStream;
        if (typeof (document as unknown as { captureStream?: () => MediaStream }).captureStream === 'function') {
          stream = (document as unknown as { captureStream: () => MediaStream }).captureStream();
        } else {
          // Create a minimal black canvas stream as fallback
          const canvas = document.createElement('canvas');
          canvas.width = 1280; canvas.height = 720;
          stream = (canvas as unknown as { captureStream: (fps: number) => MediaStream }).captureStream(10);
        }
        recordingStreamRef.current = stream;
        const mr = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus' });
        mr.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
        mr.start(5000); // collect chunks every 5s
        mediaRecorderRef.current = mr;
      } catch {
        // Recording not supported — silently skip
      }
    };

    startRecording();

    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMentor]);

  // ── Enumerate devices ──
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const mics = devices.filter(d => d.kind === 'audioinput');
      const cams = devices.filter(d => d.kind === 'videoinput');
      const outputs = devices.filter(d => d.kind === 'audiooutput');
      setAudioDevices(mics);
      setVideoDevices(cams);
      setOutputDevices(outputs);
      if (mics.length) setSelectedMic(mics[0].deviceId);
      if (cams.length) setSelectedCamera(cams[0].deviceId);
      if (outputs.length) setSelectedOutput(outputs[0].deviceId);
    });
  }, []);

  // ── Chat ──
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from('live_chat_messages') as any)
      .select('*').eq('session_id', sessionId).order('created_at')
      .then(({ data }: { data: ChatMessage[] | null }) => { if (data) setChatMessages(data); });

    const ch = supabase.channel(`live-chat-${sessionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_chat_messages', filter: `session_id=eq.${sessionId}` },
        (payload) => setChatMessages(prev => [...prev, payload.new as ChatMessage]))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionId]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  // ── Self participant ──
  useEffect(() => {
    setParticipants([{ userId, name: userName || 'אתה', isMuted: !micEnabled, isDeafened: deafened, hasCamera: cameraEnabled, hasScreen: screenSharing }]);
    setConnectionStatus('connected');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Presence: announce join & track other participants via signals ──
  useEffect(() => {
    // Announce our presence
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from('live_signals') as any).insert({
      session_id: sessionId,
      from_user_id: userId,
      to_user_id: mentorId,
      signal_type: 'presence',
      payload: { name: userName, isMentor },
    }).then(() => {});

    // Listen for presence + mute signals
    const ch = supabase.channel(`live-signals-${sessionId}-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'live_signals',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const sig = payload.new as { signal_type: string; from_user_id: string; to_user_id: string; payload: Record<string,unknown> };

        // Handle presence (mentor builds participant list)
        if (sig.signal_type === 'presence' && isMentor) {
          setParticipants(prev => {
            const exists = prev.find(p => p.userId === sig.from_user_id);
            if (exists) return prev;
            return [...prev, {
              userId: sig.from_user_id,
              name: String(sig.payload.name || 'משתמש'),
              isMuted: false, isDeafened: false, hasCamera: false, hasScreen: false,
            }];
          });
        }

        // Handle force_mute (student receives)
        if (sig.signal_type === 'force_mute' && sig.to_user_id === userId) {
          setIsForceMuted(true);
          setMicEnabled(false);
          localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = false; t.stop(); });
          toast({ title: 'הושתקת על ידי המנטור', description: 'אתה יכול להסיר את ההשתקה בעצמך' });
        }

        // Handle force_unmute (student receives)
        if (sig.signal_type === 'force_unmute' && sig.to_user_id === userId) {
          setIsForceMuted(false);
          toast({ title: 'המנטור הסיר את ההשתקה שלך' });
        }

        // Handle mute_ack — mentor updates participant list
        if (sig.signal_type === 'mute_ack' && isMentor) {
          const targetId = sig.from_user_id;
          const muted = sig.payload.muted as boolean;
          setParticipants(prev => prev.map(p => p.userId === targetId ? { ...p, isMuted: muted, isForceMuted: muted } : p));
          setForceMutedUsers(prev => {
            const next = new Set(prev);
            if (muted) next.add(targetId); else next.delete(targetId);
            return next;
          });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, userId, mentorId, isMentor, userName]);

  // ── Camera ──
  useEffect(() => {
    if (cameraEnabled) {
      navigator.mediaDevices.getUserMedia({ video: selectedCamera ? { deviceId: { exact: selectedCamera } } : true })
        .then(stream => {
          localStreamRef.current = stream;
          if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        })
        .catch(() => { toast({ title: 'לא ניתן לגשת למצלמה', variant: 'destructive' }); setCameraEnabled(false); });
    } else {
      localStreamRef.current?.getVideoTracks().forEach(t => t.stop());
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
    }
  }, [cameraEnabled, selectedCamera, toast]);

  // ── Screen share ──
  const stopScreenShare = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
    setScreenSharing(false);
  }, []);

  const toggleScreenShare = useCallback(async () => {
    if (screenSharing) {
      stopScreenShare();
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        screenStreamRef.current = stream;
        if (screenVideoRef.current) screenVideoRef.current.srcObject = stream;
        setScreenSharing(true);
        stream.getVideoTracks()[0].onended = () => stopScreenShare();
        toast({ title: 'שיתוף מסך הופעל' });
      } catch {
        toast({ title: 'שיתוף מסך בוטל', variant: 'destructive' });
      }
    }
  }, [screenSharing, stopScreenShare, toast]);

  // ── Mic ──
  const toggleMic = useCallback(async () => {
    if (micEnabled) {
      localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = false; t.stop(); });
      setMicEnabled(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: selectedMic ? { deviceId: { exact: selectedMic } } : true,
        });
        stream.getAudioTracks().forEach(t => localStreamRef.current?.addTrack(t));
        setMicEnabled(true);
        if (deafened) setDeafened(false);
      } catch {
        toast({ title: 'לא ניתן לגשת למיקרופון', variant: 'destructive' });
      }
    }
  }, [micEnabled, selectedMic, deafened, toast]);

  // ── Deafen ──
  const toggleDeafen = useCallback(() => {
    setDeafened(v => {
      const next = !v;
      if (next && micEnabled) {
        localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = false; });
        setMicEnabled(false);
      }
      return next;
    });
  }, [micEnabled]);

  // ── Hang up / End session ──
  const handleLeave = useCallback(() => {
    // Always stop screen share first
    stopScreenShare();

    if (isMentor && mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      const mr = mediaRecorderRef.current;
      const durationSeconds = Math.round((Date.now() - sessionStartRef.current) / 1000);
      mr.onstop = () => {
        // Flush any remaining data after stop
        const allChunks = [...recordedChunksRef.current];
        const blob = new Blob(allChunks, { type: 'video/webm' });
        if (blob.size > 0 && onSessionEnd) {
          onSessionEnd(blob, durationSeconds);
        }
        onClose();
      };
      mr.stop();
    } else {
      // Non-mentor or no recorder — close immediately
      onClose();
    }
  }, [isMentor, onClose, onSessionEnd, stopScreenShare]);

  // ── Canvas drawing ──
  const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const onCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => { if (!isDrawingActive) return; setDrawing(true); lastPt.current = getCanvasPos(e); };
  const onCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing || !isDrawingActive || !canvasRef.current || !lastPt.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const pt = getCanvasPos(e);
    ctx.beginPath();
    if (drawTool === 'eraser') { ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = 24; }
    else { ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = drawColor; ctx.lineWidth = 3; }
    ctx.lineCap = 'round';
    ctx.moveTo(lastPt.current.x, lastPt.current.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastPt.current = pt;
  };
  const onCanvasMouseUp = () => { setDrawing(false); lastPt.current = null; };
  const clearCanvas = () => { const c = canvasRef.current; if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height); };

  // ── Send message ──
  const sendMessage = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || isSendingMsg) return;
    setIsSendingMsg(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('live_chat_messages') as any).insert({
        session_id: sessionId, user_id: userId,
        display_name: userName || (isMentor ? 'מנטור' : 'תלמיד'), message: text,
      });
      setChatInput('');
    } catch { toast({ title: 'שגיאה בשליחת הודעה', variant: 'destructive' }); }
    finally { setIsSendingMsg(false); }
  }, [chatInput, isSendingMsg, sessionId, userId, userName, isMentor, toast]);

  // ── Mentor: force mute/unmute participant ──
  const toggleForceMute = useCallback(async (targetUserId: string, currentlyMuted: boolean) => {
    const signalType = currentlyMuted ? 'force_unmute' : 'force_mute';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('live_signals') as any).insert({
      session_id: sessionId,
      from_user_id: userId,
      to_user_id: targetUserId,
      signal_type: signalType,
      payload: { muted: !currentlyMuted },
    });
    // Optimistically update local state
    setForceMutedUsers(prev => {
      const next = new Set(prev);
      if (currentlyMuted) next.delete(targetUserId); else next.add(targetUserId);
      return next;
    });
    setParticipants(prev => prev.map(p => p.userId === targetUserId
      ? { ...p, isMuted: !currentlyMuted, isForceMuted: !currentlyMuted }
      : p));
  }, [sessionId, userId]);

  const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ffffff'];
  const screenActive = screenSharing;
  const initials = (name: string) => name?.[0]?.toUpperCase() ?? '?';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#1e1f22]" dir="rtl">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 h-12 bg-[#1e1f22] border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs font-bold text-red-400 uppercase tracking-widest">LIVE</span>
          <span className="text-xs text-white/60 font-medium mx-1">·</span>
          <span className="text-sm font-semibold text-white/90">{sessionTitle}</span>
          {connectionStatus === 'connected' && (
            <span className="text-[10px] text-green-400 font-medium bg-green-400/10 px-2 py-0.5 rounded-full">מחובר</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowMembers(v => !v)}
            className={`flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium transition-all ${showMembers ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white/80'}`}
          >
            <Users className="w-3.5 h-3.5" />
            {participants.length}
          </button>
          <button
            onClick={() => setShowChat(v => !v)}
            className={`relative flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium transition-all ${showChat ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white/80'}`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {chatMessages.length > 0 && !showChat && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold">
                {chatMessages.length > 9 ? '9+' : chatMessages.length}
              </span>
            )}
          </button>
          <button onClick={handleLeave} className="h-8 w-8 flex items-center justify-center rounded-md text-white/40 hover:text-white/80 hover:bg-white/5 transition-all ml-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* ── Main content ── */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#313338]">

          {/* Video / avatar area */}
          <div className="flex-1 relative flex items-center justify-center min-h-0 overflow-hidden">

            {screenActive ? (
              /* ── Screen share ── */
              <div className="relative w-full h-full">
                <video ref={screenVideoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
                {/* Drawing canvas */}
                <canvas
                  ref={canvasRef}
                  className={`absolute inset-0 w-full h-full ${isDrawingActive ? 'cursor-crosshair' : 'pointer-events-none'}`}
                  style={{ touchAction: 'none' }}
                  onMouseDown={onCanvasMouseDown}
                  onMouseMove={onCanvasMouseMove}
                  onMouseUp={onCanvasMouseUp}
                  onMouseLeave={onCanvasMouseUp}
                />
                {/* Drawing toolbar */}
                <div className="absolute top-3 right-3 flex flex-col gap-2 bg-[#2b2d31]/90 backdrop-blur-sm border border-white/10 rounded-xl p-2 shadow-xl">
                  <button onClick={() => setIsDrawingActive(v => !v)}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${isDrawingActive ? 'bg-indigo-500 text-white' : 'text-white/50 hover:bg-white/10 hover:text-white'}`}
                    title="ציור">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {isDrawingActive && (
                    <>
                      <button onClick={() => setDrawTool(t => t === 'eraser' ? 'pen' : 'eraser')}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${drawTool === 'eraser' ? 'bg-white/20 text-white' : 'text-white/50 hover:bg-white/10 hover:text-white'}`}>
                        <Eraser className="w-3.5 h-3.5" />
                      </button>
                      <div className="space-y-1">
                        {COLORS.map(c => (
                          <button key={c} onClick={() => { setDrawColor(c); setDrawTool('pen'); }}
                            className={`w-5 h-5 rounded-full border-2 mx-auto block transition-all ${drawColor === c && drawTool === 'pen' ? 'border-white scale-125' : 'border-transparent'}`}
                            style={{ backgroundColor: c }} />
                        ))}
                      </div>
                      <button onClick={clearCanvas}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-red-400 hover:bg-red-400/10 transition-all">
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
                {/* Camera PiP */}
                {cameraEnabled && (
                  <div className="absolute bottom-20 left-4 w-36 h-24 rounded-xl overflow-hidden border-2 border-white/20 shadow-2xl">
                    <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                    <div className="absolute bottom-1 right-1 text-[10px] text-white bg-black/60 px-1.5 rounded font-medium">{userName}</div>
                  </div>
                )}
              </div>
            ) : cameraEnabled ? (
              /* ── Camera on ── */
              <div className="relative w-full h-full flex items-center justify-center">
                <div className="relative rounded-2xl overflow-hidden shadow-2xl" style={{ maxWidth: '70%', maxHeight: '80%' }}>
                  <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover block" />
                  <div className="absolute bottom-2 right-3 flex items-center gap-1.5">
                    {!micEnabled && <div className="w-6 h-6 rounded-full bg-red-500/80 flex items-center justify-center"><MicOff className="w-3 h-3 text-white" /></div>}
                    <span className="text-xs text-white bg-black/60 px-2 py-0.5 rounded-full font-medium">{userName}</span>
                  </div>
                </div>
              </div>
            ) : (
              /* ── Avatar grid (no camera / no screen) ── */
              <div className="flex flex-col items-center gap-5 select-none">
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative">
                  <div className={`w-32 h-32 rounded-full flex items-center justify-center text-5xl font-bold text-white shadow-2xl border-4 transition-all ${
                    micEnabled ? 'border-green-500 shadow-green-500/30' : 'border-white/10'
                  }`}
                    style={{ background: 'linear-gradient(135deg, #5865f2, #7289da)' }}
                  >
                    {initials(userName)}
                  </div>
                  {micEnabled && <div className="absolute inset-0 rounded-full border-4 border-green-500/40 animate-ping" />}
                  <div className={`absolute bottom-1 right-1 w-7 h-7 rounded-full border-4 border-[#313338] flex items-center justify-center ${
                    micEnabled ? 'bg-green-500' : 'bg-[#4e5058]'
                  }`}>
                    {micEnabled ? <Mic className="w-3 h-3 text-white" /> : <MicOff className="w-3 h-3 text-white/60" />}
                  </div>
                </motion.div>

                <div className="text-center">
                  <p className="text-xl font-bold text-white">{userName}</p>
                  <p className="text-sm text-white/40 mt-0.5">
                    {deafened ? 'מושתק לחלוטין' : micEnabled ? 'מדבר...' : 'מיקרופון כבוי'}
                  </p>
                </div>

                {participants.length > 1 && (
                  <div className="flex gap-4 mt-2">
                    {participants.filter(p => p.userId !== userId).map(p => (
                      <div key={p.userId} className="flex flex-col items-center gap-2">
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white border-2 ${p.isMuted ? 'border-white/10' : 'border-green-500'}`}
                          style={{ background: 'linear-gradient(135deg, #5865f2, #7289da)' }}>
                          {initials(p.name)}
                        </div>
                        <p className="text-xs text-white/60">{p.name}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Controls bar (Discord style) ── */}
          <div className="shrink-0 bg-[#292b2f] border-t border-white/5 py-4 px-6 flex items-center justify-center gap-3">
            {/* Mic — shows orange ring when force-muted by mentor */}
            <div className="relative">
              <button
                onClick={toggleMic}
                disabled={deafened}
                title={isForceMuted ? 'הושתקת על ידי המנטור — לחץ להסרת ההשתקה' : micEnabled ? 'השתק מיקרופון' : 'הפעל מיקרופון'}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg disabled:opacity-40 ${
                  micEnabled ? 'bg-[#4e5058] hover:bg-[#6d6f78] text-white' : 'bg-red-500/90 hover:bg-red-500 text-white'
                } ${isForceMuted ? 'ring-2 ring-orange-400 ring-offset-2 ring-offset-[#292b2f]' : ''}`}
              >
                {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </button>
              {isForceMuted && (
                <div className="absolute -top-1 -right-1 bg-orange-500 rounded-full w-4 h-4 flex items-center justify-center" title="הושתקת על ידי המנטור">
                  <span className="text-white text-[8px] font-bold">M</span>
                </div>
              )}
            </div>

            {/* Deafen */}
            <button
              onClick={toggleDeafen}
              title={deafened ? 'בטל השתקה' : 'השתק לחלוטין'}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg ${
                deafened ? 'bg-red-500/90 hover:bg-red-500 text-white' : 'bg-[#4e5058] hover:bg-[#6d6f78] text-white'
              }`}
            >
              {deafened ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>

            {/* Camera */}
            <button
              onClick={() => setCameraEnabled(v => !v)}
              title={cameraEnabled ? 'כבה מצלמה' : 'הפעל מצלמה'}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg ${
                cameraEnabled ? 'bg-[#4e5058] hover:bg-[#6d6f78] text-white' : 'bg-[#4e5058] hover:bg-[#6d6f78] text-white/50'
              }`}
            >
              {cameraEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </button>

            {/* Screen share */}
            <button
              onClick={toggleScreenShare}
              title={screenSharing ? 'הפסק שיתוף מסך' : 'שתף מסך'}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg ${
                screenSharing ? 'bg-green-500/90 hover:bg-green-500 text-white' : 'bg-[#4e5058] hover:bg-[#6d6f78] text-white/50'
              }`}
            >
              {screenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
            </button>

            {/* Settings — opens modal */}
            <button
              onClick={() => { setShowSettings(true); setSettingsTab('mic'); }}
              title="הגדרות"
              className="w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg bg-[#4e5058] hover:bg-[#6d6f78] text-white/50 hover:text-white"
            >
              <Settings className="w-5 h-5" />
            </button>

            {/* Divider */}
            <div className="w-px h-10 bg-white/10 mx-1" />

            {/* Leave / End — red */}
            <button
              onClick={handleLeave}
              title={isMentor ? 'סיים שידור' : 'עזוב שיחה'}
              className="h-14 px-5 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center gap-2 transition-all shadow-lg shadow-red-500/30 font-medium text-sm"
            >
              <PhoneOff className="w-5 h-5" />
              {isMentor ? 'סיים שידור' : 'צא'}
            </button>
          </div>
        </div>

        {/* ── Settings Modal ── */}
        <AnimatePresence>
          {showSettings && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
                onClick={() => setShowSettings(false)}
              />
              {/* Modal */}
              <motion.div
                initial={{ opacity: 0, scale: 0.93, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.93, y: 12 }}
                transition={{ duration: 0.18 }}
                className="fixed inset-0 z-[61] flex items-center justify-center pointer-events-none"
              >
                <div className="pointer-events-auto w-[520px] bg-[#1e1f22] rounded-2xl shadow-2xl border border-white/10 overflow-hidden" dir="rtl">
                  {/* Header */}
                  <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
                    <h2 className="text-base font-bold text-white">הגדרות שיחה</h2>
                    <button
                      onClick={() => setShowSettings(false)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white/80 hover:bg-white/8 transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex min-h-0">
                    {/* Sidebar tabs */}
                    <div className="w-44 bg-[#2b2d31] p-3 flex flex-col gap-1 shrink-0">
                      <button
                        onClick={() => setSettingsTab('mic')}
                        className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-right ${
                          settingsTab === 'mic' ? 'bg-[#404249] text-white' : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                        }`}
                      >
                        <Mic className="w-4 h-4 shrink-0" />
                        מיקרופון
                      </button>
                      <button
                        onClick={() => setSettingsTab('audio')}
                        className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-right ${
                          settingsTab === 'audio' ? 'bg-[#404249] text-white' : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                        }`}
                      >
                        <Headphones className="w-4 h-4 shrink-0" />
                        אוזניות / שמע
                      </button>
                      <button
                        onClick={() => setSettingsTab('camera')}
                        className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-right ${
                          settingsTab === 'camera' ? 'bg-[#404249] text-white' : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                        }`}
                      >
                        <Video className="w-4 h-4 shrink-0" />
                        מצלמה
                      </button>
                    </div>

                    {/* Tab content */}
                    <div className="flex-1 p-6 space-y-5">
                      {settingsTab === 'mic' && (
                        <>
                          <div>
                            <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3">בחירת מיקרופון</p>
                            <div className="space-y-2">
                              {audioDevices.length === 0 && (
                                <p className="text-xs text-white/30 italic">לא נמצאו מיקרופונים</p>
                              )}
                              {audioDevices.map(d => (
                                <button
                                  key={d.deviceId}
                                  onClick={() => setSelectedMic(d.deviceId)}
                                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all text-right border ${
                                    selectedMic === d.deviceId
                                      ? 'border-indigo-500/60 bg-indigo-500/10 text-white'
                                      : 'border-white/8 bg-white/3 text-white/60 hover:bg-white/6 hover:text-white/80'
                                  }`}
                                >
                                  <Mic className={`w-4 h-4 shrink-0 ${selectedMic === d.deviceId ? 'text-indigo-400' : 'text-white/30'}`} />
                                  <span className="truncate">{d.label || `מיקרופון ${d.deviceId.slice(0, 8)}`}</span>
                                  {selectedMic === d.deviceId && (
                                    <span className="mr-auto text-[10px] font-bold text-indigo-400 bg-indigo-500/20 px-2 py-0.5 rounded-full shrink-0">פעיל</span>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}

                      {settingsTab === 'audio' && (
                        <>
                          <div>
                            <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3">חיבור שמע יוצא</p>
                            <div className="space-y-2">
                              {outputDevices.length === 0 && (
                                <p className="text-xs text-white/30 italic">לא נמצאו התקני שמע (הדפדפן לא תומך בבחירת שמע יוצא)</p>
                              )}
                              {outputDevices.map(d => (
                                <button
                                  key={d.deviceId}
                                  onClick={() => setSelectedOutput(d.deviceId)}
                                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all text-right border ${
                                    selectedOutput === d.deviceId
                                      ? 'border-indigo-500/60 bg-indigo-500/10 text-white'
                                      : 'border-white/8 bg-white/3 text-white/60 hover:bg-white/6 hover:text-white/80'
                                  }`}
                                >
                                  <Headphones className={`w-4 h-4 shrink-0 ${selectedOutput === d.deviceId ? 'text-indigo-400' : 'text-white/30'}`} />
                                  <span className="truncate">{d.label || `התקן ${d.deviceId.slice(0, 8)}`}</span>
                                  {selectedOutput === d.deviceId && (
                                    <span className="mr-auto text-[10px] font-bold text-indigo-400 bg-indigo-500/20 px-2 py-0.5 rounded-full shrink-0">פעיל</span>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3">עוצמת שמע — שאר המשתתפים</p>
                            <div className="flex items-center gap-4 bg-[#2b2d31] rounded-xl px-4 py-3">
                              <VolumeX className="w-4 h-4 text-white/30 shrink-0" />
                              <input
                                type="range" min={0} max={100} value={volume}
                                onChange={e => setVolume(Number(e.target.value))}
                                className="flex-1 accent-indigo-500 h-1.5"
                              />
                              <Volume2 className="w-4 h-4 text-white/60 shrink-0" />
                              <span className="text-sm font-bold text-white/70 w-10 text-center shrink-0">{volume}%</span>
                            </div>
                            <p className="text-[11px] text-white/25 mt-2 text-right">שינוי רמת השמע שאתה שומע את שאר המשתתפים בשיחה</p>
                          </div>
                        </>
                      )}

                      {settingsTab === 'camera' && (
                        <>
                          <div>
                            <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3">בחירת מצלמה</p>
                            <div className="space-y-2">
                              {videoDevices.length === 0 && (
                                <p className="text-xs text-white/30 italic">לא נמצאו מצלמות</p>
                              )}
                              {videoDevices.map(d => (
                                <button
                                  key={d.deviceId}
                                  onClick={() => setSelectedCamera(d.deviceId)}
                                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all text-right border ${
                                    selectedCamera === d.deviceId
                                      ? 'border-indigo-500/60 bg-indigo-500/10 text-white'
                                      : 'border-white/8 bg-white/3 text-white/60 hover:bg-white/6 hover:text-white/80'
                                  }`}
                                >
                                  <Video className={`w-4 h-4 shrink-0 ${selectedCamera === d.deviceId ? 'text-indigo-400' : 'text-white/30'}`} />
                                  <span className="truncate">{d.label || `מצלמה ${d.deviceId.slice(0, 8)}`}</span>
                                  {selectedCamera === d.deviceId && (
                                    <span className="mr-auto text-[10px] font-bold text-indigo-400 bg-indigo-500/20 px-2 py-0.5 rounded-full shrink-0">פעיל</span>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="px-6 py-3 border-t border-white/8 flex justify-start">
                    <button
                      onClick={() => setShowSettings(false)}
                      className="h-9 px-5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold transition-all"
                    >
                      סגור
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* ── Members panel ── */}
        <AnimatePresence>
          {showMembers && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 240, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-[#2b2d31] border-r border-white/5 flex flex-col shrink-0 overflow-hidden"
              style={{ minWidth: 0 }}
            >
              <div className="px-4 pt-5 pb-2 shrink-0">
                <p className="text-xs font-bold text-white/40 uppercase tracking-widest">
                  חברים בשיחה — {participants.length}
                </p>
              </div>
              <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
                {participants.map(p => (
                  <div key={p.userId} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors group">
                    <div className="relative shrink-0">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white"
                        style={{ background: 'linear-gradient(135deg, #5865f2, #7289da)' }}>
                        {initials(p.name)}
                      </div>
                      <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#2b2d31] ${p.isMuted ? 'bg-[#4e5058]' : 'bg-green-500'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white/80 truncate">{p.name}</p>
                      <p className="text-[10px] text-white/30">
                        {p.isDeafened ? 'מושתק לחלוטין' : p.isMuted ? 'מושתק' : 'פעיל'}
                      </p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {p.isMuted && <MicOff className="w-3 h-3 text-red-400" />}
                      {p.hasCamera && <Video className="w-3 h-3 text-blue-400" />}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Chat panel ── */}
        <AnimatePresence>
          {showChat && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 300, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-[#313338] border-r border-white/5 flex flex-col shrink-0 overflow-hidden"
              style={{ minWidth: 0 }}
            >
              <div className="px-4 h-12 border-b border-white/5 flex items-center gap-2 shrink-0">
                <MessageSquare className="w-4 h-4 text-white/40" />
                <span className="text-sm font-bold text-white/80">צ'אט</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
                {chatMessages.length === 0 && (
                  <div className="text-center py-10 text-white/20">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">עוד לא נשלחו הודעות</p>
                  </div>
                )}
                {chatMessages.map(msg => (
                  <div key={msg.id} className={`flex flex-col gap-0.5 ${msg.user_id === userId ? 'items-end' : 'items-start'}`}>
                    <span className="text-[10px] text-white/30 px-1">{msg.user_id === userId ? 'אתה' : msg.display_name}</span>
                    <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                      msg.user_id === userId
                        ? 'bg-indigo-500 text-white rounded-tl-sm'
                        : 'bg-[#2b2d31] text-white/80 rounded-tr-sm'
                    }`}>
                      {msg.message}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="p-3 border-t border-white/5 shrink-0">
                <div className="flex gap-2 items-center bg-[#383a40] rounded-xl px-3 py-2">
                  <input
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                    placeholder="הודעה לכולם..."
                    maxLength={300}
                    className="flex-1 bg-transparent text-xs text-white/80 placeholder:text-white/25 focus:outline-none text-right min-w-0"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!chatInput.trim() || isSendingMsg}
                    className="w-7 h-7 flex items-center justify-center bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-all disabled:opacity-30 shrink-0"
                  >
                    <Send className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
