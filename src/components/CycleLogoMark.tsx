import { useId } from 'react';

export function CycleLogoMark({ size = 20, className = '' }: { size?: number; className?: string }) {
  const gradId = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <circle cx="14" cy="14" r="12.5" fill={`url(#${gradId})`} />
      <path
        d="M14 6.2C14 6.2 19.2 11.7 19.2 15.6C19.2 18.6 16.87 21 14 21C11.13 21 8.8 18.6 8.8 15.6C8.8 11.7 14 6.2 14 6.2Z"
        fill="white"
        fillOpacity="0.95"
      />
      <circle cx="14" cy="15.8" r="2.2" fill="#E11D48" />
      <defs>
        <linearGradient id={gradId} x1="3" y1="3" x2="25" y2="25" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FB7185" />
          <stop offset="1" stopColor="#E11D48" />
        </linearGradient>
      </defs>
    </svg>
  );
}
