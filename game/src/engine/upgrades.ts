// Meta upgrades bought with Amber (GM's 56 gem upgrades, renamed). OWNER: systems-story agent. GM 06 §2.3.
//
// GM costs, categories, parents and "locked by" achievements are kept. The GM quality-of-life upgrades
// (Hard Mode, Instructions, Tactician, Auto Manage by Doctore, More Save Slots, Cloud Sync, Gladiator Editor)
// are free in Jurassic Ludus and are not in UpgradeId (DESIGN §8), so Nightmare Mode has no Hard Mode parent.
// Two breeding upgrades are new: Geneticist and Mutagen Lab.
import type { AchievementId, Meta, UpgradeId } from './types';
import { ACHIEVEMENTS } from './achievements';

export interface UpgradeDef { id: UpgradeId; name: string; category: 'creatures' | 'general' | 'events' | 'equipment' | 'buildings' | 'breeding'; cost: number; parent?: UpgradeId; lockedBy?: AchievementId; desc: string }

const U = (id: UpgradeId, name: string, category: UpgradeDef['category'], cost: number, desc: string, extra: { parent?: UpgradeId; lockedBy?: AchievementId } = {}): UpgradeDef =>
  ({ id, name, category, cost, desc, ...extra });

const LIST: UpgradeDef[] = [
  // ------------------------------------------------------------------ creatures & techniques (GM "Gladiator", 9)
  U('weaponsMaster', 'Weapons Master', 'creatures', 100, 'Hire a specialised harness trainer. Weapon specialisation grants a damage bonus.'),
  U('rallyTechnique', 'Rallying Call', 'creatures', 100, 'Rallying Call technique: the pack shrugs off some damage and one affliction for 2 rounds.'),
  U('disarmTechnique', 'Tear Harness', 'creatures', 100, 'A cunning technique that rips the weapon harness off a foe.'),
  U('greatSpiculus', 'The Great Spiculus', 'creatures', 100, 'The legendary champion Spiculus can appear in tournaments. Defeat him and he joins the winner.'),
  U('ambushTechnique', 'Ambush', 'creatures', 100, 'A beast technique: big damage against impaired fighters, then extra dodge.', { lockedBy: 'assassin' }),
  U('spitters', 'Spitters', 'creatures', 100, 'The Spitter fighting style (Venom Spitter), the Venom Barrage technique, marksman training and Apollo\'s contest.', { lockedBy: 'adventurer' }),
  U('brawlers', 'Brawlers', 'creatures', 150, 'The Brawler fighting style (Iron Jaws), Spartan Primal Bouts and the Jaw Crunch technique.', { lockedBy: 'student' }),
  U('thunderStrike', 'Thunderstrike', 'creatures', 100, 'A technique that scales with divine favour. Also unlocks Bottled Lightning.', { lockedBy: 'favoured' }),
  U('lashers', 'Lashers', 'creatures', 100, 'The Lasher fighting style (Barbed Tail-Whip). Rivals may ask your doctore to train their dinos.', { lockedBy: 'influencer' }),

  // ------------------------------------------------------------------ general
  U('senatorTree', 'Senator Influence Tree', 'general', 250, 'The whole Senator branch of the influence tree, including the elections path.'),
  U('nightmareMode', 'Nightmare Mode', 'general', 200, 'Nightmare difficulty: score ×3 and extra achievements.', { lockedBy: 'divineHard' }),
  U('releaseBeast', 'Release Arena Beast', 'general', 100, 'A bribe option that lets a wild beast loose on your opponent.'),
  U('woollyRhinos', 'Woolly Rhinos', 'general', 150, 'Woolly rhinos in the market and through events.'),
  U('warMammoths', 'War Mammoths', 'general', 250, 'Mammoths as beasts. They terrify mounted riders.'),
  U('ascendancy', 'Ascendancy', 'general', 100, 'Your reincarnated champion keeps an extra trait and gains tameness early in the run.', { lockedBy: 'ascension' }),
  U('greekHeritage', 'Greek Heritage', 'general', 150, 'Greek lanista: starts with a Bash Plate, and dinos learn traits faster.'),
  U('egyptianAncestry', 'Egyptian Ancestry', 'general', 200, 'Egyptian heritage plus the Tomb of the Pharaoh questline.', { parent: 'greekHeritage' }),
  U('undyingLoyalty', 'Undying Loyalty', 'general', 150, 'Your favourite beast reincarnates alongside your champion.', { lockedBy: 'divine' }),

  // ------------------------------------------------------------------ events
  U('travelingMerchant', 'Traveling Merchant', 'events', 100, 'A periodic visit from an exotic merchant.'),
  U('legendsOfMars', 'Legends of Mars', 'events', 150, 'A grand tournament whose prize is the Talons of Mars.'),
  U('lostBlade', 'The Lost Talons', 'events', 150, 'A Britannia event chain for Caesar\'s talons, Crocea Mors.'),
  U('founderAxe', 'Club of the Founder', 'events', 150, 'An epic event chain for Romulus\' tail club.'),
  U('bacchusLeague', 'League of Bacchus', 'events', 150, 'The Bacchus league.'),
  U('vulcanLeague', 'Vulcan League', 'events', 150, 'The Vulcanalia league, with divine barding as the prize.'),
  U('carthaginianArtifacts', 'Carthaginian Artifacts', 'events', 150, 'Carthaginian crests in the market, and the Ksour Essef barding storyline.'),
  U('hannibalsLegacy', 'Hannibal\'s Legacy', 'events', 150, 'Hannibal\'s relic challenges.', { parent: 'carthaginianArtifacts' }),
  U('legacyOfAlexander', 'Legacy of Alexander', 'events', 150, 'Quilted Barding plus the Macedonian rebels quest for Alexander\'s Barding.'),
  U('legendaryPits', 'Legendary Pit Fights', 'events', 100, 'Legendary figures in the underground pits.', { lockedBy: 'colossusSlayer' }),
  U('spartanDynasty', 'Spartan Dynasty', 'events', 200, 'Spartan events, a special dino, the Impale technique, a new trait and Leg Plates.', { parent: 'bashPlate' }),
  U('restorationOfTroy', 'Restoration of Troy', 'events', 150, 'A Troy escort, Hector\'s visit and the Trojan Games with Trojan relics.', { lockedBy: 'colossusSlayer' }),

  // ------------------------------------------------------------------ equipment
  U('championsCrest', 'Champion\'s Crest', 'equipment', 100, 'A family heirloom crest, wearable only by your bonded dino.'),
  U('greatTalons', 'Great Talons', 'equipment', 100, 'Great Talons in the market and forge.'),
  U('venomFangs', 'Venom Fangs', 'equipment', 50, 'Venom Fangs in the market and forge.'),
  U('sickleClaws', 'Sickle Claws', 'equipment', 100, 'Sickle Claws in the market and forge.'),
  U('bashPlate', 'Bash Plate', 'equipment', 100, 'Bash Plates, plus hints about the Shield of Leonidas.'),
  U('studdedBarding', 'Studded Barding', 'equipment', 100, 'Studded Barding in the market and forge.'),
  U('hornedHelm', 'Horned Helm', 'equipment', 50, 'Horned Helms in the market and forge.'),
  U('legionBarding', 'Legion Barding & Faceplate', 'equipment', 150, 'Legion barding and faceplates.'),
  U('celticRiders', 'Celtic Riders', 'equipment', 200, 'Celtic Spearman riders plus the jousting challenge for Lugh of Hibernia.'),
  U('therizinArsenal', 'Therizin Arsenal', 'equipment', 100, 'Scythe Claws and the Strapped Buckler.'),
  U('ascendedWeaponry', 'Ascended Weaponry', 'equipment', 150, 'Start each Ascension with a broken, time-warped weapon of your champion\'s favoured type.', { lockedBy: 'ascension' }),
  U('cataphracts', 'Cataphracts', 'equipment', 100, 'Cataphract barding.'),

  // ------------------------------------------------------------------ buildings
  U('templeOfPluto', 'Temple of Pluto', 'buildings', 150, 'A temple with bonuses and Pluto\'s favour, which enables resurrection in the Tomb.'),
  U('masterSmith', 'Master Smith', 'buildings', 150, 'Forge level 2: better forging and improving existing harness.'),
  U('supremeArmory', 'Supreme Armory', 'buildings', 150, 'Forge level 3: master-crafted harness and augments.', { parent: 'masterSmith' }),
  U('aqueduct', 'Aqueduct', 'buildings', 150, 'An Aqueduct in Ariminium.', { lockedBy: 'builder' }),
  U('athenianArtifacts', 'Athenian Artifacts', 'buildings', 200, 'Pericles\' visor mystery, a private library and the Corinthian Visor.'),
  U('tinkerersWorkshop', 'Tinkerer\'s Workshop', 'buildings', 150, 'A workshop that crafts rare combat items.', { lockedBy: 'apprentice' }),
  U('romeMansion', 'All Roads Lead to Rome', 'buildings', 150, 'A Rome mansion estate with influence buildings.', { lockedBy: 'builder' }),

  // ------------------------------------------------------------------ breeding (Jurassic Ludus)
  U('geneticist', 'Geneticist', 'breeding', 150, 'A keeper who reads bloodlines: reveals wild points and egg genetics, and +0.5% mutation chance.'),
  U('mutagenLab', 'Mutagen Lab', 'breeding', 200, 'Brew Mutagen: +1 wild point to STR, AGI and HP and +1 to both mutation counters.', { lockedBy: 'mutant' }),
];

export const UPGRADES: Record<UpgradeId, UpgradeDef> = Object.fromEntries(LIST.map((u) => [u.id, u])) as Record<UpgradeId, UpgradeDef>;

export const UPGRADE_IDS = LIST.map((u) => u.id);

/** Total Amber needed to own everything. */
export function upgradeCatalogueCost(): number {
  return LIST.reduce((s, u) => s + u.cost, 0);
}

/** Why an upgrade cannot be bought right now, ignoring the price (null = it can). */
export function upgradeLockReason(meta: Meta, id: UpgradeId): string | null {
  const d = UPGRADES[id];
  if (!d) return 'Unknown upgrade.';
  if (meta.upgrades.includes(id)) return 'Already unlocked.';
  if (d.parent && !meta.upgrades.includes(d.parent)) return `Requires ${UPGRADES[d.parent].name}.`;
  if (d.lockedBy && !meta.achievements.includes(d.lockedBy)) {
    const a = ACHIEVEMENTS[d.lockedBy];
    return `Locked: earn the achievement "${a?.name ?? d.lockedBy}".`;
  }
  return null;
}

/** Shown in the shop (parent owned, achievement earned); owned upgrades are visible too. */
export function upgradeVisible(meta: Meta, id: UpgradeId): boolean {
  const r = upgradeLockReason(meta, id);
  return r === null || meta.upgrades.includes(id);
}

/** null = can be bought now; otherwise the reason (owned, parent, achievement lock, not enough Amber). */
export function upgradeAvailable(meta: Meta, id: UpgradeId): string | null {
  const r = upgradeLockReason(meta, id);
  if (r) return r;
  const d = UPGRADES[id];
  if (amberBalance(meta) < d.cost) return `Needs ${d.cost} Amber (you have ${amberBalance(meta)}).`;
  return null;
}

/** Buy with Amber. Returns null on success, else the reason. */
export function buyUpgrade(meta: Meta, id: UpgradeId): string | null {
  const r = upgradeAvailable(meta, id);
  if (r) return r;
  meta.amber = amberBalance(meta) - UPGRADES[id].cost;
  meta.upgrades.push(id);
  return null;
}

export function amberBalance(meta: Meta): number {
  return Math.max(0, Math.floor(meta.amber ?? 0));
}

/** GM refundUpgrades: give back the Amber of every owned upgrade (children of refunded parents go too). */
export function refundUpgrades(meta: Meta): number {
  let back = 0;
  for (const id of meta.upgrades) back += UPGRADES[id]?.cost ?? 0;
  meta.upgrades = [];
  meta.amber = amberBalance(meta) + back;
  return back;
}
