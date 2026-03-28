

# התאמת האפליקציה למובייל

## הבעיה
שני הדשבורדים (מנטור ותלמיד) בנויים עם sidebar קבוע ברוחב 256px (`w-64`) שתמיד מוצג. במסך טלפון (390px) ה-sidebar תופס 65% מהמסך ולא נשאר מקום לתוכן.

## הפתרון
הפיכת ה-sidebar ל-**bottom navigation bar** במובייל, והתאמת כל אזורי התוכן למסכים קטנים.

## שינויים עיקריים

### 1. StudentDashboard — מבנה מובייל
- **Sidebar**: מוסתר במובייל (`hidden md:flex`), מוחלף ב-bottom tab bar קבוע עם 4 טאבים (שיעורים, קהילה, לייב, שאלות)
- **Header מובייל**: שורה עליונה עם לוגו, שם הקהילה, ואייקון הגדרות פרופיל
- **Lesson View Mode במובייל**: ה-sidebar של רשימת השיעורים הופך ל-sheet/drawer שנפתח מלמטה, או שרשימת השיעורים מוצגת מעל ה-player
- **Content padding**: `p-8` → `p-4 md:p-8`
- **פרופיל popup**: במובייל ייפתח כ-full-screen sheet במקום popover קטן

### 2. MentorDashboard — מבנה מובייל
- אותו עיקרון: sidebar מוסתר, bottom nav עם 6 טאבים (שיעורים, קהילה, תלמידים, לייב, שאלות, מבחנים) — ייתכן שנצמצם ל-5 עם "עוד"
- **Lesson View Mode**: ה-quiz panel (`w-80`) שמופיע בצד ירד מתחת לתוכן השיעור (`flex-col` במקום `flex-row`)
- **טפסים**: טופס יצירת שיעור, הזמנת תלמיד וכו' יותאמו לרוחב מלא

### 3. AuthPage
- בדיקה שדף ההתחברות כבר responsive (סביר שכן כי הוא פשוט יותר)

### 4. LiveViewer / LiveRoom
- התאמת ממדי הוידאו ל-portrait mode
- כפתורי ציור/סמנים מותאמים למגע

### 5. שינויים גלובליים
- שימוש ב-`useIsMobile()` hook שכבר קיים בפרויקט
- הוספת safe area padding לתחתית (bottom nav)
- וידוא שכל ה-dialogs/popovers מותאמים למובייל

## סדר עבודה
1. **StudentDashboard** — bottom nav + header + content padding (הכי נצפה ע"י משתמשים)
2. **MentorDashboard** — אותו pattern
3. **רכיבי תוכן פנימיים** — lesson view, community posts, profile popup
4. **Live components** — התאמת הוידאו והציור

## פרטים טכניים

```text
┌─────────────────────┐
│  Header (mobile)    │  ← לוגו + שם קהילה + settings
├─────────────────────┤
│                     │
│   Main Content      │  ← full width, scrollable
│                     │
├─────────────────────┤
│ 📚  👥  📻  ❓     │  ← bottom tab bar (fixed)
└─────────────────────┘
```

- Bottom nav: `fixed bottom-0 left-0 right-0` עם `pb-safe` (safe area)
- Main content: `pb-20 md:pb-0` לפינוי מקום ל-bottom nav
- Sidebar: `hidden md:flex w-64`
- Breakpoint: `md` (768px) — תואם את ה-`useIsMobile()` hook

