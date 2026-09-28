import * as THREE from 'three';

/** Gradient sky dome with sun, moon, stars and a drifting cloud layer. Follows the camera. */
export class Sky {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'sky';
    this.uniforms = {
      uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(1, 0.9, 0.7) },
      uNight: { value: 0 }, uTime: { value: 0 }, uOvercast: { value: 0 },
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 uTop, uHorizon, uBottom, uSunDir, uSunColor; uniform float uNight, uTime, uOvercast; varying vec3 vDir;
        float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(smoothstep(0.0, 0.6, h), 0.7)) : mix(uHorizon, uBottom, smoothstep(0.0, 0.25, -h));
          float sd = max(dot(d, uSunDir), 0.0);
          float clear = 1.0 - uOvercast;
          col += uSunColor * pow(sd, 8.0) * 0.35 * (1.0 - uNight) * clear;
          col += uSunColor * pow(sd, 2.0) * 0.12 * (1.0 - uNight) * (1.0 - smoothstep(0.0,0.4,h)) * clear;
          // square pixel sun
          vec3 up = abs(uSunDir.y) > 0.99 ? vec3(1,0,0) : vec3(0,1,0);
          vec3 sx = normalize(cross(up, uSunDir)); vec3 sy = cross(uSunDir, sx);
          vec2 sp = vec2(dot(d, sx), dot(d, sy));
          if (dot(d, uSunDir) > 0.0 && max(abs(sp.x), abs(sp.y)) < 0.055) col = mix(col, vec3(1.0, 0.97, 0.85) * 1.6, clear);
          // moon opposite
          vec3 md = -uSunDir; vec2 mp = vec2(dot(d, -sx), dot(d, sy));
          if (dot(d, md) > 0.0 && max(abs(mp.x), abs(mp.y)) < 0.04) {
            vec2 cell = floor((mp + 0.04) / 0.08 * 8.0);
            float crater = step(0.72, hash(vec3(cell, 3.0)));
            col = mix(col, vec3(0.86, 0.9, 1.0) * (1.0 - crater * 0.25), 0.95 * clear);
          }
          // stars
          if (uNight > 0.01 && h > 0.0) {
            vec3 p = floor(d * 220.0);
            float s = hash(p);
            float tw = 0.6 + 0.4 * sin(uTime * 2.0 + s * 50.0);
            col += vec3(step(0.9975, s) * uNight * tw * smoothstep(0.0, 0.25, h)) * clear;
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    // clouds: a large plane with a procedural blocky cloud texture, scrolling
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const ctx = cv.getContext('2d');
    const rnd = mulberry(7);
    ctx.clearRect(0, 0, 128, 128);
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(rnd() * 128), y = Math.floor(rnd() * 128), w = 4 + Math.floor(rnd() * 14), h = 3 + Math.floor(rnd() * 8);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      for (const ox of [-128, 0, 128]) for (const oy of [-128, 0, 128]) ctx.fillRect(x + ox, y + oy, w, h);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.cloudTex = tex;
    this.cloudMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), this.cloudMat);
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.position.y = 110;
    this.clouds.renderOrder = -5;
    this.group.add(this.clouds);

    // storm deck: a dense, soft, lower cloud layer that closes the sky in bad weather
    const sv = document.createElement('canvas'); sv.width = sv.height = 256;
    const sx = sv.getContext('2d');
    const r2 = mulberry(19);
    for (let i = 0; i < 260; i++) {
      const x = r2() * 256, y = r2() * 256, r = 10 + r2() * 34, a = 0.18 + r2() * 0.3;
      for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
        const gr = sx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
        sx.fillStyle = gr; sx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
    const st = new THREE.CanvasTexture(sv);
    st.wrapS = st.wrapT = THREE.RepeatWrapping; st.repeat.set(2.5, 2.5); st.colorSpace = THREE.SRGBColorSpace;
    this.stormTex = st;
    this.stormMat = new THREE.MeshBasicMaterial({ map: st, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.storm = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), this.stormMat);
    this.storm.rotation.x = -Math.PI / 2;
    this.storm.position.y = 92;
    this.storm.renderOrder = -4;
    this.storm.visible = false;
    this.group.add(this.storm);
    this._drift = { x: 0, z: 0, sx: 0, sz: 0 };
    scene.add(this.group);
  }
  update(dt, camPos, sunDir, colors, night, time, weather) {
    this.group.position.set(camPos.x, 0, camPos.z);
    this.dome.position.y = camPos.y;
    const u = this.uniforms;
    const cover = weather ? weather.cloud : 0.1;
    u.uTop.value.copy(colors.top); u.uHorizon.value.copy(colors.horizon); u.uBottom.value.copy(colors.bottom);
    u.uSunDir.value.copy(sunDir); u.uSunColor.value.copy(colors.sun); u.uNight.value = night; u.uTime.value = time;
    u.uOvercast.value = Math.min(1, Math.max(0, (cover - 0.45) / 0.45) + (weather?.fog || 0) * 0.7);
    // clouds drift with the wind
    const d = this._drift, wx = weather ? weather.wind.x : 1, wz = weather ? weather.wind.z : 0;
    d.x += (0.4 + wx * 0.35) * dt; d.z += wz * 0.35 * dt;
    d.sx += (0.4 + wx * 0.6) * dt; d.sz += wz * 0.6 * dt;
    this.cloudTex.offset.x = ((d.x + camPos.x) / 900 * 3) % 1;
    this.cloudTex.offset.y = ((-d.z - camPos.z) / 900 * 3) % 1;
    this.cloudMat.color.copy(colors.cloud);
    this.cloudMat.opacity = 0.55 + Math.min(0.4, cover * 0.5);
    this.storm.visible = cover > 0.4;
    if (this.storm.visible) {
      this.stormTex.offset.x = ((d.sx + camPos.x) / 900 * 2.5) % 1;
      this.stormTex.offset.y = ((-d.sz - camPos.z) / 900 * 2.5) % 1;
      this.stormMat.opacity = Math.min(1, (cover - 0.4) / 0.5) * 0.95;
      this.stormMat.color.copy(colors.cloud).multiplyScalar(0.8);
    }
  }
}
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
