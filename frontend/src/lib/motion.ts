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

/**
 * The outcome reveal. A spring rather than a keyframed scale so that toggling
 * outcomes off mid-flight settles from wherever the element had reached instead
 * of snapping back to a fixed track. The overshoot is deliberately small: these
 * are figures an analyst is about to read, and a bouncy number invites a second
 * look at the animation rather than at the value.
 */
export const POP: Transition = { type: 'spring', stiffness: 520, damping: 24, mass: 0.7 }

/**
 * Hiding outcomes is not an event worth celebrating, so the exit is the plain
 * shared timing rather than the spring: a quick shrink out, no overshoot.
 */
export const pop: Variants = {
  hidden: { opacity: 0, scale: 0.6 },
  visible: { opacity: 1, scale: 1, transition: POP },
  exit: { opacity: 0, scale: 0.6, transition },
}

/** Prose reads badly at a strong scale, so notes and captions start closer to 1. */
export const popSubtle: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  visible: { opacity: 1, scale: 1, transition: POP },
  exit: { opacity: 0, scale: 0.94, transition },
}

/**
 * The outcome column's step down the queue. Matches ROW_STAGGER so a reveal
 * cascades at the same rate the rows themselves arrive at; QueueTable caps the
 * index it multiplies, or fifty rows would take over two seconds to finish.
 */
export const POP_STAGGER = ROW_STAGGER

/**
 * The metric tiles' figure-to-figure crossfade. Deliberately slower than
 * DURATION: two numbers swapping in the same slot is a much smaller event than
 * a panel opening, and at 0.2s the change had already finished before the eye
 * arrived — the tiles simply looked like they had always held the new value.
 *
 * The two halves are asymmetric on purpose. The outgoing figure leaves quickly
 * so it does not sit behind the incoming one, while the new figure takes its
 * time: what should register is the answer arriving, not the old one leaving.
 */
export const VALUE_DURATION = 0.45

export const valueEnter: Transition = { duration: VALUE_DURATION, ease: EASE }

export const valueExit: Transition = { duration: VALUE_DURATION * 0.5, ease: EASE }

/**
 * The row's step. Five figures resolving at once reads as a repaint; a small
 * stagger left to right makes it read as five answers landing. Kept short —
 * the whole row still settles well inside a second.
 */
export const VALUE_STAGGER = 0.06
