import { useEffect, useRef, useState } from 'react';
import { AppIcon } from '../components/AppIcon';
import { useAppState } from '../context/AppStateContext';
import {
  createStudioScene,
  type CameraPresetId,
  type EquipmentId,
  type FinishId,
  type StudioSceneApi,
} from '../three/studioScene';

export function ThreeScenePage() {
  const { theme } = useAppState();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<StudioSceneApi | null>(null);

  const [equipment, setEquipment] = useState<EquipmentId>('kettlebell');
  const [finish, setFinish] = useState<FinishId>('royal_titanium');
  const [exploded, setExploded] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [preset, setPreset] = useState<CameraPresetId>('hero');
  const [dockVisible, setDockVisible] = useState(true);
  const [webglError, setWebglError] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    try {
      const api = createStudioScene(el);
      api.setDarkMode(theme === 'dark');
      apiRef.current = api;
      return () => {
        api.dispose();
        apiRef.current = null;
      };
    } catch (err) {
      setWebglError(err instanceof Error ? err.message : 'Unable to initialize 3D WebGL context.');
      return undefined;
    }
  }, []);

  useEffect(() => {
    apiRef.current?.setDarkMode(theme === 'dark');
  }, [theme]);

  const handleEquipment = (id: EquipmentId) => {
    setEquipment(id);
    apiRef.current?.setEquipment(id);
  };

  const handleFinish = (id: FinishId) => {
    setFinish(id);
    apiRef.current?.setFinish(id);
  };

  const handleExplodeToggle = () => {
    const next = !exploded;
    setExploded(next);
    apiRef.current?.setExploded(next);
  };

  const handleAnimateToggle = () => {
    const next = !animating;
    setAnimating(next);
    apiRef.current?.setAnimating(next);
  };

  const handlePreset = (p: CameraPresetId) => {
    setPreset(p);
    apiRef.current?.setCameraPreset(p);
  };

  return (
    <div className="relative w-full h-[calc(100vh-11rem)] min-[840px]:h-[calc(100vh-5rem)] rounded-3xl overflow-hidden border border-[var(--border-subtle)] bg-[#EEF0F8] dark:bg-[#0F1324]">
      {/* Isolated WebGL Mounting Container (Zero JSX Children) */}
      <div
        ref={containerRef}
        data-testid="three-canvas-stage"
        className="w-full h-full"
      />

      {webglError && (
        <div className="absolute inset-0 flex items-center justify-center p-6 bg-[var(--card-surface)]/95">
          <div className="max-w-sm text-center space-y-2">
            <AppIcon name="alert" size={28} className="text-rose-600 mx-auto" />
            <p className="text-sm font-bold text-[var(--text-primary)]">{webglError}</p>
          </div>
        </div>
      )}

      {/* Minimal Top Bar: Title & Zen Mode Toggle (solid surface, no backdrop-filter) */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto px-3.5 py-2 rounded-2xl bg-[var(--card-surface)] border border-[var(--border-subtle)] shadow-sm">
          <h1 className="text-xs sm:text-sm font-extrabold text-[var(--text-primary)] leading-tight">
            3D Form & Equipment Studio
          </h1>
          <p className="text-[10px] text-[var(--text-secondary)]">
            Drag to orbit · Scroll to zoom · Inspect multi-part mechanics
          </p>
        </div>

        <button
          type="button"
          onClick={() => setDockVisible((v) => !v)}
          className="pointer-events-auto h-9 px-3.5 rounded-full bg-[var(--card-surface)] border border-[var(--border-subtle)] shadow-sm text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-inset)] cursor-pointer"
        >
          {dockVisible ? 'Hide Controls' : 'Show Controls'}
        </button>
      </div>

      {/* Single Compact Collapsible Bottom Dock (<= 15% footprint, solid surface, no backdrop-filter) */}
      {dockVisible && (
        <div className="absolute bottom-3 left-3 right-3 flex justify-center pointer-events-none">
          <div className="pointer-events-auto bg-[var(--card-surface)] border border-[var(--border-subtle)] shadow-lg rounded-2xl px-3 py-2.5 flex flex-wrap items-center justify-center gap-2 max-w-4xl">
            {/* Equipment Selector */}
            <div className="flex items-center gap-1 bg-[var(--surface-inset)] p-1 rounded-full">
              {(
                [
                  { id: 'kettlebell', label: 'Kettlebell' },
                  { id: 'dumbbell', label: 'Hex Dumbbell' },
                  { id: 'gyro', label: 'Core Gyro' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleEquipment(item.id)}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold cursor-pointer transition-colors ${
                    equipment === item.id
                      ? 'bg-[var(--primary)] text-white'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Finish Selector */}
            <div className="flex items-center gap-1 bg-[var(--surface-inset)] p-1 rounded-full">
              {(
                [
                  { id: 'royal_titanium', label: 'Titanium' },
                  { id: 'matte_obsidian', label: 'Obsidian' },
                  { id: 'rose_copper', label: 'Rose' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => handleFinish(f.id)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold cursor-pointer ${
                    finish === f.id
                      ? 'bg-[var(--text-primary)] text-white'
                      : 'text-[var(--text-secondary)]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Camera Presets */}
            <div className="flex items-center gap-1 bg-[var(--surface-inset)] p-1 rounded-full">
              {(['hero', 'side', 'top'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePreset(p)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold capitalize cursor-pointer ${
                    preset === p
                      ? 'bg-[var(--card-surface)] text-[var(--text-primary)] shadow-xs'
                      : 'text-[var(--text-secondary)]'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Exploded & Kinematics Toggles */}
            <button
              type="button"
              onClick={handleExplodeToggle}
              className={`h-8 px-3 rounded-full text-[11px] font-bold cursor-pointer border ${
                exploded
                  ? 'bg-[#BE123C] text-white border-[#BE123C]'
                  : 'bg-[var(--card-surface)] text-[var(--text-primary)] border-[var(--border-subtle)]'
              }`}
            >
              {exploded ? 'Assemble' : 'Explode Parts'}
            </button>

            <button
              type="button"
              onClick={handleAnimateToggle}
              className={`h-8 px-3 rounded-full text-[11px] font-bold flex items-center gap-1 cursor-pointer border ${
                animating
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-[var(--card-surface)] text-[var(--text-primary)] border-[var(--border-subtle)]'
              }`}
            >
              <AppIcon name={animating ? 'pause' : 'play'} size={12} />
              <span>{animating ? 'Pause Motion' : 'Animate Form'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
