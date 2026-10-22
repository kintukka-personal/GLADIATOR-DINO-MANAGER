// Name pools. Dinos take Roman-world names flavoured by where their species is bred.

import type { SpeciesId } from '../types';

const ROMAN = ['Aquila', 'Brutus', 'Cassius', 'Decimus', 'Felix', 'Gallus', 'Horatius', 'Iulius', 'Lucius', 'Marcus',
  'Nero', 'Octavius', 'Paulus', 'Quintus', 'Rufus', 'Septimus', 'Titus', 'Varro', 'Maximus', 'Crispus', 'Faustus',
  'Severus', 'Valens', 'Corvus', 'Tullius', 'Albus', 'Agrippa', 'Florus', 'Lupus', 'Ursus', 'Leo', 'Priscus'];
const ROMAN_F = ['Aurelia', 'Livia', 'Cornelia', 'Valeria', 'Tullia', 'Flavia', 'Iulia', 'Octavia', 'Claudia', 'Lucilla',
  'Fausta', 'Domitia', 'Antonia', 'Messalina', 'Agrippina', 'Camilla', 'Lupa', 'Ursa', 'Aquilina', 'Severa'];
const GREEK = ['Achilleus', 'Ajax', 'Castor', 'Damon', 'Hektor', 'Kratos', 'Leandros', 'Nikias', 'Orion', 'Pallas',
  'Theron', 'Xanthos', 'Zephyros', 'Ares', 'Kyros', 'Lykos', 'Drakon', 'Argos', 'Talos', 'Brontes'];
const GREEK_F = ['Ariadne', 'Kassandra', 'Daphne', 'Elektra', 'Helena', 'Iris', 'Kalliope', 'Medea', 'Penelope',
  'Thalia', 'Xenia', 'Atalanta', 'Nike', 'Phoibe', 'Lyra', 'Hippolyta'];
const THRACIAN = ['Bendis', 'Cotys', 'Dromichaetes', 'Rhesus', 'Seuthes', 'Sitalces', 'Teres', 'Zalmoxis', 'Burebista',
  'Dolonkos', 'Kersebleptes', 'Mucapor', 'Tarsas', 'Bithus'];
const THRACIAN_F = ['Bendida', 'Kotyto', 'Zerynthia', 'Mezena', 'Tirsa', 'Dida'];
const PUNIC = ['Hanno', 'Hamilcar', 'Hasdrubal', 'Mago', 'Adherbal', 'Bomilcar', 'Carthalo', 'Himilco', 'Maharbal',
  'Gisco', 'Bodashtart', 'Abibaal'];
const PUNIC_F = ['Sophonisba', 'Tanit', 'Elissa', 'Arishat', 'Batbaal', 'Imilce'];
const CELTIC = ['Brennus', 'Cunobelin', 'Dumnorix', 'Orgetorix', 'Vercingetorix', 'Ambiorix', 'Caradoc', 'Lugos',
  'Taranis', 'Esus', 'Bran', 'Cathal', 'Fergus', 'Morvran'];
const CELTIC_F = ['Boudica', 'Cartimandua', 'Epona', 'Brigantia', 'Morrigan', 'Rhiannon', 'Onomaris', 'Nantosuelta'];
const EGYPTIAN = ['Ahmose', 'Djoser', 'Imhotep', 'Khufu', 'Menes', 'Narmer', 'Ramses', 'Sobek', 'Seti', 'Thutmose',
  'Anubis', 'Horus', 'Sneferu', 'Apophis'];
const EGYPTIAN_F = ['Nefertari', 'Hatshepsut', 'Bastet', 'Isis', 'Meret', 'Tiye', 'Sekhmet', 'Ankhesen', 'Nebet'];
const IBERIAN = ['Indibilis', 'Mandonius', 'Viriatus', 'Allucius', 'Istolatius', 'Corocotta', 'Olyndicus', 'Caros'];
const IBERIAN_F = ['Himilce', 'Larunda', 'Ataecina', 'Iberia', 'Turrina'];
const PARTHIAN = ['Arsaces', 'Mithridates', 'Orodes', 'Phraates', 'Surena', 'Vologases', 'Artabanus', 'Pacorus'];
const PARTHIAN_F = ['Musa', 'Rhodogune', 'Laodice', 'Apama', 'Parysatis'];
const BEAST = ['Fang', 'Grim', 'Ash', 'Shadow', 'Thorn', 'Ember', 'Storm', 'Bones', 'Scar', 'Tusk', 'Brute', 'Howl',
  'Cinder', 'Moss', 'Frost', 'Ruin', 'Gnash', 'Rook', 'Talon', 'Mange'];

type Pool = { m: string[]; f: string[] };
const POOLS: Record<string, Pool> = {
  roman: { m: ROMAN, f: ROMAN_F },
  greek: { m: GREEK, f: GREEK_F },
  thracian: { m: THRACIAN, f: THRACIAN_F },
  punic: { m: PUNIC, f: PUNIC_F },
  celtic: { m: CELTIC, f: CELTIC_F },
  egyptian: { m: EGYPTIAN, f: EGYPTIAN_F },
  iberian: { m: IBERIAN, f: IBERIAN_F },
  parthian: { m: PARTHIAN, f: PARTHIAN_F },
  beast: { m: BEAST, f: BEAST },
};

const SPECIES_POOL: Partial<Record<SpeciesId, string>> = {
  velociraptor: 'thracian', dilophosaurus: 'iberian', troodon: 'punic', allosaurus: 'thracian',
  carnotaurus: 'iberian', tyrannosaurus: 'celtic', spinosaurus: 'egyptian', triceratops: 'celtic',
  ankylosaurus: 'greek', stegosaurus: 'greek', iguanodon: 'roman', parasaurolophus: 'parthian',
  pachycephalosaurus: 'roman', therizinosaurus: 'parthian', brachiosaurus: 'greek', giganotosaurus: 'egyptian',
};

export function namePool(species: SpeciesId, female: boolean): string[] {
  const key = SPECIES_POOL[species] ?? 'beast';
  const pool = POOLS[key];
  return female ? pool.f : pool.m;
}

export const HOUSE_NAMES = ['Aemilius', 'Calpurnius', 'Domitius', 'Fabius', 'Gratus', 'Lepidus', 'Marcellus',
  'Pomponius', 'Quinctius', 'Sempronius', 'Tarquinius', 'Valerius', 'Licinius', 'Sulpicius', 'Furius', 'Antistius',
  'Hortensius', 'Mummius', 'Plautius', 'Scribonius'];
