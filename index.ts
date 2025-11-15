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
  SPAWN_RADIUS: 12, // Radius around player to spawn items (controlled testing area)
  ITEM_SPAWN_HEIGHT: 2.5, // Height above ground for items
  ITEM_COLLECTION_DISTANCE: 2.5, // Distance to collect item
  ITEMS_PER_ORDER: 5, // Number of items to spawn for each order
  SCORE_PER_ITEM: 10,
  SCORE_PER_ORDER: 100,
  TIME_LIMIT_PER_ORDER: 60000, // 60 seconds per order
  MIN_SAFE_Y: -5, // Minimum Y position before teleporting player back
  SAFE_SPAWN_Y: 10, // Safe Y position to teleport player to
  ITEM_TYPES: {
    'B': { blockId: 17, name: 'Burger', textureUri: 'blocks/mcorder/Burger.png' },
    'F': { blockId: 18, name: 'Fries', textureUri: 'blocks/mcorder/Fries.png' },
    'N': { blockId: 19, name: 'Nuggets', textureUri: 'blocks/mcorder/Nuggets.png' },
    'D': { blockId: 20, name: 'Drink', textureUri: 'blocks/mcorder/Coke.png' },
    'I': { blockId: 21, name: 'Icecream', textureUri: 'blocks/mcorder/Ice.png' },
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

// Generate random position near player (controlled testing area)
function getRandomPositionNearPlayer(playerPos: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  // Generate position within radius around player
  const angle = Math.random() * Math.PI * 2;
  const distance = 3 + Math.random() * (GAME_CONFIG.SPAWN_RADIUS - 3); // Min 3 blocks away, max SPAWN_RADIUS
  
  const x = playerPos.x + Math.cos(angle) * distance;
  const z = playerPos.z + Math.sin(angle) * distance;
  // Use a fixed height above typical ground level (Y=2) instead of relative to player
  const y = 2 + GAME_CONFIG.ITEM_SPAWN_HEIGHT;
  
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

  // Spawn an item in the world near the player
  function spawnWorldItem(world: any, itemCode: string, playerId: string, playerPos: { x: number; y: number; z: number }): Entity | null {
    const itemType = GAME_CONFIG.ITEM_TYPES[itemCode as keyof typeof GAME_CONFIG.ITEM_TYPES];
    if (!itemType) {
      console.error(`Invalid item code: ${itemCode}`);
      return null;
    }

    const position = getRandomPositionNearPlayer(playerPos);
    
    // Create entity with block texture - ensure texture path is correct
    const item = new Entity({
      name: `item-${itemCode}-${Date.now()}-${Math.random()}`,
      blockTextureUri: itemType.textureUri,
      blockHalfExtents: { x: 0.5, y: 0.5, z: 0.5 },
    });

    // Spawn the entity first
    item.spawn(world, position);

    // Set rigid body to fixed after spawning
    if (item.rigidBodyOptions) {
      item.rigidBodyOptions.type = 'fixed';
    }

    console.log(`Spawned item ${itemCode} at position:`, position, 'with texture:', itemType.textureUri);
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
      `Spawned ${spawnedCount} items around you! Walk close to collect them in order!`,
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
      new Audio({
        uri: 'audio/mcorder/Triple Bleep.mp3',
        volume: 0.55,
      }).play(world);

      world.chatManager.sendPlayerMessage(
        state.player,
        `Correct! Found ${GAME_CONFIG.ITEM_TYPES[itemCode as keyof typeof GAME_CONFIG.ITEM_TYPES].name}! +${GAME_CONFIG.SCORE_PER_ITEM} points`,
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

      // Check distance to each item
      state.worldItems.forEach(item => {
        if (!item.isSpawned) return;

        const itemPos = item.position;
        const distance = Math.sqrt(
          Math.pow(itemPos.x - playerPos.x, 2) +
          Math.pow(itemPos.y - playerPos.y, 2) +
          Math.pow(itemPos.z - playerPos.z, 2)
        );

        // Check if player is close enough to collect
        if (distance < GAME_CONFIG.ITEM_COLLECTION_DISTANCE) {
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
