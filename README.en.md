# HEXAMOTION

[繁體中文](README.md) · [Open the simulator](https://b3326023.github.io/hexamotion/)

HEXAMOTION is an interactive Stewart platform simulator for desktop and mobile browsers. Drag the sea to raise a wave, watch the vessel roll, and compare its angle with the platform’s residual tilt. Six independently driven legs work together to keep the deck level. In the flight simulator the aim changes: the deck tilts with the aircraft instead.

## Take it for a spin

| Scene | Try this |
| --- | --- |
| [Flight cockpit](https://b3326023.github.io/hexamotion/?scene=flight) | Drag sideways to bank or pull down to raise the nose. Compare the aircraft and deck angles. |
| [Racing](https://b3326023.github.io/hexamotion/?scene=driving) | Steer across the track, push up to accelerate, and pull down to brake. |
| [Marine compensation](https://b3326023.github.io/hexamotion/?scene=marine) | Increase the swell and compare how far the vessel and the compensated deck tilt. |
| [Earthquake testing](https://b3326023.github.io/hexamotion/?scene=seismic) | Increase the excitation and watch the building sway relative to its foundation. |

The other nine scenarios cover telescope alignment, spacecraft docking, tilting trains, motion cinema, camera stabilization, balance testing, precision machining, vibration sweeps, and fiber-optic alignment. Each scene has its own gestures, live measurements, and synthesized sound. The simulator interface and system manual use Traditional Chinese.

## Controls and workspaces

Drag the real-world scene to change its inputs. Drag the platform view to orbit the mechanism. Double-tap the scene to center its inputs, or focus it and press Home. Open **精密操控** for the scene’s dedicated instruments. On a phone the two views rearrange when you rotate the device.

Use **遊樂場** (Playground) to drop a ball, draw a tracking path, try a maze, or record a run. **工程臺** (Engineering) exposes actuator travel and loads, controller comparisons, fault injection, and data export.

## Run locally

Use Node.js 24 and pnpm 11. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:4186/. To test and serve a production build:

```sh
pnpm exec tsc --noEmit
pnpm test
pnpm build
pnpm start
```

Open http://127.0.0.1:4187/. On Windows, after building, you can also use the included launch and stop scripts.

## How the simulation works

Inverse kinematics converts a six-degree-of-freedom deck pose into six target leg lengths. Rapier advances the rigid bodies and joints at 240 Hz. The lower mounts allow the cylinders to swing while resisting twist around their own axes. Three.js renders the mechanism and the application scene from their shared simulation state.

The interface lives in [app](app/), the mechanics and scene models in [lib](lib/), and the regression suite in [tests](tests/). See the [system manual](docs/system-manual.md) for the model assumptions, experiments, and documentation build instructions. Third-party assets are credited in the individual [scene directories](public/worlds/).
