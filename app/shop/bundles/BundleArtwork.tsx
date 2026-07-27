import type { ShopBundle } from '../bundleData'

export default function BundleArtwork({ bundle }: { bundle: ShopBundle }) {
  const pieces = bundle.frameCount + bundle.matteCount
  return (
    <div className="relative h-full w-full overflow-hidden bg-[radial-gradient(circle_at_35%_25%,#fff,#e8e3dc)]" aria-hidden="true">
      <div className="absolute inset-x-[20%] bottom-[12%] top-[16%] rounded-sm bg-[#d9d5cd] shadow-[0_18px_28px_rgba(0,0,0,.18)]">
        <div className="absolute inset-[7%] border-[14px] bg-[#262625]" style={{ borderColor: bundle.colors[0] }}>
          <div className="flex h-full items-center justify-center bg-[#252525] text-[9px] tracking-[.22em] text-white/80">RE:MIND</div>
        </div>
      </div>
      {Array.from({ length: Math.min(pieces, 5) }).map((_, index) => (
        <span key={index} className="absolute bottom-[8%] h-[42%] w-[29%] rounded-sm border-[8px] bg-[#ddd8cf] shadow-[0_8px_16px_rgba(0,0,0,.18)]" style={{ left: `${4 + index * 14}%`, borderColor: bundle.colors[index % bundle.colors.length], transform: `rotate(${index * 4 - 8}deg)` }} />
      ))}
    </div>
  )
}
