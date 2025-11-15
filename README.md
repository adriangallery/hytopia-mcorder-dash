# McOrder Dash - HYTOPIA Game

A 3D adaptation of "Adrian's McOrder Dash" game for HYTOPIA platform.

## Description

McOrder Dash is a fast-paced order fulfillment game where players must catch falling food items in the correct order to complete customer orders. The game features:

- 3D Minecraft-style environment
- Multiple food items (Burger, Fries, Nuggets, Drink, Ice Cream)
- Progressive difficulty system
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
2. Food items will fall from above in 3 lanes
3. Move to catch items in the order shown at the top
4. Complete orders to earn points
5. Avoid mistakes or you'll lose lives
6. Game gets faster as you complete more orders

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

This project uses Git for version control. To revert changes:

```bash
# View commit history
git log

# Revert to a previous commit
git checkout <commit-hash>

# Create a new branch
git checkout -b feature/new-feature

# Push to GitHub (after setting up remote)
git remote add origin <your-repo-url>
git push -u origin main
```

## Development

- Game logic: `index.ts`
- UI: `assets/ui/index.html`
- Map configuration: `assets/map.json`
- Custom blocks: Defined in `map.json` (IDs 17-21)

## License

This is a personal project adaptation.

