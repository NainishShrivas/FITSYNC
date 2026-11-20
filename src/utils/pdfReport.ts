import { jsPDF } from 'jspdf';
import type { CycleEngineOutput, CycleModuleState } from '../types/cycle';
import type { AppState, CalibratedMetrics } from '../types/fitsync';
import { isCycleTrackingEnabled } from './cycleEngine';

export interface PdfReportInput {
  state: AppState;
  metrics: CalibratedMetrics;
  eatenTodayKcal: number;
  burnedTodayKcal: number;
  avgHabitsPct: number;
  cycleState?: CycleModuleState | null;
  cycleEngine?: CycleEngineOutput | null;
}

/**
 * Generates an attractive, multi-section A4 FITSYNC progress report PDF
 * and immediately triggers a real `.pdf` browser download.
 */
export function downloadFitSyncPdfReport(input: PdfReportInput): void {
  const { state, metrics, eatenTodayKcal, burnedTodayKcal, avgHabitsPct, cycleState, cycleEngine } = input;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;

  const firstWeight = state.history14Days[0]?.weightKg ?? state.profile.weightKg;
  const currentWeight = state.profile.weightKg;
  const weightDelta = Number((currentWeight - firstWeight).toFixed(1));
  const remainingToday = Math.max(0, metrics.safeTargetKcal - (eatenTodayKcal - burnedTodayKcal));
  const goalLabel = state.profile.goalKey.replace(/_/g, ' ');

  // Top Royal Indigo Header Banner
  doc.setFillColor(61, 44, 142); // #3D2C8E
  doc.rect(0, 0, pageWidth, 42, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('FITSYNC', margin, 17);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Calibrated Health & Progress Report', margin, 25);

  doc.setFontSize(9.5);
  doc.setTextColor(224, 222, 245);
  doc.text(
    `${state.todayDate}  ·  ${state.profile.fullName}  ·  ${goalLabel} (${state.profile.bodyType})`,
    margin,
    33
  );

  // Badge on top-right
  doc.setFillColor(92, 74, 184);
  doc.roundedRect(pageWidth - margin - 46, 11, 46, 16, 4, 4, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`${state.streakDays}d Streak`, pageWidth - margin - 23, 18.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`${state.xp} XP · ${state.profile.dietPreference}`, pageWidth - margin - 23, 23.5, {
    align: 'center',
  });

  let y = 52;

  // Section 1: 4 Summary KPI Cards (2x2 grid)
  const cardW = (contentWidth - 6) / 2;
  const cardH = 32;

  const drawCard = (
    x: number,
    cy: number,
    title: string,
    rows: Array<{ label: string; value: string; accent?: [number, number, number] }>
  ) => {
    doc.setFillColor(246, 247, 251);
    doc.setDrawColor(226, 228, 240);
    doc.roundedRect(x, cy, cardW, cardH, 3.5, 3.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(61, 44, 142);
    doc.text(title.toUpperCase(), x + 5, cy + 7.5);

    let ry = cy + 14.5;
    for (const r of rows) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(r.label, x + 5, ry);

      doc.setFont('helvetica', 'bold');
      if (r.accent) {
        doc.setTextColor(r.accent[0], r.accent[1], r.accent[2]);
      } else {
        doc.setTextColor(15, 23, 42);
      }
      doc.text(r.value, x + cardW - 5, ry, { align: 'right' });
      ry += 6;
    }
  };

  drawCard(margin, y, 'Weight Progress', [
    { label: 'Starting weight', value: `${firstWeight} kg` },
    { label: 'Current weight', value: `${currentWeight} kg` },
    {
      label: '14-day change',
      value: `${weightDelta > 0 ? `+${weightDelta}` : weightDelta} kg`,
      accent: weightDelta <= 0 ? [16, 185, 129] : [124, 58, 237],
    },
  ]);

  drawCard(margin + cardW + 6, y, 'Daily Calories', [
    { label: 'Safe daily target', value: `${metrics.safeTargetKcal} kcal` },
    { label: 'Consumed / Burned', value: `${eatenTodayKcal} / ${burnedTodayKcal} kcal` },
    { label: 'Remaining today', value: `${remainingToday} kcal`, accent: [61, 44, 142] },
  ]);

  y += cardH + 5;

  drawCard(margin, y, 'Biometrics & Macros', [
    { label: 'BMR / TDEE', value: `${metrics.bmr} / ${metrics.tdee} kcal` },
    {
      label: 'Macro split (P/C/F)',
      value: `${metrics.macros.proteinG}g / ${metrics.macros.carbsG}g / ${metrics.macros.fatsG}g`,
    },
    { label: 'Hydration / Sodium', value: `${metrics.driTargets.waterL} L / <=${metrics.driTargets.sodiumCapMg} mg` },
  ]);

  drawCard(margin + cardW + 6, y, 'Habits & Consistency', [
    { label: 'Avg habit completion', value: `${avgHabitsPct}%`, accent: [217, 119, 6] },
    { label: 'Current streak', value: `${state.streakDays} days`, accent: [194, 65, 12] },
    { label: 'BMI status', value: `${metrics.bmi}${metrics.isAdjustedBodyWeight ? ' (AdjBW)' : ''}` },
  ]);

  y += cardH + 9;

  // Section 2: Recent 7-Day Activity & Calibration Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('Recent 7-Day Tracking Log', margin, y);
  y += 4;

  const cols = [
    { label: 'Date', x: margin + 3 },
    { label: 'Weight', x: margin + 35 },
    { label: 'Target', x: margin + 63 },
    { label: 'Eaten', x: margin + 91 },
    { label: 'Burned', x: margin + 119 },
    { label: 'Habits', x: margin + 145 },
    { label: 'Workout', x: margin + 165 },
  ];

  doc.setFillColor(61, 44, 142);
  doc.roundedRect(margin, y, contentWidth, 8, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  for (const c of cols) {
    doc.text(c.label, c.x, y + 5.5);
  }
  y += 8.5;

  const recent7 = state.history14Days.slice(-7);
  recent7.forEach((row, idx) => {
    if (idx % 2 === 0) {
      doc.setFillColor(246, 247, 251);
      doc.rect(margin, y, contentWidth, 7, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text(row.date, cols[0].x, y + 4.8);
    doc.text(`${row.weightKg} kg`, cols[1].x, y + 4.8);
    doc.text(`${row.targetKcal} kcal`, cols[2].x, y + 4.8);
    doc.text(`${row.eatenKcal} kcal`, cols[3].x, y + 4.8);
    doc.text(`${row.burnedKcal} kcal`, cols[4].x, y + 4.8);
    doc.text(`${row.habitPct}%`, cols[5].x, y + 4.8);
    doc.text(row.workoutDone ? 'Done' : 'Rest', cols[6].x, y + 4.8);
    y += 7;
  });

  y += 8;

  // Section 3: Medical Safety & Coaching Summary
  doc.setFillColor(238, 236, 250);
  doc.setDrawColor(199, 194, 240);
  const insightLines: string[] = [];
  if (weightDelta < 0) {
    insightLines.push(`Trend: Down ${Math.abs(weightDelta)} kg over the last 14 days — staying aligned with your caloric target.`);
  } else if (weightDelta > 0) {
    insightLines.push(`Trend: Up +${weightDelta} kg over 14 days — adjust adherence or review cheat meal burn balance.`);
  } else {
    insightLines.push('Trend: Weight is stable. Increase daily habit & workout consistency to drive steady progress.');
  }

  if (metrics.safetyFloorTriggered) {
    insightLines.push(
      `Clinical Floor: Raw target (${metrics.rawTargetKcal} kcal) safely clamped to ${metrics.safetyFloorMinKcal} kcal minimum.`
    );
  }
  for (const n of metrics.medicalOverrides.notes.slice(0, 2)) {
    insightLines.push(n);
  }

  const wrappedInsights = doc.splitTextToSize(insightLines.join('  '), contentWidth - 10) as string[];
  const insightBoxH = Math.max(20, 12 + wrappedInsights.length * 4.5);

  doc.roundedRect(margin, y, contentWidth, insightBoxH, 3, 3, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(61, 44, 142);
  doc.text('CALIBRATED COACHING & SAFETY SUMMARY', margin + 5, y + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text(wrappedInsights, margin + 5, y + 13);

  y += insightBoxH + 7;

  // Optional Section 4: Female Cycle Summary (strictly gated, respects discreet mode)
  if (
    isCycleTrackingEnabled(state.profile.gender) &&
    cycleState?.settings.onboardingCompleted &&
    cycleEngine &&
    !cycleState.settings.discreetMode
  ) {
    doc.setFillColor(253, 242, 248);
    doc.setDrawColor(249, 168, 212);
    doc.roundedRect(margin, y, contentWidth, 24, 3, 3, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(190, 24, 93);
    doc.text('CYCLE & RECOVERY OVERVIEW', margin + 5, y + 7);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    const nextPred = cycleEngine.predictions[1]?.predictedPeriodStart ?? 'Pending logs';
    doc.text(
      `Phase: ${cycleEngine.currentPhase}  ·  Cycle Day: ${cycleEngine.currentCycleDay ?? '—'}`,
      margin + 5,
      y + 13.5
    );
    doc.text(
      `6-Cycle Avg Length: ${cycleEngine.avgCycleLength6} days  ·  Avg Period: ${cycleEngine.avgPeriodLength6} days  ·  Next Forecast: ${nextPred}`,
      margin + 5,
      y + 19.5
    );
  }

  // Footer
  doc.setDrawColor(226, 228, 240);
  doc.line(margin, 281, pageWidth - margin, 281);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text('FITSYNC — Your gamified fitness companion · Generated locally', pageWidth / 2, 287, {
    align: 'center',
  });

  doc.save(`fitsync-report-${state.todayDate}.pdf`);
}
