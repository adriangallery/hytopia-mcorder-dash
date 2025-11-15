/**
 * HYTOPIA - McOrder Dash Game
 * 
 * Adaptation of "Adrian's McOrder Dash" game to HYTOPIA 3D environment
 * Players explore a small world to find food items in the correct order
 */

import {
  startServer,
  Audio,
  DefaultPlayerEntity,
  PlayerEvent,
  Entity,
  WorldEvent,
} from 'hytopia';

import worldMap from './assets/map.json';

// Game Configuration
const GAME_CONFIG = {
  SPAWN_RADIUS: 8, // Radius around player to spawn items (close for testing)
  ITEM_SPAWN_HEIGHT: 1.5, // Height above ground for items
  ITEM_COLLECTION_DISTANCE: 3.0, // Distance to collect item (larger for easier collection)
  ITEMS_PER_ORDER: 5, // Number of items to spawn for each order
  SCORE_PER_ITEM: 10,
  SCORE_PER_ORDER: 100,
  TIME_LIMIT_PER_ORDER: 60000, // 60 seconds per order
  MIN_SAFE_Y: -5, // Minimum Y position before teleporting player back
  SAFE_SPAWN_Y: 10, // Safe Y position to teleport player to
  ITEM_TYPES: {
    // Using highly visible standard HYTOPIA blocks - bright and colorful
    'B': { blockId: 3, name: 'Burger', textureUri: 'blocks/bricks.png' }, // Bricks (red/orange - very visible)
    'F': { blockId: 2, name: 'Fries', textureUri: 'blocks/birch-leaves.png' }, // Birch leaves (light green - very visible)
    'N': { blockId: 1, name: 'Nuggets', textureUri: 'blocks/andesite.png' }, // Andesite (light gray - visible)
    'D': { blockId: 12, name: 'Drink', textureUri: 'blocks/sand.png' }, // Sand (yellow - very visible)
    'I': { blockId: 10, name: 'Icecream', textureUri: 'blocks/oak-leaves.png' }, // Oak leaves (green - very visible)
  },
  ORDERS: [
    ['B', 'F'], // Tutorial Order
    ['B', 'F', 'D'], // Meal 1
    ['N', 'I'], // Dessert Snack
    ['F', 'D', 'B', 'N'], // Big Family Order
    ['I', 'B'], // Simple combo
  ],
};

// Game State per Player
interface PlayerGameState {
  score: number;
  lives: number;
  currentOrder: string[];
  orderProgress: number;
  orderCount: number;
  isGameOver: boolean;
  worldItems: Entity[]; // Items placed in the world
  orderTimer?: NodeJS.Timeout;
  managerEntity?: Entity;
  player: any;
}

const playerGameStates = new Map<string, PlayerGameState>();

// Generate random position near player (close for testing)
function getRandomPositionNearPlayer(playerPos: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  // Generate position very close to player for testing (1-5 blocks away)
  const angle = Math.random() * Math.PI * 2;
  const distance = 1 + Math.random() * 4; // Min 1 block, max 5 blocks - very close!
  
  const x = playerPos.x + Math.cos(angle) * distance;
  const z = playerPos.z + Math.sin(angle) * distance;
  // Use player's Y position + spawn height so items are at ground level
  const y = playerPos.y + GAME_CONFIG.ITEM_SPAWN_HEIGHT;
  
  return { x, y, z };
}

startServer(world => {
  // Load the standard HYTOPIA test map
  try {
    world.loadMap(worldMap);
    console.log('Map loaded successfully');
  } catch (error) {
    console.error('Error loading map:', error);
  }

  // Background music
  const backgroundMusic = new Audio({
    uri: 'audio/mcorder/Let Me See Ya Bounce.mp3',
    loop: true,
    volume: 0.35,
  });
  backgroundMusic.play(world);

  const gameOverMusic = new Audio({
    uri: 'audio/mcorder/Game Over Music 1.mp3',
    loop: false,
    volume: 0.45,
  });

  // Initialize game state for a player
  function initGameState(player: any): PlayerGameState {
    return {
      score: 0,
      lives: 3,
      currentOrder: [],
      orderProgress: 0,
      orderCount: 0,
      isGameOver: false,
      worldItems: [],
      player: player,
    };
  }

  // Spawn an item in the world near the player using standard HYTOPIA blocks
  function spawnWorldItem(world: any, itemCode: string, playerId: string, playerPos: { x: number; y: number; z: number }): Entity | null {
    const itemType = GAME_CONFIG.ITEM_TYPES[itemCode as keyof typeof GAME_CONFIG.ITEM_TYPES];
    if (!itemType) {
      console.error(`Invalid item code: ${itemCode}`);
      return null;
    }

    const position = getRandomPositionNearPlayer(playerPos);
    
    // Create entity using standard HYTOPIA block texture - make it VERY large and visible
    const item = new Entity({
      name: `item-${itemCode}-${Date.now()}-${Math.random()}`,
      blockTextureUri: itemType.textureUri,
      blockHalfExtents: { x: 1.0, y: 1.0, z: 1.0 }, // Very large size (2x2x2 blocks) for maximum visibility
    });

    // Spawn the entity
    item.spawn(world, position);

    // Set rigid body to fixed so it doesn't fall
    if (item.rigidBodyOptions) {
      item.rigidBodyOptions.type = 'fixed';
    }

    console.log(`✅ Spawned item ${itemCode} (${itemType.name}) at position:`, position, 'using block:', itemType.textureUri);
    console.log(`   Distance from player: ${Math.sqrt(Math.pow(position.x - playerPos.x, 2) + Math.pow(position.z - playerPos.z, 2)).toFixed(2)} blocks`);
    return item;
  }

  // Clear all world items for a player
  function clearWorldItems(state: PlayerGameState) {
    state.worldItems.forEach(item => {
      if (item.isSpawned) {
        item.despawn();
      }
    });
    state.worldItems = [];
  }

  // Start new order and spawn items in the world
  function startNewOrder(world: any, playerId: string, state: PlayerGameState) {
    state.orderCount++;

    // Clear previous items
    clearWorldItems(state);

    if (state.orderTimer) {
      clearTimeout(state.orderTimer);
    }

    // Get player position for spawning items nearby
    const playerEntities = world.entityManager.getPlayerEntitiesByPlayer(state.player);
    if (playerEntities.length === 0) return;
    const playerEntity = playerEntities[0];
    const playerPos = playerEntity.position;

    // Select order
    if (state.orderCount === 1) {
      state.currentOrder = GAME_CONFIG.ORDERS[0];
    } else {
      const randomIndex = Math.floor(Math.random() * (GAME_CONFIG.ORDERS.length - 1)) + 1;
      state.currentOrder = GAME_CONFIG.ORDERS[randomIndex];
    }

    state.orderProgress = 0;

    // Spawn items in the world near player
    // Spawn all items needed for the order, plus some extra random ones
    const itemsToSpawn: string[] = [];
    
    // Add required items
    state.currentOrder.forEach(itemCode => {
      itemsToSpawn.push(itemCode);
    });
    
    // Add some random extra items to make it more challenging
    const allItemCodes = Object.keys(GAME_CONFIG.ITEM_TYPES);
    const extraItems = GAME_CONFIG.ITEMS_PER_ORDER - itemsToSpawn.length;
    for (let i = 0; i < extraItems; i++) {
      const randomItem = allItemCodes[Math.floor(Math.random() * allItemCodes.length)];
      itemsToSpawn.push(randomItem);
    }

    // Shuffle items
    for (let i = itemsToSpawn.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [itemsToSpawn[i], itemsToSpawn[j]] = [itemsToSpawn[j], itemsToSpawn[i]];
    }

    // Spawn all items near player
    let spawnedCount = 0;
    itemsToSpawn.forEach(itemCode => {
      const item = spawnWorldItem(world, itemCode, playerId, playerPos);
      if (item) {
        state.worldItems.push(item);
        spawnedCount++;
      }
    });

    // Send message to player
    world.chatManager.sendPlayerMessage(
      state.player,
      `New Order: Find ${state.currentOrder.map(c => GAME_CONFIG.ITEM_TYPES[c as keyof typeof GAME_CONFIG.ITEM_TYPES].name).join(', ')}`,
      'FFFF00'
    );
    world.chatManager.sendPlayerMessage(
      state.player,
      `✅ Spawned ${spawnedCount} items very close to you (1-5 blocks away)! Walk over them to collect!`,
      '00FF00'
    );
    world.chatManager.sendPlayerMessage(
      state.player,
      `Look for colored blocks: Red=Burger, Green=Fries, Gray=Nuggets, Yellow=Drink, Dark Green=Icecream`,
      'FFFF00'
    );

    // Set timer for order completion
    state.orderTimer = setTimeout(() => {
      if (!state.isGameOver && state.orderProgress < state.currentOrder.length) {
        loseLife(world, playerId, state, 'Time ran out!');
      }
    }, GAME_CONFIG.TIME_LIMIT_PER_ORDER);
  }

  // Process item collection
  function processItemCollection(world: any, playerId: string, state: PlayerGameState, item: Entity, itemCode: string) {
    if (state.orderProgress === state.currentOrder.length) {
      return; // Order already fulfilled
    }

    const requiredItemCode = state.currentOrder[state.orderProgress];

    if (itemCode === requiredItemCode) {
      // Correct item!
      state.orderProgress++;
      state.score += GAME_CONFIG.SCORE_PER_ITEM;

      // Play catch sound
      try {
        new Audio({
          uri: 'audio/mcorder/Triple Bleep.mp3',
          volume: 0.55,
        }).play(world);
      } catch (e) {
        console.log('Audio play error:', e);
      }

      world.chatManager.sendPlayerMessage(
        state.player,
        `✅ Collected ${GAME_CONFIG.ITEM_TYPES[itemCode as keyof typeof GAME_CONFIG.ITEM_TYPES].name}! +${GAME_CONFIG.SCORE_PER_ITEM} points`,
        '00FF00'
      );

      // Remove item from world
      if (item.isSpawned) {
        item.despawn();
      }
      state.worldItems = state.worldItems.filter(i => i.id !== item.id);

      if (state.orderProgress === state.currentOrder.length) {
        // Order fulfilled!
        state.score += GAME_CONFIG.SCORE_PER_ORDER;
        if (state.orderTimer) {
          clearTimeout(state.orderTimer);
        }
        
        world.chatManager.sendPlayerMessage(
          state.player,
          `Order Complete! +${GAME_CONFIG.SCORE_PER_ORDER} bonus points`,
          '00FF00'
        );

        // Clear remaining items
        clearWorldItems(state);

        setTimeout(() => {
          startNewOrder(world, playerId, state);
        }, 2000);
      }
    } else {
      // Wrong item
      loseLife(world, playerId, state, `Wrong item! You need ${GAME_CONFIG.ITEM_TYPES[requiredItemCode as keyof typeof GAME_CONFIG.ITEM_TYPES].name} next`);
    }
  }

  // Lose a life
  function loseLife(world: any, playerId: string, state: PlayerGameState, reason: string) {
    if (state.isGameOver) return;

    state.lives--;
    
    new Audio({
      uri: 'audio/mcorder/Drop.mp3',
      volume: 0.6,
    }).play(world);

    world.chatManager.sendPlayerMessage(
      state.player,
      `Mistake! ${reason} Lives remaining: ${state.lives}`,
      'FF0000'
    );

    if (state.lives <= 0) {
      endGame(world, playerId, state);
    } else {
      // Reset current order progress
      state.orderProgress = 0;
      world.chatManager.sendPlayerMessage(
        state.player,
        `Order reset. Try again!`,
        'FFFF00'
      );
    }
  }

  // End game
  function endGame(world: any, playerId: string, state: PlayerGameState) {
    state.isGameOver = true;
    
    if (state.orderTimer) {
      clearTimeout(state.orderTimer);
    }

    clearWorldItems(state);

    gameOverMusic.play(world);

    world.chatManager.sendPlayerMessage(
      state.player,
      `Game Over! Final Score: ${state.score}`,
      'FF0000'
    );
  }

  // Game loop - check for item collection and prevent falling
  world.on(WorldEvent.TICK, () => {
    playerGameStates.forEach((state, playerId) => {
      if (state.isGameOver) return;
      if (!state || !state.player) return;

      const playerEntities = world.entityManager.getPlayerEntitiesByPlayer(state.player);
      if (playerEntities.length === 0) return;

      const playerEntity = playerEntities[0];
      const playerPos = playerEntity.position;

      // Prevent player from falling - teleport back if too low
      if (playerPos.y < GAME_CONFIG.MIN_SAFE_Y) {
        playerEntity.position = {
          x: playerPos.x,
          y: GAME_CONFIG.SAFE_SPAWN_Y,
          z: playerPos.z,
        };
        world.chatManager.sendPlayerMessage(
          state.player,
          'Teleported back to safe area!',
          'FFFF00'
        );
      }

      // Check distance to each item - collect when player walks over them
      state.worldItems.forEach(item => {
        if (!item.isSpawned) return;

        const itemPos = item.position;
        const distance = Math.sqrt(
          Math.pow(itemPos.x - playerPos.x, 2) +
          Math.pow(itemPos.y - playerPos.y, 2) +
          Math.pow(itemPos.z - playerPos.z, 2)
        );

        // Check if player is close enough to collect (walking over the item)
        // Use horizontal distance mainly (ignore Y difference for easier collection)
        const horizontalDistance = Math.sqrt(
          Math.pow(itemPos.x - playerPos.x, 2) +
          Math.pow(itemPos.z - playerPos.z, 2)
        );
        
        const verticalDistance = Math.abs(itemPos.y - playerPos.y);

        // Collect if player is close horizontally and not too far vertically
        if (horizontalDistance < GAME_CONFIG.ITEM_COLLECTION_DISTANCE && verticalDistance < 3.0) {
          // Extract item code from entity name
          const nameParts = item.name.split('-');
          if (nameParts.length >= 2) {
            const itemCode = nameParts[1];
            processItemCollection(world, playerId, state, item, itemCode);
          }
        }
      });
    });
  });

  // Handle player joining
  world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
    const playerId = player.id;
    const state = initGameState(player);
    playerGameStates.set(playerId, state);

    const playerEntity = new DefaultPlayerEntity({
      player,
      name: 'Player',
    });

    playerEntity.spawn(world, { x: 0, y: 10, z: 0 });
    
    // Verify map loaded - send confirmation message
    world.chatManager.sendPlayerMessage(player, 'Map loaded successfully!', '00FF00');

    // Load UI
    player.ui.load('ui/index.html');

    // Welcome messages in English
    world.chatManager.sendPlayerMessage(player, 'Welcome to McOrder Dash!', '00FF00');
    world.chatManager.sendPlayerMessage(player, 'Click "START GAME" button or type /restart in chat to begin!', '00FF00');
    world.chatManager.sendPlayerMessage(player, 'Items will spawn near you in a controlled testing area!', '00FF00');
    world.chatManager.sendPlayerMessage(player, 'Walk close to items to collect them. Complete orders to earn points!', '00FF00');
    world.chatManager.sendPlayerMessage(player, 'You cannot fall - you will be teleported back if you go too low!', '00FF00');
    
    // Don't start game automatically - wait for button click
    state.isGameOver = true;
  });

  // Handle player leaving
  world.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
    const playerId = player.id;
    const state = playerGameStates.get(playerId);
    
    if (state) {
      if (state.orderTimer) {
        clearTimeout(state.orderTimer);
      }
      
      clearWorldItems(state);
    }
    
    playerGameStates.delete(playerId);
    
    world.entityManager.getPlayerEntitiesByPlayer(player).forEach(entity => entity.despawn());
  });

  // Command to start/restart game
  world.chatManager.registerCommand('/restart', player => {
    const playerId = player.id;
    let state = playerGameStates.get(playerId);
    
    if (!state) {
      state = initGameState(player);
      playerGameStates.set(playerId, state);
    }
    
    // Clean up
    if (state.orderTimer) {
      clearTimeout(state.orderTimer);
    }
    clearWorldItems(state);
    
    // Reset state
    state.score = 0;
    state.lives = 3;
    state.currentOrder = [];
    state.orderProgress = 0;
    state.orderCount = 0;
    state.isGameOver = false;
    
    world.chatManager.sendPlayerMessage(player, 'Game started! Get ready to explore!', '00FF00');
    setTimeout(() => {
      startNewOrder(world, playerId, state);
    }, 1000);
  });
});
