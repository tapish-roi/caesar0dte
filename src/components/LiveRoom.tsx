/**
 * LiveRoom — Full-screen Discord-style voice/video room.
 * - Screen share broadcasts to all participants (canvas frame streaming via Realtime)
 * - Collaborative drawing with per-user cursor + name indicators
 * - Mic test, speaking detection, force-mute
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Mic, MicOff, Volume2, VolumeX, Video, VideoOff,
  Monitor, MonitorOff, Settings, X, Users, PhoneOff,
  Pencil, Eraser, RotateCcw, MessageSquare, Send, Headphones,
  FlaskConical, StopCircle, Type, Zap, Minus, Plus,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ChatMessage { id: string; user_id: string; display_name: string; message: string; created_at: string; }
interface Participant { userId: string; name: string; stream?: MediaStream; isMuted: boolean; isDeafened: boolean; hasCamera: boolean; hasScreen: boolean; isForceMuted?: boolean; }

type DrawToolType = 'pen' | 'eraser' | 'text' | 'laser';

interface DrawPoint { x: number; y: number; }
interface DrawStroke {
  id: string;
  userId: string;
  userName: string;
  userColor: string;
  tool: DrawToolType;
  points: DrawPoint[];
  color: string;
  size: number;
  text?: string;
  textX?: number;
  textY?: number;
  fontSize?: number;
  createdAt: number;
}

interface RemoteCursor {
  userId: string;
  userName: string;
  color: string;
  x: number;
  y: number;
  updatedAt: number;
}

interface Props {
  sessionId: string;
  mentorId: string;
  userId: string;
  userName: string;
  sessionTitle: string;
  isMentor?: boolean;
  onClose: () => void;
  onSessionEnd?: (recordingBlob: Blob, durationSeconds: number) => void;
}

const USER_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#a855f7','#ec4899','#06b6d4'];
const getColorForUser = (uid: string) => USER_COLORS[uid.charCodeAt(0) % USER_COLORS.length];

// How many ms between screen-share frame broadcasts
const FRAME_INTERVAL_MS = 100; // ~10fps for low bandwidth

// ─── Component ────────────────────────────────────────────────────────────────
export default function LiveRoom({ sessionId, mentorId, userId, userName, sessionTitle, isMentor = false, onClose, onSessionEnd }: Props) {
  const { toast } = useToast();

  // ── Media state ──
  const [micEnabled, setMicEnabled] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  // Is someone else sharing screen?
  const [remoteScreenActive, setRemoteScreenActive] = useState(false);
  const [remoteScreenSharer, setRemoteScreenSharer] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState('');
  const [selectedCamera, setSelectedCamera] = useState('');
  const [selectedOutput, setSelectedOutput] = useState('');
  const [volume, setVolume] = useState(100);
  const [settingsTab, setSettingsTab] = useState<'mic' | 'audio' | 'camera'>('mic');

  // ── Mic test ──
  const [micTesting, setMicTesting] = useState(false);
  const [micTestLevel, setMicTestLevel] = useState(0);
  const micTestStreamRef = useRef<MediaStream | null>(null);
  const micTestLoopbackRef = useRef<AudioNode | null>(null);
  const micTestContextRef = useRef<AudioContext | null>(null);
  const micTestAnimRef = useRef<number | null>(null);

  // ── Speaking detection ──
  const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const speakingAnimRef = useRef<number | null>(null);
  const localMicStreamForAnalysis = useRef<MediaStream | null>(null);

  // ── Collaborative drawing state ──
  const [showDrawToolbar, setShowDrawToolbar] = useState(false);
  const [activeTool, setActiveTool] = useState<DrawToolType>('pen');
  const [drawColor, setDrawColor] = useState('#ef4444');
  const [penSize, setPenSize] = useState(3);
  const [eraserSize, setEraserSize] = useState(24);
  const [fontSize, setFontSize] = useState(20);
  const [strokes, setStrokes] = useState<DrawStroke[]>([]);
  const [isDrawingOnCanvas, setIsDrawingOnCanvas] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [textPos, setTextPos] = useState<DrawPoint | null>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [remoteCursors, setRemoteCursors] = useState<Map<string, RemoteCursor>>(new Map());
  const currentStrokeRef = useRef<DrawStroke | null>(null);
  const strokesRef = useRef<DrawStroke[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const laserAnimRef = useRef<number | null>(null);
  const drawBroadcastChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Connection / participants ──
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isForceMuted, setIsForceMuted] = useState(false);
  const [forceMutedUsers, setForceMutedUsers] = useState<Set<string>>(new Set());

  // ── Chat ──
  const [showChat, setShowChat] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSendingMsg, setIsSendingMsg] = useState(false);

  // ── Refs ──
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);       // local sharer
  const remoteScreenCanvasRef = useRef<HTMLCanvasElement>(null); // remote screen display
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const sessionStartRef = useRef<number>(Date.now());
  const recordingStreamRef = useRef<MediaStream | null>(null);

  // ── Screen share frame streaming ──
  const screenFrameChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const screenFrameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // Recording (mentor only)
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isMentor) return;
    sessionStartRef.current = Date.now();
    try {
      let stream: MediaStream;
      if (typeof (document as unknown as { captureStream?: () => MediaStream }).captureStream === 'function') {
        stream = (document as unknown as { captureStream: () => MediaStream }).captureStream();
      } else {
        const canvas = document.createElement('canvas');
        canvas.width = 1280; canvas.height = 720;
        stream = (canvas as unknown as { captureStream: (fps: number) => MediaStream }).captureStream(10);
      }
      recordingStreamRef.current = stream;
      const mr = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus' });
      mr.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      mr.start(5000);
      mediaRecorderRef.current = mr;
    } catch { /* skip */ }
    return () => { mediaRecorderRef.current?.state !== 'inactive' && mediaRecorderRef.current?.stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMentor]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Device enumeration
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const mics = devices.filter(d => d.kind === 'audioinput');
      const cams = devices.filter(d => d.kind === 'videoinput');
      const outs = devices.filter(d => d.kind === 'audiooutput');
      setAudioDevices(mics); setVideoDevices(cams); setOutputDevices(outs);
      if (mics.length) setSelectedMic(mics[0].deviceId);
      if (cams.length) setSelectedCamera(cams[0].deviceId);
      if (outs.length) setSelectedOutput(outs[0].deviceId);
    });
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Chat
  // ─────────────────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Self participant init
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    setParticipants([{ userId, name: userName || 'אתה', isMuted: true, isDeafened: false, hasCamera: false, hasScreen: false }]);
    setConnectionStatus('connected');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Presence & signal channel
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from('live_signals') as any).insert({
      session_id: sessionId, from_user_id: userId, to_user_id: mentorId,
      signal_type: 'presence', payload: { name: userName, isMentor },
    }).then(() => {});

    const ch = supabase.channel(`live-signals-${sessionId}-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_signals', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const sig = payload.new as { signal_type: string; from_user_id: string; to_user_id: string; payload: Record<string, unknown> };
          if (sig.signal_type === 'presence' && isMentor) {
            setParticipants(prev => {
              if (prev.find(p => p.userId === sig.from_user_id)) return prev;
              return [...prev, { userId: sig.from_user_id, name: String(sig.payload.name || 'משתמש'), isMuted: false, isDeafened: false, hasCamera: false, hasScreen: false }];
            });
          }
          if (sig.signal_type === 'force_mute' && sig.to_user_id === userId) {
            setIsForceMuted(true); setMicEnabled(false);
            localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = false; t.stop(); });
            toast({ title: 'הושתקת על ידי המנטור', description: 'אתה יכול להסיר את ההשתקה בעצמך' });
          }
          if (sig.signal_type === 'force_unmute' && sig.to_user_id === userId) {
            setIsForceMuted(false); toast({ title: 'המנטור הסיר את ההשתקה שלך' });
          }
          if (sig.signal_type === 'mute_ack' && isMentor) {
            const muted = sig.payload.muted as boolean;
            setParticipants(prev => prev.map(p => p.userId === sig.from_user_id ? { ...p, isMuted: muted, isForceMuted: muted } : p));
            setForceMutedUsers(prev => { const n = new Set(prev); muted ? n.add(sig.from_user_id) : n.delete(sig.from_user_id); return n; });
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, userId, mentorId, isMentor, userName]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Screen share — frame broadcast channel
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase.channel(`screen-share-${sessionId}`, { config: { broadcast: { self: true } } });

    // Receive remote frames
    ch.on('broadcast', { event: 'screen_frame' }, ({ payload }) => {
      const { dataUrl, sharerId, sharerName } = payload as { dataUrl: string; sharerId: string; sharerName: string };
      // Show on remote canvas for everyone (including the sharer who sees their own broadcast)
      const canvas = remoteScreenCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
      };
      img.src = dataUrl;
      setRemoteScreenActive(true);
      setRemoteScreenSharer(sharerName || sharerId);
    });

    ch.on('broadcast', { event: 'screen_share_start' }, ({ payload }) => {
      const { sharerId, sharerName } = payload as { sharerId: string; sharerName: string };
      setRemoteScreenActive(true);
      setRemoteScreenSharer(sharerName || sharerId);
      setParticipants(prev => prev.map(p => p.userId === sharerId ? { ...p, hasScreen: true } : p));
    });

    ch.on('broadcast', { event: 'screen_share_stop' }, ({ payload }) => {
      const { sharerId } = payload as { sharerId: string };
      setRemoteScreenActive(false);
      setRemoteScreenSharer('');
      setParticipants(prev => prev.map(p => p.userId === sharerId ? { ...p, hasScreen: false } : p));
      // Clear remote canvas
      const canvas = remoteScreenCanvasRef.current;
      if (canvas) { const ctx = canvas.getContext('2d'); ctx?.clearRect(0, 0, canvas.width, canvas.height); }
    });

    ch.subscribe();
    screenFrameChannelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [sessionId]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Broadcast screen frames while sharing
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!screenSharing) {
      if (screenFrameTimerRef.current) { clearInterval(screenFrameTimerRef.current); screenFrameTimerRef.current = null; }
      return;
    }
    // Create offscreen canvas for frame capture
    if (!offscreenCanvasRef.current) offscreenCanvasRef.current = document.createElement('canvas');
    const offscreen = offscreenCanvasRef.current;

    const captureFrame = () => {
      const video = screenVideoRef.current;
      if (!video || video.readyState < 2) return;
      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;
      offscreen.width = w;
      offscreen.height = h;
      const ctx = offscreen.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);
      // Also draw current drawing strokes on top
      renderStrokesOnCtx(ctx, w, h, strokesRef.current);
      const dataUrl = offscreen.toDataURL('image/jpeg', 0.5);
      screenFrameChannelRef.current?.send({
        type: 'broadcast', event: 'screen_frame',
        payload: { dataUrl, sharerId: userId, sharerName: userName },
      });
    };

    screenFrameTimerRef.current = setInterval(captureFrame, FRAME_INTERVAL_MS);
    return () => { if (screenFrameTimerRef.current) clearInterval(screenFrameTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenSharing, userId, userName]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Helper: render strokes on any ctx (used for frame broadcast)
  // ─────────────────────────────────────────────────────────────────────────────
  const renderStrokesOnCtx = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, stks: DrawStroke[]) => {
    const now = Date.now();
    for (const stroke of stks) {
      if (stroke.tool === 'text') {
        ctx.globalAlpha = 1;
        ctx.font = `bold ${stroke.fontSize ?? 20}px sans-serif`;
        ctx.fillStyle = stroke.color;
        ctx.fillText(stroke.text ?? '', (stroke.textX ?? 0) / (canvasRef.current?.width || w) * w, (stroke.textY ?? 0) / (canvasRef.current?.height || h) * h);
        continue;
      }
      if (stroke.tool === 'laser') {
        const age = now - stroke.createdAt;
        const FADE_END = 5000;
        if (age > FADE_END) continue;
        const alpha = age < 3000 ? 1 : 1 - (age - 3000) / 2000;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.size;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.shadowBlur = 8; ctx.shadowColor = stroke.color;
        ctx.globalCompositeOperation = 'source-over';
        if (stroke.points.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
          stroke.points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
        continue;
      }
      ctx.globalAlpha = 1;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (stroke.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = stroke.size;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.size;
      }
      if (stroke.points.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        stroke.points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
        ctx.stroke();
      } else if (stroke.points.length === 1) {
        ctx.beginPath();
        ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.size / 2, 0, Math.PI * 2);
        ctx.fillStyle = stroke.tool === 'eraser' ? 'rgba(0,0,0,1)' : stroke.color;
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Collaborative Drawing — Broadcast channel
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase.channel(`drawing-${sessionId}`, { config: { broadcast: { self: false } } });

    ch.on('broadcast', { event: 'stroke_add' }, ({ payload }) => {
      const stroke = payload.stroke as DrawStroke;
      strokesRef.current = [...strokesRef.current, stroke];
      setStrokes(s => [...s, stroke]);
    });

    ch.on('broadcast', { event: 'stroke_undo' }, ({ payload }) => {
      const { strokeId } = payload as { strokeId: string };
      strokesRef.current = strokesRef.current.filter(s => s.id !== strokeId);
      setStrokes(s => s.filter(st => st.id !== strokeId));
    });

    ch.on('broadcast', { event: 'canvas_clear' }, () => {
      strokesRef.current = [];
      setStrokes([]);
    });

    // Remote cursor positions
    ch.on('broadcast', { event: 'cursor_move' }, ({ payload }) => {
      const { cursorUserId, cursorUserName, color, x, y } = payload as { cursorUserId: string; cursorUserName: string; color: string; x: number; y: number };
      setRemoteCursors(prev => {
        const next = new Map(prev);
        next.set(cursorUserId, { userId: cursorUserId, userName: cursorUserName, color, x, y, updatedAt: Date.now() });
        return next;
      });
    });

    ch.on('broadcast', { event: 'cursor_leave' }, ({ payload }) => {
      const { cursorUserId } = payload as { cursorUserId: string };
      setRemoteCursors(prev => { const next = new Map(prev); next.delete(cursorUserId); return next; });
    });

    ch.subscribe();
    drawBroadcastChannelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [sessionId]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Clean up stale cursors after 3s of inactivity
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setRemoteCursors(prev => {
        let changed = false;
        const next = new Map(prev);
        for (const [uid, cur] of next) { if (now - cur.updatedAt > 3000) { next.delete(uid); changed = true; } }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Canvas render — redraws whenever strokes change (also handles laser fade)
  // ─────────────────────────────────────────────────────────────────────────────
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const now = Date.now();

    const allStrokes = [...strokesRef.current];
    if (currentStrokeRef.current) allStrokes.push(currentStrokeRef.current);

    for (const stroke of allStrokes) {
      if (stroke.tool === 'text') {
        ctx.globalAlpha = 1;
        ctx.font = `bold ${stroke.fontSize ?? 20}px sans-serif`;
        ctx.fillStyle = stroke.color;
        ctx.fillText(stroke.text ?? '', stroke.textX ?? 0, stroke.textY ?? 0);
        continue;
      }

      if (stroke.tool === 'laser') {
        const age = now - stroke.createdAt;
        const FADE_START = 3000; const FADE_END = 5000;
        if (age > FADE_END) continue;
        const alpha = age < FADE_START ? 1 : 1 - (age - FADE_START) / (FADE_END - FADE_START);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = 'source-over';
        ctx.shadowBlur = 8;
        ctx.shadowColor = stroke.color;
        if (stroke.points.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
          for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
        continue;
      }

      ctx.globalAlpha = 1;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (stroke.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = stroke.size;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.size;
      }
      if (stroke.points.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        ctx.stroke();
      } else if (stroke.points.length === 1) {
        ctx.beginPath();
        ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.size / 2, 0, Math.PI * 2);
        ctx.fillStyle = stroke.tool === 'eraser' ? 'rgba(0,0,0,1)' : stroke.color;
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }, []);

  useEffect(() => { renderCanvas(); }, [strokes, renderCanvas]);

  // Laser fade loop
  useEffect(() => {
    const hasLaser = strokes.some(s => s.tool === 'laser');
    if (!hasLaser) {
      if (laserAnimRef.current) { cancelAnimationFrame(laserAnimRef.current); laserAnimRef.current = null; }
      return;
    }
    const tick = () => {
      renderCanvas();
      const now = Date.now();
      const expired = strokesRef.current.filter(s => s.tool === 'laser' && now - s.createdAt > 5000);
      if (expired.length > 0) {
        strokesRef.current = strokesRef.current.filter(s => !(s.tool === 'laser' && now - s.createdAt > 5000));
        setStrokes(strokesRef.current.slice());
      }
      laserAnimRef.current = requestAnimationFrame(tick);
    };
    laserAnimRef.current = requestAnimationFrame(tick);
    return () => { if (laserAnimRef.current) cancelAnimationFrame(laserAnimRef.current); };
  }, [strokes, renderCanvas]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Canvas size sync — to the active screen area (local or remote)
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const isScreenVisible = screenSharing || remoteScreenActive;
    if (!isScreenVisible) return;

    const syncSize = () => {
      // Use the visible screen container (remote canvas or local video)
      const el = screenSharing ? screenVideoRef.current : remoteScreenCanvasRef.current;
      const canvas = canvasRef.current;
      if (!el || !canvas) return;
      canvas.width = el.offsetWidth;
      canvas.height = el.offsetHeight;
      renderCanvas();
    };
    const ro = new ResizeObserver(syncSize);
    const target = screenSharing ? screenVideoRef.current : remoteScreenCanvasRef.current;
    if (target) ro.observe(target);
    syncSize();
    return () => ro.disconnect();
  }, [screenSharing, remoteScreenActive, renderCanvas]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Canvas input helpers
  // ─────────────────────────────────────────────────────────────────────────────
  const getPos = (e: React.MouseEvent<HTMLCanvasElement>): DrawPoint => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const broadcastStroke = useCallback((stroke: DrawStroke) => {
    drawBroadcastChannelRef.current?.send({ type: 'broadcast', event: 'stroke_add', payload: { stroke } });
    strokesRef.current = [...strokesRef.current, stroke];
    setStrokes(s => [...s, stroke]);
  }, []);

  const broadcastCursor = useCallback((x: number, y: number) => {
    drawBroadcastChannelRef.current?.send({
      type: 'broadcast', event: 'cursor_move',
      payload: { cursorUserId: userId, cursorUserName: userName, color: getColorForUser(userId), x, y },
    });
  }, [userId, userName]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!showDrawToolbar) return;
    const pt = getPos(e);

    if (activeTool === 'text') {
      setTextPos(pt);
      setTextInput('');
      setShowTextInput(true);
      return;
    }

    const stroke: DrawStroke = {
      id: `${userId}-${Date.now()}-${Math.random()}`,
      userId, userName,
      userColor: getColorForUser(userId),
      tool: activeTool,
      points: [pt],
      color: activeTool === 'eraser' ? '#000' : activeTool === 'laser' ? '#ff4d4d' : drawColor,
      size: activeTool === 'eraser' ? eraserSize : activeTool === 'laser' ? 4 : penSize,
      createdAt: Date.now(),
    };
    currentStrokeRef.current = stroke;
    setIsDrawingOnCanvas(true);
    broadcastCursor(pt.x, pt.y);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDrawToolbar, activeTool, userId, userName, drawColor, penSize, eraserSize, broadcastCursor]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = getPos(e);
    if (showDrawToolbar) broadcastCursor(pt.x, pt.y);
    if (!isDrawingOnCanvas || !currentStrokeRef.current) return;
    currentStrokeRef.current = { ...currentStrokeRef.current, points: [...currentStrokeRef.current.points, pt] };
    renderCanvas();
  }, [isDrawingOnCanvas, renderCanvas, showDrawToolbar, broadcastCursor]);

  const handleCanvasMouseUp = useCallback(() => {
    if (!isDrawingOnCanvas || !currentStrokeRef.current) return;
    const stroke = currentStrokeRef.current;
    currentStrokeRef.current = null;
    setIsDrawingOnCanvas(false);
    broadcastStroke(stroke);
  }, [isDrawingOnCanvas, broadcastStroke]);

  const handleCanvasMouseLeave = useCallback(() => {
    handleCanvasMouseUp();
    drawBroadcastChannelRef.current?.send({ type: 'broadcast', event: 'cursor_leave', payload: { cursorUserId: userId } });
  }, [handleCanvasMouseUp, userId]);

  const handleTextConfirm = useCallback(() => {
    if (!textInput.trim() || !textPos) { setShowTextInput(false); return; }
    const stroke: DrawStroke = {
      id: `${userId}-${Date.now()}`,
      userId, userName,
      userColor: getColorForUser(userId),
      tool: 'text',
      points: [], color: drawColor, size: fontSize,
      text: textInput, textX: textPos.x, textY: textPos.y, fontSize,
      createdAt: Date.now(),
    };
    broadcastStroke(stroke);
    setShowTextInput(false);
    setTextInput('');
    setTextPos(null);
  }, [textInput, textPos, userId, userName, drawColor, fontSize, broadcastStroke]);

  const handleUndo = useCallback(() => {
    const myStrokes = strokesRef.current.filter(s => s.userId === userId);
    if (!myStrokes.length) return;
    const last = myStrokes[myStrokes.length - 1];
    drawBroadcastChannelRef.current?.send({ type: 'broadcast', event: 'stroke_undo', payload: { strokeId: last.id } });
    strokesRef.current = strokesRef.current.filter(s => s.id !== last.id);
    setStrokes(strokesRef.current.slice());
  }, [userId]);

  const handleClearAll = useCallback(() => {
    drawBroadcastChannelRef.current?.send({ type: 'broadcast', event: 'canvas_clear', payload: {} });
    strokesRef.current = [];
    setStrokes([]);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Speaking detection
  // ─────────────────────────────────────────────────────────────────────────────
  const startSpeakingDetection = useCallback((stream: MediaStream) => {
    if (speakingAnimRef.current) cancelAnimationFrame(speakingAnimRef.current);
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512; analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      localAnalyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setSpeakingUsers(prev => { const n = new Set(prev); avg > 18 ? n.add(userId) : n.delete(userId); return n; });
        speakingAnimRef.current = requestAnimationFrame(tick);
      };
      speakingAnimRef.current = requestAnimationFrame(tick);
    } catch { /* noop */ }
  }, [userId]);

  const stopSpeakingDetection = useCallback(() => {
    if (speakingAnimRef.current) { cancelAnimationFrame(speakingAnimRef.current); speakingAnimRef.current = null; }
    localAnalyserRef.current = null;
    setSpeakingUsers(prev => { const n = new Set(prev); n.delete(userId); return n; });
  }, [userId]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Mic
  // ─────────────────────────────────────────────────────────────────────────────
  const toggleMic = useCallback(async () => {
    if (micEnabled) {
      localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = false; t.stop(); });
      localMicStreamForAnalysis.current = null;
      stopSpeakingDetection();
      setMicEnabled(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: selectedMic ? { deviceId: { exact: selectedMic } } : true });
        stream.getAudioTracks().forEach(t => localStreamRef.current?.addTrack(t));
        localMicStreamForAnalysis.current = stream;
        startSpeakingDetection(stream);
        setMicEnabled(true);
        if (deafened) setDeafened(false);
      } catch { toast({ title: 'לא ניתן לגשת למיקרופון', variant: 'destructive' }); }
    }
  }, [micEnabled, selectedMic, deafened, toast, startSpeakingDetection, stopSpeakingDetection]);

  const toggleDeafen = useCallback(() => {
    setDeafened(v => {
      const next = !v;
      if (next && micEnabled) { localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = false; }); setMicEnabled(false); }
      return next;
    });
  }, [micEnabled]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Screen share
  // ─────────────────────────────────────────────────────────────────────────────
  const stopScreenShare = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
    setScreenSharing(false);
    setShowDrawToolbar(false);
    // Notify others
    screenFrameChannelRef.current?.send({
      type: 'broadcast', event: 'screen_share_stop',
      payload: { sharerId: userId },
    });
  }, [userId]);

  const toggleScreenShare = useCallback(async () => {
    if (screenSharing) { stopScreenShare(); return; }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      screenStreamRef.current = stream;
      if (screenVideoRef.current) screenVideoRef.current.srcObject = stream;
      setScreenSharing(true);
      stream.getVideoTracks()[0].onended = () => stopScreenShare();
      // Notify others
      screenFrameChannelRef.current?.send({
        type: 'broadcast', event: 'screen_share_start',
        payload: { sharerId: userId, sharerName: userName },
      });
      toast({ title: 'שיתוף מסך הופעל' });
    } catch { toast({ title: 'שיתוף מסך בוטל', variant: 'destructive' }); }
  }, [screenSharing, stopScreenShare, userId, userName, toast]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Camera
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (cameraEnabled) {
      navigator.mediaDevices.getUserMedia({ video: selectedCamera ? { deviceId: { exact: selectedCamera } } : true })
        .then(stream => { localStreamRef.current = stream; if (localVideoRef.current) localVideoRef.current.srcObject = stream; })
        .catch(() => { toast({ title: 'לא ניתן לגשת למצלמה', variant: 'destructive' }); setCameraEnabled(false); });
    } else {
      localStreamRef.current?.getVideoTracks().forEach(t => t.stop());
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
    }
  }, [cameraEnabled, selectedCamera, toast]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Mic test
  // ─────────────────────────────────────────────────────────────────────────────
  const startMicTest = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: selectedMic ? { deviceId: { exact: selectedMic } } : true });
      micTestStreamRef.current = stream;
      const ctx = new AudioContext();
      micTestContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain(); gain.gain.value = 1;
      source.connect(gain); gain.connect(ctx.destination);
      micTestLoopbackRef.current = gain;
      const analyser = ctx.createAnalyser(); analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        setMicTestLevel(Math.min(100, (data.reduce((a, b) => a + b, 0) / data.length / 60) * 100));
        micTestAnimRef.current = requestAnimationFrame(tick);
      };
      micTestAnimRef.current = requestAnimationFrame(tick);
      setMicTesting(true);
    } catch { toast({ title: 'לא ניתן לגשת למיקרופון לבדיקה', variant: 'destructive' }); }
  }, [selectedMic, toast]);

  const stopMicTest = useCallback(() => {
    if (micTestAnimRef.current) { cancelAnimationFrame(micTestAnimRef.current); micTestAnimRef.current = null; }
    micTestStreamRef.current?.getTracks().forEach(t => t.stop());
    micTestStreamRef.current = null;
    micTestContextRef.current?.close();
    micTestContextRef.current = null;
    micTestLoopbackRef.current = null;
    setMicTesting(false); setMicTestLevel(0);
  }, []);

  useEffect(() => { if (!showSettings && micTesting) stopMicTest(); }, [showSettings, micTesting, stopMicTest]);
  useEffect(() => () => { stopMicTest(); stopSpeakingDetection(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────────────────────────────────────────────
  // Leave
  // ─────────────────────────────────────────────────────────────────────────────
  const handleLeave = useCallback(() => {
    stopScreenShare(); stopSpeakingDetection(); stopMicTest();
    if (isMentor && mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      const mr = mediaRecorderRef.current;
      const dur = Math.round((Date.now() - sessionStartRef.current) / 1000);
      mr.onstop = () => {
        const blob = new Blob([...recordedChunksRef.current], { type: 'video/webm' });
        if (blob.size > 0 && onSessionEnd) onSessionEnd(blob, dur);
        onClose();
      };
      mr.stop();
    } else { onClose(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMentor, onClose, onSessionEnd, stopScreenShare, stopSpeakingDetection]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Force mute (mentor)
  // ─────────────────────────────────────────────────────────────────────────────
  const toggleForceMute = useCallback(async (targetId: string, muted: boolean) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('live_signals') as any).insert({
      session_id: sessionId, from_user_id: userId, to_user_id: targetId,
      signal_type: muted ? 'force_unmute' : 'force_mute', payload: { muted: !muted },
    });
    setForceMutedUsers(prev => { const n = new Set(prev); muted ? n.delete(targetId) : n.add(targetId); return n; });
    setParticipants(prev => prev.map(p => p.userId === targetId ? { ...p, isMuted: !muted, isForceMuted: !muted } : p));
  }, [sessionId, userId]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Send chat
  // ─────────────────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────
  const initials = (name: string) => name?.[0]?.toUpperCase() ?? '?';
  const myColor = getColorForUser(userId);

  // Is screen visible in center? (either I'm sharing or someone else is)
  const isScreenVisible = screenSharing || remoteScreenActive;

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────
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
          <button onClick={() => setShowMembers(v => !v)}
            className={`flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium transition-all ${showMembers ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white/80'}`}>
            <Users className="w-3.5 h-3.5" />{participants.length}
          </button>
          <button onClick={() => setShowChat(v => !v)}
            className={`relative flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium transition-all ${showChat ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white/80'}`}>
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

            {isScreenVisible ? (
              /* ── Screen share (shown to ALL participants) ── */
              <div className="relative w-full h-full">

                {/* Remote screen canvas — everyone sees this (including sharer who sees their own broadcast) */}
                <canvas
                  ref={remoteScreenCanvasRef}
                  className="w-full h-full object-contain bg-black"
                  style={{ display: 'block' }}
                />

                {/* Hidden local video for capturing frames */}
                <video ref={screenVideoRef} autoPlay playsInline muted className="hidden" />

                {/* Screen share owner label */}
                {remoteScreenSharer && (
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/70 backdrop-blur px-3 py-1.5 rounded-full border border-white/10">
                    <Monitor className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-xs text-white/80 font-medium">
                      {remoteScreenSharer === userName ? 'אתה משתף את המסך' : `${remoteScreenSharer} משתף את המסך`}
                    </span>
                  </div>
                )}

                {/* Drawing canvas overlay */}
                <canvas
                  ref={canvasRef}
                  className={`absolute inset-0 w-full h-full ${showDrawToolbar ? (activeTool === 'text' ? 'cursor-text' : 'cursor-crosshair') : 'pointer-events-none'}`}
                  style={{ touchAction: 'none' }}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onMouseLeave={handleCanvasMouseLeave}
                />

                {/* Remote cursor indicators */}
                {Array.from(remoteCursors.values()).map(cursor => (
                  <div
                    key={cursor.userId}
                    className="absolute pointer-events-none z-30 flex flex-col items-start"
                    style={{ left: cursor.x, top: cursor.y, transform: 'translate(4px, 4px)' }}
                  >
                    {/* Cursor dot */}
                    <div className="w-3 h-3 rounded-full border-2 border-white shadow-lg" style={{ backgroundColor: cursor.color }} />
                    {/* Name tag */}
                    <div
                      className="mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold text-white shadow-lg whitespace-nowrap"
                      style={{ backgroundColor: cursor.color + 'cc' }}
                    >
                      {cursor.userName}
                    </div>
                  </div>
                ))}

                {/* Text input overlay */}
                {showTextInput && textPos && (
                  <div className="absolute z-30" style={{ left: textPos.x, top: textPos.y - fontSize }}>
                    <input
                      autoFocus
                      value={textInput}
                      onChange={e => setTextInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleTextConfirm(); if (e.key === 'Escape') { setShowTextInput(false); setTextPos(null); } }}
                      onBlur={handleTextConfirm}
                      className="bg-transparent border-b border-white/60 text-white outline-none min-w-[80px]"
                      style={{ color: drawColor, fontSize: `${fontSize}px`, fontWeight: 'bold' }}
                      placeholder="הקלד..."
                    />
                  </div>
                )}

                {/* ── Drawing toolbar toggle button (bottom-left) ── */}
                <button
                  onClick={() => setShowDrawToolbar(v => !v)}
                  title="כלי ציור"
                  className={`absolute bottom-4 left-4 z-20 w-10 h-10 rounded-full flex items-center justify-center shadow-xl transition-all border ${
                    showDrawToolbar
                      ? 'bg-indigo-500 border-indigo-400 text-white shadow-indigo-500/40'
                      : 'bg-[#1e1f22]/90 border-white/20 text-white/60 hover:text-white hover:bg-[#2b2d31]'
                  }`}
                >
                  <Pencil className="w-4 h-4" />
                </button>

                {/* ── Drawing toolbar ── */}
                <AnimatePresence>
                  {showDrawToolbar && (
                    <motion.div
                      initial={{ opacity: 0, y: 12, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 12, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute bottom-16 left-4 z-20 flex flex-col gap-1 bg-[#1e1f22]/95 backdrop-blur border border-white/10 rounded-2xl p-3 shadow-2xl w-52"
                    >
                      {/* Tool selector row */}
                      <div className="flex gap-1 mb-1">
                        {([
                          { id: 'pen', icon: <Pencil className="w-3.5 h-3.5" />, label: 'עיפרון' },
                          { id: 'text', icon: <Type className="w-3.5 h-3.5" />, label: 'טקסט' },
                          { id: 'laser', icon: <Zap className="w-3.5 h-3.5" />, label: 'לייזר' },
                          { id: 'eraser', icon: <Eraser className="w-3.5 h-3.5" />, label: 'מחק' },
                        ] as const).map(t => (
                          <button
                            key={t.id}
                            onClick={() => setActiveTool(t.id)}
                            title={t.label}
                            className={`flex-1 h-8 flex items-center justify-center rounded-lg transition-all text-xs ${
                              activeTool === t.id
                                ? 'bg-indigo-500 text-white'
                                : 'text-white/50 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            {t.icon}
                          </button>
                        ))}
                      </div>

                      {/* Tool label */}
                      <p className="text-[10px] text-white/30 text-center mb-1">
                        {{ pen: 'עיפרון', text: 'טקסט', laser: 'לייזר (נמחק תוך 5 שנ׳)', eraser: 'מחק' }[activeTool]}
                      </p>

                      {/* Color row */}
                      {activeTool !== 'eraser' && (
                        <div className="flex gap-1 flex-wrap justify-center mb-1">
                          {['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#a855f7','#ffffff','#000000'].map(c => (
                            <button
                              key={c}
                              onClick={() => setDrawColor(c)}
                              className={`w-5 h-5 rounded-full border-2 transition-all ${drawColor === c ? 'border-white scale-125' : 'border-transparent'}`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      )}

                      {/* Size control */}
                      {activeTool === 'pen' && (
                        <div className="flex items-center gap-2 bg-white/5 rounded-lg px-2 py-1.5">
                          <button onClick={() => setPenSize(s => Math.max(1, s - 1))} className="text-white/50 hover:text-white"><Minus className="w-3 h-3" /></button>
                          <div className="flex-1 text-center text-[11px] text-white/70 font-bold">{penSize}px</div>
                          <button onClick={() => setPenSize(s => Math.min(30, s + 1))} className="text-white/50 hover:text-white"><Plus className="w-3 h-3" /></button>
                        </div>
                      )}
                      {activeTool === 'eraser' && (
                        <div className="flex items-center gap-2 bg-white/5 rounded-lg px-2 py-1.5">
                          <button onClick={() => setEraserSize(s => Math.max(8, s - 4))} className="text-white/50 hover:text-white"><Minus className="w-3 h-3" /></button>
                          <div className="flex-1 text-center text-[11px] text-white/70 font-bold">{eraserSize}px</div>
                          <button onClick={() => setEraserSize(s => Math.min(80, s + 4))} className="text-white/50 hover:text-white"><Plus className="w-3 h-3" /></button>
                        </div>
                      )}
                      {activeTool === 'text' && (
                        <div className="flex items-center gap-2 bg-white/5 rounded-lg px-2 py-1.5">
                          <button onClick={() => setFontSize(s => Math.max(10, s - 2))} className="text-white/50 hover:text-white"><Minus className="w-3 h-3" /></button>
                          <div className="flex-1 text-center text-[11px] text-white/70 font-bold">{fontSize}px</div>
                          <button onClick={() => setFontSize(s => Math.min(72, s + 2))} className="text-white/50 hover:text-white"><Plus className="w-3 h-3" /></button>
                        </div>
                      )}

                      <div className="border-t border-white/8 my-1" />

                      {/* Actions row */}
                      <div className="flex gap-1">
                        <button onClick={handleUndo} title="בטל ציור אחרון (שלי)"
                          className="flex-1 h-7 flex items-center justify-center gap-1 rounded-lg text-[10px] text-white/50 hover:text-white hover:bg-white/10 transition-all">
                          <RotateCcw className="w-3 h-3" /> בטל
                        </button>
                        <button onClick={handleClearAll} title="נקה הכל"
                          className="flex-1 h-7 flex items-center justify-center gap-1 rounded-lg text-[10px] text-red-400/70 hover:text-red-400 hover:bg-red-400/10 transition-all">
                          <X className="w-3 h-3" /> נקה
                        </button>
                      </div>

                      {/* My color indicator */}
                      <div className="flex items-center justify-center gap-1.5 mt-1">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: myColor }} />
                        <span className="text-[9px] text-white/25">הצבע שלך בציורים</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Camera PiP */}
                {cameraEnabled && (
                  <div className="absolute bottom-20 right-4 w-36 h-24 rounded-xl overflow-hidden border-2 border-white/20 shadow-2xl">
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
              /* ── Avatar grid ── */
              <div className="flex flex-col items-center gap-5 select-none">
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative">
                  <div className={`w-32 h-32 rounded-full flex items-center justify-center text-5xl font-bold text-white shadow-2xl border-4 transition-all ${micEnabled ? 'border-green-500 shadow-green-500/30' : 'border-white/10'}`}
                    style={{ background: 'linear-gradient(135deg, #5865f2, #7289da)' }}>
                    {initials(userName)}
                  </div>
                  {micEnabled && <div className="absolute inset-0 rounded-full border-4 border-green-500/40 animate-ping" />}
                  <div className={`absolute bottom-1 right-1 w-7 h-7 rounded-full border-4 border-[#313338] flex items-center justify-center ${micEnabled ? 'bg-green-500' : 'bg-[#4e5058]'}`}>
                    {micEnabled ? <Mic className="w-3 h-3 text-white" /> : <MicOff className="w-3 h-3 text-white/60" />}
                  </div>
                </motion.div>
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{userName}</p>
                  <p className="text-sm text-white/40 mt-0.5">{deafened ? 'מושתק לחלוטין' : micEnabled ? 'מדבר...' : 'מיקרופון כבוי'}</p>
                </div>
                {participants.length > 1 && (
                  <div className="flex gap-4 mt-2">
                    {participants.filter(p => p.userId !== userId).map(p => (
                      <div key={p.userId} className="flex flex-col items-center gap-2">
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white border-2 ${p.isMuted ? 'border-white/10' : 'border-green-500'}`}
                          style={{ background: 'linear-gradient(135deg, #5865f2, #7289da)' }}>{initials(p.name)}</div>
                        <p className="text-xs text-white/60">{p.name}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Controls bar ── */}
          <div className="shrink-0 bg-[#292b2f] border-t border-white/5 py-4 px-6 flex items-center justify-center gap-3">
            <div className="relative">
              <button onClick={toggleMic} disabled={deafened}
                title={isForceMuted ? 'הושתקת ע"י המנטור' : micEnabled ? 'השתק מיקרופון' : 'הפעל מיקרופון'}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg disabled:opacity-40 ${micEnabled ? 'bg-[#4e5058] hover:bg-[#6d6f78] text-white' : 'bg-red-500/90 hover:bg-red-500 text-white'} ${isForceMuted ? 'ring-2 ring-orange-400 ring-offset-2 ring-offset-[#292b2f]' : ''}`}>
                {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </button>
              {isForceMuted && (
                <div className="absolute -top-1 -right-1 bg-orange-500 rounded-full w-4 h-4 flex items-center justify-center">
                  <span className="text-white text-[8px] font-bold">M</span>
                </div>
              )}
            </div>
            <button onClick={toggleDeafen} title={deafened ? 'בטל השתקה' : 'השתק לחלוטין'}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg ${deafened ? 'bg-red-500/90 hover:bg-red-500 text-white' : 'bg-[#4e5058] hover:bg-[#6d6f78] text-white'}`}>
              {deafened ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <button onClick={() => setCameraEnabled(v => !v)} title={cameraEnabled ? 'כבה מצלמה' : 'הפעל מצלמה'}
              className="w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg bg-[#4e5058] hover:bg-[#6d6f78] text-white">
              {cameraEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5 opacity-50" />}
            </button>
            <button onClick={toggleScreenShare} title={screenSharing ? 'הפסק שיתוף מסך' : 'שתף מסך'}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg ${screenSharing ? 'bg-green-500/90 hover:bg-green-500 text-white' : 'bg-[#4e5058] hover:bg-[#6d6f78] text-white/50'}`}>
              {screenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
            </button>
            <button onClick={() => { setShowSettings(true); setSettingsTab('mic'); }} title="הגדרות"
              className="w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg bg-[#4e5058] hover:bg-[#6d6f78] text-white/50 hover:text-white">
              <Settings className="w-5 h-5" />
            </button>
            <div className="w-px h-10 bg-white/10 mx-1" />
            <button onClick={handleLeave} title={isMentor ? 'סיים שידור' : 'עזוב שיחה'}
              className="h-14 px-5 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center gap-2 transition-all shadow-lg shadow-red-500/30 font-medium text-sm">
              <PhoneOff className="w-5 h-5" />
              {isMentor ? 'סיים שידור' : 'צא'}
            </button>
          </div>
        </div>

        {/* ── Settings Modal ── */}
        <AnimatePresence>
          {showSettings && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" onClick={() => setShowSettings(false)} />
              <motion.div initial={{ opacity: 0, scale: 0.93, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.93, y: 12 }} transition={{ duration: 0.18 }}
                className="fixed inset-0 z-[61] flex items-center justify-center pointer-events-none">
                <div className="pointer-events-auto w-[520px] bg-[#1e1f22] rounded-2xl shadow-2xl border border-white/10 overflow-hidden" dir="rtl">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
                    <h2 className="text-base font-bold text-white">הגדרות שיחה</h2>
                    <button onClick={() => setShowSettings(false)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white/80 hover:bg-white/8 transition-all">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex min-h-0">
                    <div className="w-44 bg-[#2b2d31] p-3 flex flex-col gap-1 shrink-0">
                      {([
                        { id: 'mic', icon: <Mic className="w-4 h-4 shrink-0" />, label: 'מיקרופון' },
                        { id: 'audio', icon: <Headphones className="w-4 h-4 shrink-0" />, label: 'אוזניות / שמע' },
                        { id: 'camera', icon: <Video className="w-4 h-4 shrink-0" />, label: 'מצלמה' },
                      ] as const).map(t => (
                        <button key={t.id} onClick={() => setSettingsTab(t.id)}
                          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-right ${settingsTab === t.id ? 'bg-[#404249] text-white' : 'text-white/50 hover:text-white/80 hover:bg-white/5'}`}>
                          {t.icon}{t.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex-1 p-6 space-y-5">
                      {settingsTab === 'mic' && (
                        <>
                          <div>
                            <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3">בחירת מיקרופון</p>
                            <div className="space-y-2">
                              {audioDevices.length === 0 && <p className="text-xs text-white/30 italic">לא נמצאו מיקרופונים</p>}
                              {audioDevices.map(d => (
                                <button key={d.deviceId} onClick={() => setSelectedMic(d.deviceId)}
                                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all text-right border ${selectedMic === d.deviceId ? 'border-indigo-500/60 bg-indigo-500/10 text-white' : 'border-white/8 bg-white/3 text-white/60 hover:bg-white/6 hover:text-white/80'}`}>
                                  <Mic className={`w-4 h-4 shrink-0 ${selectedMic === d.deviceId ? 'text-indigo-400' : 'text-white/30'}`} />
                                  <span className="truncate">{d.label || `מיקרופון ${d.deviceId.slice(0, 8)}`}</span>
                                  {selectedMic === d.deviceId && <span className="mr-auto text-[10px] font-bold text-indigo-400 bg-indigo-500/20 px-2 py-0.5 rounded-full shrink-0">פעיל</span>}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="border-t border-white/8 pt-5">
                            <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3">בדיקת מיקרופון</p>
                            <div className="bg-[#2b2d31] rounded-xl p-4 space-y-3">
                              <p className="text-xs text-white/50 leading-relaxed">
                                {micTesting ? 'בדיקה פעילה — אתה שומע את עצמך. שאר המשתמשים לא שומעים אותך.' : 'לחץ לשמוע את עצמך. בזמן הבדיקה לא תשמע ולא תישמע.'}
                              </p>
                              {micTesting && (
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-white/30">עוצמת קלט</span>
                                    <span className="text-[10px] text-green-400 font-bold">{Math.round(micTestLevel)}%</span>
                                  </div>
                                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                                    <motion.div className="h-full rounded-full"
                                      style={{ width: `${micTestLevel}%`, background: micTestLevel > 70 ? 'linear-gradient(90deg,#22c55e,#ef4444)' : micTestLevel > 35 ? 'linear-gradient(90deg,#22c55e,#eab308)' : '#22c55e' }}
                                      animate={{ width: `${micTestLevel}%` }} transition={{ duration: 0.05 }} />
                                  </div>
                                </div>
                              )}
                              <button onClick={micTesting ? stopMicTest : startMicTest}
                                className={`flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold transition-all ${micTesting ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30' : 'bg-indigo-500 hover:bg-indigo-600 text-white'}`}>
                                {micTesting ? <><StopCircle className="w-4 h-4" />הפסק בדיקה</> : <><FlaskConical className="w-4 h-4" />בדוק מיקרופון</>}
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                      {settingsTab === 'audio' && (
                        <>
                          <div>
                            <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3">חיבור שמע יוצא</p>
                            <div className="space-y-2">
                              {outputDevices.length === 0 && <p className="text-xs text-white/30 italic">הדפדפן לא תומך בבחירת שמע יוצא</p>}
                              {outputDevices.map(d => (
                                <button key={d.deviceId} onClick={() => setSelectedOutput(d.deviceId)}
                                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all text-right border ${selectedOutput === d.deviceId ? 'border-indigo-500/60 bg-indigo-500/10 text-white' : 'border-white/8 bg-white/3 text-white/60 hover:bg-white/6 hover:text-white/80'}`}>
                                  <Headphones className={`w-4 h-4 shrink-0 ${selectedOutput === d.deviceId ? 'text-indigo-400' : 'text-white/30'}`} />
                                  <span className="truncate">{d.label || `התקן ${d.deviceId.slice(0, 8)}`}</span>
                                  {selectedOutput === d.deviceId && <span className="mr-auto text-[10px] font-bold text-indigo-400 bg-indigo-500/20 px-2 py-0.5 rounded-full shrink-0">פעיל</span>}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3">עוצמת שמע</p>
                            <div className="flex items-center gap-4 bg-[#2b2d31] rounded-xl px-4 py-3">
                              <VolumeX className="w-4 h-4 text-white/30 shrink-0" />
                              <input type="range" min={0} max={100} value={volume} onChange={e => setVolume(Number(e.target.value))} className="flex-1 accent-indigo-500 h-1.5" />
                              <Volume2 className="w-4 h-4 text-white/60 shrink-0" />
                              <span className="text-sm font-bold text-white/70 w-10 text-center shrink-0">{volume}%</span>
                            </div>
                          </div>
                        </>
                      )}
                      {settingsTab === 'camera' && (
                        <div>
                          <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3">בחירת מצלמה</p>
                          <div className="space-y-2">
                            {videoDevices.length === 0 && <p className="text-xs text-white/30 italic">לא נמצאו מצלמות</p>}
                            {videoDevices.map(d => (
                              <button key={d.deviceId} onClick={() => setSelectedCamera(d.deviceId)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all text-right border ${selectedCamera === d.deviceId ? 'border-indigo-500/60 bg-indigo-500/10 text-white' : 'border-white/8 bg-white/3 text-white/60 hover:bg-white/6 hover:text-white/80'}`}>
                                <Video className={`w-4 h-4 shrink-0 ${selectedCamera === d.deviceId ? 'text-indigo-400' : 'text-white/30'}`} />
                                <span className="truncate">{d.label || `מצלמה ${d.deviceId.slice(0, 8)}`}</span>
                                {selectedCamera === d.deviceId && <span className="mr-auto text-[10px] font-bold text-indigo-400 bg-indigo-500/20 px-2 py-0.5 rounded-full shrink-0">פעיל</span>}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="px-6 py-3 border-t border-white/8 flex justify-start">
                    <button onClick={() => setShowSettings(false)}
                      className="h-9 px-5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold transition-all">סגור</button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* ── Members panel ── */}
        <AnimatePresence>
          {showMembers && (
            <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 240, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }} className="bg-[#2b2d31] border-r border-white/5 flex flex-col shrink-0 overflow-hidden" style={{ minWidth: 0 }}>
              <div className="px-4 pt-5 pb-2 shrink-0">
                <p className="text-xs font-bold text-white/40 uppercase tracking-widest">חברים בשיחה — {participants.length}</p>
              </div>
              <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
                {participants.map(p => {
                  const isMe = p.userId === userId;
                  const isMentorEntry = p.userId === mentorId;
                  const forceMuted = forceMutedUsers.has(p.userId);
                  const isSpeaking = speakingUsers.has(p.userId);
                  const userColor = getColorForUser(p.userId);
                  return (
                    <div key={p.userId} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors group">
                      <div className="relative shrink-0">
                        {isSpeaking && !p.isMuted && (
                          <>
                            <span className="absolute -inset-1 rounded-full border-2 border-green-500 animate-ping opacity-60" />
                            <span className="absolute -inset-1 rounded-full border-2 border-green-500 opacity-80" />
                          </>
                        )}
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white transition-all ${isSpeaking && !p.isMuted ? 'ring-2 ring-green-500 ring-offset-1 ring-offset-[#2b2d31]' : ''}`}
                          style={{ background: `linear-gradient(135deg, ${userColor}bb, ${userColor})` }}
                        >
                          {initials(p.name)}
                        </div>
                        <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#2b2d31] ${p.isMuted ? 'bg-[#4e5058]' : 'bg-green-500'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white/80 truncate">
                          {p.name}
                          {isMe && <span className="text-[10px] text-white/30 mr-1">(אתה)</span>}
                          {isMentorEntry && !isMe && <span className="text-[10px] text-indigo-400 mr-1">מנטור</span>}
                        </p>
                        <p className={`text-[10px] transition-colors ${isSpeaking && !p.isMuted ? 'text-green-400' : 'text-white/30'}`}>
                          {p.isDeafened ? 'מושתק לחלוטין' : forceMuted ? 'מושתק ע"י מנטור' : p.isMuted ? 'מושתק' : isSpeaking ? 'מדבר...' : 'פעיל'}
                        </p>
                      </div>
                      {isMentor && !isMe && (
                        <button onClick={() => toggleForceMute(p.userId, forceMuted)} title={forceMuted ? 'הסר השתקה' : 'השתק משתמש'}
                          className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all shrink-0 ${forceMuted ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30' : 'opacity-0 group-hover:opacity-100 bg-red-500/10 text-red-400 hover:bg-red-500/20'}`}>
                          {forceMuted ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      {!isMentor && (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {p.isMuted && <MicOff className="w-3 h-3 text-red-400" />}
                          {p.hasCamera && <Video className="w-3 h-3 text-blue-400" />}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Chat panel ── */}
        <AnimatePresence>
          {showChat && (
            <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 300, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }} className="bg-[#313338] border-r border-white/5 flex flex-col shrink-0 overflow-hidden" style={{ minWidth: 0 }}>
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
                    <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${msg.user_id === userId ? 'bg-indigo-500 text-white rounded-tl-sm' : 'bg-[#2b2d31] text-white/80 rounded-tr-sm'}`}>
                      {msg.message}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="p-3 border-t border-white/5 shrink-0">
                <div className="flex gap-2 items-center bg-[#383a40] rounded-xl px-3 py-2">
                  <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                    placeholder="הודעה לכולם..." maxLength={300}
                    className="flex-1 bg-transparent text-xs text-white/80 placeholder:text-white/25 focus:outline-none text-right min-w-0" />
                  <button onClick={sendMessage} disabled={!chatInput.trim() || isSendingMsg}
                    className="w-7 h-7 flex items-center justify-center bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-all disabled:opacity-30 shrink-0">
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
