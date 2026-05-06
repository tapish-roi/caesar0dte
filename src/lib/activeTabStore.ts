/**
 * activeTabStore — broadcasts the currently focused tab so the
 * SpaceUniverse background can swap planets in response to navigation
 * inside the mentor / student dashboards.
 *
 * Tab IDs intentionally include every value used by both dashboards:
 *   lessons | community | students | live | questions | quizzes
 *   | calculator | zoom | auth | journal | livestream | quiz
 *
 * "auth" is used on the AuthPage; "journal" / "livestream" / "quiz" are
 * used on top-level routes outside the dashboards. Anything not in this
 * list defaults to the lessons planet.
 */
import { create } from 'zustand';

export type PlanetId =
  | 'lessons'
  | 'community'
  | 'students'
  | 'live'
  | 'questions'
  | 'quizzes'
  | 'calculator'
  | 'zoom'
  | 'auth'
  | 'journal'
  | 'livestream'
  | 'quiz';

interface ActiveTabState {
  planet: PlanetId;
  setPlanet: (p: PlanetId) => void;
}

export const useActiveTab = create<ActiveTabState>((set) => ({
  planet: 'auth',
  setPlanet: (planet) => set({ planet }),
}));
