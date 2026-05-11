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
        <div
          style={{
            position: 'absolute',
            left: px(250),
            top: px(185),
            width: px(524),
            height: px(528),
            border: `${px(24)}px solid ${WHITE}`,
            boxShadow: `0 ${px(4)}px ${px(8)}px rgba(0, 0, 0, 0.38)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: px(318),
            top: px(382),
            width: px(124),
            height: px(334),
            borderLeft: `${px(24)}px solid ${WHITE}`,
            borderTop: `${px(24)}px solid ${WHITE}`,
            borderBottom: `${px(24)}px solid ${WHITE}`,
            boxShadow: `0 ${px(4)}px ${px(8)}px rgba(0, 0, 0, 0.38)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: px(420),
            top: px(382),
            width: px(155),
            height: px(200),
            borderTop: `${px(24)}px solid ${WHITE}`,
            borderRight: `${px(24)}px solid ${WHITE}`,
            borderBottom: `${px(24)}px solid ${WHITE}`,
            borderTopRightRadius: px(105),
            borderBottomRightRadius: px(105),
            boxShadow: `0 ${px(4)}px ${px(8)}px rgba(0, 0, 0, 0.38)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: px(447),
            top: px(639),
            width: px(171),
            height: px(24),
            background: WHITE,
            transform: 'rotate(58deg)',
            transformOrigin: 'left center',
            boxShadow: `0 ${px(4)}px ${px(8)}px rgba(0, 0, 0, 0.38)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: px(528),
            top: px(689),
            width: px(246),
            height: px(24),
            background: WHITE,
            boxShadow: `0 ${px(4)}px ${px(8)}px rgba(0, 0, 0, 0.38)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: px(610),
            top: px(556),
            color: WHITE,
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: px(116),
            fontWeight: 700,
            lineHeight: 1,
            textShadow: `0 ${px(4)}px ${px(8)}px rgba(0, 0, 0, 0.38)`,
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
              textShadow: `0 ${px(4)}px ${px(8)}px rgba(0, 0, 0, 0.38)`,
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
