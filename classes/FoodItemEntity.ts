import { Entity } from 'hytopia';
import { GAME_CONFIG } from '../gameConfig';
import type { Vector3Like } from 'hytopia';
import type { World } from 'hytopia';

export default class FoodItemEntity {
  public static spawn(
    world: World,
    itemCode: string,
    playerId: string,
    playerPos: Vector3Like
  ): Entity | null {
    const itemType = GAME_CONFIG.ITEM_TYPES[itemCode as keyof typeof GAME_CONFIG.ITEM_TYPES];
    if (!itemType) {
      console.error(`Invalid item code: ${itemCode}`);
      return null;
    }

    const position = this.getRandomPositionNearPlayer(playerPos);
    
    // Create entity with real food texture - make it small and cubic
    const item = new Entity({
      name: `item-${itemCode}-${Date.now()}-${Math.random()}`,
      blockTextureUri: itemType.textureUri,
      blockHalfExtents: { x: 0.3, y: 0.3, z: 0.3 }, // Small cubic size
      rigidBodyOptions: {
        type: 'fixed', // Fixed so it can't be pushed or moved
      },
    });

    // Spawn the entity
    item.spawn(world, position);
    
    // Ensure it stays fixed after spawning
    if (item.rigidBodyOptions) {
      item.rigidBodyOptions.type = 'fixed';
    }

    console.log(`✅ Spawned item ${itemCode} (${itemType.name}) at position:`, position, 'using texture:', itemType.textureUri);
    console.log(`   Distance from player: ${Math.sqrt(Math.pow(position.x - playerPos.x, 2) + Math.pow(position.z - playerPos.z, 2)).toFixed(2)} blocks`);
    return item;
  }

  private static getRandomPositionNearPlayer(playerPos: Vector3Like): Vector3Like {
    // Generate position very close to player for testing (1-5 blocks away)
    const angle = Math.random() * Math.PI * 2;
    const distance = 1 + Math.random() * 4; // Min 1 block, max 5 blocks - very close!
    
    const x = playerPos.x + Math.cos(angle) * distance;
    const z = playerPos.z + Math.sin(angle) * distance;
    // Use player's Y position + spawn height so items are at ground level
    const y = playerPos.y + GAME_CONFIG.ITEM_SPAWN_HEIGHT;
    
    return { x, y, z };
  }
}

