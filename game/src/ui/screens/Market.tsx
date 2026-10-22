// Market tab [Market, SlaveMarketActivity, GoodsMarketActivity]: Dinos & Beasts (spy-gated intel),
// Goods (buy/sell, lock icons), Keepers, Eggs & Provisions, Rival offers.
import React, { useState } from 'react';
import type { Creature, Egg, FoodId, GameState, Gear, GearSlot } from '../../engine/types';
import { STATS } from '../../engine/types';
import { SPECIES } from '../../engine/data/species';
import { TRAITS } from '../../engine/data/traits';
import { GEAR, gearName, gearWorth } from '../../engine/data/gear';
import { FOODS, FOOD_IDS } from '../../engine/data/food';
import { ageLabel, getStat, lifePhase, marketPrice, wildLevel } from '../../engine/creature';
import { eggValue, eggVisible } from '../../engine/breeding';
import {
  acceptTransfer, buyCreature, buyEgg, buyFood, buyGear, declineTransfer, hireKeepers, intel, isLocked, marketCreaturePrice, marketGearPrice, sellGear,
  type MarketIntel,
} from '../../engine/market';
import { useStore } from '../store';
import { ScreenHead } from '../components/ScreenHead';
import { Tabs } from '../components/Tabs';
import { Btn, EmptyState, Hint, KV, Money, Panel, Pill, Plaque, Segmented } from '../components/primitives';
import { Sheet } from '../components/Sheet';
import { Icon, SexIcon } from '../components/Icon';
import { GearName, SLOT_ICON, SLOT_LABEL, SLOT_ORDER, gearLineText, wearerName } from '../components/GearPicker';
import { DinoArt, DinoThumb } from '../art/DinoArt';
import { EggArt } from '../art/EggArt';
import { safe } from '../safe';
import { spiesOf, keepersOf, totals } from '../derive';
import { STAT_SHORT, fmt, pct } from '../format';
import { houseById } from '../../engine/util';

export function MarketScreen() {
  const store = useStore();
  const g = store.game!;
  const tab = store.screen.tab ?? 'dinos';
  const mk = g.world.market;
  return (
    <>
      <ScreenHead title="Market" sub={`Capua forum · week ${g.world.week}`} back={false} actions={<Money value={g.player.ludus.denarii} />} />
      <Tabs id="market" label="Market sections" value={tab} onChange={(t) => store.nav.update({ tab: t })}
        items={[
          { id: 'dinos', label: 'Dinos & Beasts', icon: 'paw', badge: mk.creatures.length || undefined },
          { id: 'goods', label: 'Goods', icon: 'shield' },
          { id: 'keepers', label: 'Keepers', icon: 'keeper' },
          { id: 'eggs', label: 'Eggs & Food', icon: 'egg' },
          { id: 'offers', label: 'Offers', icon: 'coin', badge: g.player.offers.length || undefined },
        ]} />
      {tab === 'dinos' && <Creatures />}
      {tab === 'goods' && <Goods />}
      {tab === 'keepers' && <Keepers />}
      {tab === 'eggs' && <Eggs />}
      {tab === 'offers' && <Offers />}
    </>
  );
}

function localIntel(g: GameState, c: Creature): MarketIntel {
  const s = spiesOf(g);
  return { age: s >= 1, species: true, str: s >= 2, agi: s >= 3, cun: s >= 5, hp: s >= 7, traits: s >= 8 ? Math.min(c.traits.length, s - 7) : 0, wild: g.unlocks.includes('geneticist') };
}

function creatureLocked(g: GameState, c: Creature): boolean {
  const up = SPECIES[c.species].upgrade;
  return safe(() => isLocked(g, c), !!up && !g.unlocks.includes(up) && !g.world.difficulty.sandbox);
}

function gearLocked(g: GameState, x: Gear): boolean {
  const up = GEAR[x.type].upgrade;
  return safe(() => isLocked(g, x), !!up && !g.unlocks.includes(up) && !g.world.difficulty.sandbox);
}

const Q = () => <span className="hidden-stat" title="Hidden: needs more committed spies">?</span>;

function StatLine({ c, iv }: { c: Creature; iv: MarketIntel }) {
  return (
    <span className="stat-mini">
      {STATS.map((s) => <span key={s}>{STAT_SHORT[s]} {iv[s] ? <b>{getStat(c, s)}</b> : <Q />}</span>)}
    </span>
  );
}

function Creatures() {
  const store = useStore();
  const g = store.game!;
  const mk = g.world.market;
  const spies = spiesOf(g);
  const [open, setOpen] = useState<Creature | null>(null);
  const price = (c: Creature) => safe(() => marketCreaturePrice(g, c), safe(() => marketPrice(c), 0));
  const buy = (c: Creature) => store.act((s) => buyCreature(s, c.id), { ok: `${c.name} joins ${s0(g)}.` });
  const list = [...mk.creatures];
  return (
    <div className="stack">
      <Hint icon="spy">
        {spies} committed spy{spies === 1 ? '' : 'ies'}: {spies >= 7 ? 'every stat is visible' : spies >= 1 ? 'some stats are visible' : 'only species and looks are visible'}. Spies reveal age (1), STR (2), AGI (3), CUN (5), HP (7) and traits (8+).
      </Hint>
      <Panel flush label="Dinos & beasts" title={`${list.length} for sale`}>
        {list.length === 0 && <EmptyState icon="paw" title="The pens are empty">New stock arrives every week.</EmptyState>}
        {list.map((c) => {
          const iv = safe(() => intel(g, c), localIntel(g, c));
          const locked = creatureLocked(g, c);
          const p = price(c);
          return (
            <div key={c.id} className={`offer${locked ? ' locked' : ''}`}>
              <button type="button" className="link-plain" onClick={() => setOpen(c)} aria-label={`Inspect ${c.name}`}><DinoThumb creature={c} size={56} /></button>
              <button type="button" className="link-plain" onClick={() => setOpen(c)} style={{ minWidth: 0 }}>
                <div className="row gap-1 strong">{locked && <Icon name="lock" size={14} />}<span className="ellipsis">{c.name}</span><SexIcon sex={c.sex} size={14} />{c.epic && <Pill tone="amber">Epic</Pill>}{c.legend && <Pill tone="amber" icon="star">Legend</Pill>}</div>
                <div className="xs muted">{SPECIES[c.species].name} · Lv {c.level} · {iv.age ? `${lifePhase(c)}, ${ageLabel(c)}` : 'age ?'}</div>
                <StatLine c={c} iv={iv} />
                <div className="row gap-1 wrap mt-1">
                  {c.traits.slice(0, iv.traits).map((t) => <Pill key={t} tone="muted">{TRAITS[t]?.name ?? t}</Pill>)}
                  {c.traits.length > iv.traits && <Pill tone="muted">{c.traits.length - iv.traits} hidden trait{c.traits.length - iv.traits > 1 ? 's' : ''}</Pill>}
                </div>
              </button>
              <div className="col gap-1" style={{ alignItems: 'flex-end' }}>
                <Money value={p} />
                <Btn id={`buy-c-${c.id}`} size="sm" variant="primary" disabled={locked || g.player.ludus.denarii < p} onClick={() => (locked ? store.nav.push({ name: 'upgrades' }) : buy(c))}>{locked ? 'Locked' : 'Buy'}</Btn>
              </div>
            </div>
          );
        })}
      </Panel>
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.name} label={open ? SPECIES[open.species].name : ''}
        footer={open ? <div className="row between gap-2"><Money value={price(open)} size="lg" /><Btn variant="primary" icon="coin" disabled={creatureLocked(g, open)} onClick={() => { const r = buy(open); if (r === null) setOpen(null); }}>Buy</Btn></div> : undefined}>
        {open && (() => {
          const iv = safe(() => intel(g, open), localIntel(g, open));
          return (
            <div className="stack">
              <div className="hero" style={{ border: 0 }}><div className="hero-art"><DinoArt creature={open} width={260} /></div></div>
              <p className="small muted">{SPECIES[open.species].flavour}</p>
              <div className="grid-2">
                <KV k="Level">{open.level}</KV>
                <KV k="Age">{iv.age ? `${lifePhase(open)} · ${ageLabel(open)}` : <Q />}</KV>
                {STATS.map((s) => <KV key={s} k={STAT_SHORT[s]}>{iv[s] ? getStat(open, s) : <Q />}</KV>)}
                <KV k="Wild level">{iv.wild ? wildLevel(open) : <Q />}</KV>
                <KV k="Fame">{open.fame}</KV>
              </div>
              <div className="small"><b>Bonus:</b> {SPECIES[open.species].basicBonus}</div>
            </div>
          );
        })()}
      </Sheet>
    </div>
  );
}

function s0(g: GameState): string {
  return g.player.ludus.name;
}

function Goods() {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const [mode, setMode] = useState<'buy' | 'sell'>('buy');
  const [slot, setSlot] = useState<GearSlot | 'all'>('all');
  const src = mode === 'buy' ? g.world.market.gear : me.armory;
  const list = src.filter((x) => slot === 'all' || GEAR[x.type]?.slot === slot);
  const price = (x: Gear) => (mode === 'buy' ? safe(() => marketGearPrice(g, x), gearWorth(x)) : Math.floor(gearWorth(x) / 2));
  const act = async (x: Gear) => {
    if (mode === 'buy') {
      if (gearLocked(g, x)) { store.nav.push({ name: 'upgrades' }); return; }
      store.act((s) => buyGear(s, x.id), { ok: `Bought ${gearName(x)}.` });
    } else {
      const ok = await store.confirm({ title: `Sell ${gearName(x)}?`, confirmLabel: 'Sell', danger: true });
      if (ok) store.act((s) => sellGear(s, x.id), { ok: `Sold ${gearName(x)}.` });
    }
  };
  return (
    <div className="stack">
      <div className="row gap-2 wrap">
        <Segmented id="goods-mode" label="Buy or sell" value={mode} onChange={setMode} options={[{ value: 'buy', label: 'Buy' }, { value: 'sell', label: 'Sell' }]} />
        <Segmented id="goods-slot" label="Slot" size="sm" value={slot} onChange={setSlot} options={[{ value: 'all', label: 'All' }, ...SLOT_ORDER.map((s) => ({ value: s, label: SLOT_LABEL[s] }))]} />
      </div>
      {mode === 'buy' && (me.buildings.saddlery ?? 0) === 0 && (slot === 'rider' || slot === 'all') && <Hint icon="rider">Riders need a Saddlery before they can be bought.</Hint>}
      <Panel flush>
        {list.length === 0 && <EmptyState icon="shield" title={mode === 'buy' ? 'Nothing on the stalls' : 'Nothing to sell'}>{mode === 'buy' ? 'The traders bring new goods every week. Spies improve what they bring.' : 'Your armory is empty.'}</EmptyState>}
        {list.map((x) => {
          const locked = mode === 'buy' && gearLocked(g, x);
          const p = price(x);
          const who = mode === 'sell' ? wearerName(me, x.id) : undefined;
          return (
            <div key={x.id} className={`offer${locked ? ' locked' : ''}`}>
              <span className="bld-ic" style={{ width: 40, height: 40 }}><Icon name={locked ? 'lock' : SLOT_ICON[GEAR[x.type].slot]} size={18} /></span>
              <div style={{ minWidth: 0 }}>
                <div className="row gap-1 wrap"><GearName g={x} />{who && <Pill tone="muted">{who}</Pill>}</div>
                <div className="xs muted num">{gearLineText(x)}</div>
                {locked && <div className="xs bad row gap-1"><Icon name="lock" size={12} />Needs an Amber upgrade</div>}
              </div>
              <div className="col gap-1" style={{ alignItems: 'flex-end' }}>
                <Money value={p} />
                <Btn size="sm" variant={mode === 'buy' ? 'primary' : 'default'} disabled={mode === 'buy' && !locked && me.denarii < p} onClick={() => act(x)}>{locked ? 'Unlock' : mode === 'buy' ? 'Buy' : 'Sell'}</Btn>
              </div>
            </div>
          );
        })}
      </Panel>
    </div>
  );
}

function Keepers() {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const k = g.world.market.keepers;
  const beds = totals(me).beds;
  const have = keepersOf(me);
  return (
    <div className="cols">
      <Plaque label="Keepers for hire" title={`${k.count} available this week`}>
        <div className="row between gap-3 wrap">
          <div>
            <div className="micro">Price each</div>
            <Money value={k.price} size="lg" />
            <div className="xs muted mt-1">The price rises with every hire.</div>
          </div>
          <div className="row gap-2">
            {[1, 3, 5].map((n) => (
              <Btn key={n} id={`hire-${n}`} variant={n === 1 ? 'primary' : 'default'} disabled={k.count < n || me.denarii < k.price * n} onClick={() => store.act((s) => hireKeepers(s, n), { ok: `${n} keeper${n > 1 ? 's' : ''} hired.` })}>Hire {n}</Btn>
            ))}
          </div>
        </div>
      </Plaque>
      <Panel label="Your keepers" title={`${have} keepers`} actions={<Btn size="sm" onClick={() => store.nav.area('finance')}>Assign jobs</Btn>}>
        <KV k="Beds">{beds}</KV>
        <KV k="Upkeep">2 a week each (4 beyond the beds)</KV>
        <KV k="Unassigned">{me.keepers.unassigned}</KV>
        <Hint icon="keeper">Miners earn denarii, showmen earn influence, wardens keep your dinos tame and the gates shut, spies watch the market and your rivals.</Hint>
      </Panel>
    </div>
  );
}

function Eggs() {
  const store = useStore();
  const g = store.game!;
  const eggs = g.world.market.eggs;
  const priceOf = (e: Egg) => e.price ?? eggValue(e);
  return (
    <div className="stack">
      <Panel flush label="Fertilized eggs" title={eggs.length ? `${eggs.length} on offer` : 'None this week'}>
        {eggs.length === 0 && <div className="empty small muted">Egg traders come and go. Check again next week.</div>}
        {eggs.map((e) => {
          const vis = safe(() => eggVisible(g, e), e.known);
          const sp = SPECIES[e.species];
          return (
            <div key={e.id} className="egg-card">
              <div className="egg-niche"><EggArt egg={e} size={50} /></div>
              <div className="stack-sm" style={{ minWidth: 0 }}>
                <div className="strong">{sp.name} egg</div>
                <div className="xs muted">Needs {sp.incubWeeks} week{sp.incubWeeks > 1 ? 's' : ''} at {sp.tempRange[0]}–{sp.tempRange[1]}°C · health {pct(e.health)}</div>
                {vis && e.genes ? (
                  <div className="row gap-2 wrap xs">{e.sex && <SexIcon sex={e.sex} size={13} />}<Pill tone="amber">Wild {wildLevel({ genes: e.genes })}</Pill><span className="stat-mini">{STATS.map((s) => <span key={s}>{STAT_SHORT[s]} <b>{e.genes!.wild[s]}</b></span>)}</span></div>
                ) : (
                  <span className="xs muted row gap-1"><Icon name="lock" size={12} />Genetics hidden (3 committed spies or the Geneticist)</span>
                )}
              </div>
              <div className="col gap-1" style={{ alignItems: 'flex-end' }}>
                <Money value={priceOf(e)} />
                <Btn id={`buy-egg-${e.id}`} size="sm" variant="primary" disabled={g.player.ludus.denarii < priceOf(e)} onClick={() => store.act((s) => buyEgg(s, e.id), { ok: 'The egg goes to your hatchery.' })}>Buy</Btn>
              </div>
            </div>
          );
        })}
      </Panel>
      <Panel flush label="Provisions" title="Food prices">
        {FOOD_IDS.map((f: FoodId) => (
          <div key={f} className="offer">
            <span className="food-ic"><Icon name={FOODS[f].kind === 'meat' ? 'meat' : FOODS[f].kind === 'berry' ? 'berries' : 'kibble'} size={18} /></span>
            <div style={{ minWidth: 0 }}>
              <div className="strong small">{FOODS[f].name} <span className="muted xs">· in pantry {g.player.ludus.pantry[f] ?? 0}</span></div>
              <div className="xs muted">{FOODS[f].desc}</div>
            </div>
            <div className="row gap-1">
              <Money value={g.world.market.foodPrices[f] ?? FOODS[f].price} size="sm" />
              <Btn size="sm" onClick={() => store.act((s) => buyFood(s, f, 1), { ok: `Bought ${FOODS[f].name}.` })}>Buy</Btn>
            </div>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function Offers() {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const offers = g.player.offers;
  if (!offers.length) return <Plaque><EmptyState icon="coin" title="No offers">Rivals send bids for creatures they want, or for those you mark &ldquo;Offer to rivals&rdquo;.</EmptyState></Plaque>;
  return (
    <Panel flush label="Rival offers" title={`${offers.length} open`}>
      {offers.map((o) => {
        const c = o.sell ? o.creature : me.creatures.find((x) => x.id === o.creatureId);
        const rival = houseById(g, o.rivalId);
        return (
          <div key={o.id} className="offer">
            {c ? <DinoThumb creature={c} size={52} /> : <span className="bld-ic"><Icon name="paw" /></span>}
            <div style={{ minWidth: 0 }}>
              <div className="strong">{o.sell ? `${rival?.name ?? 'A rival'} sells ${c?.name ?? 'a creature'}` : `${rival?.name ?? 'A rival'} wants ${c?.name ?? 'a creature'}`}</div>
              <div className="xs muted">{c ? `${SPECIES[c.species].name} · Lv ${c.level}` : ''} · expires week {o.expiresWeek}</div>
            </div>
            <div className="col gap-1" style={{ alignItems: 'flex-end' }}>
              <Money value={o.amount} />
              <div className="row gap-1">
                <Btn size="sm" variant="ghost" onClick={() => store.act((s) => { try { declineTransfer(s, o.id); } catch { s.player.offers = s.player.offers.filter((x) => x.id !== o.id); } return true; }, { ok: 'Offer declined.' })}>Decline</Btn>
                <Btn id={`accept-${o.id}`} size="sm" variant="primary" onClick={() => store.act((s) => acceptTransfer(s, o.id), { ok: 'Deal struck.' })}>Accept</Btn>
              </div>
            </div>
          </div>
        );
      })}
    </Panel>
  );
}
