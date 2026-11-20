import dataset from '../data/calibrate_dataset.json';
import type {
  ActivityLevel,
  BiologicalSex,
  CalibratedMetrics,
  CheatCalibrationPlan,
  DailyHistoryEntry,
  DayAbbrev,
  DietPreference,
  DriTargets,
  EssentialAminoTargets,
  ExerciseItem,
  MedicalConditionKey,
  MedicalOverrideSummary,
  ScaledMeal,
  UserProfile,
} from '../types/fitsync';

export const DAYS_ORDER: DayAbbrev[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Banker's rounding (round half to even) so clinical tables align exactly
 * with Frankenfield / Python reference calculations (e.g. 2410.5 -> 2410).
 */
export function roundHalfToEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (Math.abs(diff - 0.5) < 1e-9) {
    return floor % 2 === 0 ? floor : floor + 1;
  }
  return Math.round(value);
}

export function computeAgeFromDob(dob: string, referenceDate: Date = new Date('2026-11-19T12:00:00Z')): number {
  if (!dob) return 26;
  const parts = dob.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return 26;
  const [year, month, day] = parts;
  let age = referenceDate.getUTCFullYear() - year;
  const mDiff = referenceDate.getUTCMonth() + 1 - month;
  if (mDiff < 0 || (mDiff === 0 && referenceDate.getUTCDate() < day)) {
    age--;
  }
  return Math.max(13, Math.min(105, age));
}

export function calculateBmi(weightKg: number, heightCm: number): number {
  const hMeters = heightCm / 100;
  if (hMeters <= 0) return 0;
  return Number((weightKg / (hMeters * hMeters)).toFixed(1));
}

export function calculateBmrExact(
  sex: BiologicalSex,
  weightKg: number,
  heightCm: number,
  age: number
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

export function normalizeMedicalConditions(rawConditions: string[]): {
  activeKeys: MedicalConditionKey[];
  customUnmapped: string[];
} {
  const activeKeys = new Set<MedicalConditionKey>();
  const customUnmapped: string[] = [];

  for (const raw of rawConditions) {
    const clean = raw.trim();
    if (!clean || clean.toLowerCase() === 'none') continue;
    const lower = clean.toLowerCase();

    if (lower.includes('joint') || lower.includes('knee') || lower.includes('arthritis')) {
      activeKeys.add('Joint_Pain');
    } else if (lower.includes('hypertension') || lower.includes('high bp') || lower.includes('blood pressure')) {
      activeKeys.add('Hypertension');
    } else if (lower.includes('diabetes') || lower.includes('t2d') || lower.includes('insulin')) {
      activeKeys.add('Diabetes_Type_2');
    } else if (lower.includes('asthma') || lower.includes('bronch')) {
      activeKeys.add('Asthma');
    } else if (lower.includes('kidney') || lower.includes('stone') || lower.includes('renal') || lower.includes('oxalate')) {
      activeKeys.add('Kidney_Stones');
    } else {
      customUnmapped.push(clean);
    }
  }

  return {
    activeKeys: Array.from(activeKeys),
    customUnmapped,
  };
}

export function resolveMedicalOverrides(rawConditions: string[], age: number): MedicalOverrideSummary {
  const { activeKeys, customUnmapped } = normalizeMedicalConditions(rawConditions);
  const overridesData = dataset.medical_condition_overrides;

  const bannedTags = new Set<string>();
  const exerciseReplacements: Record<string, string> = {};
  const oxalateSwaps: Record<string, string> = {};
  const notes: string[] = [];

  let maxHrPct: number | undefined;
  let mandatoryWarmupMins: number | undefined;
  let carbCapPerMealG: number | undefined;
  let dailyCarbCapG: number | undefined;
  let lowGiOnly = false;
  let waterTargetL: number | undefined;
  let sodiumCapMg: number | undefined;

  for (const key of activeKeys) {
    const rule = overridesData[key];
    if (!rule) continue;
    if ('banned_tags' in rule && Array.isArray(rule.banned_tags)) {
      for (const tag of rule.banned_tags) bannedTags.add(tag);
    }
    if ('replacements' in rule && rule.replacements) {
      for (const [from, to] of Object.entries(rule.replacements)) {
        exerciseReplacements[from] = to;
      }
    }
    if (key === 'Hypertension') {
      maxHrPct = 75;
      sodiumCapMg = sodiumCapMg ? Math.min(sodiumCapMg, 1500) : 1500;
      notes.push('Hypertension Guard: Intensity capped ≤75% HRmax, Valsalva & prolonged isometric holds swapped, sodium ≤1,500 mg/day.');
    }
    if (key === 'Joint_Pain') {
      notes.push('Joint Safety: High-impact jumps & heavy axial barbell loads replaced with low-impact cycling/goblet variations; emphasize Omega-3.');
    }
    if (key === 'Diabetes_Type_2') {
      carbCapPerMealG = 45;
      dailyCarbCapG = 180;
      lowGiOnly = true;
      notes.push('Glycemic Guard: Low-GI carbs capped at ≤45g/meal (≤180g/day); maintain pre-exercise glycemia 90–250 mg/dL.');
    }
    if (key === 'Asthma') {
      mandatoryWarmupMins = 10;
      notes.push('Airway Guard: Sprint HIIT & cold-air cardio blocked; mandatory 10-min gradual warm-up & indoor steady cardio.');
    }
    if (key === 'Kidney_Stones') {
      waterTargetL = 3.5;
      sodiumCapMg = sodiumCapMg ? Math.min(sodiumCapMg, 2000) : 2000;
      Object.assign(oxalateSwaps, overridesData.Kidney_Stones.oxalate_swaps);
      notes.push('Renal Guard: Hydration raised to 3.5 L/day, sodium <2,000 mg/day, high-oxalate spinach & almonds swapped.');
    }
  }

  if (age >= 60) {
    notes.push('Age 60+ Advisory: 2024 Adult Compendium MET values are calibrated on adults 19–59; pace exertion using RPE and prioritize joint recovery.');
  }

  return {
    activeKeys,
    customUnmapped,
    bannedTags: Array.from(bannedTags),
    exerciseReplacements,
    maxHrPct,
    mandatoryWarmupMins,
    carbCapPerMealG,
    dailyCarbCapG,
    lowGiOnly,
    waterTargetL,
    sodiumCapMg,
    oxalateSwaps,
    notes,
  };
}

export function calibrateProfile(profile: UserProfile): CalibratedMetrics {
  const age = profile.ageOverride ?? computeAgeFromDob(profile.dob);
  const bmi = calculateBmi(profile.weightKg, profile.heightCm);
  const bmrExact = calculateBmrExact(profile.sex, profile.weightKg, profile.heightCm, age);
  const bmr = roundHalfToEven(bmrExact);

  const activityMultiplier =
    dataset.biometric_calculation_rules.activity_multipliers[profile.activityLevel as ActivityLevel] ?? 1.55;
  const tdee = roundHalfToEven(bmrExact * activityMultiplier);

  const goalOffset =
    dataset.biometric_calculation_rules.goal_caloric_offsets[profile.goalKey] ?? 0;
  const feedbackCalorieAdj = Math.max(
    -300,
    Math.min(400, Math.round(profile.feedbackOverrides?.calorieAdjustmentKcal ?? 0))
  );
  const rawTargetKcal = tdee + goalOffset + feedbackCalorieAdj;

  const safetyFloorMinKcal = dataset.biometric_calculation_rules.calorie_safety_floors[profile.sex];
  const safetyFloorTriggered = rawTargetKcal < safetyFloorMinKcal;
  const safeTargetKcal = Math.max(safetyFloorMinKcal, rawTargetKcal);

  const split = dataset.biometric_calculation_rules.somatotype_macro_splits[profile.bodyType];
  const macros = {
    proteinPct: split.protein_pct,
    carbsPct: split.carbs_pct,
    fatsPct: split.fats_pct,
    proteinG: Math.round((safeTargetKcal * (split.protein_pct / 100)) / 4),
    carbsG: Math.round((safeTargetKcal * (split.carbs_pct / 100)) / 4),
    fatsG: Math.round((safeTargetKcal * (split.fats_pct / 100)) / 9),
  };

  // Adjusted Body Weight protein/amino scaling for BMI >= 28.0
  const isAdjustedBodyWeight = bmi >= dataset.biometric_calculation_rules.bmi_adjusted_protein_threshold;
  let proteinBasisExact = profile.weightKg;
  if (isAdjustedBodyWeight) {
    const hMeters = profile.heightCm / 100;
    const wRef = 24.9 * (hMeters * hMeters);
    proteinBasisExact = wRef + 0.25 * (profile.weightKg - wRef);
  }
  const adjustedProteinBasisKg = Number(proteinBasisExact.toFixed(1));

  const safeAa = dataset.micronutrient_and_amino_matrix.essential_amino_acids_who_safe_mg_per_kg;
  const aminoTargets: EssentialAminoTargets = {
    histidineMg: Math.round(proteinBasisExact * safeAa.histidine),
    isoleucineMg: Math.round(proteinBasisExact * safeAa.isoleucine),
    leucineMg: Math.round(proteinBasisExact * safeAa.leucine),
    lysineMg: Math.round(proteinBasisExact * safeAa.lysine),
    saaMetCysMg: Math.round(proteinBasisExact * safeAa.saa_met_cys),
    aaaPheTyrMg: Math.round(proteinBasisExact * safeAa.aaa_phe_tyr),
    threonineMg: Math.round(proteinBasisExact * safeAa.threonine),
    tryptophanMg: Math.round(proteinBasisExact * safeAa.tryptophan),
    valineMg: Math.round(proteinBasisExact * safeAa.valine),
  };

  const medicalOverrides = resolveMedicalOverrides(profile.healthConditions, age);
  if (profile.feedbackOverrides?.lowImpactOnly && !medicalOverrides.bannedTags.includes('high_impact')) {
    medicalOverrides.bannedTags.push('high_impact');
    medicalOverrides.notes.push(
      'Feedback Auto-Fix: High-impact jumps swapped to joint-friendly low-impact variations based on your weekly feedback.'
    );
  }
  if (profile.feedbackOverrides?.extraWarmupMins) {
    medicalOverrides.mandatoryWarmupMins = Math.max(
      medicalOverrides.mandatoryWarmupMins ?? 5,
      profile.feedbackOverrides.extraWarmupMins
    );
  }
  if (profile.feedbackOverrides?.recoveryFocusNote) {
    medicalOverrides.notes.push(profile.feedbackOverrides.recoveryFocusNote);
  }

  const baseDri = dataset.micronutrient_and_amino_matrix.dri_targets_by_sex[profile.sex];
  let calciumMg = baseDri.calcium_mg;
  if (profile.sex === 'female' && age >= 51) calciumMg = 1200;
  if (profile.sex === 'male' && age >= 71) calciumMg = 1200;

  let ironMg = baseDri.iron_mg;
  if (profile.sex === 'female' && age >= 51) ironMg = 8;

  const vitaminDIu = age >= 71 ? 800 : baseDri.vitamin_d_iu;
  const baseWaterL = medicalOverrides.waterTargetL ?? baseDri.water_l;
  const waterL = Number(
    Math.min(5.0, baseWaterL + Math.max(0, profile.feedbackOverrides?.waterBoostL ?? 0)).toFixed(1)
  );
  const sodiumCapMg = medicalOverrides.sodiumCapMg ?? baseDri.sodium_max_mg;

  const driTargets: DriTargets = {
    calciumMg,
    ironMg,
    potassiumMg: baseDri.potassium_mg,
    magnesiumMg: baseDri.magnesium_mg,
    vitaminB12Mcg: baseDri.vitamin_b12_mcg,
    vitaminDIu,
    omega3AlaG: baseDri.omega3_ala_g,
    epaDhaMg: baseDri.epa_dha_mg,
    fiberG: baseDri.fiber_g,
    waterL,
    sodiumCapMg,
  };

  const deficiencyFlags =
    dataset.micronutrient_and_amino_matrix.dietary_deficiency_flags[profile.dietPreference] ?? [];

  return {
    age,
    bmi,
    bmr,
    tdee,
    goalOffset,
    rawTargetKcal,
    safeTargetKcal,
    safetyFloorTriggered,
    safetyFloorMinKcal,
    macros,
    adjustedProteinBasisKg,
    isAdjustedBodyWeight,
    aminoTargets,
    driTargets,
    deficiencyFlags,
    medicalOverrides,
    seniorMetCaveat: age >= 60,
  };
}

/**
 * 2024 Adult Compendium Net MET Burn:
 * Net_kcal = ((MET - 1.0) * weight_kg * minutes) / 60
 */
export function calculateNetMetBurnKcal(met: number, weightKg: number, minutes: number): number {
  if (met <= 1.0 || weightKg <= 0 || minutes <= 0) return 0;
  return Math.round(((met - 1.0) * weightKg * minutes) / 60);
}

/**
 * Inverse Net MET duration in minutes for a target calorie burn
 */
export function calculateNetDurationMins(targetKcal: number, met: number, weightKg: number): number {
  if (targetKcal <= 0 || met <= 1.0 || weightKg <= 0) return 0;
  return Math.round((targetKcal * 60) / ((met - 1.0) * weightKg));
}

/**
 * ACSM Gross MET duration for clinical comparison:
 * Gross_kcal = (MET * 3.5 * weight_kg * minutes) / 200
 */
export function calculateGrossDurationMins(targetKcal: number, met: number, weightKg: number): number {
  if (targetKcal <= 0 || met <= 0 || weightKg <= 0) return 0;
  return Math.round((targetKcal * 200) / (met * 3.5 * weightKg));
}

/**
 * Filter and deterministically replace exercises based on Medical Safety Overrides
 */
export function getSafeExercisesForDay(
  day: DayAbbrev,
  profile: UserProfile,
  metrics: CalibratedMetrics
): { sessionTitle: string; exercises: ExerciseItem[]; warmupMinutes: number } {
  const dayIndex = DAYS_ORDER.indexOf(day);
  const rawExercises = dataset.exercises as ExerciseItem[];
  const isTrainingDay = profile.trainingDays.includes(day);

  if (!isTrainingDay) {
    // Active recovery option
    const recovery = rawExercises.find((e) => e.id === 'ex_06')!;
    const mins = 20;
    return {
      sessionTitle: 'Active Recovery Walk',
      warmupMinutes: metrics.medicalOverrides.mandatoryWarmupMins ?? 5,
      exercises: [
        {
          ...recovery,
          durationMins: mins,
          defaultDurationSec: mins * 60,
          estimatedNetKcal: calculateNetMetBurnKcal(recovery.met, profile.weightKg, mins),
        },
      ],
    };
  }

  // Build base session templates rotating by dayIndex
  const sessionTemplates: Array<{ title: string; ids: string[] }> = [
    { title: 'Full Body Express A', ids: ['ex_01', 'ex_03', 'ex_07'] },
    { title: 'Cardio & Conditioning', ids: ['ex_05', 'ex_09', 'ex_06'] },
    { title: 'Strength & Core B', ids: ['ex_02', 'ex_01', 'ex_07'] },
    { title: 'Endurance Intervals', ids: ['ex_04', 'ex_03', 'ex_09'] },
    { title: 'Full Body Power C', ids: ['ex_01', 'ex_02', 'ex_05'] },
    { title: 'Low-Impact Metabolic', ids: ['ex_08', 'ex_03', 'ex_06'] },
    { title: 'Mobility & Recovery', ids: ['ex_06', 'ex_07', 'ex_09'] },
  ];

  const template = sessionTemplates[dayIndex % sessionTemplates.length];
  const banned = new Set(metrics.medicalOverrides.bannedTags);
  const hasJointPain =
    metrics.medicalOverrides.activeKeys.includes('Joint_Pain') ||
    Boolean(profile.feedbackOverrides?.lowImpactOnly);
  const hasHypertension = metrics.medicalOverrides.activeKeys.includes('Hypertension');
  const hasAsthma = metrics.medicalOverrides.activeKeys.includes('Asthma');
  const hasKidneyStones = metrics.medicalOverrides.activeKeys.includes('Kidney_Stones');

  const durationScale = Math.max(0.5, profile.sessionDurationMins / 30);
  const seenIds = new Set<string>();
  const resolved: ExerciseItem[] = [];

  for (const id of template.ids) {
    const base = rawExercises.find((e) => e.id === id);
    if (!base) continue;

    let item: ExerciseItem = { ...base };
    const isBanned = item.tags.some((t) => banned.has(t));

    if (item.id === 'ex_05' && isBanned) {
      // Jump Rope banned for Joint_Pain, Asthma, Hypertension, or lowImpactOnly feedback -> Stationary Cycling (ex_04)
      const replacement = rawExercises.find((e) => e.id === 'ex_04')!;
      item = {
        ...replacement,
        wasSwappedFrom: 'Jump Rope',
        safetyNote: 'Swapped high-impact Jump Rope to low-impact Stationary Cycling.',
      };
    } else if (item.id === 'ex_01' && hasJointPain) {
      item = {
        ...item,
        name: 'Goblet / Box Squats',
        shortName: 'Goblet Squats',
        impact: 'Low',
        tags: [],
        defaultWeightKg: Math.min(20, item.defaultWeightKg),
        wasSwappedFrom: 'Squats / Deadlifts',
        safetyNote: 'Swapped heavy axial barbell load for joint-friendly Goblet / Box Squats.',
      };
    } else if (item.id === 'ex_07' && hasHypertension) {
      item = {
        ...item,
        name: 'Dynamic Dead Bugs',
        shortName: 'Dead Bugs',
        tags: [],
        mode: 'reps',
        defaultSets: 3,
        defaultReps: 12,
        wasSwappedFrom: 'Plank Hold',
        safetyNote: 'Replaced prolonged isometric Plank Hold with breathing-friendly Dynamic Dead Bugs (≤75% HRmax).',
      };
    }

    if (seenIds.has(item.id)) continue;
    seenIds.add(item.id);

    const mins = item.mode === 'duration'
      ? Math.max(4, Math.round(((item.defaultDurationSec ?? 300) / 60) * durationScale))
      : Math.max(4, Math.round(4 * durationScale));

    if (hasAsthma && !item.safetyNote) {
      item.safetyNote = 'Includes mandatory 10-min gradual warm-up; keep short-acting inhaler nearby.';
    } else if (hasKidneyStones && !item.safetyNote) {
      item.safetyNote = 'Hydration Alert: drink 250 ml water mid-session toward 3.5 L/day goal.';
    }

    item.durationMins = mins;
    item.estimatedNetKcal = calculateNetMetBurnKcal(item.met, profile.weightKg, mins);
    resolved.push(item);
  }

  return {
    sessionTitle: template.title,
    warmupMinutes: metrics.medicalOverrides.mandatoryWarmupMins ?? 5,
    exercises: resolved,
  };
}

/**
 * Atwater-Verified 7-Day Meal Scaling Engine
 */
export function getScaledMealsForDay(
  dayNumber: number, // 1..7
  diet: DietPreference,
  safeTargetKcal: number,
  overrides: MedicalOverrideSummary
): { meals: ScaledMeal[]; dayTotalKcal: number; templateTotalKcal: number } {
  const templates = dataset.meal_templates[diet];
  const dayTemplate = templates.find((d) => d.day === dayNumber) ?? templates[0];

  const templateMealAtwater = dayTemplate.meals.map((m) => ({
    ...m,
    atwaterKcal: 4 * m.protein + 4 * m.carbs + 9 * m.fats,
  }));

  const templateTotalKcal = templateMealAtwater.reduce((acc, m) => acc + m.atwaterKcal, 0);
  const scaleFactor = templateTotalKcal > 0 ? safeTargetKcal / templateTotalKcal : 1;

  const hasKidneyStones = overrides.activeKeys.includes('Kidney_Stones');
  const hasDiabetes = overrides.activeKeys.includes('Diabetes_Type_2');

  const meals: ScaledMeal[] = templateMealAtwater.map((m, idx) => {
    let name = m.name;
    let oxalateSwapped = false;

    if (hasKidneyStones) {
      if (name.includes('& Spinach')) {
        name = name.replace('& Spinach', ', Cucumber & Bell Peppers');
        oxalateSwapped = true;
      } else if (name.includes('Spinach')) {
        name = name.replace('Spinach', 'Cucumber & Bell Peppers');
        oxalateSwapped = true;
      }
      if (name.includes('Almonds')) {
        name = name.replace('Almonds', 'Pumpkin Seeds');
        oxalateSwapped = true;
      }
    }

    const protein = Math.round(m.protein * scaleFactor);
    let carbs = Math.round(m.carbs * scaleFactor);
    let fats = Math.round(m.fats * scaleFactor);
    let carbCapNotice: string | undefined;

    if (hasDiabetes && carbs > 45) {
      const excessCarbG = carbs - 45;
      carbs = 45;
      // Offset minor carb trim with healthy unsaturated fat/fiber balance or flag cap
      fats = Math.round(fats + (excessCarbG * 4) / 9);
      carbCapNotice = 'Capped at 45g low-GI carbs (T2D Guard)';
    }

    const kcal = 4 * protein + 4 * carbs + 9 * fats;

    return {
      id: `${diet.toLowerCase()}-d${dayTemplate.day}-${idx}`,
      slot: m.slot,
      name,
      kcal,
      protein,
      carbs,
      fats,
      gi: m.gi,
      oxalateSwapped,
      carbCapNotice,
    };
  });

  const dayTotalKcal = meals.reduce((acc, m) => acc + m.kcal, 0);
  return { meals, dayTotalKcal, templateTotalKcal };
}

/**
 * Deterministic Cheat Meal Calibration Engine
 * Caps daily extra burn at <= 300 kcal/day, expands window up to 7 days,
 * or rolls over to next week's 4 scheduled training days if 0 remain this week.
 */
export function buildCheatMealPlan(params: {
  surplusKcal: number;
  note?: string;
  remainingTrainingDays: DayAbbrev[];
  nextWeekTrainingDays: DayAbbrev[];
  weightKg: number;
  overrides: MedicalOverrideSummary;
  preferredExerciseId?: string;
}): CheatCalibrationPlan {
  const {
    surplusKcal,
    note = 'Cheat Meal Calibration',
    remainingTrainingDays,
    nextWeekTrainingDays,
    weightKg,
    overrides,
    preferredExerciseId = dataset.cheat_meal_calibration_engine.preferred_calibration_exercise_id,
  } = params;

  const dailyCap = dataset.cheat_meal_calibration_engine.daily_extra_kcal_cap; // 300
  const rolloverCount = dataset.cheat_meal_calibration_engine.rollover_days_if_zero_remaining; // 4

  // Choose safe exercise (never Jump Rope if banned)
  const exercises = dataset.exercises as ExerciseItem[];
  let selectedEx = exercises.find((e) => e.id === preferredExerciseId) ?? exercises.find((e) => e.id === 'ex_04')!;
  const banned = new Set(overrides.bannedTags);
  if (selectedEx.tags.some((t) => banned.has(t))) {
    selectedEx = exercises.find((e) => e.id === 'ex_04')!;
  }

  let rolledToNextWeek = false;
  let candidateDays: DayAbbrev[] = [];

  if (remainingTrainingDays.length === 0) {
    rolledToNextWeek = true;
    const pool = nextWeekTrainingDays.length > 0 ? nextWeekTrainingDays : DAYS_ORDER.slice(0, 5);
    candidateDays = pool.slice(0, rolloverCount);
  } else {
    candidateDays = [...remainingTrainingDays];
  }

  // Ensure daily burn never exceeds 300 kcal/day cap
  const minDaysNeeded = Math.max(1, Math.ceil(surplusKcal / dailyCap));
  let windowDays = Math.max(candidateDays.length, minDaysNeeded);
  windowDays = Math.min(7, windowDays);

  // Fill allocated days up to windowDays using nextWeekTrainingDays if expanding beyond remaining days
  const allocatedDays: DayAbbrev[] = [...candidateDays];
  const fallbackPool = nextWeekTrainingDays.length > 0 ? nextWeekTrainingDays : DAYS_ORDER;
  let poolIdx = 0;
  while (allocatedDays.length < windowDays && poolIdx < fallbackPool.length * 2) {
    const nextDay = fallbackPool[poolIdx % fallbackPool.length];
    allocatedDays.push(nextDay);
    poolIdx++;
  }

  const dailyExtraBurnKcal = Math.min(dailyCap, Math.floor(surplusKcal / windowDays));
  const netDurationMinsPerDay = calculateNetDurationMins(dailyExtraBurnKcal, selectedEx.met, weightKg);
  const grossDurationMinsPerDay = calculateGrossDurationMins(dailyExtraBurnKcal, selectedEx.met, weightKg);

  return {
    id: `cheat-${Date.now()}`,
    loggedAt: new Date().toISOString(),
    surplusKcal,
    note,
    distributionWindowDays: windowDays,
    dailyExtraBurnKcal,
    rolledToNextWeek,
    exerciseId: selectedEx.id,
    exerciseName: selectedEx.name,
    exerciseMet: selectedEx.met,
    netDurationMinsPerDay,
    grossDurationMinsPerDay,
    allocatedDays: allocatedDays.slice(0, windowDays),
  };
}

/**
 * RFC-4180 compliant CSV serializer
 */
export function generateHistoryCsv(history: DailyHistoryEntry[], profile: UserProfile): string {
  const escapeCell = (val: string | number): string => {
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = [
    'Date',
    'User',
    'Weight (kg)',
    'Target (kcal)',
    'Eaten (kcal)',
    'Burned (kcal)',
    'Net (kcal)',
    'Habits Completed',
    'Habits Total',
    'Habit %',
    'Streak',
    'Workout Done',
  ];

  const rows = history.map((entry) =>
    [
      entry.date,
      profile.fullName,
      entry.weightKg,
      entry.targetKcal,
      entry.eatenKcal,
      entry.burnedKcal,
      entry.eatenKcal - entry.burnedKcal,
      entry.habitsCompleted,
      entry.habitsTotal,
      entry.habitPct,
      entry.streakCount,
      entry.workoutDone ? 'Yes' : 'No',
    ]
      .map(escapeCell)
      .join(',')
  );

  return [headers.map(escapeCell).join(','), ...rows].join('\r\n');
}
