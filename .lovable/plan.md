

# תיקון טקסט וממשק שלא מותאמים למובייל

## הבעיה
במסך 390px, טקסטים ואלמנטים חורגים מהמקום שלהם כי הם תוכננו לרוחב דסקטופ (1000px+). הבעיות העיקריות:

## שינויים לפי אזור

### 1. ניהול תלמידים (MentorDashboard — students tab)
- **שורת תלמיד**: 4-5 אלמנטים בשורה אחת (אווטר + שם + תאריך הצטרפות + כפתור הרשאות + כפתור מחיקה) — לא נכנסים ב-390px
  - במובייל: שורת תלמיד הופכת ל-2 שורות — שם + אימייל בשורה ראשונה, תאריך + כפתורים בשורה שנייה (flex-wrap)
  - badge "הצטרף 19.3.2026" → קיצור ל-`19.3.26` בלבד
  - כפתורי עריכה/מחיקה: תמיד גלויים במובייל (לא opacity-0 group-hover)
- **טופס הזמנה**: `flex gap-2` עם input + button בשורה אחת → במובייל `flex-col` עם כפתור ברוחב מלא
- **פאנל הרשאות**: `w-[400px]` קבוע → `w-full md:w-[400px]` למובייל

### 2. קהילה ופוסטים (MentorDashboard + StudentDashboard — community)
- **שורת מטא של פוסט**: badge סוג + תאריך + 3 כפתורים (נעיצה/עריכה/מחיקה) → במובייל כפתורים יורדים שורה או הופכים לקומפקטיים יותר
- **Compose box**: כפתורי סוג פוסט (דיון / תמונה) — מתאים, לא צריך שינוי
- **תגובות**: בסדר — כבר flex עם min-w-0

### 3. כרטיסי שיעורים (LessonRow — MentorDashboard)
- שורת שיעור: drag handle + מספר + אייקון + שם + badges (לייב/צירוף) + דקות + 3 כפתורים → חורג ב-390px
  - במובייל: הסתר drag handle, הסתר כפתורי edit/delete (שימוש ב-long press או swipe בעתיד), הצג רק שם + אייקון סוג + published badge
  - badges (הוקלט בלייב / צירוף) → הסתר במובייל או הצג בשורה שנייה
- **שורת שיעורים של תלמיד** (StudentDashboard): תאריך + badge לייב + badge צירוף + דקות — כולם בשורה אחת → flex-wrap + הסתרת badges לא קריטיים

### 4. כותרות ולחצנים (lessons tab header)
- MentorDashboard lessons header: כותרת + 2 כפתורים (`קטגוריה חדשה` + `צור שיעור חדש`) → במובייל הכפתורים יורדים מתחת לכותרת (flex-wrap כבר קיים? צריך להוסיף)

### 5. שינויים גלובליים
- `group-hover:opacity-100` לא עובד במובייל (אין hover) → כל כפתורי פעולה שמסתתרים ב-hover יהיו תמיד גלויים במובייל

## פרטים טכניים

**קבצים לשינוי:**
- `src/pages/MentorDashboard.tsx` — students section, lessons header, LessonRow, access panel, community post header
- `src/pages/StudentDashboard.tsx` — lesson rows in expanded categories
- כל השינויים משתמשים ב-Tailwind responsive classes (`md:`) ובהוק `useIsMobile()` הקיים

**עיקרון:** כל אלמנט שיש בו יותר מ-3 items בשורה אחת → flex-wrap או הסתרה סלקטיבית במובייל. כפתורי hover → גלויים תמיד במובייל.

