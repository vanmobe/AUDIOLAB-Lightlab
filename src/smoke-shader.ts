/** Two bounded noise scales, shared in world space so intersecting beams reveal the same drifting air. */
export const smokeShader = `
uniform float smokeTime;
float smokeHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float smokeNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(smokeHash(i), smokeHash(i + vec3(1,0,0)), f.x),
        mix(smokeHash(i + vec3(0,1,0)), smokeHash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(smokeHash(i + vec3(0,0,1)), smokeHash(i + vec3(1,0,1)), f.x),
        mix(smokeHash(i + vec3(0,1,1)), smokeHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float smokeDensity(vec3 world) {
  vec3 p = world * vec3(0.9, 0.65, 0.9) - vec3(0.07, 0.13, 0.04) * smokeTime;
  p.x += 0.3 * sin(p.y * 1.4 + smokeTime * 0.12);
  float broad = smokeNoise(p);
  float detail = smokeNoise(p * 2.7 + vec3(7.1, 1.3, 4.8));
  return 0.22 + 1.25 * smoothstep(0.25, 0.75, broad * 0.75 + detail * 0.25);
}
`
