import type { Entity, Player } from 'hytopia';
import { GAME_CONFIG } from '../gameConfig';

export interface PlayerGameState {
  score: number;
  lives: number;
  currentOrder: string[];
  orderProgress: number;
  orderCount: number;
  isGameOver: boolean;
  worldItems: Entity[];
  orderTimer?: NodeJS.Timeout;
  nearbyItemsNotified: Set<string>;
  player: Player;
}

