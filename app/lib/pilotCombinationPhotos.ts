import type {
  PilotFrameId,
  PilotMatteId,
  SelectablePilotMatteId,
} from './pilotSelection'

// Exact case-sensitive filenames under public/pilot-materials/combinations/.
// Do not composite, crop or geometrically transform the source photographs.
export const pilotCombinationPhotos = {
  'light-oak': {
    beige: '/pilot-materials/combinations/OakBeige.png',
    'new-castle': '/pilot-materials/combinations/OakGrey.png',
    sanguine: '/pilot-materials/combinations/OakRed.png',
    green: '/pilot-materials/combinations/OakGreen.png',
    'solid-black': '/pilot-materials/combinations/OakBlack.png',
  },
  'american-walnut': {
    beige: '/pilot-materials/combinations/WalnutBeige.png',
    'new-castle': '/pilot-materials/combinations/WalnutGrey.png',
    sanguine: '/pilot-materials/combinations/WalnutRed.png',
    green: '/pilot-materials/combinations/WalnutGreen.png',
    'solid-black': '/pilot-materials/combinations/WalnutBlack.png',
  },
  'dark-charcoal': {
    beige: '/pilot-materials/combinations/CharBeige.png',
    'new-castle': '/pilot-materials/combinations/CharGrey.png',
    sanguine: '/pilot-materials/combinations/CharRed.png',
    green: '/pilot-materials/combinations/CharGreen.png',
    'solid-black': '/pilot-materials/combinations/CharBlack.png',
  },
} satisfies Record<PilotFrameId, Record<SelectablePilotMatteId, string>>

export function pilotCombinationPhoto(frameId: PilotFrameId, matteId: PilotMatteId): string | null {
  const photos = pilotCombinationPhotos[frameId] as Partial<Record<PilotMatteId, string>>
  return photos[matteId] ?? null
}
