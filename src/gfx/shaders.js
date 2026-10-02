// Shaders GLSL : terrain PBR, eau à réflexions par lancer de rayons en espace écran (SSR),
// ciel à diffusion atmosphérique, nuages volumétriques, rayons de lumière volumétriques, bloom, tonemapping.

export const COMMON = /* glsl */`
#define PI 3.14159265
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  float a = hash12(i), b = hash12(i+vec2(1,0)), c = hash12(i+vec2(0,1)), d = hash12(i+vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
float vnoise3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  float n000 = hash13(i), n100 = hash13(i+vec3(1,0,0)), n010 = hash13(i+vec3(0,1,0)), n110 = hash13(i+vec3(1,1,0));
  float n001 = hash13(i+vec3(0,0,1)), n101 = hash13(i+vec3(1,0,1)), n011 = hash13(i+vec3(0,1,1)), n111 = hash13(i+vec3(1,1,1));
  return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y), mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z); }
float fbm2(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= .5; } return s; }
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
vec2 dirToLUT(vec3 d){
  float u = atan(d.z, d.x) / (2.0 * PI) + 0.5;
  float el = asin(clamp(d.y, -1., 1.));
  float v = 0.5 + 0.5 * sign(el) * sqrt(abs(el) / (0.5 * PI));
  return vec2(u, v);
}
vec3 luma3(vec3 c){ return vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))); }
`;

// Nuages : couverture 2D animée + profil vertical
export const CLOUDS = /* glsl */`
uniform float uCloudCover;
uniform vec2 uWind;
float cloudDensity(vec3 p){
  vec2 q = p.xz * 0.0028 + uWind;
  float base = fbm2(q);
  float detail = fbm2(q * 3.7 + 9.1 + uWind * 1.7);
  float cov = mix(0.62, 0.38, uCloudCover);
  float d = smoothstep(cov, cov + 0.28, base * 0.82 + detail * 0.22);
  float h = clamp((p.y - 190.0) / 70.0, 0.0, 1.0);
  float prof = smoothstep(0.0, 0.15, h) * smoothstep(1.0, 0.35, h);
  return d * prof * (0.6 + base);
}
float cloudShadowAt(vec3 wp, vec3 sunDir){
  if (sunDir.y < 0.05) return 1.0;
  float t = (215.0 - wp.y) / sunDir.y;
  vec3 p = wp + sunDir * t;
  vec2 q = p.xz * 0.0028 + uWind;
  float base = fbm2(q);
  float cov = mix(0.62, 0.38, uCloudCover);
  return 1.0 - smoothstep(cov, cov + 0.3, base) * 0.6;
}
`;

export const SHADOW = /* glsl */`
uniform sampler2D uShadowMap;
uniform mat4 uShadowMatrix;
uniform float uShadowTexel;
uniform float uShadowOn;
const vec2 POISSON[12] = vec2[](
  vec2(-0.326,-0.406), vec2(-0.840,-0.074), vec2(-0.696,0.457), vec2(-0.203,0.621), vec2(0.962,-0.195), vec2(0.473,-0.480),
  vec2(0.519,0.767), vec2(0.185,-0.893), vec2(0.507,0.064), vec2(0.896,0.412), vec2(-0.322,-0.933), vec2(-0.792,-0.598));
// retourne (ombre, couverture) — couverture 0 hors de la carte d'ombre
vec2 shadowLookup(vec3 wp, vec3 n, float NdotL, float dither, int taps){
  if (uShadowOn < 0.5) return vec2(1.0, 0.0);
  vec3 p = wp + n * (0.03 + 0.09 * (1.0 - NdotL));
  vec3 c = (uShadowMatrix * vec4(p, 1.0)).xyz;
  if (c.x < 0.002 || c.x > 0.998 || c.y < 0.002 || c.y > 0.998 || c.z > 1.0) return vec2(1.0, 0.0);
  float bias = 0.00025;
  float a = dither * 6.2831853;
  mat2 r = mat2(cos(a), sin(a), -sin(a), cos(a));
  float s = 0.0;
  for (int i = 0; i < 12; i++) {
    if (i >= taps) break;
    vec2 o = r * POISSON[i] * uShadowTexel * 1.6;
    float d = texture(uShadowMap, c.xy + o).r;
    s += (c.z - bias > d) ? 0.0 : 1.0;
  }
  float sh = s / float(taps);
  // fondu aux bords
  vec2 e = min(c.xy, 1.0 - c.xy);
  float fade = smoothstep(0.0, 0.06, min(e.x, e.y));
  return vec2(sh, fade);
}
`;

export const LIGHTING = /* glsl */`
uniform vec3 uSunDir;      // direction de la lumière principale (soleil ou lune)
uniform vec3 uSunColor;    // couleur/intensité directe
uniform vec3 uSkyAmbient;  // ambiance ciel
uniform vec3 uBlockColor;  // couleur des torches
uniform float uMinLight;
uniform float uTime;
uniform float uWet;
uniform float uDim;        // 0 surface, 1 nether, 2 end
uniform sampler2D uSkyLUT;
uniform float uFlicker;
float D_GGX(float NdH, float r){ float a = r*r; float a2 = a*a; float d = NdH*NdH*(a2-1.0)+1.0; return a2 / (PI*d*d + 1e-5); }
vec3 F_Schlick(vec3 f0, float c){ return f0 + (1.0 - f0) * pow(1.0 - c, 5.0); }
// motif de caustiques borné dans [0, 2] (aucune division par zéro possible)
float caustics(vec2 p, float t){
  p = mod(p, 6.2831853) - 250.0; // tuile quasi sans couture (motif périodique)
  vec2 i = p; float c = 1.0; const float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float t2 = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(t2 - i.x) + sin(t2 + i.y), sin(t2 - i.y) + cos(t2 + i.x));
    vec2 q = vec2(p.x * inten / (abs(sin(i.x + t2)) + 1e-3), p.y * inten / (abs(cos(i.y + t2)) + 1e-3));
    c += 1.0 / max(length(q), 1e-3);
  }
  c = 1.17 - pow(clamp(c / 4.0, 0.0, 1.17), 1.4);
  return min(pow(max(c, 0.0), 8.0), 2.0);
}
// Éclairage complet d'une surface
vec3 shade(vec3 albedo, vec3 N, vec3 geoN, vec3 wp, vec3 V, float sky, float blk, float ao, float smoothness, float emissive, float extraShadow, bool underwater, float dither){
  float skyL = sky * sky;
  float NdotL = max(dot(N, uSunDir), 0.0);
  float gNdotL = dot(geoN, uSunDir);
  vec2 lk = shadowLookup(wp, geoN, max(gNdotL, 0.0), dither, 8);
  float skyGate = smoothstep(0.35, 0.93, sky);
  float sh = mix(skyGate, lk.x * mix(0.15, 1.0, skyGate), lk.y);
  if (gNdotL <= 0.0) sh = 0.0;
  sh *= extraShadow;
  if (uDim < 0.5) sh *= cloudShadowAt(wp, uSunDir);
  vec3 direct = uSunColor * NdotL * sh;
  if (underwater) direct *= 0.3 + caustics(wp.xz * 0.9 + wp.y * 0.2, uTime * 0.6) * 0.6;
  vec3 hemi = mix(uSkyAmbient * 0.45, uSkyAmbient, N.y * 0.5 + 0.5);
  vec3 amb = hemi * skyL;
  float b = blk * blk * (1.0 + uFlicker * 0.08);
  vec3 bl = uBlockColor * b * b * 2.2 + uBlockColor * b * 0.35;
  float aoF = mix(0.28, 1.0, ao);
  aoF = aoF * aoF;
  vec3 lit = direct + (amb + bl) * aoF + uMinLight * aoF;
  vec3 col = albedo * lit;
  // spéculaire soleil + reflet du ciel
  float rough = clamp(1.0 - smoothness, 0.04, 1.0);
  vec3 H = normalize(uSunDir + V);
  float NdH = max(dot(N, H), 0.0), VdH = max(dot(V, H), 0.0), NdV = max(dot(N, V), 1e-3);
  vec3 F = F_Schlick(vec3(0.04), VdH);
  float spec = D_GGX(NdH, rough) * 0.25 / max(NdV * 0.5 + 0.5, 0.2);
  col += uSunColor * spec * F * NdotL * sh * smoothness;
  if (smoothness > 0.35 && uDim < 0.5) {
    vec3 R = reflect(-V, N);
    vec3 env = texture(uSkyLUT, dirToLUT(normalize(vec3(R.x, max(R.y, 0.02), R.z)))).rgb;
    float fr = F_Schlick(vec3(0.04), NdV).x;
    col += env * fr * skyL * (smoothness - 0.35) * 1.5;
  }
  col += albedo * emissive * 3.0;
  return col;
}
`;

// ------------------------------------------------------------------ TERRAIN
export const TERRAIN_VS = /* glsl */`
attribute vec4 aLight;
attribute vec4 aColor;
attribute float aTile;
attribute float aFlags;
uniform float uTime;
uniform float uWindStrength;
varying vec2 vUv;
flat varying float vTile;
flat varying float vFlags;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec4 vLight;
varying vec3 vTint;
void main(){
  vec3 p = position / 16.0;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  int f = int(aFlags + 0.5);
  float sway = aLight.w;
  float t = uTime;
  if ((f & 1) != 0) {
    float ph = wp.x * 0.5 + wp.y * 0.3 + wp.z * 0.4;
    wp.x += sin(t * 1.7 + ph) * 0.03 * uWindStrength;
    wp.z += cos(t * 1.3 + ph * 1.3) * 0.025 * uWindStrength;
    wp.y += sin(t * 2.3 + ph * 0.7) * 0.012 * uWindStrength;
  }
  if ((f & 2) != 0) {
    float ph = wp.x * 0.7 + wp.z * 0.5;
    wp.x += (sin(t * 2.0 + ph) * 0.09 + sin(t * 3.7 + ph * 2.1) * 0.03) * sway * uWindStrength;
    wp.z += (cos(t * 1.6 + ph * 0.9) * 0.07) * sway * uWindStrength;
  }
  if ((f & 64) != 0) {
    float ph = wp.x * 0.6 + wp.z * 0.4 + wp.y * 0.5;
    wp.x += sin(t * 1.1 + ph) * 0.12 * sway;
    wp.z += cos(t * 0.9 + ph) * 0.1 * sway;
  }
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  vUv = uv;
  vTile = aTile;
  vFlags = aFlags;
  vNormal = normalize(normal);
  vLight = aLight;
  vTint = pow(aColor.rgb, vec3(2.2));
}
`;

export const TERRAIN_FS = /* glsl */`
precision highp sampler2DArray;
uniform sampler2DArray uAlbedo;
uniform sampler2DArray uMat;
uniform vec3 uCamPos;
varying vec2 vUv;
flat varying float vTile;
flat varying float vFlags;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec4 vLight;
varying vec3 vTint;
${COMMON}
${CLOUDS}
${SHADOW}
${LIGHTING}
mat3 cotangentFrame(vec3 N, vec3 p, vec2 uv){
  vec3 dp1 = dFdx(p), dp2 = dFdy(p); vec2 duv1 = dFdx(uv), duv2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, N), dp1perp = cross(N, dp1);
  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
  float invmax = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
  return mat3(T * invmax, B * invmax, N);
}
void main(){
  int f = int(vFlags + 0.5);
  vec2 uv = vUv;
  if ((f & 8) != 0) { // lave animée
    uv = vWorldPos.xz * 0.25 + vec2(uTime * 0.012, uTime * 0.008);
    uv += vec2(sin(uTime * 0.35 + vWorldPos.z * 0.9), cos(uTime * 0.3 + vWorldPos.x * 0.8)) * 0.06;
    if (abs(vNormal.y) < 0.5) uv = vec2(vWorldPos.x + vWorldPos.z, vWorldPos.y) * 0.25 + vec2(0.0, uTime * 0.04);
    uv = fract(uv);
  }
  if ((f & 16) != 0) { // feu
    uv.y = fract(uv.y + uTime * 0.6 + sin(uv.x * 9.0 + uTime * 3.0) * 0.03);
  }
  vec3 tc = vec3(uv, vTile);
  vec4 alb = texture(uAlbedo, tc);
  float aRaw = textureLod(uAlbedo, tc, 0.0).a;
  if ((f & 128) != 0 && aRaw < 0.4) discard;
  float tintMask = (aRaw > 0.5 && aRaw < 0.75) ? 1.0 : 0.0;
  vec3 albedo = alb.rgb * mix(vec3(1.0), vTint, tintMask);
  vec4 m = texture(uMat, tc);
  vec3 geoN = normalize(vNormal);
  if (!gl_FrontFacing) geoN = -geoN;
  vec3 tn = vec3(m.rg * 2.0 - 1.0, 0.0);
  tn.z = sqrt(max(1.0 - dot(tn.xy, tn.xy), 0.0));
  vec3 N = geoN;
  if ((f & 2) == 0) { N = normalize(cotangentFrame(geoN, vWorldPos, uv) * tn); }
  float smoothness = m.b;
  float emissive = m.a;
  vec3 V = normalize(uCamPos - vWorldPos);
  // pluie : surfaces mouillées et flaques
  float sky = vLight.x;
  if (uWet > 0.0 && sky > 0.8) {
    float up = smoothstep(0.7, 0.95, geoN.y);
    float wet = uWet * smoothstep(0.8, 0.95, sky);
    float puddle = smoothstep(0.52, 0.68, fbm2(vWorldPos.xz * 0.35)) * up * wet;
    albedo *= 1.0 - 0.4 * wet;
    smoothness = mix(smoothness, 0.95, max(wet * 0.55, puddle));
    N = normalize(mix(N, geoN, puddle));
  }
  if ((f & 8) != 0) emissive = 0.6 + 0.4 * alb.r;
  float dither = ign(gl_FragCoord.xy);
  float ao = vLight.z;
  if ((f & 2) != 0) ao = mix(1.0, 0.65, vUv.y);
  vec3 col = shade(albedo, N, geoN, vWorldPos, V, vLight.x, vLight.y, ao, smoothness, emissive, 1.0, (f & 32) != 0, dither);
  gl_FragColor = vec4(col, 1.0);
}
`;

// Profondeur de la carte d'ombre (terrain, avec découpe alpha)
export const SHADOW_TERRAIN_VS = /* glsl */`
attribute vec4 aLight;
attribute float aTile;
attribute float aFlags;
uniform float uTime;
uniform float uWindStrength;
varying vec2 vUv;
flat varying float vTile;
flat varying float vFlags;
void main(){
  vec3 p = position / 16.0;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  int f = int(aFlags + 0.5);
  if ((f & 1) != 0) {
    float ph = wp.x * 0.5 + wp.y * 0.3 + wp.z * 0.4;
    wp.x += sin(uTime * 1.7 + ph) * 0.03 * uWindStrength;
  }
  if ((f & 2) != 0) {
    float ph = wp.x * 0.7 + wp.z * 0.5;
    wp.x += sin(uTime * 2.0 + ph) * 0.09 * aLight.w * uWindStrength;
  }
  gl_Position = projectionMatrix * viewMatrix * wp;
  vUv = uv; vTile = aTile; vFlags = aFlags;
}
`;
export const SHADOW_TERRAIN_FS = /* glsl */`
precision highp sampler2DArray;
uniform sampler2DArray uAlbedo;
varying vec2 vUv;
flat varying float vTile;
flat varying float vFlags;
void main(){
  int f = int(vFlags + 0.5);
  if ((f & 128) != 0) { if (textureLod(uAlbedo, vec3(vUv, vTile), 0.0).a < 0.4) discard; }
  gl_FragColor = vec4(1.0);
}
`;
export const SHADOW_BASIC_VS = /* glsl */`
void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
export const SHADOW_BASIC_FS = /* glsl */`
void main(){ gl_FragColor = vec4(1.0); }
`;

// ---------------------------------------------------------- EAU / VERRE
export const WATER_VS = /* glsl */`
attribute vec4 aLight;
attribute vec4 aColor;
attribute float aTile;
attribute float aFlags;
uniform float uTime;
varying vec2 vUv;
flat varying float vTile;
flat varying float vFlags;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec4 vLight;
varying vec4 vTint;
void main(){
  vec3 p = position / 16.0;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  int f = int(aFlags + 0.5);
  if ((f & 16) != 0 && normal.y > 0.5) {
    // légère houle des surfaces d'eau
    wp.y += (sin(wp.x * 0.9 + uTime * 1.3) * 0.5 + sin(wp.z * 0.7 + uTime * 1.1 + 1.3) * 0.5) * 0.035 - 0.03;
  }
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  vUv = uv; vTile = aTile; vFlags = aFlags; vNormal = normal; vLight = aLight; vTint = vec4(pow(aColor.rgb, vec3(2.2)), aColor.a);
}
`;

export const WATER_FS = /* glsl */`
precision highp sampler2DArray;
uniform sampler2DArray uAlbedo;
uniform sampler2DArray uMat;
uniform sampler2D uSceneColor;
uniform sampler2D uSceneDepth;
uniform vec2 uResolution;
uniform mat4 uProj;
uniform mat4 uInvProj;
uniform vec3 uCamPos;
uniform float uNear;
uniform float uFar;
uniform float uSSR;
uniform float uCamUnderwater;
varying vec2 vUv;
flat varying float vTile;
flat varying float vFlags;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec4 vLight;
varying vec4 vTint;
${COMMON}
${CLOUDS}
${SHADOW}
${LIGHTING}
float linDepth(float d){ float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
float waveH(vec2 p, float t){
  float h = 0.0;
  h += sin(dot(p, vec2(0.8, 0.6)) * 1.3 + t * 1.5) * 0.10;
  h += sin(dot(p, vec2(-0.55, 0.85)) * 2.3 + t * 1.9) * 0.06;
  h += sin(dot(p, vec2(0.25, -0.97)) * 3.9 + t * 2.7) * 0.03;
  h += (vnoise(p * 2.2 + vec2(t * 0.5, -t * 0.3)) + vnoise(p * 4.7 - vec2(t * 0.8, t * 0.6)) * 0.5) * 0.09;
  h += vnoise(p * 11.0 + vec2(-t, t) * 1.3) * 0.015;
  return h;
}
vec3 waterNormal(vec2 p, vec2 flow, float t, float strength){
  // carte de flux à deux phases
  float ph0 = fract(t * 0.25), ph1 = fract(t * 0.25 + 0.5);
  float w0 = 1.0 - abs(1.0 - 2.0 * ph0);
  vec2 p0 = p - flow * ph0 * 2.0, p1 = p - flow * ph1 * 2.0 + 0.37;
  const float e = 0.05;
  vec3 n = vec3(0.0);
  for (int k = 0; k < 2; k++) {
    vec2 q = k == 0 ? p0 : p1;
    float hx = waveH(q + vec2(e, 0.0), t) - waveH(q - vec2(e, 0.0), t);
    float hz = waveH(q + vec2(0.0, e), t) - waveH(q - vec2(0.0, e), t);
    vec3 nn = normalize(vec3(-hx / (2.0 * e) * strength, 1.0, -hz / (2.0 * e) * strength));
    n += nn * (k == 0 ? w0 : 1.0 - w0);
  }
  return normalize(n);
}
vec3 viewPosFromDepth(vec2 uv, float d){
  vec4 c = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 v = uInvProj * c; return v.xyz / v.w;
}
vec4 traceSSR(vec3 vpos, vec3 vdir, float dither){
  float stepLen = 0.35 + dither * 0.3;
  vec3 p = vpos;
  vec2 hitUV = vec2(-1.0);
  float hit = 0.0;
  for (int i = 0; i < 48; i++) {
    vec3 prev = p;
    p += vdir * stepLen;
    stepLen *= 1.09;
    if (-p.z < uNear) break;
    vec4 cl = uProj * vec4(p, 1.0);
    vec2 uv = cl.xy / cl.w * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
    float d = texture(uSceneDepth, uv).r;
    if (d >= 0.99999) continue;
    float sceneZ = linDepth(d);
    float rayZ = -p.z;
    if (rayZ > sceneZ && rayZ - sceneZ < max(stepLen * 2.5, 0.6)) {
      // raffinement binaire
      vec3 a = prev, b = p;
      for (int j = 0; j < 6; j++) {
        vec3 m = (a + b) * 0.5;
        vec4 c2 = uProj * vec4(m, 1.0);
        vec2 u2 = c2.xy / c2.w * 0.5 + 0.5;
        float z2 = linDepth(texture(uSceneDepth, u2).r);
        if (-m.z > z2) b = m; else a = m;
      }
      vec4 c3 = uProj * vec4(b, 1.0);
      hitUV = c3.xy / c3.w * 0.5 + 0.5;
      vec2 ed = min(hitUV, 1.0 - hitUV);
      hit = smoothstep(0.0, 0.08, min(ed.x, ed.y)) * (1.0 - float(i) / 48.0);
      break;
    }
  }
  return vec4(hitUV, hit, 0.0);
}
void main(){
  vec2 suv = gl_FragCoord.xy / uResolution;
  float sceneD = texture(uSceneDepth, suv).r;
  if (gl_FragCoord.z > sceneD) discard;
  int f = int(vFlags + 0.5);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 geoN = normalize(vNormal);
  float dither = ign(gl_FragCoord.xy);
  float sky = vLight.x, blk = vLight.y;
  float skyL = sky * sky;
  vec3 col;

  if ((f & 1) != 0) {
    // ============ EAU
    float ang = vTint.a * 2.0 * PI;
    float speed = vLight.w;
    vec2 flow = vec2(cos(ang), sin(ang)) * speed * 1.4;
    vec3 N;
    bool top = (f & 16) != 0;
    if (top && abs(geoN.y) > 0.5) {
      N = waterNormal(vWorldPos.xz, flow, uTime, mix(0.55, 1.1, min(speed * 3.0, 1.0)));
      if (geoN.y < 0.0) N = -N;
    } else {
      vec2 sp = vec2(dot(vWorldPos.xz, vec2(geoN.z, -geoN.x)), vWorldPos.y + uTime * 2.5);
      float h1 = vnoise(sp * vec2(4.0, 1.5)), h2 = vnoise(sp * vec2(4.0, 1.5) + vec2(0.05, 0.0));
      N = normalize(geoN + vec3(geoN.z, 0.0, -geoN.x) * (h2 - h1) * 6.0 + vec3(0.0, (h1 - 0.5) * 0.3, 0.0));
    }
    bool fromBelow = dot(V, geoN) < 0.0;
    // teinte du biome atténuée : l'eau réelle diffuse un bleu-vert, jamais un bleu pur
    vec3 waterTint = mix(vec3(dot(vTint.rgb, vec3(0.3, 0.5, 0.2))), vTint.rgb, 0.45);
    // réfraction
    vec2 roff = N.xz * 0.035 * clamp(1.0 / (length(uCamPos - vWorldPos) * 0.08 + 0.3), 0.15, 1.5);
    vec2 ruv = clamp(suv + roff, 0.001, 0.999);
    float rd = texture(uSceneDepth, ruv).r;
    if (rd < gl_FragCoord.z) { ruv = suv; rd = sceneD; }
    vec3 refr = texture(uSceneColor, ruv).rgb;
    float thick = max(linDepth(rd) - linDepth(gl_FragCoord.z), 0.0);
    if (rd >= 0.99999) thick = 60.0;
    if (fromBelow || uCamUnderwater > 0.5) thick = min(thick, 1.0);
    vec3 absorbC = vec3(0.45, 0.1, 0.07) * (1.3 - waterTint * 0.5);
    vec3 trans = exp(-absorbC * thick);
    vec3 scatterC = vec3(0.025, 0.075, 0.09) * (0.6 + waterTint * 0.8);
    vec3 amb = uSkyAmbient * skyL + uBlockColor * blk * blk * 0.6 + uMinLight;
    float sunUp = max(uSunDir.y, 0.0);
    vec3 inscatter = scatterC * (amb * 1.3 + uSunColor * sunUp * 0.35 * smoothstep(0.4, 0.9, sky));
    vec3 below = refr * trans + inscatter * (1.0 - exp(-thick * 0.35));
    // réflexion
    vec3 R = reflect(-V, N);
    if (fromBelow) R = reflect(-V, -N);
    vec3 envDir = normalize(vec3(R.x, max(R.y, 0.03), R.z));
    vec3 refl = texture(uSkyLUT, dirToLUT(envDir)).rgb * mix(0.08, 1.0, skyL);
    if (uDim > 0.5) refl = amb * 0.6;
    float hit = 0.0;
    if (uSSR > 0.5) {
      vec3 vpos = (viewMatrix * vec4(vWorldPos, 1.0)).xyz;
      vec3 vdir = normalize((viewMatrix * vec4(R, 0.0)).xyz);
      vec4 tr = traceSSR(vpos, vdir, dither);
      if (tr.z > 0.0) { refl = mix(refl, texture(uSceneColor, tr.xy).rgb, tr.z); hit = tr.z; }
    }
    float NdV = max(dot(fromBelow ? -N : N, V), 0.0);
    float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
    if (fromBelow) {
      // réflexion totale interne au-delà de l'angle critique
      float cosT = NdV;
      F = cosT < 0.66 ? 1.0 : F;
      refl = mix(inscatter * 2.0, refl, hit);
    }
    F = clamp(F, 0.0, 1.0);
    col = mix(below, refl, F);
    // reflet du soleil
    vec3 H = normalize(uSunDir + V);
    vec2 lk = shadowLookup(vWorldPos, vec3(0, 1, 0), 1.0, dither, 4);
    float sh = mix(smoothstep(0.5, 0.95, sky), lk.x, lk.y);
    sh *= cloudShadowAt(vWorldPos, uSunDir);
    float spec = pow(max(dot(N, H), 0.0), 900.0) * 60.0 + pow(max(dot(N, H), 0.0), 120.0) * 1.2;
    if (!fromBelow) col += uSunColor * spec * sh * F * 4.0;
    // écume sur les rivages et l'eau vive
    float foam = smoothstep(0.35, 0.0, thick) * (0.6 + 0.4 * vnoise(vWorldPos.xz * 3.0 + uTime));
    foam += smoothstep(0.25, 0.6, speed) * smoothstep(0.55, 0.8, vnoise(vWorldPos.xz * 4.0 - flow * uTime * 3.0)) * 0.6;
    if (!top) foam += smoothstep(0.6, 0.9, vnoise(vec2(vWorldPos.x + vWorldPos.z, vWorldPos.y + uTime * 3.0) * 3.0)) * 0.35;
    if (!fromBelow) col = mix(col, (amb + uSunColor * max(uSunDir.y, 0.0) * sh) * 0.9, clamp(foam, 0.0, 1.0) * 0.55);
  } else if ((f & 4) != 0) {
    // ============ PORTAIL DU NETHER
    vec2 p = vec2(dot(vWorldPos.xz, vec2(abs(geoN.z), abs(geoN.x))), vWorldPos.y);
    float sw = fbm2(p * 1.3 + vec2(sin(uTime * 0.7), uTime * 0.4)) + fbm2(p * 2.7 - uTime * 0.5) * 0.5;
    vec3 pc = mix(vec3(0.25, 0.03, 0.6), vec3(0.85, 0.35, 1.0), sw * 0.8);
    vec2 ruv = clamp(suv + vec2(sin(sw * 6.0), cos(sw * 6.0)) * 0.015, 0.001, 0.999);
    vec3 refr = texture(uSceneColor, ruv).rgb;
    col = mix(refr, pc * 2.8, 0.82);
  } else if ((f & 8) != 0) {
    // ============ PORTAIL DE L'END : champ d'étoiles à parallaxe
    vec3 d = -V;
    col = vec3(0.01, 0.015, 0.03);
    for (int l = 1; l <= 6; l++) {
      float depth = float(l) * 1.7;
      vec2 q = vWorldPos.xz + d.xz / max(abs(d.y), 0.15) * depth + vec2(uTime * 0.02 * float(l));
      vec2 cell = floor(q * 3.0);
      float h = hash12(cell + float(l) * 13.0);
      vec2 fp = fract(q * 3.0) - 0.5;
      float star = smoothstep(0.08, 0.0, length(fp - (vec2(hash12(cell + 1.7), hash12(cell + 9.1)) - 0.5) * 0.6)) * step(0.82, h);
      vec3 sc = mix(vec3(0.2, 0.6, 0.6), vec3(0.6, 0.9, 1.0), hash12(cell + 3.3));
      col += sc * star * (1.4 / float(l));
      col += vec3(0.02, 0.06, 0.07) * fbm2(q * 0.7) / float(l);
    }
  } else {
    // ============ VERRE / GLACE
    vec4 a = texture(uAlbedo, vec3(vUv, vTile));
    vec4 m = texture(uMat, vec3(vUv, vTile));
    vec3 tn = vec3(m.rg * 2.0 - 1.0, 0.0);
    vec3 N = geoN;
    vec2 ruv = clamp(suv + tn.xy * 0.01 + geoN.xz * 0.004, 0.001, 0.999);
    if (texture(uSceneDepth, ruv).r < gl_FragCoord.z) ruv = suv;
    vec3 refr = texture(uSceneColor, ruv).rgb;
    vec3 lit = shade(a.rgb, N, geoN, vWorldPos, V, sky, blk, 1.0, 0.0, m.a, 1.0, false, dither);
    vec3 tint = mix(vec3(1.0), a.rgb, clamp(a.a * 1.6, 0.0, 1.0));
    col = mix(refr * tint, lit, a.a);
    vec3 R = reflect(-V, N);
    vec3 refl = texture(uSkyLUT, dirToLUT(normalize(vec3(R.x, max(R.y, 0.03), R.z)))).rgb * skyL;
    if (uSSR > 0.5) {
      vec3 vpos = (viewMatrix * vec4(vWorldPos, 1.0)).xyz;
      vec3 vdir = normalize((viewMatrix * vec4(R, 0.0)).xyz);
      vec4 tr = traceSSR(vpos, vdir, dither);
      if (tr.z > 0.0) refl = mix(refl, texture(uSceneColor, tr.xy).rgb, tr.z);
    }
    float F = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    col = mix(col, refl, F * (1.0 - a.a * 0.5));
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// ------------------------------------------------------------- CIEL (LUT)
export const FULLSCREEN_VS = /* glsl */`
varying vec2 vUv;
void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const SKY_LUT_FS = /* glsl */`
varying vec2 vUv;
uniform vec3 uSun;
uniform vec3 uMoon;
uniform float uRain;
uniform float uSunIntensity;
${COMMON}
// diffusion atmosphérique (Rayleigh + Mie), d'après wwwtyro/glsl-atmosphere
vec2 rsi(vec3 r0, vec3 rd, float sr){
  float a = dot(rd, rd), b = 2.0 * dot(rd, r0), c = dot(r0, r0) - (sr * sr);
  float d = (b * b) - 4.0 * a * c;
  if (d < 0.0) return vec2(1e5, -1e5);
  return vec2((-b - sqrt(d)) / (2.0 * a), (-b + sqrt(d)) / (2.0 * a));
}
vec3 atmosphere(vec3 r, vec3 r0, vec3 pSun, float iSun){
  const float rPlanet = 6371e3, rAtmos = 6471e3;
  const vec3 kRlh = vec3(5.5e-6, 13.0e-6, 22.4e-6);
  const float kMie = 9e-6, shRlh = 8e3, shMie = 1.2e3, g = 0.76;
  vec2 p = rsi(r0, r, rAtmos);
  if (p.x > p.y) return vec3(0.0);
  p.y = min(p.y, rsi(r0, r, rPlanet).x);
  float iStepSize = (p.y - p.x) / 16.0;
  float iTime = 0.0;
  vec3 totalRlh = vec3(0.0), totalMie = vec3(0.0);
  float iOdRlh = 0.0, iOdMie = 0.0;
  float mu = dot(r, pSun), mumu = mu * mu, gg = g * g;
  float pRlh = 3.0 / (16.0 * PI) * (1.0 + mumu);
  float pMie = 3.0 / (8.0 * PI) * ((1.0 - gg) * (mumu + 1.0)) / (pow(1.0 + gg - 2.0 * mu * g, 1.5) * (2.0 + gg));
  for (int i = 0; i < 16; i++) {
    vec3 iPos = r0 + r * (iTime + iStepSize * 0.5);
    float iHeight = length(iPos) - rPlanet;
    float odStepRlh = exp(-iHeight / shRlh) * iStepSize;
    float odStepMie = exp(-iHeight / shMie) * iStepSize;
    iOdRlh += odStepRlh; iOdMie += odStepMie;
    float jStepSize = rsi(iPos, pSun, rAtmos).y / 8.0;
    float jTime = 0.0, jOdRlh = 0.0, jOdMie = 0.0;
    for (int j = 0; j < 8; j++) {
      vec3 jPos = iPos + pSun * (jTime + jStepSize * 0.5);
      float jHeight = length(jPos) - rPlanet;
      jOdRlh += exp(-jHeight / shRlh) * jStepSize;
      jOdMie += exp(-jHeight / shMie) * jStepSize;
      jTime += jStepSize;
    }
    vec3 attn = exp(-(kMie * (iOdMie + jOdMie) + kRlh * (iOdRlh + jOdRlh)));
    totalRlh += odStepRlh * attn; totalMie += odStepMie * attn;
    iTime += iStepSize;
  }
  return iSun * (pRlh * kRlh * totalRlh + pMie * kMie * totalMie);
}
void main(){
  float u = vUv.x, v = vUv.y;
  float az = (u - 0.5) * 2.0 * PI;
  float s = (v - 0.5) * 2.0;
  float el = sign(s) * s * s * 0.5 * PI;
  vec3 d = vec3(cos(el) * cos(az), sin(el), cos(el) * sin(az));
  vec3 dd = normalize(vec3(d.x, max(d.y, 0.0) * 0.92 + 0.05, d.z));
  vec3 r0 = vec3(0.0, 6372e3, 0.0);
  vec3 c = atmosphere(dd, r0, uSun, uSunIntensity);
  c += atmosphere(dd, r0, uMoon, 0.35) * vec3(0.7, 0.85, 1.25);
  c += vec3(0.0025, 0.0035, 0.007); // lueur nocturne
  // sous l'horizon : brume légèrement assombrie
  if (d.y < 0.0) c *= mix(1.0, 0.7, smoothstep(0.0, -0.4, d.y));
  // météo
  vec3 gray = luma3(c) * vec3(0.85, 0.9, 1.0);
  c = mix(c, gray * 0.55, uRain * 0.85);
  gl_FragColor = vec4(c, 1.0);
}
`;

// ----------------------------------------------- CIEL (passe plein écran)
export const SKY_VS = /* glsl */`
varying vec3 vDir;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
void main(){
  vec4 c = vec4(position.xy, 1.0, 1.0);
  vec4 v = uInvProj * c; v /= v.w;
  vDir = (uCamWorld * vec4(v.xyz, 0.0)).xyz;
  gl_Position = vec4(position.xy, 0.99999, 1.0);
}
`;
export const SKY_FS = /* glsl */`
varying vec3 vDir;
uniform sampler2D uSkyLUT;
uniform vec3 uSun;
uniform vec3 uMoon;
uniform vec3 uSunColor;
uniform vec3 uCamPos;
uniform float uTime;
uniform float uRain;
uniform float uStars;
uniform float uDim;
uniform float uClouds;
uniform float uMoonPhase;
${COMMON}
${CLOUDS}
vec3 endSky(vec3 d){
  float n = fbm2(d.xz / (abs(d.y) + 0.4) * 3.0) ;
  vec3 c = mix(vec3(0.03, 0.01, 0.06), vec3(0.14, 0.06, 0.2), n);
  vec2 cell = floor(dirToLUT(d) * vec2(900.0, 450.0));
  float st = step(0.996, hash12(cell));
  return c + st * vec3(0.8, 0.7, 1.0);
}
void main(){
  vec3 d = normalize(vDir);
  if (uDim > 1.5) { gl_FragColor = vec4(endSky(d), 1.0); return; }
  if (uDim > 0.5) { gl_FragColor = vec4(0.15, 0.02, 0.02, 1.0); return; }
  vec3 col = texture(uSkyLUT, dirToLUT(d)).rgb;
  // soleil
  float mu = dot(d, uSun);
  float sunDisk = smoothstep(0.99955, 0.99975, mu);
  float hor = smoothstep(-0.02, 0.03, d.y);
  col += uSunColor * sunDisk * 60.0 * (1.0 - uRain) * hor;
  // lune
  float mm = dot(d, uMoon);
  if (mm > 0.9994) {
    vec3 up = abs(uMoon.y) > 0.99 ? vec3(1, 0, 0) : vec3(0, 1, 0);
    vec3 tx = normalize(cross(uMoon, up)), ty = cross(tx, uMoon);
    vec2 q = vec2(dot(d - uMoon, tx), dot(d - uMoon, ty)) / 0.0346;
    float r = length(q);
    if (r < 1.0) {
      float z = sqrt(1.0 - r * r);
      vec3 n = vec3(q, z);
      float phase = cos(uMoonPhase * 2.0 * PI);
      float lit = smoothstep(-0.05, 0.05, dot(n, normalize(vec3(sin(uMoonPhase * 2.0 * PI), 0.0, -phase))) );
      float craters = 0.75 + 0.25 * vnoise(q * 5.0 + 3.0);
      col += vec3(0.85, 0.88, 0.95) * craters * (0.04 + lit * 1.6) * hor * (1.0 - uRain);
    }
  }
  // étoiles
  if (uStars > 0.01 && d.y > 0.0) {
    vec2 uv = dirToLUT(d) * vec2(1400.0, 700.0);
    vec2 cell = floor(uv);
    float h = hash12(cell);
    if (h > 0.9965) {
      vec2 fp = fract(uv) - 0.5;
      float s = smoothstep(0.35, 0.0, length(fp)) * (0.5 + 0.5 * sin(uTime * (1.0 + h * 5.0) + h * 100.0));
      col += vec3(0.8, 0.85, 1.0) * s * uStars * 0.4 * (1.0 - uRain);
    }
  }
  // nuages volumétriques
  if (uClouds > 0.5 && d.y > 0.0) {
    float t0 = (190.0 - uCamPos.y) / d.y, t1 = (260.0 - uCamPos.y) / d.y;
    if (t1 > 0.0) {
      t0 = max(t0, 0.0);
      const int STEPS = 14;
      float dt = (t1 - t0) / float(STEPS);
      float T = 1.0;
      vec3 acc = vec3(0.0);
      float jitter = ign(gl_FragCoord.xy);
      vec3 amb = texture(uSkyLUT, dirToLUT(vec3(0.0, 1.0, 0.0))).rgb * 1.6 + vec3(0.02);
      float phase = 0.6 + 1.2 * pow(max(mu, 0.0), 8.0);
      for (int i = 0; i < STEPS; i++) {
        vec3 p = uCamPos + d * (t0 + dt * (float(i) + jitter));
        float den = cloudDensity(p);
        if (den > 0.01) {
          float ls = cloudDensity(p + uSun * 25.0) + cloudDensity(p + uSun * 60.0) * 0.6;
          float beer = exp(-ls * 2.2);
          float powder = 1.0 - exp(-den * 4.0);
          vec3 light = uSunColor * beer * phase * powder * 2.2 + amb * (0.55 + 0.45 * (p.y - 190.0) / 70.0);
          float a = 1.0 - exp(-den * dt * 0.045);
          acc += T * a * light;
          T *= 1.0 - a;
          if (T < 0.03) break;
        }
      }
      float fade = smoothstep(0.0, 0.12, d.y);
      col = mix(col, col * T + acc, fade);
    }
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// --------------------------------------------------------- COMPOSITION HDR
export const COMPOSITE_FS = /* glsl */`
varying vec2 vUv;
uniform sampler2D tScene;
uniform sampler2D tSceneDepth;
uniform sampler2D tWater;
uniform sampler2D tWaterDepth;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform vec3 uCamPos;
uniform float uNear;
uniform float uFar;
uniform float uFogDist;
uniform float uFogDensity;
uniform vec3 uFogColor;     // pour Nether / End
uniform float uUnderwater;
uniform float uUnderLava;
uniform float uVolumetric;
uniform vec3 uWaterColor;
uniform float uBlindness;
${COMMON}
${CLOUDS}
${SHADOW}
${LIGHTING}
float linDepth(float d){ float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
void main(){
  vec4 w = texture(tWater, vUv);
  float sd = texture(tSceneDepth, vUv).r;
  float wd = texture(tWaterDepth, vUv).r;
  bool hasW = w.a > 0.5 && wd < sd;
  vec3 col = hasW ? w.rgb : texture(tScene, vUv).rgb;
  float d = hasW ? wd : sd;
  vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vp /= vp.w;
  vec3 wdir = normalize((uCamWorld * vec4(vp.xyz, 0.0)).xyz);
  float dist = d >= 0.99999 ? 1e4 : length(vp.xyz);
  float dither = ign(gl_FragCoord.xy);

  // ----- rayons volumétriques (lancer de rayons dans la carte d'ombre)
  vec3 vol = vec3(0.0);
  if (uVolumetric > 0.5 && uDim < 0.5 && uShadowOn > 0.5) {
    float L = min(dist, 110.0);
    const int N = 14;
    float sum = 0.0;
    for (int i = 0; i < N; i++) {
      float t = (float(i) + dither) / float(N);
      t = t * t * L;
      vec3 p = uCamPos + wdir * t;
      vec3 c = (uShadowMatrix * vec4(p, 1.0)).xyz;
      float lit = 1.0;
      if (c.x > 0.0 && c.x < 1.0 && c.y > 0.0 && c.y < 1.0 && c.z < 1.0) lit = (c.z - 0.0008 > texture(uShadowMap, c.xy).r) ? 0.0 : 1.0;
      sum += lit;
    }
    float frac = sum / float(N);
    float mu = dot(wdir, uSunDir);
    float g = 0.72;
    float hg = (1.0 - g * g) / (4.0 * PI * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
    float density = uUnderwater > 0.5 ? 0.06 : 0.0045 * (1.0 + uWet * 3.0);
    float amount = (1.0 - exp(-L * density));
    vec3 sc = uUnderwater > 0.5 ? uSunColor * uWaterColor * 1.5 : uSunColor;
    vol = sc * frac * amount * (hg * 3.0 + 0.08) * smoothstep(-0.05, 0.15, uSunDir.y + 0.1);
  }

  // ----- brouillard
  if (uUnderLava > 0.5) {
    col = mix(col, vec3(1.2, 0.35, 0.05), 1.0 - exp(-dist * 0.9));
  } else if (uUnderwater > 0.5) {
    vec3 wc = uWaterColor * (uSkyAmbient * 0.6 + uSunColor * max(uSunDir.y, 0.0) * 0.25 + 0.01);
    float fa = 1.0 - exp(-dist * 0.075);
    col = mix(col * exp(-vec3(0.35, 0.09, 0.06) * min(dist, 60.0) * 0.4), wc, fa);
  } else if (uDim > 0.5) {
    float fa = 1.0 - exp(-dist * uFogDensity);
    fa = max(fa, smoothstep(uFogDist * 0.6, uFogDist, dist));
    if (d < 0.99999) col = mix(col, uFogColor, fa);
  } else if (d < 0.99999) {
    vec3 fdir = normalize(vec3(wdir.x, max(wdir.y, 0.0) * 0.6 + 0.04, wdir.z));
    vec3 fogC = texture(uSkyLUT, dirToLUT(fdir)).rgb;
    float mu = max(dot(wdir, uSunDir), 0.0);
    fogC += uSunColor * pow(mu, 12.0) * 0.12;
    float hfall = exp(-max(uCamPos.y + wdir.y * dist * 0.5 - 62.0, 0.0) * 0.012);
    float fa = (1.0 - exp(-dist * uFogDensity * (0.6 + 1.4 * uWet) * hfall));
    fa = max(fa, smoothstep(uFogDist * 0.72, uFogDist * 0.98, dist));
    col = mix(col, fogC, clamp(fa, 0.0, 1.0));
  }
  col += vol;
  if (uBlindness > 0.0) col *= mix(1.0, exp(-dist * 0.25), uBlindness);
  // garde-fou : jamais de NaN/infini dans la chaîne HDR (sinon le bloom les propage)
  if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
  gl_FragColor = vec4(min(col, vec3(500.0)), 1.0);
}
`;

// ---------------------------------------------------------------- BLOOM
export const BLOOM_PREFILTER_FS = /* glsl */`
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uThreshold;
void main(){
  vec3 c = texture(tSrc, vUv + uTexel * vec2(-1, -1)).rgb + texture(tSrc, vUv + uTexel * vec2(1, -1)).rgb
         + texture(tSrc, vUv + uTexel * vec2(-1, 1)).rgb + texture(tSrc, vUv + uTexel * vec2(1, 1)).rgb;
  c *= 0.25;
  float br = max(c.r, max(c.g, c.b));
  float knee = uThreshold * 0.5;
  float soft = clamp(br - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
  gl_FragColor = vec4(min(c * contrib, vec3(60.0)), 1.0);
}
`;
export const BLOOM_DOWN_FS = /* glsl */`
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uTexel;
void main(){
  vec2 t = uTexel;
  vec3 a = texture(tSrc, vUv + t * vec2(-2, -2)).rgb, b = texture(tSrc, vUv + t * vec2(0, -2)).rgb, c = texture(tSrc, vUv + t * vec2(2, -2)).rgb;
  vec3 d = texture(tSrc, vUv + t * vec2(-2, 0)).rgb, e = texture(tSrc, vUv).rgb, f = texture(tSrc, vUv + t * vec2(2, 0)).rgb;
  vec3 g = texture(tSrc, vUv + t * vec2(-2, 2)).rgb, h = texture(tSrc, vUv + t * vec2(0, 2)).rgb, i = texture(tSrc, vUv + t * vec2(2, 2)).rgb;
  vec3 j = texture(tSrc, vUv + t * vec2(-1, -1)).rgb, k = texture(tSrc, vUv + t * vec2(1, -1)).rgb;
  vec3 l = texture(tSrc, vUv + t * vec2(-1, 1)).rgb, m = texture(tSrc, vUv + t * vec2(1, 1)).rgb;
  vec3 o = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  gl_FragColor = vec4(o, 1.0);
}
`;
export const BLOOM_UP_FS = /* glsl */`
varying vec2 vUv;
uniform sampler2D tSrc;
uniform sampler2D tPrev;
uniform vec2 uTexel;
uniform float uRadius;
void main(){
  vec2 t = uTexel * uRadius;
  vec3 s = texture(tSrc, vUv + t * vec2(-1, -1)).rgb + texture(tSrc, vUv + t * vec2(0, -1)).rgb * 2.0 + texture(tSrc, vUv + t * vec2(1, -1)).rgb
         + texture(tSrc, vUv + t * vec2(-1, 0)).rgb * 2.0 + texture(tSrc, vUv).rgb * 4.0 + texture(tSrc, vUv + t * vec2(1, 0)).rgb * 2.0
         + texture(tSrc, vUv + t * vec2(-1, 1)).rgb + texture(tSrc, vUv + t * vec2(0, 1)).rgb * 2.0 + texture(tSrc, vUv + t * vec2(1, 1)).rgb;
  gl_FragColor = vec4(s / 16.0 + texture(tPrev, vUv).rgb, 1.0);
}
`;

// --------------------------------------------------------------- FINAL
export const FINAL_FS = /* glsl */`
varying vec2 vUv;
uniform sampler2D tHDR;
uniform sampler2D tBloom;
uniform float uBloom;
uniform float uExposure;
uniform float uTime;
uniform float uUnderwater;
uniform float uHurt;
uniform float uPortal;
uniform float uDarkness;
uniform float uVignette;
uniform float uSaturation;
uniform float uFreeze;
${COMMON}
vec3 aces(vec3 x){ const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14; return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0); }
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec2 uv = vUv;
  if (uUnderwater > 0.5) uv += vec2(sin(uv.y * 25.0 + uTime * 2.0), cos(uv.x * 20.0 + uTime * 1.7)) * 0.0022;
  if (uPortal > 0.0) uv += vec2(sin(uv.y * 10.0 + uTime * 3.0), cos(uv.x * 9.0 + uTime * 2.5)) * 0.012 * uPortal;
  vec3 c = texture(tHDR, uv).rgb;
  c += texture(tBloom, uv).rgb * uBloom;
  c *= uExposure;
  c = aces(c);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  vec2 q = vUv - 0.5;
  float vig = 1.0 - dot(q, q) * uVignette;
  c *= vig;
  if (uHurt > 0.0) c = mix(c, vec3(0.6, 0.0, 0.0), uHurt * smoothstep(0.15, 0.7, length(q)) * 0.8);
  if (uPortal > 0.0) c = mix(c, vec3(0.5, 0.1, 0.8), uPortal * 0.35);
  if (uFreeze > 0.0) c = mix(c, vec3(0.75, 0.9, 1.0), uFreeze * smoothstep(0.2, 0.7, length(q)));
  if (uDarkness > 0.0) c *= 1.0 - uDarkness * (0.6 + 0.4 * smoothstep(0.1, 0.6, length(q)));
  c = toSRGB(c);
  c += (hash12(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}
`;

export const COPY_FS = /* glsl */`
varying vec2 vUv;
uniform sampler2D tSrc;
void main(){ gl_FragColor = texture(tSrc, vUv); }
`;

// --------------------------------------------------------------- ENTITÉS
export const ENTITY_VS = /* glsl */`
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPos;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
export const ENTITY_FS = /* glsl */`
uniform sampler2D uMap;
uniform vec3 uCamPos;
uniform float uSky;
uniform float uBlock;
uniform vec3 uHurtColor;
uniform float uHurt;
uniform float uEmissive;
uniform float uAlpha;
uniform vec3 uTintColor;
uniform float uGlow;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPos;
${COMMON}
${CLOUDS}
${SHADOW}
${LIGHTING}
void main(){
  vec4 a = texture(uMap, vUv);
  if (a.a < 0.4) discard;
  vec3 albedo = a.rgb * uTintColor;
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(uCamPos - vWorldPos);
  float em = uEmissive * (a.a < 0.95 && a.a > 0.85 ? 1.0 : 0.0) + uGlow;
  vec3 col = shade(albedo, N, N, vWorldPos, V, uSky, uBlock, 1.0, 0.15, em, 1.0, false, ign(gl_FragCoord.xy));
  col = mix(col, uHurtColor * (uSkyAmbient + uSunColor * 0.5 + 0.3), uHurt * 0.55);
  gl_FragColor = vec4(col, uAlpha);
}
`;

// --------------------------------------------------------------- PARTICULES
export const PARTICLE_VS = /* glsl */`
attribute vec4 aData;   // x,y taille, z tuile, w type
attribute vec4 aColor;
attribute vec4 aUvRect;
varying vec2 vUv;
flat varying float vTile;
varying vec4 vColor;
flat varying float vType;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
void main(){
  vec3 c = position;
  vec2 corner = aUvRect.zw;
  vec3 wp = c + (uCamRight * corner.x + uCamUp * corner.y) * aData.x;
  vUv = aUvRect.xy + (corner + 0.5) * aData.y;
  vUv.y = aUvRect.y + (0.5 - corner.y) * aData.y;
  vTile = aData.z;
  vType = aData.w;
  vColor = aColor;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;
export const PARTICLE_FS = /* glsl */`
precision highp sampler2DArray;
uniform sampler2DArray uAlbedo;
uniform vec3 uSkyAmbient;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
varying vec2 vUv;
flat varying float vTile;
varying vec4 vColor;
flat varying float vType;
void main(){
  vec3 c;
  float a = 1.0;
  if (vType < 0.5) {
    // fragment de bloc
    vec4 t = textureLod(uAlbedo, vec3(vUv, vTile), 0.0);
    if (t.a < 0.4) discard;
    c = t.rgb * vColor.rgb;
    c *= (uSkyAmbient + uSunColor * max(uSunDir.y, 0.0) * 0.6) * vColor.a + 0.03;
  } else {
    // particule douce (fumée, étincelles, magie...)
    vec2 q = fract(vUv) - 0.5;
    float r = length(q) * 2.0;
    if (r > 1.0) discard;
    float soft = 1.0 - r * r;
    c = vColor.rgb;
    if (vType > 1.5) { c *= 4.0 * soft; } // émissif
    else c *= (uSkyAmbient + uSunColor * 0.4 + 0.05);
    a = vColor.a * soft;
    if (a < 0.02) discard;
  }
  gl_FragColor = vec4(c, a);
}
`;

// Main du joueur / objet tenu (rendu direct à l'écran)
export const HAND_FS = /* glsl */`
precision highp sampler2DArray;
uniform sampler2D uMap;
uniform sampler2DArray uAlbedo;
uniform float uUseArray;
uniform float uTile;
uniform vec3 uLight;
uniform float uExposure;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPos;
vec3 aces(vec3 x){ const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14; return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0); }
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec4 a = texture(uMap, vUv);
  if (a.a < 0.4) discard;
  vec3 N = normalize(vNormal);
  float d = 0.65 + 0.35 * max(dot(N, normalize(vec3(0.3, 0.9, 0.5))), 0.0);
  vec3 c = a.rgb * uLight * d;
  c = toSRGB(aces(c * uExposure));
  gl_FragColor = vec4(c, 1.0);
}
`;
