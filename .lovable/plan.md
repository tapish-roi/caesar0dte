

# תוכנית: תיקון שמע ב-Mac ושיתוף מסך קופא בהחלפת חלונות

## בעיות שזוהו

### 1. שמע לא עובד ב-Mac
הבעיה נובעת מ-**מדיניות autoplay של Safari/Chrome ב-Mac**: דפדפנים חוסמים ניגון אודיו אוטומטי ללא gesture של המשתמש. ה-`<audio autoPlay>` elements מרונדרים מחדש בכל שינוי ב-`remoteStreams` ומאבדים את ה-playback state. בנוסף, ה-`ref` callback מחליף `srcObject` בכל רנדור — מה שמפסיק ניגון קיים.

### 2. שיתוף מסך קופא בהחלפת חלונות
שיתוף המסך מבוסס על `requestAnimationFrame` שנעצר כשהטאב לא בפוקוס (המשתמש עובר חלון). זה גורם לקפיאת השיתוף אצל הצופים.

## תיקונים מוצעים

### קובץ: `src/components/LiveRoom.tsx`

**1. תיקון שמע ב-Mac — AudioContext resume + stable ref**
- להוסיף `useEffect` שעושה `resume()` ל-AudioContext בכל אינטראקציה של המשתמש (click/keydown) — זה מתעורר את ה-AudioContext ש-Safari/Chrome חוסמים.
- להחליף את ה-`ref` callback של `<audio>` elements כך שלא ידרוס `srcObject` אם הוא כבר מוגדר לאותו stream. כרגע כל רנדור מפעיל מחדש את ה-audio element.
- להוסיף `el.play().catch(() => {})` ידני אחרי הגדרת srcObject, ולעטוף אותו ב-try/catch כדי לתפוס את החסימה של Safari.
- להוסיף event listener גלובלי של `click` שמנסה לעשות `play()` לכל `[data-remote-audio]` elements שנמצאים ב-paused — זה פותר את הבעיה של autoplay policy.

**2. תיקון קפיאת שיתוף מסך — מעבר מ-rAF ל-setInterval**
- להחליף את `requestAnimationFrame` loop ב-`setInterval` (כל 100ms). rAF נעצר כשהטאב לא בפוקוס, אבל `setInterval` ממשיך לרוץ (בקצב מופחת אבל לא נעצר).
- להוסיף `document.addEventListener('visibilitychange')` — כשהטאב חוזר לפוקוס, לשלוח מיד פריים מרענן.

### פירוט טכני

```typescript
// 1. Global click listener to resume audio on Mac
useEffect(() => {
  const resumeAudio = () => {
    document.querySelectorAll<HTMLAudioElement>('[data-remote-audio]').forEach(el => {
      if (el.paused && el.srcObject) el.play().catch(() => {});
    });
  };
  document.addEventListener('click', resumeAudio, { once: false });
  document.addEventListener('keydown', resumeAudio, { once: false });
  return () => {
    document.removeEventListener('click', resumeAudio);
    document.removeEventListener('keydown', resumeAudio);
  };
}, []);

// 2. Stable audio ref — don't overwrite if same stream
ref={el => {
  if (el && el.srcObject !== stream) {
    el.srcObject = stream;
    el.volume = deafened ? 0 : volume / 100;
    el.play().catch(() => {});
  } else if (el) {
    el.volume = deafened ? 0 : volume / 100;
  }
}}

// 3. Screen frame capture — setInterval instead of rAF
const timer = setInterval(() => {
  if (!isSendingFrameRef.current) captureFrame();
}, FRAME_INTERVAL_MS);
```

### תוצאה צפויה
- שמע יעבוד ב-Mac אחרי לחיצה ראשונה בממשק (מגבלת דפדפן שלא ניתן לעקוף בלי gesture).
- שיתוף מסך ימשיך לעבוד גם כשהמשתף עובר חלון.

