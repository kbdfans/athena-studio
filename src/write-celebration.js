// Visual-only celebration. Never controls the transfer or its completion.
export function celebrateWrite(root = document) {
  const host = root.getElementById('transfer-confetti');
  if (!host) return () => {};
  host.replaceChildren();
  if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {};
  const colors = ['#f76932', '#8cae68', '#f3c857', '#80b9c2', '#df92b0', '#ffffff'];
  for (let i = 0; i < 96; i++) {
    const particle = root.createElement('i');
    particle.style.cssText = `--x:${Math.random()*100}vw;--drift:${(Math.random()-.5)*36}vw;--delay:${Math.random()*.65}s;--duration:${2.4+Math.random()*1.2}s;--spin:${(Math.random()-.5)*1440}deg;--color:${colors[i%colors.length]};--size:${5+Math.random()*6}px`;
    host.append(particle);
  }
  const clear = () => host.replaceChildren();
  const timer = setTimeout(clear, 4500);
  return () => { clearTimeout(timer); clear(); };
}
