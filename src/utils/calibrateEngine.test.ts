import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCheatMealPlan,
  calibrateProfile,
  calculateNetDurationMins,
  calculateNetMetBurnKcal,
  generateHistoryCsv,
  getSafeExercisesForDay,
  getScaledMealsForDay,
} from './calibrateEngine';
import { applyFeedbackAutoCalibration } from './feedbackCalibration';
import {
  ALL_POSTURE_KEYS,
  EXERCISE_POSTURE_SPECS,
  resolveExerciseAnimationKey,
} from '../data/exerciseAnimations';
import type { UserProfile } from '../types/fitsync';

function makeBaseProfile(overrides: Partial<UserProfile>): UserProfile {
  return {
    fullName: 'Test User',
    email: 'test@fitsync.app',
    heightCm: 175,
    weightKg: 78,
    dob: '2000-01-01',
    sex: 'male',
    gender: overrides.sex ?? 'male',
    activityLevel: 'moderately_active',
    bodyType: 'Mesomorph',
    goalKey: 'Fat_Loss',
    dietPreference: 'Non-Vegetarian',
    healthConditions: [],
    trainingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    trainingTime: '07:00',
    sessionDurationMins: 30,
    habits: ['Drink 2L of water', '10,000 steps', '8 hours of sleep'],
    onboardingCompleted: true,
    ...overrides,
  };
}

test('P1: Lean Male Bulker matches ground-truth biometric, macro, and leucine targets', () => {
  const p1 = makeBaseProfile({
    sex: 'male',
    ageOverride: 22,
    heightCm: 180,
    weightKg: 60,
    activityLevel: 'moderately_active',
    goalKey: 'Aggressive_Bulk',
    bodyType: 'Ectomorph',
    dietPreference: 'Non-Vegetarian',
    healthConditions: [],
  });
  const m = calibrateProfile(p1);
  assert.equal(m.bmi, 18.5);
  assert.equal(m.bmr, 1620);
  assert.equal(m.tdee, 2511);
  assert.equal(m.safeTargetKcal, 3011);
  assert.equal(m.safetyFloorTriggered, false);
  assert.deepEqual(
    { p: m.macros.proteinG, c: m.macros.carbsG, f: m.macros.fatsG },
    { p: 188, c: 414, f: 67 }
  );
  assert.equal(m.adjustedProteinBasisKg, 60.0);
  assert.equal(m.aminoTargets.leucineMg, 2902);
});

test('P2: Female Fat Loss + Joint Pain + HTN enforces Adjusted Body Weight & safety overrides', () => {
  const p2 = makeBaseProfile({
    sex: 'female',
    ageOverride: 42,
    heightCm: 162,
    weightKg: 88,
    activityLevel: 'lightly_active',
    goalKey: 'Fat_Loss',
    bodyType: 'Endomorph',
    dietPreference: 'Vegetarian',
    healthConditions: ['Joint Pain / Knee Issues', 'Hypertension / High BP'],
  });
  const m = calibrateProfile(p2);
  assert.equal(m.bmi, 33.5);
  assert.equal(m.bmr, 1522);
  assert.equal(m.tdee, 2092);
  assert.equal(m.safeTargetKcal, 1592);
  assert.deepEqual(
    { p: m.macros.proteinG, c: m.macros.carbsG, f: m.macros.fatsG },
    { p: 139, c: 100, f: 71 }
  );
  assert.equal(m.isAdjustedBodyWeight, true);
  assert.equal(m.adjustedProteinBasisKg, 71.0);
  assert.equal(m.aminoTargets.leucineMg, 3434);
  assert.equal(m.driTargets.sodiumCapMg, 1500);

  // Workout overrides: Tuesday has Jump Rope -> replaced by Stationary Cycling; Monday has Squats & Plank -> swapped
  const monSession = getSafeExercisesForDay('Mon', p2, m);
  assert.ok(monSession.exercises.some((e) => e.name === 'Goblet / Box Squats'));
  assert.ok(monSession.exercises.some((e) => e.name === 'Dynamic Dead Bugs'));
  const tueSession = getSafeExercisesForDay('Tue', p2, m);
  assert.ok(!tueSession.exercises.some((e) => e.id === 'ex_05'));
  assert.ok(tueSession.exercises.some((e) => e.id === 'ex_04'));
});

test('P3: Petite Female triggers 1,200 kcal safety floor clamp', () => {
  const p3 = makeBaseProfile({
    sex: 'female',
    ageOverride: 30,
    heightCm: 155,
    weightKg: 55,
    activityLevel: 'sedentary',
    goalKey: 'Extreme_Fat_Loss',
    bodyType: 'Endomorph',
    dietPreference: 'Vegetarian',
  });
  const m = calibrateProfile(p3);
  assert.equal(m.bmi, 22.9);
  assert.equal(m.bmr, 1208);
  assert.equal(m.tdee, 1449);
  assert.equal(m.rawTargetKcal, 699);
  assert.equal(m.safeTargetKcal, 1200);
  assert.equal(m.safetyFloorTriggered, true);
  assert.deepEqual(
    { p: m.macros.proteinG, c: m.macros.carbsG, f: m.macros.fatsG },
    { p: 105, c: 75, f: 53 }
  );
  assert.equal(m.aminoTargets.leucineMg, 2660);
});

test('P4: Male Fat Loss + Asthma blocks sprint HIIT and adds 10-min warmup', () => {
  const p4 = makeBaseProfile({
    sex: 'male',
    ageOverride: 26,
    heightCm: 175,
    weightKg: 78,
    activityLevel: 'moderately_active',
    goalKey: 'Fat_Loss',
    bodyType: 'Mesomorph',
    dietPreference: 'Non-Vegetarian',
    healthConditions: ['Asthma'],
  });
  const m = calibrateProfile(p4);
  assert.equal(m.bmi, 25.5);
  assert.equal(m.bmr, 1749);
  assert.equal(m.tdee, 2711);
  assert.equal(m.safeTargetKcal, 2211);
  assert.deepEqual(
    { p: m.macros.proteinG, c: m.macros.carbsG, f: m.macros.fatsG },
    { p: 166, c: 221, f: 74 }
  );
  assert.equal(m.aminoTargets.leucineMg, 3772);
  assert.equal(m.medicalOverrides.mandatoryWarmupMins, 10);
  const tueSession = getSafeExercisesForDay('Tue', p4, m);
  assert.equal(tueSession.warmupMinutes, 10);
  assert.ok(!tueSession.exercises.some((e) => e.id === 'ex_05'));
});

test('P5: Obese Male + T2D + Kidney Stones applies AdjBW, 3.5L water, sodium <2000, oxalate swaps, and 45g carb cap', () => {
  const p5 = makeBaseProfile({
    sex: 'male',
    ageOverride: 48,
    heightCm: 175,
    weightKg: 115,
    activityLevel: 'sedentary',
    goalKey: 'Extreme_Fat_Loss',
    bodyType: 'Endomorph',
    dietPreference: 'Vegetarian',
    healthConditions: ['Diabetes Type 2', 'kidney stone'],
  });
  const m = calibrateProfile(p5);
  assert.equal(m.bmi, 37.6);
  assert.equal(m.bmr, 2009);
  assert.equal(m.tdee, 2410);
  assert.equal(m.safeTargetKcal, 1660);
  assert.deepEqual(
    { p: m.macros.proteinG, c: m.macros.carbsG, f: m.macros.fatsG },
    { p: 145, c: 104, f: 74 }
  );
  assert.equal(m.adjustedProteinBasisKg, 85.9);
  assert.equal(m.aminoTargets.leucineMg, 4156);
  assert.equal(m.driTargets.waterL, 3.5);
  assert.equal(m.driTargets.sodiumCapMg, 2000);

  const day1Meals = getScaledMealsForDay(1, 'Vegetarian', m.safeTargetKcal, m.medicalOverrides);
  const lunch = day1Meals.meals.find((meal) => meal.slot === 'Lunch')!;
  const snack = day1Meals.meals.find((meal) => meal.slot === 'Snack')!;
  assert.ok(!lunch.name.includes('Spinach'));
  assert.ok(lunch.name.includes('Cucumber & Bell Peppers'));
  assert.ok(!snack.name.includes('Almonds'));
  assert.ok(snack.name.includes('Pumpkin Seeds'));
  assert.ok(day1Meals.meals.every((meal) => meal.carbs <= 45));
});

test('P6: Older Female 62y + HTN receives Calcium 1200mg and 60+ MET caveat', () => {
  const p6 = makeBaseProfile({
    sex: 'female',
    ageOverride: 62,
    heightCm: 160,
    weightKg: 68,
    activityLevel: 'lightly_active',
    goalKey: 'Maintenance',
    bodyType: 'Mesomorph',
    dietPreference: 'Vegetarian',
    healthConditions: ['Hypertension / High BP'],
  });
  const m = calibrateProfile(p6);
  assert.equal(m.bmi, 26.6);
  assert.equal(m.bmr, 1209);
  assert.equal(m.tdee, 1662);
  assert.equal(m.safeTargetKcal, 1662);
  assert.deepEqual(
    { p: m.macros.proteinG, c: m.macros.carbsG, f: m.macros.fatsG },
    { p: 125, c: 166, f: 55 }
  );
  assert.equal(m.aminoTargets.leucineMg, 3288);
  assert.equal(m.driTargets.calciumMg, 1200);
  assert.equal(m.seniorMetCaveat, true);
});

test('Cheat Meal Calibration Edge Cases (Test A, Test B, Test C) match ground-truth Net MET math', () => {
  const p4 = makeBaseProfile({ weightKg: 78 });
  const m = calibrateProfile(p4);

  // Test A: 850 kcal, 4 days, Stationary Cycling (6.8 MET) -> 212 kcal/day, 28 min/day net
  const testA = buildCheatMealPlan({
    surplusKcal: 850,
    remainingTrainingDays: ['Tue', 'Wed', 'Thu', 'Fri'],
    nextWeekTrainingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    weightKg: 78,
    overrides: m.medicalOverrides,
    preferredExerciseId: 'ex_04',
  });
  assert.equal(testA.distributionWindowDays, 4);
  assert.equal(testA.dailyExtraBurnKcal, 212);
  assert.equal(testA.netDurationMinsPerDay, 28);
  assert.equal(testA.grossDurationMinsPerDay, 23);

  // Test B: 1500 kcal, 1 remaining day -> expands to 5 days at 300 kcal/day cap, 40 min/day net
  const testB = buildCheatMealPlan({
    surplusKcal: 1500,
    remainingTrainingDays: ['Fri'],
    nextWeekTrainingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    weightKg: 78,
    overrides: m.medicalOverrides,
    preferredExerciseId: 'ex_04',
  });
  assert.equal(testB.distributionWindowDays, 5);
  assert.equal(testB.dailyExtraBurnKcal, 300);
  assert.equal(testB.netDurationMinsPerDay, 40);
  assert.equal(testB.grossDurationMinsPerDay, 32);

  // Test C: 850 kcal on Sunday (0 remaining days), Brisk Walking (4.8 MET) -> rolls to 4 days next week, 43 min/day net
  const testC = buildCheatMealPlan({
    surplusKcal: 850,
    remainingTrainingDays: [],
    nextWeekTrainingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    weightKg: 78,
    overrides: m.medicalOverrides,
    preferredExerciseId: 'ex_06',
  });
  assert.equal(testC.rolledToNextWeek, true);
  assert.equal(testC.distributionWindowDays, 4);
  assert.equal(testC.dailyExtraBurnKcal, 212);
  assert.equal(testC.netDurationMinsPerDay, 43);
  assert.equal(testC.grossDurationMinsPerDay, 32);

  // Compendium Net MET sanity check
  assert.equal(calculateNetMetBurnKcal(6.8, 78, 28), 211);
  assert.equal(calculateNetDurationMins(212, 6.8, 78), 28);
});

test('Atwater meal scaling and RFC-4180 CSV export format cleanly', () => {
  const m = calibrateProfile(makeBaseProfile({ goalKey: 'Fat_Loss' }));
  const meals = getScaledMealsForDay(1, 'Non-Vegetarian', m.safeTargetKcal, m.medicalOverrides);
  for (const meal of meals.meals) {
    assert.equal(meal.kcal, 4 * meal.protein + 4 * meal.carbs + 9 * meal.fats);
  }
  const csv = generateHistoryCsv(
    [
      {
        date: '2026-11-19',
        dayLabel: '11-19',
        weightKg: 78,
        eatenKcal: 2150,
        burnedKcal: 240,
        targetKcal: 2211,
        habitsCompleted: 5,
        habitsTotal: 6,
        habitPct: 83,
        streakCount: 5,
        workoutDone: true,
      },
    ],
    makeBaseProfile({ fullName: 'Shrivas, Nainish' })
  );
  assert.ok(csv.includes('"Shrivas, Nainish"'));
  assert.ok(csv.includes('2026-11-19'));
});

test('Sarvam weekly check-in feedback automatically fixes health guards, workouts, calories, and hydration', () => {
  const base = makeBaseProfile({
    goalKey: 'Fat_Loss',
    sessionDurationMins: 40,
    healthConditions: [],
    trainingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  });
  const beforeMetrics = calibrateProfile(base);

  const { nextProfile, appliedFixes } = applyFeedbackAutoCalibration(
    base,
    undefined,
    'My knees hurt during squats, workouts feel too tiring and long, I feel very hungry at night and dehydrated.'
  );

  assert.ok(nextProfile.healthConditions.includes('Joint Pain / Knee Issues'));
  assert.equal(nextProfile.sessionDurationMins, 30);
  assert.equal(nextProfile.goalKey, 'Maintenance');
  assert.equal(nextProfile.feedbackOverrides?.lowImpactOnly, true);
  assert.ok((nextProfile.feedbackOverrides?.calorieAdjustmentKcal ?? 0) > 0);
  assert.ok((nextProfile.feedbackOverrides?.waterBoostL ?? 0) > 0);
  assert.ok(appliedFixes.length >= 4);

  const afterMetrics = calibrateProfile(nextProfile);
  assert.ok(afterMetrics.safeTargetKcal > beforeMetrics.safeTargetKcal);
  assert.ok(afterMetrics.driTargets.waterL > beforeMetrics.driTargets.waterL);

  const monWorkout = getSafeExercisesForDay('Mon', nextProfile, afterMetrics);
  assert.ok(monWorkout.exercises.some((e) => e.shortName === 'Goblet Squats'));
});

test('Posture animation resolver maps all 9 base exercises and 2 medical swap variants', () => {
  assert.equal(ALL_POSTURE_KEYS.length, 11);
  for (const key of ALL_POSTURE_KEYS) {
    const spec = EXERCISE_POSTURE_SPECS[key];
    assert.ok(spec.primaryMuscles.length >= 1);
    assert.ok(spec.postureChecklist.length >= 3);
    assert.equal(spec.phases.length, 4);
  }

  assert.equal(resolveExerciseAnimationKey({ id: 'ex_01', name: 'Squats / Deadlifts', shortName: 'Squats' }), 'squats');
  assert.equal(
    resolveExerciseAnimationKey({ id: 'ex_01', name: 'Goblet / Box Squats', shortName: 'Goblet Squats', wasSwappedFrom: 'Squats / Deadlifts' }),
    'goblet_squats'
  );
  assert.equal(resolveExerciseAnimationKey({ id: 'ex_02', name: 'Resistance Training', shortName: 'Dumbbell Press' }), 'dumbbell_press');
  assert.equal(resolveExerciseAnimationKey({ id: 'ex_03', name: 'Bodyweight Calisthenics', shortName: 'Push-Ups' }), 'pushups');
  assert.equal(resolveExerciseAnimationKey({ id: 'ex_04', name: 'Stationary Cycling', shortName: 'Stationary Cycling' }), 'cycling');
  assert.equal(resolveExerciseAnimationKey({ id: 'ex_05', name: 'Jump Rope', shortName: 'Jump Rope' }), 'jump_rope');
  assert.equal(resolveExerciseAnimationKey({ id: 'ex_06', name: 'Brisk Walking', shortName: 'Brisk Walking' }), 'brisk_walking');
  assert.equal(resolveExerciseAnimationKey({ id: 'ex_07', name: 'Plank Hold', shortName: 'Plank Hold' }), 'plank');
  assert.equal(
    resolveExerciseAnimationKey({ id: 'ex_07', name: 'Dynamic Dead Bugs', shortName: 'Dead Bugs', wasSwappedFrom: 'Plank Hold' }),
    'dead_bugs'
  );
  assert.equal(resolveExerciseAnimationKey({ id: 'ex_08', name: 'Swimming Laps', shortName: 'Swimming Laps' }), 'swimming');
  assert.equal(resolveExerciseAnimationKey({ id: 'ex_09', name: 'Rowing Machine / Elliptical', shortName: 'Rowing / Elliptical' }), 'rowing');
});

