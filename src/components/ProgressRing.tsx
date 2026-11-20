interface ProgressRingProps {
  value: number;
  max: number;
  color: string;
  trackColor?: string;
  size?: number;
  strokeWidth?: number;
  label: string;
  sublabel?: string;
  centerDisplay?: string;
}

export function ProgressRing({
  value,
  max,
  color,
  trackColor = 'var(--border-subtle)',
  size = 124,
  strokeWidth = 11,
  label,
  sublabel,
  centerDisplay,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const offset = circumference * (1 - ratio);

  return (
    <div className="flex flex-col items-center">
      <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          role="img"
          aria-label={`${label}: ${centerDisplay ?? value}`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={trackColor}
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-500 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-extrabold text-[var(--text-primary)] tabular-nums leading-none">
            {centerDisplay ?? value}
          </span>
          <span className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            {label}
          </span>
        </div>
      </div>
      {sublabel && (
        <p className="mt-2.5 text-xs font-medium text-[var(--text-secondary)] tabular-nums">
          {sublabel}
        </p>
      )}
    </div>
  );
}
