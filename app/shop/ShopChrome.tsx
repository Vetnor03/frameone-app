import Image from "next/image";
import ShopCartCount from "./ShopCartCount";
import ShopLanguageSelector from "./ShopLanguageSelector";
import NewsletterForm from "./NewsletterForm";
import { formatNok } from "./productData";

type ShopChromeProps = {
  language: "en" | "no";
  shippingThreshold?: string;
  activeSection?: "configure" | "frames" | "mattes" | "bundles";
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
    href: "https://www.facebook.com/share/17qNkCjSz6/?mibextid=wwXIfr",
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

export function ShopHeader({ language, shippingThreshold = formatNok(1000, language), activeSection }: ShopChromeProps) {
  const topShipping = shippingThreshold;
  const shopHref = (path: string) => `${path}?lang=${language}`;
  const navigationLabels = language === "no"
    ? { frames: "Rammer", mattes: "Innlegg", bundles: "Pakker", about: "Om oss" }
    : { frames: "Frames", mattes: "Mattes", bundles: "Bundles", about: "About" };

  return (
    <div className="sticky top-0 z-50">
      <div className="bg-[#0b0d10] text-[11px] text-white">
        <div className="mx-auto flex max-w-[1200px] items-center justify-center gap-3 px-6 py-2 tracking-[0.02em] sm:gap-5">
          <span>
            {language === "no"
              ? `Gratis frakt over ${topShipping}`
              : `Free shipping over ${topShipping}`}
          </span>
          <span className="h-3 w-px bg-white/35" aria-hidden />
          <span>{language === "no" ? "30 dager åpent kjøp" : "30 day returns"}</span>
          <span className="h-3 w-px bg-white/35" aria-hidden />
          <span>{language === "no" ? "5 års garanti" : "5 year warranty"}</span>
        </div>
      </div>

      <header className="border-b border-black/10 bg-[#faf9f7]">
        <div className="mx-auto max-w-[1200px] px-6 py-6 md:px-14">
          <div className="relative flex items-center justify-between md:justify-center">
            <a
              href={shopHref("/shop")}
              className="text-[29px] font-medium tracking-[0.28em] md:absolute md:left-0"
            >
              RE:MIND
            </a>
            <nav className="hidden items-center justify-center gap-10 text-sm uppercase tracking-[0.09em] md:flex shop-nav">
              <a href={shopHref("/shop/configure")} className={`pb-1 ${activeSection === "configure" ? "border-b-2 border-black" : ""}`}>
                RE:MIND
              </a>
              <a href={shopHref("/shop/frames")} className={`pb-1 ${activeSection === "frames" ? "border-b-2 border-black" : ""}`}>
                {navigationLabels.frames}
              </a>
              <a href={shopHref("/shop/mattes")} className={`pb-1 ${activeSection === "mattes" ? "border-b-2 border-black" : ""}`}>
                {navigationLabels.mattes}
              </a>
              <a href={shopHref("/shop/bundles")} className={`pb-1 ${activeSection === "bundles" ? "border-b-2 border-black" : ""}`}>
                {navigationLabels.bundles}
              </a>
              <a href={shopHref("/shop/about")} className="pb-1">
                {navigationLabels.about}
              </a>
            </nav>
            <div className="absolute right-0 flex items-center md:right-0">
              <a
                href={shopHref("/shop/cart")}
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
              </a>
            </div>
          </div>
          <nav
            aria-label="Shop pages"
            className="shop-nav flex items-center justify-between gap-2 pt-5 text-[10px] uppercase tracking-[0.06em] md:hidden"
          >
            <a href={shopHref("/shop/configure")} className={`pb-1 ${activeSection === "configure" ? "border-b-2 border-black" : ""}`}>
              RE:MIND
            </a>
            <a href={shopHref("/shop/frames")} className={`pb-1 ${activeSection === "frames" ? "border-b-2 border-black" : ""}`}>
              {navigationLabels.frames}
            </a>
            <a href={shopHref("/shop/mattes")} className={`pb-1 ${activeSection === "mattes" ? "border-b-2 border-black" : ""}`}>
              {navigationLabels.mattes}
            </a>
            <a href={shopHref("/shop/bundles")} className={`pb-1 ${activeSection === "bundles" ? "border-b-2 border-black" : ""}`}>
              {navigationLabels.bundles}
            </a>
            <a href={shopHref("/shop/about")} className="pb-1">
              {navigationLabels.about}
            </a>
          </nav>
        </div>
      </header>
    </div>
  );
}

export function ShopFooter({ language, shippingThreshold = formatNok(1000, language) }: ShopChromeProps) {
  const shopHref = (path: string) => `${path}?lang=${language}`;
  const navigationLabels = language === "no"
    ? { frames: "Rammer", mattes: "Innlegg", bundles: "Pakker", about: "Om oss" }
    : { frames: "Frames", mattes: "Mattes", bundles: "Bundles", about: "About" };
  const footerBenefits = language === "no" ? [
    {
      title: "Gratis frakt",
      body: `For bestillinger over ${shippingThreshold}`,
      iconSrc: "/shop/icons/footer/free-shipping.png",
      iconAlt: "Delivery truck icon",
    },
    {
      title: "30 dager åpent kjøp",
      body: "Krever ingen begrunnelse",
      iconSrc: "/shop/icons/footer/returns-30-day.png",
      iconAlt: "Circular arrows return icon",
    },
    {
      title: "5 års garanti",
      body: "Ingen bekymringer",
      iconSrc: "/shop/icons/footer/warranty-2-year.png",
      iconAlt: "Shield warranty icon",
    },
  ] : [
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
      title: "5 YEAR WARRANTY",
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
            {language === "no" ? (
              <>
                Det du trenger, når du trenger det.
                <br />
                Tilpasset deg og
                <br />
                din hverdag.
              </>
            ) : (
              <>
                RE:MIND gives you what matters,
                <br />
                beautifully displayed. Less screen time.
                <br />
                More presence.
              </>
            )}
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
            <a href={shopHref("/shop/configure")} className="shop-footer-link block">
              RE:MIND
            </a>
            <a href={shopHref("/shop/frames")} className="shop-footer-link block">
              {navigationLabels.frames}
            </a>
            <a href={shopHref("/shop/mattes")} className="shop-footer-link block">
              {navigationLabels.mattes}
            </a>
            <a href={shopHref("/shop/bundles")} className="shop-footer-link block">
              {navigationLabels.bundles}
            </a>
          </div>
        </div>
        <div>
          <p className="mb-3 font-medium">SUPPORT</p>
          <div className="space-y-1.5 leading-[1.4]">
            <a href={shopHref("/shop/faq")} className="shop-footer-link block">
              FAQ
            </a>
            <a href={shopHref("/shop/shipping")} className="shop-footer-link block">
              Shipping
            </a>
            <a href={shopHref("/shop/returns")} className="shop-footer-link block">
              Returns
            </a>
            <a href={shopHref("/shop/warranty")} className="shop-footer-link block">
              Warranty
            </a>
          </div>
        </div>
        <div>
          <p className="mb-3 font-medium">COMPANY</p>
          <div className="space-y-1.5 leading-[1.4]">
            <a href={shopHref("/shop/about")} className="shop-footer-link block">
              {navigationLabels.about}
            </a>
            <a href={shopHref("/shop/sustainability")} className="shop-footer-link block">
              Sustainability
            </a>
            <a href={shopHref("/shop/contact")} className="shop-footer-link block">
              Contact
            </a>
            <a href={shopHref("/shop/press")} className="shop-footer-link block">
              Press
            </a>
          </div>
        </div>
        <div id="waitlist" className="scroll-mt-32">
          <p className="mb-3 font-medium">STAY IN THE LOOP</p>
          <p className="max-w-[30ch] leading-[1.45] text-black/65">
            New frames, updates and ideas.
          </p>
          <NewsletterForm />
        </div>
      </div>
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-3 border-t border-black/10 px-6 py-4 text-xs text-black/60 sm:grid-cols-3">
        <p>© 2026 RE:MIND. All rights reserved.</p>
        <div className="tab-scroll flex min-w-0 items-center justify-start gap-6 overflow-x-auto whitespace-nowrap sm:justify-center">
          <a href={`/terms?from=shop&lang=${language}`} className="shop-footer-link shrink-0">
            Terms
          </a>
          <a href={`/privacy?from=shop&lang=${language}`} className="shop-footer-link shrink-0">
            Privacy
          </a>
          <a href={`/cookies?from=shop&lang=${language}`} className="shop-footer-link shrink-0">
            Cookies
          </a>
        </div>
        <div className="flex justify-start sm:justify-end">
          <ShopLanguageSelector language={language} />
        </div>
      </div>
    </footer>
  );
}
