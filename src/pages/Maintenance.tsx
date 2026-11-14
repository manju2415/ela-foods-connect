import { useEffect } from "react";
import elaLogo from "@/assets/ela-foods-logo.png";

// Self-contained styles so this page looks the same regardless of theme or
// any global storefront CSS. Animations are disabled for reduced-motion users.
const styles = `
.mnt-root {
  --mnt-green: #1f9a3e;
  --mnt-green-deep: #146c2b;
  --mnt-gold: #f5b81c;
  --mnt-cream: #fffaf0;
  --mnt-ink: #2b1d12;
  --mnt-muted: #6b5a4a;
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(24px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom));
  background:
    radial-gradient(1200px 600px at 50% -10%, #fff3d6 0%, transparent 60%),
    linear-gradient(180deg, var(--mnt-cream) 0%, #fdf3e1 100%);
  color: var(--mnt-ink);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}
.mnt-orb { position: absolute; border-radius: 9999px; filter: blur(60px); opacity: .45; pointer-events: none; }
.mnt-orb--green { width: 420px; height: 420px; background: #8fd19e; top: -120px; left: -140px; animation: mnt-drift 18s ease-in-out infinite; }
.mnt-orb--gold  { width: 380px; height: 380px; background: #ffd36b; bottom: -140px; right: -120px; animation: mnt-drift 22s ease-in-out infinite reverse; }
.mnt-leaf-grid {
  position: absolute; inset: 0; pointer-events: none; opacity: .5;
  background-image: radial-gradient(rgba(31,154,62,.10) 1px, transparent 1px);
  background-size: 22px 22px;
  -webkit-mask-image: radial-gradient(ellipse at center, #000 30%, transparent 75%);
          mask-image: radial-gradient(ellipse at center, #000 30%, transparent 75%);
}
.mnt-card {
  position: relative; z-index: 1; width: 100%; max-width: 560px; text-align: center;
  padding: 44px 28px 36px;
  background: rgba(255,255,255,.72);
  -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
  border: 1px solid rgba(31,154,62,.14);
  border-radius: 28px;
  box-shadow: 0 30px 80px -30px rgba(43,29,18,.25), 0 2px 0 rgba(255,255,255,.8) inset;
  animation: mnt-rise .9s cubic-bezier(.2,.8,.2,1) both;
}
@media (min-width: 640px) { .mnt-card { padding: 56px 52px 44px; } }
.mnt-logo-wrap {
  position: relative; width: 132px; height: 132px; margin: 0 auto 28px;
  display: grid; place-items: center;
  animation: mnt-float 6s ease-in-out infinite;
}
.mnt-logo-wrap::before {
  content: ""; position: absolute; inset: 0; border-radius: 9999px;
  background: #fff; box-shadow: 0 12px 30px -10px rgba(31,154,62,.35);
}
.mnt-logo-ring {
  position: absolute; inset: -8px; border-radius: 9999px;
  border: 2px dashed rgba(31,154,62,.35);
  animation: mnt-spin 28s linear infinite;
}
.mnt-logo { position: relative; width: 96px; height: auto; }
.mnt-pill {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 6px 14px; margin-bottom: 18px;
  font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase;
  color: var(--mnt-green-deep); background: rgba(31,154,62,.10); border-radius: 9999px;
  animation: mnt-fade .8s .25s both;
}
.mnt-dot { width: 8px; height: 8px; border-radius: 9999px; background: var(--mnt-gold); box-shadow: 0 0 0 0 rgba(245,184,28,.6); animation: mnt-pulse 2s ease-out infinite; }
.mnt-title {
  margin: 0 0 14px; font-size: clamp(26px, 6vw, 36px); line-height: 1.15; font-weight: 800; letter-spacing: -.02em;
  color: var(--mnt-ink); animation: mnt-fade .8s .35s both;
}
.mnt-title span { color: var(--mnt-green); }
.mnt-lead { margin: 0 auto 10px; max-width: 420px; font-size: clamp(15px, 3.6vw, 17px); line-height: 1.6; color: var(--mnt-muted); animation: mnt-fade .8s .45s both; }
.mnt-sub  { margin: 0 0 26px; font-size: 15px; color: var(--mnt-muted); animation: mnt-fade .8s .55s both; }
.mnt-progress { position: relative; height: 6px; max-width: 280px; margin: 0 auto 26px; border-radius: 9999px; background: rgba(31,154,62,.12); overflow: hidden; animation: mnt-fade .8s .6s both; }
.mnt-progress::after {
  content: ""; position: absolute; top: 0; bottom: 0; width: 40%; border-radius: inherit;
  background: linear-gradient(90deg, var(--mnt-green), var(--mnt-gold));
  animation: mnt-slide 2.2s ease-in-out infinite;
}
.mnt-back { margin: 0 0 6px; font-size: 18px; font-weight: 700; color: var(--mnt-green-deep); animation: mnt-fade .8s .65s both; }
.mnt-thanks { margin: 0; font-size: 15px; color: var(--mnt-muted); animation: mnt-fade .8s .7s both; }
.mnt-divider { width: 48px; height: 2px; margin: 24px auto 16px; background: linear-gradient(90deg, transparent, var(--mnt-gold), transparent); animation: mnt-fade .8s .75s both; }
.mnt-sign { margin: 0; font-size: 14px; font-weight: 600; letter-spacing: .02em; color: var(--mnt-ink); animation: mnt-fade .8s .8s both; }

@keyframes mnt-rise  { from { opacity: 0; transform: translateY(18px) scale(.98); } to { opacity: 1; transform: none; } }
@keyframes mnt-fade  { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes mnt-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
@keyframes mnt-spin  { to { transform: rotate(360deg); } }
@keyframes mnt-pulse { 0% { box-shadow: 0 0 0 0 rgba(245,184,28,.6); } 80%,100% { box-shadow: 0 0 0 10px rgba(245,184,28,0); } }
@keyframes mnt-slide { 0% { left: -40%; } 100% { left: 100%; } }
@keyframes mnt-drift { 0%,100% { transform: translate(0,0); } 50% { transform: translate(40px, 30px); } }

@media (max-height: 720px) {
  .mnt-card { padding-top: 32px; padding-bottom: 28px; }
  .mnt-logo-wrap { width: 104px; height: 104px; margin-bottom: 20px; }
  .mnt-logo { width: 76px; }
  .mnt-pill { margin-bottom: 12px; }
  .mnt-sub, .mnt-progress { margin-bottom: 18px; }
  .mnt-divider { margin: 16px auto 12px; }
}

@media (prefers-reduced-motion: reduce) {
  .mnt-root *, .mnt-root *::before, .mnt-root *::after { animation: none !important; }
}
`;

const MaintenancePage = () => {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Under Maintenance | Ela Bazar";
    // Ask search engines not to index this temporary page.
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    document.head.appendChild(robots);
    return () => {
      document.title = prevTitle;
      robots.remove();
    };
  }, []);

  return (
    <main className="mnt-root" role="main">
      <style>{styles}</style>
      <div className="mnt-orb mnt-orb--green" aria-hidden="true" />
      <div className="mnt-orb mnt-orb--gold" aria-hidden="true" />
      <div className="mnt-leaf-grid" aria-hidden="true" />

      <section className="mnt-card" aria-labelledby="mnt-title">
        <div className="mnt-logo-wrap">
          <div className="mnt-logo-ring" aria-hidden="true" />
          <img src={elaLogo} alt="Ela Bazar" className="mnt-logo" width={96} height={78} />
        </div>

        <div className="mnt-pill">
          <span className="mnt-dot" aria-hidden="true" />
          Upgrade in progress
        </div>

        <h1 id="mnt-title" className="mnt-title">
          <span aria-hidden="true">🛠️ </span>Website Under <span>Maintenance</span>
        </h1>

        <p className="mnt-lead">
          We're upgrading Ela Bazar to bring you a faster, smoother, and better shopping experience.
        </p>
        <p className="mnt-sub">Our website is temporarily unavailable.</p>

        <div className="mnt-progress" role="progressbar" aria-label="Upgrade in progress" />

        <p className="mnt-back">We'll be back soon!</p>
        <p className="mnt-thanks">Thank you for your patience.</p>

        <div className="mnt-divider" aria-hidden="true" />
        <p className="mnt-sign">— Team Ela Bazar</p>
      </section>
    </main>
  );
};

export default MaintenancePage;
