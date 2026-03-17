/**
 * LiveRoom — Discord-style voice/video room for mentor & students.
 * Features: mic, deafen, camera, screen share, canvas drawing on screen share, device settings.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Mic, MicOff, Volume2, VolumeX, Video, VideoOff,
  Monitor, MonitorOff, Settings, X, Users, Wifi, WifiOff,
  Pencil, Eraser, RotateCcw, MessageSquare, Send,
} from 'lucide-react';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

interface ChatMessage { id: string; user_id: string; display_name: string; message: string; created_at: string; }
interface Participant { userId: string; name: string; stream?: MediaStream; isMuted: boolean; isDeafened: boolean; hasCamera: boolean; hasScreen: boolean; }

interface Props {
  sessionId: string;
  mentorId: string;
  userId: string;
  userName: string;
  sessionTitle: string;
  isMentor?: boolean;
  onClose: () => void;
}

type DrawTool = 'pen' | 'eraser';

export default function LiveRoom({ sessionId, mentorId, userId, userName, sessionTitle, isMentor = false, onClose }: Props) {
  const { toast } = useToast();

  // Media state
  const [micEnabled, setMicEnabled] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState('');
  const [selectedCamera, setSelectedCamera] = useState('');
  const [volume, setVolume] = useState(100);

  // Drawing state
  const [drawing, setDrawing] = useState(false);
  const [drawTool, setDrawTool] = useState<DrawTool>('pen');
  const [drawColor, setDrawColor] = useState('#ef4444');
  const [isDrawingActive, setIsDrawingActive] = useState(false);

  // Connection
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [participants, setParticipants] = useState<Participant[]>([]);

  // Chat
  const [showChat, setShowChat] = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSendingMsg, setIsSendingMsg] = useState(false);

  // Shared screen from another participant
  const [sharedScreenStream, setSharedScreenStream] = useState<MediaStream | null>(null);

  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const signalChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const chatChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const lastPt = useRef<{ x: number; y: number } | null>(null);

  // ── Enumerate devices ──
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const mics = devices.filter(d => d.kind === 'audioinput');
      const cams = devices.filter(d => d.kind === 'videoinput');
      setAudioDevices(mics);
      setVideoDevices(cams);
      if (mics.length) setSelectedMic(mics[0].deviceId);
      if (cams.length) setSelectedCamera(cams[0].deviceId);
    });
  }, []);

  // ── Load + subscribe to chat ──
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from('live_chat_messages') as any)
      .select('*').eq('session_id', sessionId).order('created_at')
      .then(({ data }: { data: ChatMessage[] | null }) => { if (data) setChatMessages(data); });

    const ch = supabase.channel(`live-chat-${sessionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_chat_messages', filter: `session_id=eq.${sessionId}` },
        (payload) => setChatMessages(prev => [...prev, payload.new as ChatMessage]))
      .subscribe();
    chatChannelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [sessionId]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  // ── Add participant self ──
  useEffect(() => {
    setParticipants([{ userId, name: userName || 'אתה', isMuted: !micEnabled, isDeafened: deafened, hasCamera: cameraEnabled, hasScreen: screenSharing }]);
    setConnectionStatus('connected');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Local camera ──
  useEffect(() => {
    if (cameraEnabled) {
      navigator.mediaDevices.getUserMedia({ video: selectedCamera ? { deviceId: { exact: selectedCamera } } : true })
        .then(stream => {
          localStreamRef.current = stream;
          if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        })
        .catch(() => { toast({ title: 'לא ניתן לגשת למצלמה', variant: 'destructive' }); setCameraEnabled(false); });
    } else {
      localStreamRef.current?.getVideoTracks().forEach(t => { t.stop(); });
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
    }
  }, [cameraEnabled, selectedCamera, toast]);

  // ── Screen share ──
  const toggleScreenShare = useCallback(async () => {
    if (screenSharing) {
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
      setScreenSharing(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        screenStreamRef.current = stream;
        if (screenVideoRef.current) screenVideoRef.current.srcObject = stream;
        setScreenSharing(true);
        stream.getVideoTracks()[0].onended = () => { setScreenSharing(false); };
        toast({ title: 'שיתוף מסך הופעל' });
      } catch {
        toast({ title: 'שיתוף מסך בוטל', variant: 'destructive' });
      }
    }
  }, [screenSharing, toast]);

  // ── Toggle mic ──
  const toggleMic = useCallback(async () => {
    if (micEnabled) {
      localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = false; t.stop(); });
      setMicEnabled(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: selectedMic ? { deviceId: { exact: selectedMic } } : true,
        });
        stream.getAudioTracks().forEach(t => { localStreamRef.current?.addTrack(t); });
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

  // ── Canvas drawing ──
  const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingActive) return;
    setDrawing(true);
    lastPt.current = getCanvasPos(e);
  };

  const onCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing || !isDrawingActive || !canvasRef.current || !lastPt.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const pt = getCanvasPos(e);
    ctx.beginPath();
    if (drawTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = 24;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = drawColor;
      ctx.lineWidth = 3;
    }
    ctx.lineCap = 'round';
    ctx.moveTo(lastPt.current.x, lastPt.current.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastPt.current = pt;
  };

  const onCanvasMouseUp = () => { setDrawing(false); lastPt.current = null; };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  };

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

  const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ffffff', '#000000'];

  const screenActive = screenSharing || !!sharedScreenStream;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" dir="rtl">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 10 }}
        className="relative w-full max-w-6xl mx-4 bg-card rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col"
        style={{ maxHeight: '92vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />
            <span className="text-sm font-bold text-destructive uppercase tracking-wide">LIVE</span>
            <span className="text-sm font-medium text-foreground">{sessionTitle}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium flex items-center gap-1 ${connectionStatus === 'connected' ? 'text-accent' : 'text-muted-foreground'}`}>
              {connectionStatus === 'connected' ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              {connectionStatus === 'connected' ? 'מחובר' : 'מתחבר...'}
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />{participants.length}
            </span>
            <button
              onClick={() => setShowChat(v => !v)}
              className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-xs transition-all ${showChat ? 'border-primary/40 bg-primary/5 text-primary' : 'border-border text-muted-foreground'}`}
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

        {/* Body */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Main area */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Video / Screen area */}
            <div className="flex-1 bg-foreground/5 relative flex items-center justify-center min-h-0 overflow-hidden">
              {/* Shared screen with drawing canvas */}
              {screenActive ? (
                <div className="relative w-full h-full">
                  <video
                    ref={screenVideoRef}
                    autoPlay playsInline muted
                    className="w-full h-full object-contain"
                  />
                  {/* Drawing canvas overlay */}
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
                  <div className="absolute top-3 right-3 flex flex-col gap-2 bg-card/90 backdrop-blur-sm border border-border rounded-xl p-2 shadow-lg">
                    <button
                      onClick={() => setIsDrawingActive(v => !v)}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all text-xs ${isDrawingActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                      title="ציור"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {isDrawingActive && (
                      <>
                        <button
                          onClick={() => setDrawTool(t => t === 'eraser' ? 'pen' : 'eraser')}
                          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${drawTool === 'eraser' ? 'bg-accent/20 text-accent' : 'text-muted-foreground hover:bg-muted'}`}
                          title="מחק"
                        >
                          <Eraser className="w-3.5 h-3.5" />
                        </button>
                        <div className="space-y-1">
                          {COLORS.map(c => (
                            <button
                              key={c}
                              onClick={() => { setDrawColor(c); setDrawTool('pen'); }}
                              className={`w-5 h-5 rounded-full border-2 mx-auto block transition-all ${drawColor === c && drawTool === 'pen' ? 'border-foreground scale-125' : 'border-transparent'}`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                        <button
                          onClick={clearCanvas}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                          title="נקה הכל"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ) : cameraEnabled ? (
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-3xl font-bold text-primary">
                    {userName?.[0]?.toUpperCase() ?? 'U'}
                  </div>
                  <p className="text-sm font-medium">{userName}</p>
                  {deafened && <p className="text-xs text-muted-foreground">מושתק לחלוטין</p>}
                </div>
              )}

              {/* Camera PiP when screen sharing */}
              {screenActive && cameraEnabled && (
                <div className="absolute bottom-3 left-3 w-32 h-24 rounded-xl overflow-hidden border-2 border-card shadow-lg">
                  <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                </div>
              )}

              {/* Participants grid (other users) */}
              {participants.length > 1 && !screenActive && (
                <div className="absolute bottom-3 right-3 flex gap-2">
                  {participants.filter(p => p.userId !== userId).map(p => (
                    <div key={p.userId} className="w-24 h-18 bg-card/80 rounded-lg border border-border flex flex-col items-center justify-center gap-1 p-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {p.name[0]?.toUpperCase()}
                      </div>
                      <p className="text-[10px] text-foreground truncate w-full text-center">{p.name}</p>
                      {p.isMuted && <MicOff className="w-3 h-3 text-destructive" />}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Controls bar */}
            <div className="px-4 py-3 border-t border-border shrink-0 bg-card flex items-center justify-center gap-2 flex-wrap">
              {/* Mic */}
              <button
                onClick={toggleMic}
                disabled={deafened}
                className={`flex flex-col items-center gap-1 h-14 w-14 rounded-2xl border text-xs font-medium transition-all disabled:opacity-40 ${
                  micEnabled ? 'border-primary/40 bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                <span className="text-[10px]">{micEnabled ? 'מיק' : 'השתק'}</span>
              </button>

              {/* Deafen */}
              <button
                onClick={toggleDeafen}
                className={`flex flex-col items-center gap-1 h-14 w-14 rounded-2xl border text-xs font-medium transition-all ${
                  deafened ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                {deafened ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                <span className="text-[10px]">{deafened ? 'מושתק' : 'שמע'}</span>
              </button>

              {/* Camera */}
              <button
                onClick={() => setCameraEnabled(v => !v)}
                className={`flex flex-col items-center gap-1 h-14 w-14 rounded-2xl border text-xs font-medium transition-all ${
                  cameraEnabled ? 'border-accent/40 bg-accent/5 text-accent' : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                {cameraEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                <span className="text-[10px]">מצלמה</span>
              </button>

              {/* Screen share */}
              <button
                onClick={toggleScreenShare}
                className={`flex flex-col items-center gap-1 h-14 w-14 rounded-2xl border text-xs font-medium transition-all ${
                  screenSharing ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                {screenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                <span className="text-[10px]">{screenSharing ? 'הפסק' : 'שתף'}</span>
              </button>

              {/* Settings */}
              <button
                onClick={() => setShowSettings(v => !v)}
                className={`flex flex-col items-center gap-1 h-14 w-14 rounded-2xl border text-xs font-medium transition-all ${
                  showSettings ? 'border-border bg-muted text-foreground' : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                <Settings className="w-5 h-5" />
                <span className="text-[10px]">הגדרות</span>
              </button>

              <div className="flex-1" />

              {/* Leave */}
              <button
                onClick={onClose}
                className="h-10 px-5 rounded-2xl bg-destructive text-destructive-foreground text-xs font-bold hover:opacity-90 transition-all"
              >
                צא מהלייב
              </button>
            </div>

            {/* Settings panel */}
            <AnimatePresence>
              {showSettings && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-border bg-card/80 overflow-hidden"
                >
                  <div className="p-4 grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">מיקרופון</label>
                      <select
                        value={selectedMic}
                        onChange={e => setSelectedMic(e.target.value)}
                        className="w-full h-8 px-2 bg-background ring-1 ring-border rounded-lg text-xs text-foreground focus:outline-none text-right"
                      >
                        {audioDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `מיק ${d.deviceId.slice(0, 6)}`}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">מצלמה</label>
                      <select
                        value={selectedCamera}
                        onChange={e => setSelectedCamera(e.target.value)}
                        className="w-full h-8 px-2 bg-background ring-1 ring-border rounded-lg text-xs text-foreground focus:outline-none text-right"
                      >
                        {videoDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `מצלמה ${d.deviceId.slice(0, 6)}`}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">עוצמת שמע: {volume}%</label>
                      <input
                        type="range" min={0} max={100} value={volume}
                        onChange={e => setVolume(Number(e.target.value))}
                        className="w-full accent-primary"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
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
                <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">צ'אט</span>
                  <span className="text-xs text-muted-foreground mr-auto">{chatMessages.length}</span>
                </div>
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
                        msg.user_id === userId ? 'bg-primary text-primary-foreground rounded-tl-sm' : 'bg-muted text-foreground rounded-tr-sm'
                      }`}>
                        {msg.message}
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <div className="p-3 border-t border-border shrink-0">
                  <div className="flex gap-2">
                    <input
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                      placeholder="כתוב הודעה..."
                      maxLength={300}
                      className="flex-1 h-9 px-3 bg-background ring-1 ring-border rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-right"
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
