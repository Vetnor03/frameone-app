'use client'

// Both engravings use only the inherited foreground ink, echoing the e-paper
// renderer's 1-bit line work. Decorative marks never communicate new facts.
export function EditorialBotanicalSprig() {
  return <svg viewBox="0 0 108 70" width="100%" height="100%" fill="none" stroke="currentColor"
    strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M54 67 L52 38 L56 8 M54 53 L34 41 L25 32 L42 46 L54 53
      M54 42 L73 30 L86 18 L66 36 L54 42 M53 31 L36 23 L27 12 L45 28 L53 31
      M52 39 L37 32 L29 37 L41 37 L52 39 M54 51 L72 44 L82 49 L68 49 L54 51"/>
    <path d="M34 41 Q21 26 25 32 Q40 27 42 46 M73 30 Q79 12 86 18 Q92 29 66 36
      M36 23 Q24 11 27 12 Q36 7 45 28 M72 44 Q90 42 82 49 Q81 57 68 49"/>
    <path d="M47 67 H61"/>
  </svg>
}

export function EditorialWeatherLandscape({wmo}: {wmo:number|null|undefined}) {
  const condition = Number(wmo ?? 3)
  const rainy = (condition >= 51 && condition <= 67) ||
    (condition >= 80 && condition <= 82) || condition >= 95
  const snowy = condition >= 71 && condition <= 77
  const overcast = condition >= 3 && !rainy && !snowy
  const showSun = !overcast && !rainy && !snowy
  const showCloud = condition >= 2 || overcast || rainy || snowy

  return <svg viewBox="0 0 124 86" width="100%" height="100%" fill="none"
    stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true">
    {showSun && <g>
      <circle cx="31" cy="24" r="11"/>
      <path d="M11 24 H17 M45 24 H51 M31 4 V10 M31 38 V44"/>
    </g>}
    {showCloud && <g>
      <path d="M45 41 H88 M45 41 A9 9 0 0 1 54 36 A13 13 0 0 1 82 33
        A8 8 0 0 1 88 41"/>
      {rainy && <path d="M58 51 L54 59 M71 51 L67 59 M84 51 L80 59" />}
      {snowy && <path d="M56 54 L62 60 M62 54 L56 60 M70 54 L76 60 M76 54 L70 60" />}
    </g>}
    <path d="M4 57 L25 48 L41 53 L62 40 L82 53 L120 57
      M4 63 H120 M11 70 H41 M62 70 H111"/>
  </svg>
}
