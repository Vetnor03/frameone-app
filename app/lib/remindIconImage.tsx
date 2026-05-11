import { ImageResponse } from 'next/og'

const BACKGROUND = 'radial-gradient(circle at 50% 42%, #082636 0%, #041620 54%, #010913 100%)'
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
        <div
          style={{
            position: 'absolute',
            left: px(242),
            top: px(150),
            width: px(540),
            height: px(540),
            border: `${px(26)}px solid ${WHITE}`,
            boxShadow: `0 ${px(8)}px ${px(18)}px rgba(0, 0, 0, 0.36)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: px(344),
            top: px(332),
            width: px(132),
            height: px(318),
            borderLeft: `${px(26)}px solid ${WHITE}`,
            borderTop: `${px(26)}px solid ${WHITE}`,
            borderBottom: `${px(26)}px solid ${WHITE}`,
            boxShadow: `0 ${px(8)}px ${px(18)}px rgba(0, 0, 0, 0.36)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: px(450),
            top: px(332),
            width: px(184),
            height: px(190),
            borderTop: `${px(26)}px solid ${WHITE}`,
            borderRight: `${px(26)}px solid ${WHITE}`,
            borderBottom: `${px(26)}px solid ${WHITE}`,
            borderTopRightRadius: px(102),
            borderBottomRightRadius: px(102),
            boxShadow: `0 ${px(8)}px ${px(18)}px rgba(0, 0, 0, 0.36)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: px(472),
            top: px(552),
            width: px(188),
            height: px(26),
            background: WHITE,
            transform: 'rotate(52deg)',
            transformOrigin: 'left center',
            boxShadow: `0 ${px(8)}px ${px(18)}px rgba(0, 0, 0, 0.36)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: px(626),
            top: px(552),
            color: WHITE,
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: px(126),
            fontWeight: 700,
            lineHeight: 1,
            textShadow: `0 ${px(8)}px ${px(18)}px rgba(0, 0, 0, 0.36)`,
          }}
        >
          e
        </div>
        <div
          style={{
            position: 'absolute',
            left: px(0),
            top: px(768),
            width: px(1024),
            color: WHITE,
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: px(86),
            fontWeight: 600,
            lineHeight: 1,
            display: 'flex',
            justifyContent: 'center',
            textAlign: 'center',
            letterSpacing: px(1),
            textShadow: `0 ${px(8)}px ${px(18)}px rgba(0, 0, 0, 0.36)`,
          }}
        >
          Re-mind
        </div>
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
