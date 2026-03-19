
## הבעיה

כשהמנטור משתף מסך, ה-`<video ref={screenVideoRef}>` מוצג/מוסתר דרך `style={{ display: screenSharing ? 'block' : 'none' }}`.

הבעיה: כשהסטרים מוגדר (`screenVideoRef.srcObject = stream`) לפני שה-state מתעדכן ל-`screenSharing = true`, האלמנט עדיין ב-`display: none`. הדפדפן לא טוען את המטאדטה של הוידאו עד שהאלמנט גלוי — כך שה-video נשאר שחור גם לאחר מכן.

בנוסף, ה-canvas size sync ב-lines 596-603 מסתנכרן עם `screenVideoRef.offsetWidth/Height` שחזר 0 כאשר האלמנט היה עדיין מוסתר, כך שה-canvas נשאר בגודל 0×0.

## הפתרון

שני תיקונים ב-`LiveRoom.tsx`:

**תיקון 1 — הסדר בתוך `toggleScreenShare`:**
אחרי `getDisplayMedia`, קודם לקרוא `setScreenSharing(true)` ורק לאחר מכן לשייך את ה-stream ל-`srcObject` (או להשתמש ב-`requestAnimationFrame` / `setTimeout(0)` כדי לוודא שהרנדר קרה לפני השייוך).

**תיקון 2 — הימנע מ-`display: none` לאלמנט הוידאו:**
במקום `display: none / block`, להשתמש ב:
```tsx
style={{ 
  position: screenSharing ? 'relative' : 'absolute',
  visibility: screenSharing ? 'visible' : 'hidden',
  pointerEvents: screenSharing ? 'auto' : 'none'
}}
```
כך האלמנט תמיד נמצא ב-DOM ויכול לקבל את הסטרים גם לפני שהוא גלוי, ה-metadata תיטען כרגיל, וה-canvas sync יוכל לקרוא את המידות הנכונות.

**תיקון 3 — וידוא סנכרון canvas לאחר metadata:**
הוסיף `loadedmetadata` listener (כבר קיים בשורה 610) כ-async trigger שמפעיל את `syncSize` — לוודא שהגודל מסתנכרן לאחר שה-video מתחיל להציג.

## קובץ לשינוי

רק `src/components/LiveRoom.tsx`:
- שורות 1044-1057: שינוי `display` ל-`visibility` + `position`
- שורות 793-808: הזזת `setScreenSharing(true)` לפני השייוך ל-srcObject, עם `setTimeout` קצר

## דגשים
- לא נדרשים שינויים ב-database
- לא נדרשים שינויים בשאר הקומפוננטות
