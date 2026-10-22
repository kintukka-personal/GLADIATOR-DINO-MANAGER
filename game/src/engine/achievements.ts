// Achievements (Amber rewards). OWNER: systems-story agent. GM 03 §11 + breeding achievements.
import type { AchievementId, GameState } from './types';

export interface AchievementDef { id: AchievementId; name: string; desc: string; amber: number; hidden?: boolean }
export const ACHIEVEMENTS: Record<AchievementId, AchievementDef> = {} as Record<AchievementId, AchievementDef>;
/** Weekly checks (GM checkAchievements) pushing into state.pendingAchievements. */
export function checkAchievements(state: GameState): void { throw new Error('not implemented'); }
