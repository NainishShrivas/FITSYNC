export type CycleMode =
  | 'period_tracking'
  | 'tracking_without_period'
  | 'conceive'
  | 'pregnancy'
  | 'perimenopause';

export type BleedingFlow = 'none' | 'spotting' | 'light' | 'medium' | 'heavy';

export type OvulationTestResult = 'none' | 'positive' | 'negative';

export interface PrivacyConsents {
  essentialHealthStorage: boolean;
  optionalAnalytics: boolean;
  consentTimestamp: string | null;
}

export interface CategoryPreference {
  id: string;
  enabled: boolean;
}

export interface UserCycleSettings {
  onboardingCompleted: boolean;
  activeMode: CycleMode;
  manualCycleLength: number | null;
  manualPeriodLength: number | null;
  setupTypicalCycleLength: number;
  setupTypicalPeriodLength: number;
  setupTypicalPmsDays: number;
  showOvulation: boolean;
  showFertileWindow: boolean;
  discreetMode: boolean;
  enabledCategories: CategoryPreference[];
  privacyConsents: PrivacyConsents;
}

export interface CycleRecord {
  cycleId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string | null; // null if active ongoing cycle
  cycleLength: number | null; // days from startDate to next cycle startDate
  periodLength: number; // span from startDate to last L/M/H day
  pmsDaysCount: number;
  isExcludedFromCalculations: boolean;
  isManualStart: boolean;
}

export interface DailyCycleLog {
  logDate: string; // YYYY-MM-DD
  bleedingFlow: BleedingFlow;
  selectedSymptoms: Record<string, string[]>;
  ovulationTest: OvulationTestResult;
  bbtCelsius: number | null;
  pmsLogged: boolean;
  customTagIds: string[];
  dailyNote: string;
  cycleStartMarker: boolean;
}

export interface CustomTag {
  tagId: string;
  label: string;
}

export type ReminderType =
  | 'period_starting_soon'
  | 'period_due'
  | 'period_late'
  | 'before_pms'
  | 'fertile_window_soon'
  | 'birth_control'
  | 'cycle_stat_changes'
  | 'daily_checkin';

export interface CycleReminder {
  id: ReminderType;
  label: string;
  enabled: boolean;
  time: string; // HH:mm
  advanceDays: number;
  message: string;
}

export interface CycleConnectState {
  consentChecked: boolean;
  inviteCode: string | null;
  shareStatus: 'none' | 'pending' | 'active';
  recipientName: string | null;
  viewingCode: string | null;
  viewingOwnerName: string | null;
}

export interface CycleModuleState {
  settings: UserCycleSettings;
  dailyLogs: Record<string, DailyCycleLog>;
  excludedCycleIds: string[];
  customTags: CustomTag[];
  reminders: CycleReminder[];
  connect: CycleConnectState;
}

export interface CycleWindowPrediction {
  cycleIndex: number;
  predictedPeriodStart: string;
  predictedPeriodEnd: string;
  predictedPeriodLength: number;
  predictedOvulationDate: string;
  fertileWindowStart: string;
  fertileWindowEnd: string;
  predictedPmsStart: string | null;
  predictedPmsEnd: string | null;
}

export interface CycleEngineOutput {
  cycles: CycleRecord[];
  activeCycle: CycleRecord | null;
  currentCycleDay: number | null;
  currentPhase: string;
  avgCycleLength6: number;
  avgPeriodLength6: number;
  effectiveCycleLength: number;
  effectivePeriodLength: number;
  observedLutealLength: number;
  pmsEnabled: boolean;
  pmsAvgDuration: number;
  predictions: CycleWindowPrediction[];
  hasSufficientHistory: boolean;
}

export interface DayVisualMeta {
  date: string;
  loggedFlow: BleedingFlow;
  isPredictedPeriod: boolean;
  isFertileWindow: boolean;
  isOvulationDay: boolean;
  isTrackedPms: boolean;
  isPredictedPms: boolean;
  isOverlapPeriodAndFertile: boolean;
  symptomColors: string[];
  hasAnyLog: boolean;
}

export interface TrackingCategoryDef {
  id: string;
  label: string;
  selectionMode: 'single' | 'multi';
  dotColor: string;
  options: Array<{ id: string; label: string; badge?: string }>;
  learnMore: {
    typicalRange: string;
    whyTrack: string;
    whenToConsult: string;
  };
}
