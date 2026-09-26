import { SCENE_APPEND_RECIPES } from '../recipes.js';
import { createScenePackRegistry } from './registry.js';

/**
 * Compose the installed scene recipes and their trusted presentation rules.
 * (Fork-lite: the CC BY-NC Nepal scene presentation was removed; the
 * registry runs with the public recipes only.)
 */
export function createDefaultScenePacks() {
  return createScenePackRegistry({
    recipes: SCENE_APPEND_RECIPES,
    adapters: [],
  });
}
