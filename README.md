# McOrder Dash - HYTOPIA Game

A 3D exploration-based order fulfillment game for HYTOPIA platform.

## Description

McOrder Dash is an exploration game where players must find food items scattered around a small world in the correct order to complete customer orders. The game features:

- 3D Minecraft-style environment
- Exploration-based gameplay
- Multiple food items (Burger, Fries, Nuggets, Drink, Ice Cream)
- Time-limited orders
- Score and lives system
- Custom UI with order display

## Installation

1. Make sure you have Node.js installed
2. Install HYTOPIA CLI globally:
   ```bash
   npm install -g --force hytopia@latest
   ```
3. Install KTX Software (required for texture optimization)
4. Install project dependencies:
   ```bash
   npm install
   ```

## Running the Game

Start the development server:
```bash
hytopia start
```

The server will be available at `https://dev-local.hytopia.com:8080`

To play, go to https://hytopia.com/play and connect to your local server.

## Game Controls

- **WASD**: Move around
- **Space**: Jump
- **Shift**: Sprint
- **Mouse**: Look around

## Gameplay

1. Click "START GAME" button when you join
2. A new order will appear showing which items you need to find
3. Food items will be scattered randomly around the world
4. Explore the world and walk close to items to collect them
5. Collect items in the correct order shown at the top
6. Complete orders to earn points
7. You have 60 seconds per order
8. Avoid mistakes or you'll lose lives
9. Game gets more challenging as you complete more orders

## Project Structure

```
hytopia/
├── assets/
│   ├── audio/mcorder/     # Game audio files
│   ├── blocks/mcorder/    # Food item textures
│   ├── mcorder/           # Manager sprites
│   └── ui/                # Game UI
├── examples/              # Original game files
├── index.ts               # Main game logic
└── package.json
```

## Version Control

This project uses Git for version control and is hosted on GitHub:
**https://github.com/adriangallery/hytopia-mcorder-dash**

To revert changes:

```bash
# View commit history
git log

# Revert to a previous commit
git checkout <commit-hash>

# Create a new branch
git checkout -b feature/new-feature

# Push changes to GitHub
git push origin main
```

## Development

- Game logic: `index.ts`
- UI: `assets/ui/index.html`
- Map configuration: `assets/map.json`
- Custom blocks: Defined in `map.json` (IDs 17-21)

## Game Mechanics

- Items spawn randomly within world bounds (-20 to 20 on X and Z axes)
- Items are placed at height 3 above ground level
- Players must walk within 2.5 blocks of an item to collect it
- Each order has a 60-second time limit
- Wrong items or timeouts result in losing a life
- 3 lives total, game over when all lives are lost

## License

This is a personal project adaptation.
