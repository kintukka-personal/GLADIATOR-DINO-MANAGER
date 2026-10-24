// What needs the player's attention this week (hub list + badges). Stub-safe.
import type { GameState, StoryConversation } from '../../engine/types';
import { pendingAdventures, type AdventureResolution } from '../../engine/adventures';
import { safe } from '../safe';
import { eggAtRisk } from '../format';
import { committedSpies, weeklyNet } from '../../engine/economy';
import { hordeSize, raidArmyVsPlayer, raidDanger } from '../../engine/horde';
import { balance } from '../../engine/balance';

export interface Attention {
  decisions: number;
  conversation: StoryConversation | null;
  defenses: number;
  adventures: AdventureResolution[];
  care: number;
  eggsAtRisk: number;
  injured: number;
  ill: number;
  unread: number;
  objectives: number;
  offers: number;
  statPoints: number;
  /** weeks until the strongbox is empty at this week's balance (only when it is shrinking and ≤ 8) */
  runway: { weeks: number; net: number } | null;
  /** the Horde could break in: its raiding band beats roster/2 + security (numbers only with 2+ spies) */
  raidRisk: { known: boolean; army: number; defence: number } | null;
}

export function attention(g: GameState): Attention {
  const p = g.player;
  const me = p.ludus;
  return {
    decisions: p.decisions.length,
    // pure read: activeConversation() prunes/triggers stories, so the hub calls it inside an action
    conversation: p.conversations[0] ?? null,
    defenses: p.defenses.length,
    adventures: safe(() => pendingAdventures(g), [] as AdventureResolution[]),
    care: me.creatures.filter((c) => c.imprintRequest && !c.imprintRequest.done).length,
    eggsAtRisk: me.eggs.filter(eggAtRisk).length,
    injured: me.creatures.filter((c) => c.injury).length,
    ill: me.creatures.filter((c) => c.ill > 0).length,
    unread: p.messages.filter((m) => !m.read).length,
    objectives: p.objectives.filter((o) => o.done && !o.claimed).length,
    offers: p.offers.length,
    statPoints: me.creatures.filter((c) => c.statPoints > 0 && c.kind === 'dino').length,
    runway: safe(() => {
      const net = weeklyNet(g, me);
      if (net >= 0) return null;
      const weeks = Math.max(0, Math.floor(me.denarii / -net));
      return weeks <= 8 ? { weeks, net } : null;
    }, null),
    raidRisk: safe(() => {
      if (g.world.difficulty.raidsDisabled || hordeSize(g) < 3 || g.world.week < balance(g).raidGrace - 2) return null;
      const army = raidArmyVsPlayer(g);
      const danger = raidDanger(g, me, army);
      return danger > 0 ? { known: committedSpies(g, me) >= 2, army, defence: army - danger } : null;
    }, null),
  };
}
