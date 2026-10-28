import * as THREE from 'three';

// Shared uniforms driven by the Renderer every frame.
export const worldUniforms = {
  uTime: { value: 0 },
  uSkyLight: { value: 1 },          // multiplier for skylight-lit areas (1 day, ~0.25 night)
  uBlockLightColor: { value: new THREE.Color(1.0, 0.72, 0.42) },
  uBlockLightStrength: { value: 1.6 },
  uWind: { value: 1 },
  uWet: { value: 0 },               // 0..1 rain-soaked ground (darker, cooler)
  uSnowCover: { value: 0 },         // 0..1 snow settled on surfaces open to the sky
  uLampPos: { value: new THREE.Vector3() },   // the player's miner's lamp underground
  uLamp: { value: 0 },              // 0..1 its strength (0 on the surface)
};

/**
 * Patches a Lambert material so that it uses the per-vertex `light` attribute:
 *   x = ambient occlusion (0..1), y = sky light (0..1), z = block light (0..1),
 *   w = 0..1 wind sway weight, or 2 = self-emissive (glowing block)
 */
function patch(mat, { sway = false, water = false } = {}) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, worldUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 light;
varying vec4 vLight;
varying float vUp;
varying vec3 vPos;
uniform float uTime;
uniform float uWind;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vLight = light;
vUp = normal.y;
vPos = position;
${sway ? `
float sw = light.w < 1.5 ? light.w : 0.0;
float ph = position.x * 0.7 + position.z * 0.9;
transformed.x += sin(uTime * 1.7 + ph) * 0.06 * sw * uWind;
transformed.z += cos(uTime * 1.3 + ph * 1.3) * 0.05 * sw * uWind;` : ''}
${water ? `
if (normal.y > 0.5) transformed.y += (sin(uTime * 1.6 + position.x * 0.9) * 0.03 + cos(uTime * 1.2 + position.z * 1.1) * 0.03) - 0.04;` : ''}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec4 vLight;
varying float vUp;
varying vec3 vPos;
uniform vec3 uLampPos;
uniform float uLamp;
uniform float uWet;
uniform float uSnowCover;
uniform float uSkyLight;
uniform vec3 uBlockLightColor;
uniform float uBlockLightStrength;
uniform float uTime;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
${water ? `
if (vLight.w > 0.35 && vLight.w < 1.45) {
  // the current (Minecraft's flowing water): bright ripples sliding along the flow, falling down waterfalls
  float a = vLight.x * 6.2831853;
  vec2 fd = vec2(cos(a), sin(a));
  bool pour = vLight.w > 1.35 || vUp < 0.5;
  float ph = pour ? (vPos.y * 2.6 + uTime * 6.0 + dot(vPos.xz, vec2(1.7, 2.3))) : (dot(vPos.xz, fd) * 2.6 - uTime * 3.4 + dot(vPos.xz, vec2(-fd.y, fd.x)) * 0.6);
  float r = sin(ph) * 0.5 + 0.5;
  float s = pour ? 1.0 : clamp(vLight.w - 0.4, 0.0, 1.0);
  diffuseColor.rgb *= 1.0 + 0.28 * s * (r * r - 0.3);
  diffuseColor.a = min(1.0, diffuseColor.a + 0.06 * s);
}` : `
{
  // weather on surfaces open to the sky (sky light ~1): wet = darker and a bit cooler, snow on top faces
  float open = smoothstep(0.82, 0.97, vLight.y);
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.7, 0.73, 0.79), uWet * open);
  float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
  float snow = uSnowCover * open * smoothstep(0.55, 0.9, vUp) * (vLight.w > 1.5 ? 0.0 : 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.96) * (0.9 + lum * 0.25), clamp(snow * 1.15, 0.0, 0.92));
}`}`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
{
  float ao = ${water ? '1.0' : 'vLight.x'};
  float sky = vLight.y * vLight.y;               // perceptual falloff
  float blk = pow(vLight.z, 1.6);
  float skyVis = sky * uSkyLight;
  reflectedLight.directDiffuse *= sky * ao;
  reflectedLight.indirectDiffuse *= (0.08 + 0.92 * sky) * ao;
  reflectedLight.indirectDiffuse += diffuseColor.rgb * uBlockLightColor * blk * uBlockLightStrength * ao * (1.0 - 0.55 * skyVis);
  reflectedLight.indirectDiffuse += diffuseColor.rgb * 0.03 * ao;    // cave minimum so it's never pitch black
  if (uLamp > 0.0) {
    // the miner's lamp: a soft warm light around the player in caves
    float ld = distance(vPos, uLampPos);
    float lk = clamp(1.0 - ld / 15.0, 0.0, 1.0);
    reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(1.0, 0.86, 0.66) * lk * lk * uLamp * 0.75 * ao * (1.0 - sky);
  }
  if (vLight.w > 1.5) totalEmissiveRadiance += diffuseColor.rgb * 0.9;
  // foliage translucency: light scattering through leaves so canopies don't turn black in their own shadow
  if (vLight.w > 0.2 && vLight.w < 0.3) reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.4, 0.46, 0.3) * sky * uSkyLight * ao;
}`);
  };
  mat.customProgramCacheKey = () => 'chunk_' + (sway ? 's' : '') + (water ? 'w' : '');
  return mat;
}

export function createChunkMaterials(atlasTexture) {
  const solid = patch(new THREE.MeshLambertMaterial({ map: atlasTexture, alphaTest: 0.5 }), { sway: true });
  const plants = patch(new THREE.MeshLambertMaterial({ map: atlasTexture, alphaTest: 0.5 }), { sway: true });
  const water = patch(new THREE.MeshLambertMaterial({ map: atlasTexture, transparent: true, opacity: 0.82, depthWrite: false, side: THREE.DoubleSide }), { water: true });
  const glass = patch(new THREE.MeshLambertMaterial({ map: atlasTexture, transparent: true, depthWrite: true }), {});
  // plants cast shadows with alpha test
  const plantDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlasTexture, alphaTest: 0.5 });
  const solidDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlasTexture, alphaTest: 0.5 });
  return { solid, plants, water, glass, plantDepth, solidDepth };
}
