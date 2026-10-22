// ARK-style color palette. Creatures carry 6 color regions, each an index into COLORS.
// Region meaning (used by the art): 0 main body, 1 underbelly, 2 pattern/stripes,
// 3 crest/frill/sail/horns, 4 back/spikes/plates, 5 eyes & claws.

export interface DyeColor { name: string; hex: string }

export const COLORS: DyeColor[] = [
  { name: 'Black', hex: '#1d1b1a' },        // 0
  { name: 'Charcoal', hex: '#3a3633' },     // 1
  { name: 'Slate', hex: '#5c6167' },        // 2
  { name: 'Ash', hex: '#8f8a84' },          // 3
  { name: 'Bone', hex: '#d9cdb4' },         // 4
  { name: 'Parchment', hex: '#efe3c4' },    // 5
  { name: 'White', hex: '#f4f1ea' },        // 6
  { name: 'Mud', hex: '#5a4632' },          // 7
  { name: 'Brown', hex: '#7a5232' },        // 8
  { name: 'Tan', hex: '#b38a5a' },          // 9
  { name: 'Sand', hex: '#cfae74' },         // 10
  { name: 'Ochre', hex: '#c58a2b' },        // 11
  { name: 'Rust', hex: '#9c4a24' },         // 12
  { name: 'Brick', hex: '#8c3a2e' },        // 13
  { name: 'Crimson', hex: '#a3202a' },      // 14
  { name: 'Red', hex: '#c8352b' },          // 15
  { name: 'Tangerine', hex: '#e07a2e' },    // 16
  { name: 'Orange', hex: '#d9661b' },       // 17
  { name: 'Yellow', hex: '#e2b93b' },       // 18
  { name: 'Lemon', hex: '#ead36a' },        // 19
  { name: 'Olive', hex: '#6c6a32' },        // 20
  { name: 'Moss', hex: '#56662f' },         // 21
  { name: 'Forest', hex: '#2f4a2a' },       // 22
  { name: 'Jungle', hex: '#3d6b3a' },       // 23
  { name: 'Green', hex: '#4f8a3c' },        // 24
  { name: 'Mint', hex: '#8dc2a0' },         // 25
  { name: 'Teal', hex: '#2f6f6a' },         // 26
  { name: 'Cyan', hex: '#3f9db0' },         // 27
  { name: 'Sky', hex: '#6fa6cf' },          // 28
  { name: 'Navy', hex: '#26365c' },         // 29
  { name: 'Royal', hex: '#3b3f8f' },        // 30
  { name: 'Purple', hex: '#5e3a7a' },       // 31
  { name: 'Lilac', hex: '#a58fc2' },        // 32
  { name: 'Magenta', hex: '#a13a7d' },      // 33
  { name: 'Pink', hex: '#d98aa0' },         // 34
  { name: 'Coral', hex: '#e0786a' },        // 35
  { name: 'Gold', hex: '#c9a227' },         // 36
  { name: 'Obsidian', hex: '#14131c' },     // 37
  { name: 'Bloodmoon', hex: '#5a0f1a' },    // 38
  { name: 'Albino', hex: '#f7efe9' },       // 39
];

export const colorHex = (i: number): string => COLORS[((i % COLORS.length) + COLORS.length) % COLORS.length].hex;
export const colorName = (i: number): string => COLORS[((i % COLORS.length) + COLORS.length) % COLORS.length].name;
