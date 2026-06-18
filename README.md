# Goal Fighter

A full playable browser game inspired by 1990s side-view arcade fighters and street soccer. Instead of reducing an opponent's health bar, the objective is to score goals in a gritty alley futsal arena.

The project is built for GitHub Pages and contains all game code, visuals, music, and sound effects. The main production art pack is in `assets/generated/`: character sprite sheets, arena background art, HUD/UI art, and effects animation sheets. The sprites are original retro arcade soccer-fighter characters inspired by the user's reference style, not copied characters or ripped game assets.

## Play

Open `index.html` in a modern browser, or serve the folder locally:

```bash
python -m http.server 8080
```

Then visit `http://localhost:8080`.

## Controls

| Action | Keyboard |
| --- | --- |
| Move | `A` / `D` or Arrow Keys |
| Jump | `W` or Up Arrow |
| Kick | `J`, `Z`, or Space |
| Slide tackle | `K`, `X`, or Shift |
| Pause | `P` |

Touch or mouse users can click/tap the game to start and perform a quick kick.

## Objective

- First player to score 3 goals wins.
- Kick or slide into the ball to launch shots toward the opponent's goal.
- Use slide tackles and body contact to disrupt the rival.
- Stamina limits repeated attacks and regenerates over time.
- If time expires while tied, the match goes into sudden goal.

## Features

- HTML5 Canvas game loop with no dependencies.
- Retro pixel-arcade street court visual style.
- Chunky original arcade soccer-fighter characters using generated sprite-sheet image assets.
- Generated arena background, HUD/UI sheet, and effects animation sheet.
- Player character, rival AI, ball physics, goals, score timer, stamina meters, and super meters.
- Procedural music and punchy arcade sound effects using the Web Audio API.
- Code fallback art remains available if image assets fail to load.
- Responsive arcade cabinet presentation for desktop and mobile screens.

## Repository Structure

```text
.
├── assets
│   ├── generated
│   │   ├── blaze-character-sprite-sheet.jpg
│   │   ├── rivet-character-sprite-sheet.jpg
│   │   ├── soccer-fighter-effects-sprite-sheet.jpg
│   │   ├── soccer-fighter-hud-ui-sheet.jpg
│   │   └── street-futsal-arena-background.jpg
│   └── sprites
│       ├── blaze_spritesheet.png
│       ├── rivet_spritesheet.png
│       └── spritesheet_manifest.json
├── index.html
├── README.md
├── src
│   ├── game.js
│   └── style.css
└── tools
    └── generate_sprites.py
```

## GitHub Pages Deployment

1. Create a new GitHub repository.
2. Upload `index.html`, `README.md`, `LICENSE`, `.gitignore`, the `src/` folder, the `assets/` folder, and optionally the `tools/` folder.
3. In repository settings, enable GitHub Pages from the main branch root.
4. Open the generated Pages URL and play.

## Originality Note

This game uses an original title, characters, code, procedural visuals, procedural music, and procedural sound effects. It is visually inspired by retro arcade sports-fighting screens, but it does not include Street Fighter assets, names, logos, characters, sprites, music, or code.
