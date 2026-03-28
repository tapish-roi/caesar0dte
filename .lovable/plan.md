

## Problem

The "התחל מבחן" button doesn't change to "צפה בתוצאות" after a student completes a quiz. The code logic is correct, but when the student finishes a quiz on the `/quiz/:quizId` page and navigates back to the dashboard, the React Query cache still holds the old result (no submission found), so the button stays unchanged.

## Root Cause

The `LessonQuizButton` component uses `useQuery` with key `['student-lesson-quiz-submission', quiz?.id, studentId]` to check if a submission exists. After completing a quiz on the separate quiz page and navigating back, this cached query is never invalidated — so it returns stale `null` data.

## Solution

Two fixes in `src/pages/StudentDashboard.tsx`:

1. **Add `refetchOnMount: 'always'`** to the submission query inside `LessonQuizButton`, so every time the student returns to the dashboard and the component mounts, it re-fetches the submission status from the database.

2. **Add `staleTime: 0`** to ensure the data is always considered stale and re-fetched on mount.

This is a one-line change in the `useQuery` options for the submission query inside `LessonQuizButton`.

## Technical Detail

```typescript
// In LessonQuizButton, update the submission query:
const { data: submission } = useQuery({
  queryKey: ['student-lesson-quiz-submission', quiz?.id, studentId],
  queryFn: async () => { ... },
  enabled: !!quiz?.id && !!studentId,
  refetchOnMount: 'always',  // <-- ADD THIS
  staleTime: 0,              // <-- ADD THIS
});
```

