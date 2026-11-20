import type { ExerciseItem } from '../types/fitsync';
import dataset from './calibrate_dataset.json';

export type ExerciseAnimationKey =
  | 'squats'
  | 'goblet_squats'
  | 'dumbbell_press'
  | 'pushups'
  | 'cycling'
  | 'jump_rope'
  | 'brisk_walking'
  | 'plank'
  | 'dead_bugs'
  | 'swimming'
  | 'rowing';

export interface ExercisePostureSpec {
  key: ExerciseAnimationKey;
  linkedExerciseId: string;
  title: string;
  shortName: string;
  category: 'Strength' | 'Cardio' | 'Core & Joint-Safe';
  equipment: string;
  tempoLabel: string;
  breathingCue: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  phases: [string, string, string, string];
  postureChecklist: string[];
  commonMistakes: string[];
  safetySwapNote?: string;
}

export const ALL_POSTURE_KEYS: ExerciseAnimationKey[] = [
  'squats',
  'goblet_squats',
  'dumbbell_press',
  'pushups',
  'cycling',
  'jump_rope',
  'brisk_walking',
  'plank',
  'dead_bugs',
  'swimming',
  'rowing',
];

export const EXERCISE_POSTURE_SPECS: Record<ExerciseAnimationKey, ExercisePostureSpec> = {
  squats: {
    key: 'squats',
    linkedExerciseId: 'ex_01',
    title: 'Barbell Squat / Hinge',
    shortName: 'Squats',
    category: 'Strength',
    equipment: 'Barbell & Plates',
    tempoLabel: '3-1-1 Controlled',
    breathingCue: 'Inhale & brace core before descent; exhale through sticking point on ascent.',
    primaryMuscles: ['Quadriceps', 'Gluteus Maximus'],
    secondaryMuscles: ['Hamstrings', 'Spinal Erectors', 'Core'],
    phases: ['Tall Setup', 'Eccentric Lower', 'Parallel Bottom', 'Concentric Drive'],
    postureChecklist: [
      'Feet shoulder-width apart with toes turned slightly out (~15°).',
      'Barbell travels in a straight vertical line over your midfoot.',
      'Neutral spine and braced ribs; knees track directly over 2nd–3rd toes.',
      'Descend until hip crease reaches knee height, then drive evenly through full foot.',
    ],
    commonMistakes: [
      'Rounding the lower back or collapsing knees inward (valgus) at the bottom.',
      'Lifting heels off the floor by pitching weight too far onto the toes.',
    ],
  },
  goblet_squats: {
    key: 'goblet_squats',
    linkedExerciseId: 'ex_01',
    title: 'Goblet / Box Squats',
    shortName: 'Goblet Squats',
    category: 'Core & Joint-Safe',
    equipment: 'Kettlebell / Dumbbell & Plyo Box',
    tempoLabel: '3-1-1 Joint-Safe',
    breathingCue: 'Inhale into belly on descent; exhale steadily while standing tall off the box.',
    primaryMuscles: ['Quadriceps', 'Gluteus Maximus'],
    secondaryMuscles: ['Anterior Core', 'Upper Back', 'Deltoids'],
    phases: ['Chest Cradle', 'Sit Back', 'Light Box Tap', 'Upright Stand'],
    postureChecklist: [
      'Cradle weight flush against your sternum with elbows tucked softly down.',
      'Keep torso noticeably upright as hips sit back toward the box.',
      'Tap the box lightly without relaxing tension, keeping shins near vertical.',
      'Drive knees wide and stand smoothly without bouncing off the box.',
    ],
    commonMistakes: [
      'Plopping all body weight onto the box and losing core brace.',
      'Letting the kettlebell drift forward away from the chest.',
    ],
    safetySwapNote: 'Low-axial-load swap activated for Knee / Joint Pain protection.',
  },
  dumbbell_press: {
    key: 'dumbbell_press',
    linkedExerciseId: 'ex_02',
    title: 'Overhead Dumbbell Press',
    shortName: 'Dumbbell Press',
    category: 'Strength',
    equipment: 'Pair of Hex Dumbbells',
    tempoLabel: '2-0-2 Smooth',
    breathingCue: 'Exhale smoothly as you press overhead; inhale slowly back to shoulder height.',
    primaryMuscles: ['Anterior & Lateral Deltoids', 'Triceps'],
    secondaryMuscles: ['Upper Pectorals', 'Serratus Anterior', 'Core'],
    phases: ['Rack Position', 'Press Up', 'Overhead Lockout', 'Controlled Lower'],
    postureChecklist: [
      'Ribcage stacked directly over pelvis — glutes lightly squeezed to prevent lumbar arch.',
      'Elbows positioned ~30–45° forward in the scapular plane, not flared straight out.',
      'Forearms stay vertical beneath dumbbells from start to lockout.',
      'Press biceps beside ears without shrugging traps up toward neck.',
    ],
    commonMistakes: [
      'Hyperextending the lower back and flaring ribs upward on heavy reps.',
      'Flaring elbows 90° out to the sides or holding breath (Valsalva).',
    ],
  },
  pushups: {
    key: 'pushups',
    linkedExerciseId: 'ex_03',
    title: 'Bodyweight Push-Ups',
    shortName: 'Push-Ups',
    category: 'Strength',
    equipment: 'Exercise Mat',
    tempoLabel: '2-1-1 Crisp',
    breathingCue: 'Inhale on the descent; exhale forcefully as hands push the floor away.',
    primaryMuscles: ['Pectoralis Major', 'Triceps'],
    secondaryMuscles: ['Anterior Deltoids', 'Transverse Abdominis'],
    phases: ['High Plank', 'Chest Descent', 'Bottom Hover', 'Full Press-Out'],
    postureChecklist: [
      'Maintain one rigid straight line from ear → shoulder → hip → ankle.',
      'Hands placed slightly wider than shoulder-width; screw palms outward.',
      'Tuck elbows at a ~45° arrow angle relative to ribs (never flared T-shape).',
      'Lower chest within 2 inches of mat, then press up until shoulder blades protract.',
    ],
    commonMistakes: [
      'Dropping hips toward the floor or piking hips high into the air.',
      'Craning head forward so the chin reaches the floor before the chest.',
    ],
  },
  cycling: {
    key: 'cycling',
    linkedExerciseId: 'ex_04',
    title: 'Stationary Cycling',
    shortName: 'Stationary Cycling',
    category: 'Cardio',
    equipment: 'Stationary Spin Bike',
    tempoLabel: '75–90 RPM Steady',
    breathingCue: 'Rhythmic nasal/mouth breathing matching steady pedal cadence.',
    primaryMuscles: ['Quadriceps', 'Calves'],
    secondaryMuscles: ['Glutes', 'Hamstrings'],
    phases: ['Top Dead Center', 'Power Downstroke', 'Bottom Sweep', 'Upstroke Pull'],
    postureChecklist: [
      'Saddle height keeps a comfortable 25–30° soft bend in the knee at bottom of pedal stroke.',
      'Long neutral spine hinged lightly from hips — shoulders relaxed away from ears.',
      'Light grip on handlebars without locking elbows.',
      'Drive evenly through ball of foot across the full 360° circle.',
    ],
    commonMistakes: [
      'Seat set too low (over-compressing knees) or too high (hips rocking side to side).',
      'Hunching upper back and putting heavy weight onto wrists.',
    ],
  },
  jump_rope: {
    key: 'jump_rope',
    linkedExerciseId: 'ex_05',
    title: 'Rhythmic Jump Rope',
    shortName: 'Jump Rope',
    category: 'Cardio',
    equipment: 'Speed Jump Rope & Mat',
    tempoLabel: '110–130 RPM Bounce',
    breathingCue: 'Light continuous breathing every 2–3 revolutions; avoid breath-holding.',
    primaryMuscles: ['Calves (Gastrocnemius)', 'Ankle Stabilizers'],
    secondaryMuscles: ['Quadriceps', 'Forearms', 'Deltoids'],
    phases: ['Midfoot Takeoff', '1-Inch Hover', 'Soft Landing', 'Wrist Spin'],
    postureChecklist: [
      'Elbows tucked gently near ribs; wrists (not whole shoulders) rotate the rope.',
      'Jump only 1–2 inches off the mat, rebounding softly on balls of feet.',
      'Knees stay slightly bent as natural shock absorbers.',
      'Gaze straight ahead with chest tall and core lightly engaged.',
    ],
    commonMistakes: [
      'Donkey-kicking heels backward or tucking knees high on every jump.',
      'Flailing wide arms, which shortens the rope arc and fatigues shoulders.',
    ],
  },
  brisk_walking: {
    key: 'brisk_walking',
    linkedExerciseId: 'ex_06',
    title: 'Athletic Brisk Walking',
    shortName: 'Brisk Walking',
    category: 'Cardio',
    equipment: 'Supportive Walking Shoes',
    tempoLabel: '3.5–3.9 mph Stride',
    breathingCue: 'Steady conversational nasal-exhale cadence throughout stride.',
    primaryMuscles: ['Glutes', 'Calves'],
    secondaryMuscles: ['Hamstrings', 'Quadriceps', 'Core'],
    phases: ['Heel Strike', 'Midfoot Roll', 'Toe Push-Off', 'Arm Swing'],
    postureChecklist: [
      'Tall crown-to-pelvis posture with eyes looking 15–20 feet ahead, not down.',
      'Elbows bent ~90° swinging naturally front-to-back opposite each leg.',
      'Smooth heel-to-toe roll pushing off forcefully through the big toe.',
      'Moderate comfortable stride length landing underneath your center of mass.',
    ],
    commonMistakes: [
      'Overstriding far ahead of hips, which brakes forward momentum and jars knees.',
      'Slouching forward over a phone or swinging arms across torso centerline.',
    ],
  },
  plank: {
    key: 'plank',
    linkedExerciseId: 'ex_07',
    title: 'Forearm Plank Hold',
    shortName: 'Plank Hold',
    category: 'Core & Joint-Safe',
    equipment: 'Exercise Mat',
    tempoLabel: 'Isometric Hold + Breathe',
    breathingCue: 'Continuous slow nasal inhales and 4-sec exhales — never hold your breath.',
    primaryMuscles: ['Transverse Abdominis', 'Rectus Abdominis'],
    secondaryMuscles: ['Deltoids', 'Glutes', 'Quadriceps'],
    phases: ['Elbow Stack', 'Posterior Tilt', 'Brace & Breathe', 'Steady Hold'],
    postureChecklist: [
      'Elbows directly underneath shoulders with forearms parallel on the mat.',
      'Gentle posterior pelvic tilt + glute squeeze keeps lower back flat, never arched.',
      'Straight ear → shoulder → hip → ankle alignment; push floor away slightly.',
      'Keep neck neutral looking between your thumbs.',
    ],
    commonMistakes: [
      'Allowing hips to sag toward the floor, compressing the lower lumbar spine.',
      'Hunching shoulders toward ears or clasping breath tightly.',
    ],
  },
  dead_bugs: {
    key: 'dead_bugs',
    linkedExerciseId: 'ex_07',
    title: 'Dynamic Dead Bugs',
    shortName: 'Dead Bugs',
    category: 'Core & Joint-Safe',
    equipment: 'Exercise Mat',
    tempoLabel: '3-1-3 Alternating',
    breathingCue: 'Exhale slowly as opposite arm & leg extend; inhale returning to tabletop.',
    primaryMuscles: ['Transverse Abdominis', 'Rectus Abdominis'],
    secondaryMuscles: ['Hip Flexors', 'Anterior Deltoids'],
    phases: ['90° Tabletop', 'Opposite Extend', 'Low Hover', 'Return Switch'],
    postureChecklist: [
      'Press lower back flush against the mat with zero gap underneath lumbar spine.',
      'Start with arms vertical over shoulders and knees bent 90° directly over hips.',
      'Extend one heel toward the floor simultaneously with the opposite arm overhead.',
      'Stop lowering the leg right before your lower back tries to peel off the mat.',
    ],
    commonMistakes: [
      'Arching lower back off the mat when extending the leg too low.',
      'Moving same-side arm and leg or rushing reps with momentum.',
    ],
    safetySwapNote: 'Breathing-friendly Hypertension swap replacing prolonged isometric holds.',
  },
  swimming: {
    key: 'swimming',
    linkedExerciseId: 'ex_08',
    title: 'Freestyle Swimming Laps',
    shortName: 'Swimming Laps',
    category: 'Cardio',
    equipment: 'Lap Pool',
    tempoLabel: 'Fluid Catch & Kick',
    breathingCue: 'Exhale steadily underwater; rotate head smoothly to side during arm recovery.',
    primaryMuscles: ['Latissimus Dorsi', 'Deltoids'],
    secondaryMuscles: ['Core', 'Glutes', 'Calves'],
    phases: ['Forward Reach', 'High-Elbow Catch', 'Power Pull', 'Recovery & Kick'],
    postureChecklist: [
      'Streamlined horizontal body line with eyes looking down at pool floor.',
      'Drive steady 6-beat flutter kick from the hips with long, relaxed ankles.',
      'High-elbow underwater catch pushes water straight back past your hip.',
      'Rotate torso gently side-to-side like a skewer rather than lifting head up.',
    ],
    commonMistakes: [
      'Lifting head straight forward, causing hips and legs to sink deeply.',
      'Bicycle-kicking from bent knees instead of snapping from the hips.',
    ],
  },
  rowing: {
    key: 'rowing',
    linkedExerciseId: 'ex_09',
    title: 'Rowing Machine Ergometer',
    shortName: 'Rowing / Elliptical',
    category: 'Cardio',
    equipment: 'Rowing Ergometer',
    tempoLabel: '22–26 SPM (1:2 Drive:Recover)',
    breathingCue: 'Exhale forcefully through Drive & Finish; inhale during relaxed Recovery.',
    primaryMuscles: ['Latissimus Dorsi', 'Quadriceps'],
    secondaryMuscles: ['Rhomboids', 'Glutes', 'Biceps', 'Core'],
    phases: ['Catch', 'Leg Drive', 'Finish Pull', 'Handle Recovery'],
    postureChecklist: [
      'Catch: shins near vertical, torso hinged ~15° forward, arms fully straight.',
      'Drive Legs → Swing Hip → Pull Handle cleanly to lower ribs (60% legs, 20% hip, 20% arms).',
      'Recover in exact reverse order: Arms out → Hinge forward → Bend knees.',
      'Keep shoulders down, wrists flat, and chain traveling in one smooth horizontal plane.',
    ],
    commonMistakes: [
      'Pulling with arms too early before legs finish pressing down the slide.',
      'Hunching knees up first so the handle has to lift up and over the knees.',
    ],
  },
};

export function resolveExerciseAnimationKey(
  exercise: Pick<ExerciseItem, 'id' | 'name' | 'shortName' | 'wasSwappedFrom'> | string
): ExerciseAnimationKey {
  if (typeof exercise === 'string') {
    if (exercise in EXERCISE_POSTURE_SPECS) return exercise as ExerciseAnimationKey;
  } else {
    const label = `${exercise.name} ${exercise.shortName}`.toLowerCase();
    if (label.includes('goblet') || label.includes('box squat')) return 'goblet_squats';
    if (label.includes('dead bug')) return 'dead_bugs';
    if (label.includes('cycling') || label.includes('bike')) return 'cycling';
    if (label.includes('jump rope')) return 'jump_rope';
    if (label.includes('walk')) return 'brisk_walking';
    if (label.includes('plank')) return 'plank';
    if (label.includes('swim')) return 'swimming';
    if (label.includes('row') || label.includes('elliptical')) return 'rowing';
    if (label.includes('push-up') || label.includes('calisthenics')) return 'pushups';
    if (label.includes('dumbbell') || label.includes('press') || label.includes('resistance')) {
      return 'dumbbell_press';
    }
    if (label.includes('squat') || label.includes('deadlift')) return 'squats';

    switch (exercise.id) {
      case 'ex_01':
        return 'squats';
      case 'ex_02':
        return 'dumbbell_press';
      case 'ex_03':
        return 'pushups';
      case 'ex_04':
        return 'cycling';
      case 'ex_05':
        return 'jump_rope';
      case 'ex_06':
        return 'brisk_walking';
      case 'ex_07':
        return 'plank';
      case 'ex_08':
        return 'swimming';
      case 'ex_09':
        return 'rowing';
    }
  }
  return 'squats';
}

export function getExerciseItemForSpec(spec: ExercisePostureSpec): ExerciseItem {
  const base = (dataset.exercises as ExerciseItem[]).find((e) => e.id === spec.linkedExerciseId)
    ?? (dataset.exercises[0] as ExerciseItem);

  if (spec.key === 'goblet_squats') {
    return {
      ...base,
      name: 'Goblet / Box Squats',
      shortName: 'Goblet Squats',
      impact: 'Low',
      defaultWeightKg: 16,
      wasSwappedFrom: 'Squats / Deadlifts',
      safetyNote: spec.safetySwapNote,
    };
  }
  if (spec.key === 'dead_bugs') {
    return {
      ...base,
      name: 'Dynamic Dead Bugs',
      shortName: 'Dead Bugs',
      mode: 'reps',
      defaultSets: 3,
      defaultReps: 12,
      wasSwappedFrom: 'Plank Hold',
      safetyNote: spec.safetySwapNote,
    };
  }
  return base;
}
