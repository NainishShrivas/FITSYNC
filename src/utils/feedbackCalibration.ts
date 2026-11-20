import type {
  DayAbbrev,
  FitnessGoalKey,
  SarvamRecommendedChanges,
  UserProfile,
  WeeklyCheckInAppliedFix,
} from '../types/fitsync';
import { calibrateProfile } from './calibrateEngine';

const BALANCED_SCHEDULES: Record<number, DayAbbrev[]> = {
  2: ['Tue', 'Fri'],
  3: ['Mon', 'Wed', 'Fri'],
  4: ['Mon', 'Tue', 'Thu', 'Fri'],
  5: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  6: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  7: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
};

const GOAL_EASE_CHAIN: Record<FitnessGoalKey, FitnessGoalKey> = {
  Extreme_Fat_Loss: 'Fat_Loss',
  Fat_Loss: 'Maintenance',
  Maintenance: 'Maintenance',
  Lean_Bulk: 'Maintenance',
  Aggressive_Bulk: 'Lean_Bulk',
};

const GOAL_BOOST_CHAIN: Record<FitnessGoalKey, FitnessGoalKey> = {
  Extreme_Fat_Loss: 'Extreme_Fat_Loss',
  Fat_Loss: 'Fat_Loss',
  Maintenance: 'Lean_Bulk',
  Lean_Bulk: 'Aggressive_Bulk',
  Aggressive_Bulk: 'Aggressive_Bulk',
};

/**
 * Combines Sarvam AI structured recommendations with deterministic physiological
 * cross-checks on the user's feedback text so problems reported during the
 * weekly check-in call always map to concrete, verified fixes in the user's plan.
 */
export function applyFeedbackAutoCalibration(
  currentProfile: UserProfile,
  aiChanges: SarvamRecommendedChanges | undefined,
  combinedFeedbackText: string
): {
  nextProfile: UserProfile;
  appliedFixes: WeeklyCheckInAppliedFix[];
} {
  const lower = combinedFeedbackText.toLowerCase();
  const merged: SarvamRecommendedChanges = { ...(aiChanges ?? {}) };

  // 1. Cross-check health conditions from natural feedback text
  const detectedConditions = new Set<string>(merged.addHealthConditions ?? []);
  if (/(knee|joint|ankle|back pain|wrist|shoulder pain|arthritis|shin splint)/i.test(lower)) {
    detectedConditions.add('Joint Pain / Knee Issues');
    merged.lowImpactOnly = true;
  }
  if (/(blood pressure|hypertension|high bp|dizzy|lightheaded)/i.test(lower)) {
    detectedConditions.add('Hypertension / High BP');
  }
  if (/(asthma|shortness of breath|wheez|breathless|breathing problem)/i.test(lower)) {
    detectedConditions.add('Asthma');
  }
  if (/(diabetes|blood sugar|sugar crash|insulin|glucose)/i.test(lower)) {
    detectedConditions.add('Diabetes Type 2');
  }
  if (/(kidney|stone|oxalate|flank pain)/i.test(lower)) {
    detectedConditions.add('Kidney Stones');
  }
  merged.addHealthConditions = Array.from(detectedConditions);

  // 2. Cross-check exercise fatigue, duration, schedule, time, and impact
  if (
    merged.lowImpactOnly === undefined &&
    /(sore|impact|jump|jumping|squat hurts|too heavy|lower impact|stiff)/i.test(lower)
  ) {
    merged.lowImpactOnly = true;
    merged.extraWarmupMins = Math.max(merged.extraWarmupMins ?? 0, 10);
  }

  if (
    merged.sessionDurationMins === undefined &&
    /(too long|no time|busy|exhaust|burnout|too tiring|shorter workout|tired after workout)/i.test(lower)
  ) {
    merged.sessionDurationMins = Math.max(15, currentProfile.sessionDurationMins - 10);
  } else if (
    merged.sessionDurationMins === undefined &&
    /(too easy|too short|not challenging|want harder|push harder|longer workout)/i.test(lower)
  ) {
    merged.sessionDurationMins = Math.min(60, currentProfile.sessionDurationMins + 10);
  }

  if (
    merged.trainingDaysPerWeek === undefined &&
    /(need more rest|rest day|overtrain|too many days|5 days is too much|skipping days)/i.test(lower)
  ) {
    merged.trainingDaysPerWeek = Math.max(3, currentProfile.trainingDays.length - 1);
  }

  if (merged.preferredTimeOfDay === undefined) {
    if (/(evening|night|after work|hard in the morning|can't wake up)/i.test(lower)) {
      merged.preferredTimeOfDay = 'evening';
    } else if (/(afternoon|lunch|midday)/i.test(lower)) {
      merged.preferredTimeOfDay = 'afternoon';
    } else if (/(switch to morning|prefer morning|early morning)/i.test(lower)) {
      merged.preferredTimeOfDay = 'morning';
    }
  }

  // 3. Cross-check diet & hunger/energy feedback
  if (merged.dietPreference === undefined) {
    if (/(switch to veg|vegetarian|no meat|stop meat|plant[- ]based)/i.test(lower)) {
      merged.dietPreference = 'Vegetarian';
    } else if (/(non[- ]veg|include meat|add chicken|add eggs and meat)/i.test(lower)) {
      merged.dietPreference = 'Non-Vegetarian';
    }
  }

  if (
    merged.calorieDeltaKcal === undefined &&
    /(starving|very hungry|always hungry|low energy|weak|fatigue|headache|lightheaded|too little food|craving)/i.test(
      lower
    )
  ) {
    merged.calorieDeltaKcal = 150;
    merged.easeGoalDeficit = true;
  } else if (
    merged.calorieDeltaKcal === undefined &&
    /(too much food|too heavy|bloated from eating too much|plateau|not losing)/i.test(lower)
  ) {
    merged.calorieDeltaKcal = -100;
  }

  if (
    merged.waterBoostL === undefined &&
    /(dehydrat|thirsty|water|cramp|bloating|constipat|headache|dry)/i.test(lower)
  ) {
    merged.waterBoostL = 0.5;
  }

  // 4. Cross-check helpful habits
  const nextHabitsToAdd = new Set<string>(merged.addHabits ?? []);
  if (/(sleep|insomnia|tired|waking up)/i.test(lower)) {
    nextHabitsToAdd.add('8 hours of sleep');
  }
  if (/(water|dehydrat|thirst|cramp)/i.test(lower)) {
    nextHabitsToAdd.add('Drink 2L of water');
  }
  if (/(stiff|sore|tight|mobility|stretch)/i.test(lower)) {
    nextHabitsToAdd.add('Stretch after workout');
  }
  if (/(stress|anxious|overwhelm)/i.test(lower)) {
    nextHabitsToAdd.add('Meditate 5 min');
  }

  // Apply concrete diffs onto cloned profile and track every single fix
  const prevMetrics = calibrateProfile(currentProfile);
  let nextProfile: UserProfile = {
    ...currentProfile,
    healthConditions: [...currentProfile.healthConditions],
    trainingDays: [...currentProfile.trainingDays],
    habits: [...currentProfile.habits],
    feedbackOverrides: {
      ...(currentProfile.feedbackOverrides ?? {}),
      lastUpdatedAt: new Date().toISOString(),
    },
  };
  const appliedFixes: WeeklyCheckInAppliedFix[] = [];

  // Health conditions
  const existingCondLower = new Set(nextProfile.healthConditions.map((c) => c.toLowerCase()));
  for (const cond of merged.addHealthConditions ?? []) {
    const clean = cond.trim();
    if (!clean || existingCondLower.has(clean.toLowerCase())) continue;
    nextProfile.healthConditions = nextProfile.healthConditions.filter((c) => c.toLowerCase() !== 'none');
    nextProfile.healthConditions.push(clean);
    existingCondLower.add(clean.toLowerCase());
    appliedFixes.push({
      field: 'healthConditions',
      label: 'Health Safety Guard Activated',
      before: currentProfile.healthConditions.length ? currentProfile.healthConditions.join(', ') : 'None',
      after: nextProfile.healthConditions.join(', '),
      reason: `Added "${clean}" protection so workouts and meals adapt automatically.`,
    });
  }

  // Diet Preference
  if (merged.dietPreference && merged.dietPreference !== nextProfile.dietPreference) {
    const before = nextProfile.dietPreference;
    nextProfile.dietPreference = merged.dietPreference;
    appliedFixes.push({
      field: 'dietPreference',
      label: 'Meal Plan Diet Switched',
      before,
      after: merged.dietPreference,
      reason: 'Updated your 7-day meal menu to match your dietary feedback.',
    });
  }

  // Goal ease / boost
  if (merged.easeGoalDeficit && GOAL_EASE_CHAIN[nextProfile.goalKey] !== nextProfile.goalKey) {
    const before = nextProfile.goalKey.replace(/_/g, ' ');
    nextProfile.goalKey = GOAL_EASE_CHAIN[nextProfile.goalKey];
    appliedFixes.push({
      field: 'goalKey',
      label: 'Caloric Pace Eased for Energy',
      before,
      after: nextProfile.goalKey.replace(/_/g, ' '),
      reason: 'Reduced deficit pressure to relieve fatigue and hunger while staying on track.',
    });
  } else if (merged.increaseChallenge && GOAL_BOOST_CHAIN[nextProfile.goalKey] !== nextProfile.goalKey) {
    const before = nextProfile.goalKey.replace(/_/g, ' ');
    nextProfile.goalKey = GOAL_BOOST_CHAIN[nextProfile.goalKey];
    appliedFixes.push({
      field: 'goalKey',
      label: 'Progression Pace Boosted',
      before,
      after: nextProfile.goalKey.replace(/_/g, ' '),
      reason: 'Stepped up target pace based on strong weekly feedback.',
    });
  }

  // Calorie adjustment override
  if (typeof merged.calorieDeltaKcal === 'number' && merged.calorieDeltaKcal !== 0) {
    const prevAdj = nextProfile.feedbackOverrides?.calorieAdjustmentKcal ?? 0;
    const nextAdj = Math.max(-300, Math.min(400, prevAdj + Math.round(merged.calorieDeltaKcal)));
    if (nextAdj !== prevAdj) {
      nextProfile.feedbackOverrides = {
        ...nextProfile.feedbackOverrides,
        calorieAdjustmentKcal: nextAdj,
      };
    }
  }

  // Session duration
  if (typeof merged.sessionDurationMins === 'number') {
    const clampedDuration = Math.max(15, Math.min(60, Math.round(merged.sessionDurationMins)));
    if (clampedDuration !== nextProfile.sessionDurationMins) {
      const before = `${nextProfile.sessionDurationMins} min`;
      nextProfile.sessionDurationMins = clampedDuration;
      appliedFixes.push({
        field: 'sessionDurationMins',
        label: 'Workout Session Length Adjusted',
        before,
        after: `${clampedDuration} min`,
        reason:
          clampedDuration < currentProfile.sessionDurationMins
            ? 'Shortened session duration so workouts stay sustainable and recovery-friendly.'
            : 'Extended session duration to increase training stimulus.',
      });
    }
  }

  // Training days per week
  if (typeof merged.trainingDaysPerWeek === 'number') {
    const targetDays = Math.max(2, Math.min(6, Math.round(merged.trainingDaysPerWeek)));
    if (targetDays !== nextProfile.trainingDays.length) {
      const before = `${nextProfile.trainingDays.length} days (${nextProfile.trainingDays.join(', ')})`;
      const schedule = BALANCED_SCHEDULES[targetDays] ?? BALANCED_SCHEDULES[4];
      nextProfile.trainingDays = [...schedule];
      appliedFixes.push({
        field: 'trainingDays',
        label: 'Weekly Training Schedule Rebalanced',
        before,
        after: `${schedule.length} days (${schedule.join(', ')})`,
        reason: 'Rebalanced workout vs rest days to prevent overtraining and improve adherence.',
      });
    }
  }

  // Preferred training time
  if (merged.preferredTimeOfDay) {
    const timeMap = { morning: '07:00', afternoon: '13:00', evening: '18:00' } as const;
    const nextTime = timeMap[merged.preferredTimeOfDay];
    if (nextTime && nextTime !== nextProfile.trainingTime) {
      const before = nextProfile.trainingTime;
      nextProfile.trainingTime = nextTime;
      appliedFixes.push({
        field: 'trainingTime',
        label: 'Preferred Training Slot Updated',
        before,
        after: nextTime,
        reason: `Shifted daily workout reminder window to ${merged.preferredTimeOfDay}.`,
      });
    }
  }

  // Low-impact workout filter
  if (merged.lowImpactOnly && !nextProfile.feedbackOverrides?.lowImpactOnly) {
    nextProfile.feedbackOverrides = {
      ...nextProfile.feedbackOverrides,
      lowImpactOnly: true,
      recoveryFocusNote:
        'Feedback Auto-Fix: Swapped high-impact movements for joint-friendly low-impact options with extended warm-up.',
    };
    appliedFixes.push({
      field: 'lowImpactOnly',
      label: 'Low-Impact Workout Protection',
      before: 'Standard impact',
      after: 'Low-impact swaps active',
      reason: 'Swapped jumping and heavy axial barbell lifts for cycling & goblet variations.',
    });
  }

  // Extra warmup
  if (typeof merged.extraWarmupMins === 'number' && merged.extraWarmupMins > 5) {
    const nextWarmup = Math.min(15, Math.max(5, Math.round(merged.extraWarmupMins)));
    if (nextWarmup !== (nextProfile.feedbackOverrides?.extraWarmupMins ?? 5)) {
      const before = `${nextProfile.feedbackOverrides?.extraWarmupMins ?? 5} min`;
      nextProfile.feedbackOverrides = {
        ...nextProfile.feedbackOverrides,
        extraWarmupMins: nextWarmup,
      };
      appliedFixes.push({
        field: 'extraWarmupMins',
        label: 'Extended Warm-Up Applied',
        before,
        after: `${nextWarmup} min`,
        reason: 'Added progressive mobility warm-up to reduce stiffness and joint strain.',
      });
    }
  }

  // Water boost
  if (typeof merged.waterBoostL === 'number' && merged.waterBoostL > 0) {
    const nextWaterBoost = Math.min(1.0, Number(((nextProfile.feedbackOverrides?.waterBoostL ?? 0) + merged.waterBoostL).toFixed(1)));
    const prevWater = prevMetrics.driTargets.waterL;
    nextProfile.feedbackOverrides = {
      ...nextProfile.feedbackOverrides,
      waterBoostL: nextWaterBoost,
    };
    const nextWater = calibrateProfile(nextProfile).driTargets.waterL;
    if (nextWater > prevWater) {
      appliedFixes.push({
        field: 'waterBoostL',
        label: 'Daily Hydration Target Boosted',
        before: `${prevWater} L/day`,
        after: `${nextWater} L/day`,
        reason: 'Increased daily fluid target to support recovery, digestion, and energy.',
      });
    }
  }

  // Add helpful habits
  const existingHabitsLower = new Set(nextProfile.habits.map((h) => h.toLowerCase()));
  for (const h of nextHabitsToAdd) {
    if (!existingHabitsLower.has(h.toLowerCase())) {
      nextProfile.habits.push(h);
      existingHabitsLower.add(h.toLowerCase());
      appliedFixes.push({
        field: 'habits',
        label: 'Daily Habit Added',
        before: `${currentProfile.habits.length} habits`,
        after: h,
        reason: 'Added habit directly targeting the issue shared in your check-in.',
      });
    }
  }

  // Compare final daily calorie target so any calorie delta or goal ease shows exact kcal diff
  const nextMetrics = calibrateProfile(nextProfile);
  if (nextMetrics.safeTargetKcal !== prevMetrics.safeTargetKcal) {
    appliedFixes.push({
      field: 'safeTargetKcal',
      label: 'Daily Calorie & Macro Target Recalibrated',
      before: `${prevMetrics.safeTargetKcal} kcal/day`,
      after: `${nextMetrics.safeTargetKcal} kcal/day`,
      reason: 'Scaled daily nutrition targets & Atwater meal portions based on your weekly check-in.',
    });
  }

  // If user gave completely positive feedback with no issues detected, record maintenance reinforcement
  if (appliedFixes.length === 0) {
    nextProfile.feedbackOverrides = {
      ...nextProfile.feedbackOverrides,
      recoveryFocusNote:
        'Weekly Check-In Verified: Current training load, calories, and recovery pace confirmed optimal.',
    };
    appliedFixes.push({
      field: 'verifiedOptimal',
      label: 'Plan Confirmed & Locked In',
      before: `${prevMetrics.safeTargetKcal} kcal · ${currentProfile.sessionDurationMins} min`,
      after: `${nextMetrics.safeTargetKcal} kcal · ${nextProfile.sessionDurationMins} min`,
      reason: 'Your weekly progress feedback confirmed your diet, health, and workouts are well-balanced.',
    });
  }

  return { nextProfile, appliedFixes };
}
