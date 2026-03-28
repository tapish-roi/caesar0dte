

# הוספת התראות WhatsApp לתלמידים

## מצב נוכחי
- קיימות התראות SMS (דרך Twilio) ואימייל בפונקציות `notify-new-post` ו-`notify-live`
- Twilio עדיין לא מחובר כ-connector לפרויקט (אין חיבורים פעילים)
- בפרופיל התלמיד יש כבר שדות `notify_sms` ו-`notify_email`

## מה צריך לעשות

### 1. חיבור Twilio כ-connector
Twilio נדרש גם ל-WhatsApp (משתמש באותו API). נחבר את ה-connector לפרויקט.

### 2. הוספת שדה `notify_whatsapp` לטבלת profiles
מיגרציה שמוסיפה עמודה boolean לפרופיל התלמיד כדי שיוכל לבחור אם לקבל התראות בוואטסאפ.

### 3. עדכון Edge Functions
הוספת שליחת WhatsApp ל-`notify-new-post` ו-`notify-live` באמצעות Twilio WhatsApp API דרך ה-gateway. הפורמט דומה ל-SMS אבל עם prefix של `whatsapp:` למספר הטלפון.

### 4. עדכון ממשק הגדרות התלמיד
הוספת toggle "התראות WhatsApp" ליד ה-toggles הקיימים של SMS ואימייל.

## פרטים טכניים

**Twilio WhatsApp API** — שימוש באותו endpoint של SMS (`/Messages.json`) עם:
- `To: whatsapp:+972...`
- `From: whatsapp:+14155238886` (מספר ה-WhatsApp של Twilio)

**דרישות מצד Twilio:**
- חשבון Twilio עם WhatsApp Sandbox מופעל (לבדיקות) או WhatsApp Business sender מאושר (לפרודקשן)
- מספר WhatsApp sender (שונה ממספר ה-SMS)

**Secret חדש:** `TWILIO_WHATSAPP_FROM` — מספר WhatsApp sender

