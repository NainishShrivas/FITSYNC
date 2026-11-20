import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyDailyCycleLogUpdate,
  buildDayVisualMap,
  createDefaultCycleState,
  createEmptyDailyLog,
  isCycleTrackingEnabled,
  runCycleCalculationEngine,
} from './cycleEngine';
import type { CycleModuleState } from '../types/cycle';

test('1. Female-Only Gate Verification: strictly true only when gender === "female"', () => {
  assert.equal(isCycleTrackingEnabled('female'), true);
  assert.equal(isCycleTrackingEnabled('male'), false);
  assert.equal(isCycleTrackingEnabled('non_binary'), false);
  assert.equal(isCycleTrackingEnabled('prefer_not_to_say'), false);
  assert.equal(isCycleTrackingEnabled(undefined), false);
});

test('2. 10-Day Bleeding Gap Rule: Day 8 stays inside Cycle 1; Day 11 or Spotting behaves properly', () => {
  const base = createDefaultCycleState();
  base.settings.onboardingCompleted = true;

  for (const d of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']) {
    const res = applyDailyCycleLogUpdate(
      base.dailyLogs,
      { ...createEmptyDailyLog(d), bleedingFlow: 'medium' },
      'period_tracking'
    );
    base.dailyLogs = res.nextLogs;
  }

  const day8Attempt = applyDailyCycleLogUpdate(
    base.dailyLogs,
    { ...createEmptyDailyLog('2026-10-08'), bleedingFlow: 'light' },
    'period_tracking'
  );
  assert.ok(day8Attempt.helperMessage && day8Attempt.helperMessage.includes('10-Day'));
  const engineWithDay8 = runCycleCalculationEngine({ ...base, dailyLogs: day8Attempt.nextLogs }, '2026-10-20');
  assert.equal(engineWithDay8.cycles.length, 1);

  const spottingAttempt = applyDailyCycleLogUpdate(
    base.dailyLogs,
    { ...createEmptyDailyLog('2026-10-15'), bleedingFlow: 'spotting' },
    'period_tracking'
  );
  const engineWithSpotting = runCycleCalculationEngine(
    { ...base, dailyLogs: spottingAttempt.nextLogs },
    '2026-10-20'
  );
  assert.equal(engineWithSpotting.cycles.length, 1);

  const day11Attempt = applyDailyCycleLogUpdate(
    base.dailyLogs,
    { ...createEmptyDailyLog('2026-10-11'), bleedingFlow: 'light' },
    'period_tracking'
  );
  assert.equal(day11Attempt.helperMessage, null);
  const engineWithDay11 = runCycleCalculationEngine({ ...base, dailyLogs: day11Attempt.nextLogs }, '2026-10-20');
  assert.equal(engineWithDay11.cycles.length, 2);
  assert.equal(engineWithDay11.cycles[0].cycleLength, 10);
});

test('3. PMS Cloud Dependency: Cramps + Bloated without PMS yields zero clouds; logging PMS enables clouds', () => {
  const state: CycleModuleState = createDefaultCycleState();
  state.settings.onboardingCompleted = true;
  state.settings.setupTypicalPmsDays = 0;

  for (const d of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-29', '2026-10-30', '2026-10-31']) {
    state.dailyLogs[d] = { ...createEmptyDailyLog(d), bleedingFlow: 'medium' };
  }
  for (const d of ['2026-10-25', '2026-10-26', '2026-10-27']) {
    state.dailyLogs[d] = {
      ...createEmptyDailyLog(d),
      selectedSymptoms: { pain: ['Cramps'], digestion: ['Bloated'] },
      pmsLogged: false,
    };
  }

  const engineWithoutPms = runCycleCalculationEngine(state, '2026-11-05');
  assert.equal(engineWithoutPms.pmsEnabled, false);
  assert.equal(engineWithoutPms.predictions[0].predictedPmsStart, null);

  for (const d of ['2026-10-26', '2026-10-27']) {
    const upd = applyDailyCycleLogUpdate(
      state.dailyLogs,
      {
        ...state.dailyLogs[d],
        selectedSymptoms: { ...state.dailyLogs[d].selectedSymptoms, feelings: ['PMS'] },
      },
      'period_tracking'
    );
    state.dailyLogs = upd.nextLogs;
  }

  const engineWithPms = runCycleCalculationEngine(state, '2026-11-05');
  assert.equal(engineWithPms.pmsEnabled, true);
  assert.ok(engineWithPms.predictions[0].predictedPmsStart !== null);
  const visuals = buildDayVisualMap(state, engineWithPms, '2026-11-20', '2026-11-28');
  const hasClouds = Object.values(visuals).some((v) => v.isPredictedPms);
  assert.equal(hasClouds, true);
});

test('4. Atypical Cycle Exclusion: 55-day outlier inflates averages, Hide this cycle restores valid average', () => {
  const state: CycleModuleState = createDefaultCycleState();
  state.settings.onboardingCompleted = true;

  for (const start of ['2026-07-01', '2026-07-29', '2026-09-22', '2026-10-20']) {
    state.dailyLogs[start] = { ...createEmptyDailyLog(start), bleedingFlow: 'medium' };
  }

  const beforeExclude = runCycleCalculationEngine(state, '2026-10-25');
  assert.equal(beforeExclude.avgCycleLength6, 37);

  state.excludedCycleIds = ['cycle-2026-07-29'];
  const afterExclude = runCycleCalculationEngine(state, '2026-10-25');
  assert.equal(afterExclude.avgCycleLength6, 28);
  assert.equal(afterExclude.effectiveCycleLength, 28);
  assert.equal(afterExclude.cycles.find((c) => c.cycleId === 'cycle-2026-07-29')?.isExcludedFromCalculations, true);
});

test('5. Short-Cycle Fertile Window Overlap: 24-day cycle + 6-day period yields Ovulation Day 11 & Fertile Days 6-12 overlapping Day 6', () => {
  const state: CycleModuleState = createDefaultCycleState();
  state.settings.onboardingCompleted = true;

  const c1 = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06'];
  const c2 = ['2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30'];
  const c3 = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'];
  for (const d of [...c1, ...c2, ...c3]) {
    state.dailyLogs[d] = { ...createEmptyDailyLog(d), bleedingFlow: 'medium' };
  }

  const engine = runCycleCalculationEngine(state, '2026-10-24');
  assert.equal(engine.effectiveCycleLength, 24);
  assert.equal(engine.effectivePeriodLength, 6);

  const pred0 = engine.predictions[0];
  assert.equal(pred0.predictedOvulationDate, '2026-10-29');
  assert.equal(pred0.fertileWindowStart, '2026-10-24');
  assert.equal(pred0.fertileWindowEnd, '2026-10-30');

  const map = buildDayVisualMap(state, engine, '2026-10-19', '2026-11-20');
  assert.equal(map['2026-10-24'].isFertileWindow, true);
  assert.equal(map['2026-10-24'].isOverlapPeriodAndFertile, true);
  assert.equal(map['2026-11-17'].isPredictedPeriod, true);
  assert.equal(map['2026-11-17'].isFertileWindow, true);
  assert.equal(map['2026-11-17'].isOverlapPeriodAndFertile, true);
});

test('6. Positive Ovulation Test refines luteal length; Negative Ovulation Test is ignored', () => {
  const state: CycleModuleState = createDefaultCycleState();
  state.settings.onboardingCompleted = true;

  state.dailyLogs['2026-10-01'] = { ...createEmptyDailyLog('2026-10-01'), bleedingFlow: 'medium' };
  state.dailyLogs['2026-10-12'] = { ...createEmptyDailyLog('2026-10-12'), ovulationTest: 'negative' };
  state.dailyLogs['2026-10-17'] = { ...createEmptyDailyLog('2026-10-17'), ovulationTest: 'positive' };
  state.dailyLogs['2026-10-29'] = { ...createEmptyDailyLog('2026-10-29'), bleedingFlow: 'medium' };

  const engine = runCycleCalculationEngine(state, '2026-11-01');
  assert.equal(engine.observedLutealLength, 11);
});
