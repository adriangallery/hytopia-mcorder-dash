/**
 * HYTOPIA - Item Collector Game
 * 
 * Simple, addictive collection game: Walk over items to collect them!
 * More items = More points. Don't let them disappear!
 */

import { startServer, DefaultPlayerEntity, DefaultPlayerEntityController, PlayerEvent, Entity, WorldEvent, Audio, BaseEntityControllerEvent, EventPayloads } from 'hytopia';
import worldMap from './assets/map.json';

// Game Configuration
const CONFIG = {
  ITEM_SPAWN_INTERVAL: 2000, // Spawn new item every 2 seconds
  ITEM_LIFETIME: 8000, // Items disappear after 8 seconds
  ITEM_SPAWN_RADIUS: 15, // Items spawn within 15 blocks of player
  COLLECTION_DISTANCE: 4.0, // Distance to collect item (increased for easier collection)
  COLLECTION_VERTICAL_TOLERANCE: 5.0, // Vertical distance tolerance
  POINTS_PER_ITEM: 10,
  POINTS_PER_ORDER: 50, // Bonus for completing an order
  COMBO_MULTIPLIER: 1.5, // Bonus for collecting items quickly
  COMBO_TIME_WINDOW: 3000, // 3 seconds to maintain combo
  MIN_SPAWN_HEIGHT: 10,
  MAX_SPAWN_HEIGHT: 12,
  ORDER_LENGTH: 3, // Number of items in each order
};

interface PlayerState {
  score: number;
  combo: number;
  lastCollectionTime: number;
  items: Entity[];
  player: any;
  currentOrder: string[]; // Order of items to collect
  orderProgress: number; // Current position in order
  orderItems: Map<Entity, string>; // Map items to their required order
  musicMuted: boolean; // Music mute state
}

const playerStates = new Map<string, PlayerState>();

// Helper function to get item name from code
function getItemName(code: string): string {
  const itemTypes: Record<string, string> = {
    'B': 'Burger',
    'F': 'Fries',
    'D': 'Drink',
    'N': 'Nuggets',
    'I': 'Ice Cream',
  };
  return itemTypes[code] || code;
}

// Generate a new order for the player
function generateNewOrder(state: PlayerState) {
  const allCodes = ['B', 'F', 'D', 'N', 'I'];
  state.currentOrder = [];
  
  for (let i = 0; i < CONFIG.ORDER_LENGTH; i++) {
    const randomCode = allCodes[Math.floor(Math.random() * allCodes.length)];
    state.currentOrder.push(randomCode);
  }
  
  state.orderProgress = 0;
  state.orderItems.clear();
  
  // Mark items in the world that match the order
  state.items.forEach(item => {
    const itemCode = (item as any).itemCode;
    if (state.currentOrder.includes(itemCode)) {
      state.orderItems.set(item, itemCode);
    }
  });
  
  const orderText = state.currentOrder.map(c => getItemName(c)).join(' → ');
  if (state.player) {
    state.player.ui.sendData({
      type: 'update',
      score: state.score,
      combo: state.combo,
      currentOrder: state.currentOrder,
      orderProgress: 0,
    });
  }
}

// Spawn a collectible item near the player
function spawnItem(world: any, playerPos: { x: number; y: number; z: number }): Entity {
  const angle = Math.random() * Math.PI * 2;
  const distance = 3 + Math.random() * (CONFIG.ITEM_SPAWN_RADIUS - 3);
  
  const x = playerPos.x + Math.cos(angle) * distance;
  const z = playerPos.z + Math.sin(angle) * distance;
  const y = CONFIG.MIN_SPAWN_HEIGHT + Math.random() * (CONFIG.MAX_SPAWN_HEIGHT - CONFIG.MIN_SPAWN_HEIGHT);

  // Random item type
  const itemTypes = [
    { texture: 'blocks/mcorder/Burger.png', color: 'FF6B6B', name: 'Burger', code: 'B' },
    { texture: 'blocks/mcorder/Fries.png', color: 'FFD93D', name: 'Fries', code: 'F' },
    { texture: 'blocks/mcorder/Coke.png', color: '6BCF7F', name: 'Drink', code: 'D' },
    { texture: 'blocks/mcorder/Nuggets.png', color: '4ECDC4', name: 'Nuggets', code: 'N' },
    { texture: 'blocks/mcorder/Ice.png', color: '95E1D3', name: 'Ice Cream', code: 'I' },
  ];
  
  const itemType = itemTypes[Math.floor(Math.random() * itemTypes.length)];

  // Spawn as dynamic first so it falls to ground
  const item = new Entity({
    name: `item-${itemType.code}-${Date.now()}-${Math.random()}`,
    blockTextureUri: itemType.texture,
    blockHalfExtents: { x: 0.4, y: 0.4, z: 0.4 },
    rigidBodyOptions: { 
      type: 'dynamic', // Dynamic first so it falls
      mass: 0.3,
    },
    tag: 'collectible',
  });

  item.spawn(world, { x, y, z });
  
  // Store item type code and name in the entity for order checking
  (item as any).itemCode = itemType.code;
  (item as any).itemName = itemType.name;
  (item as any).hasLanded = false; // Track if item has landed on ground

  // After a short delay, make it fixed so it can't be pushed
  setTimeout(() => {
    if (item.isSpawned && item.rigidBodyOptions) {
      item.rigidBodyOptions.type = 'fixed';
      (item as any).hasLanded = true;
    }
  }, 1000); // 1 second to fall to ground

  // Make item disappear after lifetime
  setTimeout(() => {
    if (item.isSpawned) {
      item.despawn();
    }
  }, CONFIG.ITEM_LIFETIME);

  return item;
}

startServer(world => {
  // Load map
  try {
    world.loadMap(worldMap);
    console.log('✅ Map loaded successfully');
  } catch (error) {
    console.error('❌ Error loading map:', error);
  }

  // Background music - stored per world
  const bgMusic = new Audio({
    uri: 'audio/mcorder/Let Me See Ya Bounce.mp3',
    loop: true,
    volume: 0.3,
  });
  bgMusic.play(world);
  
  // Store music reference globally for mute control
  (world as any).bgMusic = bgMusic;

  // Collection sound
  const collectSound = new Audio({
    uri: 'audio/mcorder/Triple Bleep.mp3',
    volume: 0.5,
  });

  // Function to try collecting nearest item
  function tryCollectItem(world: any, state: PlayerState, playerPos: { x: number; y: number; z: number }): boolean {
    let nearestItem: Entity | null = null;
    let nearestDistance = Infinity;

    // Find nearest collectible item
    for (let i = state.items.length - 1; i >= 0; i--) {
      const item = state.items[i];
      
      if (!item.isSpawned) {
        state.items.splice(i, 1);
        state.orderItems.delete(item);
        continue;
      }

      const itemPos = item.position;
      const horizontalDistance = Math.sqrt(
        Math.pow(itemPos.x - playerPos.x, 2) +
        Math.pow(itemPos.z - playerPos.z, 2)
      );
      const verticalDistance = Math.abs(itemPos.y - playerPos.y);

      if (horizontalDistance < CONFIG.COLLECTION_DISTANCE && 
          verticalDistance < CONFIG.COLLECTION_VERTICAL_TOLERANCE &&
          horizontalDistance < nearestDistance) {
        nearestItem = item;
        nearestDistance = horizontalDistance;
      }
    }

    if (!nearestItem) return false;

    const itemCode = (nearestItem as any).itemCode;
    const itemName = (nearestItem as any).itemName || 'Item';
    
    // Check if this item is part of the current order
    const isInOrder = state.orderItems.has(nearestItem);
    const requiredCode = state.currentOrder[state.orderProgress];
    
    // Check if it's the correct item in order
    if (isInOrder && itemCode === requiredCode) {
      // Correct item in order!
      state.orderProgress++;
      
      const now = Date.now();
      const timeSinceLastCollection = now - state.lastCollectionTime;
      
      // Check for combo
      if (timeSinceLastCollection < CONFIG.COMBO_TIME_WINDOW) {
        state.combo++;
      } else {
        state.combo = 1;
      }

      // Calculate points with combo bonus
      const basePoints = CONFIG.POINTS_PER_ITEM;
      const comboBonus = state.combo > 1 ? Math.floor(basePoints * (state.combo - 1) * 0.5) : 0;
      let totalPoints = basePoints + comboBonus;
      
      // Check if order is complete
      if (state.orderProgress >= state.currentOrder.length) {
        // Order complete bonus!
        totalPoints += CONFIG.POINTS_PER_ORDER;
        state.score += totalPoints;
        
        world.chatManager.sendPlayerMessage(
          state.player,
          `🎉 ORDER COMPLETE! +${totalPoints} points!`,
          '00FF00'
        );
        
        // Start new order
        generateNewOrder(state);
      } else {
        state.score += totalPoints;
        
        const comboText = state.combo > 1 ? ` COMBO x${state.combo}!` : '';
        const nextItem = getItemName(state.currentOrder[state.orderProgress]);
        world.chatManager.sendPlayerMessage(
          state.player,
          `+${totalPoints} points!${comboText} Next: ${nextItem}`,
          state.combo > 1 ? 'FFD700' : '00FF00'
        );
      }
      
      state.lastCollectionTime = now;

      // Play sound
      collectSound.play(world, true);

      // Update UI
      state.player.ui.sendData({
        type: 'update',
        score: state.score,
        combo: state.combo,
        currentOrder: state.currentOrder,
        orderProgress: state.orderProgress,
      });

      // Remove item
      const itemIndex = state.items.indexOf(nearestItem);
      if (itemIndex >= 0) {
        nearestItem.despawn();
        state.items.splice(itemIndex, 1);
        state.orderItems.delete(nearestItem);
      }
      
      return true;
    } else if (isInOrder && itemCode !== requiredCode) {
      // Wrong item in order
      world.chatManager.sendPlayerMessage(
        state.player,
        `❌ Wrong item! Need: ${getItemName(requiredCode)}`,
        'FF0000'
      );
      return false;
    } else if (!isInOrder) {
      // Item not in order
      world.chatManager.sendPlayerMessage(
        state.player,
        `⚠️ This item is not in your current order!`,
        'FFFF00'
      );
      return false;
    }
    
    return false;
  }

  // Game loop - check for item collection
  world.on(WorldEvent.TICK, () => {
    playerStates.forEach((state, playerId) => {
      if (!state || !state.player) return;

      const playerEntities = world.entityManager.getPlayerEntitiesByPlayer(state.player);
      if (playerEntities.length === 0) return;

      const playerEntity = playerEntities[0];
      const playerPos = playerEntity.position;

      // Clean up despawned items
      for (let i = state.items.length - 1; i >= 0; i--) {
        const item = state.items[i];
        if (!item.isSpawned) {
          state.items.splice(i, 1);
          state.orderItems.delete(item);
        }
      }

      // Prevent falling
      if (playerPos.y < -5) {
        playerEntity.position = {
          x: playerPos.x,
          y: 10,
          z: playerPos.z,
        };
      }
    });
  });

  // Handle player joining
  world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
    const playerId = player.id;
    
    const state: PlayerState = {
      score: 0,
      combo: 0,
      lastCollectionTime: 0,
      items: [],
      player: player,
      currentOrder: [],
      orderProgress: 0,
      orderItems: new Map(),
      musicMuted: false,
    };
    
    playerStates.set(playerId, state);
    
    // Generate initial order
    generateNewOrder(state);

    const playerEntity = new DefaultPlayerEntity({
      player,
      name: 'Player',
    });

    playerEntity.spawn(world, { x: 0, y: 10, z: 0 });

    // Setup E key handler for collection
    const controller = playerEntity.controller as DefaultPlayerEntityController;
    if (controller) {
      controller.on(BaseEntityControllerEvent.TICK_WITH_PLAYER_INPUT, (payload: EventPayloads[BaseEntityControllerEvent.TICK_WITH_PLAYER_INPUT]) => {
        const { input } = payload;
        
        // Check for E key press
        if (input.e) {
          const playerPos = playerEntity.position;
          const collected = tryCollectItem(world, state, playerPos);
          
          if (!collected) {
            // Only show message if there are items nearby but wrong
            const hasNearbyItems = state.items.some(item => {
              if (!item.isSpawned) return false;
              const itemPos = item.position;
              const horizontalDistance = Math.sqrt(
                Math.pow(itemPos.x - playerPos.x, 2) +
                Math.pow(itemPos.z - playerPos.z, 2)
              );
              return horizontalDistance < CONFIG.COLLECTION_DISTANCE;
            });
            
            if (!hasNearbyItems) {
              world.chatManager.sendPlayerMessage(player, 'No items nearby!', 'FFFF00');
            }
          }
          
          // Prevent default E key behavior
          input.e = false;
        }
      });
    }

    // Load UI
    player.ui.load('ui/index.html');

    // Welcome messages
    world.chatManager.sendPlayerMessage(player, '🎮 Welcome to Item Collector!', '00FF00');
    world.chatManager.sendPlayerMessage(player, 'Walk over items to collect them!', 'FFFF00');
    world.chatManager.sendPlayerMessage(player, 'Collect items quickly for COMBO bonuses!', 'FFD700');
    world.chatManager.sendPlayerMessage(player, 'Game starting now!', '00FF00');

    // Start spawning items
    const spawnInterval = setInterval(() => {
      const currentState = playerStates.get(playerId);
      if (!currentState) {
        clearInterval(spawnInterval);
        return;
      }

      const playerEntities = world.entityManager.getPlayerEntitiesByPlayer(player);
      if (playerEntities.length > 0) {
        const playerPos = playerEntities[0].position;
        const item = spawnItem(world, playerPos);
        currentState.items.push(item);
        
        // Check if this item is part of the current order
        const itemCode = (item as any).itemCode;
        if (currentState.currentOrder.includes(itemCode)) {
          currentState.orderItems.set(item, itemCode);
        }
      }
    }, CONFIG.ITEM_SPAWN_INTERVAL);

    // Update UI
    player.ui.sendData({
      type: 'update',
      score: 0,
      combo: 0,
      currentOrder: state.currentOrder,
      orderProgress: 0,
    });
  });

  // Handle player leaving
  world.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
    const playerId = player.id;
    const state = playerStates.get(playerId);
    
    if (state) {
      // Clean up items
      state.items.forEach(item => {
        if (item.isSpawned) {
          item.despawn();
        }
      });
    }
    
    playerStates.delete(playerId);
    world.entityManager.getPlayerEntitiesByPlayer(player).forEach(entity => entity.despawn());
  });

  // Collect command - manual collection
  world.chatManager.registerCommand('/collect', player => {
    const playerId = player.id;
    const state = playerStates.get(playerId);
    
    if (!state) {
      world.chatManager.sendPlayerMessage(player, 'No active game state!', 'FF0000');
      return;
    }

    const playerEntities = world.entityManager.getPlayerEntitiesByPlayer(player);
    if (playerEntities.length === 0) {
      world.chatManager.sendPlayerMessage(player, 'Player entity not found!', 'FF0000');
      return;
    }

    const playerPos = playerEntities[0].position;
    const collected = tryCollectItem(world, state, playerPos);
    
    if (!collected) {
      world.chatManager.sendPlayerMessage(player, 'No collectible items nearby!', 'FFFF00');
    }
  });

  // Mute/Unmute music command
  world.chatManager.registerCommand('/mute', player => {
    const playerId = player.id;
    const state = playerStates.get(playerId);
    
    if (!state) return;
    
    state.musicMuted = !state.musicMuted;
    const bgMusic = (world as any).bgMusic;
    
    if (bgMusic) {
      if (state.musicMuted) {
        bgMusic.pause();
        world.chatManager.sendPlayerMessage(player, '🔇 Music muted', 'FFFF00');
      } else {
        bgMusic.play(world);
        world.chatManager.sendPlayerMessage(player, '🔊 Music unmuted', '00FF00');
      }
    }
    
    // Update UI
    player.ui.sendData({
      type: 'music-toggle',
      muted: state.musicMuted,
    });
  });

  // Restart command
  world.chatManager.registerCommand('/restart', player => {
    const playerId = player.id;
    const state = playerStates.get(playerId);
    
    if (state) {
      // Clean up items
      state.items.forEach(item => {
        if (item.isSpawned) {
          item.despawn();
        }
      });
      
      state.score = 0;
      state.combo = 0;
      state.items = [];
      state.orderItems.clear();
      // Keep musicMuted state on restart
      
      // Generate new order
      generateNewOrder(state);
      
      world.chatManager.sendPlayerMessage(player, 'Game restarted!', '00FF00');
      player.ui.sendData({
        type: 'update',
        score: 0,
        combo: 0,
        currentOrder: state.currentOrder,
        orderProgress: 0,
      });
    }
  });
});
