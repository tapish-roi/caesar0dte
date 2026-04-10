
מטרה: לייצב את הלייב לשני הצדדים (מנטור/תלמיד) כך ש-self camera תופיע תמיד, מצלמה לא תיפול כשמדליקים מיקרופון בצד השני, יציאה/כיבוי שיתוף מסך לא יקפיא וידאו, והדיליי ירד משמעותית.

מה מצאתי בקוד:
- ב-`LiveRoom.tsx` ה-`pc.ontrack` עושה `remoteStreamsRef.set(remoteId, e.streams[0])`. זה אומר שכל Track חדש יכול לדרוס את ה-stream הקיים של אותו משתמש. זו כנראה הסיבה שמצלמה נעלמת/קופאת כשמצטרף אודיו או כשיש שינוי מדיה.
- ה-self preview של המשתמש המקומי נשען על `localStreamRef`, אבל `syncLocalVideoPreview()` מרענן את ה-video element רק אם אובייקט ה-stream השתנה. כשנוסף Track חדש לאותו stream, הדפדפן לא תמיד מציג אותו נכון.
- `cameraStreamRef` נשמר אבל כמעט לא משמש לרינדור העצמי, כך שאין הפרדה טובה בין stream השידור לבין stream התצוגה המקומית.
- שיתוף המסך כרגע לא עובר ב-WebRTC אלא כ-`screen_frame` ב-Realtime עם תמונות דחוסות. זה מסביר חלק גדול מהדיליי, ובעיקר אומר שאי אפשר להגיע ל"כמעט בלי דיליי" במסך בלי לשנות את המסלול הזה.

תוכנית תיקון:
1. לייצב את ה-self camera
- להפריד בין stream התצוגה המקומית לבין stream השידור.
- לרנדר את ה-self preview מתוך stream ייעודי/מרוענן, ולא להסתמך רק על אותו `localStreamRef`.
- לעדכן את `syncLocalVideoPreview()` כך שיכפה refresh ל-video element כש-track של מצלמה נוסף/הוסר.

2. לייצב את ה-remote media
- להחליף את הלוגיקה ב-`pc.ontrack` כך שלא תדרוס את ה-stream של המשתמש בכל track חדש.
- לכל משתתף יהיה `MediaStream` יציב אחד, ואליו נוסיף/נעדכן tracks לפי סוג (`audio` / `video`) במקום להחליף את כל ה-stream.
- להוסיף טיפול מסודר ב-`track.onended / onmute / onunmute` כדי שלא יישארו streams קפואים.

3. לבטל את ההתנגשות בין מצלמה למיקרופון
- לעבור מניהול “הסר track + addTrack + renegotiateAll לכל שינוי” למודל יציב יותר של sender/track management.
- איפה שאפשר, להשתמש ב-`replaceTrack` או לפחות לשמור רציפות של ה-senders כדי שהחלפת אודיו/וידאו לא תפיל את הווידאו של הצד השני.

4. לתקן יציאה/כיבוי שיתוף מסך
- להוסיף cleanup מלא במעבר בין screen-share למצלמה רגילה.
- לוודא שכשמכבים שיתוף מסך, ה-UI חוזר מיד לזרם הווידאו החי ולא נשאר על פריים אחרון/stream
<lov-tool-use id="thinking-5cbcae71-6a55-471a-bbf3-443a7b161532" name="lov-think" data="**Outlining proposed phases**

I need to suggest a series of phases for our plan. First, we stabilize the peer/media graph, then move to self-preview, followed by screen share teardown. Next, we’ll focus on latency improvements, like optimizing the camera and mic with stable senders, along with migrating the screen share path. Finally, we’ll create a validation matrix. It’s important to note this is a read-only plan, and implementation will follow upon approval." duration="111.590201">
</lov-tool-use>
<lov-plan>
מטרה: לייצב את הלייב כך שווידאו/מיקרופון/שיתוף מסך יעבדו בצורה עקבית בין מנטור לתלמיד, בלי קפיאות ובלי חוסר סנכרון מורגש.

מה מצאתי בקוד:
- כל הלוגיקה מרוכזת ב-`src/components/LiveRoom.tsx`, ולכן תיקון שם ישפיע גם על מנטור וגם על תלמיד.
- ב-`pc.ontrack` הזרם של המשתמש המרוחק נדרס בכל Track חדש. זה מסביר למה הדלקת מיקרופון בצד אחד יכולה “להפיל” או להחליף את המצלמה בצד השני.
- ה-self preview של המצלמה המקומית נשען על `localStreamRef`, אבל רענון ה-`video` המקומי לא תמיד קורה כשמתווסף Track חדש לאותו stream.
- כיבוי שיתוף מסך לא מחזיר תמיד את הממשק למצב נקי, ולכן יכול להישאר פריים קפוא.
- שיתוף מסך כרגע נשלח כתמונות דרך Realtime (`screen_frame`) ולא כווידאו חי דרך WebRTC, ולכן שם קיים מקור מובנה לדיליי.

שלבי מימוש:
1. לייצב את הזרמים המרוחקים
- לשנות את `pc.ontrack` כך שלכל משתתף יהיה `MediaStream` יציב אחד.
- במקום להחליף את כל ה-stream בכל Track חדש, להוסיף/להחליף רק את ה-track המתאים (`audio`/`video`).
- להוסיף cleanup מסודר ב-`onended`/`onmute`/`onunmute` כדי למנוע מצב של מצלמה קפואה.

2. לתקן את ה-self preview של המנטור
- לעדכן את `syncLocalVideoPreview()` כך שיכריח רענון ל-`srcObject` גם כשאובייקט ה-stream נשאר אותו דבר אבל ה-tracks השתנו.
- לוודא שהמנטור תמיד רואה את המצלמה של עצמו ברגע שהווידאו פעיל.

3. לבטל את ההתנגשות בין מיקרופון למצלמה
- לייצב את ניהול ה-senders וה-tracks כך שהדלקת מיקרופון לא תדרוס וידאו, והדלקת מצלמה לא תפיל אודיו.
- להפחית renegotiation מיותרת ולעדכן tracks בצורה יותר יציבה.

4. לתקן כיבוי/סיום שיתוף מסך
- להוסיף מעבר נקי בין screen share למצלמה רגילה.
- לוודא שכאשר שיתוף מסך נסגר, הצד השני חוזר לראות וידאו חי ולא פריים שנתקע.

5. לטפל בדיליי
- עבור מצלמה ומיקרופון: לייצב את מסלול ה-WebRTC כדי לצמצם הצטברות עיכובים.
- עבור שיתוף מסך: יש שתי רמות תיקון:
  - שיפור חלקי במסגרת המימוש הקיים: המשך אופטימיזציה של קצב/גודל פריימים.
  - תיקון אמיתי לדיליי: להעביר גם את שיתוף המסך למסלול WebRTC במקום `screen_frame`.

בדיקות שאבצע אחרי המימוש:
- מנטור מפעיל מצלמה ורואה את עצמו.
- תלמיד רואה את מצלמת המנטור בזמן אמת.
- תלמיד מפעיל/מכבה מיקרופון בזמן שמצלמת המנטור דולקת, בלי לשבור את הווידאו.
- מנטור מפעיל/מכבה שיתוף מסך, והמצלמה חוזרת בלי קיפאון.
- בדיקה דו-כיוונית של מצלמה + מיקרופון + שיתוף מסך בכמה סדרי הפעלה/כיבוי.
- בדיקת עזיבה/חזרה בין משתמשים כדי לוודא שאין “ghost state”.

פרטים טכניים:
- קובץ עיקרי: `src/components/LiveRoom.tsx`
- תיקונים מרכזיים:
  - `pc.ontrack`
  - `syncLocalVideoPreview`
  - `toggleMic`
  - `toggleCamera`
  - `toggleScreenShare` / `stopScreenShare`
  - cleanup של peers/streams
- אם המטרה היא “כמעט בלי דיליי” גם בשיתוף מסך, אצטרך לכלול בשלב הזה מעבר של שיתוף המסך ל-WebRTC. בלי זה אפשר לשפר, אבל לא להבטיח ביטול מלא של הדיליי במסך.

תוצאה צפויה:
- המנטור יראה את עצמו תמיד כשהמצלמה דולקת.
- הדלקת מיקרופון אצל משתתף אחד לא תפיל וידאו של המשתתף השני.
- סיום שיתוף מסך לא יקפיא את המצלמה.
- הדיליי במצלמה ובמיקרופון ירד משמעותית, ובשיתוף מסך יטופל לפי רמת התיקון שנבחרה.
