import { Audio, Entity, GameServer, WorldEvent } from 'hytopia';
import type { World, Player } from 'hytopia';
import { GAME_CONFIG } from '../gameConfig';
import FoodItemEntity from './FoodItemEntity';
import type { PlayerGameState } from './types';

export default class GameManager {
  public static readonly instance = new GameManager();

  public world: World | undefined;
  private playerGameStates = new Map<string, PlayerGameState>();
  private backgroundMusic: Audio | undefined;
  private gameOverMusic: Audio | undefined;

  public setupGame(world: World) {
    this.world = world;

    // Background music
    this.backgroundMusic = new Audio({
      uri: 'audio/mcorder/Let Me See Ya Bounce.mp3',
      loop: true,
      volume: 0.35,
    });
    this.backgroundMusic.play(world);

    this.gameOverMusic = new Audio({
      uri: 'audio/mcorder/Game Over Music 1.mp3',
      loop: false,
      volume: 0.45,
    });

    // Game loop - check for item collection and prevent falling
    world.on(WorldEvent.TICK, () => {
      this.playerGameStates.forEach((state, playerId) => {
        if (!state || !state.player) return;

        const playerEntities = world.entityManager.getPlayerEntitiesByPlayer(state.player);
        if (playerEntities.length === 0) return;

        const playerEntity = playerEntities[0];
        const playerPos = playerEntity.position;

        if (state.isGameOver) return;

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

        // Check distance to each item - show info when nearby and collect when walking over
        state.worldItems.forEach(item => {
          if (!item.isSpawned) return;

          const itemPos = item.position;
          const horizontalDistance = Math.sqrt(
            Math.pow(itemPos.x - playerPos.x, 2) +
            Math.pow(itemPos.z - playerPos.z, 2)
          );
          
          const verticalDistance = Math.abs(itemPos.y - playerPos.y);

          // Extract item code from entity name
          const nameParts = item.name.split('-');
          if (nameParts.length < 2) return;
          const itemCode = nameParts[1];
          const itemType = GAME_CONFIG.ITEM_TYPES[itemCode as keyof typeof GAME_CONFIG.ITEM_TYPES];
          if (!itemType) return;

          // Show item info when player is nearby (5-8 blocks away)
          if (horizontalDistance < 8 && horizontalDistance > 3 && !state.nearbyItemsNotified.has(item.id)) {
            const isRequired = state.currentOrder[state.orderProgress] === itemCode;
            const status = isRequired ? '✅ REQUIRED NEXT!' : '❌ Wrong item';
            const color = isRequired ? '00FF00' : 'FF0000';
            
            world.chatManager.sendPlayerMessage(
              state.player,
              `${status} Nearby: ${itemType.name} (${itemCode}) - ${horizontalDistance.toFixed(1)} blocks away`,
              color
            );
            state.nearbyItemsNotified.add(item.id);
          }

          // Collect if player is close horizontally and not too far vertically
          if (horizontalDistance < GAME_CONFIG.ITEM_COLLECTION_DISTANCE && verticalDistance < 5.0) {
            console.log(`[COLLECTION] Attempting to collect item ${itemCode}: horizontal=${horizontalDistance.toFixed(2)}, vertical=${verticalDistance.toFixed(2)}`);
            
            if (item.isSpawned) {
              state.nearbyItemsNotified.delete(item.id);
              this.processItemCollection(world, playerId, state, item, itemCode);
            }
          }
        });
      });
    });
  }

  public initGameState(player: Player): PlayerGameState {
    return {
      score: 0,
      lives: 3,
      currentOrder: [],
      orderProgress: 0,
      orderCount: 0,
      isGameOver: false,
      worldItems: [],
      nearbyItemsNotified: new Set(),
      player: player,
    };
  }

  public getGameState(playerId: string): PlayerGameState | undefined {
    return this.playerGameStates.get(playerId);
  }

  public setGameState(playerId: string, state: PlayerGameState) {
    this.playerGameStates.set(playerId, state);
  }

  public removeGameState(playerId: string) {
    this.playerGameStates.delete(playerId);
  }

  public startNewOrder(world: World, playerId: string, state: PlayerGameState) {
    state.orderCount++;

    // Clear previous items
    this.clearWorldItems(state);
    
    // Reset notifications
    state.nearbyItemsNotified.clear();

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
    const itemsToSpawn: string[] = [];
    
    // Add required items
    state.currentOrder.forEach(itemCode => {
      itemsToSpawn.push(itemCode);
    });
    
    // Add some random extra items
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
      const item = FoodItemEntity.spawn(world, itemCode, playerId, playerPos);
      if (item) {
        state.worldItems.push(item);
        spawnedCount++;
      }
    });

    // Send message to player
    world.chatManager.sendPlayerMessage(
      state.player,
      `📋 New Order: Find ${state.currentOrder.map(c => GAME_CONFIG.ITEM_TYPES[c as keyof typeof GAME_CONFIG.ITEM_TYPES].name).join(' → ')}`,
      'FFFF00'
    );
    world.chatManager.sendPlayerMessage(
      state.player,
      `✅ Spawned ${spawnedCount} items very close to you (1-5 blocks away)!`,
      '00FF00'
    );
    world.chatManager.sendPlayerMessage(
      state.player,
      `🎯 HOW TO COLLECT: Walk over the colored blocks! You'll see a message when you're near one.`,
      '00FFFF'
    );
    world.chatManager.sendPlayerMessage(
      state.player,
      `🔍 Item Colors: 🔴 Red=BURGER | 🟢 Light Green=FRIES | ⚪ Gray=NUGGETS | 🟡 Yellow=DRINK | 🟢 Dark Green=ICECREAM`,
      'FFFF00'
    );

    // Set timer for order completion
    state.orderTimer = setTimeout(() => {
      if (!state.isGameOver && state.orderProgress < state.currentOrder.length) {
        this.loseLife(world, playerId, state, 'Time ran out!');
      }
    }, GAME_CONFIG.TIME_LIMIT_PER_ORDER);
  }

  private processItemCollection(world: World, playerId: string, state: PlayerGameState, item: Entity, itemCode: string) {
    if (!item || !item.isSpawned) {
      console.log(`[COLLECTION] Item ${itemCode} is no longer valid`);
      return;
    }
    
    if (state.orderProgress === state.currentOrder.length) {
      console.log(`[COLLECTION] Order already fulfilled`);
      return;
    }

    const requiredItemCode = state.currentOrder[state.orderProgress];

    if (itemCode === requiredItemCode) {
      console.log(`[COLLECTION] ✅ Correct item collected: ${itemCode}`);
      state.orderProgress++;
      state.score += GAME_CONFIG.SCORE_PER_ITEM;

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
        `🎉 Collected ${GAME_CONFIG.ITEM_TYPES[itemCode as keyof typeof GAME_CONFIG.ITEM_TYPES].name}! +${GAME_CONFIG.SCORE_PER_ITEM} points`,
        '00FF00'
      );
      
      if (state.orderProgress < state.currentOrder.length) {
        const nextItem = GAME_CONFIG.ITEM_TYPES[state.currentOrder[state.orderProgress] as keyof typeof GAME_CONFIG.ITEM_TYPES];
        world.chatManager.sendPlayerMessage(
          state.player,
          `➡️ Next: Find ${nextItem.name}`,
          'FFFF00'
        );
      }

      // Remove item from world IMMEDIATELY
      try {
        if (item.isSpawned) {
          item.despawn();
        }
      } catch (e) {
        console.log('Error despawning item:', e);
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

        this.clearWorldItems(state);

        setTimeout(() => {
          this.startNewOrder(world, playerId, state);
        }, 2000);
      }
    } else {
      this.loseLife(world, playerId, state, `Wrong item! You need ${GAME_CONFIG.ITEM_TYPES[requiredItemCode as keyof typeof GAME_CONFIG.ITEM_TYPES].name} next`);
    }
  }

  private loseLife(world: World, playerId: string, state: PlayerGameState, reason: string) {
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
      this.endGame(world, playerId, state);
    } else {
      state.orderProgress = 0;
      world.chatManager.sendPlayerMessage(
        state.player,
        `Order reset. Try again!`,
        'FFFF00'
      );
    }
  }

  private endGame(world: World, playerId: string, state: PlayerGameState) {
    state.isGameOver = true;
    
    if (state.orderTimer) {
      clearTimeout(state.orderTimer);
    }

    this.clearWorldItems(state);

    if (this.gameOverMusic) {
      this.gameOverMusic.play(world);
    }

    world.chatManager.sendPlayerMessage(
      state.player,
      `Game Over! Final Score: ${state.score}`,
      'FF0000'
    );
  }

  private clearWorldItems(state: PlayerGameState) {
    state.worldItems.forEach(item => {
      if (item.isSpawned) {
        item.despawn();
      }
    });
    state.worldItems = [];
  }
}

