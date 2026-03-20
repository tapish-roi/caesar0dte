
## הבעיה האמיתית — Audio Delay בזמן Screen Share

הדיליי **אינו** קשור לרשת Supabase. WebRTC audio הוא P2P — עובר ישירות בין דפדפנים. הדיליי שגדל עם הזמן הוא בעיה של **WebRTC jitter buffer** שנגרמת כך:

`setInterval(captureFrame, 67ms)` — פונקציית `captureFrame` מריצה `canvas.toDataURL('image/webp', 0.85)` על canvas של 1280px. זוהי **פעולה סינכרונית כבדה** שחוסמת את main thread כל 67ms. כשה-main thread חסום, WebRTC לא יכול לעבד את ה-RTP audio packets בזמן — הם מצטברים ב-jitter buffer, וה-buffer גדל בקצב קבוע.

## הפתרון

### שינוי 1 — הורדת עומס ה-main thread ב-captureFrame

**בעיה ספציפית**: `offscreen.toDataURL()` היא synchronous ומפעילה GPU pipeline. על canvas 1280×720 היא לוקחת 10-40ms בכל קריאה. בתדירות 67ms זה אומר שה-main thread חסום 15-60% מהזמן.

**פתרון**: לשנות את הלוגיקה כך שהפריים יצולם ב-`requestAnimationFrame` (מסונכרן עם vsync, לא חוסם), עם debounce שמונע שני captures ברצף, ולהוריד רזולוציה ל-960px + WebP 65%:

```typescript
// השתמש ב-requestAnimationFrame במקום setInterval
const scheduleCapture = () => {
  screenFrameTimerRef.current = requestAnimationFrame(async () => {
    if (!isSendingFrameRef.current) {
      await captureFrame();
    }
    if (screenSharing) scheduleCapture();
  });
};
```

### שינוי 2 — מניעת jitter buffer buildup עם explicit latency hints

להוסיף `latencyHint: 'interactive'` ל-AudioContext ב-`startRemoteSpeakingDetection` כדי שהדפדפן יעדיף latency נמוך על פני throughput:

```typescript
const ctx = new AudioContext({ latencyHint: 'interactive' });
```

גם ב-`startSpeakingDetection` (local).

### שינוי 3 — resume AudioContext אוטומטית

ב-Chrome, AudioContext נעצר אחרי interactivity timeout. להוסיף listener שמחדש אותו:

```typescript
const resumeAudioContexts = () => {
  remoteAnalysersRef.current.forEach(({ ctx }) => {
    if (ctx.state === 'suspended') ctx.resume();
  });
};
document.addEventListener('click', resumeAudioContexts, { once: false });
```

### שינוי 4 — isSendingFrameRef להימנע מ-overlap

להוסיף ref `isSendingFrameRef` שמונע שליחת פריים חדש בעוד הקודם עדיין בתהליך:

```typescript
const isSendingFrameRef = useRef(false);
```

## קבצים לשינוי

רק `src/components/LiveRoom.tsx`:

- **שורה 65**: `FRAME_INTERVAL_MS = 100` (10fps)
- **שורות 177-180**: הוספת `isSendingFrameRef`
- **שורות 528-565**: החלפת `setInterval` ב-`requestAnimationFrame` + isSendingFrameRef guard + רזולוציה 960px + WebP 65%
- **שורות 914-932**: הוספת `latencyHint: 'interactive'` ל-AudioContext
- **שורות 943-976**: הוספת `latencyHint: 'interactive'` + auto-resume listener
- **שורות 1185-1189**: הוספת resume ל-AudioContexts כשה-volume משתנה
