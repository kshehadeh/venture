/**
 * Effects system for applying game state changes.
 * 
 * Each effect type has its own class that extends BaseEffect.
 * This provides better extensibility and developer experience.
 */

export { BaseEffect, EffectContext } from './base-effect';
export { StatsEffect } from './stats-effect';
export { TraitsEffect } from './traits-effect';
export { FlagsEffect } from './flags-effect';
export { CharacterEffectsEffect } from './character-effects-effect';
export { InventoryEffect } from './inventory-effect';
export { TransferItemEffect } from './transfer-item-effect';
export { SceneTransitionEffect } from './scene-transition-effect';
export { SceneObjectsEffect } from './scene-objects-effect';
export { VisitedScenesEffect } from './visited-scenes-effect';
export { EffectApplier } from './effect-applier';

