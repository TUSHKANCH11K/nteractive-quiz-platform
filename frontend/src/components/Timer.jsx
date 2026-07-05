import React, { useEffect, useState, useRef } from "react";

export default function Timer({ initialSeconds, onExpire }) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const ref = useRef(null);

  useEffect(() => {
    setSeconds(initialSeconds);
    if (ref.current) clearInterval(ref.current);
    if (initialSeconds <= 0) return;

    ref.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(ref.current);
          onExpire && onExpire();
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(ref.current);
  }, [initialSeconds]);

  const pct = Math.max(0, seconds / initialSeconds);
  const r = 44;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);
  const urgent = seconds <= 5;
  const color = urgent
    ? "var(--danger)"
    : seconds <= 10
      ? "var(--warning)"
      : "var(--primary)";

  return (
    <div style={{ textAlign: "center" }}>
      <svg width={110} height={110} viewBox="0 0 110 110">
        <circle
          cx={55}
          cy={55}
          r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth={8}
        />
        <circle
          cx={55}
          cy={55}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{
            transform: "rotate(-90deg)",
            transformOrigin: "55px 55px",
            transition: "stroke-dashoffset 1s linear, stroke .3s",
          }}
        />
        <text
          x={55}
          y={55}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={urgent ? 30 : 26}
          fontWeight={700}
          fill={color}
          style={{ transition: "font-size .2s" }}
        >
          {seconds}
        </text>
      </svg>
      <div className="text-secondary text-sm" style={{ marginTop: -4 }}>
        сек
      </div>
    </div>
  );
}
