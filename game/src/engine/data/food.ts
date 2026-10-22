// Pantry foods and ARK kibble tiers (DESIGN §4.7).

import type { EggSize, FoodId, KibbleTier } from '../types';

export interface FoodDef { id: FoodId; name: string; price: number; kind: 'meat' | 'berry' | 'kibble'; tier?: KibbleTier; desc: string }

export const FOODS: Record<FoodId, FoodDef> = {
  rawMeat: { id: 'rawMeat', name: 'Raw Meat', price: 8, kind: 'meat', desc: 'Everyday fare for carnivore hatchlings.' },
  primeMeat: { id: 'primeMeat', name: 'Prime Meat', price: 25, kind: 'meat', desc: 'Choice cuts. Some hatchlings demand it.' },
  mejoberries: { id: 'mejoberries', name: 'Mejoberries', price: 5, kind: 'berry', desc: 'Sweet berries herbivore hatchlings love.' },
  kibble_simple: { id: 'kibble_simple', name: 'Simple Kibble', price: 40, kind: 'kibble', tier: 'simple', desc: 'Made from small eggs.' },
  kibble_regular: { id: 'kibble_regular', name: 'Regular Kibble', price: 70, kind: 'kibble', tier: 'regular', desc: 'Made from medium eggs.' },
  kibble_superior: { id: 'kibble_superior', name: 'Superior Kibble', price: 120, kind: 'kibble', tier: 'superior', desc: 'Made from large eggs.' },
  kibble_exceptional: { id: 'kibble_exceptional', name: 'Exceptional Kibble', price: 200, kind: 'kibble', tier: 'exceptional', desc: 'Made from extra-large eggs.' },
  kibble_extraordinary: { id: 'kibble_extraordinary', name: 'Extraordinary Kibble', price: 350, kind: 'kibble', tier: 'extraordinary', desc: 'Made from mythic eggs.' },
};

export const FOOD_IDS = Object.keys(FOODS) as FoodId[];

export const KIBBLE_FOR_TIER: Record<KibbleTier, FoodId> = {
  simple: 'kibble_simple', regular: 'kibble_regular', superior: 'kibble_superior', exceptional: 'kibble_exceptional',
  extraordinary: 'kibble_extraordinary',
};

export const TIER_FOR_EGG: Record<EggSize, KibbleTier> = {
  small: 'simple', medium: 'regular', large: 'superior', xlarge: 'exceptional', mythic: 'extraordinary',
};

/** Unfertilized egg sale values. */
export const EGG_SALE: Record<EggSize, number> = { small: 10, medium: 25, large: 60, xlarge: 150, mythic: 400 };

/** Base price of a fertilized market egg by size (scaled by genetics). */
export const EGG_BASE_PRICE: Record<EggSize, number> = { small: 80, medium: 150, large: 300, xlarge: 500, mythic: 1500 };

export const EGG_SIZE_NAME: Record<EggSize, string> = { small: 'Small', medium: 'Medium', large: 'Large', xlarge: 'Extra-large', mythic: 'Mythic' };
