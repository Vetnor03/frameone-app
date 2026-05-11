import { ImageResponse } from 'next/og'

const BACKGROUND = 'radial-gradient(circle at 52% 48%, #071d27 0%, #04141e 52%, #010913 100%)'
const WHITE = '#f8fafc'

export function createRemindIconImageResponse(size: number) {
  const scale = size / 1024

  const px = (value: number) => value * scale

  return new ImageResponse(
    (
      <div
        style={{
          position: 'relative',
          display: 'flex',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          background: BACKGROUND,
        }}
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 1024 1024"
          xmlns="http://www.w3.org/2000/svg"
          style={{ position: 'absolute', inset: 0 }}
        >
          <defs>
            <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000" floodOpacity="0.38" />
            </filter>
          </defs>
          <g filter="url(#softShadow)">
            <rect x="250" y="185" width="524" height="528" fill="none" stroke={WHITE} strokeWidth="24" />
            <path
              d="M318 716V382H442C526 382 575 424 575 485C575 548 526 582 444 582H318"
              fill="none"
              stroke={WHITE}
              strokeWidth="24"
              strokeLinecap="square"
              strokeLinejoin="miter"
            />
            <path
              d="M376 582L484 713H774"
              fill="none"
              stroke={WHITE}
              strokeWidth="24"
              strokeLinecap="square"
              strokeLinejoin="miter"
            />
          </g>
        </svg>
        <div
          style={{
            position: 'absolute',
            left: px(606),
            top: px(556),
            color: WHITE,
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: px(116),
            fontWeight: 700,
            lineHeight: 1,
            textShadow: `0 0 ${px(4)}px rgba(255, 255, 255, 0.32), 0 ${px(4)}px ${px(8)}px rgba(0, 0, 0, 0.38)`,
          }}
        >
          e
        </div>
        {['m', 'i', 'n', 'd'].map((letter, index) => (
          <div
            key={letter}
            style={{
              position: 'absolute',
              left: px(265 + index * 160),
              top: px(742),
              color: WHITE,
              fontFamily: 'Arial, Helvetica, sans-serif',
              fontSize: px(88),
              fontWeight: 500,
              lineHeight: 1,
              textShadow: `0 0 ${px(4)}px rgba(255, 255, 255, 0.32), 0 ${px(4)}px ${px(8)}px rgba(0, 0, 0, 0.38)`,
            }}
          >
            {letter}
          </div>
        ))}
      </div>
    ),
    {
      width: size,
      height: size,
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    }
  )
}
