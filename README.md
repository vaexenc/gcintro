# Nintendo GameCube Intro Animation

A browser recreation of the Nintendo GameCube boot-up intro, rebuilt from scratch in Blender and rendered in real time with [Three.js](https://threejs.org/). It runs as a little media player: scrub the animation, play it backwards, change speed, orbit the camera, and switch between three soundtrack variants.

## ▶ [Live demo](https://gcintro.toomuchofheaven.com)

Original animation for reference: https://www.youtube.com/watch?v=CpmYW-gCSy4

## Keyboard shortcuts

| Key                  | Action                 |
| -------------------- | ---------------------- |
| `Space`              | Play / pause           |
| `R` / `Home`         | Rewind to start        |
| `End`                | Jump to end            |
| `←` `→`              | Jump ±0.5s             |
| `,` `.`              | Previous / next frame  |
| `0`–`9`              | Seek to 0–90%          |
| `A` `D`              | Speed down / up        |
| `B`                  | Toggle reverse         |
| `L`                  | Toggle loop            |
| `Q` `E`              | Previous / next track  |
| `↑` `↓`              | Volume up / down       |
| `M`                  | Mute                   |
| `O`                  | Toggle orbit           |
| `W`                  | Toggle wireframe       |
| `S`                  | Settings panel         |
| `I`                  | Info panel             |

## Development

### Tech

- [Three.js](https://threejs.org/) for WebGL rendering
- [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/) for dev server and bundling
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) for forward/reverse soundtrack playback

### Getting started

Requires [Node.js](https://nodejs.org/). Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Then open the URL Vite prints (defaults to http://localhost:5173).

### Scripts

| Command             | Description                              |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | Start the Vite dev server                |
| `npm run build`     | Production build into `dist/`            |
| `npm run preview`   | Preview the production build locally     |
| `npm run typecheck` | Type-check the project (`tsc --noEmit`)  |

## Credits

Models and textures: [The Models Resource](https://www.models-resource.com/gamecube/systembios/)
