import type { Vector3Like } from 'hytopia';

// Game Configuration
export const GAME_CONFIG = {
  SPAWN_RADIUS: 8, // Radius around player to spawn items (close for testing)
  ITEM_SPAWN_HEIGHT: 1.5, // Height above ground for items
  ITEM_COLLECTION_DISTANCE: 5.0, // Distance to collect item (increased for easier collection)
  ITEMS_PER_ORDER: 5, // Number of items to spawn for each order
  SCORE_PER_ITEM: 10,
  SCORE_PER_ORDER: 100,
  TIME_LIMIT_PER_ORDER: 60000, // 60 seconds per order
  MIN_SAFE_Y: -5, // Minimum Y position before teleporting player back
  SAFE_SPAWN_Y: 10, // Safe Y position to teleport player to
  ITEM_TYPES: {
    // Using real food item textures from examples/mcorder/
    'B': { blockId: 17, name: 'Burger', textureUri: 'blocks/mcorder/Burger.png' },
    'F': { blockId: 18, name: 'Fries', textureUri: 'blocks/mcorder/Fries.png' },
    'N': { blockId: 20, name: 'Nuggets', textureUri: 'blocks/mcorder/Nuggets.png' },
    'D': { blockId: 19, name: 'Drink', textureUri: 'blocks/mcorder/Coke.png' },
    'I': { blockId: 21, name: 'Icecream', textureUri: 'blocks/mcorder/Ice.png' },
  },
  ORDERS: [
    ['B', 'F'], // Tutorial Order
    ['B', 'F', 'D'], // Meal 1
    ['N', 'I'], // Dessert Snack
    ['F', 'D', 'B', 'N'], // Big Family Order
    ['I', 'B'], // Simple combo
  ],
} as const;

