import type { GenderOption } from '../types/fitsync';
import type {
  BleedingFlow,
  CategoryPreference,
  CycleEngineOutput,
  CycleMode,
  CycleModuleState,
  CycleRecord,
  CycleReminder,
  CycleWindowPrediction,
  DailyCycleLog,
  DayVisualMeta,
  TrackingCategoryDef,
  UserCycleSettings,
} from '../types/cycle';

export function isCycleTrackingEnabled(gender: GenderOption | undefined): boolean {
  return gender === 'female';
}

export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function diffDaysIso(laterIso: string, earlierIso: string): number {
  const [y1, m1, d1] = laterIso.split('-').map(Number);
  const [y2, m2, d2] = earlierIso.split('-').map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t1 - t2) / 86_400_000);
}

export function isPeriodBleedingFlow(flow: BleedingFlow): boolean {
  return flow === 'light' || flow === 'medium' || flow === 'heavy';
}

export const CYCLE_MODE_LABELS: Record<CycleMode, { title: string; subtitle: string }> = {
  period_tracking: {
    title: 'Period Tracking',
    subtitle: 'Track periods, PMS, symptoms & 7-day fertile window estimates',
  },
  tracking_without_period: {
    title: 'Tracking Without Period',
    subtitle: 'Initiate cycles manually without bleeding logs',
  },
  conceive: {
    title: 'Conceive',
    subtitle: 'Highlight fertile days in blue with BBT & LH ovulation refinement',
  },
  pregnancy: {
    title: 'Pregnancy',
    subtitle: 'Pause period forecasts while logging prenatal symptoms & notes',
  },
  perimenopause: {
    title: 'Perimenopause',
    subtitle: 'Track irregular shifts, hot flashes, sleep & cycle transitions',
  },
};

export const TRACKING_CATEGORIES: TrackingCategoryDef[] = [
  {
    id: 'period',
    label: 'Period',
    selectionMode: 'single',
    dotColor: '#EF4444',
    options: [
      { id: 'spotting', label: 'Spotting' },
      { id: 'light', label: 'Light' },
      { id: 'medium', label: 'Medium' },
      { id: 'heavy', label: 'Heavy' },
    ],
    learnMore: {
      typicalRange: 'A typical period lasts 3–7 days with cycle intervals between 24–38 days.',
      whyTrack:
        'Logging flow heaviness automatically establishes cycle boundaries using the 10-day bleeding gap rule without needing a manual "period ended" button.',
      whenToConsult:
        'Consult a clinician if you soak through a pad/tampon hourly for 2+ hours, bleed longer than 8 days, or miss 3+ cycles.',
    },
  },
  {
    id: 'pain',
    label: 'Pain',
    selectionMode: 'multi',
    dotColor: '#F97316',
    options: [
      { id: 'Cramps', label: 'Cramps' },
      { id: 'Tender breasts', label: 'Tender breasts' },
      { id: 'Headache', label: 'Headache' },
      { id: 'Ovulation pain', label: 'Ovulation pain' },
    ],
    learnMore: {
      typicalRange: 'Mild-to-moderate cramping in the first 1–3 period days is common due to prostaglandins.',
      whyTrack:
        'Tracking pain timing helps distinguish menstrual cramps from mid-cycle mittelschmerz (ovulation pain) or migraine triggers.',
      whenToConsult:
        'Seek medical evaluation if pain prevents daily activity, worsens progressively, or persists outside menstruation.',
    },
  },
  {
    id: 'feelings',
    label: 'Feelings',
    selectionMode: 'multi',
    dotColor: '#8B5CF6',
    options: [
      { id: 'Happy', label: 'Happy' },
      { id: 'Sensitive', label: 'Sensitive' },
      { id: 'Sad', label: 'Sad' },
      { id: 'Mood swings', label: 'Mood swings' },
      { id: 'Not in control', label: 'Not in control' },
      { id: 'Angry', label: 'Angry' },
      { id: 'Confident', label: 'Confident' },
      { id: 'Excited', label: 'Excited' },
      { id: 'Irritable', label: 'Irritable' },
      { id: 'Anxious', label: 'Anxious' },
      { id: 'Insecure', label: 'Insecure' },
      { id: 'Grateful', label: 'Grateful' },
      { id: 'Indifferent', label: 'Indifferent' },
      { id: 'PMS', label: 'PMS', badge: 'Forecast Trigger' },
    ],
    learnMore: {
      typicalRange: 'Hormonal fluctuations in estrogen and progesterone can shift mood across follicular and luteal phases.',
      whyTrack:
        'Selecting PMS inside Feelings specifically enables white PMS prediction clouds across upcoming cycles.',
      whenToConsult:
        'Speak with a doctor if severe luteal mood distress disrupts work or relationships (possible PMDD).',
    },
  },
  {
    id: 'energy',
    label: 'Energy',
    selectionMode: 'multi',
    dotColor: '#EAB308',
    options: [
      { id: 'Energized', label: 'Energized' },
      { id: 'High', label: 'High' },
      { id: 'Low', label: 'Low' },
      { id: 'Exhausted', label: 'Exhausted' },
    ],
    learnMore: {
      typicalRange: 'Energy often rises during the late follicular phase and dips late in the luteal phase.',
      whyTrack:
        'Aligning high-intensity training with higher-energy follicular days supports recovery and sustainable adherence.',
      whenToConsult:
        'Persistent exhaustion unrelated to sleep or cycle phase warrants iron/ferritin and thyroid screening.',
    },
  },
  {
    id: 'sleep',
    label: 'Sleep',
    selectionMode: 'single',
    dotColor: '#6366F1',
    options: [
      { id: '0-3', label: '0–3 hrs' },
      { id: '3-6', label: '3–6 hrs' },
      { id: '6-9', label: '6–9 hrs' },
      { id: '>9', label: '>9 hrs' },
      { id: 'Good quality', label: 'Restful quality' },
      { id: 'Disrupted', label: 'Disrupted quality' },
    ],
    learnMore: {
      typicalRange: '7–9 hours of quality sleep stabilizes cortisol, appetite hormones, and cycle regularity.',
      whyTrack:
        'Progesterone shifts before menstruation can raise body temperature and fragment REM/deep sleep.',
      whenToConsult:
        'Discuss chronic insomnia or snoring/daytime sleepiness with a healthcare provider.',
    },
  },
  {
    id: 'skin',
    label: 'Skin',
    selectionMode: 'multi',
    dotColor: '#EC4899',
    options: [
      { id: 'Good', label: 'Good' },
      { id: 'Acne', label: 'Acne' },
      { id: 'Oily', label: 'Oily' },
      { id: 'Dry', label: 'Dry' },
    ],
    learnMore: {
      typicalRange: 'Androgen-to-estrogen ratio shifts in the luteal phase commonly trigger jawline breakouts.',
      whyTrack: 'Helps separate hormonal breakouts from dietary or skincare changes.',
      whenToConsult: 'Severe cystic acne alongside irregular cycles can be a sign of PCOS.',
    },
  },
  {
    id: 'mental',
    label: 'Mental',
    selectionMode: 'multi',
    dotColor: '#3B82F6',
    options: [
      { id: 'Calm', label: 'Calm' },
      { id: 'Focused', label: 'Focused' },
      { id: 'Distracted', label: 'Distracted' },
      { id: 'Stressed', label: 'Stressed' },
    ],
    learnMore: {
      typicalRange: 'Elevated stress activates the HPA axis and can delay ovulation.',
      whyTrack: 'Explains unexpected cycle length variations without assuming pathology.',
      whenToConsult: 'Seek support if chronic stress or anxiety feels unmanageable.',
    },
  },
  {
    id: 'sex',
    label: 'Sex',
    selectionMode: 'multi',
    dotColor: '#F43F5E',
    options: [
      { id: 'High sex drive', label: 'High sex drive' },
      { id: 'Protected sex', label: 'Protected sex' },
      { id: 'Unprotected sex', label: 'Unprotected sex' },
      { id: 'Withdrawal sex', label: 'Withdrawal sex' },
    ],
    learnMore: {
      typicalRange: 'Libido frequently peaks near the fertile window due to rising estrogen and testosterone.',
      whyTrack: 'Provides accurate context for Conceive mode or reproductive health visits.',
      whenToConsult: 'Always consult a clinician for painful intercourse or unexpected bleeding after sex.',
    },
  },
  {
    id: 'fluid',
    label: 'Fluid (Discharge)',
    selectionMode: 'multi',
    dotColor: '#14B8A6',
    options: [
      { id: 'Creamy', label: 'Creamy' },
      { id: 'Egg white', label: 'Egg white' },
      { id: 'Sticky', label: 'Sticky' },
      { id: 'Atypical', label: 'Atypical' },
    ],
    learnMore: {
      typicalRange: 'Cervical mucus shifts from sticky/dry to stretchy egg-white clarity around ovulation.',
      whyTrack: 'Egg-white fluid indicates rising estrogen approaching ovulation.',
      whenToConsult: 'Strong odor, itching, or unusual gray/green discharge should be evaluated for infection.',
    },
  },
  {
    id: 'digestion',
    label: 'Digestion',
    selectionMode: 'multi',
    dotColor: '#10B981',
    options: [
      { id: 'Great', label: 'Great' },
      { id: 'Bloated', label: 'Bloated' },
      { id: 'Gassy', label: 'Gassy' },
      { id: 'Nauseated', label: 'Nauseated' },
    ],
    learnMore: {
      typicalRange: 'Progesterone slows gut motility pre-period, often causing bloating; prostaglandins speed it during bleeding.',
      whyTrack: 'Note: Logging Bloated alone records the symptom without triggering PMS prediction clouds (log PMS under Feelings to enable PMS forecasts).',
      whenToConsult: 'Severe cyclical nausea or pelvic bloating warrants GI/gynecologic review.',
    },
  },
  {
    id: 'poop',
    label: 'Poop',
    selectionMode: 'multi',
    dotColor: '#78716C',
    options: [
      { id: 'Normal', label: 'Normal' },
      { id: 'Great', label: 'Great' },
      { id: 'Constipated', label: 'Constipated' },
      { id: 'Diarrhea', label: 'Diarrhea' },
    ],
    learnMore: {
      typicalRange: 'Progesterone commonly brings mild constipation late-luteal, while period prostaglandins loosen stools.',
      whyTrack: 'Helps adjust dietary fiber and hydration dynamically across phases.',
      whenToConsult: 'Blood in stool or chronic bowel changes outside your cycle require evaluation.',
    },
  },
  {
    id: 'craving',
    label: 'Craving',
    selectionMode: 'multi',
    dotColor: '#D97706',
    options: [
      { id: 'Sweet', label: 'Sweet' },
      { id: 'Salty', label: 'Salty' },
      { id: 'Carbs', label: 'Carbs' },
      { id: 'Chocolate', label: 'Chocolate' },
    ],
    learnMore: {
      typicalRange: 'Resting metabolic rate nudges slightly higher (~100–200 kcal/day) in the luteal phase.',
      whyTrack: 'Helps plan nutrient-dense snacks (magnesium-rich dark chocolate, complex carbs) into your FITSYNC target.',
      whenToConsult: 'Sudden severe appetite shifts with weight swings merit metabolic checkup.',
    },
  },
  {
    id: 'motivation',
    label: 'Motivation',
    selectionMode: 'multi',
    dotColor: '#7C3AED',
    options: [
      { id: 'Motivated', label: 'Motivated' },
      { id: 'Productive', label: 'Productive' },
      { id: 'Unmotivated', label: 'Unmotivated' },
      { id: 'Unproductive', label: 'Unproductive' },
    ],
    learnMore: {
      typicalRange: 'Motivation naturally ebbs and flows with sleep and hormonal phases.',
      whyTrack: 'Spot patterns in productivity peaks across your month.',
      whenToConsult: 'Ongoing apathy lasting weeks should be discussed with a professional.',
    },
  },
  {
    id: 'social',
    label: 'Social',
    selectionMode: 'multi',
    dotColor: '#0EA5E9',
    options: [
      { id: 'Sociable', label: 'Sociable' },
      { id: 'Supportive', label: 'Supportive' },
      { id: 'Withdrawn', label: 'Withdrawn' },
      { id: 'Conflict', label: 'Conflict' },
    ],
    learnMore: {
      typicalRange: 'Estrogen peaks can boost social energy, while late-luteal fatigue may favor quiet recovery.',
      whyTrack: 'Builds self-awareness around interpersonal rhythms.',
      whenToConsult: 'Severe monthly relationship conflict tied to luteal phase is worth discussing with a clinician.',
    },
  },
  {
    id: 'hair',
    label: 'Hair',
    selectionMode: 'multi',
    dotColor: '#A855F7',
    options: [
      { id: 'Good', label: 'Good' },
      { id: 'Bad', label: 'Bad' },
      { id: 'Oily', label: 'Oily' },
      { id: 'Dry', label: 'Dry' },
    ],
    learnMore: {
      typicalRange: 'Sebum production rises before menstruation as estrogen drops.',
      whyTrack: 'Useful dermatological context across cycles.',
      whenToConsult: 'Noticeable hair thinning may signal iron deficiency or thyroid/androgen imbalance.',
    },
  },
  {
    id: 'collection_method',
    label: 'Collection Method',
    selectionMode: 'multi',
    dotColor: '#E11D48',
    options: [
      { id: 'Pad', label: 'Pad' },
      { id: 'Tampon', label: 'Tampon' },
      { id: 'Panty liner', label: 'Panty liner' },
      { id: 'Menstrual cup', label: 'Menstrual cup' },
    ],
    learnMore: {
      typicalRange: 'Average menstrual blood loss is 30–40 mL per cycle.',
      whyTrack: 'Tracking collection product changes helps quantify heavy bleeding objectively.',
      whenToConsult: 'Consistently soaking through products in <2 hours warrants anemia screening.',
    },
  },
  {
    id: 'exercise',
    label: 'Exercise',
    selectionMode: 'multi',
    dotColor: '#2563EB',
    options: [
      { id: 'Running', label: 'Running' },
      { id: 'Yoga', label: 'Yoga' },
      { id: 'Biking', label: 'Biking' },
      { id: 'Swimming', label: 'Swimming' },
    ],
    learnMore: {
      typicalRange: 'Regular moderate movement reduces menstrual cramp severity and supports insulin sensitivity.',
      whyTrack: 'Very high training loads with under-fueling can suppress ovulation.',
      whenToConsult: 'Loss of periods alongside heavy exercise (RED-S) requires sports medicine evaluation.',
    },
  },
  {
    id: 'party',
    label: 'Party',
    selectionMode: 'multi',
    dotColor: '#9333EA',
    options: [
      { id: 'Drinks', label: 'Drinks' },
      { id: 'Cigarettes', label: 'Cigarettes' },
      { id: 'Big night', label: 'Big night' },
      { id: 'Hangover', label: 'Hangover' },
    ],
    learnMore: {
      typicalRange: 'Alcohol and late nights temporarily elevate BBT and fragment sleep.',
      whyTrack: 'Flags non-ovulatory BBT spikes so predictions stay accurate.',
      whenToConsult: 'Seek medical guidance if alcohol significantly worsens migraines or cycle symptoms.',
    },
  },
  {
    id: 'medication',
    label: 'Medication',
    selectionMode: 'multi',
    dotColor: '#0284C7',
    options: [
      { id: 'Pain', label: 'Pain' },
      { id: 'Cold/flu', label: 'Cold/flu' },
      { id: 'Antihistamine', label: 'Antihistamine' },
      { id: 'Antibiotic', label: 'Antibiotic' },
    ],
    learnMore: {
      typicalRange: 'Certain antibiotics, NSAIDs, and steroids can affect bleeding volume or cervical mucus.',
      whyTrack: 'Helps interpret transient symptom shifts during illness.',
      whenToConsult: 'Confirm medication interactions with your prescribing pharmacist or physician.',
    },
  },
  {
    id: 'ailment',
    label: 'Ailment',
    selectionMode: 'multi',
    dotColor: '#DC2626',
    options: [
      { id: 'Cold/flu', label: 'Cold/flu' },
      { id: 'Allergy', label: 'Allergy' },
      { id: 'Injury', label: 'Injury' },
      { id: 'Fever', label: 'Fever' },
    ],
    learnMore: {
      typicalRange: 'Illness or fever spikes BBT readings and can delay ovulation by several days.',
      whyTrack: 'Helps identify atypical cycle lengths eligible for "Hide this cycle".',
      whenToConsult: 'Seek urgent care for high persistent fever or severe pelvic pain.',
    },
  },
  {
    id: 'urine',
    label: 'Urine',
    selectionMode: 'multi',
    dotColor: '#CA8A04',
    options: [
      { id: 'Normal', label: 'Normal' },
      { id: 'Frequent', label: 'Frequent' },
      { id: 'Burning', label: 'Burning' },
      { id: 'Dark', label: 'Dark' },
    ],
    learnMore: {
      typicalRange: 'Pale straw-colored urine indicates adequate hydration.',
      whyTrack: 'Supports renal/hydration alignment alongside FITSYNC water targets.',
      whenToConsult: 'Burning or urgency with fever may indicate a UTI requiring prompt treatment.',
    },
  },
  {
    id: 'vulva_vagina',
    label: 'Vulva & vagina',
    selectionMode: 'multi',
    dotColor: '#DB2777',
    options: [
      { id: 'Normal', label: 'Normal' },
      { id: 'Itchy', label: 'Itchy' },
      { id: 'Dry', label: 'Dry' },
      { id: 'Sore', label: 'Sore' },
    ],
    learnMore: {
      typicalRange: 'Mild dryness can occur right after menstruation or during perimenopause.',
      whyTrack: 'Spots recurring irritation patterns early.',
      whenToConsult: 'Persistent itching, sores, or pain warrants clinical evaluation.',
    },
  },
  {
    id: 'supplements',
    label: 'Supplements',
    selectionMode: 'multi',
    dotColor: '#059669',
    options: [
      { id: 'Iron', label: 'Iron' },
      { id: 'Magnesium', label: 'Magnesium' },
      { id: 'Vitamin D', label: 'Vitamin D' },
      { id: 'Folate', label: 'Folate' },
    ],
    learnMore: {
      typicalRange: 'Menstruating females require ~18 mg/day iron (DRI); folate supports cellular & reproductive health.',
      whyTrack: 'Correlate micronutrient consistency with energy and cramp severity.',
      whenToConsult: 'Test ferritin/vitamin levels with a clinician before high-dose supplementation.',
    },
  },
  {
    id: 'birth_control',
    label: 'Birth Control',
    selectionMode: 'multi',
    dotColor: '#4F46E5',
    options: [
      { id: 'Pill taken', label: 'Pill taken' },
      { id: 'Missed pill', label: 'Missed pill' },
      { id: 'IUD check', label: 'IUD check' },
      { id: 'Emergency pill', label: 'Emergency pill' },
    ],
    learnMore: {
      typicalRange: 'Hormonal contraception suppresses ovulation; emergency contraception can shift your next bleed.',
      whyTrack: 'If you take hormonal birth control, you can hide ovulation & fertile window estimates in Cycle Personalization.',
      whenToConsult: 'Follow prescribing instructions or consult a pharmacist immediately for missed pills.',
    },
  },
];

export const DEFAULT_ENABLED_CATEGORIES: CategoryPreference[] = TRACKING_CATEGORIES.map((c, idx) => ({
  id: c.id,
  enabled: idx < 12 || c.id === 'birth_control',
}));

export const DEFAULT_REMINDERS: CycleReminder[] = [
  {
    id: 'period_starting_soon',
    label: 'Period starting soon',
    enabled: true,
    time: '09:00',
    advanceDays: 2,
    message: '🩸 Your predicted period starts in 2 days — pack supplies & stay hydrated!',
  },
  {
    id: 'period_due',
    label: 'Period due',
    enabled: true,
    time: '08:30',
    advanceDays: 0,
    message: '🔴 Period predicted to start today. Tap to log flow.',
  },
  {
    id: 'period_late',
    label: 'Period late',
    enabled: false,
    time: '19:00',
    advanceDays: 2,
    message: '📅 Your period is 2 days past forecast. Check in when ready.',
  },
  {
    id: 'before_pms',
    label: 'Before PMS',
    enabled: false,
    time: '10:00',
    advanceDays: 1,
    message: '☁️ PMS window approaching tomorrow — prioritize sleep & magnesium-rich meals.',
  },
  {
    id: 'fertile_window_soon',
    label: 'Fertile window soon',
    enabled: false,
    time: '09:00',
    advanceDays: 1,
    message: '🌱 Estimated fertile window begins tomorrow (informational only).',
  },
  {
    id: 'birth_control',
    label: 'Minipill / Birth control',
    enabled: false,
    time: '21:00',
    advanceDays: 0,
    message: '💊 Daily contraception check-in reminder.',
  },
  {
    id: 'cycle_stat_changes',
    label: 'Cycle statistic changes',
    enabled: true,
    time: '18:00',
    advanceDays: 0,
    message: '📊 Your 6-cycle average updated based on recent logs.',
  },
  {
    id: 'daily_checkin',
    label: 'Daily check-in reminder',
    enabled: false,
    time: '20:30',
    advanceDays: 0,
    message: '✨ Take 15 seconds to log today’s energy, mood & symptoms.',
  },
];

export const SCIENCE_ARTICLES = [
  {
    id: 'menstrual-phases',
    category: 'Cycle Science',
    readTime: '4 min read',
    title: 'The Four Phases of Your Menstrual Cycle',
    summary:
      'How estrogen, progesterone, FSH, and LH rise and fall across Menstrual, Follicular, Ovulatory, and Luteal phases — and how they affect energy and training recovery.',
    takeaways: [
      'Day 1 starts on the first day of Light, Medium, or Heavy menstrual bleeding (Spotting does not start a cycle).',
      'Follicular estrogen rise often supports higher strength output and insulin sensitivity.',
      'Progesterone dominance in the luteal phase elevates basal body temperature (~0.3–0.5°C) and resting heart rate slightly.',
    ],
  },
  {
    id: 'pms-guide',
    category: 'PMS & Mood',
    readTime: '3 min read',
    title: 'Understanding PMS vs. Individual Luteal Symptoms',
    summary:
      'Why tracking PMS as a holistic feeling state matters clinically and how Clue predicts PMS clouds from your rolling 12-cycle history.',
    takeaways: [
      'Predicted PMS clouds appear only when PMS is logged inside Feelings or configured during setup.',
      'Individual premenstrual cramps, bloating, or cravings still appear as symptom dots on the calendar.',
      'Gentle movement, hydration, and 7–9 hours of sleep can meaningfully ease late-luteal discomfort.',
    ],
  },
  {
    id: 'ovulation-fertile',
    category: 'Fertility & Ovulation',
    readTime: '5 min read',
    title: 'How Ovulation & the 7-Day Fertile Window Are Calculated',
    summary:
      'Why ovulation is anchored backwards 13 days from your next predicted period, how positive LH tests and BBT refine luteal estimates, and why short cycles can overlap.',
    takeaways: [
      'Default predicted ovulation = Predicted Next Period Start − 13 days.',
      'Positive ovulation (LH) tests and sustained BBT thermal shifts personalize your observed luteal phase length; negative LH tests are ignored.',
      'Informational Only: Standard period-tracking fertile window estimates must NEVER be used to prevent pregnancy or replace contraception.',
    ],
  },
  {
    id: 'pcos-guide',
    category: 'Clinical Conditions',
    readTime: '5 min read',
    title: 'PCOS: Irregular Cycles, Androgens & Metabolic Support',
    summary:
      'Recognizing patterns like cycles >38 days, unpredictable ovulation, or persistent acne, and when to bring cycle history charts to your physician.',
    takeaways: [
      'Use "Hide this cycle" inside Analysis > Cycle History if a one-off stress or medication event skewed your averages.',
      'Resistance training and high-fiber, low-GI balanced meals support insulin sensitivity alongside clinical care.',
    ],
  },
  {
    id: 'endometriosis',
    category: 'Clinical Conditions',
    readTime: '4 min read',
    title: 'Endometriosis & Severe Pelvic Pain: Red Flags to Log',
    summary:
      'Menstrual cramps should not sideline your daily life. Consistent pain logging creates objective evidence for faster gynecological diagnosis.',
    takeaways: [
      'Track pain timing relative to bleeding days, digestion, and fatigue.',
      'Seek specialist care for debilitating cramps, heavy flow, or chronic non-menstrual pelvic pain.',
    ],
  },
  {
    id: 'perimenopause',
    category: 'Life Stages',
    readTime: '4 min read',
    title: 'Perimenopause: Navigating Shifting Cycle Lengths',
    summary:
      'In your late 30s and 40s, fluctuating ovarian reserve can shorten or lengthen cycles. Switching to Perimenopause mode keeps trends transparent.',
    takeaways: [
      'Shorter 24-day cycles can cause the 7-day fertile window to overlap the tail end of a period.',
      'Sleep quality and temperature tracking help correlate night sweats with hormonal transitions.',
    ],
  },
];

export function createDefaultCycleSettings(): UserCycleSettings {
  return {
    onboardingCompleted: false,
    activeMode: 'period_tracking',
    manualCycleLength: null,
    manualPeriodLength: null,
    setupTypicalCycleLength: 28,
    setupTypicalPeriodLength: 5,
    setupTypicalPmsDays: 0,
    showOvulation: true,
    showFertileWindow: true,
    discreetMode: false,
    enabledCategories: DEFAULT_ENABLED_CATEGORIES,
    privacyConsents: {
      essentialHealthStorage: true,
      optionalAnalytics: false,
      consentTimestamp: null,
    },
  };
}

export function createDefaultCycleState(): CycleModuleState {
  return {
    settings: createDefaultCycleSettings(),
    dailyLogs: {},
    excludedCycleIds: [],
    customTags: [],
    reminders: DEFAULT_REMINDERS,
    connect: {
      consentChecked: false,
      inviteCode: null,
      shareStatus: 'none',
      recipientName: null,
      viewingCode: null,
      viewingOwnerName: null,
    },
  };
}

export function createEmptyDailyLog(logDate: string): DailyCycleLog {
  return {
    logDate,
    bleedingFlow: 'none',
    selectedSymptoms: {},
    ovulationTest: 'none',
    bbtCelsius: null,
    pmsLogged: false,
    customTagIds: [],
    dailyNote: '',
    cycleStartMarker: false,
  };
}

/**
 * Validate and apply a DailyLog save with the 10-Day Cycle Separation Rule.
 * Returns updated logs map and optional helper notice if bleeding < 10 days from cycle start.
 */
export function applyDailyCycleLogUpdate(
  existingLogs: Record<string, DailyCycleLog>,
  updatedLog: DailyCycleLog,
  mode: CycleMode
): {
  nextLogs: Record<string, DailyCycleLog>;
  helperMessage: string | null;
} {
  const feelings = updatedLog.selectedSymptoms.feelings ?? [];
  const normalized: DailyCycleLog = {
    ...updatedLog,
    pmsLogged: updatedLog.pmsLogged || feelings.includes('PMS'),
  };

  const isEmpty =
    normalized.bleedingFlow === 'none' &&
    Object.values(normalized.selectedSymptoms).every((arr) => arr.length === 0) &&
    normalized.ovulationTest === 'none' &&
    normalized.bbtCelsius === null &&
    !normalized.pmsLogged &&
    normalized.customTagIds.length === 0 &&
    normalized.dailyNote.trim() === '' &&
    !normalized.cycleStartMarker;

  const nextLogs = { ...existingLogs };
  if (isEmpty) {
    delete nextLogs[normalized.logDate];
    return { nextLogs, helperMessage: null };
  }

  let helperMessage: string | null = null;

  // 10-day cycle separation check when saving L/M/H bleeding in bleeding-driven modes
  if (mode !== 'tracking_without_period' && isPeriodBleedingFlow(normalized.bleedingFlow)) {
    // Reconstruct cycles from prior logs (excluding updated date) to inspect enclosing/current cycle
    const priorLogs = { ...existingLogs };
    delete priorLogs[normalized.logDate];
    const priorCycles = detectCyclesFromLogs(priorLogs, [], mode);

    // Find the latest cycle starting on or before updatedLog.logDate
    const precedingCycles = priorCycles.filter((c) => c.startDate <= normalized.logDate);
    const activeBeforeDate = precedingCycles[precedingCycles.length - 1];

    if (activeBeforeDate) {
      const gapFromStart = diffDaysIso(normalized.logDate, activeBeforeDate.startDate);
      if (gapFromStart > 0 && gapFromStart < 10) {
        // Check if there was a non-bleeding day gap between the last L/M/H day in activeBeforeDate and logDate
        let lastFlowDate = activeBeforeDate.startDate;
        for (let d = 1; d < gapFromStart; d++) {
          const checkIso = addDaysIso(activeBeforeDate.startDate, d);
          const checkLog = priorLogs[checkIso];
          if (checkLog && isPeriodBleedingFlow(checkLog.bleedingFlow)) {
            lastFlowDate = checkIso;
          }
        }
        const hadNonBleedGap = diffDaysIso(normalized.logDate, lastFlowDate) > 1;
        if (hadNonBleedGap) {
          helperMessage =
            'Clue 10-Day Bleeding Rule: Because this bleed is within 10 days of your current cycle start (' +
            activeBeforeDate.startDate +
            '), it stays inside the same cycle. If this lighter bleed was separate, log it as Spotting instead.';
        }
      }
    }
  }

  nextLogs[normalized.logDate] = normalized;
  return { nextLogs, helperMessage };
}

/**
 * Pure cycle boundary detector enforcing the exact Clue rules:
 * - No "period ended" button; period length = span from start_date to last consecutive/clustered L/M/H day in that bleed.
 * - Spotting alone NEVER starts a new cycle.
 * - Minimum 10-day gap between cycle start dates (with preceding non-bleeding gap) before starting a new cycle.
 * - In `tracking_without_period` mode, `cycleStartMarker` starts new cycles.
 */
export function detectCyclesFromLogs(
  dailyLogs: Record<string, DailyCycleLog>,
  excludedCycleIds: string[],
  mode: CycleMode
): CycleRecord[] {
  const excludedSet = new Set(excludedCycleIds);
  const sortedDates = Object.keys(dailyLogs).sort();

  const cycles: CycleRecord[] = [];
  let currentStart: string | null = null;
  let currentLastBleed: string | null = null;
  let currentIsManual = false;

  for (const date of sortedDates) {
    const log = dailyLogs[date];
    if (!log) continue;

    if (mode === 'tracking_without_period') {
      if (log.cycleStartMarker) {
        if (currentStart) {
          const cycleLength = diffDaysIso(date, currentStart);
          const cycleId = `cycle-${currentStart}`;
          cycles.push({
            cycleId,
            startDate: currentStart,
            endDate: addDaysIso(date, -1),
            cycleLength,
            periodLength: 0,
            pmsDaysCount: countPmsDaysInRange(dailyLogs, currentStart, addDaysIso(date, -1)),
            isExcludedFromCalculations: excludedSet.has(cycleId),
            isManualStart: currentIsManual,
          });
        }
        currentStart = date;
        currentLastBleed = null;
        currentIsManual = true;
      }
      continue;
    }

    const isPeriodBleed = isPeriodBleedingFlow(log.bleedingFlow);
    const isManualMarker = log.cycleStartMarker;

    if (!isPeriodBleed && !isManualMarker) continue;

    if (!currentStart) {
      currentStart = date;
      currentLastBleed = isPeriodBleed ? date : null;
      currentIsManual = isManualMarker && !isPeriodBleed;
      continue;
    }

    const daysSinceCycleStart = diffDaysIso(date, currentStart);
    const daysSinceLastBleed = currentLastBleed ? diffDaysIso(date, currentLastBleed) : daysSinceCycleStart;

    // Start a new cycle ONLY if >= 10 days since current cycle start AND (had non-bleed gap OR manual cycleStartMarker)
    const startsNewCycle =
      (isManualMarker && daysSinceCycleStart >= 1) ||
      (isPeriodBleed && daysSinceCycleStart >= 10 && daysSinceLastBleed > 1);

    if (startsNewCycle) {
      const endDate = addDaysIso(date, -1);
      const cycleLength = diffDaysIso(date, currentStart);
      const periodLength = currentLastBleed ? diffDaysIso(currentLastBleed, currentStart) + 1 : 0;
      const cycleId = `cycle-${currentStart}`;
      cycles.push({
        cycleId,
        startDate: currentStart,
        endDate,
        cycleLength,
        periodLength,
        pmsDaysCount: countPmsDaysInRange(dailyLogs, currentStart, endDate),
        isExcludedFromCalculations: excludedSet.has(cycleId),
        isManualStart: currentIsManual,
      });

      currentStart = date;
      currentLastBleed = isPeriodBleed ? date : null;
      currentIsManual = isManualMarker && !isPeriodBleed;
    } else if (isPeriodBleed) {
      // Keep inside ongoing cycle (e.g. gap < 10 days or consecutive period days)
      if (!currentLastBleed || date > currentLastBleed) {
        // Only extend period length if within the initial bleed episode (< 10 days from start)
        if (daysSinceCycleStart < 10) {
          currentLastBleed = date;
        }
      }
    }
  }

  if (currentStart) {
    const cycleId = `cycle-${currentStart}`;
    const periodLength = currentLastBleed ? diffDaysIso(currentLastBleed, currentStart) + 1 : 0;
    const lastLogDate = sortedDates[sortedDates.length - 1] ?? currentStart;
    cycles.push({
      cycleId,
      startDate: currentStart,
      endDate: null,
      cycleLength: null,
      periodLength,
      pmsDaysCount: countPmsDaysInRange(dailyLogs, currentStart, lastLogDate),
      isExcludedFromCalculations: excludedSet.has(cycleId),
      isManualStart: currentIsManual,
    });
  }

  return cycles;
}

function countPmsDaysInRange(
  dailyLogs: Record<string, DailyCycleLog>,
  startDate: string,
  endDate: string
): number {
  let count = 0;
  for (const [date, log] of Object.entries(dailyLogs)) {
    if (date >= startDate && date <= endDate && log.pmsLogged) {
      count++;
    }
  }
  return count;
}

/**
 * Resolve observed luteal length from past valid completed cycles with POSITIVE ovulation test or BBT shift.
 * Negative ovulation tests are ignored. Default = 13 days.
 */
export function computeObservedLutealLength(
  completedValidCycles: CycleRecord[],
  dailyLogs: Record<string, DailyCycleLog>
): number {
  const recent12 = completedValidCycles.slice(-12);
  const lutealSamples: number[] = [];

  for (const cycle of recent12) {
    if (!cycle.endDate || !cycle.cycleLength) continue;
    const nextStart = addDaysIso(cycle.startDate, cycle.cycleLength);

    // Collect dates inside this cycle sorted
    const cycleDates = Object.keys(dailyLogs)
      .filter((d) => d >= cycle.startDate && d <= cycle.endDate!)
      .sort();

    // 1. Positive ovulation test takes priority (ignore negative tests)
    const positiveDates = cycleDates.filter((d) => dailyLogs[d]?.ovulationTest === 'positive');
    if (positiveDates.length > 0) {
      // Ovulation typically occurs ~1 day after positive LH surge
      const estOvulation = addDaysIso(positiveDates[positiveDates.length - 1], 1);
      const luteal = diffDaysIso(nextStart, estOvulation);
      if (luteal >= 9 && luteal <= 18) {
        lutealSamples.push(luteal);
        continue;
      }
    }

    // 2. BBT thermal shift detection: 3 consecutive temps >= baseline + 0.2°C
    const bbtEntries = cycleDates
      .map((d) => ({ date: d, temp: dailyLogs[d]?.bbtCelsius ?? null }))
      .filter((x): x is { date: string; temp: number } => x.temp !== null);

    if (bbtEntries.length >= 6) {
      const firstTemps = bbtEntries.slice(0, Math.min(6, bbtEntries.length - 3)).map((x) => x.temp);
      const baseline = firstTemps.reduce((a, b) => a + b, 0) / firstTemps.length;
      for (let i = 1; i <= bbtEntries.length - 2; i++) {
        if (
          bbtEntries[i].temp >= baseline + 0.2 &&
          bbtEntries[i + 1].temp >= baseline + 0.2
        ) {
          const estOvulation = addDaysIso(bbtEntries[i].date, -1);
          const luteal = diffDaysIso(nextStart, estOvulation);
          if (luteal >= 9 && luteal <= 18) {
            lutealSamples.push(luteal);
          }
          break;
        }
      }
    }
  }

  if (lutealSamples.length === 0) return 13;
  return Math.round(lutealSamples.reduce((a, b) => a + b, 0) / lutealSamples.length);
}

/**
 * Respect mode-specific manual length override permissions.
 */
export function resolveModeManualOverrides(settings: UserCycleSettings): {
  allowManualCycle: boolean;
  allowManualPeriod: boolean;
  manualCycle: number | null;
  manualPeriod: number | null;
} {
  const mode = settings.activeMode;
  const allowManualCycle =
    mode === 'period_tracking' || mode === 'perimenopause' || mode === 'tracking_without_period';
  const allowManualPeriod =
    mode === 'period_tracking' || mode === 'perimenopause' || mode === 'conceive';

  return {
    allowManualCycle,
    allowManualPeriod,
    manualCycle: allowManualCycle ? settings.manualCycleLength : null,
    manualPeriod: allowManualPeriod ? settings.manualPeriodLength : null,
  };
}

/**
 * Pure CycleCalculationEngine entry point.
 */
export function runCycleCalculationEngine(
  state: CycleModuleState,
  todayDate: string
): CycleEngineOutput {
  const { settings, dailyLogs, excludedCycleIds } = state;
  const cycles = detectCyclesFromLogs(dailyLogs, excludedCycleIds, settings.activeMode);

  const completedValidCycles = cycles.filter(
    (c) => c.endDate !== null && c.cycleLength !== null && !c.isExcludedFromCalculations
  );

  // Displayed averages: last 6 valid completed cycles
  const last6 = completedValidCycles.slice(-6);
  const avgCycleLength6 =
    last6.length > 0
      ? Math.round(last6.reduce((sum, c) => sum + (c.cycleLength ?? 28), 0) / last6.length)
      : settings.setupTypicalCycleLength || 28;

  const last6WithPeriod = last6.filter((c) => c.periodLength > 0);
  const avgPeriodLength6 =
    last6WithPeriod.length > 0
      ? Math.round(last6WithPeriod.reduce((sum, c) => sum + c.periodLength, 0) / last6WithPeriod.length)
      : settings.setupTypicalPeriodLength || 5;

  // Predictions: last 12 valid completed cycles
  const last12 = completedValidCycles.slice(-12);
  const rolling12Cycle =
    last12.length > 0
      ? Math.round(last12.reduce((sum, c) => sum + (c.cycleLength ?? 28), 0) / last12.length)
      : settings.setupTypicalCycleLength || 28;

  const last12WithPeriod = last12.filter((c) => c.periodLength > 0);
  const rolling12Period =
    last12WithPeriod.length > 0
      ? Math.round(last12WithPeriod.reduce((sum, c) => sum + c.periodLength, 0) / last12WithPeriod.length)
      : settings.setupTypicalPeriodLength || 5;

  const { manualCycle, manualPeriod } = resolveModeManualOverrides(settings);
  const effectiveCycleLength = Math.max(15, Math.min(90, manualCycle ?? rolling12Cycle));
  const effectivePeriodLength = Math.max(1, Math.min(14, manualPeriod ?? rolling12Period));

  const observedLutealLength = computeObservedLutealLength(completedValidCycles, dailyLogs);

  // PMS dependency rule: predicted PMS clouds ONLY when pmsLogged === true in logs OR setupTypicalPmsDays > 0
  const anyPmsLogged = Object.values(dailyLogs).some((l) => l.pmsLogged);
  const pmsEnabled = anyPmsLogged || settings.setupTypicalPmsDays > 0;

  let pmsAvgDuration = settings.setupTypicalPmsDays;
  if (anyPmsLogged) {
    const pmsCounts = last12.map((c) => c.pmsDaysCount).filter((n) => n > 0);
    if (pmsCounts.length > 0) {
      pmsAvgDuration = Math.max(1, Math.round(pmsCounts.reduce((a, b) => a + b, 0) / pmsCounts.length));
    } else {
      const currentCyclePms = cycles[cycles.length - 1]?.pmsDaysCount ?? 0;
      pmsAvgDuration = Math.max(1, currentCyclePms || settings.setupTypicalPmsDays || 3);
    }
  }

  const activeCycle = cycles.length > 0 ? cycles[cycles.length - 1] : null;
  const currentCycleDay = activeCycle ? diffDaysIso(todayDate, activeCycle.startDate) + 1 : null;

  // Generate 12 cycles (up to ~12 months) of rolling predictions unless in Pregnancy mode
  const predictions: CycleWindowPrediction[] = [];
  if (settings.activeMode !== 'pregnancy') {
    const anchorStart = activeCycle ? activeCycle.startDate : todayDate;

    // Cycle 0 is the current ongoing cycle's upcoming ovulation/PMS/fertile window; Cycles 1..12 are future cycles
    for (let i = 0; i <= 12; i++) {
      const cycleStart = addDaysIso(anchorStart, i * effectiveCycleLength);
      const nextPeriodStart = addDaysIso(anchorStart, (i + 1) * effectiveCycleLength);
      const predictedPeriodEnd = addDaysIso(cycleStart, effectivePeriodLength - 1);

      // Ovulation Day (1-indexed) = Cycle_Length - Luteal (e.g., 24 - 13 = Day 11; 28 - 13 = Day 15)
      const ovulationOffsetDays = Math.max(1, effectiveCycleLength - observedLutealLength - 1);
      const predictedOvulationDate = addDaysIso(cycleStart, ovulationOffsetDays);
      // Fertile window = ALWAYS 7 days [ovulation - 5, ovulation + 1] (allows overlap with short cycle period days!)
      const fertileWindowStart = addDaysIso(predictedOvulationDate, -5);
      const fertileWindowEnd = addDaysIso(predictedOvulationDate, 1);

      let predictedPmsStart: string | null = null;
      let predictedPmsEnd: string | null = null;
      if (pmsEnabled && pmsAvgDuration > 0) {
        predictedPmsEnd = addDaysIso(nextPeriodStart, -1);
        predictedPmsStart = addDaysIso(nextPeriodStart, -pmsAvgDuration);
      }

      predictions.push({
        cycleIndex: i,
        predictedPeriodStart: cycleStart,
        predictedPeriodEnd,
        predictedPeriodLength: effectivePeriodLength,
        predictedOvulationDate,
        fertileWindowStart,
        fertileWindowEnd,
        predictedPmsStart,
        predictedPmsEnd,
      });
    }
  }

  // Derive human-readable current phase
  let currentPhase = 'No cycles logged yet';
  if (settings.activeMode === 'pregnancy') {
    currentPhase = 'Pregnancy Tracking Active';
  } else if (activeCycle && currentCycleDay !== null) {
    const curPred = predictions[0];
    if (todayDate <= (curPred?.predictedPeriodEnd ?? '') && currentCycleDay <= effectivePeriodLength) {
      currentPhase =
        settings.activeMode === 'perimenopause' ? 'Menstrual Phase (Perimenopause)' : 'Menstrual Phase';
    } else if (
      curPred &&
      todayDate >= curPred.fertileWindowStart &&
      todayDate <= curPred.fertileWindowEnd
    ) {
      currentPhase =
        todayDate === curPred.predictedOvulationDate ? 'Estimated Ovulation Day' : 'Estimated Fertile Window';
    } else if (
      curPred &&
      curPred.predictedPmsStart &&
      curPred.predictedPmsEnd &&
      todayDate >= curPred.predictedPmsStart &&
      todayDate <= curPred.predictedPmsEnd
    ) {
      currentPhase = 'Luteal Phase · PMS Window';
    } else if (curPred && todayDate > curPred.predictedOvulationDate) {
      currentPhase = 'Luteal Phase';
    } else {
      currentPhase = 'Follicular Phase';
    }
  }

  return {
    cycles,
    activeCycle,
    currentCycleDay,
    currentPhase,
    avgCycleLength6,
    avgPeriodLength6,
    effectiveCycleLength,
    effectivePeriodLength,
    observedLutealLength,
    pmsEnabled,
    pmsAvgDuration,
    predictions,
    hasSufficientHistory: completedValidCycles.length >= 2,
  };
}

/**
 * Build per-date Clue visual color/icon metadata over a date range.
 */
export function buildDayVisualMap(
  state: CycleModuleState,
  engine: CycleEngineOutput,
  fromDate: string,
  toDate: string
): Record<string, DayVisualMeta> {
  const map: Record<string, DayVisualMeta> = {};
  const { settings, dailyLogs } = state;

  const totalDays = Math.max(0, diffDaysIso(toDate, fromDate));
  for (let i = 0; i <= totalDays; i++) {
    const date = addDaysIso(fromDate, i);
    const log = dailyLogs[date];
    const loggedFlow: BleedingFlow = log?.bleedingFlow ?? 'none';

    const symptomColors: string[] = [];
    if (log) {
      for (const cat of TRACKING_CATEGORIES) {
        if (cat.id === 'period') continue;
        const vals = log.selectedSymptoms[cat.id];
        if (vals && vals.length > 0) {
          symptomColors.push(cat.dotColor);
        }
      }
      if (log.ovulationTest !== 'none' || log.bbtCelsius !== null) {
        symptomColors.push('#0EA5E9');
      }
      if (log.customTagIds.length > 0) {
        symptomColors.push('#64748B');
      }
    }

    const hasAnyLog = Boolean(
      log &&
        (log.bleedingFlow !== 'none' ||
          symptomColors.length > 0 ||
          log.pmsLogged ||
          log.dailyNote.trim() !== '' ||
          log.cycleStartMarker)
    );

    let isPredictedPeriod = false;
    let isFertileWindow = false;
    let isOvulationDay = false;
    let isPredictedPms = false;

    for (const pred of engine.predictions) {
      // Cycle 0's period is already logged/active; cycles >= 1 are future predicted periods
      if (pred.cycleIndex >= 1 && date >= pred.predictedPeriodStart && date <= pred.predictedPeriodEnd) {
        isPredictedPeriod = true;
      }
      if (settings.showFertileWindow && date >= pred.fertileWindowStart && date <= pred.fertileWindowEnd) {
        isFertileWindow = true;
      }
      if (settings.showOvulation && date === pred.predictedOvulationDate) {
        isOvulationDay = true;
      }
      if (
        pred.predictedPmsStart &&
        pred.predictedPmsEnd &&
        date >= pred.predictedPmsStart &&
        date <= pred.predictedPmsEnd
      ) {
        isPredictedPms = true;
      }
    }

    const isTrackedPms = Boolean(log?.pmsLogged);
    const isPeriodDay = isPeriodBleedingFlow(loggedFlow) || isPredictedPeriod;
    const isOverlapPeriodAndFertile = isPeriodDay && isFertileWindow;

    map[date] = {
      date,
      loggedFlow,
      isPredictedPeriod,
      isFertileWindow,
      isOvulationDay,
      isTrackedPms,
      isPredictedPms,
      isOverlapPeriodAndFertile,
      symptomColors: symptomColors.slice(0, 4),
      hasAnyLog,
    };
  }

  return map;
}

export function serializeCycleCsv(state: CycleModuleState, engine: CycleEngineOutput): string {
  const esc = (v: string | number | boolean | null) => {
    const s = v === null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const headers = [
    'Date',
    'Bleeding Flow',
    'PMS Logged',
    'Ovulation Test',
    'BBT (C)',
    'Symptoms',
    'Daily Note',
    'Cycle Start Marker',
  ];
  const rows = Object.keys(state.dailyLogs)
    .sort()
    .map((date) => {
      const l = state.dailyLogs[date];
      const symSummary = Object.entries(l.selectedSymptoms)
        .filter(([, arr]) => arr.length > 0)
        .map(([k, arr]) => `${k}: ${arr.join(';')}`)
        .join(' | ');
      return [
        date,
        l.bleedingFlow,
        l.pmsLogged,
        l.ovulationTest,
        l.bbtCelsius,
        symSummary,
        l.dailyNote,
        l.cycleStartMarker,
      ]
        .map(esc)
        .join(',');
    });

  const summaryHeader = `\r\n\r\nCycle Summary (6-Cycle Avg: ${engine.avgCycleLength6}d | Period Avg: ${engine.avgPeriodLength6}d)`;
  return [headers.map(esc).join(','), ...rows].join('\r\n') + summaryHeader;
}
