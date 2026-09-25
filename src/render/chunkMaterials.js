import * as THREE from 'three';

// Shared uniforms driven by the Renderer every frame.
export const worldUniforms = {
  uTime: { value: 0 },
  uSkyLight: { value: 1 },          // multiplier for skylight-lit areas (1 day, ~0.25 night)
  uBlockLightColor: { value: new THREE.Color(1.0, 0.72, 0.42) },
  uBlockLightStrength: { value: 1.6 },
  uWind: { value: 1 },
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
uniform float uTime;
uniform float uWind;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vLight = light;
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
uniform float uSkyLight;
uniform vec3 uBlockLightColor;
uniform float uBlockLightStrength;
uniform float uTime;`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
{
  float ao = vLight.x;
  float sky = vLight.y * vLight.y;               // perceptual falloff
  float blk = pow(vLight.z, 1.6);
  float skyVis = sky * uSkyLight;
  reflectedLight.directDiffuse *= sky * ao;
  reflectedLight.indirectDiffuse *= (0.08 + 0.92 * sky) * ao;
  reflectedLight.indirectDiffuse += diffuseColor.rgb * uBlockLightColor * blk * uBlockLightStrength * ao * (1.0 - 0.55 * skyVis);
  reflectedLight.indirectDiffuse += diffuseColor.rgb * 0.018 * ao;   // cave minimum so it's never pitch black
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
