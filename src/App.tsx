import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { AppStateProvider, useAppState } from './context/AppStateContext';
import { AiCoachPage } from './pages/AiCoachPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { CheatMealPage } from './pages/CheatMealPage';
import { CycleTrackerPage } from './pages/CycleTrackerPage';
import { DashboardPage } from './pages/DashboardPage';
import { ExerciseDetailPage } from './pages/ExerciseDetailPage';
import { OnboardingFlow } from './pages/OnboardingFlow';
import { PlansPage } from './pages/PlansPage';
import { ProfilePage } from './pages/ProfilePage';
import { RewardsPage } from './pages/RewardsPage';
import { ThreeScenePage } from './pages/ThreeScenePage';

function ProtectedShellRoute({ children }: { children: React.ReactNode }) {
  const { state } = useAppState();
  if (!state.profile.onboardingCompleted) {
    return <Navigate to="/onboarding" replace />;
  }
  return <AppShell>{children}</AppShell>;
}

function FemaleCycleRoute({ children }: { children: React.ReactNode }) {
  const { state, cycleTrackingEnabled } = useAppState();
  if (!state.profile.onboardingCompleted) {
    return <Navigate to="/onboarding" replace />;
  }
  if (!cycleTrackingEnabled) {
    return <Navigate to="/dashboard" replace />;
  }
  return <AppShell>{children}</AppShell>;
}

function RootRedirect() {
  const { state } = useAppState();
  return <Navigate to={state.profile.onboardingCompleted ? '/dashboard' : '/onboarding'} replace />;
}

export default function App() {
  return (
    <AppStateProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/onboarding" element={<OnboardingFlow />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedShellRoute>
                <DashboardPage />
              </ProtectedShellRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <ProtectedShellRoute>
                <AnalyticsPage />
              </ProtectedShellRoute>
            }
          />
          <Route
            path="/plans"
            element={
              <ProtectedShellRoute>
                <PlansPage />
              </ProtectedShellRoute>
            }
          />
          <Route
            path="/plans/exercise/:id"
            element={
              <ProtectedShellRoute>
                <ExerciseDetailPage />
              </ProtectedShellRoute>
            }
          />
          <Route
            path="/cheat-meal"
            element={
              <ProtectedShellRoute>
                <CheatMealPage />
              </ProtectedShellRoute>
            }
          />
          <Route
            path="/cycle"
            element={
              <FemaleCycleRoute>
                <CycleTrackerPage />
              </FemaleCycleRoute>
            }
          />
          <Route
            path="/ai-coach"
            element={
              <ProtectedShellRoute>
                <AiCoachPage />
              </ProtectedShellRoute>
            }
          />
          <Route
            path="/studio-3d"
            element={
              <ProtectedShellRoute>
                <ThreeScenePage />
              </ProtectedShellRoute>
            }
          />
          <Route
            path="/rewards"
            element={
              <ProtectedShellRoute>
                <RewardsPage />
              </ProtectedShellRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedShellRoute>
                <ProfilePage />
              </ProtectedShellRoute>
            }
          />
          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </BrowserRouter>
    </AppStateProvider>
  );
}
