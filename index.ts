/**
 * HYTOPIA - McOrder Dash Game
 * 
 * Adaptation of "Adrian's McOrder Dash" game to HYTOPIA 3D environment
 * Players explore a small world to find food items in the correct order
 */

import { startServer, DefaultPlayerEntity, PlayerEvent } from 'hytopia';
import worldMap from './assets/map.json';
import GameManager from './classes/GameManager';

startServer(world => {
  // Load the standard HYTOPIA test map
  try {
    world.loadMap(worldMap);
    console.log('Map loaded successfully');
  } catch (error) {
    console.error('Error loading map:', error);
  }

  // Setup game
  GameManager.instance.setupGame(world);

  // Handle player joining
  world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
    const playerId = player.id;
    const state = GameManager.instance.initGameState(player);
    GameManager.instance.setGameState(playerId, state);

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
    world.chatManager.sendPlayerMessage(player, 'Game starting automatically in 2 seconds...', '00FF00');
    world.chatManager.sendPlayerMessage(player, 'Items will spawn near you! Walk over them to collect!', '00FF00');
    world.chatManager.sendPlayerMessage(player, 'You cannot fall - you will be teleported back if you go too low!', '00FF00');
    
    // Auto-start game after a short delay
    state.isGameOver = false;
    setTimeout(() => {
      GameManager.instance.startNewOrder(world, playerId, state);
    }, 2000);
  });

  // Handle player leaving
  world.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
    const playerId = player.id;
    const state = GameManager.instance.getGameState(playerId);
    
    if (state) {
      if (state.orderTimer) {
        clearTimeout(state.orderTimer);
      }
    }
    
    GameManager.instance.removeGameState(playerId);
    
    world.entityManager.getPlayerEntitiesByPlayer(player).forEach(entity => entity.despawn());
  });

  // Command to start/restart game
  world.chatManager.registerCommand('/restart', player => {
    const playerId = player.id;
    let state = GameManager.instance.getGameState(playerId);
    
    if (!state) {
      state = GameManager.instance.initGameState(player);
      GameManager.instance.setGameState(playerId, state);
    }
    
    // Clean up
    if (state.orderTimer) {
      clearTimeout(state.orderTimer);
    }
    
    // Reset state
    state.score = 0;
    state.lives = 3;
    state.currentOrder = [];
    state.orderProgress = 0;
    state.orderCount = 0;
    state.isGameOver = false;
    
    world.chatManager.sendPlayerMessage(player, 'Game started! Get ready to explore!', '00FF00');
    setTimeout(() => {
      GameManager.instance.startNewOrder(world, playerId, state);
    }, 1000);
  });
});
