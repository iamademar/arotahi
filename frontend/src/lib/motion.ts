import type { Transition, Variants } from 'motion/react'

/**
 * Shared timings. Motion here explains a state change; it never decorates and
 * never delays reading a figure, so durations stay short and easing stays plain.
 *
 * MotionConfig reducedMotion="user" (src/main.tsx) drops the transforms below
 * for anyone who asks for reduced motion, keeping only the opacity fades.
 */
export const DURATION = 0.2

export const EASE = [0.22, 0.61, 0.36, 1] as const

export const transition: Transition = { duration: DURATION, ease: EASE }

/** Fifty queue rows need a short step, or the table is unreadable for seconds. */
export const STAGGER = 0.025

/**
 * The queue table's own step, slower than STAGGER so the rows read as arriving
 * in rank order rather than all at once. Kept separate because the metric tiles
 * share STAGGER and should stay brisk; the cap in QueueTable keeps the whole
 * cascade under a second at this rate.
 */
export const ROW_STAGGER = 0.045

export const fadeIn: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition },
}

/** Parent of a staggered list; children read `fadeIn`. */
export const staggerParent: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: STAGGER } },
}

/**
 * The map's load-in wave, in milliseconds rather than seconds: it is driven by
 * requestAnimationFrame against MapLibre paint transitions, not by motion.
 *
 * This replays on every region change, so it is deliberately near the ceiling
 * of what stays pleasant rather than tiring on repeat. The fade is each cell's
 * own ramp once the wave reaches it, handled by fill-opacity-transition.
 */
export const REVEAL_DURATION_MS = 1100

export const REVEAL_FADE_MS = 180
