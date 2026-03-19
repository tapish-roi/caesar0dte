
## שתי בעיות ופתרונן

### בעיה 1 — תוכן המייל: "איפוס סיסמה" במקום "הזמנה לקהילה"

הסיבה: כאשר ה-edge function קוראת ל-`inviteUserByEmail`, Supabase שולח את תבנית ברירת המחדל שלו שנראית כמו איפוס סיסמה (כי לא הוגדרה תבנית מותאמת). כדי לשנות את תוכן המייל צריך לגדיר תבניות email מותאמות.

**הפתרון:** להקים תבניות email מותאמות דרך מנגנון ה-auth email templates, ולהתאים את תבנית ה-`invite` לתוכן הנכון ("הוזמנת לקהילה של [שם מנטור]").

---

### בעיה 2 — כפתור במייל מוביל ל"מאמת את ההזמנה" ונתקע

הסיבה: הכפתור ממייל ההזמנה מכיל URL עם `#access_token=...&type=invite` ב-hash. Supabase Gotrue מעבד את ה-token אוטומטית ב-`onAuthStateChange`. אם עמוד ה-`/accept-invite` נטען לפני ש-Supabase מסיים לעבד את ה-token, נוצר מצב שבו:
- הדף מחכה ל-`sessionReady = true`
- ה-`AuthContext` כבר מגיב לסשן ומנתב את המשתמש לדשבורד
- התוצאה: `loading = true` לנצח כי `AuthContext.loading` מסיים עבודה לפני ש-`AcceptInvitePage` רואה את הסשן

**שורש הבעיה הספציפי:** כשמשתמש חדש לוחץ על כפתור ההזמנה במייל, URL נראה כך:
```
https://tradelearning.lovable.app/accept-invite?mentor=X#access_token=...&type=invite
```
ה-`AuthContext` קורא `onAuthStateChange` ומזהה סשן חדש עם `event = SIGNED_IN`. הוא טוען role → מוצא `student` → מנתב את המשתמש ל-`/` (StudentDashboard) — לפני שהמשתמש הספיק לבחור סיסמה.

---

## תוכנית הפתרון

### תיקון 1 — שינוי תוכן המייל

**א.** אין domain מוגדר, כך שלא ניתן להתאים תבניות email מובנות עכשיו.

**ב.** כחלופה: שלוח מייל מותאם דרך ה-edge function עצמה (בלי להסתמך על מייל של Supabase). במקום `inviteUserByEmail` שמשתמש בתבנית של Supabase, נשתמש ב:
1. `adminClient.auth.admin.createUser({ email, email_confirm: false })` — יוצר משתמש בלי לשלוח מייל
2. יצירת OTP token ידני לסוג `invite` דרך `adminClient.auth.admin.generateLink({ type: 'invite', email, redirectTo })`
3. שליחת מייל מותאם עם הקישור

---

### תיקון 2 — תיקון ה-flow של `/accept-invite`

הבעיה האמיתית: כשהתלמיד מגיע מהמייל, `AuthContext` מזהה סשן ומנתב ל-dashboard לפני שהמשתמש בחר סיסמה.

**הפתרון:**
- זיהוי שה-URL מכיל `type=invite` ב-hash → לא לנתב לדשבורד, לתת ל-`AcceptInvitePage` לטפל בזה
- שינוי ב-`App.tsx`: כשה-URL מכיל `type=invite` בהאש — תמיד להציג את `AcceptInvitePage` גם אם יש משתמש מחובר
- שינוי ב-`AcceptInvitePage`: במקום לחכות לסשן קיים (שנוצר אוטומטית מה-token) — המשתמש מזין מייל + סיסמה → מחבר עם `signInWithPassword` → אם מצליח, מעדכן סיסמה → ממשיך

**גישה חדשה יותר נכונה לדף accept-invite:**

כשתלמיד מגיע מהמייל, הוא כבר מחובר אוטומטית (Supabase מעבד את token). אבל הניתוב ב-`AuthContext` מקדים אותו לדשבורד. הפתרון:

1. **ב-`AuthContext`**: להוסיף בדיקה — אם event הוא `SIGNED_IN` ו-URL מכיל `type=invite` ב-hash, לא לנתב (לשמור `loading = false` אך לאפשר ל-route לטפל)
2. **ב-`App.tsx`**: לתת עדיפות ל-`/accept-invite` גם כשהמשתמש מחובר — route זה יקדים את ה-redirect לדשבורד
3. **ב-`AcceptInvitePage`**: הסרת מצב "מאמת את ההזמנה" כ-default — במקומו להציג טופס ישירות עם שדה מייל + סיסמה + אישור סיסמה, שמאפשר לתלמיד להירשם/להתחבר

**הגישה הפשוטה ביותר (ללא תלות ב-token flow):**

שנה את `AcceptInvitePage` כך שיציג תמיד את הטופס מיד (ללא המתנה לסשן):
- שדה מייל (מאוכלס מ-query param אם קיים, אחרת ריק)
- שדה סיסמה
- כפתור "הצטרף לקהילה"

בלחיצה: קודם `signInWithPassword`. אם מצליח (משתמש כבר קיים עם session מה-token) → `updateUser({ password })` → navigate. אם נכשל → נסה `signUp` → navigate.

---

## קבצים לשינוי

**`supabase/functions/invite-student/index.ts`:**
- שימוש ב-`generateLink` במקום `inviteUserByEmail` כדי לשלוח מייל עם תוכן מותאם (שם מנטור, הודעת הזמנה לקהילה), לא "איפוס סיסמה"

**`src/pages/AcceptInvitePage.tsx`:**
- הסרת ה-"מאמת את ההזמנה" loading state
- הצגת טופס מיד: שדה מייל + סיסמה + אישור סיסמה
- לוגיקה: קבלת מייל מ-URL param (`?email=...`) שיעביר ה-edge function
- כשהמשתמש שולח: sign-in עם הסיסמה החדשה, אם הסשן קיים מה-token → `updateUser({ password })`, אחרת → try sign-in / sign-up
- רישום אוטומטי ל-`community_members` של המנטור מ-URL param

**`src/App.tsx`:**
- העברת `/accept-invite` לפני הבדיקה של authenticated user כדי שהדף תמיד יוצג גם אם יש סשן קיים
