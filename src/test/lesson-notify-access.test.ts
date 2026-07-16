import { describe, it, expect } from 'vitest';

// Mirrors the recipient filter in supabase/functions/notify-new-lesson/index.ts.
// Rule: a student with NO grants for this mentor sees ALL categories; a student
// WITH any grant sees only granted categories. Uncategorized lessons (null) go
// to everyone.
function recipients(
  studentIds: string[],
  grants: { student_id: string; category_id: string }[],
  lessonCategoryId: string | null,
): string[] {
  if (!lessonCategoryId) return [...studentIds]; // uncategorized → everyone
  const withAnyGrant = new Set<string>();
  const withThisCategory = new Set<string>();
  for (const g of grants) {
    withAnyGrant.add(g.student_id);
    if (g.category_id === lessonCategoryId) withThisCategory.add(g.student_id);
  }
  return studentIds.filter((sid) => !withAnyGrant.has(sid) || withThisCategory.has(sid));
}

describe('notify-new-lesson recipient access filter', () => {
  const students = ['A', 'B', 'C', 'D'];
  const grants = [
    { student_id: 'B', category_id: 'X' },          // B: only category X
    { student_id: 'C', category_id: 'Y' },          // C: only category Y
    { student_id: 'D', category_id: 'X' },          // D: X and Y
    { student_id: 'D', category_id: 'Y' },
    // A: no grants at all
  ];

  it('lesson in category Y → A (no grants, sees all), C and D (granted Y); NOT B (only X)', () => {
    expect(recipients(students, grants, 'Y').sort()).toEqual(['A', 'C', 'D']);
  });

  it('lesson in category X → A (sees all), B and D (granted X); NOT C (only Y)', () => {
    expect(recipients(students, grants, 'X').sort()).toEqual(['A', 'B', 'D']);
  });

  it('a student with a grant for a different category is excluded', () => {
    expect(recipients(students, grants, 'Y')).not.toContain('B');
  });

  it('uncategorized lesson goes to everyone', () => {
    expect(recipients(students, grants, null).sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('when nobody has any grants, everyone sees every category', () => {
    expect(recipients(students, [], 'Y').sort()).toEqual(['A', 'B', 'C', 'D']);
  });
});
