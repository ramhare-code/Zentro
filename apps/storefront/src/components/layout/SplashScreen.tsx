import { SITE_NAME } from "@/lib/site";

/**
 * Brief animated logo intro, shown once per browser session. The inline script
 * runs before the overlay is parsed, so returning visitors never see a flash.
 * Pure CSS: it never blocks taps (pointer-events: none) and is skipped for
 * people who prefer reduced motion.
 */
const SEEN_SCRIPT = `try{if(sessionStorage.getItem("zentro-splash")){document.documentElement.classList.add("splash-seen")}else{sessionStorage.setItem("zentro-splash","1")}}catch(e){}`;

export function SplashScreen() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SEEN_SCRIPT }} />
      <div className="splash" aria-hidden="true">
        <div className="splash-inner">
          <span className="splash-mark">Z</span>
          <span className="splash-word">{SITE_NAME}</span>
        </div>
      </div>
    </>
  );
}
