/**
 * Web sistem pokreta (PLAN §6, P10; plan K01 §7.1). Uvozi se samo iz
 * `"use client"` komponenti. Brojevi dolaze isključivo iz `@devotion/shared`.
 */
export {
  easeDefinitions,
  listStagger,
  REDUCED_FADE_S,
  reducedFade,
  SPRING_DURATION_S,
  SPRING_EASE,
  springLinearEasing,
  springTween,
  STANDARD_EASE,
  standardCubicBezier,
  standardTween,
  type EaseDefinition,
} from "./eases";
export { Flip, getGsap } from "./gsap-setup";
export {
  FULL_MOTION_QUERY,
  prefersReducedMotion,
  REDUCED_MOTION_QUERY,
  useReducedMotion,
} from "./reduced-motion";
export {
  useGsap,
  useTweenSlots,
  type DeclarativeMotionApi,
  type MotionApi,
} from "./use-gsap";
export { ENTER_SELECTOR, useEnter } from "./use-enter";
export { FLIP_SELECTOR, useFlip } from "./use-flip";
export { shouldFlip, type FlipKeys } from "./flip-snapshot";
export { usePress } from "./use-press";
export { assignRef, usePopEnter } from "./use-pop-enter";
export { currentScaleProperty, tweenScaleProperty } from "./scale-property";
export { useLayerMotion, type LayerMotion } from "./use-layer-motion";
export { planRoll, type RollSlot } from "./number-roll";
export { useNumberRoll } from "./use-number-roll";
export { frameWithin, framesDiffer, type Frame, type Rect } from "./rail-indicator";
export { RAIL_ITEM_ATTRIBUTE, useRailIndicator } from "./use-rail-indicator";
