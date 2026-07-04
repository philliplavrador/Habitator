interface Props {
  /** Progress toward the goal, 0..1+. Values > 1 are clamped for the arc. */
  progress: number;
  /** True once the goal is reached — turns the arc green. */
  reached: boolean;
  /** Centered content (the live timer, goal label, …). */
  children: React.ReactNode;
  size?: number; // px
  stroke?: number; // px
}

/**
 * Pure-SVG circular progress ring. The arc fills clockwise from the top and
 * caps at 100% (a fast can run past its goal; the ring just stays full and
 * green while the timer keeps counting).
 */
export default function ProgressRing({
  progress,
  reached,
  children,
  size = 224,
  stroke = 14,
}: Props) {
  const clamped = Math.max(0, Math.min(1, progress));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference * (1 - clamped);
  const center = size / 2;

  return (
    <div
      className="relative mx-auto"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        {/* Track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-border"
        />
        {/* Progress arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          className={
            reached ? 'stroke-pass' : 'stroke-accent'
          }
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}
