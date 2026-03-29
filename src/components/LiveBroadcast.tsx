/**
 * LiveBroadcast — Mentor-side live streaming component.
 * Features: screen share, microphone selection, viewer management,
 *           live chat panel, notify students on go-live,
 *           MediaRecorder to capture the stream,
 *           auto-upload recording + update community post with video on end,
 *           save recording as lesson after ending.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Monitor, Wifi, MicOff, Mic, X, Users, Radio,
  MonitorPlay, Maximize2, ChevronDown, MessageSquare, Send,
  BookOpen, Check, Upload,
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

interface Category {
  id: string;
  title: string;
}

interface Props {
  mentorId: string;
  mentorName: string;
  onClose: () => void;
  onPostCreated?: (postId: string) => void;
}

type ShareMode = 'screen' | 'window' | null;

export default function LiveBroadcast({ mentorId, mentorName, onClose, onPostCreated }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState<'setup' | 'live' | 'ended'>('setup');
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
  const [showChat, setShowChat] = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSendingMsg, setIsSendingMsg] = useState(false);

  // Recording state
  const [isUploadingRecording, setIsUploadingRecording] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Save as lesson dialog
  const [categories, setCategories] = useState<Category[]>([]);
  const [saveLessonForm, setSaveLessonForm] = useState({
    title: '',
    categoryId: '',
    description: '',
  });
  const [isSavingLesson, setIsSavingLesson] = useState(false);
  const [lessonSaved, setLessonSaved] = useState(false);

  const previewRef = useRef<HTMLVideoElement>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const sessionIdRef = useRef<string | null>(null);
  const postIdRef = useRef<string | null>(null);
  const liveTitleRef = useRef<string>('');
  const signalChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const chatChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── Load audio devices ──
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const mics = devices.filter(d => d.kind === 'audioinput');
      setAudioDevices(mics);
      if (mics.length > 0) setSelectedMic(mics[0].deviceId);
    });
  }, []);

  // ── Load categories for save dialog ──
  useEffect(() => {
    supabase.from('categories').select('id, title').eq('mentor_id', mentorId).order('position')
      .then(({ data }) => {
        if (data) setCategories(data);
      });
  }, [mentorId]);

  // ── Preview local stream ──
  useEffect(() => {
    if (previewRef.current && localStream) previewRef.current.srcObject = localStream;
  }, [localStream]);

  // ── Auto-scroll chat ──
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Keep liveTitleRef in sync
  useEffect(() => {
    liveTitleRef.current = liveTitle;
  }, [liveTitle]);

  // ── Pick screen/window ──
  const pickScreen = useCallback(async (type: 'screen' | 'window') => {
    try {
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: type === 'window' ? 'window' : 'monitor',
          frameRate: 30,
        } as MediaTrackConstraints,
        audio: false,
      });
      screenStreamRef.current = stream;
      setShareMode(type);
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        setLocalStream(null);
        setShareMode(null);
        screenStreamRef.current = null;
      });
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
      if (screenStreamRef.current) {
        const combined = buildCombinedStream(screenStreamRef.current, stream);
        setLocalStream(combined);
      }
    } catch {
      toast({ title: 'לא ניתן לגשת למיקרופון', variant: 'destructive' });
    }
  }, [toast]);

  const toggleMic = useCallback(() => {
    const tracks = micStreamRef.current?.getAudioTracks();
    if (!tracks?.length) return;
    tracks.forEach(t => { t.enabled = !t.enabled; });
    setMicEnabled(e => !e);
  }, []);

  function buildCombinedStream(video: MediaStream, audio: MediaStream | null): MediaStream {
    const tracks: MediaStreamTrack[] = [];
    video.getVideoTracks().forEach(t => tracks.push(t));
    audio?.getAudioTracks().forEach(t => tracks.push(t));
    return new MediaStream(tracks);
  }

  // ── Start MediaRecorder ──
  const startRecording = useCallback((stream: MediaStream) => {
    recordedChunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm')
      ? 'video/webm'
      : '';

    try {
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.start(1000); // collect every 1s
      mediaRecorderRef.current = recorder;
    } catch {
      // Recording not supported — silent fail, live still works
    }
  }, []);

  // ── Upload recording & update community post ──
  const uploadAndSaveRecording = useCallback(async (pId: string, sessId: string, title: string) => {
    if (recordedChunksRef.current.length === 0) return null;
    setIsUploadingRecording(true);
    try {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      const path = `live-recordings/${mentorId}/${sessId}.webm`;
      const { data, error } = await supabase.storage
        .from('lesson-assets')
        .upload(path, blob, { upsert: true, contentType: 'video/webm' });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('lesson-assets').getPublicUrl(data.path);

      // Update community post with video
      await supabase.from('community_posts').update({
        content: title + ' (הוקלט)',
        post_type: 'live',
        media_url: publicUrl,
        media_type: 'video',
      }).eq('id', pId);

      // Update live_session with recording url
      await supabase.from('live_sessions').update({ recording_url: publicUrl }).eq('id', sessId);

      setRecordingUrl(publicUrl);
      return publicUrl;
    } catch {
      toast({ title: 'שגיאה בשמירת ההקלטה', description: 'הלייב הסתיים אך ההקלטה לא נשמרה', variant: 'destructive' });
      return null;
    } finally {
      setIsUploadingRecording(false);
    }
  }, [mentorId, toast]);

  // ── Handle new viewer joining ──
  const handleViewerJoin = useCallback(async (viewerId: string, sessId: string) => {
    const stream = localStream ?? screenStreamRef.current;
    if (!stream) return;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peersRef.current.set(viewerId, pc);
    setViewerCount(c => c + 1);

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

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

  // ── Go Live ──
  const goLive = useCallback(async () => {
    if (!localStream || !shareMode) return;
    setIsStarting(true);
    try {
      const title = liveTitle.trim() || 'לייב סשן';

      // 1. Create session
      const { data: session, error: sessErr } = await supabase
        .from('live_sessions')
        .insert({ mentor_id: mentorId, title, status: 'active' })
        .select('id')
        .single();
      if (sessErr) throw sessErr;

      sessionIdRef.current = session.id;
      setSessionId(session.id);

      // 2. Publish live community post
      const { data: post, error: postErr } = await supabase
        .from('community_posts')
        .insert({ mentor_id: mentorId, content: title, post_type: 'live', is_pinned: false })
        .select('id')
        .single();
      if (postErr) throw postErr;
      setPostId(post.id);
      postIdRef.current = post.id;
      onPostCreated?.(post.id);

      // 3. Start recording
      startRecording(localStream);

      // 4. Subscribe to signals
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
          if (sig.to_user_id !== mentorId) return;
          if (sig.signal_type === 'join') {
            await handleViewerJoin(sig.from_user_id, session.id);
          } else if (sig.signal_type === 'answer') {
            const pc = peersRef.current.get(sig.from_user_id);
            if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sig.payload as unknown as RTCSessionDescriptionInit));
          } else if (sig.signal_type === 'ice-candidate') {
            const pc = peersRef.current.get(sig.from_user_id);
            if (pc && sig.payload.candidate) await pc.addIceCandidate(new RTCIceCandidate(sig.payload as unknown as RTCIceCandidateInit));
          }
        })
        .subscribe();

      signalChannelRef.current = channel;

      // 5. Subscribe to chat
      const chatCh = supabase
        .channel(`live-chat-mentor-${session.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'live_chat_messages',
          filter: `session_id=eq.${session.id}`,
        }, (payload) => {
          setChatMessages(prev => [...prev, payload.new as ChatMessage]);
        })
        .subscribe();
      chatChannelRef.current = chatCh;

      // 6. Notify students (best-effort)
      supabase.functions.invoke('notify-live', {
        body: { session_id: session.id, mentor_id: mentorId, title },
      }).catch(() => {});

      setSaveLessonForm(f => ({ ...f, title }));
      setStep('live');
    } catch {
      toast({ title: 'שגיאה בהתחלת הלייב', variant: 'destructive' });
    } finally {
      setIsStarting(false);
    }
  }, [localStream, shareMode, liveTitle, mentorId, onPostCreated, handleViewerJoin, startRecording, toast]);

  // ── Send chat message ──
  const sendMessage = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || isSendingMsg || !sessionId) return;
    setIsSendingMsg(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('live_chat_messages') as any).insert({
        session_id: sessionId,
        user_id: mentorId,
        display_name: mentorName || 'מנטור',
        message: text,
      });
      setChatInput('');
    } catch {
      toast({ title: 'שגיאה בשליחה', variant: 'destructive' });
    } finally {
      setIsSendingMsg(false);
    }
  }, [chatInput, isSendingMsg, sessionId, mentorId, mentorName, toast]);

  // ── End Live ──
  const endLive = useCallback(async () => {
    const sessId = sessionIdRef.current;
    const pId = postIdRef.current;
    const title = liveTitleRef.current.trim() || 'לייב סשן';

    // Stop recorder first to get all chunks
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    peersRef.current.forEach(pc => pc.close());
    peersRef.current.clear();
    localStream?.getTracks().forEach(t => t.stop());
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    if (signalChannelRef.current) supabase.removeChannel(signalChannelRef.current);
    if (chatChannelRef.current) supabase.removeChannel(chatChannelRef.current);

    if (sessId) {
      await supabase.from('live_sessions').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', sessId);
    }

    // Update post to show ended state (video will be added after upload)
    if (pId) {
      await supabase.from('community_posts').update({
        content: title + ' (הסתיים)',
        post_type: 'live',
      }).eq('id', pId);
    }

    setStep('ended');

    // Upload recording after a brief delay to ensure recorder flushed
    if (pId && sessId) {
      setTimeout(async () => {
        await uploadAndSaveRecording(pId, sessId, title);
      }, 500);
    }

    toast({ title: 'הלייב הסתיים — מעלה הקלטה...' });
  }, [localStream, uploadAndSaveRecording, toast]);

  // ── Save as lesson ──
  const saveAsLesson = useCallback(async () => {
    if (!saveLessonForm.title.trim()) return;
    setIsSavingLesson(true);
    try {
      const { error } = await supabase.from('lessons').insert({
        mentor_id: mentorId,
        title: saveLessonForm.title.trim(),
        description: saveLessonForm.description.trim() || null,
        lesson_type: 'live',
        category_id: saveLessonForm.categoryId || null,
        is_published: false,
        position: 0,
        video_url: recordingUrl || null,
      });
      if (error) throw error;
      setLessonSaved(true);
      toast({ title: 'הלייב נשמר כשיעור!', description: 'תוכל למצוא אותו בלשונית שיעורים' });
    } catch {
      toast({ title: 'שגיאה בשמירת השיעור', variant: 'destructive' });
    } finally {
      setIsSavingLesson(false);
    }
  }, [saveLessonForm, mentorId, recordingUrl, toast]);

  // ── Cleanup on unmount — always release camera/mic/screen ──
  useEffect(() => {
    return () => {
      localStream?.getTracks().forEach(t => t.stop());
      micStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render ──
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" dir="rtl">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        className="relative w-full max-w-4xl mx-4 bg-card rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            {step === 'live' ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />
                <span className="text-sm font-bold text-destructive uppercase tracking-wider">LIVE</span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />{viewerCount} צופים
                </span>
              </>
            ) : step === 'ended' ? (
              <>
                <BookOpen className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">הלייב הסתיים</span>
                {isUploadingRecording && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    מעלה הקלטה...
                  </span>
                )}
                {recordingUrl && !isUploadingRecording && (
                  <span className="text-xs text-gold-600 flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    הקלטה נשמרה
                  </span>
                )}
              </>
            ) : (
              <>
                <Radio className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">הגדרת לייב</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step === 'live' && (
              <button
                onClick={() => setShowChat(v => !v)}
                className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-xs transition-all ${
                  showChat ? 'border-primary/40 bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">צ'אט</span>
                {chatMessages.length > 0 && (
                  <span className="bg-primary text-primary-foreground text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                    {chatMessages.length > 99 ? '99+' : chatMessages.length}
                  </span>
                )}
              </button>
            )}
            {step === 'setup' && (
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            )}
            {step === 'ended' && (
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* ── SETUP STEP ── */}
        {step === 'setup' && (
          <div className="p-6 space-y-5 overflow-y-auto">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">כותרת הסשן</label>
              <input
                value={liveTitle}
                onChange={e => setLiveTitle(e.target.value)}
                placeholder="לדוגמה: מסחר חי על S&P500 — גישת הבוקר"
                className="w-full h-11 px-4 bg-background ring-1 ring-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all text-right"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">שיתוף מסך</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => pickScreen('screen')}
                  className={`flex flex-col items-center gap-2.5 p-4 rounded-xl border transition-all ${
                    shareMode === 'screen' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground'
                  }`}
                >
                  <Maximize2 className="w-6 h-6" />
                  <span className="text-xs font-medium">כל המסך</span>
                  {shareMode === 'screen' && <span className="text-[10px] text-primary/70">✓ נבחר</span>}
                </button>
                <button
                  onClick={() => pickScreen('window')}
                  className={`flex flex-col items-center gap-2.5 p-4 rounded-xl border transition-all ${
                    shareMode === 'window' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground'
                  }`}
                >
                  <MonitorPlay className="w-6 h-6" />
                  <span className="text-xs font-medium">חלון ספציפי</span>
                  {shareMode === 'window' && <span className="text-[10px] text-primary/70">✓ נבחר</span>}
                </button>
              </div>
            </div>

            {localStream && (
              <div className="rounded-xl overflow-hidden bg-foreground/5 border border-border aspect-video relative">
                <video ref={previewRef} autoPlay muted playsInline className="w-full h-full object-contain" />
                <div className="absolute top-2 right-2 px-2 py-0.5 bg-foreground/60 rounded-full text-[10px] text-background flex items-center gap-1">
                  <Monitor className="w-3 h-3" />
                  תצוגה מקדימה
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">מיקרופון</label>
              <div className="flex gap-2">
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
                            onClick={() => { setSelectedMic(d.deviceId); setShowMicMenu(false); acquireMic(d.deviceId); }}
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
                <button
                  onClick={() => acquireMic(selectedMic)}
                  className="h-10 px-4 rounded-xl bg-muted text-foreground text-xs font-medium hover:bg-muted/80 transition-all shrink-0"
                >
                  בדוק
                </button>
              </div>
            </div>

            <div className="bg-muted/40 border border-border rounded-xl p-3 flex items-start gap-2.5">
              <Upload className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                הלייב <strong className="text-foreground">יוקלט אוטומטית</strong> ויישמר כסרטון בפוסט הקהילה בסיום. ניתן גם להוסיפו לשיעורים.
              </p>
            </div>

            <button
              onClick={goLive}
              disabled={!localStream || !shareMode || isStarting}
              className="w-full h-12 bg-destructive text-destructive-foreground rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-40 hover:opacity-90"
            >
              {isStarting
                ? <><div className="w-4 h-4 border-2 border-destructive-foreground border-t-transparent rounded-full animate-spin" />מכין לייב...</>
                : <><Wifi className="w-4 h-4" />התחל לייב</>
              }
            </button>
          </div>
        )}

        {/* ── LIVE STEP ── */}
        {step === 'live' && (
          <div className="flex flex-1 overflow-hidden min-h-0">
            {/* Video + controls */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex-1 bg-foreground/5 relative overflow-hidden">
                <video ref={previewRef} autoPlay muted playsInline className="w-full h-full object-contain" />
                <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 bg-destructive rounded-full text-destructive-foreground text-xs font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-destructive-foreground animate-pulse" />
                  LIVE
                </div>
                <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 bg-foreground/50 rounded-full text-background text-xs">
                  <Users className="w-3 h-3" />
                  {viewerCount} צופים
                </div>
                {/* Recording indicator */}
                <div className="absolute bottom-3 right-3 flex items-center gap-1.5 px-2 py-1 bg-foreground/50 rounded-full text-background text-[10px]">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                  מוקלט
                </div>
              </div>
              <div className="flex items-center gap-3 px-5 py-3 border-t border-border shrink-0 bg-card flex-wrap">
                <button
                  onClick={toggleMic}
                  className={`flex items-center gap-2 h-9 px-4 rounded-xl border text-xs font-medium transition-all ${
                    micEnabled ? 'border-border text-foreground hover:bg-muted' : 'border-destructive/30 bg-destructive/10 text-destructive'
                  }`}
                >
                  {micEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                  {micEnabled ? 'מיק פעיל' : 'מיק כבוי'}
                </button>
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-xl">
                  <MonitorPlay className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground truncate">
                    {shareMode === 'screen' ? 'שיתוף כל המסך' : 'שיתוף חלון'}
                  </span>
                </div>
                <div className="flex-1" />
                <button
                  onClick={endLive}
                  className="h-9 px-5 bg-destructive text-destructive-foreground rounded-xl text-xs font-bold hover:opacity-90 transition-all"
                >
                  סיים לייב
                </button>
              </div>
            </div>

            {/* Chat panel */}
            <AnimatePresence>
              {showChat && (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 260, opacity: 1 }}
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
                        <p className="text-xs">ממתין להודעות...</p>
                      </div>
                    )}
                    {chatMessages.map(msg => (
                      <div key={msg.id} className={`flex flex-col gap-0.5 ${msg.user_id === mentorId ? 'items-end' : 'items-start'}`}>
                        <span className="text-[10px] text-muted-foreground font-medium px-1">
                          {msg.user_id === mentorId ? 'אתה' : msg.display_name}
                        </span>
                        <div className={`max-w-[85%] px-3 py-1.5 rounded-2xl text-xs leading-relaxed ${
                          msg.user_id === mentorId
                            ? 'bg-primary text-primary-foreground rounded-tl-sm'
                            : 'bg-muted text-foreground rounded-tr-sm'
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
        )}

        {/* ── ENDED STEP — Save as lesson ── */}
        {step === 'ended' && (
          <div className="p-6 space-y-5 overflow-y-auto">
            {/* Recording status */}
            <div className="text-center py-2">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
                {isUploadingRecording
                  ? <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  : recordingUrl
                  ? <Check className="w-6 h-6 text-emerald-600" />
                  : <Radio className="w-6 h-6 text-muted-foreground" />
                }
              </div>
              <h3 className="text-base font-bold text-foreground mb-1">הלייב הסתיים בהצלחה</h3>
              {isUploadingRecording && (
                <p className="text-sm text-muted-foreground">מעלה את ההקלטה לקהילה...</p>
              )}
              {recordingUrl && !isUploadingRecording && (
                <p className="text-sm text-emerald-600 font-medium">ההקלטה נשמרה בפוסט הקהילה! 🎉</p>
              )}
              {!isUploadingRecording && !recordingUrl && (
                <p className="text-sm text-muted-foreground">הפוסט נשאר בקהילה עם סימון "הסתיים"</p>
              )}
            </div>

            {/* Video preview if recording done */}
            {recordingUrl && (
              <div className="rounded-xl overflow-hidden border border-border">
                <video src={recordingUrl} controls className="w-full max-h-48 object-contain bg-black" />
              </div>
            )}

            {!lessonSaved ? (
              <div className="bg-muted/40 border border-border rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <BookOpen className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">שמור את הלייב כשיעור</span>
                </div>
                <p className="text-xs text-muted-foreground">ניתן לתעד את הסשן כשיעור לייב תחת הקטגוריות שלך{recordingUrl ? ' — יכלול את הסרטון המוקלט' : ''}</p>

                <div>
                  <label className="block text-xs text-muted-foreground mb-1">שם השיעור</label>
                  <input
                    value={saveLessonForm.title}
                    onChange={e => setSaveLessonForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="כותרת השיעור"
                    className="w-full h-9 px-3 bg-background ring-1 ring-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-right"
                  />
                </div>

                {categories.length > 0 && (
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">קטגוריה (אופציונלי)</label>
                    <select
                      value={saveLessonForm.categoryId}
                      onChange={e => setSaveLessonForm(f => ({ ...f, categoryId: e.target.value }))}
                      className="w-full h-9 px-3 bg-background ring-1 ring-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-right"
                    >
                      <option value="">ללא קטגוריה</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.title}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs text-muted-foreground mb-1">תיאור (אופציונלי)</label>
                  <textarea
                    value={saveLessonForm.description}
                    onChange={e => setSaveLessonForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="תיאור קצר של הסשן..."
                    rows={2}
                    className="w-full px-3 py-2 bg-background ring-1 ring-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-right resize-none"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={saveAsLesson}
                    disabled={!saveLessonForm.title.trim() || isSavingLesson || isUploadingRecording}
                    className="flex-1 h-9 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-all disabled:opacity-50"
                  >
                    {isSavingLesson ? 'שומר...' : isUploadingRecording ? 'ממתין להקלטה...' : 'שמור כשיעור לייב'}
                  </button>
                  <button
                    onClick={onClose}
                    className="h-9 px-4 border border-border text-muted-foreground rounded-lg text-xs hover:bg-muted transition-all"
                  >
                    סגור
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Check className="w-5 h-5 text-primary" />
                </div>
                <p className="text-sm font-semibold text-foreground">השיעור נשמר!</p>
                <p className="text-xs text-muted-foreground">תוכל למצוא אותו בלשונית שיעורים ולפרסם אותו לתלמידים</p>
                <button
                  onClick={onClose}
                  className="mt-2 h-9 px-6 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-all"
                >
                  סגור
                </button>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
