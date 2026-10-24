# Internet Playground

Internet Playground is a frontend experiment where the website itself is the toy. Buttons dodge, objects fall and collide, the pointer pushes the scene around, and the interface occasionally ignores its layout.

The project is built with React and Vite. Matter.js handles the physics. Canvas draws the physical objects, while HTML and CSS provide the controls, typography, and interface experiments. There is no backend.

## Experiments

- **Runaway buttons**: Get close and the buttons dodge with a new taunt. Corner one to catch it. Keyboard and touch users can activate a button directly.
- **Gravity mode**: Objects fall, bounce, and collide. Drag a block upward to send another batch tumbling in. When the arena fills, one block slips out and starts a cascade reset. Toggle gravity off to let the blocks float.
- **Cursor chaos**: Start with a field of particles. Sweep the crosshair through them to erase them and leave a fading trail. When the field clears, it fills again.
- **Rebellious interface**: Drag the moving phrase with a pointer or touch. It waits two seconds after release, then returns to its starting place. Focus the phrase and use the arrow keys to move it too.

The experiment selector changes the behavior of one shared arena. **Reset** restores the arena and runaway buttons to their starting positions. The gravity control applies to the physics experiments.

## Requirements

- Node.js 20.19 or newer
- npm

## Run locally

From this project directory:

```sh
npm install
npm run dev
```

Vite prints the local URL in the terminal, usually `http://localhost:5173/`. Open it in a browser to use the playground.

## Other commands

```sh
npm run build      # Create the production build in dist/
npm run preview    # Preview the production build locally
```

## Accessibility and input

- Experiment controls and buttons are keyboard accessible.
- In Gravity mode and Cursor chaos, focus the canvas and use the arrow keys to nudge objects.
- Pointer and touch input can push objects in the physics modes.
- The interface respects the operating system's reduced-motion preference.

## Project structure

```text
index.html          Vite document and page metadata
src/main.jsx        React entry point and locally bundled fonts
src/App.jsx         Experiment controls, arena, and Matter.js canvas
src/styles.css      Visual design, responsive layout, and motion rules
vite.config.js      Vite configuration
```
