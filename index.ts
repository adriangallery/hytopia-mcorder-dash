/**
 * HYTOPIA - McOrder Dash Game
 * 
 * Adaptation of "Adrian's McOrder Dash" game to HYTOPIA 3D environment
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
  LANE_COUNT: 3,
  LANE_POSITIONS: [-5, 0, 5], // X positions of the 3 lanes
  SPAWN_HEIGHT: 30, // Height from where items fall
  FALL_SPEED_INITIAL: 0.3,
  FALL_SPEED_INCREMENT_PER_TIER: 0.1,
  DROP_INTERVAL_INITIAL: 2000, // ms
  DROP_INTERVAL_DECREMENT_PER_TIER: 200,
  SCORE_PER_ITEM: 10,
  SCORE_PER_ORDER: 100,
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
  fallSpeed: number;
  dropInterval: number;
  isGameOver: boolean;
  fallingItems: Entity[];
  itemDropTimer?: NodeJS.Timeout;
  managerEntity?: Entity;
  playerDirection: 'left' | 'right';
  player: any; // Store player reference
}

const playerGameStates = new Map<string, PlayerGameState>();

startServer(world => {
  world.loadMap(worldMap);

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
      fallSpeed: GAME_CONFIG.FALL_SPEED_INITIAL,
      dropInterval: GAME_CONFIG.DROP_INTERVAL_INITIAL,
      isGameOver: false,
      fallingItems: [],
      playerDirection: 'right',
      player: player,
    };
  }

  // Create manager billboard entity
  function createManagerEntity(world: any, playerId: string, direction: 'left' | 'right'): Entity {
    const textureUri = direction === 'left' 
      ? 'mcorder/Manager_L.png' 
      : 'mcorder/Manager_R.png';
    
    // Create a simple entity that will represent the manager
    // For now, we'll use a block entity as a placeholder
    // In a full implementation, this would be a billboard entity
    const manager = new Entity({
      name: `manager-${playerId}`,
      blockTextureUri: textureUri,
      blockHalfExtents: { x: 0.5, y: 1, z: 0.1 },
    });
    
    return manager;
  }

  // Spawn a falling item
  function spawnFallingItem(world: any, itemCode: string, laneIndex: number, playerId: string): Entity | null {
    const itemType = GAME_CONFIG.ITEM_TYPES[itemCode as keyof typeof GAME_CONFIG.ITEM_TYPES];
    if (!itemType) return null;

    const laneX = GAME_CONFIG.LANE_POSITIONS[laneIndex];
    
    const item = new Entity({
      name: `item-${itemCode}-${Date.now()}`,
      blockTextureUri: itemType.textureUri,
      blockHalfExtents: { x: 0.3, y: 0.3, z: 0.3 },
    });

    item.spawn(world, {
      x: laneX,
      y: GAME_CONFIG.SPAWN_HEIGHT,
      z: 0,
    });

    // Make it fall with physics
    item.rigidBodyOptions = {
      type: 'dynamic',
      mass: 1,
    };

    return item;
  }

  // Start new order
  function startNewOrder(world: any, playerId: string, state: PlayerGameState) {
    state.orderCount++;

    // Increase difficulty every 3 orders
    if (state.orderCount > 1 && (state.orderCount - 1) % 3 === 0) {
      state.fallSpeed = Math.min(
        state.fallSpeed + GAME_CONFIG.FALL_SPEED_INCREMENT_PER_TIER,
        1.0
      );
      state.dropInterval = Math.max(
        state.dropInterval - GAME_CONFIG.DROP_INTERVAL_DECREMENT_PER_TIER,
        500
      );
    }

    if (state.orderCount === 1) {
      state.currentOrder = GAME_CONFIG.ORDERS[0];
    } else {
      const randomIndex = Math.floor(Math.random() * (GAME_CONFIG.ORDERS.length - 1)) + 1;
      state.currentOrder = GAME_CONFIG.ORDERS[randomIndex];
    }

    state.orderProgress = 0;

    // Update UI
    world.chatManager.sendPlayerMessage(
      state.player,
      `New Order: ${state.currentOrder.map(c => GAME_CONFIG.ITEM_TYPES[c as keyof typeof GAME_CONFIG.ITEM_TYPES].name).join(', ')}`,
      'FFFF00'
    );

    // Start item dropping
    if (state.itemDropTimer) {
      clearInterval(state.itemDropTimer);
    }
    state.itemDropTimer = setInterval(() => {
      if (state.isGameOver) return;
      if (state.fallingItems.length > 0) return; // Only one item at a time

      const isOrderPending = state.orderProgress < state.currentOrder.length;
      let itemCode: string;

      if (isOrderPending) {
        const requiredItemCode = state.currentOrder[state.orderProgress];
        
        if (state.orderCount === 1) {
          // Tutorial: always drop required item
          itemCode = requiredItemCode;
        } else {
          // Weighted: required item is more likely
          const itemCodes = Object.keys(GAME_CONFIG.ITEM_TYPES);
          const weightedDrops: string[] = [];
          weightedDrops.push(requiredItemCode, requiredItemCode, requiredItemCode, requiredItemCode);
          itemCodes.forEach(code => {
            if (code !== requiredItemCode) {
              weightedDrops.push(code);
            }
          });
          const randomIndex = Math.floor(Math.random() * weightedDrops.length);
          itemCode = weightedDrops[randomIndex];
        }
      } else {
        // Random item when order is complete
        const itemCodes = Object.keys(GAME_CONFIG.ITEM_TYPES);
        itemCode = itemCodes[Math.floor(Math.random() * itemCodes.length)];
      }

      const randomLane = Math.floor(Math.random() * GAME_CONFIG.LANE_COUNT);
      const item = spawnFallingItem(world, itemCode, randomLane, playerId);
      
      if (item) {
        state.fallingItems.push(item);
      }
    }, state.dropInterval);
  }

  // Process item catch
  function processCatch(world: any, playerId: string, state: PlayerGameState, item: Entity, itemCode: string) {
    if (state.orderProgress === state.currentOrder.length) {
      return; // Order already fulfilled
    }

    const requiredItemCode = state.currentOrder[state.orderProgress];

    if (itemCode === requiredItemCode) {
      // Correct catch!
      state.orderProgress++;
      state.score += GAME_CONFIG.SCORE_PER_ITEM;

      // Play catch sound
      new Audio({
        uri: 'audio/mcorder/Triple Bleep.mp3',
        volume: 0.55,
      }).play(world);

      world.chatManager.sendPlayerMessage(
        state.player,
        `Correct! +${GAME_CONFIG.SCORE_PER_ITEM} points`,
        '00FF00'
      );

      if (state.orderProgress === state.currentOrder.length) {
        // Order fulfilled!
        state.score += GAME_CONFIG.SCORE_PER_ORDER;
        world.chatManager.sendPlayerMessage(
          state.player,
          `Order Complete! +${GAME_CONFIG.SCORE_PER_ORDER} bonus points`,
          '00FF00'
        );

        setTimeout(() => {
          startNewOrder(world, playerId, state);
        }, 1000);
      }
    } else {
      // Wrong item
      loseLife(world, playerId, state, `Wrong item! Expected ${GAME_CONFIG.ITEM_TYPES[requiredItemCode as keyof typeof GAME_CONFIG.ITEM_TYPES].name}`);
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
      `Mistake! ${reason} Lives: ${state.lives}`,
      'FF0000'
    );

    if (state.lives <= 0) {
      endGame(world, playerId, state);
    }
  }

  // End game
  function endGame(world: any, playerId: string, state: PlayerGameState) {
    state.isGameOver = true;
    
    if (state.itemDropTimer) {
      clearInterval(state.itemDropTimer);
    }

    // Despawn all falling items
    state.fallingItems.forEach(item => {
      if (item.isSpawned) {
        item.despawn();
      }
    });
    state.fallingItems = [];

    gameOverMusic.play(world);

    world.chatManager.sendPlayerMessage(
      state.player,
      `Game Over! Final Score: ${state.score}`,
      'FF0000'
    );
  }

  // Game loop - check collisions and update falling items
  world.on(WorldEvent.TICK, () => {
    playerGameStates.forEach((state, playerId) => {
      if (state.isGameOver) return;
      if (!state || !state.player) return;

      const playerEntities = world.entityManager.getPlayerEntitiesByPlayer(state.player);
      if (playerEntities.length === 0) return;

      const playerEntity = playerEntities[0];
      const playerPos = playerEntity.position;

      // Update falling items
      state.fallingItems = state.fallingItems.filter(item => {
        if (!item.isSpawned) return false;

        const itemPos = item.position;
        const distance = Math.sqrt(
          Math.pow(itemPos.x - playerPos.x, 2) +
          Math.pow(itemPos.y - playerPos.y, 2) +
          Math.pow(itemPos.z - playerPos.z, 2)
        );

        // Check collision (player touching item)
        if (distance < 1.5) {
          // Determine item code from entity name
          const itemCode = item.name.split('-')[1];
          processCatch(world, playerId, state, item, itemCode);
          item.despawn();
          return false;
        }

        // Check if item fell too low
        if (itemPos.y < -5) {
          const requiredItemCode = state.currentOrder[state.orderProgress];
          const itemCode = item.name.split('-')[1];
          
          if (itemCode === requiredItemCode && state.orderProgress < state.currentOrder.length) {
            loseLife(world, playerId, state, `Missed ${GAME_CONFIG.ITEM_TYPES[itemCode as keyof typeof GAME_CONFIG.ITEM_TYPES].name}!`);
          }
          
          item.despawn();
          return false;
        }

        return true;
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

    // Create manager entity
    const managerEntity = createManagerEntity(world, playerId, 'right');
    managerEntity.spawn(world, { x: 0, y: 10, z: 0 });
    state.managerEntity = managerEntity;

    // Load UI
    player.ui.load('ui/index.html');

    // Welcome message - game starts when player clicks button or types /restart
    world.chatManager.sendPlayerMessage(player, 'Welcome to McOrder Dash!', '00FF00');
    world.chatManager.sendPlayerMessage(player, 'Click "START GAME" button or type /restart in chat to begin!', '00FF00');
    world.chatManager.sendPlayerMessage(player, 'Move around to catch falling food items in the correct order!', '00FF00');
    
    // Don't start game automatically - wait for button click
    state.isGameOver = true;
  });

  // Handle player leaving
  world.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
    const playerId = player.id;
    const state = playerGameStates.get(playerId);
    
    if (state) {
      if (state.itemDropTimer) {
        clearInterval(state.itemDropTimer);
      }
      
      state.fallingItems.forEach(item => {
        if (item.isSpawned) {
          item.despawn();
        }
      });
      
      if (state.managerEntity && state.managerEntity.isSpawned) {
        state.managerEntity.despawn();
      }
    }
    
    playerGameStates.delete(playerId);
    
    world.entityManager.getPlayerEntitiesByPlayer(player).forEach(entity => entity.despawn());
  });

  // Command to start/restart game
  world.chatManager.registerCommand('/restart', player => {
    const playerId = player.id;
    let state = playerGameStates.get(playerId);
    
    if (!state) {
      // Create state if it doesn't exist
      state = initGameState(player);
      playerGameStates.set(playerId, state);
    }
    
    // Clean up
    if (state.itemDropTimer) {
      clearInterval(state.itemDropTimer);
    }
    state.fallingItems.forEach(item => {
      if (item.isSpawned) {
        item.despawn();
      }
    });
    
    // Reset state
    state.score = 0;
    state.lives = 3;
    state.currentOrder = [];
    state.orderProgress = 0;
    state.orderCount = 0;
    state.fallSpeed = GAME_CONFIG.FALL_SPEED_INITIAL;
    state.dropInterval = GAME_CONFIG.DROP_INTERVAL_INITIAL;
    state.isGameOver = false;
    state.fallingItems = [];
    
    world.chatManager.sendPlayerMessage(player, 'Game started! Get ready!', '00FF00');
    setTimeout(() => {
      startNewOrder(world, playerId, state);
    }, 1000);
  });
});
