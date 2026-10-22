// Story conversation texts (OWNER: systems-story agent). GM 04 §4, renamed for dinos.
// Spartacus is a Thracian Allosaurus who speaks to the lanista himself (it's that kind of game).
// Each builder returns the title, the lines (NPC lines first; lines with `choiceDependant` are the replies
// shown after the player picks that option) and the options.

import type { DecisionOption, StoryActor, StoryLine } from '../types';

export interface ConvText { title: string; lines: StoryLine[]; options: DecisionOption[] }

const L = (actor: StoryActor, text: string, choiceDependant?: number): StoryLine =>
  (choiceDependant === undefined ? { actor, text } : { actor, text, choiceDependant });
const O = (label: string, desc?: string): DecisionOption => (desc ? { label, desc } : { label });

// ---------------------------------------------------------------------------
// Act I — Solonius
// ---------------------------------------------------------------------------

export const soloniusOffer = (lanista: string, title: string): ConvText => ({
  title: 'A friendly word from Solonius',
  lines: [
    L('solonius', `Ah, ${title} ${lanista}! Welcome to Capua, home of the finest saurian bloodsport in the Republic. I see you have entered a dino in Rome's Finest.`),
    L('solonius', 'Quid pro quo, my friend. One of my dinos will meet yours on the sand, and you will make sure mine wins. A little limp, a lazy bite, a sudden interest in the crowd... Let\'s say 200 denarii?'),
    L('player', 'Make it 300 and we have a deal!', 0),
    L('solonius', '300! You bargain hard for someone whose pens still smell of fresh straw. Lose to me, and the coins will find their way into your hands.', 0),
    L('player', 'Keep your bribe, Solonius, or my foot will make its way into your arse!', 1),
    L('solonius', 'Such language! You will regret this. Capua has long teeth, and longer memories.', 1),
  ],
  options: [O('Make it 300 and we have a deal!', 'Throw your match against Solonius for 300 denarii (opinion +5).'),
    O('My foot will make its way into your arse!', 'Refuse (opinion −10).')],
});

export const SOLONIUS_TAUNT = (title: string, lanista: string) => `Need I remind you of our deal, ${title} ${lanista}? Make sure your dino loses!`;

// ---------------------------------------------------------------------------
// Rival-lanista storylines
// ---------------------------------------------------------------------------

export const loanAsk = (rival: string): ConvText => ({
  title: 'A small favour',
  lines: [
    L('narrator', `${rival} arrives at your gate with a smile that does not reach his eyes.`),
    L('unknown', 'My friend! These are difficult times. The meat merchants want paying, the keepers want paying, and my Allosaurus ate the accountant.'),
    L('unknown', 'Loan me the small sum of 300 denarii and I will return it with 100 denarii interest. You have my word as a Roman!'),
    L('unknown', 'You are a true friend! I will not forget this.', 0),
    L('unknown', 'I understand... I suppose. Times are hard for all of us.', 1),
    L('unknown', 'A well! How dare you! You will regret mocking me.', 2),
  ],
  options: [O('Lend him 300 denarii', 'He promises 400 back (opinion +15).'), O('I am afraid I cannot spare it', 'Opinion −5.'),
    O('I\'d rather throw the money into a well', 'Opinion −15.')],
});

export const loanRepay = (rival: string): ConvText => ({
  title: 'Debts and honour',
  lines: [
    L('unknown', `Fortune has smiled on House ${rival} once more! I am here to repay the 300 denarii you so kindly lent me.`),
    L('unknown', 'Generous as ever! Capua needs more lanistae like you.', 0),
    L('unknown', 'So I did... Here are your 400 denarii. Every last coin of them.', 1),
  ],
  options: [O('300 is fine, friend', 'Opinion +5.'), O('I believe you promised 400', '+400 denarii, opinion −5.')],
});

export const murderPitch = (target: string, dino: string): ConvText => ({
  title: 'A delicate matter',
  lines: [
    L('unknown', `House ${target} has grown fat on my misfortune, and their ${dino} struts about Capua as if it owned the place.`),
    L('unknown', 'I want one of their famous dinos dead. Poison, a knife in the night, or simply tearing it apart in the arena: I do not care how. Kill one and I will pay you 500 denarii.'),
    L('unknown', 'I will even lend you one of my keepers. He is very good at listening at doors.'),
    L('unknown', 'Excellent. My keeper will report to your ludus tonight. Do not keep me waiting.', 0),
    L('unknown', `Then forget we spoke. And pray that ${target} never learns that you knew.`, 1),
  ],
  options: [O('Consider it done', 'A free spy; kill one of their dinos within 10 weeks for 500 denarii (opinion +10).'),
    O('I want no part in this', 'Opinion −15.')],
});

export const murderFailed = (target: string): ConvText => ({
  title: 'Patience exhausted',
  lines: [
    L('unknown', `Ten weeks! Ten weeks, and the dinos of House ${target} still breathe. This has certainly been the last time I asked for your assistance!`),
  ],
  options: [O('Accidents take time to arrange...', 'Opinion −10.')],
});

export const carthageOffer = (price: number): ConvText => ({
  title: 'An heirloom from Carthage',
  lines: [
    L('unknown', 'I have something special for you. My grandfather dragged this breastplate out of the ruins of Carthage. Battered, yes, but the bronze still sings.'),
    L('unknown', `A Carthaginian smith here in Capua swears he can remake it for a dino, given time. I could part with it for ${price} denarii.`),
    L('unknown', 'Take good care of it. My grandfather died for that thing. Well, he died near it.', 0),
    L('unknown', 'Your loss.', 1),
  ],
  options: [O(`Buy it for ${price} denarii`, 'A smith will remake it after week 50 (opinion +5).'), O('Not interested', 'Opinion −5.')],
});

export const macedonPitch = (dino: string): ConvText => ({
  title: 'Glory in Macedonia',
  lines: [
    L('caesar', 'Some fool in Macedonia calls himself the descendant of Alexander the Great, and has talked a few thousand goatherds into believing him.'),
    L('caesar', `The Senate will vote on sending me to crush him. I want your vote, and I want your ${dino} at the head of my column as second in command. Nothing frightens a Macedonian like a saurian.`),
    L('caesar', `Rome will remember this. ${dino} will come back covered in glory, or at least in Macedonians.`, 0),
    L('caesar', 'I will remember this. Caesar always remembers.', 1),
  ],
  options: [O(`You have my vote and ${dino}`, `${dino} leaves for 3 weeks and fights over the spoils (Caesar +10).`), O('Find another fool', 'Caesar −15.')],
});

export const hannibalOffer = (champ: string, weapon: string): ConvText => ({
  title: 'The last piece',
  lines: [
    L('unknown', 'I hear you own the regalia of Hannibal Barca himself. Did you know I have his foot-wraps? The very wraps he wore crossing the Alps on a war-saurian.'),
    L('unknown', `A set is worth more than its pieces. I will trade them... for ${champ}, or for that ${weapon} of yours.`),
    L('unknown', `A fine trade! ${champ} will be very well fed in my pens.`, 0),
    L('unknown', 'A fine weapon for fine wraps. Done!', 1),
    L('unknown', 'Then they stay with me. Perhaps I will hire a few more keepers to guard them.', 2),
  ],
  options: [O(`Give ${champ}`, 'Opinion +10; you get Hannibal\'s Wraps.'), O(`Give the ${weapon}`, 'Opinion +10; you get Hannibal\'s Wraps.'),
    O('Keep your smelly foot-wraps', 'Opinion −15.')],
});

export const apolloOffer = (dino: string): ConvText => ({
  title: 'A contest for Apollo',
  lines: [
    L('unknown', 'The priests of Apollo hold a spitting contest every summer. The prize is a venom harness blessed by the god himself.'),
    L('unknown', `The entry is 100 denarii, paid through me of course. Your ${dino} might have a chance... a small one.`),
    L('unknown', `Splendid. Do try not to get ${dino} killed on the road home. The roads are SO dangerous these days.`, 0),
    L('unknown', 'A pity. Perhaps another year.', 1),
  ],
  options: [O(`Enter ${dino} (100 denarii)`, '2 weeks away (opinion +5).'), O('Not interested', 'Opinion −5.')],
});

export const pactOffer = (hated: string): ConvText => ({
  title: 'An alliance',
  lines: [
    L('unknown', `Imagine our efforts united! House ${hated} grows bolder every week, and neither of us can stop them alone.`),
    L('unknown', 'A pact between our houses: we share intel, security, and perhaps even harness and dinos. Our beasts would avoid injuring each other on the sand... mostly.'),
    L('unknown', `Splendid! House ${hated} will tremble.`, 0),
    L('unknown', 'A pity. Do reconsider while you still can.', 1),
    L('unknown', 'A weakling! Capua has not seen the last of my house!', 2),
  ],
  options: [O('We have a pact', `Opinion +20; ${hated} −10.`), O('I prefer to stand alone', 'Opinion −15.'),
    O('Ally with a weakling such as yourself?', 'Opinion −30.')],
});

export const pactGift = (): ConvText => ({
  title: 'A gift between allies',
  lines: [
    L('unknown', 'Friend, I hear your coffers echo. Take 200 denarii, as a gift between allies. No, no, I insist.'),
    L('unknown', 'Think nothing of it. Well, think a little of it.', 0),
    L('unknown', 'Proud as a Roman! I respect that.', 1),
  ],
  options: [O('Accept the gift', '+200 denarii (opinion −5).'), O('We are proud. Keep your coin', 'Opinion +5.')],
});

export const pactBreakup = (): ConvText => ({
  title: 'The end of a pact',
  lines: [
    L('unknown', 'Our pact has brought me nothing but trouble. I am ending it.'),
    L('unknown', 'Fare thee well, then.', 0),
    L('unknown', 'Worthless? We shall see who is worthless.', 1),
  ],
  options: [O('Fare thee well', 'Opinion −5.'), O('You were a worthless ally anyway', 'Opinion −15.')],
});

export const trainAsk = (dino: string): ConvText => ({
  title: 'A training arrangement',
  lines: [
    L('unknown', 'Your doctore has a reputation. Mine could not teach a raptor to bite.'),
    L('unknown', `Train my ${dino} for ten weeks. Make it stronger and more famous and I will reward you handsomely. And if it dies... a reimbursement, of course!`),
    L('unknown', 'It arrives tomorrow. It bites, so mind the fingers.', 0),
    L('unknown', 'Your doctore is overrated anyway.', 1),
  ],
  options: [O(`Send ${dino} over`, '+5 total stats and +100 fame within 10 weeks (opinion +5).'), O('Train your own dinos', 'Opinion −5.')],
});

export const trainSuccess = (dino: string): ConvText => ({
  title: 'Training complete',
  lines: [
    L('unknown', `${dino} is a different beast! As promised, a reward: the whip Fulgur, braided for a champion's tail.`),
    L('unknown', `Wonderful. ${dino} will be the terror of Capua.`, 0),
    L('unknown', 'You thief! Keep it then, and see how loyal it stays to a kidnapper.', 1),
  ],
  options: [O(`Return ${dino} and take Fulgur`, 'Opinion +15.'), O(`I will be keeping ${dino} for myself!`, 'Opinion −10; no Fulgur.')],
});

export const trainFailAlive = (dino: string): ConvText => ({
  title: 'A disappointing pupil',
  lines: [
    L('unknown', `Ten weeks, and ${dino} is no better than the day it left! Return it at once.`),
    L('unknown', 'Theft! Outright theft!', 0),
    L('unknown', 'Well. At least it is fed.', 1),
  ],
  options: [O(`I'll be keeping ${dino}`, 'Opinion −35.'), O('Take your dino back', 'No change.')],
});

export const trainFailDead = (dino: string): ConvText => ({
  title: 'A dead pupil',
  lines: [
    L('unknown', `${dino} is dead! I lent you a dino, not a corpse!`),
    L('unknown', 'Accidents! Your doctore is an accident.', 0),
    L('unknown', 'Hmph. It will not bring it back, but it is a start.', 1),
  ],
  options: [O('Accidents happen', 'Opinion −20.'), O('Here, 100 denarii for your trouble', 'Opinion −5.')],
});

export const mansionOffer = (champ: string): ConvText => ({
  title: 'A house in Rome',
  lines: [
    L('unknown', 'I own a mansion in the heart of Rome. Marble floors, a view of the Forum, only slightly haunted.'),
    L('unknown', `I would part with it for a five-week loan of ${champ}, for some private exhibitions, plus 500 denarii. Or smaller instalments if you prefer: 25 denarii a week.`),
    L('unknown', `Splendid! ${champ} will be back in five weeks, healthy and well fed. I will even pack it a poultice.`, 0),
    L('unknown', `Splendid! ${champ} will be back in five weeks, healthy and well fed. I will even pack it a poultice.`, 1),
    L('unknown', 'Rome\'s loss is Capua\'s gain, I suppose.', 2),
  ],
  options: [O('Pay 25 denarii a week', `Rome Mansion (level 1); ${champ} on loan for 5 weeks (opinion +5).`),
    O('Pay 500 denarii now', `Rome Mansion (level 1); ${champ} on loan for 5 weeks (opinion +5).`), O('No thank you', 'Opinion −5.')],
});

export const studAsk = (male: string, female: string, species: string): ConvText => ({
  title: 'A matter of breeding',
  lines: [
    L('unknown', `I have admired your ${male} for some time. Such a jaw! Such haunches! My ${species} ${female} has been... lonely.`),
    L('unknown', `Lend me ${male} as a stud for a week. 300 denarii, and he eats prime meat the whole time.`),
    L('unknown', 'Wonderful! He will be back before he misses you.', 0),
    L('unknown', 'So protective! I suppose some lanistae are like that.', 1),
  ],
  options: [O('300 denarii it is', `${male} is away for a week; the rival gets an offspring.`), O('My bloodline stays in my ludus', 'Opinion −5.')],
});

// ---------------------------------------------------------------------------
// Spartacus
// ---------------------------------------------------------------------------

export const spartacusAlley = (owner: string): ConvText => ({
  title: 'Psst! In the alleyway!',
  lines: [
    L('spartacus', 'Psst! Over here! In the alleyway!'),
    L('narrator', 'A scarred Allosaurus crouches in the shadow of the market wall, chain marks still raw on its ankles. Its voice is a low rumble that somehow forms words.'),
    L('spartacus', `I am Spartacus, of Thrace. ${owner} starves us, chains us, and rents us out by the night to whoever pays. I will not die in his pens.`),
    L('spartacus', `Set fire to the ${owner} estate. While his keepers fight the flames, my brothers and I break our chains. I have 100 denarii buried where his keepers never look, and you shall have a share of his harness when we are free.`),
    L('player', `${owner} will hear of this treachery!`, 0),
    L('spartacus', 'Tell him. He will flog me, and I will remember every lash. Rome has not seen the last of me!', 0),
    L('player', 'I will not be involved in this madness.', 1),
    L('spartacus', 'Then walk away, Roman. But walk quickly.', 1),
    L('player', 'I will help you break out!', 2),
    L('spartacus', `Take the coin. When you see smoke over the ${owner} estate, you will know we are coming.`, 2),
    L('narrator', `(Sabotage House ${owner} through Intrigue to start the fire.)`, 2),
  ],
  options: [O(`${owner} will hear of this treachery!`, `${owner}: opinion +10.`), O('I will not be involved in this madness', `${owner}: opinion −5.`),
    O('I will help you break out!', '+100 denarii; sabotage the house to start the fire.')],
});

export const spartacusFarewell = (): ConvText => ({
  title: 'A free beast',
  lines: [
    L('spartacus', 'I speak to you now as a free beast, thanks to your diversion. The harness I promised was left at your gate.'),
    L('spartacus', 'From this day it will be as if we never met. But if Rome ever comes for you, remember who your friends are.'),
    L('spartacus', 'Go well, Roman.', 0),
  ],
  options: [O('Go well, Spartacus')],
});

export const spartacusBounty = (a: string, b: string): ConvText => ({
  title: 'Bane of Rome',
  lines: [
    L('spartacus', 'Doubtless you have heard of me, as I am Spartacus, bane of Rome!'),
    L('spartacus', 'My Horde needs coin, and I know you have rivals. For 500 denarii I will bring fire and death to a rival of your choosing.'),
    L('spartacus', 'Then you might be my next target, Roman.', 0),
    L('spartacus', `House ${a} will burn by the next moon.`, 1),
    L('spartacus', `House ${b} will burn by the next moon.`, 2),
  ],
  options: [O('If I\'m seen with you, my head will surely part from my neck!', 'All rivals: opinion +5.'),
    O(`Burn House ${a} (500 denarii)`, 'The next Horde raid falls on them.'), O(`Burn House ${b} (500 denarii)`, 'The next Horde raid falls on them.')],
});

// ---------------------------------------------------------------------------
// Special NPCs
// ---------------------------------------------------------------------------

export const pythiaVisions = (): ConvText => ({
  title: 'The Pythia of Delphi',
  lines: [
    L('pythia', 'Do not be alarmed, lanista. I am the Pythia of Apollo, and I have journeyed far from the sacred precincts of Delphi to find you.'),
    L('pythia', 'You who have toiled in the realm of Mars have awakened the curiosity of the Olympians. They watch your dinos bleed on the sand, and they are... amused.'),
    L('pythia', 'The gods have taken an interest in you! Prove yourself worthy, and their favour will follow.', 0),
    L('pythia', 'Time? The gods have taken an interest in you, whether you have time or not.', 1),
  ],
  options: [O('What do the gods want with me?'), O('I have no time for prophets')],
});

export const pythiaDelphi = (bonded: string): ConvText => ({
  title: 'A show of devotion',
  lines: [
    L('pythia', 'The Oracle demands a show of devotion. Send the dino you have bonded with to Delphi, so that the priests may weigh its heart.'),
    L('pythia', 'A wise choice. Two weeks, and the priests will know its worth.', 0),
    L('pythia', 'The gods are patient. Up to a point.', 1),
  ],
  options: [O(`Send ${bonded} to Delphi`, '2 weeks; a trial against three wolves of Apollo.'), O('Not yet')],
});

export const godsChosen = (): ConvText => ({
  title: 'The gods demand a sacrifice',
  lines: [
    L('pythia', 'You have done all that was asked. And now the gods demand a sacrifice.'),
    L('pythia', 'One hundred keepers and ten thousand denarii, given to the temples. Then the Prophecy will be fulfilled before the eyes of all Capua.'),
    L('pythia', 'It is done. In five weeks the gods\' chosen will descend upon the arena. Be ready.', 0),
    L('pythia', 'Do you think the favour of the gods comes lightly? Farewell, lanista.', 1),
  ],
  options: [O('Lose 100 keepers and 10,000 denarii', 'The Prophecy tournament is held in 5 weeks.'), O('The gods ask too much', 'The questline ends.')],
});

export const tombMap = (best: string, second: string): ConvText => ({
  title: 'The tomb of Necho II',
  lines: [
    L('spy', 'Dominus, my contacts in Alexandria have found an old Egyptian map detailing the tomb of an ancient Pharaoh, Necho II.'),
    L('spy', 'It is guarded by traps and curses, they say. And treasure. Heaps of treasure. A strong dino could dig its way in.'),
    L('spy', 'I will arrange passage on the next grain ship to Alexandria.', 0),
    L('spy', 'I will arrange passage on the next grain ship to Alexandria.', 1),
    L('spy', 'As you wish. Maps like this do not stay secret for long.', 2),
  ],
  options: [O(`Send ${best}`, '3 weeks to Egypt.'), O(`Send ${second}`, '3 weeks to Egypt.'), O('Curses are bad for business')],
});

export const hectorVisit = (fee: number, returning: boolean): ConvText => ({
  title: returning ? 'Hector returns' : 'Hector\'s dream',
  lines: returning
    ? [
      L('hector', 'Lanista! The Trojan Games are not finished with us. But expenses have risen due to war and inflation...'),
      L('hector', `The entry is now ${fee} denarii. The relics are still waiting for a worthy champion.`),
      L('hector', 'Then prepare your dinos: the Trojan warriors are coming.', 0),
      L('hector', 'Troy has been burned before. It will rise without you.', 1),
    ]
    : [
      L('hector', 'Lanista! You may remember the escort you gave me on the road to Capua. I have not forgotten. I am Hector, of the royal house of Troy.'),
      L('hector', `I mean to restore my city's glory with a grand tournament, the Trojan Games, for an entry of ${fee} denarii. And the prizes... I may have smuggled some very valuable items with me.`),
      L('hector', 'You will not regret it! Prepare your dinos: the Trojan warriors are coming.', 0),
      L('hector', 'Troy has been burned before. It will rise without you.', 1),
    ],
  options: [O(`Here are ${fee} denarii`, 'The Trojan Games are held in 6–10 weeks.'), O('Troy can stay buried', 'The story ends.')],
});

export const hagPlea = (best: string, second: string): ConvText => ({
  title: 'A mysterious old woman',
  lines: [
    L('hag', 'Psssst... Death-peddler. Yes, you, with the lizards.'),
    L('hag', 'Bandits robbed me on the Via Appia. Took my possessions, kicked my cat. Send one of your beasts to kill them all, and bring back what is mine.'),
    L('hag', 'Good... good. They camp in the hills, two days\' walk.', 0),
    L('hag', 'Good... good. They camp in the hills, two days\' walk.', 1),
    L('hag', 'Tsk. You will regret those words, death-peddler. I do not forget a slight.', 2),
  ],
  options: [O(`Send ${best}`, '2 weeks against a bandit gang.'), O(`Send ${second}`, '2 weeks against a bandit gang.'), O('Go away, old woman')],
});

export const hagReward = (): ConvText => ({
  title: 'The hag\'s gratitude',
  lines: [
    L('hag', 'My possessions! And the bandits are fertilizer. I am a woman of my word. Choose your reward.'),
    L('hag', 'Five hundred gold coins. Or this egg: to hatch an egg like this, it needs the heat of battle! Or I could teach your cleverest dino something... forbidden.'),
    L('hag', 'Gold. How dull. Here.', 0),
    L('hag', 'Keep it close in battle. Very close.', 1),
    L('hag', 'Fire, little one. Fire from within.', 2),
  ],
  options: [O('Take the 500 gold'), O('Keep the egg', 'A Mysterious Egg.'), O('Teach my dino', 'Your most cunning favourite learns Fireball.')],
});

export const graveMap = (champ: string): ConvText => ({
  title: 'A map to a king\'s grave',
  lines: [
    L('veteran', 'I\'d rather not say my name. I served in Caesar\'s army in Gaul, and I came home with a few souvenirs.'),
    L('veteran', `This map leads to the burial mound of a Celtic king, buried with his horse and his harness. 200 denarii and it is yours. Send something big, like your ${champ}: the Gauls still guard it.`),
    L('veteran', 'Pleasure doing business. Mind the curses.', 0),
    L('veteran', 'Batiatus will buy it then. He is less picky.', 1),
  ],
  options: [O(`Buy the map and send ${champ} (200 denarii)`, '3 weeks.'), O('I don\'t rob graves', '+25 influence; rivals approve.')],
});

export const closerLook = (rival: string): ConvText => ({
  title: 'A prized possession',
  lines: [
    L('veteran', `I used to fight for House ${rival}. I know their villa like my own scars.`),
    L('veteran', 'Their most prized possession sits in the lanista\'s study. Not particularly valuable... But it might be useful. For 100 denarii I will tell your cleverest dino how to get in.'),
    L('veteran', 'Two weeks. Tell it to watch out for the guard captain.', 0),
    L('veteran', 'Suit yourself.', 1),
  ],
  options: [O('Here are 100 denarii', 'Your most cunning favourite goes in (2 weeks).'), O('I\'ll pass', '+5 influence; rivals approve.')],
});
