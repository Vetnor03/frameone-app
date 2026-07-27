import Image from "next/image";
import ShopCartCount from "./ShopCartCount";
import ShopLocaleCurrencySelector from "./ShopLocaleCurrencySelector";
import { ShopMobileMenu } from "./ShopMotion";
import WaitlistForm from "./WaitlistForm";
import { formatNok } from "./productData";

type ShopChromeProps = {
  language: "en" | "no";
  currency: "NOK";
  shippingThreshold?: string;
  activeSection?: "frames" | "mattes";
};

const socialLinks = [
  {
    name: "Instagram",
    href: "#",
    iconSrc: "/shop/icons/social/instagram.png",
    iconWidth: 1024,
    iconHeight: 1024,
  },
  {
    name: "Facebook",
    href: "#",
    iconSrc: "/shop/icons/social/facebook.png",
    iconWidth: 1024,
    iconHeight: 1024,
  },
  {
    name: "Pinterest",
    href: "#",
    iconSrc: "/shop/icons/social/pinterest.png",
    iconWidth: 1536,
    iconHeight: 1024,
  },
] as const;

export function ShopHeader({ language, shippingThreshold = formatNok(1000), activeSection }: ShopChromeProps) {
  const topShipping = shippingThreshold;

  return (
    <>
      <div className="bg-[#0b0d10] text-[11px] text-white">
        <div className="mx-auto flex max-w-[1200px] items-center justify-center gap-3 px-6 py-2 tracking-[0.02em] sm:gap-5">
          <span>
            {language === "no"
              ? `Gratis frakt over ${topShipping}`
              : `Free shipping over ${topShipping}`}
          </span>
          <span className="h-3 w-px bg-white/35" aria-hidden />
          <span>30 day returns</span>
          <span className="h-3 w-px bg-white/35" aria-hidden />
          <span>2 year warranty</span>
        </div>
      </div>

      <header className="border-b border-black/10 bg-[#faf9f7]">
        <div className="mx-auto max-w-[1200px] px-6 py-6 md:px-14">
          <div className="relative flex items-center justify-between md:justify-center">
            <a
              href="https://re-mind.no/shop"
              className="text-[29px] font-medium tracking-[0.28em] md:absolute md:left-0"
            >
              RE:MIND
            </a>
            <nav className="hidden items-center justify-center gap-10 text-sm uppercase tracking-[0.09em] md:flex shop-nav">
              <a href="/shop/frames" className={`pb-1 ${activeSection === "frames" ? "border-b-2 border-black" : ""}`}>
                Frames
              </a>
              <a href="/shop/mattes" className={`pb-1 ${activeSection === "mattes" ? "border-b-2 border-black" : ""}`}>
                Mattes
              </a>
              <a href="/shop#accessories" className="pb-1">
                Accessories
              </a>
              <a href="/shop#bundles" className="pb-1">
                Bundles
              </a>
              <a href="/shop#about" className="pb-1">
                About
              </a>
            </nav>
            <div className="hidden items-center gap-2 md:absolute md:right-0 md:flex">
              <button
                type="button"
                aria-label="Open profile"
                className="shop-icon-button inline-flex items-center justify-center p-1 text-black/75"
              >
                <Image
                  src="/shop/icons/header/profile.png"
                  alt=""
                  aria-hidden
                  width={36}
                  height={36}
                  className="h-9 w-9 object-contain"
                />
              </button>
              <button
                type="button"
                aria-label="Open shopping cart"
                className="shop-icon-button relative inline-flex items-center justify-center p-1 text-black/75"
              >
                <Image
                  src="/shop/icons/header/cart.png"
                  alt=""
                  aria-hidden
                  width={44}
                  height={44}
                  className="h-11 w-11 object-contain"
                />
                <ShopCartCount />
              </button>
            </div>
          </div>
          <div className="pt-4 md:hidden">
            <ShopMobileMenu>
              <nav className="shop-nav flex flex-col items-start gap-3 text-left text-sm uppercase tracking-[0.09em]">
                <a href="/shop/frames" className={`pb-1 ${activeSection === "frames" ? "border-b-2 border-black" : ""}`}>
                  Frames
                </a>
                <a href="/shop/mattes" className={`pb-1 ${activeSection === "mattes" ? "border-b-2 border-black" : ""}`}>
                  Mattes
                </a>
                <a href="/shop#accessories" className="pb-1">
                  Accessories
                </a>
                <a href="/shop#bundles" className="pb-1">
                  Bundles
                </a>
                <a href="/shop#about" className="pb-1">
                  About
                </a>
              </nav>
            </ShopMobileMenu>
          </div>
        </div>
      </header>
    </>
  );
}

export function ShopFooter({ language, currency, shippingThreshold = formatNok(1000) }: ShopChromeProps) {
  const footerBenefits = [
    {
      title: "FREE SHIPPING",
      body: `On orders over ${shippingThreshold}`,
      iconSrc: "/shop/icons/footer/free-shipping.png",
      iconAlt: "Delivery truck icon",
    },
    {
      title: "30 DAY RETURNS",
      body: "No questions asked",
      iconSrc: "/shop/icons/footer/returns-30-day.png",
      iconAlt: "Circular arrows return icon",
    },
    {
      title: "2 YEAR WARRANTY",
      body: "Peace of mind",
      iconSrc: "/shop/icons/footer/warranty-2-year.png",
      iconAlt: "Shield warranty icon",
    },
  ];

  return (
    <footer id="about" className="border-t border-black/10 bg-white">
      <div className="border-b border-black/10 bg-[#faf9f7]">
        <div className="mx-auto grid max-w-[1200px] gap-5 px-6 py-5 text-sm sm:grid-cols-3">
          {footerBenefits.map((item) => (
            <article key={item.title} className="flex items-center gap-4">
              <Image
                src={item.iconSrc}
                alt={item.iconAlt}
                width={48}
                height={48}
                className="h-12 w-12 shrink-0 opacity-70"
              />
              <p>
                {item.title}
                <br />
                <span className="text-black/60">{item.body}</span>
              </p>
            </article>
          ))}
        </div>
      </div>
      <div className="mx-auto grid max-w-[1200px] gap-x-8 gap-y-9 px-6 py-10 text-sm sm:grid-cols-2 lg:grid-cols-[1.35fr_0.78fr_0.78fr_0.78fr_1.25fr]">
        <div className="pr-4 lg:pr-10">
          <p className="mb-3 font-bold tracking-[0.2em]">RE:MIND</p>
          <p className="max-w-[34ch] leading-[1.55] text-black/65">
            RE:MIND gives you what matters,
            <br />
            beautifully displayed. Less screen time.
            <br />
            More presence.
          </p>
          <div className="mt-6 flex items-center gap-5">
            {socialLinks.map((item) => (
              <a
                key={item.name}
                href={item.href}
                aria-label={item.name}
                className="shop-social-link inline-flex h-8 w-8 items-center justify-center opacity-75"
              >
                <Image
                  src={item.iconSrc}
                  alt={item.name}
                  width={item.iconWidth}
                  height={item.iconHeight}
                  className="h-6 w-auto"
                />
              </a>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-3 font-medium">SHOP</p>
          <div className="space-y-1.5 leading-[1.4]">
            <a href="/shop#frames" className="shop-footer-link block">
              Frames
            </a>
            <a href="/shop#mattes" className="shop-footer-link block">
              Mattes
            </a>
            <a href="/shop#accessories" className="shop-footer-link block">
              Accessories
            </a>
            <a href="/shop#bundles" className="shop-footer-link block">
              Bundles
            </a>
          </div>
        </div>
        <div>
          <p className="mb-3 font-medium">SUPPORT</p>
          <div className="space-y-1.5 leading-[1.4]">
            <a href="#" className="shop-footer-link block">
              FAQ
            </a>
            <a href="#" className="shop-footer-link block">
              Shipping
            </a>
            <a href="#" className="shop-footer-link block">
              Returns
            </a>
            <a href="#" className="shop-footer-link block">
              Warranty
            </a>
          </div>
        </div>
        <div>
          <p className="mb-3 font-medium">COMPANY</p>
          <div className="space-y-1.5 leading-[1.4]">
            <a href="/shop#about" className="shop-footer-link block">
              About
            </a>
            <a href="#" className="shop-footer-link block">
              Sustainability
            </a>
            <a href="#" className="shop-footer-link block">
              Contact
            </a>
            <a href="#" className="shop-footer-link block">
              Press
            </a>
          </div>
        </div>
        <div>
          <p className="mb-3 font-medium">STAY IN THE LOOP</p>
          <p className="max-w-[30ch] leading-[1.45] text-black/65">
            New frames, updates and ideas.
          </p>
          <WaitlistForm compact source="shop-footer" />
        </div>
      </div>
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-3 border-t border-black/10 px-6 py-4 text-xs text-black/60 sm:grid-cols-3">
        <p>© 2026 RE:MIND. All rights reserved.</p>
        <div className="flex items-center justify-center gap-6">
          <a href="/terms" className="shop-footer-link">
            Terms
          </a>
          <a href="/privacy" className="shop-footer-link">
            Privacy
          </a>
          <a href="/cookies" className="shop-footer-link">
            Cookies
          </a>
        </div>
        <div className="flex justify-start sm:justify-end">
          <ShopLocaleCurrencySelector language={language} currency={currency} />
        </div>
      </div>
    </footer>
  );
}
