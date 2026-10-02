// Cycle jour/nuit, couleurs du soleil et de l'ambiance, météo
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function computeEnvironment(time, dim, rain, thunder, flash, out) {
  // tick 0 = lever du soleil, 6000 = midi, 12000 = coucher, 18000 = minuit
  const t = ((time % 24000) + 24000) % 24000 / 24000;
  const ang = t * Math.PI * 2;
  const sun = [Math.cos(ang), Math.sin(ang), 0.28];
  const l = Math.hypot(sun[0], sun[1], sun[2]);
  sun[0] /= l; sun[1] /= l; sun[2] /= l;
  const moon = [-sun[0], -sun[1], -sun[2] * -1];
  const ml = Math.hypot(moon[0], moon[1], moon[2]);
  moon[0] /= ml; moon[1] /= ml; moon[2] /= ml;
  out.sun = sun; out.moon = moon;
  out.moonPhase = (Math.floor(time / 24000) % 8) / 8;

  if (dim === 1) { // Nether
    out.lightDir = [0.3, 1, 0.2];
    out.sunColor = [0, 0, 0];
    out.ambient = [0.42, 0.2, 0.14];
    out.fog = [0.22, 0.04, 0.03];
    out.minLight = 0.02;
    out.stars = 0; out.daylight = 0.3;
    out.shadowLight = false;
    out.exposureBias = 1.2;
    return out;
  }
  if (dim === 2) { // End
    out.lightDir = [0.35, 0.85, 0.4];
    out.sunColor = [0.12, 0.09, 0.16];
    out.ambient = [0.2, 0.16, 0.26];
    out.fog = [0.035, 0.025, 0.05];
    out.minLight = 0.015;
    out.stars = 0; out.daylight = 0.25;
    out.shadowLight = true;
    out.exposureBias = 1.25;
    return out;
  }
  const sy = sun[1];
  // transmittance atmosphérique approximée (masse d'air de Kasten-Young)
  const elev = Math.max(-2, Math.asin(Math.max(-1, Math.min(1, sy))) * 180 / Math.PI);
  const am = 1 / (Math.sin(Math.max(elev, 0.1) * Math.PI / 180) + 0.50572 * Math.pow(Math.max(elev, 0.1) + 6.07995, -1.6364));
  const beta = [0.06, 0.13, 0.28];
  const sunCol = beta.map((b) => Math.exp(-b * am));
  const sunI = 2.3 * smooth(-0.04, 0.12, sy);
  const moonI = 0.22 * smooth(-0.04, 0.15, -sy);
  const dayAmb = [0.26, 0.34, 0.5];
  const nightAmb = [0.018, 0.026, 0.06];
  const day = smooth(-0.18, 0.25, sy);
  const sunset = smooth(-0.1, 0.05, sy) * (1 - smooth(0.05, 0.35, sy));
  let amb = dayAmb.map((d, i) => nightAmb[i] + (d - nightAmb[i]) * day);
  amb = amb.map((v, i) => v * (1 - sunset * 0.35) + [0.25, 0.12, 0.06][i] * sunset * 0.6);
  let sc, dir;
  if (sy > -0.05) { sc = sunCol.map((c) => c * sunI); dir = sun; }
  else { sc = [0.55 * moonI, 0.65 * moonI, 0.95 * moonI]; dir = moon; }
  const r = rain, th = thunder;
  sc = sc.map((v) => v * (1 - r * 0.85) * (1 - th * 0.5));
  amb = amb.map((v, i) => v * (1 - r * 0.45) * (1 - th * 0.35) + [0.8, 0.85, 1.0][i] * flash * 2.5);
  out.lightDir = dir;
  out.sunColor = sc;
  out.ambient = amb;
  out.fog = amb;
  out.minLight = 0.004;
  out.stars = smooth(0.1, -0.25, sy);
  out.daylight = day;
  out.shadowLight = Math.max(sc[0], sc[1], sc[2]) > 0.005;
  out.exposureBias = 1.0;
  out.sunIntensity = 22 * (1 - r * 0.6);
  return out;
}
