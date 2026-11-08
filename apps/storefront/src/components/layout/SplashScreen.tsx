import { SplashIntro } from "./SplashIntro";

/**
 * Decides before first paint whether this visit plays the intro: once per
 * browser session, never with reduced motion. The overlay only shows while
 * <html> has the `intro-playing` class, so returning pages never flash it.
 */
const DECIDE = `try{var d=document.documentElement;if(!sessionStorage.getItem("zentro-intro")&&!matchMedia("(prefers-reduced-motion: reduce)").matches){d.classList.add("intro-playing")}sessionStorage.setItem("zentro-intro","1")}catch(e){}`;

export function SplashScreen() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: DECIDE }} />
      <SplashIntro />
    </>
  );
}
