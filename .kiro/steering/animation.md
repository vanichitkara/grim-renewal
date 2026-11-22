# Steering: Animation Rules

These rules apply to all animation code in Grim Renewal.
Every agent that writes animation code must follow them.

## Canvas & Renderer
- Use the existing Canvas 2D renderer in `src/animation/`.
- Do NOT introduce PixiJS, Phaser, or any other game engine without explicit approval.
- Target 60 fps. Keep all draw calls inside `requestAnimationFrame`.

## Sprite Rules
- Native canvas resolution: 480 × 220 px (W × H). Scale up with CSS; never scale the canvas element itself.
- `image-rendering: pixelated` on the canvas element. Never smooth pixel art.
- When real sprite sheets are added, load them as `ImageBitmap` for performance.
- Sprite sheet format: horizontal strip, each frame is `frameWidth` × `frameHeight`, left-to-right.

## Frame Rate & Timing
- Cap `dt` (delta time) at 50 ms (0.05 s) to avoid physics jumps after tab focus.
- All durations in milliseconds. All speeds in pixels/second.
- Global speed multiplier: `tune.speed` (default 1.0). Every timed value divides by it.
- Respects `prefers-reduced-motion`: when true, skip particle bursts and camera shake.

## Easing
Use only the named easings from `src/animation/ease.ts`:
`linear`, `inOut`, `in`, `out`, `back`. No inline cubic-bezier strings.

## State Machine
- Animation state must mirror the cancellation state machine exactly.
- Animation transitions only fire in response to events from `AgentEvent`.
- Never fire an animation "ahead" of the actual backend result.
- Every animation step must be interruptible (tween can be cancelled mid-flight).

## Color Palette (never hardcode outside these)
```
--night:  #120e1c   (background)
--crypt:  #1c162b   (card surfaces)
--stone:  #2a2240   (borders, bars)
--bone:   #ece6d6   (primary text)
--mist:   #a59cbc   (secondary text)
--coin:   #f2b84b   (savings, gold)
--rot:    #8fc25a   (zombie green)
--blood:  #e0574f   (boss, danger)
--spirit: #c99bff   (revenant / ghost accent)
```

## Camera Shake
- Maximum shake offset: 5 px.
- Decay rate: 8 units/second.
- Only on: zombie hit flash, boss door roar.
- Skipped when `prefers-reduced-motion` is true.

## Particles
- Dissolve: 60 particles (18 when reduced motion). Green dust, gravity upward.
- Coins: 10 particles (4 when reduced motion). Gold, bounces on floor.
- Soul: 1 ghost sprite, drifts up, sine-wave x offset.
- All particles removed from array when `life > max`.

## Accessibility
- Canvas has `aria-label` describing the current action.
- All meaningful events also update an `aria-live="polite"` region.
- Sound is opt-in. Mute button always visible. Default: on (but gated by user gesture).
- Every button is keyboard-focusable. Focus ring: 2 px solid `--coin`.

## Tuning Panel
- Always present in the prototype. Hidden in production behind a `?debug` query param.
- Must include: speed, knocks, dissolve time, cancel delay, force-fail toggle.
- Must show current state machine step as plain text (for debugging and the write-up).
