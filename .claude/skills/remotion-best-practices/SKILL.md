---
name: remotion-best-practices
description: Best practices for building videos with Remotion (React-based video framework)
type: reference
---

# Remotion Best Practices

## Composition Setup

- Always define `width`, `height`, `durationInFrames`, and `fps` explicitly on `<Composition>`.
- Use `fps: 30` for most content; `fps: 60` for motion-heavy or gaming content.
- Keep compositions focused — split long videos into multiple compositions and stitch with `<Series>` or `<Sequence>`.

```tsx
<Composition
  id="MyVideo"
  component={MyVideo}
  durationInFrames={150}
  fps={30}
  width={1920}
  height={1080}
/>
```

## Timing & Animation

- Use `useCurrentFrame()` and `interpolate()` for all animations — never use CSS transitions or `setTimeout`.
- Clamp `interpolate()` output with `extrapolateLeft: "clamp"` and `extrapolateRight: "clamp"` to avoid runaway values.
- Use `<Sequence from={} durationInFrames={}>` to offset and scope child timing.

```tsx
const frame = useCurrentFrame();
const opacity = interpolate(frame, [0, 20], [0, 1], {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
});
```

## Assets

- Wrap all static assets with `staticFile()` — never use raw relative paths.
- Preload audio and video with `prefetch()` or `<Preload>` to avoid rendering gaps.
- Use `<OffthreadVideo>` instead of `<Video>` for better frame-accurate rendering during export.

```tsx
import { staticFile } from "remotion";
<Img src={staticFile("logo.png")} />
<OffthreadVideo src={staticFile("clip.mp4")} />
```

## Audio

- Use `<Audio>` with `startFrom` and `endAt` (in frames) to trim clips.
- Set `volume` as a function of frame for fades: `volume={(f) => interpolate(f, [0, 10], [0, 1])}`.
- Use `<Sequence>` to offset audio start time rather than manipulating `startFrom` with manual offsets.

## Performance

- Avoid expensive computations inside render — memoize with `useMemo`.
- Don't load or fetch data at render time; pass all data as composition `defaultProps`.
- Use `delayRender` / `continueRender` for async data fetching before rendering starts.

```tsx
const handle = delayRender();
useEffect(() => {
  fetchData().then((data) => {
    setData(data);
    continueRender(handle);
  });
}, []);
```

## Props & Schema

- Define a Zod schema for composition props and pass it via the `schema` prop on `<Composition>`.
- This enables type-safe props in the Remotion Studio UI and CLI.

```tsx
import { z } from "zod";
const schema = z.object({ title: z.string(), color: z.string() });
<Composition schema={schema} defaultProps={{ title: "Hello", color: "#fff" }} />
```

## Rendering

- Use `npx remotion render` for single renders; use Lambda (`@remotion/lambda`) for parallel/cloud rendering.
- Pass `--concurrency` to tune CPU usage for local renders.
- For programmatic rendering, use `renderMedia()` from `@remotion/renderer`.

## Common Pitfalls

- **Non-determinism**: never use `Math.random()`, `Date.now()`, or `new Date()` — output must be frame-deterministic.
- **Font loading**: use `loadFont()` from `@remotion/google-fonts` or call `delayRender` until custom fonts are ready.
- **Spring animations**: use `spring()` from Remotion, not from `react-spring` or `framer-motion` — those are not frame-deterministic.
- **Missing continueRender**: always pair every `delayRender()` with a `continueRender()`, or rendering will hang.
