import type {
  PilotFrameId,
  PilotMatteId,
  SelectablePilotMatteId,
} from './pilotSelection'

// Exact case-sensitive filenames under public/pilot-materials/combinations/.
// Do not composite, crop or geometrically transform the source photographs.
export const pilotCombinationPhotos = {
  'light-oak': {
    beige: '/pilot-materials/combinations/OakBeige.jpg',
    'new-castle': '/pilot-materials/combinations/OakGrey.jpg',
    sanguine: '/pilot-materials/combinations/OakRed.jpg',
    green: '/pilot-materials/combinations/OakGreen.jpg',
    'solid-black': '/pilot-materials/combinations/OakBlack.jpg',
  },
  'american-walnut': {
    beige: '/pilot-materials/combinations/WalnutBeige.jpg',
    'new-castle': '/pilot-materials/combinations/WalnutGrey.jpg',
    sanguine: '/pilot-materials/combinations/WalnutRed.jpg',
    green: '/pilot-materials/combinations/WalnutGreen.jpg',
    'solid-black': '/pilot-materials/combinations/WalnutBlack.jpg',
  },
  'dark-charcoal': {
    beige: '/pilot-materials/combinations/CharBeige.jpg',
    'new-castle': '/pilot-materials/combinations/CharGrey.jpg',
    sanguine: '/pilot-materials/combinations/CharRed.jpg',
    green: '/pilot-materials/combinations/CharGreen.jpg',
    'solid-black': '/pilot-materials/combinations/CharBlack.jpg',
  },
} satisfies Record<PilotFrameId, Record<SelectablePilotMatteId, string>>

export function pilotCombinationPhoto(frameId: PilotFrameId, matteId: PilotMatteId): string | null {
  const photos = pilotCombinationPhotos[frameId] as Partial<Record<PilotMatteId, string>>
  return photos[matteId] ?? null
}
