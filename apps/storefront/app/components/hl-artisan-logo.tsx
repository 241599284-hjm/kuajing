"use client";

type HLArtisanLogoProps = {
  animated?: boolean;
  className?: string;
  decorative?: boolean;
  showSeal?: boolean;
  variant?: "full" | "wordmark" | "mark";
};

export function HLArtisanLogo({
  animated = false,
  className = "",
  decorative = false,
  showSeal = true,
  variant = "full"
}: HLArtisanLogoProps) {
  const isMark = variant === "mark";
  const isWordmark = variant === "wordmark";
  const viewBox = isMark ? "0 0 252 172" : isWordmark ? "0 0 520 150" : "0 0 520 330";

  return (
    <svg
      aria-hidden={decorative ? "true" : undefined}
      aria-label={decorative ? undefined : isMark ? "H and L Artisan loading mark" : "H and L Artisan"}
      className={className}
      role={decorative ? undefined : "img"}
      viewBox={viewBox}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="hl-artisan-ink" x1="32" x2="236" y1="142" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2f1e15" />
          <stop offset="0.52" stopColor="#6b4a35" />
          <stop offset="1" stopColor="#3b2619" />
        </linearGradient>
      </defs>
      <style>
        {`
          .hl-artisan-tilt {
            transform-box: fill-box;
            transform-origin: 54% 60%;
            animation: ${animated ? "hl-artisan-pour 2.8s ease-in-out infinite" : "none"};
          }
          .hl-artisan-stream {
            stroke-dasharray: 42;
            stroke-dashoffset: 42;
            animation: ${animated ? "hl-artisan-stream 2.8s ease-in-out infinite" : "none"};
          }
          .hl-artisan-steam {
            transform-box: fill-box;
            transform-origin: center;
            animation: ${animated ? "hl-artisan-steam 2.8s ease-in-out infinite" : "none"};
          }
          @keyframes hl-artisan-pour {
            0%, 100% { transform: rotate(0deg) translateY(0); }
            32%, 56% { transform: rotate(-8deg) translate(-2px, 1px); }
            74% { transform: rotate(2deg) translateY(-1px); }
          }
          @keyframes hl-artisan-stream {
            0%, 22% { stroke-dashoffset: 42; opacity: 0; }
            38%, 62% { stroke-dashoffset: 0; opacity: 0.9; }
            78%, 100% { stroke-dashoffset: -42; opacity: 0; }
          }
          @keyframes hl-artisan-steam {
            0%, 100% { transform: translateY(0); opacity: 0.82; }
            46% { transform: translateY(-5px); opacity: 1; }
            74% { transform: translateY(1px); opacity: 0.72; }
          }
          @media (prefers-reduced-motion: reduce) {
            .hl-artisan-tilt,
            .hl-artisan-stream,
            .hl-artisan-steam {
              animation: none;
            }
          }
        `}
      </style>

      <g transform={isMark ? "translate(10 8)" : isWordmark ? "translate(30 12)" : "translate(150 18)"}>
        <g className="hl-artisan-tilt">
          <path
            d="M44 116 C49 72 84 64 118 89 C152 114 193 125 207 78 C214 54 203 35 184 26"
            fill="none"
            stroke="url(#hl-artisan-ink)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="9"
          />
          <path
            className="hl-artisan-steam"
            d="M116 22 C95 8 83 25 99 36 C116 48 148 34 134 14"
            fill="none"
            stroke="url(#hl-artisan-ink)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="8"
          />
          <circle cx="116" cy="22" fill="#563722" r="6" />
          <circle cx="134" cy="51" fill="#563722" r="6" />
        </g>

        <path
          className="hl-artisan-stream"
          d="M64 118 C84 113 103 109 123 98"
          fill="none"
          stroke="#6b4a35"
          strokeLinecap="round"
          strokeWidth="3.5"
        />

        <g fill="none" stroke="#3b2619" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 126 C36 132 60 132 78 126" strokeWidth="3.5" />
          <path d="M28 126 C29 145 66 145 69 126" strokeWidth="3.5" />
          <path d="M32 146 C43 153 57 153 68 146" strokeWidth="3" />
        </g>

        {showSeal && !isMark ? (
          <g transform="translate(224 118)">
            <rect fill="none" height="40" rx="2" stroke="#9b1d1f" strokeWidth="3" width="28" />
            <text
              fill="#9b1d1f"
              fontFamily="serif"
              fontSize="15"
              fontWeight="700"
              textAnchor="middle"
              x="14"
              y="17"
            >
              北
            </text>
            <text
              fill="#9b1d1f"
              fontFamily="serif"
              fontSize="15"
              fontWeight="700"
              textAnchor="middle"
              x="14"
              y="33"
            >
              京
            </text>
          </g>
        ) : null}
      </g>

      {!isMark ? (
        <g fill="#2a211b" textAnchor="middle">
          <text
            className="premium-display"
            fontFamily="Georgia, Times New Roman, serif"
            fontSize={isWordmark ? 34 : 42}
            letterSpacing={isWordmark ? 14 : 20}
            x="260"
            y={isWordmark ? 98 : 224}
          >
            H &amp; L ARTISAN
          </text>
          {!isWordmark ? (
            <>
              <line stroke="#6b4a35" strokeWidth="1.5" x1="152" x2="188" y1="264" y2="264" />
              <text
                fill="#6b4a35"
                fontFamily="Arial, sans-serif"
                fontSize="15"
                fontWeight="500"
                letterSpacing="10"
                x="260"
                y="270"
              >
                Crafted with Care
              </text>
              <line stroke="#6b4a35" strokeWidth="1.5" x1="334" x2="368" y1="264" y2="264" />
              <text
                fill="#3b312a"
                fontFamily="Arial, sans-serif"
                fontSize="15"
                fontWeight="700"
                letterSpacing="13"
                x="260"
                y="318"
              >
                BEIJING
              </text>
            </>
          ) : null}
        </g>
      ) : null}
    </svg>
  );
}

export function HLArtisanSeal({ className = "" }: { className?: string }) {
  return (
    <svg aria-label="Beijing seal" className={className} role="img" viewBox="0 0 36 48" xmlns="http://www.w3.org/2000/svg">
      <rect fill="none" height="42" rx="3" stroke="#9b1d1f" strokeWidth="3" width="30" x="3" y="3" />
      <text fill="#9b1d1f" fontFamily="serif" fontSize="16" fontWeight="700" textAnchor="middle" x="18" y="21">
        北
      </text>
      <text fill="#9b1d1f" fontFamily="serif" fontSize="16" fontWeight="700" textAnchor="middle" x="18" y="38">
        京
      </text>
    </svg>
  );
}

export function HLArtisanDivider({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={["flex items-center justify-center gap-4 text-[#6b4a35]", className].join(" ")}>
      <span className="h-px w-10 bg-current" />
      <HLArtisanSeal className="h-8 w-6 shrink-0" />
      <span className="h-px w-10 bg-current" />
    </div>
  );
}
