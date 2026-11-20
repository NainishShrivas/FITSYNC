import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AppIcon } from './AppIcon';
import {
  EXERCISE_POSTURE_SPECS,
  resolveExerciseAnimationKey,
  type ExerciseAnimationKey,
} from '../data/exerciseAnimations';
import type { ExerciseItem } from '../types/fitsync';

interface Vec2 {
  x: number;
  y: number;
}

interface ExercisePostureAnimatorProps {
  exercise: Pick<ExerciseItem, 'id' | 'name' | 'shortName' | 'wasSwappedFrom'>;
  animationKeyOverride?: ExerciseAnimationKey;
  variant?: 'thumb' | 'studio';
  className?: string;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function smoothstep(t: number): number {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

/**
 * Rigid 2-bone analytical Inverse Kinematics solver.
 * Guarantees anatomically fixed limb lengths without stretching or joint popping.
 */
function solveTwoBoneIK(
  origin: Vec2,
  target: Vec2,
  len1: number,
  len2: number,
  bendSign: 1 | -1
): { mid: Vec2; end: Vec2 } {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const rawDist = Math.hypot(dx, dy);
  const maxReach = len1 + len2 - 0.4;
  const minReach = Math.abs(len1 - len2) + 2;
  const d = clamp(rawDist, minReach, maxReach);

  const scale = rawDist > 0.001 ? d / rawDist : 1;
  const clampedEnd: Vec2 = {
    x: origin.x + dx * scale,
    y: origin.y + dy * scale,
  };

  const ux = rawDist > 0.001 ? dx / rawDist : 0;
  const uy = rawDist > 0.001 ? dy / rawDist : 1;

  const a = (len1 * len1 - len2 * len2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, len1 * len1 - a * a));

  const mx = origin.x + a * ux;
  const my = origin.y + a * uy;

  // Perpendicular normal
  const nx = -uy;
  const ny = ux;

  return {
    mid: {
      x: mx + bendSign * h * nx,
      y: my + bendSign * h * ny,
    },
    end: clampedEnd,
  };
}

/** Builds a smooth tapered anatomical limb path between A and B. */
function limbPath(a: Vec2, b: Vec2, rStart: number, rEnd: number): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.max(0.01, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;

  const p1x = a.x + nx * rStart;
  const p1y = a.y + ny * rStart;
  const p2x = b.x + nx * rEnd;
  const p2y = b.y + ny * rEnd;
  const p3x = b.x - nx * rEnd;
  const p3y = b.y - ny * rEnd;
  const p4x = a.x - nx * rStart;
  const p4y = a.y - ny * rStart;

  return `M ${p1x.toFixed(1)} ${p1y.toFixed(1)} L ${p2x.toFixed(1)} ${p2y.toFixed(1)} A ${rEnd} ${rEnd} 0 0 1 ${p3x.toFixed(1)} ${p3y.toFixed(1)} L ${p4x.toFixed(1)} ${p4y.toFixed(1)} A ${rStart} ${rStart} 0 0 1 ${p1x.toFixed(1)} ${p1y.toFixed(1)} Z`;
}

/** Builds a tapered anatomical torso polygon from pelvis to shoulders. */
function torsoPath(hip: Vec2, shoulder: Vec2, hipHalfW: number, shoulderHalfW: number): string {
  const dx = shoulder.x - hip.x;
  const dy = shoulder.y - hip.y;
  const len = Math.max(0.01, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;

  const hL = { x: hip.x + nx * hipHalfW, y: hip.y + ny * hipHalfW };
  const hR = { x: hip.x - nx * hipHalfW, y: hip.y - ny * hipHalfW };
  const sL = { x: shoulder.x + nx * shoulderHalfW, y: shoulder.y + ny * shoulderHalfW };
  const sR = { x: shoulder.x - nx * shoulderHalfW, y: shoulder.y - ny * shoulderHalfW };

  return `M ${hL.x.toFixed(1)} ${hL.y.toFixed(1)} L ${sL.x.toFixed(1)} ${sL.y.toFixed(1)} Q ${shoulder.x.toFixed(1)} ${(shoulder.y - ny * 4 - (dy / len) * 5).toFixed(1)} ${sR.x.toFixed(1)} ${sR.y.toFixed(1)} L ${hR.x.toFixed(1)} ${hR.y.toFixed(1)} Q ${hip.x.toFixed(1)} ${(hip.y + (dy / len) * 5).toFixed(1)} ${hL.x.toFixed(1)} ${hL.y.toFixed(1)} Z`;
}

/** Builds a muscle belly highlight ellipse aligned along a segment. */
function muscleBellies(a: Vec2, b: Vec2, tPos: number, rx: number, ry: number): {
  cx: number;
  cy: number;
  deg: number;
  rx: number;
  ry: number;
} {
  const cx = lerp(a.x, b.x, tPos);
  const cy = lerp(a.y, b.y, tPos);
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return { cx, cy, deg, rx, ry };
}

interface LimbSegmentProps {
  a: Vec2;
  b: Vec2;
  r1: number;
  r2: number;
  fill: string;
  stroke?: string;
}

function LimbSegment({ a, b, r1, r2, fill, stroke }: LimbSegmentProps) {
  return (
    <path
      d={limbPath(a, b, r1, r2)}
      fill={fill}
      stroke={stroke}
      strokeWidth={stroke ? 1.1 : 0}
      strokeLinejoin="round"
    />
  );
}

function Shoe({
  ankle,
  facing = 1,
  angleDeg = 0,
  far = false,
}: {
  ankle: Vec2;
  facing?: 1 | -1;
  angleDeg?: number;
  far?: boolean;
}) {
  const fill = far ? '#334155' : '#1E293B';
  const sole = far ? '#64748B' : '#E2E8F0';
  return (
    <g transform={`translate(${ankle.x.toFixed(1)}, ${ankle.y.toFixed(1)}) rotate(${angleDeg.toFixed(1)}) scale(${facing}, 1)`}>
      <path d="M -5 -2 L 4 -2 L 13 2 C 15 3 15 6 12 7 L -6 7 C -8 7 -8 2 -5 -2 Z" fill={fill} />
      <rect x="-6.5" y="5.2" width="19.5" height="2.4" rx="1.2" fill={sole} />
    </g>
  );
}

function Head({
  center,
  facing = 1,
  tiltDeg = 0,
  skinFill,
}: {
  center: Vec2;
  facing?: 1 | -1 | 0;
  tiltDeg?: number;
  skinFill: string;
}) {
  return (
    <g transform={`translate(${center.x.toFixed(1)}, ${center.y.toFixed(1)}) rotate(${tiltDeg.toFixed(1)})`}>
      <circle r="11.5" fill={skinFill} stroke="#64748B" strokeWidth="1" />
      {facing !== 0 ? (
        <>
          {/* Crown / hair cap shows facing direction clearly */}
          <path
            d={
              facing === 1
                ? 'M -10 -3 C -10 -12 3 -14 10 -6 C 4 -7 -2 -6 -6 -1 Z'
                : 'M 10 -3 C 10 -12 -3 -14 -10 -6 C -4 -7 2 -6 6 -1 Z'
            }
            fill="#334155"
          />
          {/* Jaw/ear cue */}
          <circle cx={facing === 1 ? 6.5 : -6.5} cy="-1.5" r="1.2" fill="#334155" />
        </>
      ) : (
        <path d="M -10.5 -3 C -9 -13 9 -13 10.5 -3 C 5 -7 -5 -7 -10.5 -3 Z" fill="#334155" />
      )}
    </g>
  );
}

const CYCLE_DURATION_MS: Record<ExerciseAnimationKey, number> = {
  squats: 3000,
  goblet_squats: 3000,
  dumbbell_press: 2600,
  pushups: 2500,
  cycling: 1300,
  jump_rope: 850,
  brisk_walking: 1300,
  plank: 3200,
  dead_bugs: 3600,
  swimming: 1700,
  rowing: 2600,
};

interface StageVisuals {
  svg: React.ReactNode;
  phaseIndex: number;
  activeLabel: string;
}

function renderExerciseFrame(
  key: ExerciseAnimationKey,
  phase: number,
  showGuides: boolean,
  uid: string
): StageVisuals {
  const skinNear = `url(#${uid}-skinNear)`;
  const skinFar = `url(#${uid}-skinFar)`;
  const shorts = `url(#${uid}-shorts)`;
  const primaryGlow = `url(#${uid}-musclePrimary)`;
  const secondaryGlow = `url(#${uid}-muscleSecondary)`;

  const floorY = 204;

  switch (key) {
    case 'squats': {
      // Raised cosine rep curve: 0 (stand) -> 1 (parallel bottom) -> 0 (stand)
      const depth = Math.pow(0.5 - 0.5 * Math.cos(phase * Math.PI * 2), 0.9);
      const concentricIntensity = 0.35 + 0.6 * Math.sin(phase * Math.PI) ** 1.4;
      const phaseIdx = phase < 0.14 ? 0 : phase < 0.45 ? 1 : phase < 0.62 ? 2 : 3;

      const ankleNear = { x: 184, y: 197 };
      const ankleFar = { x: 174, y: 195 };
      const hip = { x: lerp(175, 143, depth), y: lerp(128, 165, depth) };
      const shoulder = { x: lerp(178, 173, depth), y: lerp(80, 121, depth) };
      const head = { x: shoulder.x + lerp(4, 9, depth), y: shoulder.y - 19 };

      const nearLeg = solveTwoBoneIK(hip, ankleNear, 37, 36, -1);
      const farLeg = solveTwoBoneIK({ x: hip.x - 3, y: hip.y - 1 }, ankleFar, 36, 35, -1);

      const barPos = { x: shoulder.x - 4, y: shoulder.y - 3 };
      const hand = { x: shoulder.x + 8, y: shoulder.y - 2 };
      const elbow = solveTwoBoneIK(shoulder, hand, 22, 20, 1).mid;

      const quadNear = muscleBellies(hip, nearLeg.mid, 0.5, 13, 5.8);
      const gluteNear = { cx: hip.x - 5, cy: hip.y + 4, rx: 7.5, ry: 6.5 };
      const coreLine = muscleBellies(hip, shoulder, 0.48, 13, 4.5);

      return {
        phaseIndex: phaseIdx,
        activeLabel: depth > 0.7 ? 'Parallel Depth' : phase > 0.55 ? 'Drive Through Midfoot' : 'Controlled Descent',
        svg: (
          <g>
            {/* Floor shadow */}
            <ellipse cx="176" cy={floorY + 3} rx={lerp(34, 44, depth)} ry="5" fill="rgba(15,23,42,0.14)" />
            {/* Far leg */}
            <LimbSegment a={{ x: hip.x - 3, y: hip.y }} b={farLeg.mid} r1={8} r2={6.2} fill={skinFar} />
            <LimbSegment a={farLeg.mid} b={ankleFar} r1={5.8} r2={4} fill={skinFar} />
            <Shoe ankle={ankleFar} far />

            {/* Barbell far plates */}
            <line x1={barPos.x - 24} y1={barPos.y} x2={barPos.x + 20} y2={barPos.y} stroke="#475569" strokeWidth="4" strokeLinecap="round" />

            {/* Torso & Shorts */}
            <path d={torsoPath(hip, shoulder, 9.5, 11.5)} fill={skinNear} stroke="#64748B" strokeWidth="1" />
            <path d={torsoPath(hip, { x: lerp(hip.x, shoulder.x, 0.3), y: lerp(hip.y, shoulder.y, 0.3) }, 10.2, 9.5)} fill={shorts} />

            {/* Secondary Core/Erector Highlight */}
            <ellipse
              cx={coreLine.cx - 3}
              cy={coreLine.cy}
              rx={coreLine.rx}
              ry={coreLine.ry}
              transform={`rotate(${coreLine.deg.toFixed(1)} ${(coreLine.cx - 3).toFixed(1)} ${coreLine.cy.toFixed(1)})`}
              fill={secondaryGlow}
              opacity={0.45 + depth * 0.35}
            />

            {/* Near Leg */}
            <LimbSegment a={hip} b={nearLeg.mid} r1={9.2} r2={6.8} fill={skinNear} stroke="#64748B" />
            <LimbSegment a={nearLeg.mid} b={ankleNear} r1={6.4} r2={4.4} fill={skinNear} stroke="#64748B" />
            <Shoe ankle={ankleNear} />

            {/* Primary Crimson Muscles: Glutes + Quadriceps */}
            <ellipse cx={gluteNear.cx} cy={gluteNear.cy} rx={gluteNear.rx} ry={gluteNear.ry} fill={primaryGlow} opacity={concentricIntensity} />
            <ellipse
              cx={quadNear.cx}
              cy={quadNear.cy}
              rx={quadNear.rx}
              ry={quadNear.ry}
              transform={`rotate(${quadNear.deg.toFixed(1)} ${quadNear.cx.toFixed(1)} ${quadNear.cy.toFixed(1)})`}
              fill={primaryGlow}
              opacity={concentricIntensity}
            />

            <Head center={head} facing={1} tiltDeg={lerp(0, 12, depth)} skinFill={skinNear} />

            {/* Near Arm holding barbell */}
            <LimbSegment a={shoulder} b={elbow} r1={5.5} r2={4.6} fill={skinNear} stroke="#64748B" />
            <LimbSegment a={elbow} b={hand} r1={4.4} r2={3.6} fill={skinNear} stroke="#64748B" />
            <circle cx={hand.x} cy={hand.y} r="3.6" fill={skinNear} stroke="#475569" strokeWidth="1" />

            {/* Near Olympic Plate */}
            <g transform={`translate(${barPos.x.toFixed(1)}, ${barPos.y.toFixed(1)})`}>
              <circle r="16" fill="#1E293B" stroke="#94A3B8" strokeWidth="2" />
              <circle r="10.5" fill="none" stroke="#475569" strokeWidth="1.2" />
              <circle r="3.5" fill="#CBD5E1" />
            </g>

            {showGuides && (
              <g strokeDasharray="4 3" strokeWidth="1.5">
                {/* Vertical midfoot bar path */}
                <line x1={ankleNear.x - 4} y1="45" x2={ankleNear.x - 4} y2={floorY} stroke="#0284C7" opacity="0.8" />
                {/* Neutral spine line */}
                <line x1={hip.x} y1={hip.y} x2={shoulder.x} y2={shoulder.y} stroke="#16A34A" strokeDasharray="none" strokeWidth="2.2" />
                {/* Parallel thigh target indicator */}
                <line x1="125" y1={nearLeg.mid.y} x2="215" y2={nearLeg.mid.y} stroke="#F59E0B" opacity="0.7" />
              </g>
            )}
          </g>
        ),
      };
    }

    case 'goblet_squats': {
      const depth = Math.pow(0.5 - 0.5 * Math.cos(phase * Math.PI * 2), 0.92);
      const concentricIntensity = 0.35 + 0.6 * Math.sin(phase * Math.PI) ** 1.4;
      const phaseIdx = phase < 0.14 ? 0 : phase < 0.45 ? 1 : phase < 0.62 ? 2 : 3;

      const ankleNear = { x: 192, y: 197 };
      const ankleFar = { x: 183, y: 195 };
      const hip = { x: lerp(176, 138, depth), y: lerp(128, 160, depth) };
      const shoulder = { x: lerp(179, 157, depth), y: lerp(80, 114, depth) };
      const head = { x: shoulder.x + lerp(3, 5, depth), y: shoulder.y - 19 };

      const nearLeg = solveTwoBoneIK(hip, ankleNear, 38, 37, -1);
      const farLeg = solveTwoBoneIK({ x: hip.x - 3, y: hip.y - 1 }, ankleFar, 37, 36, -1);

      const kbPos = { x: shoulder.x + 21, y: shoulder.y + 11 };
      const hand = { x: kbPos.x - 3, y: kbPos.y + 2 };
      const elbow = solveTwoBoneIK(shoulder, hand, 23, 21, -1).mid;

      const quadNear = muscleBellies(hip, nearLeg.mid, 0.5, 13, 5.8);
      const coreNear = muscleBellies(hip, shoulder, 0.48, 12, 4.5);

      return {
        phaseIndex: phaseIdx,
        activeLabel: depth > 0.72 ? 'Light Box Tap · Upright Torso' : 'Sit Back · Protect Knees',
        svg: (
          <g>
            <ellipse cx="170" cy={floorY + 3} rx="52" ry="5" fill="rgba(15,23,42,0.13)" />
            {/* Plyo Box behind athlete */}
            <rect x="112" y="164" width="38" height="40" rx="4" fill="#334155" stroke="#64748B" strokeWidth="1.2" />
            <line x1="115" y1="168" x2="147" y2="168" stroke="#94A3B8" strokeWidth="1.5" />
            <text x="131" y="188" textAnchor="middle" fill="#CBD5E1" fontSize="8" fontWeight="700">
              BOX
            </text>

            {/* Far leg */}
            <LimbSegment a={{ x: hip.x - 3, y: hip.y }} b={farLeg.mid} r1={8} r2={6.2} fill={skinFar} />
            <LimbSegment a={farLeg.mid} b={ankleFar} r1={5.8} r2={4} fill={skinFar} />
            <Shoe ankle={ankleFar} far />

            {/* Torso + Shorts */}
            <path d={torsoPath(hip, shoulder, 9.5, 11)} fill={skinNear} stroke="#64748B" strokeWidth="1" />
            <path d={torsoPath(hip, { x: lerp(hip.x, shoulder.x, 0.3), y: lerp(hip.y, shoulder.y, 0.3) }, 10, 9.5)} fill={shorts} />

            {/* Secondary Core */}
            <ellipse
              cx={coreNear.cx + 3}
              cy={coreNear.cy}
              rx={coreNear.rx}
              ry={coreNear.ry}
              transform={`rotate(${coreNear.deg.toFixed(1)} ${(coreNear.cx + 3).toFixed(1)} ${coreNear.cy.toFixed(1)})`}
              fill={secondaryGlow}
              opacity={0.4 + depth * 0.35}
            />

            {/* Near Leg */}
            <LimbSegment a={hip} b={nearLeg.mid} r1={9.2} r2={6.8} fill={skinNear} stroke="#64748B" />
            <LimbSegment a={nearLeg.mid} b={ankleNear} r1={6.4} r2={4.4} fill={skinNear} stroke="#64748B" />
            <Shoe ankle={ankleNear} />

            {/* Primary Crimson Quads + Glutes */}
            <ellipse cx={hip.x - 4} cy={hip.y + 4} rx="7.5" ry="6.2" fill={primaryGlow} opacity={concentricIntensity} />
            <ellipse
              cx={quadNear.cx}
              cy={quadNear.cy}
              rx={quadNear.rx}
              ry={quadNear.ry}
              transform={`rotate(${quadNear.deg.toFixed(1)} ${quadNear.cx.toFixed(1)} ${quadNear.cy.toFixed(1)})`}
              fill={primaryGlow}
              opacity={concentricIntensity}
            />

            <Head center={head} facing={1} tiltDeg={lerp(0, 6, depth)} skinFill={skinNear} />

            {/* Kettlebell prop */}
            <g transform={`translate(${kbPos.x.toFixed(1)}, ${kbPos.y.toFixed(1)})`}>
              <path d="M -5 -7 C -5 -13 5 -13 5 -7" fill="none" stroke="#475569" strokeWidth="2.8" strokeLinecap="round" />
              <circle cy="2" r="8.5" fill="#1E293B" stroke="#94A3B8" strokeWidth="1.2" />
            </g>

            {/* Arm cradling kettlebell */}
            <LimbSegment a={shoulder} b={elbow} r1={5.5} r2={4.5} fill={skinNear} stroke="#64748B" />
            <LimbSegment a={elbow} b={hand} r1={4.4} r2={3.5} fill={skinNear} stroke="#64748B" />

            {showGuides && (
              <g strokeDasharray="4 3" strokeWidth="1.5">
                <line x1={hip.x} y1={hip.y} x2={shoulder.x} y2={shoulder.y} stroke="#16A34A" strokeDasharray="none" strokeWidth="2.2" />
                <line x1={ankleNear.x} y1="60" x2={ankleNear.x} y2={floorY} stroke="#0284C7" opacity="0.75" />
                <line x1="108" y1="164" x2="155" y2="164" stroke="#F59E0B" opacity="0.85" />
              </g>
            )}
          </g>
        ),
      };
    }

    case 'dumbbell_press': {
      const press = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
      const glow = 0.38 + 0.58 * press;
      const phaseIdx = phase < 0.14 ? 0 : phase < 0.45 ? 1 : phase < 0.62 ? 2 : 3;

      const hipL = { x: 169, y: 126 };
      const hipR = { x: 191, y: 126 };
      const shL = { x: 158, y: 80 };
      const shR = { x: 202, y: 80 };
      const head = { x: 180, y: 56 };

      const footL = { x: 164, y: 197 };
      const footR = { x: 196, y: 197 };
      const kneeL = { x: 166, y: 162 };
      const kneeR = { x: 194, y: 162 };

      const handL = { x: lerp(143, 159, press), y: lerp(72, 31, press) };
      const handR = { x: lerp(217, 201, press), y: lerp(72, 31, press) };
      const elbowL = { x: lerp(136, 152, press), y: lerp(96, 54, press) };
      const elbowR = { x: lerp(224, 208, press), y: lerp(96, 54, press) };

      const triL = muscleBellies(shL, elbowL, 0.52, 8.5, 4.2);
      const triR = muscleBellies(shR, elbowR, 0.52, 8.5, 4.2);

      return {
        phaseIndex: phaseIdx,
        activeLabel: press > 0.78 ? 'Full Overhead Lockout' : press < 0.2 ? '45° Scapular Rack' : 'Press Ribs Stacked',
        svg: (
          <g>
            <ellipse cx="180" cy={floorY + 3} rx="38" ry="5" fill="rgba(15,23,42,0.14)" />
            {/* Legs */}
            <LimbSegment a={hipL} b={kneeL} r1={8.5} r2={6.2} fill={skinNear} stroke="#64748B" />
            <LimbSegment a={kneeL} b={footL} r1={6} r2={4.2} fill={skinNear} stroke="#64748B" />
            <LimbSegment a={hipR} b={kneeR} r1={8.5} r2={6.2} fill={skinNear} stroke="#64748B" />
            <LimbSegment a={kneeR} b={footR} r1={6} r2={4.2} fill={skinNear} stroke="#64748B" />
            <Shoe ankle={footL} facing={-1} />
            <Shoe ankle={footR} facing={1} />

            {/* Front Torso */}
            <path d="M 164 126 L 155 80 Q 180 72 205 80 L 196 126 Z" fill={skinNear} stroke="#64748B" strokeWidth="1" />
            <path d="M 164 114 L 196 114 L 197 132 L 182 132 L 180 125 L 178 132 L 163 132 Z" fill={shorts} />

            {/* Secondary Core & Upper Chest */}
            <rect x="172" y="96" width="16" height="17" rx="4" fill={secondaryGlow} opacity={0.42 + press * 0.25} />
            <ellipse cx="170" cy="86" rx="8" ry="4.5" fill={secondaryGlow} opacity={0.35 + press * 0.28} />
            <ellipse cx="190" cy="86" rx="8" ry="4.5" fill={secondaryGlow} opacity={0.35 + press * 0.28} />

            <Head center={head} facing={0} skinFill={skinNear} />

            {/* Arms */}
            <LimbSegment a={shL} b={elbowL} r1={6.2} r2={4.8} fill={skinNear} stroke="#64748B" />
            <LimbSegment a={elbowL} b={handL} r1={4.6} r2={3.8} fill={skinNear} stroke="#64748B" />
            <LimbSegment a={shR} b={elbowR} r1={6.2} r2={4.8} fill={skinNear} stroke="#64748B" />
            <LimbSegment a={elbowR} b={handR} r1={4.6} r2={3.8} fill={skinNear} stroke="#64748B" />

            {/* Primary Crimson Muscles: Deltoids + Triceps */}
            <circle cx={shL.x - 1} cy={shL.y + 1} r="7.5" fill={primaryGlow} opacity={glow} />
            <circle cx={shR.x + 1} cy={shR.y + 1} r="7.5" fill={primaryGlow} opacity={glow} />
            <ellipse
              cx={triL.cx}
              cy={triL.cy}
              rx={triL.rx}
              ry={triL.ry}
              transform={`rotate(${triL.deg.toFixed(1)} ${triL.cx.toFixed(1)} ${triL.cy.toFixed(1)})`}
              fill={primaryGlow}
              opacity={glow}
            />
            <ellipse
              cx={triR.cx}
              cy={triR.cy}
              rx={triR.rx}
              ry={triR.ry}
              transform={`rotate(${triR.deg.toFixed(1)} ${triR.cx.toFixed(1)} ${triR.cy.toFixed(1)})`}
              fill={primaryGlow}
              opacity={glow}
            />

            {/* Twin Hex Dumbbells */}
            {[handL, handR].map((h, i) => (
              <g key={i} transform={`translate(${h.x.toFixed(1)}, ${h.y.toFixed(1)})`}>
                <rect x="-12" y="-2.2" width="24" height="4.4" rx="1.5" fill="#94A3B8" />
                <rect x="-14" y="-6.5" width="5.5" height="13" rx="2" fill="#1E293B" stroke="#64748B" strokeWidth="1" />
                <rect x="8.5" y="-6.5" width="5.5" height="13" rx="2" fill="#1E293B" stroke="#64748B" strokeWidth="1" />
              </g>
            ))}

            {showGuides && (
              <g strokeDasharray="4 3" strokeWidth="1.5">
                <line x1="158" y1="22" x2="158" y2="120" stroke="#0284C7" opacity="0.7" />
                <line x1="202" y1="22" x2="202" y2="120" stroke="#0284C7" opacity="0.7" />
                <line x1="180" y1="68" x2="180" y2="132" stroke="#16A34A" strokeDasharray="none" strokeWidth="2" />
              </g>
            )}
          </g>
        ),
      };
    }

    case 'pushups': {
      const down = Math.pow(0.5 - 0.5 * Math.cos(phase * Math.PI * 2), 0.9);
      const glow = 0.35 + 0.6 * Math.sin(phase * Math.PI) ** 1.3;
      const phaseIdx = phase < 0.14 ? 0 : phase < 0.45 ? 1 : phase < 0.62 ? 2 : 3;

      const toe = { x: 96, y: 199 };
      const ankle = { x: 102, y: 187 };
      const hand = { x: 234, y: 196 };

      // Rigid collinear straight body pivoting from ankle
      const bodyAngleRad = (lerp(-22, -6.5, down) * Math.PI) / 180;
      const hipDist = 72;
      const shDist = 122;
      const headDist = 142;

      const hip = {
        x: ankle.x + Math.cos(bodyAngleRad) * hipDist,
        y: ankle.y + Math.sin(bodyAngleRad) * hipDist,
      };
      const shoulder = {
        x: ankle.x + Math.cos(bodyAngleRad) * shDist,
        y: ankle.y + Math.sin(bodyAngleRad) * shDist,
      };
      const head = {
        x: ankle.x + Math.cos(bodyAngleRad) * headDist,
        y: ankle.y + Math.sin(bodyAngleRad) * headDist - 3,
      };
      const knee = {
        x: lerp(ankle.x, hip.x, 0.5),
        y: lerp(ankle.y, hip.y, 0.5),
      };

      const arm = solveTwoBoneIK(shoulder, hand, 26, 25, 1);
      const chestSpot = muscleBellies(hip, shoulder, 0.78, 12, 5.5);
      const triSpot = muscleBellies(shoulder, arm.mid, 0.5, 9, 4.2);

      return {
        phaseIndex: phaseIdx,
        activeLabel: down > 0.72 ? 'Chest 2" Above Mat' : 'Rigid Plank Line',
        svg: (
          <g>
            {/* Exercise Mat */}
            <rect x="76" y={floorY - 3} width="204" height="7" rx="3.5" fill="#475569" />
            <ellipse cx="172" cy={floorY + 5} rx="86" ry="4" fill="rgba(15,23,42,0.12)" />

            {/* Far arm hint */}
            <LimbSegment a={{ x: shoulder.x + 3, y: shoulder.y }} b={{ x: arm.mid.x + 4, y: arm.mid.y - 2 }} r1={4.8} r2={3.8} fill={skinFar} />
            <LimbSegment a={{ x: arm.mid.x + 4, y: arm.mid.y - 2 }} b={{ x: hand.x + 4, y: hand.y }} r1={3.8} r2={3.2} fill={skinFar} />

            {/* Rigid Legs + Torso */}
            <LimbSegment a={ankle} b={knee} r1={4.4} r2={6.4} fill={skinNear} stroke="#64748B" />
            <LimbSegment a={knee} b={hip} r1={6.6} r2={8.8} fill={skinNear} stroke="#64748B" />
            <path d={torsoPath(hip, shoulder, 8.8, 10.6)} fill={skinNear} stroke="#64748B" strokeWidth="1" />
            <path d={torsoPath(hip, { x: lerp(hip.x, shoulder.x, 0.28), y: lerp(hip.y, shoulder.y, 0.28) }, 9.5, 9)} fill={shorts} />

            {/* Secondary Core */}
            <ellipse
              cx={lerp(hip.x, shoulder.x, 0.4)}
              cy={lerp(hip.y, shoulder.y, 0.4) + 3}
              rx="12"
              ry="4"
              transform={`rotate(${((bodyAngleRad * 180) / Math.PI).toFixed(1)} ${lerp(hip.x, shoulder.x, 0.4).toFixed(1)} ${(lerp(hip.y, shoulder.y, 0.4) + 3).toFixed(1)})`}
              fill={secondaryGlow}
              opacity={0.45 + down * 0.3}
            />

            {/* Primary Crimson Pecs */}
            <ellipse
              cx={chestSpot.cx}
              cy={chestSpot.cy + 4}
              rx={chestSpot.rx}
              ry={chestSpot.ry}
              transform={`rotate(${chestSpot.deg.toFixed(1)} ${chestSpot.cx.toFixed(1)} ${(chestSpot.cy + 4).toFixed(1)})`}
              fill={primaryGlow}
              opacity={glow}
            />

            {/* Shoe planted on toe */}
            <path d={`M ${ankle.x} ${ankle.y - 3} L ${toe.x - 4} ${toe.y} L ${toe.x + 8} ${toe.y + 1} L ${ankle.x + 7} ${ankle.y + 4} Z`} fill="#1E293B" />

            <Head center={head} facing={1} tiltDeg={28} skinFill={skinNear} />

            {/* Near Arm */}
            <LimbSegment a={shoulder} b={arm.mid} r1={5.8} r2={4.6} fill={skinNear} stroke="#64748B" />
            <LimbSegment a={arm.mid} b={arm.end} r1={4.4} r2={3.6} fill={skinNear} stroke="#64748B" />
            <ellipse
              cx={triSpot.cx}
              cy={triSpot.cy}
              rx={triSpot.rx}
              ry={triSpot.ry}
              transform={`rotate(${triSpot.deg.toFixed(1)} ${triSpot.cx.toFixed(1)} ${triSpot.cy.toFixed(1)})`}
              fill={primaryGlow}
              opacity={glow}
            />
            <rect x={hand.x - 3} y={hand.y - 1} width="12" height="5" rx="2.5" fill={skinNear} stroke="#475569" strokeWidth="1" />

            {showGuides && (
              <g strokeWidth="1.8">
                {/* Straight ear-shoulder-hip-ankle line */}
                <line x1={ankle.x} y1={ankle.y} x2={head.x} y2={head.y} stroke="#16A34A" />
                <line x1="205" y1="186" x2="256" y2="186" stroke="#F59E0B" strokeDasharray="4 3" strokeWidth="1.4" />
              </g>
            )}
          </g>
        ),
      };
    }

    case 'cycling': {
      const theta = phase * Math.PI * 2;
      const crank = { x: 174, y: 168 };
      const crankR = 16;

      const pedalNear = { x: crank.x + Math.cos(theta) * crankR, y: crank.y + Math.sin(theta) * crankR };
      const pedalFar = { x: crank.x + Math.cos(theta + Math.PI) * crankR, y: crank.y + Math.sin(theta + Math.PI) * crankR };

      const hip = { x: 146, y: 120 };
      const shoulder = { x: 196, y: 86 };
      const head = { x: 207, y: 69 };
      const grip = { x: 226, y: 102 };

      const legNear = solveTwoBoneIK(hip, pedalNear, 38, 37, -1);
      const legFar = solveTwoBoneIK({ x: hip.x + 2, y: hip.y - 1 }, pedalFar, 38, 37, -1);
      const armNear = solveTwoBoneIK(shoulder, grip, 24, 22, 1);

      const powerStroke = clamp(Math.sin(theta) * 0.5 + 0.5, 0.25, 0.95);
      const phaseIdx = phase < 0.25 ? 1 : phase < 0.5 ? 2 : phase < 0.75 ? 3 : 0;

      const quadNear = muscleBellies(hip, legNear.mid, 0.5, 13, 5.8);
      const calfNear = muscleBellies(legNear.mid, pedalNear, 0.45, 11, 4.4);

      return {
        phaseIndex: phaseIdx,
        activeLabel: '75–90 RPM · Soft Knee Bend',
        svg: (
          <g>
            {/* Stabilizer Floor Shadow */}
            <ellipse cx="182" cy={floorY + 3} rx="78" ry="5" fill="rgba(15,23,42,0.14)" />

            {/* Far pedal + leg behind frame */}
            <line x1={crank.x} y1={crank.y} x2={pedalFar.x} y2={pedalFar.y} stroke="#475569" strokeWidth="3.5" strokeLinecap="round" />
            <LimbSegment a={{ x: hip.x + 2, y: hip.y - 1 }} b={legFar.mid} r1={8} r2={6} fill={skinFar} />
            <LimbSegment a={legFar.mid} b={pedalFar} r1={5.6} r2={3.8} fill={skinFar} />
            <Shoe ankle={pedalFar} far />

            {/* Spin Bike Frame */}
            <g stroke="#334155" strokeLinecap="round" strokeLinejoin="round">
              {/* Base feet */}
              <line x1="112" y1={floorY} x2="254" y2={floorY} strokeWidth="6" />
              {/* Seat post & saddle */}
              <line x1="146" y1="128" x2="174" y2="168" stroke="#475569" strokeWidth="5" />
              <path d="M 134 125 Q 148 122 158 127 L 138 131 Z" fill="#1E293B" stroke="none" />
              {/* Main diagonal frame */}
              <line x1="174" y1="168" x2="228" y2="122" stroke="#475569" strokeWidth="6" />
              <line x1="220" y1="128" x2="236" y2="166" stroke="#475569" strokeWidth="5" />
              {/* Handlebar stem & grip */}
              <line x1="222" y1="128" x2="226" y2="103" stroke="#64748B" strokeWidth="4.5" />
              <path d="M 218 103 Q 228 98 235 104" fill="none" stroke="#1E293B" strokeWidth="5" />
            </g>

            {/* Spinning Flywheel */}
            <g transform={`translate(236, 166) rotate(${((phase * 720) % 360).toFixed(1)})`}>
              <circle r="24" fill="#1E293B" stroke="#94A3B8" strokeWidth="3" />
              <line x1="-20" y1="0" x2="20" y2="0" stroke="#64748B" strokeWidth="2.5" />
              <line x1="0" y1="-20" x2="0" y2="20" stroke="#64748B" strokeWidth="2.5" />
              <circle r="5" fill="#CBD5E1" />
            </g>

            {/* Torso & Shorts */}
            <path d={torsoPath(hip, shoulder, 9.2, 11)} fill={skinNear} stroke="#64748B" strokeWidth="1" />
            <path d={torsoPath(hip, { x: lerp(hip.x, shoulder.x, 0.28), y: lerp(hip.y, shoulder.y, 0.28) }, 10, 9.5)} fill={shorts} />

            {/* Secondary Glute */}
            <ellipse cx={hip.x - 4} cy={hip.y + 3} rx="7" ry="5.5" fill={secondaryGlow} opacity="0.55" />

            {/* Near Crank + Leg */}
            <circle cx={crank.x} cy={crank.y} r="7" fill="#64748B" />
            <line x1={crank.x} y1={crank.y} x2={pedalNear.x} y2={pedalNear.y} stroke="#94A3B8" strokeWidth="4" strokeLinecap="round" />

            <LimbSegment a={hip} b={legNear.mid} r1={9} r2={6.6} fill={skinNear} stroke="#64748B" />
            <LimbSegment a={legNear.mid} b={pedalNear} r1={6.2} r2={4.2} fill={skinNear} stroke="#64748B" />
            <Shoe ankle={pedalNear} angleDeg={Math.sin(theta) * 10} />

            {/* Primary Crimson Quads + Calves */}
            <ellipse
              cx={quadNear.cx}
              cy={quadNear.cy}
              rx={quadNear.rx}
              ry={quadNear.ry}
              transform={`rotate(${quadNear.deg.toFixed(1)} ${quadNear.cx.toFixed(1)} ${quadNear.cy.toFixed(1)})`}
              fill={primaryGlow}
              opacity={powerStroke}
            />
            <ellipse
              cx={calfNear.cx}
              cy={calfNear.cy}
              rx={calfNear.rx}
              ry={calfNear.ry}
              transform={`rotate(${calfNear.deg.toFixed(1)} ${calfNear.cx.toFixed(1)} ${calfNear.cy.toFixed(1)})`}
              fill={primaryGlow}
              opacity={powerStroke * 0.85}
            />

            <Head center={head} facing={1} tiltDeg={12} skinFill={skinNear} />

            {/* Near Arm */}
            <LimbSegment a={shoulder} b={armNear.mid} r1={5.4} r2={4.4} fill={skinNear} stroke="#64748B" />
            <LimbSegment a={armNear.mid} b={grip} r1={4.2} r2={3.5} fill={skinNear} stroke="#64748B" />

            {showGuides && (
              <g strokeWidth="1.6">
                <line x1={hip.x} y1={hip.y} x2={shoulder.x} y2={shoulder.y} stroke="#16A34A" />
                <circle cx={crank.x} cy={crank.y} r={crankR} fill="none" stroke="#0284C7" strokeDasharray="3 3" />
              </g>
            )}
          </g>
        ),
      };
    }

    case 'jump_rope': {
      const theta = phase * Math.PI * 2;
      const inFront = Math.sin(theta) >= 0;
      const jump = Math.max(0, Math.sin(theta - 0.35)) * 13;
      const calfGlow = 0.45 + 0.5 * Math.max(0, Math.sin(theta - 0.1));
      const phaseIdx = phase < 0.25 ? 0 : phase < 0.5 ? 1 : phase < 0.75 ? 2 : 3;

      const yOff = -jump;
      const hipL = { x: 171, y: 126 + yOff };
      const hipR = { x: 189, y: 126 + yOff };
      const kneeL = { x: 169, y: 161 + yOff * 0.92 };
      const kneeR = { x: 191, y: 161 + yOff * 0.92 };
      const footL = { x: 168, y: 195 + yOff };
      const footR = { x: 192, y: 195 + yOff };

      const shL = { x: 159, y: 80 + yOff };
      const shR = { x: 201, y: 80 + yOff };
      const head = { x: 180, y: 56 + yOff };

      const elbowL = { x: 147, y: 106 + yOff };
      const elbowR = { x: 213, y: 106 + yOff };
      const wristL = { x: 136 + Math.cos(theta) * 4, y: 122 + yOff + Math.sin(theta) * 5 };
      const wristR = { x: 224 - Math.cos(theta) * 4, y: 122 + yOff + Math.sin(theta) * 5 };

      // 3D-projected curved rope arc
      const ropePeakY = 122 + yOff + Math.cos(theta) * 82;
      const ropeD = `M ${wristL.x.toFixed(1)} ${wristL.y.toFixed(1)} Q 180 ${ropePeakY.toFixed(1)} ${wristR.x.toFixed(1)} ${wristR.y.toFixed(1)}`;

      const ropeElement = (
        <path
          d={ropeD}
          fill="none"
          stroke={inFront ? '#0284C7' : '#64748B'}
          strokeWidth={inFront ? '2.6' : '2'}
          strokeLinecap="round"
          opacity={inFront ? 0.95 : 0.65}
        />
      );

      return {
        phaseIndex: phaseIdx,
        activeLabel: jump > 5 ? '1–2" Soft Bounce' : 'Wrists Spin · Elbows Tucked',
        svg: (
          <g>
            {/* Floor Mat + Dynamic Jump Shadow */}
            <rect x="92" y={floorY - 2} width="176" height="6" rx="3" fill="#475569" opacity="0.45" />
            <ellipse cx="180" cy={floorY + 3} rx={lerp(36, 26, jump / 13)} ry="4.5" fill="rgba(15,23,42,0.16)" />

            {!inFront && ropeElement}

            {/* Legs */}
            <LimbSegment a={hipL} b={kneeL} r1={8.4} r2={6} fill={skinNear} stroke="#64748B" />
            <LimbSegment a={kneeL} b={footL} r1={5.8} r2={4} fill={skinNear} stroke="#64748B" />
            <LimbSegment a={hipR} b={kneeR} r1={8.4} r2={6} fill={skinNear} stroke="#64748B" />
            <LimbSegment a={kneeR} b={footR} r1={5.8} r2={4} fill={skinNear} stroke="#64748B" />
            <Shoe ankle={footL} facing={-1} angleDeg={jump > 2 ? -12 : 0} />
            <Shoe ankle={footR} facing={1} angleDeg={jump > 2 ? -12 : 0} />

            {/* Primary Crimson Calves */}
            <ellipse cx={167} cy={lerp(kneeL.y, footL.y, 0.45)} rx="4.6" ry="11" fill={primaryGlow} opacity={calfGlow} />
            <ellipse cx={193} cy={lerp(kneeR.y, footR.y, 0.45)} rx="4.6" ry="11" fill={primaryGlow} opacity={calfGlow} />

            {/* Torso */}
            <path d={`M 164 ${126 + yOff} L 156 ${80 + yOff} Q 180 ${72 + yOff} 204 ${80 + yOff} L 196 ${126 + yOff} Z`} fill={skinNear} stroke="#64748B" strokeWidth="1" />
            <path d={`M 164 ${114 + yOff} L 196 ${114 + yOff} L 197 ${132 + yOff} L 182 ${132 + yOff} L 180 ${125 + yOff} L 178 ${132 + yOff} L 163 ${132 + yOff} Z`} fill={shorts} />

            {/* Secondary Forearms & Shoulders */}
            <circle cx={shL.x} cy={shL.y + 2} r="6.2" fill={secondaryGlow} opacity="0.55" />
            <circle cx={shR.x} cy={shR.y + 2} r="6.2" fill={secondaryGlow} opacity="0.55" />

            <Head center={head} facing={0} skinFill={skinNear} />

            {/* Arms + Handles */}
            <LimbSegment a={shL} b={elbowL} r1={5.4} r2={4.4} fill={skinNear} stroke="#64748B" />
            <LimbSegment a={elbowL} b={wristL} r1={4.2} r2={3.4} fill={skinNear} stroke="#64748B" />
            <LimbSegment a={shR} b={elbowR} r1={5.4} r2={4.4} fill={skinNear} stroke="#64748B" />
            <LimbSegment a={elbowR} b={wristR} r1={4.2} r2={3.4} fill={skinNear} stroke="#64748B" />
            <rect x={wristL.x - 5} y={wristL.y - 2} width="8" height="4" rx="1.5" fill="#1E293B" />
            <rect x={wristR.x - 3} y={wristR.y - 2} width="8" height="4" rx="1.5" fill="#1E293B" />

            {inFront && ropeElement}

            {showGuides && (
              <g strokeDasharray="4 3" strokeWidth="1.5">
                <line x1="180" y1={42 + yOff} x2="180" y2={floorY} stroke="#16A34A" />
                <line x1="126" y1={floorY - 12} x2="234" y2={floorY - 12} stroke="#F59E0B" opacity="0.7" />
              </g>
            )}
          </g>
        ),
      };
    }

    case 'brisk_walking': {
      const t = phase * Math.PI * 2;
      const bob = -Math.abs(Math.sin(t)) * 3.5;
      const hip = { x: 180, y: 126 + bob };
      const shoulder = { x: 183, y: 78 + bob };
      const head = { x: 185, y: 58 + bob };

      // Gait trajectory (ellipse foot travel)
      const strideX = 24;
      const liftY = 10;
      const ankleNear = {
        x: 180 + Math.sin(t) * strideX,
        y: 196 - Math.max(0, Math.cos(t)) * liftY,
      };
      const ankleFar = {
        x: 180 + Math.sin(t + Math.PI) * strideX,
        y: 196 - Math.max(0, Math.cos(t + Math.PI)) * liftY,
      };

      const legNear = solveTwoBoneIK(hip, ankleNear, 38, 37, -1);
      const legFar = solveTwoBoneIK({ x: hip.x - 2, y: hip.y }, ankleFar, 38, 37, -1);

      // Contralateral 90-deg athletic arm swing (opposite arm swings with opposite leg)
      const swingAngleNear = -Math.sin(t) * 0.55;
      const swingAngleFar = -Math.sin(t + Math.PI) * 0.55;

      const elbowNear = {
        x: shoulder.x + Math.sin(swingAngleNear) * 24,
        y: shoulder.y + Math.cos(swingAngleNear) * 24,
      };
      const handNear = {
        x: elbowNear.x + Math.cos(swingAngleNear) * 21,
        y: elbowNear.y - Math.sin(swingAngleNear) * 16 - 5,
      };

      const elbowFar = {
        x: shoulder.x + Math.sin(swingAngleFar) * 24,
        y: shoulder.y + Math.cos(swingAngleFar) * 24,
      };
      const handFar = {
        x: elbowFar.x + Math.cos(swingAngleFar) * 21,
        y: elbowFar.y - Math.sin(swingAngleFar) * 16 - 5,
      };

      const groundOffset = -((phase * 96) % 32);
      const calfNear = muscleBellies(legNear.mid, ankleNear, 0.45, 11, 4.4);
      const phaseIdx = phase < 0.25 ? 0 : phase < 0.5 ? 1 : phase < 0.75 ? 2 : 3;

      return {
        phaseIndex: phaseIdx,
        activeLabel: 'Tall Posture · 90° Contralateral Swing',
        svg: (
          <g>
            {/* Scrolling stride track markers */}
            <line x1="70" y1={floorY + 2} x2="290" y2={floorY + 2} stroke="#CBD5E1" strokeWidth="2" />
            {[0, 1, 2, 3, 4, 5, 6].map((i) => {
              const x = 90 + i * 32 + groundOffset;
              if (x < 75 || x > 285) return null;
              return <rect key={i} x={x} y={floorY + 1} width="10" height="3" rx="1.5" fill="#94A3B8" />;
            })}

            {/* Far Arm + Far Leg */}
            <LimbSegment a={shoulder} b={elbowFar} r1={5} r2={4} fill={skinFar} />
            <LimbSegment a={elbowFar} b={handFar} r1={3.8} r2={3} fill={skinFar} />
            <LimbSegment a={hip} b={legFar.mid} r1={8} r2={5.8} fill={skinFar} />
            <LimbSegment a={legFar.mid} b={ankleFar} r1={5.5} r2={3.8} fill={skinFar} />
            <Shoe ankle={ankleFar} angleDeg={Math.cos(t + Math.PI) * -14} far />

            {/* Torso */}
            <path d={torsoPath(hip, shoulder, 9, 10.5)} fill={skinNear} stroke="#64748B" strokeWidth="1" />
            <path d={torsoPath(hip, { x: lerp(hip.x, shoulder.x, 0.28), y: lerp(hip.y, shoulder.y, 0.28) }, 9.8, 9)} fill={shorts} />

            {/* Near Leg */}
            <LimbSegment a={hip} b={legNear.mid} r1={9} r2={6.4} fill={skinNear} stroke="#64748B" />
            <LimbSegment a={legNear.mid} b={ankleNear} r1={6} r2={4} fill={skinNear} stroke="#64748B" />
            <Shoe ankle={ankleNear} angleDeg={Math.cos(t) * -14} />

            {/* Primary Crimson Glute + Calf */}
            <ellipse cx={hip.x - 4} cy={hip.y + 4} rx="7.5" ry="6" fill={primaryGlow} opacity={0.45 + 0.45 * Math.abs(Math.sin(t))} />
            <ellipse
              cx={calfNear.cx}
              cy={calfNear.cy}
              rx={calfNear.rx}
              ry={calfNear.ry}
              transform={`rotate(${calfNear.deg.toFixed(1)} ${calfNear.cx.toFixed(1)} ${calfNear.cy.toFixed(1)})`}
              fill={primaryGlow}
              opacity={0.45 + 0.45 * Math.abs(Math.cos(t))}
            />

            {/* Secondary Core */}
            <ellipse cx={lerp(hip.x, shoulder.x, 0.4)} cy={lerp(hip.y, shoulder.y, 0.4)} rx="4.5" ry="9" fill={secondaryGlow} opacity="0.45" />

            <Head center={head} facing={1} skinFill={skinNear} />

            {/* Near Arm */}
            <LimbSegment a={shoulder} b={elbowNear} r1={5.4} r2={4.4} fill={skinNear} stroke="#64748B" />
            <LimbSegment a={elbowNear} b={handNear} r1={4.2} r2={3.4} fill={skinNear} stroke="#64748B" />

            {showGuides && (
              <g strokeWidth="1.6">
                <line x1={hip.x} y1={hip.y} x2={head.x} y2={head.y - 12} stroke="#16A34A" />
                <line x1={shoulder.x} y1={shoulder.y} x2={elbowNear.x} y2={elbowNear.y} stroke="#0284C7" strokeDasharray="3 3" />
              </g>
            )}
          </g>
        ),
      };
    }

    case 'plank': {
      const breath = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
      const braceGlow = 0.58 + 0.34 * breath;
      const phaseIdx = phase < 0.25 ? 0 : phase < 0.5 ? 1 : phase < 0.75 ? 2 : 3;

      const ankle = { x: 96, y: 185 };
      const toe = { x: 93, y: 199 };
      const hip = { x: 164, y: 175 - breath * 1.2 };
      const knee = { x: 130, y: 180 };
      const shoulder = { x: 224, y: 167 - breath * 1.4 };
      const head = { x: 244, y: 164 };

      const elbow = { x: 226, y: 195 };
      const wrist = { x: 250, y: 197 };

      const coreSpot = muscleBellies(hip, shoulder, 0.45, 16, 4.6);

      return {
        phaseIndex: phaseIdx,
        activeLabel: 'Isometric Brace · Neutral Pelvis',
        svg: (
          <g>
            {/* Exercise Mat */}
            <rect x="74" y={floorY - 3} width="208" height="7" rx="3.5" fill="#475569" />
            <ellipse cx="174" cy={floorY + 5} rx="88" ry="4" fill="rgba(15,23,42,0.12)" />

            {/* Rigid Legs + Torso */}
            <LimbSegment a={ankle} b={knee} r1={4.4} r2={6.4} fill={skinNear} stroke="#64748B" />
            <LimbSegment a={knee} b={hip} r1={6.6} r2={8.8} fill={skinNear} stroke="#64748B" />
            <path d={torsoPath(hip, shoulder, 8.8, 10.6)} fill={skinNear} stroke="#64748B" strokeWidth="1" />
            <path d={torsoPath(hip, { x: lerp(hip.x, shoulder.x, 0.28), y: lerp(hip.y, shoulder.y, 0.28) }, 9.5, 9)} fill={shorts} />

            {/* Primary Crimson Transverse Abdominis + Deltoid */}
            <ellipse
              cx={coreSpot.cx}
              cy={coreSpot.cy + 4}
              rx={coreSpot.rx}
              ry={coreSpot.ry}
              transform={`rotate(${coreSpot.deg.toFixed(1)} ${coreSpot.cx.toFixed(1)} ${(coreSpot.cy + 4).toFixed(1)})`}
              fill={primaryGlow}
              opacity={braceGlow}
            />
            <circle cx={shoulder.x} cy={shoulder.y + 2} r="7" fill={primaryGlow} opacity={braceGlow * 0.88} />

            {/* Secondary Glute */}
            <ellipse cx={hip.x - 4} cy={hip.y - 3} rx="7" ry="4.5" fill={secondaryGlow} opacity="0.55" />

            {/* Shoe */}
            <path d={`M ${ankle.x} ${ankle.y - 3} L ${toe.x - 3} ${toe.y} L ${toe.x + 8} ${toe.y + 1} L ${ankle.x + 7} ${ankle.y + 4} Z`} fill="#1E293B" />

            <Head center={head} facing={1} tiltDeg={22} skinFill={skinNear} />

            {/* Forearm Plank Arm Stack */}
            <LimbSegment a={shoulder} b={elbow} r1={5.8} r2={4.6} fill={skinNear} stroke="#64748B" />
            <LimbSegment a={elbow} b={wrist} r1={4.4} r2={3.5} fill={skinNear} stroke="#64748B" />

            {showGuides && (
              <g strokeWidth="1.8">
                {/* Straight ear-shoulder-hip-ankle line */}
                <line x1={ankle.x} y1={ankle.y} x2={head.x} y2={head.y} stroke="#16A34A" />
                {/* 90-degree vertical shoulder-to-elbow stack */}
                <line x1={shoulder.x} y1={shoulder.y} x2={elbow.x} y2={elbow.y} stroke="#0284C7" strokeDasharray="3 3" />
              </g>
            )}
          </g>
        ),
      };
    }

    case 'dead_bugs': {
      // Smooth alternating two-half cycle:
      // [0..0.5]: Near Arm extends overhead + Far Leg lowers
      // [0.5..1]: Far Arm extends overhead + Near Leg lowers
      const half = phase < 0.5 ? phase * 2 : (phase - 0.5) * 2;
      const ext = 0.5 - 0.5 * Math.cos(half * Math.PI * 2);
      const isFirstSide = phase < 0.5;
      const nearArmExt = isFirstSide ? ext : 0;
      const farArmExt = isFirstSide ? 0 : ext;
      const farLegExt = isFirstSide ? ext : 0;
      const nearLegExt = isFirstSide ? 0 : ext;
      const phaseIdx = phase < 0.14 ? 0 : phase < 0.45 ? 1 : phase < 0.65 ? 2 : 3;

      const head = { x: 96, y: 186 };
      const shoulder = { x: 118, y: 187 };
      const hip = { x: 174, y: 189 };

      // Tabletop vs extended positions
      const handNear = {
        x: lerp(120, 74, nearArmExt),
        y: lerp(138, 184, nearArmExt),
      };
      const handFar = {
        x: lerp(124, 78, farArmExt),
        y: lerp(136, 182, farArmExt),
      };

      const kneeNear = {
        x: lerp(176, 208, nearLegExt),
        y: lerp(152, 183, nearLegExt),
      };
      const ankleNear = {
        x: lerp(212, 244, nearLegExt),
        y: lerp(152, 182, nearLegExt),
      };

      const kneeFar = {
        x: lerp(178, 210, farLegExt),
        y: lerp(150, 181, farLegExt),
      };
      const ankleFar = {
        x: lerp(214, 246, farLegExt),
        y: lerp(150, 180, farLegExt),
      };

      const coreGlow = 0.42 + 0.52 * ext;

      return {
        phaseIndex: phaseIdx,
        activeLabel: 'Lumbar Pressed Flush · Opposite Extend',
        svg: (
          <g>
            {/* Exercise Mat */}
            <rect x="64" y={floorY - 3} width="224" height="7" rx="3.5" fill="#475569" />

            {/* Far Arm + Far Leg */}
            <LimbSegment a={{ x: shoulder.x + 2, y: shoulder.y - 2 }} b={handFar} r1={5} r2={3.4} fill={skinFar} />
            <LimbSegment a={{ x: hip.x + 2, y: hip.y - 2 }} b={kneeFar} r1={8} r2={5.8} fill={skinFar} />
            <LimbSegment a={kneeFar} b={ankleFar} r1={5.5} r2={3.8} fill={skinFar} />
            <Shoe ankle={ankleFar} angleDeg={lerp(-70, -15, farLegExt)} far />

            {/* Supine Torso flush to mat */}
            <path d={torsoPath(hip, shoulder, 9.2, 10.6)} fill={skinNear} stroke="#64748B" strokeWidth="1" />
            <path d={torsoPath(hip, { x: lerp(hip.x, shoulder.x, 0.28), y: lerp(hip.y, shoulder.y, 0.28) }, 9.8, 9.2)} fill={shorts} />

            {/* Primary Crimson Deep Core */}
            <ellipse cx={lerp(shoulder.x, hip.x, 0.45)} cy={183} rx="18" ry="5" fill={primaryGlow} opacity={coreGlow} />

            {/* Head resting supine */}
            <Head center={head} facing={1} tiltDeg={-78} skinFill={skinNear} />

            {/* Near Leg */}
            <LimbSegment a={hip} b={kneeNear} r1={9} r2={6.4} fill={skinNear} stroke="#64748B" />
            <LimbSegment a={kneeNear} b={ankleNear} r1={6} r2={4} fill={skinNear} stroke="#64748B" />
            <Shoe ankle={ankleNear} angleDeg={lerp(-70, -15, nearLegExt)} />

            {/* Near Arm */}
            <LimbSegment a={shoulder} b={handNear} r1={5.4} r2={3.6} fill={skinNear} stroke="#64748B" />

            {/* Secondary Hip Flexor / Shoulder */}
            <circle cx={shoulder.x} cy={shoulder.y - 4} r="5.5" fill={secondaryGlow} opacity={0.35 + ext * 0.35} />

            {showGuides && (
              <g strokeWidth="1.8">
                {/* Lumbar seal flush against mat indicator */}
                <line x1="128" y1="199" x2="174" y2="199" stroke="#16A34A" strokeWidth="3" />
                <line x1="176" y1="138" x2="176" y2="195" stroke="#0284C7" strokeDasharray="3 3" strokeWidth="1.4" />
              </g>
            )}
          </g>
        ),
      };
    }

    case 'swimming': {
      const t = phase * Math.PI * 2;
      const shoulder = { x: 214, y: 124 };
      const hip = { x: 154, y: 128 };
      const head = { x: 234, y: 122 };

      // Freestyle oval catch-pull-recovery stroke (near & far arms 180 deg offset)
      const strokePoint = (ang: number): Vec2 => ({
        x: shoulder.x + Math.cos(ang) * 34,
        y: shoulder.y + Math.sin(ang) * 28,
      });

      const handNear = strokePoint(t);
      const handFar = strokePoint(t + Math.PI);
      const elbowNear = solveTwoBoneIK(shoulder, handNear, 24, 22, 1).mid;
      const elbowFar = solveTwoBoneIK(shoulder, handFar, 24, 22, 1).mid;

      // Smooth 6-beat flutter kick from hips
      const kickNear = Math.sin(t * 2) * 12;
      const kickFar = Math.sin(t * 2 + Math.PI) * 12;
      const kneeNear = { x: 120, y: 130 + kickNear * 0.4 };
      const ankleNear = { x: 88, y: 132 + kickNear };
      const kneeFar = { x: 120, y: 130 + kickFar * 0.4 };
      const ankleFar = { x: 88, y: 132 + kickFar };

      const pullGlow = 0.4 + 0.52 * Math.max(0, Math.sin(t));
      const phaseIdx = phase < 0.25 ? 0 : phase < 0.5 ? 1 : phase < 0.75 ? 2 : 3;

      return {
        phaseIndex: phaseIdx,
        activeLabel: 'Streamlined Line · High-Elbow Catch',
        svg: (
          <g>
            {/* Water Surface & Pool Depth */}
            <rect x="40" y="122" width="280" height="92" rx="12" fill="rgba(14,165,233,0.14)" />
            <path
              d={`M 40 122 Q 95 ${118 + Math.sin(t) * 3} 150 122 T 260 122 T 320 122`}
              fill="none"
              stroke="#0EA5E9"
              strokeWidth="2.2"
              opacity="0.7"
            />
            {/* Flutter bubbles */}
            <circle cx={80 + (phase * 25) % 14} cy={128 + kickNear * 0.5} r="2.6" fill="#38BDF8" opacity="0.6" />
            <circle cx={68 + (phase * 18) % 12} cy={136 - kickNear * 0.4} r="2" fill="#38BDF8" opacity="0.5" />

            {/* Far Leg + Far Arm */}
            <LimbSegment a={hip} b={kneeFar} r1={7.8} r2={5.5} fill={skinFar} />
            <LimbSegment a={kneeFar} b={ankleFar} r1={5.2} r2={3.5} fill={skinFar} />
            <LimbSegment a={shoulder} b={elbowFar} r1={5} r2={4} fill={skinFar} />
            <LimbSegment a={elbowFar} b={handFar} r1={3.8} r2={3} fill={skinFar} />

            {/* Streamlined Torso */}
            <path d={torsoPath(hip, shoulder, 8.8, 10.6)} fill={skinNear} stroke="#64748B" strokeWidth="1" />
            <path d={torsoPath(hip, { x: lerp(hip.x, shoulder.x, 0.28), y: lerp(hip.y, shoulder.y, 0.28) }, 9.5, 9)} fill={shorts} />

            {/* Primary Crimson Lats + Deltoid */}
            <ellipse cx={lerp(hip.x, shoulder.x, 0.65)} cy={129} rx="12" ry="5" fill={primaryGlow} opacity={pullGlow} />
            <circle cx={shoulder.x} cy={shoulder.y} r="7" fill={primaryGlow} opacity={pullGlow} />

            {/* Near Leg */}
            <LimbSegment a={hip} b={kneeNear} r1={8.6} r2={6} fill={skinNear} stroke="#64748B" />
            <LimbSegment a={kneeNear} b={ankleNear} r1={5.8} r2={3.8} fill={skinNear} stroke="#64748B" />

            <Head center={head} facing={1} tiltDeg={14} skinFill={skinNear} />

            {/* Near Arm Stroke */}
            <LimbSegment a={shoulder} b={elbowNear} r1={5.4} r2={4.4} fill={skinNear} stroke="#64748B" />
            <LimbSegment a={elbowNear} b={handNear} r1={4.2} r2={3.3} fill={skinNear} stroke="#64748B" />

            {showGuides && (
              <g strokeWidth="1.6">
                <line x1="88" y1="126" x2="236" y2="124" stroke="#16A34A" />
                <ellipse cx={shoulder.x} cy={shoulder.y} rx="34" ry="28" fill="none" stroke="#0284C7" strokeDasharray="3 3" />
              </g>
            )}
          </g>
        ),
      };
    }

    case 'rowing': {
      // 4-part Ergometer Stroke:
      // 0..0.42: Drive (seat slides back 202 -> 130, torso leans -18 -> +16 deg, handle pulls to chest)
      // 0.42..0.52: Crisp Finish hold
      // 0.52..1.00: Reverse Recovery (arms out -> torso hinges -> knees bend to Catch)
      let legExt = 0;
      let leanDeg = 18; // + = leaned forward toward flywheel, - = leaned back
      let armPull = 0; // 0 = straight toward footplate, 1 = pulled to lower chest

      if (phase < 0.45) {
        const p = phase / 0.45;
        legExt = smoothstep(p / 0.72);
        leanDeg = lerp(18, -14, smoothstep((p - 0.25) / 0.65));
        armPull = smoothstep((p - 0.45) / 0.55);
      } else if (phase < 0.55) {
        legExt = 1;
        leanDeg = -14;
        armPull = 1;
      } else {
        const p = (phase - 0.55) / 0.45;
        armPull = 1 - smoothstep(p / 0.38);
        leanDeg = lerp(-14, 18, smoothstep((p - 0.18) / 0.45));
        legExt = 1 - smoothstep((p - 0.35) / 0.65);
      }

      const seatX = lerp(196, 130, legExt);
      const seatY = 178;
      const hip = { x: seatX, y: seatY - 6 };

      const torsoRad = (leanDeg * Math.PI) / 180;
      const shoulder = {
        x: hip.x + Math.sin(torsoRad) * 46,
        y: hip.y - Math.cos(torsoRad) * 46,
      };
      const head = {
        x: shoulder.x + Math.sin(torsoRad) * 18,
        y: shoulder.y - Math.cos(torsoRad) * 18,
      };

      const foot = { x: 224, y: 170 };
      const leg = solveTwoBoneIK(hip, foot, 38, 37, -1);

      const handleExtended = { x: shoulder.x + 36, y: shoulder.y + 20 };
      const handlePulled = { x: lerp(hip.x, shoulder.x, 0.55) + 12, y: lerp(hip.y, shoulder.y, 0.55) + 6 };
      const handle = {
        x: lerp(handleExtended.x, handlePulled.x, armPull),
        y: lerp(handleExtended.y, handlePulled.y, armPull),
      };
      const arm = solveTwoBoneIK(shoulder, handle, 24, 22, 1);

      const quadGlow = 0.35 + 0.6 * clamp(legExt * (phase < 0.5 ? 1 : 0.3), 0, 1);
      const latGlow = 0.35 + 0.6 * clamp(armPull, 0, 1);
      const quadSpot = muscleBellies(hip, leg.mid, 0.5, 13, 5.5);
      const phaseIdx = phase < 0.12 ? 0 : phase < 0.36 ? 1 : phase < 0.58 ? 2 : 3;

      return {
        phaseIndex: phaseIdx,
        activeLabel: armPull > 0.6 ? 'Finish Pull · Handle to Ribs' : legExt > 0.4 ? 'Drive Legs First' : 'Catch · Shins Vertical',
        svg: (
          <g>
            {/* Ergometer Rail & Flywheel */}
            <ellipse cx="176" cy={floorY + 3} rx="90" ry="4.5" fill="rgba(15,23,42,0.12)" />
            {/* Monorail */}
            <rect x="86" y="182" width="150" height="6" rx="3" fill="#475569" />
            <line x1="94" y1="188" x2="90" y2={floorY} stroke="#334155" strokeWidth="5" strokeLinecap="round" />
            <line x1="238" y1="188" x2="246" y2={floorY} stroke="#334155" strokeWidth="5" strokeLinecap="round" />
            {/* Angled Footstretcher */}
            <line x1="216" y1="184" x2="232" y2="160" stroke="#64748B" strokeWidth="5" strokeLinecap="round" />
            {/* Flywheel Housing */}
            <g transform={`translate(256, 160)`}>
              <circle r="24" fill="#1E293B" stroke="#94A3B8" strokeWidth="2.5" />
              <g transform={`rotate(${((phase * 1080) % 360).toFixed(1)})`}>
                <line x1="-18" y1="0" x2="18" y2="0" stroke="#64748B" strokeWidth="2.5" />
                <line x1="0" y1="-18" x2="0" y2="18" stroke="#64748B" strokeWidth="2.5" />
              </g>
              <circle r="5" fill="#CBD5E1" />
            </g>
            {/* Chain Cable */}
            <line x1={handle.x} y1={handle.y} x2="236" y2="156" stroke="#94A3B8" strokeWidth="1.8" />

            {/* Sliding Seat */}
            <rect x={seatX - 11} y={seatY - 2} width="22" height="6" rx="2.5" fill="#1E293B" />

            {/* Torso */}
            <path d={torsoPath(hip, shoulder, 9.2, 10.8)} fill={skinNear} stroke="#64748B" strokeWidth="1" />
            <path d={torsoPath(hip, { x: lerp(hip.x, shoulder.x, 0.28), y: lerp(hip.y, shoulder.y, 0.28) }, 9.8, 9.2)} fill={shorts} />

            {/* Primary Crimson Muscles: Lats + Quads */}
            <ellipse
              cx={lerp(hip.x, shoulder.x, 0.6)}
              cy={lerp(hip.y, shoulder.y, 0.6)}
              rx="6"
              ry="11"
              transform={`rotate(${leanDeg.toFixed(1)} ${lerp(hip.x, shoulder.x, 0.6).toFixed(1)} ${lerp(hip.y, shoulder.y, 0.6).toFixed(1)})`}
              fill={primaryGlow}
              opacity={latGlow}
            />

            {/* Leg */}
            <LimbSegment a={hip} b={leg.mid} r1={9} r2={6.5} fill={skinNear} stroke="#64748B" />
            <LimbSegment a={leg.mid} b={foot} r1={6} r2={4} fill={skinNear} stroke="#64748B" />
            <Shoe ankle={foot} angleDeg={-38} />
            <ellipse
              cx={quadSpot.cx}
              cy={quadSpot.cy}
              rx={quadSpot.rx}
              ry={quadSpot.ry}
              transform={`rotate(${quadSpot.deg.toFixed(1)} ${quadSpot.cx.toFixed(1)} ${quadSpot.cy.toFixed(1)})`}
              fill={primaryGlow}
              opacity={quadGlow}
            />

            <Head center={head} facing={1} tiltDeg={leanDeg * 0.4} skinFill={skinNear} />

            {/* Arm + Handle */}
            <LimbSegment a={shoulder} b={arm.mid} r1={5.4} r2={4.4} fill={skinNear} stroke="#64748B" />
            <LimbSegment a={arm.mid} b={handle} r1={4.2} r2={3.4} fill={skinNear} stroke="#64748B" />
            <rect x={handle.x - 2} y={handle.y - 6} width="4" height="12" rx="2" fill="#0284C7" />

            {showGuides && (
              <g strokeWidth="1.6">
                <line x1={hip.x} y1={hip.y} x2={shoulder.x} y2={shoulder.y} stroke="#16A34A" />
                <line x1={handle.x} y1={handle.y} x2="236" y2="156" stroke="#0284C7" strokeDasharray="3 3" />
              </g>
            )}
          </g>
        ),
      };
    }
  }
}

export function ExercisePostureAnimator({
  exercise,
  animationKeyOverride,
  variant = 'studio',
  className = '',
}: ExercisePostureAnimatorProps) {
  const uid = useId().replace(/:/g, '');
  const animKey = animationKeyOverride ?? resolveExerciseAnimationKey(exercise);
  const spec = EXERCISE_POSTURE_SPECS[animKey];

  const [playing, setPlaying] = useState(true);
  const [slowMo, setSlowMo] = useState(false);
  const [showGuides, setShowGuides] = useState(variant === 'studio');
  const [phase, setPhase] = useState(0);
  const [inView, setInView] = useState(true);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const lastCommitRef = useRef<number>(0);

  useEffect(() => {
    setPhase(0);
    lastTimeRef.current = null;
    lastCommitRef.current = 0;
  }, [animKey]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]) setInView(entries[0].isIntersecting);
      },
      { threshold: 0.05 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || !inView) {
      lastTimeRef.current = null;
      return;
    }

    const duration = CYCLE_DURATION_MS[animKey] * (slowMo ? 2 : 1);
    const minIntervalMs = variant === 'thumb' ? 34 : 16;

    const tick = (now: number) => {
      if (lastTimeRef.current === null) {
        lastTimeRef.current = now;
        lastCommitRef.current = now;
      }
      if (now - lastCommitRef.current >= minIntervalMs) {
        const dt = now - lastTimeRef.current;
        lastTimeRef.current = now;
        lastCommitRef.current = now;
        setPhase((prev) => (prev + dt / duration) % 1);
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [playing, slowMo, inView, variant, animKey]);

  const frame = useMemo(
    () => renderExerciseFrame(animKey, phase, showGuides && variant === 'studio', uid),
    [animKey, phase, showGuides, variant, uid]
  );

  const svgDefs = (
    <defs>
      <linearGradient id={`${uid}-skinNear`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#E2E8F0" />
        <stop offset="55%" stopColor="#CBD5E1" />
        <stop offset="100%" stopColor="#94A3B8" />
      </linearGradient>
      <linearGradient id={`${uid}-skinFar`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#94A3B8" />
        <stop offset="100%" stopColor="#64748B" />
      </linearGradient>
      <linearGradient id={`${uid}-shorts`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#334155" />
        <stop offset="100%" stopColor="#1E293B" />
      </linearGradient>
      <radialGradient id={`${uid}-musclePrimary`} cx="50%" cy="50%" r="55%">
        <stop offset="0%" stopColor="#FB7185" />
        <stop offset="65%" stopColor="#E11D48" />
        <stop offset="100%" stopColor="#BE123C" stopOpacity="0.85" />
      </radialGradient>
      <radialGradient id={`${uid}-muscleSecondary`} cx="50%" cy="50%" r="55%">
        <stop offset="0%" stopColor="#FCD34D" />
        <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.82" />
      </radialGradient>
    </defs>
  );

  if (variant === 'thumb') {
    return (
      <div
        ref={containerRef}
        data-anim-key={animKey}
        data-phase={phase.toFixed(3)}
        className={`relative rounded-xl bg-[#F8FAFC] dark:bg-[#101628] border border-[var(--border-subtle)] overflow-hidden flex items-center justify-center shrink-0 ${className}`}
        aria-label={`${spec.shortName} animated posture preview`}
      >
        <svg viewBox="48 16 264 202" className="w-full h-full block" role="img" aria-hidden="true">
          {svgDefs}
          {frame.svg}
        </svg>
      </div>
    );
  }

  return (
    <section
      ref={containerRef}
      className={`fitsync-card overflow-hidden ${className}`}
      aria-label={`${spec.title} posture demonstration`}
      data-anim-key={animKey}
      data-phase={phase.toFixed(3)}
    >
      {/* Top Studio Header Bar */}
      <div className="px-5 pt-4 pb-3 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)]">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--primary)]">
            Correct Posture Demonstration · {spec.equipment}
          </p>
          <h2 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] mt-0.5">
            {spec.title}
          </h2>
        </div>

        {/* Interactive Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            data-testid="posture-play-toggle"
            className="h-9 px-3.5 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <AppIcon name={playing ? 'pause' : 'play'} size={14} />
            <span>{playing ? 'Pause' : 'Play'}</span>
          </button>

          <button
            type="button"
            onClick={() => setSlowMo((s) => !s)}
            data-testid="posture-speed-toggle"
            aria-pressed={slowMo}
            className={`h-9 px-3 rounded-lg border text-xs font-bold tabular-nums transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              slowMo
                ? 'bg-amber-500/15 border-amber-500/50 text-amber-700 dark:text-amber-300'
                : 'bg-[var(--surface-inset)] border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--border-subtle)]/70'
            }`}
          >
            {slowMo ? '0.5× Slow-Mo' : '1× Normal'}
          </button>

          <button
            type="button"
            onClick={() => setShowGuides((g) => !g)}
            data-testid="posture-guides-toggle"
            aria-pressed={showGuides}
            className={`h-9 px-3 rounded-lg border text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showGuides
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                : 'bg-[var(--surface-inset)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Form Guides
          </button>
        </div>
      </div>

      {/* Studio Viewport Canvas */}
      <div className="relative bg-gradient-to-b from-[#F8FAFC] to-[#EEF2F7] dark:from-[#0F1527] dark:to-[#171F38] px-4 py-3">
        <div className="max-w-lg mx-auto">
          <svg
            viewBox="36 12 288 210"
            className="w-full h-56 sm:h-64 block select-none"
            role="img"
            aria-label={`Animated posture guide showing ${spec.title}`}
          >
            {svgDefs}
            {/* Subtle studio floor horizon line */}
            <line x1="48" y1="204" x2="312" y2="204" stroke="rgba(148,163,184,0.35)" strokeWidth="1" />
            {frame.svg}
          </svg>
        </div>

        {/* Live Biomechanical Cue Strip + Anatomical Legend */}
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold text-[var(--text-primary)] tabular-nums">
            Form Cue: <span className="text-[var(--primary)]">{frame.activeLabel}</span>
          </span>

          <div className="flex items-center gap-4 text-[11px] font-semibold text-[var(--text-secondary)]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#E11D48] inline-block" aria-hidden="true" />
              Primary Target
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#F59E0B] inline-block" aria-hidden="true" />
              Stabilizers
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Phase Stepper (Click any step to inspect exact posture frame) */}
      <div className="px-5 py-3 bg-[var(--surface-inset)] border-y border-[var(--border-subtle)] grid grid-cols-2 sm:grid-cols-4 gap-2">
        {spec.phases.map((label, idx) => {
          const isCurrent = frame.phaseIndex === idx;
          return (
            <button
              key={label}
              type="button"
              onClick={() => {
                setPlaying(false);
                setPhase(idx === 0 ? 0.02 : idx === 1 ? 0.28 : idx === 2 ? 0.5 : 0.78);
              }}
              className={`px-2.5 py-2 rounded-xl text-left border transition-colors cursor-pointer ${
                isCurrent
                  ? 'bg-[var(--card-surface)] border-[var(--primary)] text-[var(--text-primary)]'
                  : 'bg-transparent border-transparent text-[var(--text-secondary)] hover:bg-[var(--card-surface)]/70'
              }`}
            >
              <span className="block text-[10px] font-extrabold uppercase tracking-wider text-[var(--primary)] tabular-nums">
                0{idx + 1}
              </span>
              <span className="block text-xs font-bold truncate">{label}</span>
            </button>
          );
        })}
      </div>

      {/* Muscles Engaged + Checklist & Common Mistakes */}
      <div className="p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[var(--text-secondary)]">
          <span>
            <strong className="text-[#E11D48] dark:text-[#FB7185] font-bold">Primary:</strong>{' '}
            {spec.primaryMuscles.join(', ')}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <strong className="text-amber-600 dark:text-amber-400 font-bold">Secondary:</strong>{' '}
            {spec.secondaryMuscles.join(', ')}
          </span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">
            <strong className="text-[var(--text-primary)] font-bold">Tempo:</strong> {spec.tempoLabel}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-[var(--surface-inset)] p-4">
            <p className="text-xs font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-2">
              Correct Alignment Checklist
            </p>
            <ul className="space-y-1.5 text-xs text-[var(--text-primary)] leading-relaxed">
              {spec.postureChecklist.map((cue, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">✓</span>
                  <span>{cue}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl bg-[var(--surface-inset)] p-4 flex flex-col justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wider text-rose-700 dark:text-rose-400 mb-2">
                Mistakes to Avoid
              </p>
              <ul className="space-y-1.5 text-xs text-[var(--text-primary)] leading-relaxed">
                {spec.commonMistakes.map((mistake, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-rose-600 dark:text-rose-400 font-bold mt-0.5">✕</span>
                    <span>{mistake}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-[11px] font-medium text-[var(--text-secondary)] pt-2 border-t border-[var(--border-subtle)]">
              <strong className="text-[var(--text-primary)]">Breathing:</strong> {spec.breathingCue}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
