
## שורש הבעיה

לאחר קריאה מלאה של `LiveRoom.tsx` (1665 שורות), הבעיה ברורה:

**אין WebRTC בכלל.** הקומפוננטה משתמשת ב-Supabase Realtime רק לשידור פריימים של שיתוף מסך (JPEG images), אבל **מיקרופון ומצלמה לא נשלחים אף פעם לצד השני.** הנתונים נשמרים רק locally בדפדפן.

בנוסף — הנוכחות (`presence`) חד-כיוונית: תלמידים שולחים `presence` למנטור, אבל המנטור לא מכריז על עצמו → התלמיד לא רואה את המנטור ברשימת המשתתפים ולא שומע אותו.

## הפתרון — הוספת WebRTC

### מה נוסיף

**1. ניהול Peer Connections**
- `peersRef: Map<userId, RTCPeerConnection>` — מילון של חיבורי WebRTC לכל משתתף
- STUN servers ציבוריים של Google ל-ICE negotiation
- כשמשתתף חדש מצטרף — יוצרים `RTCPeerConnection`, שולחים offer/answer, מחליפים ICE candidates

**2. ערוץ Signaling דרך Supabase Realtime Broadcast**
- ערוץ `webrtc-signal-{sessionId}` לאירועים: `offer`, `answer`, `ice_candidate`
- כל הודעת signaling כוללת `fromId` ו-`toId` — כל משתתף מסנן רק הודעות אליו

**3. נוכחות דו-כיוונית**
- המנטור גם שולח `presence` signal עם הצטרפותו
- כשתלמיד רואה `presence` של המנטור — מוסיף אותו לרשימת המשתתפים ופותח חיבור WebRTC

**4. ניהול Tracks**
- `toggleMic` — מוסיף/מסיר `audioTrack` מכל ה-peer connections הפעילים
- `toggleCamera` — מוסיף/מסיר `videoTrack` מכל ה-peer connections הפעילים
- כשמגיע `ontrack` event — שומרים את ה-`MediaStream` ברשימת המשתתפים

**5. עיבוד שמע ווידאו רחוק**
- לכל משתתף עם `stream` — מרנדרים `<audio autoPlay>` (נסתר) לשמע
- אם למשתתף יש track וידאו — מרנדרים `<video>` קטן בפאנל הצדדי

### קבצים לשינוי

רק `src/components/LiveRoom.tsx`:

- **שורות 127-160**: הוספת `peersRef`, `remoteStreamsRef`, `signalingChannelRef` ו-state `remoteStreams`
- **שורות 229-282** (presence channel): שינוי ל-broadcast דו-כיווני; הוספת טיפול ב-`offer/answer/ice_candidate`; גם mentor שולח presence
- **שורות 751-767** (toggleMic): אחרי `setMicEnabled(true)`, מוסיף את ה-audio track לכל peer connections
- **שורות 821-830** (camera useEffect): אחרי פתיחת המצלמה, מוסיף video track לכל peer connections
- **שורות 1273-1301** (avatar grid): הוספת `<audio>` elements לכל remote stream + הצגת וידאו למשתתפים עם מצלמה פעילה

### פונקציות חדשות שנוסיף

```typescript
// יצירת/קבלת peer connection למשתמש
const getOrCreatePeer = (remoteId: string, isInitiator: boolean): RTCPeerConnection

// שליחת offer ל-peer חדש
const initiateOffer = async (remoteId: string)

// קבלת offer ושליחת answer
const handleOffer = async (fromId: string, offer: RTCSessionDescriptionInit)

// קבלת answer
const handleAnswer = async (fromId: string, answer: RTCSessionDescriptionInit)

// קבלת ICE candidate
const handleIceCandidate = async (fromId: string, candidate: RTCIceCandidateInit)
```

### דגשים ביישום

- STUN: `stun:stun.l.google.com:19302` + `stun:stun1.l.google.com:19302`
- כשמשתתף עוזב — `pc.close()` ומחיקה מ-`peersRef`
- כשמגיע `ontrack` — מעדכנים `remoteStreams` map ו-`participants` state עם `hasCamera: true`
- audio elements מרונדרים עם `useEffect` על `remoteStreams` state
- לא נדרש שינוי ב-DB, migrations, או קבצים אחרים
