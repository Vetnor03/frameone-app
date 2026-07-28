import type { Metadata } from 'next'
import ShopLegalPage from '../../components/ShopLegalPage'

export const metadata: Metadata = {
  title: '5 Year Warranty | RE:MIND',
  description: 'Details of the 5-year limited RE:MIND product warranty.',
}

export default function WarrantyPage() {
  return (
    <ShopLegalPage
      title="5 YEAR WARRANTY"
      updatedText="Built to stay."
      sections={[
        {
          title: 'Built to stay',
          text: (
            <div className="space-y-4">
              <p>Every RE:MIND display is backed by our 5-year limited warranty.</p>
              <p>If your RE:MIND develops a fault caused by a manufacturing or material defect during normal use, we&apos;ll work with you to make it right.</p>
            </div>
          ),
        },
        {
          title: "What's covered",
          text: (
            <div className="space-y-4">
              <p>The warranty covers defects in materials and workmanship affecting the normal operation of the RE:MIND device during the 5-year warranty period.</p>
              <p>Depending on the issue, RE:MIND may repair the product, replace the affected component, or replace the device.</p>
            </div>
          ),
        },
        {
          title: "What's not covered",
          text: (
            <div>
              <p>The commercial warranty does not cover:</p>
              <ul className="mt-4 list-disc space-y-1 pl-5">
                <li>Accidental or physical damage</li>
                <li>Damage caused by misuse or improper handling</li>
                <li>Damage caused by unauthorized modifications or repairs</li>
                <li>Normal cosmetic wear</li>
                <li>Consumable or replaceable accessories where the issue is normal wear</li>
                <li>Normal battery capacity degradation caused by aging and use</li>
                <li>Damage caused by use outside the product&apos;s intended operating conditions</li>
              </ul>
            </div>
          ),
        },
        {
          title: 'Battery replacement',
          text: (
            <div className="space-y-4">
              <p className="font-medium text-black/80">Made to keep going.</p>
              <p>Batteries naturally lose capacity as they age. Normal battery degradation is therefore not considered a defect under our 5-year limited warranty.</p>
              <p>But an aging battery shouldn&apos;t mean replacing your RE:MIND.</p>
              <p>If the battery eventually reaches the end of its useful life, we intend to offer a low-cost battery replacement service so you can keep using your existing RE:MIND rather than replacing the entire product.</p>
              <p>A premature battery fault is different from normal battery aging and may be covered by the RE:MIND warranty and/or applicable statutory consumer rights.</p>
            </div>
          ),
        },
        {
          title: 'Your consumer rights',
          text: (
            <div className="space-y-4">
              <p>Our 5-year warranty is provided in addition to your statutory consumer rights.</p>
              <p>Nothing in this warranty limits, replaces or reduces any rights you may have under applicable consumer protection law, including Norwegian consumer law where applicable.</p>
            </div>
          ),
        },
        {
          title: 'Need help?',
          text: (
            <div className="space-y-4">
              <p>If something isn&apos;t working as it should, contact us at <a className="underline underline-offset-4" href="mailto:support@re-mind.no">support@re-mind.no</a> with your order information and a short description of the problem.</p>
              <p>Photos or additional information may be requested where useful to diagnose the issue.</p>
              <p>We&apos;ll help determine the appropriate next step.</p>
            </div>
          ),
        },
      ]}
    />
  )
}
