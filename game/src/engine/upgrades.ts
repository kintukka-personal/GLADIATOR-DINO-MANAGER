// Meta upgrades bought with Amber (GM's 56 gem upgrades, renamed). OWNER: systems-story agent. GM 06 §2.3.
import type { AchievementId, Meta, UpgradeId } from './types';

export interface UpgradeDef { id: UpgradeId; name: string; category: 'creatures' | 'general' | 'events' | 'equipment' | 'buildings' | 'breeding'; cost: number; parent?: UpgradeId; lockedBy?: AchievementId; desc: string }
export const UPGRADES: Record<UpgradeId, UpgradeDef> = {} as Record<UpgradeId, UpgradeDef>;
export function upgradeAvailable(meta: Meta, id: UpgradeId): string | null { throw new Error('not implemented'); }
export function buyUpgrade(meta: Meta, id: UpgradeId): string | null { throw new Error('not implemented'); }
export function amberBalance(meta: Meta): number { throw new Error('not implemented'); }
