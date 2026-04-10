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
  Lock, Unlock, UserX, Copy, Link2, LayoutGrid, Maximize2,
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
const FRAME_INTERVAL_MS = 100; // ~10fps — reduced to avoid blocking main thread and causing audio jitter

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

  // ── Sound (output) test ──
  const [soundTesting, setSoundTesting] = useState(false);
  const soundTestContextRef = useRef<AudioContext | null>(null);
  const soundTestIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Speaking detection ──
  const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const speakingAnimRef = useRef<number | null>(null);
  const localMicStreamForAnalysis = useRef<MediaStream | null>(null);
  const localSpeakingActiveRef = useRef(false);

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
  const [contentRect, setContentRect] = useState<{ x: number; y: number; w: number; h: number }>({ x: 0, y: 0, w: 0, h: 0 });
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

  // ── Screen share requests ──
  const [screenShareRequested, setScreenShareRequested] = useState(false); // student sent request
  const [pendingScreenRequests, setPendingScreenRequests] = useState<{ userId: string; userName: string }[]>([]); // mentor sees

  // ── Room lock (mentor only) ──
  const [roomLocked, setRoomLocked] = useState(false);
  const [viewMode, setViewMode] = useState<'gallery' | 'speaker'>('gallery');
  const [galleryPage, setGalleryPage] = useState(0);
  const galleryTouchStartRef = useRef(0);

  // ── Chat ──
  const [showChat, setShowChat] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSendingMsg, setIsSendingMsg] = useState(false);

  // ── WebRTC ──
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const webrtcChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Remote speaking detection (Web Audio API per remote stream) ──
  const remoteAnalysersRef = useRef<Map<string, { ctx: AudioContext; analyser: AnalyserNode; animId: number }>>(new Map());
  const [remoteSpeakingUsers, setRemoteSpeakingUsers] = useState<Set<string>>(new Set());
  const remoteSpeakingStateRef = useRef<Map<string, boolean>>(new Map());
  // Stable function refs so getOrCreatePeer (defined earlier) can call them without forward-ref issues
  const startRemoteSpeakingDetectionRef = useRef<(remoteId: string, stream: MediaStream) => void>(() => {});
  const stopRemoteSpeakingDetectionRef = useRef<(remoteId: string) => void>(() => {});

  // ── Student screen share permission ──
  const [studentScreenShareApproved, setStudentScreenShareApproved] = useState(false);

  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  // ── Refs ──
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);       // local sharer
  const remoteScreenCanvasRef = useRef<HTMLCanvasElement>(null); // remote screen display
  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null); // Persists camera stream for video element
  const screenStreamRef = useRef<MediaStream | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const sessionStartRef = useRef<number>(Date.now());
  const recordingStreamRef = useRef<MediaStream | null>(null);

  // ── Screen share frame streaming ──
  const screenFrameChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const screenFrameTimerRef = useRef<number | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isSendingFrameRef = useRef(false);
  // Stable ref so screen_frame handler (defined before syncSize) can call syncRemoteCanvasLayout
  const syncRemoteCanvasLayoutRef = useRef<(imgW: number, imgH: number) => void>(() => {});


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
  // WebRTC helpers
  // ─────────────────────────────────────────────────────────────────────────────
  const sendSignal = useCallback((toId: string, type: string, data: Record<string, unknown>) => {
    webrtcChannelRef.current?.send({
      type: 'broadcast',
      event: 'webrtc',
      payload: { fromId: userId, toId, type, data },
    });
  }, [userId]);

  const getOrCreatePeer = useCallback((remoteId: string): RTCPeerConnection => {
    if (peersRef.current.has(remoteId)) return peersRef.current.get(remoteId)!;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peersRef.current.set(remoteId, pc);

    // Add existing local tracks and register senders
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        const sender = pc.addTrack(track, localStreamRef.current!);
        if (track.kind === 'audio') {
          audioSenderMapRef.current.set(pc, sender);
        }
      });
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal(remoteId, 'ice_candidate', { candidate: e.candidate.toJSON() });
    };

    pc.ontrack = (e) => {
      const track = e.track;
      // Use a stable MediaStream per participant — don't overwrite on each new track
      let stream = remoteStreamsRef.current.get(remoteId);
      if (!stream) {
        stream = new MediaStream();
        remoteStreamsRef.current.set(remoteId, stream);
      }
      // Replace existing track of the same kind to avoid duplicates
      stream.getTracks().filter(t => t.kind === track.kind).forEach(t => stream!.removeTrack(t));
      stream.addTrack(track);

      // Force React state update with a new Map reference
      setRemoteStreams(new Map(remoteStreamsRef.current));
      setParticipants(prev => prev.map(p =>
        p.userId === remoteId ? { ...p, stream, hasCamera: stream!.getVideoTracks().some(t => t.readyState === 'live') } : p
      ));
      // Start remote speaking detection when we get a stream with audio
      if (stream.getAudioTracks().length > 0) {
        startRemoteSpeakingDetectionRef.current(remoteId, stream);
      }
      // Detect when remote turns camera off
      track.onended = () => {
        const s = remoteStreamsRef.current.get(remoteId);
        const hasVid = s ? s.getVideoTracks().some(t => t.readyState === 'live') : false;
        setParticipants(prev => prev.map(p =>
          p.userId === remoteId ? { ...p, hasCamera: hasVid } : p
        ));
      };
      track.onmute = () => {
        const s = remoteStreamsRef.current.get(remoteId);
        const hasVid = s ? s.getVideoTracks().some(t => t.readyState === 'live' && !t.muted) : false;
        setParticipants(prev => prev.map(p =>
          p.userId === remoteId ? { ...p, hasCamera: hasVid } : p
        ));
      };
      track.onunmute = () => {
        const s = remoteStreamsRef.current.get(remoteId);
        const hasVid = s ? s.getVideoTracks().some(t => t.readyState === 'live') : false;
        setParticipants(prev => prev.map(p =>
          p.userId === remoteId ? { ...p, hasCamera: hasVid } : p
        ));
      };
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        peersRef.current.delete(remoteId);
        remoteStreamsRef.current.delete(remoteId);
        audioSenderMapRef.current.delete(pc);
        setRemoteStreams(new Map(remoteStreamsRef.current));
        stopRemoteSpeakingDetectionRef.current(remoteId);
      }
    };

    return pc;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendSignal]);

  // Renegotiate with ALL existing peers — serialized to prevent overlapping negotiations
  const renegotiatingRef = useRef(false);
  const renegotiatePendingRef = useRef(false);

  const renegotiateAll = useCallback(async () => {
    if (renegotiatingRef.current) {
      renegotiatePendingRef.current = true;
      return;
    }
    renegotiatingRef.current = true;
    try {
      for (const [remoteId, pc] of peersRef.current) {
        if (pc.signalingState === 'closed') continue;
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendSignal(remoteId, 'offer', { sdp: pc.localDescription, senderName: userName });
        } catch { /* noop */ }
      }
    } finally {
      renegotiatingRef.current = false;
      if (renegotiatePendingRef.current) {
        renegotiatePendingRef.current = false;
        renegotiateAll();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendSignal, userName]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Presence & signal channel (WebRTC signaling via Realtime broadcast)
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase.channel(`webrtc-${sessionId}`, { config: { broadcast: { self: false } } });
    webrtcChannelRef.current = ch;

    ch.on('broadcast', { event: 'webrtc' }, async ({ payload }) => {
      const { fromId, toId, type, data } = payload as { fromId: string; toId: string; type: string; data: Record<string, unknown> };
      if (toId !== userId && type !== 'presence') return;

      if (type === 'presence') {
        // Add participant if not known
        setParticipants(prev => {
          if (prev.find(p => p.userId === fromId)) return prev;
          return [...prev, { userId: fromId, name: String(data.name || 'משתמש'), isMuted: true, isDeafened: false, hasCamera: false, hasScreen: false }];
        });
        // Existing participants create an offer to the newcomer (include our name so they can identify us)
        const pc = getOrCreatePeer(fromId);
        try {
          const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
          await pc.setLocalDescription(offer);
          sendSignal(fromId, 'offer', { sdp: pc.localDescription, senderName: userName });
        } catch { /* noop */ }
        return;
      }

      if (type === 'offer') {
        // ★ KEY FIX: add the offer sender as a participant if not yet known
        // (student misses mentor's initial presence broadcast since they weren't subscribed yet)
        setParticipants(prev => {
          if (prev.find(p => p.userId === fromId)) return prev;
          return [...prev, { userId: fromId, name: String(data.senderName || 'משתמש'), isMuted: true, isDeafened: false, hasCamera: false, hasScreen: false }];
        });
        const pc = getOrCreatePeer(fromId);
        try {
          // Handle glare: if we also have a pending offer, rollback ours and accept theirs
          if (pc.signalingState === 'have-local-offer') {
            await pc.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit);
          }
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp as RTCSessionDescriptionInit));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal(fromId, 'answer', { sdp: pc.localDescription, senderName: userName });
        } catch { /* noop */ }
        return;
      }

      if (type === 'answer') {
        const pc = peersRef.current.get(fromId);
        if (pc && pc.signalingState !== 'stable') {
          try { await pc.setRemoteDescription(new RTCSessionDescription(data.sdp as RTCSessionDescriptionInit)); } catch { /* noop */ }
        }
        return;
      }

      if (type === 'ice_candidate') {
        const pc = peersRef.current.get(fromId);
        if (pc && data.candidate) {
          try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate as RTCIceCandidateInit)); } catch { /* noop */ }
        }
        return;
      }

      // ── Force mute signals (still via broadcast) ──
      if (type === 'force_mute') {
        setIsForceMuted(true); setMicEnabled(false);
        // Remove audio senders from peers so re-enable works cleanly
        peersRef.current.forEach(pc => {
          pc.getSenders().filter(s => s.track?.kind === 'audio').forEach(s => pc.removeTrack(s));
        });
        localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = false; t.stop(); });
        localMicStreamForAnalysis.current = null;
        toast({ title: '🔇 הושתקת על ידי המנטור', description: 'לחץ על כפתור המיקרופון כדי לפתוח מחדש' });
        return;
      }
      if (type === 'force_unmute') {
        setIsForceMuted(false); toast({ title: 'המנטור הסיר את ההשתקה שלך' });
        return;
      }
      if (type === 'mute_ack' && isMentor) {
        const muted = data.muted as boolean;
        setParticipants(prev => prev.map(p => p.userId === fromId ? { ...p, isMuted: muted, isForceMuted: muted } : p));
        setForceMutedUsers(prev => { const n = new Set(prev); muted ? n.add(fromId) : n.delete(fromId); return n; });
        return;
      }
      // ── Screen share request signals ──
      if (type === 'request_screen_share' && isMentor) {
        const requesterName = String(data.userName || 'תלמיד');
        const requesterId = String(fromId);
        setPendingScreenRequests(prev => {
          if (prev.find(r => r.userId === requesterId)) return prev;
          return [...prev, { userId: requesterId, userName: requesterName }];
        });
        // Fire a prominent toast with approve/deny action buttons
        toast({
          title: `📺 בקשת שיתוף מסך`,
          description: `${requesterName} מבקש לשתף מסך`,
          duration: 30000,
          action: (
            <div className="flex gap-2 mt-1">
              <button
                onClick={async () => {
                  await (supabase.from('live_signals') as any).insert({
                    session_id: sessionId, from_user_id: userId, to_user_id: requesterId,
                    signal_type: 'screen_share_approved', payload: {},
                  });
                  setPendingScreenRequests(prev => prev.filter(r => r.userId !== requesterId));
                  toast({ title: `✅ אישרת את ${requesterName} לשתף מסך` });
                }}
                className="px-3 py-1 text-xs font-semibold rounded-lg bg-green-500 text-white hover:bg-green-600 transition-colors"
              >
                אשר
              </button>
              <button
                onClick={async () => {
                  await (supabase.from('live_signals') as any).insert({
                    session_id: sessionId, from_user_id: userId, to_user_id: requesterId,
                    signal_type: 'screen_share_denied', payload: {},
                  });
                  setPendingScreenRequests(prev => prev.filter(r => r.userId !== requesterId));
                }}
                className="px-3 py-1 text-xs font-semibold rounded-lg bg-red-500/80 text-white hover:bg-red-500 transition-colors"
              >
                דחה
              </button>
            </div>
          ) as any,
        });
        return;
      }
      if (type === 'screen_share_approved' && !isMentor) {
        setScreenShareRequested(false);
        setStudentScreenShareApproved(true);
        toast({ title: 'המנטור אישר את בקשתך לשתף מסך!' });
        return;
      }
      if (type === 'screen_share_denied' && !isMentor) {
        setScreenShareRequested(false);
        setStudentScreenShareApproved(false);
        toast({ title: 'הבקשה לשיתוף מסך נדחתה', variant: 'destructive' });
        return;
      }
      // ── Media state sync ──
      if (type === 'media_state') {
        const mic = data.micEnabled as boolean;
        const cam = data.cameraEnabled as boolean;
        setParticipants(prev => prev.map(p =>
          p.userId === fromId ? { ...p, isMuted: !mic, hasCamera: cam } : p
        ));
        return;
      }
      // ── Leave signal ──
      if (type === 'leave') {
        const pc = peersRef.current.get(fromId);
        if (pc) { pc.close(); peersRef.current.delete(fromId); }
        remoteStreamsRef.current.delete(fromId);
        setRemoteStreams(new Map(remoteStreamsRef.current));
        setParticipants(prev => prev.filter(p => p.userId !== fromId));
        stopRemoteSpeakingDetectionRef.current(fromId);
        return;
      }
      // ── Kicked signal ──
      if (type === 'kicked' && !isMentor) {
        toast({ title: 'הוסרת מהשיחה על ידי המנטור', variant: 'destructive' });
        setTimeout(() => onClose(), 1500);
        return;
      }
      // ── Room lock signal ──
      if (type === 'room_lock') {
        // Students just get informed — actual blocking happens on presence join
        return;
      }
    });

    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // Announce presence to all others in the room
        ch.send({
          type: 'broadcast',
          event: 'webrtc',
          payload: { fromId: userId, toId: '*', type: 'presence', data: { name: userName, isMentor } },
        });
      }
    });

    return () => {
      supabase.removeChannel(ch);
      peersRef.current.forEach(pc => pc.close());
      peersRef.current.clear();
      remoteStreamsRef.current.clear();
      setRemoteStreams(new Map());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, userId, mentorId, isMentor, userName]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Legacy DB-based signals (force mute + screen share approval) — kept for backward compat
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase.channel(`live-signals-${sessionId}-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_signals', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const sig = payload.new as { signal_type: string; from_user_id: string; to_user_id: string; payload: Record<string, unknown> };
          if (sig.signal_type === 'force_mute' && sig.to_user_id === userId) {
            setIsForceMuted(true); setMicEnabled(false);
            peersRef.current.forEach(pc => {
              pc.getSenders().filter(s => s.track?.kind === 'audio').forEach(s => pc.removeTrack(s));
            });
            localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = false; t.stop(); });
            localMicStreamForAnalysis.current = null;
            toast({ title: '🔇 הושתקת על ידי המנטור', description: 'לחץ על כפתור המיקרופון כדי לפתוח מחדש' });
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
  }, [sessionId, userId, mentorId, isMentor]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Screen share — frame broadcast channel
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase.channel(`screen-share-${sessionId}`, { config: { broadcast: { self: true } } });

    // Receive remote frames — ignore frames we ourselves are sending
    ch.on('broadcast', { event: 'screen_frame' }, ({ payload }) => {
      const { dataUrl, sharerId, sharerName } = payload as { dataUrl: string; sharerId: string; sharerName: string };
      // If WE are the sharer, don't render on the remote canvas — we already show the local video element
      if (sharerId === userId) return;
      const canvas = remoteScreenCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        // Sync remote canvas CSS layout to match content aspect ratio inside its container
        syncRemoteCanvasLayoutRef.current(img.naturalWidth, img.naturalHeight);
      };
      img.src = dataUrl;
      setRemoteScreenActive(true);
      setRemoteScreenSharer(sharerName || sharerId);
    });

    ch.on('broadcast', { event: 'screen_share_start' }, ({ payload }) => {
      const { sharerId, sharerName } = payload as { sharerId: string; sharerName: string };
      // Don't mark remote screen active if WE are the one sharing
      if (sharerId !== userId) {
        setRemoteScreenActive(true);
        setRemoteScreenSharer(sharerName || sharerId);
      }
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
  }, [sessionId, userId]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Broadcast screen frames while sharing
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!screenSharing) {
      if (screenFrameTimerRef.current !== null) { cancelAnimationFrame(screenFrameTimerRef.current); screenFrameTimerRef.current = null; }
      isSendingFrameRef.current = false;
      return;
    }
    // Create offscreen canvas for frame capture
    if (!offscreenCanvasRef.current) offscreenCanvasRef.current = document.createElement('canvas');
    const offscreen = offscreenCanvasRef.current;

    // Use requestAnimationFrame so frame capture runs in sync with vsync and does NOT
    // block the main thread with a tight setInterval — preventing WebRTC jitter buffer buildup.
    // isSendingFrameRef prevents overlap if toDataURL takes longer than one frame interval.
    let lastCapture = 0;
    const captureFrame = async () => {
      if (isSendingFrameRef.current) return;
      const video = screenVideoRef.current;
      if (!video || video.readyState < 2) return;
      // Reduced to 960px + WebP 65% — still visually crisp but ~40% smaller payload
      const MAX_W = 960;
      const origW = video.videoWidth || 1280;
      const origH = video.videoHeight || 720;
      const scale = Math.min(1, MAX_W / origW);
      const w = Math.round(origW * scale);
      const h = Math.round(origH * scale);
      offscreen.width = w;
      offscreen.height = h;
      const ctx = offscreen.getContext('2d');
      if (!ctx) return;
      isSendingFrameRef.current = true;
      try {
        ctx.drawImage(video, 0, 0, w, h);
        // Don't bake strokes — each client renders them locally via the drawing canvas overlay
        const dataUrl = offscreen.toDataURL('image/webp', 0.65) || offscreen.toDataURL('image/jpeg', 0.60);
        await screenFrameChannelRef.current?.send({
          type: 'broadcast', event: 'screen_frame',
          payload: { dataUrl, sharerId: userId, sharerName: userName },
        });
      } finally {
        isSendingFrameRef.current = false;
      }
    };

    const loop = (ts: number) => {
      if (!screenFrameTimerRef.current && screenFrameTimerRef.current !== 0) return; // stopped
      if (ts - lastCapture >= FRAME_INTERVAL_MS) {
        lastCapture = ts;
        captureFrame();
      }
      screenFrameTimerRef.current = requestAnimationFrame(loop);
    };
    screenFrameTimerRef.current = requestAnimationFrame(loop);

    return () => {
      if (screenFrameTimerRef.current !== null) { cancelAnimationFrame(screenFrameTimerRef.current); screenFrameTimerRef.current = null; }
      isSendingFrameRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenSharing, userId, userName]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Helper: render strokes on any ctx (used for frame broadcast)
  // ─────────────────────────────────────────────────────────────────────────────
  const renderStrokesOnCtx = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, stks: DrawStroke[]) => {
    const now = Date.now();
    // All strokes are stored in normalized [0,1] coords — scale to pixels at render time
    const px = (pt: DrawPoint) => ({ x: pt.x * w, y: pt.y * h });
    for (const stroke of stks) {
      if (stroke.tool === 'text') {
        ctx.globalAlpha = 1;
        ctx.font = `bold ${stroke.fontSize ?? 20}px sans-serif`;
        ctx.fillStyle = stroke.color;
        ctx.fillText(stroke.text ?? '', (stroke.textX ?? 0) * w, (stroke.textY ?? 0) * h);
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
          ctx.moveTo(px(stroke.points[0]).x, px(stroke.points[0]).y);
          stroke.points.slice(1).forEach(p => ctx.lineTo(px(p).x, px(p).y));
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
        ctx.moveTo(px(stroke.points[0]).x, px(stroke.points[0]).y);
        stroke.points.slice(1).forEach(p => ctx.lineTo(px(p).x, px(p).y));
        ctx.stroke();
      } else if (stroke.points.length === 1) {
        ctx.beginPath();
        ctx.arc(px(stroke.points[0]).x, px(stroke.points[0]).y, stroke.size / 2, 0, Math.PI * 2);
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
    const ch = supabase.channel(`drawing-${sessionId}`, { config: { broadcast: { self: true } } });

    ch.on('broadcast', { event: 'stroke_add' }, ({ payload }) => {
      // Incoming strokes are already normalized [0,1] — store as-is, scale at render time
      const raw = payload.stroke as DrawStroke;
      strokesRef.current = [...strokesRef.current, raw];
      setStrokes(s => [...s, raw]);
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

    // Remote cursor positions — stored as normalized [0,1], rendered via CSS %
    ch.on('broadcast', { event: 'cursor_move' }, ({ payload }) => {
      const { cursorUserId, cursorUserName, color, x, y } = payload as { cursorUserId: string; cursorUserName: string; color: string; x: number; y: number };
      setRemoteCursors(prev => {
        const next = new Map(prev);
        // x,y are already [0,1] — store as-is, render with `left: x*100%`
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
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const now = Date.now();
    // All strokes stored in normalized [0,1] — scale to pixels at render time
    const px = (pt: DrawPoint) => ({ x: pt.x * w, y: pt.y * h });

    const allStrokes = [...strokesRef.current];
    if (currentStrokeRef.current) allStrokes.push(currentStrokeRef.current);

    for (const stroke of allStrokes) {
      if (stroke.tool === 'text') {
        ctx.globalAlpha = 1;
        ctx.font = `bold ${stroke.fontSize ?? 20}px sans-serif`;
        ctx.fillStyle = stroke.color;
        ctx.fillText(stroke.text ?? '', (stroke.textX ?? 0) * w, (stroke.textY ?? 0) * h);
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
          ctx.moveTo(px(stroke.points[0]).x, px(stroke.points[0]).y);
          for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(px(stroke.points[i]).x, px(stroke.points[i]).y);
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
        ctx.moveTo(px(stroke.points[0]).x, px(stroke.points[0]).y);
        for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(px(stroke.points[i]).x, px(stroke.points[i]).y);
        ctx.stroke();
      } else if (stroke.points.length === 1) {
        ctx.beginPath();
        ctx.arc(px(stroke.points[0]).x, px(stroke.points[0]).y, stroke.size / 2, 0, Math.PI * 2);
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
  // Canvas size sync — sizes drawing canvas to the CONTENT rect (no letterbox bars)
  // so that normalized [0,1] coords map identically on every screen size.
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const isScreenVisible = screenSharing || remoteScreenActive;
    if (!isScreenVisible) return;

    /** Compute the pixel rect of the video/canvas content inside its container,
     *  accounting for object-contain letterboxing. */
    const computeContentRect = (intrinsicW: number, intrinsicH: number, container: HTMLElement) => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (intrinsicW === 0 || intrinsicH === 0) return null;
      const scale = Math.min(cw / intrinsicW, ch / intrinsicH);
      const contentW = intrinsicW * scale;
      const contentH = intrinsicH * scale;
      const offsetX = (cw - contentW) / 2;
      const offsetY = (ch - contentH) / 2;
      return { x: offsetX, y: offsetY, w: contentW, h: contentH };
    };

    const syncSize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const container = canvas.parentElement;
      if (!container) return;

      let intrinsicW = 0;
      let intrinsicH = 0;
      if (screenSharing && screenVideoRef.current) {
        intrinsicW = screenVideoRef.current.videoWidth || 0;
        intrinsicH = screenVideoRef.current.videoHeight || 0;
      } else if (remoteScreenCanvasRef.current) {
        intrinsicW = remoteScreenCanvasRef.current.width || 0;
        intrinsicH = remoteScreenCanvasRef.current.height || 0;
      }
      if (intrinsicW === 0 || intrinsicH === 0) return; // not ready yet

      const rect = computeContentRect(intrinsicW, intrinsicH, container);
      if (!rect) return;

      // Size the drawing canvas to exactly the content area (no black bars)
      canvas.width = Math.round(rect.w);
      canvas.height = Math.round(rect.h);
      canvas.style.position = 'absolute';
      canvas.style.inset = 'unset';
      canvas.style.left = `${rect.x}px`;
      canvas.style.top = `${rect.y}px`;
      canvas.style.width = `${rect.w}px`;
      canvas.style.height = `${rect.h}px`;
      setContentRect(rect);
      renderCanvas();
    };

    /** Called after each remote frame draw to keep CSS layout in sync */
    const syncRemoteCanvasLayout = (imgW: number, imgH: number) => {
      const remoteCanvas = remoteScreenCanvasRef.current;
      if (!remoteCanvas || !remoteCanvas.parentElement) return;
      const container = remoteCanvas.parentElement;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (imgW === 0 || imgH === 0) return;
      const scale = Math.min(cw / imgW, ch / imgH);
      const contentW = imgW * scale;
      const contentH = imgH * scale;
      const offsetX = (cw - contentW) / 2;
      const offsetY = (ch - contentH) / 2;
      remoteCanvas.style.position = 'absolute';
      remoteCanvas.style.inset = 'unset';
      remoteCanvas.style.left = `${offsetX}px`;
      remoteCanvas.style.top = `${offsetY}px`;
      remoteCanvas.style.width = `${contentW}px`;
      remoteCanvas.style.height = `${contentH}px`;
      // Re-sync drawing canvas too
      syncSize();
    };
    syncRemoteCanvasLayoutRef.current = syncRemoteCanvasLayout;

    const ro = new ResizeObserver(syncSize);
    const containerEl = canvasRef.current?.parentElement;
    if (containerEl) ro.observe(containerEl);
    // Sync on video metadata ready (local sharer)
    const vid = screenVideoRef.current;
    if (screenSharing && vid) vid.addEventListener('loadedmetadata', syncSize);
    syncSize();
    return () => {
      ro.disconnect();
      if (screenSharing && vid) vid.removeEventListener('loadedmetadata', syncSize);
    };
  }, [screenSharing, remoteScreenActive, renderCanvas]);


  // ─────────────────────────────────────────────────────────────────────────────
  // Canvas input helpers — all coordinates are normalized [0,1] for broadcasting
  // so that drawings appear at the same relative position on every screen size.
  // ─────────────────────────────────────────────────────────────────────────────

  /** Convert a mouse event to canvas-relative pixel coords */
  const getPos = (e: React.MouseEvent<HTMLCanvasElement>): DrawPoint => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** Normalize pixel coords to [0,1] relative to the current canvas size */
  const normalizePoint = useCallback((pt: DrawPoint): DrawPoint => {
    const c = canvasRef.current;
    if (!c || c.width === 0 || c.height === 0) return pt;
    return { x: pt.x / c.width, y: pt.y / c.height };
  }, []);


  const broadcastStroke = useCallback((stroke: DrawStroke) => {
    // Normalize before sending — scale pixels to [0,1] relative to current canvas size
    const normalized: DrawStroke = {
      ...stroke,
      points: stroke.points.map(normalizePoint),
      textX: stroke.textX != null ? (stroke.textX / (canvasRef.current?.width || 1)) : stroke.textX,
      textY: stroke.textY != null ? (stroke.textY / (canvasRef.current?.height || 1)) : stroke.textY,
    };
    drawBroadcastChannelRef.current?.send({ type: 'broadcast', event: 'stroke_add', payload: { stroke: normalized } });
    // Store normalized locally — renderCanvas scales at draw time, resize-proof
    strokesRef.current = [...strokesRef.current, normalized];
    setStrokes(s => [...s, normalized]);
  }, [normalizePoint]);

  const broadcastCursor = useCallback((x: number, y: number) => {
    const c = canvasRef.current;
    const nx = c && c.width ? x / c.width : x;
    const ny = c && c.height ? y / c.height : y;
    drawBroadcastChannelRef.current?.send({
      type: 'broadcast', event: 'cursor_move',
      payload: { cursorUserId: userId, cursorUserName: userName, color: getColorForUser(userId), x: nx, y: ny },
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
    const c = canvasRef.current;
    const normX = c && c.width ? textPos.x / c.width : textPos.x;
    const normY = c && c.height ? textPos.y / c.height : textPos.y;
    const stroke: DrawStroke = {
      id: `${userId}-${Date.now()}`,
      userId, userName,
      userColor: getColorForUser(userId),
      tool: 'text',
      points: [], color: drawColor, size: fontSize,
      text: textInput, textX: normX, textY: normY, fontSize,
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
  // Speaking detection — local mic
  // ─────────────────────────────────────────────────────────────────────────────
  const startSpeakingDetection = useCallback((stream: MediaStream) => {
    if (speakingAnimRef.current) cancelAnimationFrame(speakingAnimRef.current);
    try {
      // latencyHint: 'interactive' tells the browser to prioritise low latency over throughput
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512; analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      localAnalyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (ctx.state === 'suspended') ctx.resume();
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const isSpeakingNow = avg > 18;
        if (localSpeakingActiveRef.current !== isSpeakingNow) {
          localSpeakingActiveRef.current = isSpeakingNow;
          setSpeakingUsers(prev => {
            const next = new Set(prev);
            isSpeakingNow ? next.add(userId) : next.delete(userId);
            return next;
          });
        }
        speakingAnimRef.current = requestAnimationFrame(tick);
      };
      speakingAnimRef.current = requestAnimationFrame(tick);
    } catch { /* noop */ }
  }, [userId]);

  const stopSpeakingDetection = useCallback(() => {
    if (speakingAnimRef.current) { cancelAnimationFrame(speakingAnimRef.current); speakingAnimRef.current = null; }
    localAnalyserRef.current = null;
    localSpeakingActiveRef.current = false;
    setSpeakingUsers(prev => { const n = new Set(prev); n.delete(userId); return n; });
  }, [userId]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Speaking detection — remote streams (Web Audio API per peer)
  // ─────────────────────────────────────────────────────────────────────────────
  const startRemoteSpeakingDetection = useCallback((remoteId: string, stream: MediaStream) => {
    // Stop existing analyser for this peer if any
    const existing = remoteAnalysersRef.current.get(remoteId);
    if (existing) {
      cancelAnimationFrame(existing.animId);
      existing.ctx.close().catch(() => {});
      remoteAnalysersRef.current.delete(remoteId);
    }
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;
    try {
      // latencyHint: 'interactive' — prioritise low latency to prevent jitter buffer buildup
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let animId = 0;
      const tick = () => {
        if (ctx.state === 'suspended') ctx.resume();
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const isSpeakingNow = avg > 15;
        if (remoteSpeakingStateRef.current.get(remoteId) !== isSpeakingNow) {
          remoteSpeakingStateRef.current.set(remoteId, isSpeakingNow);
          setRemoteSpeakingUsers(prev => {
            const next = new Set(prev);
            isSpeakingNow ? next.add(remoteId) : next.delete(remoteId);
            return next;
          });
        }
        animId = requestAnimationFrame(tick);
        remoteAnalysersRef.current.get(remoteId) && (remoteAnalysersRef.current.get(remoteId)!.animId = animId);
      };
      animId = requestAnimationFrame(tick);
      remoteAnalysersRef.current.set(remoteId, { ctx, analyser, animId });
    } catch { /* noop */ }
  }, []);
  // Keep stable ref in sync so getOrCreatePeer (defined earlier) can call it
  startRemoteSpeakingDetectionRef.current = startRemoteSpeakingDetection;

  const stopRemoteSpeakingDetection = useCallback((remoteId: string) => {
    const existing = remoteAnalysersRef.current.get(remoteId);
    if (existing) {
      cancelAnimationFrame(existing.animId);
      existing.ctx.close().catch(() => {});
      remoteAnalysersRef.current.delete(remoteId);
    }
    remoteSpeakingStateRef.current.delete(remoteId);
    setRemoteSpeakingUsers(prev => { const n = new Set(prev); n.delete(remoteId); return n; });
  }, []);
  stopRemoteSpeakingDetectionRef.current = stopRemoteSpeakingDetection;

  // ─────────────────────────────────────────────────────────────────────────────
  // Mic / Camera shared local stream
  // ─────────────────────────────────────────────────────────────────────────────
  const ensureLocalStream = useCallback(() => {
    if (!localStreamRef.current) localStreamRef.current = new MediaStream();
    return localStreamRef.current;
  }, []);

  const removeLocalTracks = useCallback((kind: 'audio' | 'video') => {
    if (!localStreamRef.current) return;
    const tracks = kind === 'audio'
      ? localStreamRef.current.getAudioTracks()
      : localStreamRef.current.getVideoTracks();

    tracks.forEach(track => {
      localStreamRef.current?.removeTrack(track);
    });

    if (localStreamRef.current.getTracks().length === 0) {
      localStreamRef.current = null;
    }
  }, []);

  const syncLocalVideoPreview = useCallback((force = false) => {
    const el = localVideoRef.current;
    if (!el) return;

    const localStream = localStreamRef.current;
    const hasLiveVideo = !!localStream?.getVideoTracks().some(track => track.readyState === 'live');
    const nextStream = hasLiveVideo ? localStream : null;

    if (force) {
      el.srcObject = null;
      el.srcObject = nextStream;
    } else if (el.srcObject !== nextStream) {
      el.srcObject = nextStream;
    }

    if (nextStream && el.paused) {
      el.play().catch(() => {});
    }
  }, []);

  useEffect(() => {
    syncLocalVideoPreview();
  }, [cameraEnabled, syncLocalVideoPreview]);

  const broadcastMediaState = useCallback((mic: boolean, cam: boolean) => {
    webrtcChannelRef.current?.send({
      type: 'broadcast', event: 'webrtc',
      payload: { fromId: userId, toId: '*', type: 'media_state', data: { micEnabled: mic, cameraEnabled: cam } },
    });
  }, [userId]);

  // Track which senders are for audio vs video — needed because sender.track is null after replaceTrack(null)
  const audioSenderMapRef = useRef<Map<RTCPeerConnection, RTCRtpSender>>(new Map());

  const toggleMic = useCallback(async () => {
    if (micEnabled) {
      // Mute: replaceTrack(null) on known audio senders
      peersRef.current.forEach(pc => {
        const knownSender = audioSenderMapRef.current.get(pc);
        if (knownSender) {
          knownSender.replaceTrack(null).catch(() => {});
        } else {
          // Fallback: find by track kind
          pc.getSenders().filter(s => s.track?.kind === 'audio').forEach(s => {
            s.replaceTrack(null).catch(() => {});
            audioSenderMapRef.current.set(pc, s);
          });
        }
      });

      localStreamRef.current?.getAudioTracks().forEach(t => t.stop());
      removeLocalTracks('audio');

      localMicStreamForAnalysis.current?.getTracks().forEach(t => t.stop());
      localMicStreamForAnalysis.current = null;
      stopSpeakingDetection();
      setMicEnabled(false);
      syncLocalVideoPreview();
      broadcastMediaState(false, cameraEnabled);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: selectedMic ? { deviceId: { exact: selectedMic } } : true,
        });

        const localStream = ensureLocalStream();
        const newAudioTrack = stream.getAudioTracks()[0];
        if (!newAudioTrack) return;

        // Remove old audio tracks from localStream
        localStream.getAudioTracks().forEach(t => { t.stop(); localStream.removeTrack(t); });
        localStream.addTrack(newAudioTrack);

        // Reuse known audio sender, or find null-track sender, or add new
        peersRef.current.forEach(pc => {
          const knownSender = audioSenderMapRef.current.get(pc);
          if (knownSender) {
            knownSender.replaceTrack(newAudioTrack).catch(() => {});
          } else {
            // Try to find a sender with null track that isn't the video sender
            const nullSender = pc.getSenders().find(s => s.track === null);
            if (nullSender) {
              nullSender.replaceTrack(newAudioTrack).catch(() => {});
              audioSenderMapRef.current.set(pc, nullSender);
            } else {
              const sender = pc.addTrack(newAudioTrack, localStream);
              audioSenderMapRef.current.set(pc, sender);
            }
          }
        });

        localMicStreamForAnalysis.current = stream;
        startSpeakingDetection(stream);
        setMicEnabled(true);
        if (isForceMuted) setIsForceMuted(false);
        if (deafened) setDeafened(false);
        syncLocalVideoPreview();
        broadcastMediaState(true, cameraEnabled);
        renegotiateAll();
      } catch {
        toast({ title: 'לא ניתן לגשת למיקרופון', variant: 'destructive' });
      }
    }
  }, [micEnabled, cameraEnabled, selectedMic, deafened, isForceMuted, toast, ensureLocalStream, removeLocalTracks, syncLocalVideoPreview, startSpeakingDetection, stopSpeakingDetection, renegotiateAll, broadcastMediaState]);

  const toggleDeafen = useCallback(() => {
    setDeafened(v => {
      const next = !v;
      if (next) {
        // Deafening: mute outgoing mic via WebRTC senders + stop local audio tracks
        if (micEnabled) {
          peersRef.current.forEach(pc => {
            const knownSender = audioSenderMapRef.current.get(pc);
            if (knownSender) {
              knownSender.replaceTrack(null).catch(() => {});
            } else {
              pc.getSenders().filter(s => s.track?.kind === 'audio').forEach(s => {
                s.replaceTrack(null).catch(() => {});
                audioSenderMapRef.current.set(pc, s);
              });
            }
          });
          localStreamRef.current?.getAudioTracks().forEach(t => { t.stop(); });
          removeLocalTracks('audio');
          localMicStreamForAnalysis.current?.getTracks().forEach(t => t.stop());
          localMicStreamForAnalysis.current = null;
          stopSpeakingDetection();
          setMicEnabled(false);
        }
        // Broadcast that mic is off
        broadcastMediaState(false, cameraEnabled);
        // Incoming audio is muted via volume=0 in the useEffect below
      } else {
        // Un-deafening: incoming audio resumes via volume useEffect
        // Mic stays off — user can re-enable manually
      }
      return next;
    });
  }, [micEnabled, cameraEnabled, broadcastMediaState, removeLocalTracks, stopSpeakingDetection]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Screen share
  // ─────────────────────────────────────────────────────────────────────────────
  const pendingScreenStreamRef = useRef<MediaStream | null>(null);

  const stopScreenShare = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    pendingScreenStreamRef.current = null;
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
      pendingScreenStreamRef.current = stream;
      stream.getVideoTracks()[0].onended = () => stopScreenShare();
      // Set state so React renders the video element as visible
      setScreenSharing(true);
      // Notify others
      screenFrameChannelRef.current?.send({
        type: 'broadcast', event: 'screen_share_start',
        payload: { sharerId: userId, sharerName: userName },
      });
      toast({ title: 'שיתוף מסך הופעל' });
    } catch { toast({ title: 'שיתוף מסך בוטל', variant: 'destructive' }); }
  }, [screenSharing, stopScreenShare, userId, userName, toast]);

  // Assign srcObject AFTER React has rendered the video element as visible
  useEffect(() => {
    if (screenSharing && pendingScreenStreamRef.current && screenVideoRef.current) {
      screenVideoRef.current.srcObject = pendingScreenStreamRef.current;
      screenVideoRef.current.play().catch(() => {});
      pendingScreenStreamRef.current = null;
    }
  }, [screenSharing]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Camera
  // ─────────────────────────────────────────────────────────────────────────────
  const toggleCamera = useCallback(async () => {
    if (cameraEnabled) {
      // Use replaceTrack(null) to keep senders stable
      peersRef.current.forEach(pc => {
        pc.getSenders().filter(s => s.track?.kind === 'video').forEach(s => {
          s.replaceTrack(null).catch(() => {});
        });
      });

      localStreamRef.current?.getVideoTracks().forEach(t => t.stop());
      removeLocalTracks('video');
      cameraStreamRef.current = null;
      setCameraEnabled(false);
      syncLocalVideoPreview();
      broadcastMediaState(micEnabled, false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: selectedCamera ? { deviceId: { exact: selectedCamera } } : true,
        });

        const localStream = ensureLocalStream();
        cameraStreamRef.current = stream;
        const newVideoTrack = stream.getVideoTracks()[0];
        if (!newVideoTrack) return;

        // Remove old video tracks from localStream
        localStream.getVideoTracks().forEach(t => { t.stop(); localStream.removeTrack(t); });
        localStream.addTrack(newVideoTrack);

        // Try to reuse existing video sender, otherwise add new
        peersRef.current.forEach(pc => {
          const videoSender = pc.getSenders().find(s => s.track?.kind === 'video' || (s.track === null && s !== pc.getSenders().find(ss => ss.track?.kind === 'audio')));
          if (videoSender) {
            videoSender.replaceTrack(newVideoTrack).catch(() => {});
          } else {
            pc.addTrack(newVideoTrack, localStream);
          }
        });

        setCameraEnabled(true);
        syncLocalVideoPreview();
        broadcastMediaState(micEnabled, true);
        renegotiateAll();
      } catch {
        toast({ title: 'לא ניתן לגשת למצלמה', variant: 'destructive' });
      }
    }
  }, [cameraEnabled, micEnabled, selectedCamera, toast, ensureLocalStream, removeLocalTracks, syncLocalVideoPreview, renegotiateAll, broadcastMediaState]);

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

  // ─────────────────────────────────────────────────────────────────────────────
  // Sound (output) test — plays short beeps every 2s so user can verify output
  // ─────────────────────────────────────────────────────────────────────────────
  const playBeep = useCallback((ctx: AudioContext) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.18);
  }, []);

  const startSoundTest = useCallback(() => {
    try {
      const ctx = new AudioContext();
      soundTestContextRef.current = ctx;
      playBeep(ctx);
      soundTestIntervalRef.current = setInterval(() => playBeep(ctx), 2000);
      setSoundTesting(true);
    } catch { toast({ title: 'לא ניתן להפעיל בדיקת שמע', variant: 'destructive' }); }
  }, [playBeep, toast]);

  const stopSoundTest = useCallback(() => {
    if (soundTestIntervalRef.current) { clearInterval(soundTestIntervalRef.current); soundTestIntervalRef.current = null; }
    soundTestContextRef.current?.close();
    soundTestContextRef.current = null;
    setSoundTesting(false);
  }, []);

  useEffect(() => { if (!showSettings && micTesting) stopMicTest(); }, [showSettings, micTesting, stopMicTest]);
  useEffect(() => { if (!showSettings && soundTesting) stopSoundTest(); }, [showSettings, soundTesting, stopSoundTest]);
  useEffect(() => () => { stopMicTest(); stopSpeakingDetection(); stopSoundTest(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync volume/deafen state to all remote audio elements whenever they change
  // Also resume any suspended AudioContexts — Chrome suspends them after inactivity
  useEffect(() => {
    document.querySelectorAll<HTMLAudioElement>('[data-remote-audio]').forEach(el => {
      el.volume = deafened ? 0 : volume / 100;
    });
    remoteAnalysersRef.current.forEach(({ ctx }) => {
      if (ctx.state === 'suspended') ctx.resume();
    });
  }, [deafened, volume]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Screen share request flow
  // ─────────────────────────────────────────────────────────────────────────────
  const requestScreenShare = useCallback(async () => {
    if (screenShareRequested) return;
    setScreenShareRequested(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('live_signals') as any).insert({
      session_id: sessionId, from_user_id: userId, to_user_id: mentorId,
      signal_type: 'request_screen_share', payload: { userName },
    });
    toast({ title: 'בקשת שיתוף מסך נשלחה למנטור' });
  }, [screenShareRequested, sessionId, userId, mentorId, userName, toast]);

  const approveScreenShare = useCallback(async (targetId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('live_signals') as any).insert({
      session_id: sessionId, from_user_id: userId, to_user_id: targetId,
      signal_type: 'screen_share_approved', payload: {},
    });
    setPendingScreenRequests(prev => prev.filter(r => r.userId !== targetId));
    toast({ title: 'אישרת בקשת שיתוף מסך' });
  }, [sessionId, userId, toast]);

  const denyScreenShare = useCallback(async (targetId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('live_signals') as any).insert({
      session_id: sessionId, from_user_id: userId, to_user_id: targetId,
      signal_type: 'screen_share_denied', payload: {},
    });
    setPendingScreenRequests(prev => prev.filter(r => r.userId !== targetId));
  }, [sessionId, userId]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Leave
  // ─────────────────────────────────────────────────────────────────────────────
  const handleLeave = useCallback(() => {
    // Broadcast leave signal so others remove us immediately
    webrtcChannelRef.current?.send({
      type: 'broadcast', event: 'webrtc',
      payload: { fromId: userId, toId: '*', type: 'leave', data: {} },
    });
    stopScreenShare(); stopSpeakingDetection(); stopMicTest();
    // Stop all remote speaking detections
    remoteAnalysersRef.current.forEach((_, remoteId) => {
      stopRemoteSpeakingDetectionRef.current(remoteId);
    });
    // Close all WebRTC peers
    peersRef.current.forEach(pc => pc.close());
    peersRef.current.clear();
    // Release camera and microphone
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    cameraStreamRef.current?.getTracks().forEach(t => t.stop());
    cameraStreamRef.current = null;
    localMicStreamForAnalysis.current?.getTracks().forEach(t => t.stop());
    localMicStreamForAnalysis.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
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
  }, [isMentor, userId, onClose, onSessionEnd, stopScreenShare, stopSpeakingDetection]);

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

  // ── Kick participant (mentor only) ──
  const kickParticipant = useCallback(async (targetId: string) => {
    webrtcChannelRef.current?.send({
      type: 'broadcast',
      event: 'webrtc',
      payload: { fromId: userId, toId: targetId, type: 'kicked', data: {} },
    });
    const pc = peersRef.current.get(targetId);
    if (pc) { pc.close(); peersRef.current.delete(targetId); }
    remoteStreamsRef.current.delete(targetId);
    setRemoteStreams(new Map(remoteStreamsRef.current));
    setParticipants(prev => prev.filter(p => p.userId !== targetId));
    toast({ title: 'המשתמש הוסר מהשיחה' });
  }, [userId, toast]);

  // ── Toggle room lock (mentor only) ──
  const toggleRoomLock = useCallback(() => {
    const newLocked = !roomLocked;
    setRoomLocked(newLocked);
    webrtcChannelRef.current?.send({
      type: 'broadcast',
      event: 'webrtc',
      payload: { fromId: userId, toId: '*', type: 'room_lock', data: { locked: newLocked } },
    });
    toast({ title: newLocked ? '🔒 החדר ננעל' : '🔓 החדר נפתח' });
  }, [roomLocked, userId, toast]);

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
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────────
  const otherParticipants = participants.filter(p => p.userId !== userId);

  const renderParticipantTile = (p: typeof participants[0], size: 'lg' | 'sm' = 'lg') => {
    const isMe = p.userId === userId;
    const remoteStream = remoteStreams.get(p.userId);
    const hasVideo = isMe ? cameraEnabled : (remoteStream && remoteStream.getVideoTracks().some(t => t.readyState === 'live'));
    const isSpeaking = isMe ? speakingUsers.has(userId) : remoteSpeakingUsers.has(p.userId);
    const isMuted = isMe ? !micEnabled : p.isMuted;
    const forceMuted = forceMutedUsers.has(p.userId);
    const isMentorEntry = p.userId === mentorId;

    return (
      <div
        key={p.userId}
        className={`relative rounded-xl overflow-hidden transition-all ${
          isSpeaking ? 'ring-2 ring-green-400 shadow-lg shadow-green-500/20' : 'ring-1 ring-white/10'
        } ${size === 'sm' ? 'w-36 h-24 shrink-0' : 'w-full h-full'}`}
        style={{ background: 'hsl(var(--card))' }}
      >
        {hasVideo ? (
          isMe ? (
            <video
              ref={el => {
                localVideoRef.current = el;
              }}
              autoPlay playsInline muted className="w-full h-full object-cover"
            />
          ) : (
            <video
              autoPlay playsInline
              ref={el => {
                if (!el) return;
                if (el.srcObject !== remoteStream) {
                  el.srcObject = remoteStream ?? null;
                }
              }}
              className="w-full h-full object-cover"
            />
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div
              className={`${size === 'sm' ? 'w-12 h-12 text-lg' : 'w-20 h-20 text-3xl'} rounded-full flex items-center justify-center font-bold text-white`}
              style={{ background: `linear-gradient(135deg, ${getColorForUser(p.userId)}bb, ${getColorForUser(p.userId)})` }}
            >
              {initials(p.name)}
            </div>
          </div>
        )}

        {/* Bottom info bar */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 py-1.5 flex items-center gap-1.5">
          {isMuted ? (
            <div className="w-5 h-5 rounded-full bg-red-500/80 flex items-center justify-center">
              <MicOff className="w-2.5 h-2.5 text-white" />
            </div>
          ) : isSpeaking ? (
            <div className="w-5 h-5 rounded-full bg-green-500/80 flex items-center justify-center">
              <Mic className="w-2.5 h-2.5 text-white" />
            </div>
          ) : null}
          {forceMuted && (
            <div className="w-5 h-5 rounded-full bg-orange-500/80 flex items-center justify-center" title="מושתק ע״י מנטור">
              <MicOff className="w-2.5 h-2.5 text-white" />
            </div>
          )}
          <span className={`text-[11px] font-medium text-foreground truncate ${size === 'sm' ? 'max-w-[60px]' : ''}`}>
            {p.name}
            {isMe && <span className="text-muted-foreground/70 ms-0.5">(אתה)</span>}
          </span>
          {isMentorEntry && !isMe && (
            <span className="text-[9px] bg-primary/30 text-primary-foreground/90 px-1.5 py-0.5 rounded font-bold ms-auto">מנטור</span>
          )}
          {/* Mentor controls on hover */}
          {isMentor && !isMe && (
            <div className="ms-auto flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => toggleForceMute(p.userId, forceMuted)} title={forceMuted ? 'הסר השתקה' : 'השתק'}
                className="w-6 h-6 flex items-center justify-center rounded-md bg-black/50 hover:bg-red-500/50 text-foreground/70 hover:text-foreground transition-all">
                {forceMuted ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
              </button>
              <button onClick={() => kickParticipant(p.userId)} title="הסר"
                className="w-6 h-6 flex items-center justify-center rounded-md bg-black/50 hover:bg-red-500/50 text-foreground/70 hover:text-foreground transition-all">
                <UserX className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" dir="rtl">

      {/* ── Hidden remote audio elements ── */}
      {Array.from(remoteStreams.entries()).map(([remoteId, stream]) => (
        <audio
          key={remoteId}
          autoPlay
          playsInline
          data-remote-audio={remoteId}
          ref={el => {
            if (el) {
              el.srcObject = stream;
              el.volume = deafened ? 0 : volume / 100;
            }
          }}
          style={{ display: 'none' }}
        />
      ))}

      {/* ══════════════════════════════════════════════════════════════════════
          TOP HEADER — Zoom-style minimal
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="shrink-0 h-12 bg-[#1a1a1a] border-b border-border flex items-center justify-between px-4">
        {/* Left: Session info */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[11px] font-bold text-red-400 tracking-wider">LIVE</span>
          </div>
          <span className="w-px h-5 bg-muted" />
          <span className="text-sm font-semibold text-foreground truncate max-w-[200px]">{sessionTitle}</span>
          {connectionStatus === 'connected' && (
            <span className="text-[10px] text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full font-medium">מחובר</span>
          )}
        </div>

        {/* Right: Quick actions */}
        <div className="flex items-center gap-1">
          {isMentor && (
            <>
              <button onClick={toggleRoomLock} title={roomLocked ? 'פתח חדר' : 'נעל חדר'}
                className={`h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${roomLocked ? 'bg-amber-500/20 text-amber-400' : 'text-amber-400/70 hover:bg-amber-500/10 hover:text-amber-400'}`}>
                {roomLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                {roomLocked ? 'נעול' : ''}
              </button>
              <button onClick={() => { const link = `${window.location.origin}/livestream?session=${sessionId}`; navigator.clipboard.writeText(link); toast({ title: '🔗 הלינק הועתק!' }); }}
                title="העתק לינק"
                className="h-8 px-3 rounded-lg text-xs text-emerald-400/70 hover:bg-emerald-500/10 hover:text-emerald-400 transition-all flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {/* View mode toggle */}
          {!isScreenVisible && participants.length > 1 && (
            <button onClick={() => setViewMode(v => v === 'gallery' ? 'speaker' : 'gallery')}
              title={viewMode === 'gallery' ? 'Speaker View' : 'Gallery View'}
              className="h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all text-violet-400/70 hover:bg-violet-500/10 hover:text-violet-400">
              {viewMode === 'gallery' ? <Maximize2 className="w-3.5 h-3.5" /> : <LayoutGrid className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{viewMode === 'gallery' ? 'Speaker' : 'Gallery'}</span>
            </button>
          )}
          <button onClick={() => setShowMembers(v => !v)}
            className={`h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${showMembers ? 'bg-sky-500/20 text-sky-400' : 'text-sky-400/70 hover:bg-sky-500/10 hover:text-sky-400'}`}>
            <Users className="w-3.5 h-3.5" />{participants.length}
          </button>
          <button onClick={() => setShowChat(v => !v)}
            className={`relative h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${showChat ? 'bg-cyan-500/20 text-cyan-400' : 'text-cyan-400/70 hover:bg-cyan-500/10 hover:text-cyan-400'}`}>
            <MessageSquare className="w-3.5 h-3.5" />
            {chatMessages.length > 0 && !showChat && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold">
                {chatMessages.length > 9 ? '9+' : chatMessages.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SCREEN SHARE REQUEST BANNER (mentor sees)
          ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {isMentor && pendingScreenRequests.map(req => (
          <motion.div
            key={req.userId}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="shrink-0 bg-amber-500/10 border-b border-amber-500/30 px-5 py-2.5 flex items-center gap-3"
          >
            <Monitor className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-sm text-foreground/80 flex-1">
              <span className="font-semibold text-amber-300">{req.userName}</span> מבקש לשתף מסך
            </span>
            <button onClick={() => approveScreenShare(req.userId)}
              className="h-7 px-3 rounded-lg bg-green-500/20 text-green-400 text-xs font-semibold hover:bg-green-500/30 border border-green-500/40 transition-all">
              אשר
            </button>
            <button onClick={() => denyScreenShare(req.userId)}
              className="h-7 px-3 rounded-lg bg-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/30 border border-red-500/40 transition-all">
              דחה
            </button>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════
          MAIN BODY — flex row (content + optional side panels)
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* ── Main content area ── */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Video area */}
          <div className="flex-1 relative flex min-h-0 overflow-hidden p-3 gap-3">

            {isScreenVisible ? (
              /* ═══ SCREEN SHARE MODE ═══ 
                 Main = screen share, side filmstrip = participants */
              <>
                {/* Screen share takes up most space */}
                <div className="flex-1 relative rounded-xl overflow-hidden bg-black min-w-0">
                  {/* Local sharer sees their own video */}
                  <video
                    ref={screenVideoRef}
                    autoPlay playsInline muted
                    className="w-full h-full object-contain bg-black"
                    style={{
                      position: screenSharing ? 'relative' : 'absolute',
                      visibility: screenSharing ? 'visible' : 'hidden',
                      pointerEvents: screenSharing ? 'auto' : 'none',
                      inset: 0,
                    }}
                  />

                  {/* Remote screen canvas */}
                  <canvas
                    ref={remoteScreenCanvasRef}
                    className="w-full h-full object-contain bg-black"
                    style={{
                      position: screenSharing ? 'absolute' : 'relative',
                      visibility: screenSharing ? 'hidden' : 'visible',
                      pointerEvents: screenSharing ? 'none' : 'auto',
                      inset: 0,
                    }}
                  />

                  {/* Screen share label */}
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-card/80 backdrop-blur px-3 py-1.5 rounded-full border border-border">
                    <Monitor className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-xs text-foreground/80 font-medium">
                      {screenSharing ? 'אתה משתף את המסך' : `${remoteScreenSharer} משתף את המסך`}
                    </span>
                  </div>

                  {/* Drawing canvas overlay */}
                  <canvas
                    ref={canvasRef}
                    className={`absolute ${showDrawToolbar ? (activeTool === 'text' ? 'cursor-text' : 'cursor-crosshair') : 'pointer-events-none'}`}
                    style={{ touchAction: 'none', zIndex: 20 }}
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
                      style={{
                        left: `${contentRect.x + cursor.x * contentRect.w}px`,
                        top: `${contentRect.y + cursor.y * contentRect.h}px`,
                        transform: 'translate(4px, 4px)',
                      }}
                    >
                      <div className="w-3 h-3 rounded-full border-2 border-white shadow-lg" style={{ backgroundColor: cursor.color }} />
                      <div className="mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold text-white shadow-lg whitespace-nowrap"
                        style={{ backgroundColor: cursor.color + 'cc' }}>
                        {cursor.userName}
                      </div>
                    </div>
                  ))}

                  {/* Text input overlay */}
                  {showTextInput && textPos && (
                    <div className="absolute z-30" style={{ left: contentRect.x + textPos.x, top: contentRect.y + textPos.y - fontSize }}>
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

                  {/* Drawing toolbar toggle */}
                  <button
                    onClick={() => setShowDrawToolbar(v => !v)}
                    title="כלי ציור"
                    className={`absolute bottom-4 left-4 z-20 w-10 h-10 rounded-full flex items-center justify-center shadow-xl transition-all border ${
                      showDrawToolbar
                        ? 'bg-indigo-500 border-indigo-400 text-white shadow-indigo-500/40'
                        : 'bg-card/80 border-border text-foreground/60 hover:text-foreground hover:bg-black/80'
                    }`}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>

                  {/* Drawing toolbar */}
                  <AnimatePresence>
                    {showDrawToolbar && (
                      <motion.div
                        initial={{ opacity: 0, y: 12, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 12, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-16 left-4 z-20 flex flex-col gap-1 bg-card/95 backdrop-blur-xl border border-border rounded-2xl p-3 shadow-2xl w-52"
                      >
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
                                activeTool === t.id ? 'bg-indigo-500 text-white' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                              }`}
                            >
                              {t.icon}
                            </button>
                          ))}
                        </div>
                        <p className="text-[10px] text-muted-foreground/50 text-center mb-1">
                          {{ pen: 'עיפרון', text: 'טקסט', laser: 'לייזר (נמחק תוך 5 שנ׳)', eraser: 'מחק' }[activeTool]}
                        </p>
                        {activeTool !== 'eraser' && (
                          <div className="flex gap-1 flex-wrap justify-center mb-1">
                            {['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#a855f7','#ffffff','#000000'].map(c => (
                              <button key={c} onClick={() => setDrawColor(c)}
                                className={`w-5 h-5 rounded-full border-2 transition-all ${drawColor === c ? 'border-white scale-125' : 'border-transparent'}`}
                                style={{ backgroundColor: c }} />
                            ))}
                          </div>
                        )}
                        {activeTool === 'pen' && (
                          <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-2 py-1.5">
                            <button onClick={() => setPenSize(s => Math.max(1, s - 1))} className="text-muted-foreground hover:text-foreground"><Minus className="w-3 h-3" /></button>
                            <div className="flex-1 text-center text-[11px] text-foreground/70 font-bold">{penSize}px</div>
                            <button onClick={() => setPenSize(s => Math.min(30, s + 1))} className="text-muted-foreground hover:text-foreground"><Plus className="w-3 h-3" /></button>
                          </div>
                        )}
                        {activeTool === 'eraser' && (
                          <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-2 py-1.5">
                            <button onClick={() => setEraserSize(s => Math.max(8, s - 4))} className="text-muted-foreground hover:text-foreground"><Minus className="w-3 h-3" /></button>
                            <div className="flex-1 text-center text-[11px] text-foreground/70 font-bold">{eraserSize}px</div>
                            <button onClick={() => setEraserSize(s => Math.min(80, s + 4))} className="text-muted-foreground hover:text-foreground"><Plus className="w-3 h-3" /></button>
                          </div>
                        )}
                        {activeTool === 'text' && (
                          <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-2 py-1.5">
                            <button onClick={() => setFontSize(s => Math.max(10, s - 2))} className="text-muted-foreground hover:text-foreground"><Minus className="w-3 h-3" /></button>
                            <div className="flex-1 text-center text-[11px] text-foreground/70 font-bold">{fontSize}px</div>
                            <button onClick={() => setFontSize(s => Math.min(72, s + 2))} className="text-muted-foreground hover:text-foreground"><Plus className="w-3 h-3" /></button>
                          </div>
                        )}
                        <div className="border-t border-border my-1" />
                        <div className="flex gap-1">
                          <button onClick={handleUndo} title="בטל ציור אחרון"
                            className="flex-1 h-7 flex items-center justify-center gap-1 rounded-lg text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
                            <RotateCcw className="w-3 h-3" /> בטל
                          </button>
                          <button onClick={handleClearAll} title="נקה הכל"
                            className="flex-1 h-7 flex items-center justify-center gap-1 rounded-lg text-[10px] text-red-400/70 hover:text-red-400 hover:bg-red-400/10 transition-all">
                            <X className="w-3 h-3" /> נקה
                          </button>
                        </div>
                        <div className="flex items-center justify-center gap-1.5 mt-1">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: myColor }} />
                          <span className="text-[9px] text-muted-foreground/40">הצבע שלך בציורים</span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Participant filmstrip (side) — Zoom style */}
                {participants.length > 0 && (
                  <div className="w-44 shrink-0 flex flex-col gap-2 overflow-y-auto">
                    {participants.map(p => (
                      <div key={p.userId} className="group">
                        {renderParticipantTile(p, 'sm')}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : viewMode === 'speaker' && participants.length > 1 ? (
              /* ═══ SPEAKER VIEW ═══ — Active speaker large, others in strip on top */
              (() => {
                // Determine the active speaker: prioritize someone currently speaking, fallback to mentor, then first participant
                const allSpeaking = participants.filter(p => 
                  (p.userId === userId ? speakingUsers.has(userId) : remoteSpeakingUsers.has(p.userId))
                );
                const activeSpeaker = allSpeaking.length > 0
                  ? allSpeaking[0]
                  : participants.find(p => p.userId === mentorId) || participants[0];
                const others = participants.filter(p => p.userId !== activeSpeaker.userId);

                return (
                  <div className="w-full h-full flex flex-col gap-2">
                    {/* Top filmstrip — other participants */}
                    {others.length > 0 && (
                      <div className="shrink-0 flex gap-2 overflow-x-auto py-1 px-1">
                        {others.map(p => (
                          <div key={p.userId} className="group">
                            {renderParticipantTile(p, 'sm')}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Main — active speaker */}
                    <div className="flex-1 min-h-0 group">
                      {renderParticipantTile(activeSpeaker, 'lg')}
                    </div>
                  </div>
                );
              })()
            ) : (
              /* ═══ GALLERY VIEW ═══ — 5×2 paginated grid */
              (() => {
                const ITEMS_PER_PAGE = 10;
                const totalPages = Math.max(1, Math.ceil(participants.length / ITEMS_PER_PAGE));
                const clampedPage = Math.min(galleryPage, totalPages - 1);
                const pageParticipants = participants.slice(clampedPage * ITEMS_PER_PAGE, (clampedPage + 1) * ITEMS_PER_PAGE);
                // Adaptive grid: fill the space based on participant count
                const n = pageParticipants.length;
                const cols = n === 1 ? 1 : n === 2 ? 2 : n <= 4 ? 2 : n <= 6 ? 3 : n <= 8 ? 4 : 5;
                const rows = Math.ceil(n / cols);

                return (
                  <div className="w-full h-full flex flex-col">
                    {/* Swipeable grid area */}
                    <div
                      className="flex-1 min-h-0 overflow-hidden relative"
                      onTouchStart={e => { galleryTouchStartRef.current = e.touches[0].clientX; }}
                      onTouchEnd={e => {
                        const dx = galleryTouchStartRef.current - e.changedTouches[0].clientX;
                        if (Math.abs(dx) > 60) {
                          setGalleryPage(p => dx > 0 ? Math.min(p + 1, totalPages - 1) : Math.max(p - 1, 0));
                        }
                      }}
                    >
                      <div className="w-full h-full grid gap-2 p-2"
                        style={{
                          gridTemplateColumns: `repeat(${cols}, 1fr)`,
                          gridTemplateRows: `repeat(${rows}, 1fr)`,
                        }}
                      >
                        {pageParticipants.map(p => (
                          <div key={p.userId} className="group min-h-0 min-w-0">
                            {renderParticipantTile(p, 'lg')}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Page dots */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-center gap-1.5 py-2 shrink-0">
                        {Array.from({ length: totalPages }, (_, i) => (
                          <button
                            key={i}
                            onClick={() => setGalleryPage(i)}
                            className={`rounded-full transition-all ${
                              i === clampedPage
                                ? 'w-2.5 h-2.5 bg-white'
                                : 'w-2 h-2 bg-white/30 hover:bg-white/50'
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              BOTTOM CONTROLS BAR — Zoom-style centered
              ══════════════════════════════════════════════════════════════════ */}
          <div className="shrink-0 bg-card/95 backdrop-blur-xl border-t border-border py-3 px-6">
            <div className="flex items-center justify-center gap-2">
              {/* Mic */}
              <div className="relative">
                <button onClick={toggleMic} disabled={deafened}
                  title={isForceMuted ? 'הושתקת ע"י המנטור' : micEnabled ? 'השתק מיקרופון' : 'הפעל מיקרופון'}
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-md disabled:opacity-40 ${
                    micEnabled ? 'bg-secondary hover:bg-secondary/80 text-white' : 'bg-red-500 hover:bg-red-600 text-white'
                  } ${isForceMuted ? 'ring-2 ring-orange-400 ring-offset-2 ring-offset-card' : ''}`}>
                  {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </button>
                {isForceMuted && (
                  <div className="absolute -top-1 -right-1 bg-orange-500 rounded-full w-4 h-4 flex items-center justify-center">
                    <span className="text-white text-[8px] font-bold">M</span>
                  </div>
                )}
              </div>

              {/* Deafen */}
              <button onClick={toggleDeafen} title={deafened ? 'בטל השתקה' : 'השתק שמע'}
                className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-md ${
                  deafened ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-secondary hover:bg-secondary/80 text-white'
                }`}>
                {deafened ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>

              {/* Camera */}
              <button onClick={toggleCamera} title={cameraEnabled ? 'כבה מצלמה' : 'הפעל מצלמה'}
                className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-md ${
                  cameraEnabled ? 'bg-secondary hover:bg-secondary/80 text-white' : 'bg-red-500 hover:bg-red-600 text-white'
                }`}>
                {cameraEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              </button>

              {/* Screen share */}
              {isMentor ? (
                <button onClick={toggleScreenShare} title={screenSharing ? 'הפסק שיתוף' : 'שתף מסך'}
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-md ${
                    screenSharing ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-secondary hover:bg-secondary/80 text-foreground/60 hover:text-foreground'
                  }`}>
                  {screenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                </button>
              ) : studentScreenShareApproved ? (
                <button onClick={screenSharing ? stopScreenShare : toggleScreenShare}
                  title={screenSharing ? 'הפסק שיתוף' : 'שתף מסך (אושר)'}
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-md ${
                    screenSharing ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/40'
                  }`}>
                  {screenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                </button>
              ) : (
                <button
                  onClick={screenShareRequested ? undefined : requestScreenShare}
                  title={screenShareRequested ? 'ממתין לאישור...' : 'בקש לשתף מסך'}
                  className={`relative w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-md ${
                    screenShareRequested
                      ? 'bg-amber-500/80 text-white cursor-not-allowed'
                      : 'bg-secondary hover:bg-secondary/80 text-foreground/60 hover:text-foreground'
                  }`}>
                  <Monitor className="w-5 h-5" />
                  {screenShareRequested && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-card animate-pulse" />
                  )}
                </button>
              )}

              <div className="w-px h-8 bg-muted mx-1" />

              {/* Settings */}
              <button onClick={() => { setShowSettings(true); setSettingsTab('mic'); }} title="הגדרות"
                className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-md bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground">
                <Settings className="w-5 h-5" />
              </button>

              <div className="w-px h-8 bg-muted mx-1" />

              {/* Leave / End */}
              <button onClick={handleLeave} title={isMentor ? 'סיים שידור' : 'עזוב'}
                className="h-12 px-5 rounded-2xl bg-red-500 hover:bg-red-600 text-white flex items-center gap-2 transition-all shadow-lg shadow-red-500/20 font-medium text-sm">
                <PhoneOff className="w-5 h-5" />
                {isMentor ? 'סיים שידור' : 'צא'}
              </button>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            SIDE PANELS — Members & Chat (Zoom-style slide-in)
            ══════════════════════════════════════════════════════════════════ */}

        {/* Members panel */}
        <AnimatePresence>
          {showMembers && (
            <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 260, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }} className="bg-card/95 backdrop-blur-xl border-s border-border flex flex-col shrink-0 overflow-hidden" style={{ minWidth: 0 }}>
              <div className="px-4 h-12 border-b border-border flex items-center justify-between shrink-0">
                <p className="text-sm font-semibold text-foreground/80">משתתפים ({participants.length})</p>
                <button onClick={() => setShowMembers(false)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/50 hover:text-foreground/60 hover:bg-muted/50 transition-all">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
                {participants.map(p => {
                  const isMe = p.userId === userId;
                  const isMentorEntry = p.userId === mentorId;
                  const forceMuted = forceMutedUsers.has(p.userId);
                  const isSpeaking = isMe ? speakingUsers.has(userId) : remoteSpeakingUsers.has(p.userId);
                  const userColor = getColorForUser(p.userId);
                  return (
                    <div key={p.userId} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/50 transition-colors group">
                      <div className="relative shrink-0">
                        {isSpeaking && <span className="absolute -inset-0.5 rounded-full border-2 border-green-500 animate-ping opacity-40" />}
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white ${isSpeaking ? 'ring-2 ring-green-500 ring-offset-1 ring-offset-card' : ''}`}
                          style={{ background: `linear-gradient(135deg, ${userColor}bb, ${userColor})` }}
                        >
                          {initials(p.name)}
                        </div>
                        <div className={`absolute -bottom-0.5 -start-0.5 w-3 h-3 rounded-full border-2 border-card ${p.isMuted ? 'bg-secondary' : 'bg-green-500'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground/80 truncate">
                          {p.name}
                          {isMe && <span className="text-[10px] text-muted-foreground/50 ms-1">(אתה)</span>}
                          {isMentorEntry && !isMe && <span className="text-[10px] text-primary ms-1">מנטור</span>}
                        </p>
                        <p className="text-[10px] text-muted-foreground/50">
                          {p.isDeafened ? 'מושתק לחלוטין' : forceMuted ? 'מושתק ע"י מנטור' : p.isMuted ? 'מיקרופון כבוי' : isSpeaking ? 'מדבר...' : 'מחובר'}
                        </p>
                      </div>
                      {isMentor && !isMe && (
                        <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => toggleForceMute(p.userId, forceMuted)} title={forceMuted ? 'הסר השתקה' : 'השתק'}
                            className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all ${forceMuted ? 'bg-orange-500/20 text-orange-400' : 'bg-muted/50 text-muted-foreground/70 hover:bg-red-500/20 hover:text-red-400'}`}>
                            {forceMuted ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => kickParticipant(p.userId)} title="הסר"
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-muted/50 text-muted-foreground/70 hover:bg-red-500/20 hover:text-red-400 transition-all">
                            <UserX className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat panel */}
        <AnimatePresence>
          {showChat && (
            <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 320, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }} className="bg-card/95 backdrop-blur-xl border-s border-border flex flex-col shrink-0 overflow-hidden" style={{ minWidth: 0 }}>
              <div className="px-4 h-12 border-b border-border flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-muted-foreground/70" />
                  <span className="text-sm font-semibold text-foreground/80">צ'אט</span>
                </div>
                <button onClick={() => setShowChat(false)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/50 hover:text-foreground/60 hover:bg-muted/50 transition-all">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
                {chatMessages.length === 0 && (
                  <div className="text-center py-10 text-muted-foreground/30">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">עוד לא נשלחו הודעות</p>
                  </div>
                )}
                {chatMessages.map(msg => (
                  <div key={msg.id} className={`flex flex-col gap-0.5 ${msg.user_id === userId ? 'items-end' : 'items-start'}`}>
                    <span className="text-[10px] text-muted-foreground/50 px-1">{msg.user_id === userId ? 'אתה' : msg.display_name}</span>
                    <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${msg.user_id === userId ? 'bg-primary text-primary-foreground rounded-ee-sm' : 'bg-secondary text-foreground/80 rounded-es-sm'}`}>
                      {msg.message}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="p-3 border-t border-border shrink-0">
                <div className="flex gap-2 items-center bg-secondary rounded-xl px-3 py-2">
                  <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                    placeholder="הודעה לכולם..." maxLength={300}
                    className="flex-1 bg-transparent text-xs text-foreground/80 placeholder:text-muted-foreground/40 focus:outline-none text-right min-w-0" />
                  <button onClick={sendMessage} disabled={!chatInput.trim() || isSendingMsg}
                    className="w-7 h-7 flex items-center justify-center bg-primary hover:bg-primary/80 text-primary-foreground rounded-lg transition-all disabled:opacity-30 shrink-0">
                    <Send className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SETTINGS MODAL
          ══════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showSettings && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-card/80 backdrop-blur-sm" onClick={() => setShowSettings(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.93, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.93, y: 12 }} transition={{ duration: 0.18 }}
              className="fixed inset-0 z-[61] flex items-center justify-center pointer-events-none">
              <div className="pointer-events-auto w-[520px] bg-card/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-border overflow-hidden" dir="rtl">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                  <h2 className="text-base font-bold text-white">הגדרות</h2>
                  <button onClick={() => setShowSettings(false)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground/70 hover:text-foreground/80 hover:bg-muted/30 transition-all">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex min-h-0">
                  <div className="w-44 bg-muted p-3 flex flex-col gap-1 shrink-0">
                    {([
                      { id: 'mic', icon: <Mic className="w-4 h-4 shrink-0" />, label: 'מיקרופון' },
                      { id: 'audio', icon: <Headphones className="w-4 h-4 shrink-0" />, label: 'שמע' },
                      { id: 'camera', icon: <Video className="w-4 h-4 shrink-0" />, label: 'מצלמה' },
                    ] as const).map(t => (
                      <button key={t.id} onClick={() => setSettingsTab(t.id)}
                        className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-right ${settingsTab === t.id ? 'bg-muted text-white' : 'text-muted-foreground hover:text-foreground/80 hover:bg-muted/50'}`}>
                        {t.icon}{t.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex-1 p-6 space-y-5">
                    {settingsTab === 'mic' && (
                      <>
                        <div>
                          <p className="text-xs font-bold text-muted-foreground/70 uppercase tracking-widest mb-3">בחירת מיקרופון</p>
                          <div className="space-y-2">
                            {audioDevices.length === 0 && <p className="text-xs text-muted-foreground/50 italic">לא נמצאו מיקרופונים</p>}
                            {audioDevices.map(d => (
                              <button key={d.deviceId} onClick={() => setSelectedMic(d.deviceId)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all text-right border ${selectedMic === d.deviceId ? 'border-primary/60 bg-primary/10 text-white' : 'border-border bg-muted/30 text-foreground/60 hover:bg-muted/60 hover:text-foreground/80'}`}>
                                <Mic className={`w-4 h-4 shrink-0 ${selectedMic === d.deviceId ? 'text-primary' : 'text-muted-foreground/50'}`} />
                                <span className="truncate">{d.label || `מיקרופון ${d.deviceId.slice(0, 8)}`}</span>
                                {selectedMic === d.deviceId && <span className="ms-auto text-[10px] font-bold text-primary bg-primary/20 px-2 py-0.5 rounded-full shrink-0">פעיל</span>}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="border-t border-border pt-5">
                          <p className="text-xs font-bold text-muted-foreground/70 uppercase tracking-widest mb-3">בדיקת מיקרופון</p>
                          <div className="bg-muted rounded-xl p-4 space-y-3">
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {micTesting ? 'בדיקה פעילה — אתה שומע את עצמך.' : 'לחץ לבדוק את המיקרופון.'}
                            </p>
                            {micTesting && (
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-muted-foreground/50">עוצמת קלט</span>
                                  <span className="text-[10px] text-green-400 font-bold">{Math.round(micTestLevel)}%</span>
                                </div>
                                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                                  <motion.div className="h-full rounded-full"
                                    style={{ width: `${micTestLevel}%`, background: micTestLevel > 70 ? 'linear-gradient(90deg,#22c55e,#ef4444)' : micTestLevel > 35 ? 'linear-gradient(90deg,#22c55e,#eab308)' : '#22c55e' }}
                                    animate={{ width: `${micTestLevel}%` }} transition={{ duration: 0.05 }} />
                                </div>
                              </div>
                            )}
                            <button onClick={micTesting ? stopMicTest : startMicTest}
                              className={`flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold transition-all ${micTesting ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30' : 'bg-primary hover:bg-primary/80 text-primary-foreground'}`}>
                              {micTesting ? <><StopCircle className="w-4 h-4" />הפסק בדיקה</> : <><FlaskConical className="w-4 h-4" />בדוק מיקרופון</>}
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                    {settingsTab === 'audio' && (
                      <>
                        <div>
                          <p className="text-xs font-bold text-muted-foreground/70 uppercase tracking-widest mb-3">שמע יוצא</p>
                          <div className="space-y-2">
                            {outputDevices.length === 0 && <p className="text-xs text-muted-foreground/50 italic">הדפדפן לא תומך בבחירת שמע יוצא</p>}
                            {outputDevices.map(d => (
                              <button key={d.deviceId} onClick={() => setSelectedOutput(d.deviceId)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all text-right border ${selectedOutput === d.deviceId ? 'border-primary/60 bg-primary/10 text-white' : 'border-border bg-muted/30 text-foreground/60 hover:bg-muted/60 hover:text-foreground/80'}`}>
                                <Headphones className={`w-4 h-4 shrink-0 ${selectedOutput === d.deviceId ? 'text-primary' : 'text-muted-foreground/50'}`} />
                                <span className="truncate">{d.label || `התקן ${d.deviceId.slice(0, 8)}`}</span>
                                {selectedOutput === d.deviceId && <span className="ms-auto text-[10px] font-bold text-primary bg-primary/20 px-2 py-0.5 rounded-full shrink-0">פעיל</span>}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-muted-foreground/70 uppercase tracking-widest mb-3">עוצמת שמע</p>
                          <div className="flex items-center gap-4 bg-muted rounded-xl px-4 py-3">
                            <VolumeX className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                            <input type="range" min={0} max={100} value={volume} onChange={e => setVolume(Number(e.target.value))} className="flex-1 accent-primary h-1.5" />
                            <Volume2 className="w-4 h-4 text-foreground/60 shrink-0" />
                            <span className="text-sm font-bold text-foreground/70 w-10 text-center shrink-0">{volume}%</span>
                          </div>
                        </div>
                        <div className="border-t border-border pt-5">
                          <p className="text-xs font-bold text-muted-foreground/70 uppercase tracking-widest mb-3">בדיקת שמע</p>
                          <div className="bg-muted rounded-xl p-4 space-y-3">
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {soundTesting ? 'בדיקה פעילה — צפצופים כל 2 שניות.' : 'לחץ לבדוק את השמע.'}
                            </p>
                            {soundTesting && (
                              <div className="flex items-center gap-2">
                                <div className="flex gap-0.5 items-end h-5">
                                  {[3,5,7,5,3].map((h, i) => (
                                    <motion.div key={i} className="w-1.5 rounded-full bg-primary"
                                      animate={{ height: [`${h * 3}px`, `${h * 5}px`, `${h * 3}px`] }}
                                      transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1 }} />
                                  ))}
                                </div>
                                <span className="text-[11px] text-primary font-medium">מנגן...</span>
                              </div>
                            )}
                            <button onClick={soundTesting ? stopSoundTest : startSoundTest}
                              className={`flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold transition-all ${soundTesting ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30' : 'bg-primary hover:bg-primary/80 text-primary-foreground'}`}>
                              {soundTesting ? <><StopCircle className="w-4 h-4" />הפסק בדיקה</> : <><Volume2 className="w-4 h-4" />בדוק שמע</>}
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                    {settingsTab === 'camera' && (
                      <div>
                        <p className="text-xs font-bold text-muted-foreground/70 uppercase tracking-widest mb-3">בחירת מצלמה</p>
                        <div className="space-y-2">
                          {videoDevices.length === 0 && <p className="text-xs text-muted-foreground/50 italic">לא נמצאו מצלמות</p>}
                          {videoDevices.map(d => (
                            <button key={d.deviceId} onClick={() => setSelectedCamera(d.deviceId)}
                              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all text-right border ${selectedCamera === d.deviceId ? 'border-primary/60 bg-primary/10 text-white' : 'border-border bg-muted/30 text-foreground/60 hover:bg-muted/60 hover:text-foreground/80'}`}>
                              <Video className={`w-4 h-4 shrink-0 ${selectedCamera === d.deviceId ? 'text-primary' : 'text-muted-foreground/50'}`} />
                              <span className="truncate">{d.label || `מצלמה ${d.deviceId.slice(0, 8)}`}</span>
                              {selectedCamera === d.deviceId && <span className="ms-auto text-[10px] font-bold text-primary bg-primary/20 px-2 py-0.5 rounded-full shrink-0">פעיל</span>}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="px-6 py-3 border-t border-border flex justify-start">
                  <button onClick={() => setShowSettings(false)}
                    className="h-9 px-5 rounded-lg bg-primary hover:bg-primary/80 text-primary-foreground text-sm font-semibold transition-all">סגור</button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
