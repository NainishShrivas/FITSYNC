export type BiologicalSex = 'male' | 'female';
export type GenderOption = 'female' | 'male' | 'non_binary' | 'prefer_not_to_say';

export type ActivityLevel =
  | 'sedentary'
  | 'lightly_active'
  | 'moderately_active'
  | 'very_active'
  | 'extra_active';

export type BodyType = 'Ectomorph' | 'Mesomorph' | 'Endomorph';

export type FitnessGoalKey =
  | 'Extreme_Fat_Loss'
  | 'Fat_Loss'
  | 'Maintenance'
  | 'Lean_Bulk'
  | 'Aggressive_Bulk';

export type DietPreference = 'Vegetarian' | 'Non-Vegetarian';

export type DayAbbrev = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export type MedicalConditionKey =
  | 'Joint_Pain'
  | 'Hypertension'
  | 'Diabetes_Type_2'
  | 'Asthma'
  | 'Kidney_Stones';

export interface WeeklyFeedbackOverrides {
  calorieAdjustmentKcal?: number;
  extraWarmupMins?: number;
  lowImpactOnly?: boolean;
  waterBoostL?: number;
  recoveryFocusNote?: string;
  lastUpdatedAt?: string;
}

export interface UserProfile {
  fullName: string;
  email: string;
  heightCm: number;
  weightKg: number;
  dob: string; // YYYY-MM-DD
  ageOverride?: number;
  sex: BiologicalSex;
  gender: GenderOption;
  activityLevel: ActivityLevel;
  bodyType: BodyType;
  goalKey: FitnessGoalKey;
  dietPreference: DietPreference;
  healthConditions: string[];
  trainingDays: DayAbbrev[];
  trainingTime: string;
  sessionDurationMins: number;
  habits: string[];
  onboardingCompleted: boolean;
  feedbackOverrides?: WeeklyFeedbackOverrides;
}

export interface MacroTargets {
  proteinG: number;
  carbsG: number;
  fatsG: number;
  proteinPct: number;
  carbsPct: number;
  fatsPct: number;
}

export interface EssentialAminoTargets {
  histidineMg: number;
  isoleucineMg: number;
  leucineMg: number;
  lysineMg: number;
  saaMetCysMg: number;
  aaaPheTyrMg: number;
  threonineMg: number;
  tryptophanMg: number;
  valineMg: number;
}

export interface DriTargets {
  calciumMg: number;
  ironMg: number;
  potassiumMg: number;
  magnesiumMg: number;
  vitaminB12Mcg: number;
  vitaminDIu: number;
  omega3AlaG: number;
  epaDhaMg: number;
  fiberG: number;
  waterL: number;
  sodiumCapMg: number;
}

export interface MedicalOverrideSummary {
  activeKeys: MedicalConditionKey[];
  customUnmapped: string[];
  bannedTags: string[];
  exerciseReplacements: Record<string, string>;
  maxHrPct?: number;
  mandatoryWarmupMins?: number;
  carbCapPerMealG?: number;
  dailyCarbCapG?: number;
  lowGiOnly: boolean;
  waterTargetL?: number;
  sodiumCapMg?: number;
  oxalateSwaps: Record<string, string>;
  notes: string[];
}

export interface CalibratedMetrics {
  age: number;
  bmi: number;
  bmr: number;
  tdee: number;
  goalOffset: number;
  rawTargetKcal: number;
  safeTargetKcal: number;
  safetyFloorTriggered: boolean;
  safetyFloorMinKcal: number;
  macros: MacroTargets;
  adjustedProteinBasisKg: number;
  isAdjustedBodyWeight: boolean;
  aminoTargets: EssentialAminoTargets;
  driTargets: DriTargets;
  deficiencyFlags: string[];
  medicalOverrides: MedicalOverrideSummary;
  seniorMetCaveat: boolean;
}

export interface ExerciseItem {
  id: string;
  name: string;
  shortName: string;
  category: string;
  met: number;
  impact: 'Low' | 'Medium' | 'High';
  tags: string[];
  defaultSets: number;
  defaultReps?: number;
  defaultDurationSec?: number;
  defaultWeightKg: number;
  mode: 'reps' | 'duration';
  notes: string;
  wasSwappedFrom?: string;
  safetyNote?: string;
  estimatedNetKcal?: number;
  durationMins?: number;
}

export interface ScaledMeal {
  id: string;
  slot: string;
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fats: number;
  gi: string;
  oxalateSwapped: boolean;
  carbCapNotice?: string;
}

export interface CheatCalibrationPlan {
  id: string;
  loggedAt: string;
  surplusKcal: number;
  note: string;
  distributionWindowDays: number;
  dailyExtraBurnKcal: number;
  rolledToNextWeek: boolean;
  exerciseId: string;
  exerciseName: string;
  exerciseMet: number;
  netDurationMinsPerDay: number;
  grossDurationMinsPerDay: number;
  allocatedDays: DayAbbrev[];
}

export interface DailyHistoryEntry {
  date: string; // YYYY-MM-DD
  dayLabel: string; // MM-DD
  weightKg: number;
  eatenKcal: number;
  burnedKcal: number;
  targetKcal: number;
  habitsCompleted: number;
  habitsTotal: number;
  habitPct: number;
  streakCount: number;
  workoutDone: boolean;
}

export interface ExerciseSetLog {
  setNumber: number;
  weightKg: number;
  value: number; // reps or seconds
  completed: boolean;
}

export interface WeeklyCheckInAppliedFix {
  field: string;
  label: string;
  before: string;
  after: string;
  reason: string;
}

export interface SarvamRecommendedChanges {
  addHealthConditions?: string[];
  calorieDeltaKcal?: number;
  sessionDurationMins?: number;
  trainingDaysPerWeek?: number;
  preferredTimeOfDay?: 'morning' | 'afternoon' | 'evening';
  dietPreference?: DietPreference;
  lowImpactOnly?: boolean;
  extraWarmupMins?: number;
  waterBoostL?: number;
  addHabits?: string[];
  easeGoalDeficit?: boolean;
  increaseChallenge?: boolean;
}

export interface WeeklyCheckInFeedback {
  id: string;
  createdAt: string;
  languageCode: string;
  speaker: string;
  weeklyProgressSummary: string;
  dietIssue: string;
  healthIssue: string;
  exerciseIssue: string;
  overallFeedback: string;
  sentiment: 'great' | 'mixed' | 'struggling';
  aiSummary: string;
  transcript: Array<{ role: 'coach' | 'user'; text: string; timestamp: string }>;
  appliedFixes: WeeklyCheckInAppliedFix[];
}

export interface AppState {
  profile: UserProfile;
  todayDate: string;
  selectedMealDay: number; // 1..7
  checkedMealIds: string[];
  checkedHabits: string[];
  completedWorkoutDays: DayAbbrev[];
  extraBurnedTodayKcal: number;
  exerciseLogs: Record<string, ExerciseSetLog[]>;
  activeCheatPlan: CheatCalibrationPlan | null;
  cheatHistory: CheatCalibrationPlan[];
  weeklyCheckIns: WeeklyCheckInFeedback[];
  xp: number;
  streakDays: number;
  history14Days: DailyHistoryEntry[];
}

export type OutboundCallStatus =
  | 'idle'
  | 'entering_number'
  | 'awaiting_confirmation'
  | 'initiating'
  | 'request_accepted'
  | 'ringing'
  | 'connected'
  | 'completed'
  | 'failed';

export interface OutboundCallConfigReadiness {
  ready: boolean;
  hasApiKey: boolean;
  hasOrgId: boolean;
  hasWorkspaceId: boolean;
  hasAgentId: boolean;
  hasAgentVersion: boolean;
  hasConnectionId: boolean;
  hasAgentPhoneNumber: boolean;
  missingVariables: string[];
  webhookUrl: string | null;
}

export interface OutboundCallRecord {
  attemptId: string;
  maskedPhone: string;
  countryCode: string;
  status: Exclude<OutboundCallStatus, 'idle' | 'entering_number' | 'awaiting_confirmation' | 'initiating'>;
  providerStatus: string;
  connectivityStatus: string | null;
  durationSec: number | null;
  failureReason: string | null;
  interactionId: string | null;
  transcriptSummary: string | null;
  createdAt: string;
  updatedAt: string;
}


