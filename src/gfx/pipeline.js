// Pipeline de rendu « réaliste » : ombres, ciel physique, eau SSR, volumétrique, bloom, tonemapping
import * as THREE from 'three';
import * as SH from './shaders.js';
import { buildTiles, S as TILE_SIZE } from './textures.js';

export class Pipeline {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false, preserveDrawingBuffer: false });
    if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 requis');
    renderer.autoClear = false;
    renderer.setPixelRatio(1);
    this.renderer = renderer;
    const ext = renderer.extensions;
    this.hdrType = (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float')) ? THREE.HalfFloatType : THREE.UnsignedByteType;

    // ---- textures de blocs (tableaux de textures)
    const tiles = buildTiles();
    this.tiles = tiles;
    const mk = (data, srgb) => {
      const t = new THREE.DataArrayTexture(data, TILE_SIZE, TILE_SIZE, tiles.count);
      t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
      t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
      t.generateMipmaps = true;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      t.needsUpdate = true;
      return t;
    };
    this.albedoTex = mk(tiles.albedo, true);
    this.matTex = mk(tiles.material, false);

    // ---- scènes et caméras
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 600);
    this.terrainScene = new THREE.Scene();
    this.entityScene = new THREE.Scene();
    this.shadowScene = new THREE.Scene();
    this.waterScene = new THREE.Scene();
    this.handScene = new THREE.Scene();
    this.handCamera = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
    for (const s of [this.terrainScene, this.entityScene, this.shadowScene, this.waterScene, this.handScene]) { s.matrixWorldAutoUpdate = true; }
    this.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.fsGeom = tri;

    // ---- uniformes partagés
    const U = this.U = {
      uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Vector3(1, 1, 1) },
      uSkyAmbient: { value: new THREE.Vector3(0.3, 0.4, 0.6) }, uBlockColor: { value: new THREE.Vector3(1.0, 0.72, 0.42) },
      uMinLight: { value: 0.006 }, uWet: { value: 0 }, uDim: { value: 0 }, uSkyLUT: { value: null }, uFlicker: { value: 0 },
      uShadowMap: { value: null }, uShadowMatrix: { value: new THREE.Matrix4() }, uShadowTexel: { value: 1 / 2048 }, uShadowOn: { value: 1 },
      uCamPos: { value: new THREE.Vector3() }, uWindStrength: { value: 1 }, uCloudCover: { value: 0.3 }, uWind: { value: new THREE.Vector2() },
      uAlbedo: { value: this.albedoTex }, uMat: { value: this.matTex },
    };

    // ---- matériaux du terrain
    this.terrainMat = new THREE.ShaderMaterial({
      vertexShader: SH.TERRAIN_VS, fragmentShader: SH.TERRAIN_FS, uniforms: U,
    });
    this.terrainShadowMat = new THREE.ShaderMaterial({
      vertexShader: SH.SHADOW_TERRAIN_VS, fragmentShader: SH.SHADOW_TERRAIN_FS, uniforms: U, side: THREE.DoubleSide,
    });
    this.basicShadowMat = new THREE.ShaderMaterial({ vertexShader: SH.SHADOW_BASIC_VS, fragmentShader: SH.SHADOW_BASIC_FS, side: THREE.DoubleSide });
    this.waterU = {
      ...U,
      uSceneColor: { value: null }, uSceneDepth: { value: null }, uResolution: { value: new THREE.Vector2(1, 1) },
      uProj: { value: new THREE.Matrix4() }, uInvProj: { value: new THREE.Matrix4() }, uNear: { value: 0.05 }, uFar: { value: 600 },
      uSSR: { value: 1 }, uCamUnderwater: { value: 0 },
    };
    this.waterMat = new THREE.ShaderMaterial({
      vertexShader: SH.WATER_VS, fragmentShader: SH.WATER_FS, uniforms: this.waterU, side: THREE.DoubleSide,
    });

    // ---- ciel
    this.skyU = {
      ...U, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
      uSun: { value: new THREE.Vector3() }, uMoon: { value: new THREE.Vector3() }, uRain: { value: 0 }, uStars: { value: 0 },
      uClouds: { value: 1 }, uMoonPhase: { value: 0 },
    };
    this.skyMat = new THREE.ShaderMaterial({ vertexShader: SH.SKY_VS, fragmentShader: SH.SKY_FS, uniforms: this.skyU, depthWrite: false, depthTest: true });
    this.skyMesh = new THREE.Mesh(this.fsGeom, this.skyMat);
    this.skyMesh.frustumCulled = false;
    this.skyMesh.renderOrder = 1e9;
    this.terrainScene.add(this.skyMesh);
    this.lutU = { uSun: { value: new THREE.Vector3() }, uMoon: { value: new THREE.Vector3() }, uRain: { value: 0 }, uSunIntensity: { value: 22 } };
    this.lutMat = this.fsMat(SH.SKY_LUT_FS, this.lutU);
    this.lutRT = new THREE.WebGLRenderTarget(256, 128, { type: this.hdrType, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping });
    U.uSkyLUT.value = this.lutRT.texture;

    // ---- composition, bloom, final
    this.compU = {
      ...U, tScene: { value: null }, tSceneDepth: { value: null }, tWater: { value: null }, tWaterDepth: { value: null },
      uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uNear: { value: 0.05 }, uFar: { value: 600 },
      uFogDist: { value: 128 }, uFogDensity: { value: 0.0018 }, uFogColor: { value: new THREE.Vector3() }, uUnderwater: { value: 0 },
      uUnderLava: { value: 0 }, uVolumetric: { value: 1 }, uWaterColor: { value: new THREE.Vector3(0.1, 0.35, 0.55) }, uBlindness: { value: 0 },
    };
    this.compMat = this.fsMat(SH.COMPOSITE_FS, this.compU);
    this.bloomPreU = { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.6 } };
    this.bloomPreMat = this.fsMat(SH.BLOOM_PREFILTER_FS, this.bloomPreU);
    this.bloomDownU = { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } };
    this.bloomDownMat = this.fsMat(SH.BLOOM_DOWN_FS, this.bloomDownU);
    this.bloomUpU = { tSrc: { value: null }, tPrev: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 } };
    this.bloomUpMat = this.fsMat(SH.BLOOM_UP_FS, this.bloomUpU);
    this.finalU = {
      tHDR: { value: null }, tBloom: { value: null }, uBloom: { value: 0.06 }, uExposure: { value: 1 }, uTime: U.uTime,
      uUnderwater: { value: 0 }, uHurt: { value: 0 }, uPortal: { value: 0 }, uDarkness: { value: 0 }, uVignette: { value: 0.55 },
      uSaturation: { value: 1.08 }, uFreeze: { value: 0 },
    };
    this.finalMat = this.fsMat(SH.FINAL_FS, this.finalU);
    this.copyU = { tSrc: { value: null } };
    this.copyMat = this.fsMat(SH.COPY_FS, this.copyU);
    this.fsMesh = new THREE.Mesh(this.fsGeom, this.compMat);
    this.fsMesh.frustumCulled = false;
    this.fsScene = new THREE.Scene();
    this.fsScene.add(this.fsMesh);

    // ---- ombres
    this.shadowCam = new THREE.OrthographicCamera(-64, 64, 64, -64, 1, 500);
    this.shadowRT = null;
    this.setShadowQuality(settings.shadows);

    this.width = 0; this.height = 0;
    this.resize();
    this.frame = 0;
  }

  fsMat(frag, uniforms) {
    return new THREE.ShaderMaterial({ vertexShader: SH.FULLSCREEN_VS, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  }

  setShadowQuality(q) {
    if (this.shadowRT) { this.shadowRT.depthTexture.dispose(); this.shadowRT.dispose(); this.shadowRT = null; }
    this.U.uShadowOn.value = q > 0 ? 1 : 0;
    if (!q) return;
    const size = q >= 2 ? 4096 : 2048;
    const dt = new THREE.DepthTexture(size, size, THREE.FloatType);
    dt.minFilter = THREE.NearestFilter; dt.magFilter = THREE.NearestFilter;
    this.shadowRT = new THREE.WebGLRenderTarget(size, size, { depthTexture: dt, depthBuffer: true, type: THREE.UnsignedByteType, format: THREE.RedFormat });
    this.shadowRange = q >= 2 ? 80 : 64;
    this.U.uShadowMap.value = dt;
    this.U.uShadowTexel.value = 1 / size;
    this.shadowSize = size;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * (this.settings.renderScale || 1);
    const w = Math.max(1, Math.floor(window.innerWidth * dpr)), h = Math.max(1, Math.floor(window.innerHeight * dpr));
    if (w === this.width && h === this.height) return;
    this.width = w; this.height = h;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.handCamera.aspect = w / h; this.handCamera.updateProjectionMatrix();
    const mkRT = (ww, hh, depth) => {
      const o = { type: this.hdrType, depthBuffer: !!depth, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter };
      if (depth) { const dt = new THREE.DepthTexture(ww, hh, THREE.FloatType); dt.minFilter = THREE.NearestFilter; dt.magFilter = THREE.NearestFilter; o.depthTexture = dt; }
      return new THREE.WebGLRenderTarget(ww, hh, o);
    };
    for (const k of ['sceneRT', 'waterRT', 'hdrRT']) if (this[k]) { if (this[k].depthTexture) this[k].depthTexture.dispose(); this[k].dispose(); }
    if (this.bloomRTs) for (const r of this.bloomRTs) { r.down.dispose(); r.up.dispose(); }
    this.sceneRT = mkRT(w, h, true);
    this.waterRT = mkRT(w, h, true);
    this.waterRT.texture.format = THREE.RGBAFormat;
    this.hdrRT = mkRT(w, h, false);
    this.bloomRTs = [];
    let bw = Math.max(1, w >> 1), bh = Math.max(1, h >> 1);
    for (let i = 0; i < 6; i++) {
      this.bloomRTs.push({ down: mkRT(bw, bh, false), up: mkRT(bw, bh, false), w: bw, h: bh });
      bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
    }
    this.waterU.uResolution.value.set(w, h);
  }

  pass(mat, target) {
    this.fsMesh.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.fsScene, this.fsCam);
  }

  // ------------------------------------------------------------- MAILLAGES
  makeSectionGeometry(d) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(d.nor, 3, true));
    g.setAttribute('uv', new THREE.BufferAttribute(d.uv, 2, true));
    g.setAttribute('aTile', new THREE.BufferAttribute(d.tile, 1));
    g.setAttribute('aFlags', new THREE.BufferAttribute(d.flags, 1));
    g.setAttribute('aLight', new THREE.BufferAttribute(d.light, 4, true));
    g.setAttribute('aColor', new THREE.BufferAttribute(d.col, 4, true));
    g.setIndex(new THREE.BufferAttribute(d.idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(8, 8, 8), 16);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(17, 17, 17));
    return g;
  }

  setSection(sec, res, x, y, z) {
    this.clearSection(sec);
    if (res.solid) {
      const g = this.makeSectionGeometry(res.solid);
      const m = new THREE.Mesh(g, this.terrainMat);
      m.position.set(x, y, z); m.matrixAutoUpdate = false; m.updateMatrix();
      this.terrainScene.add(m);
      const sm = new THREE.Mesh(g, this.terrainShadowMat);
      sm.position.set(x, y, z); sm.matrixAutoUpdate = false; sm.updateMatrix();
      this.shadowScene.add(sm);
      sec.solid = m; sec.shadow = sm;
    }
    if (res.trans) {
      const g = this.makeSectionGeometry(res.trans);
      const m = new THREE.Mesh(g, this.waterMat);
      m.position.set(x, y, z); m.matrixAutoUpdate = false; m.updateMatrix();
      this.waterScene.add(m);
      sec.trans = m;
    }
  }

  clearSection(sec) {
    if (sec.solid) { this.terrainScene.remove(sec.solid); this.shadowScene.remove(sec.shadow); sec.solid.geometry.dispose(); sec.solid = null; sec.shadow = null; }
    if (sec.trans) { this.waterScene.remove(sec.trans); sec.trans.geometry.dispose(); sec.trans = null; }
  }

  // ------------------------------------------------------------------ RENDU
  updateShadowCamera(center, sunDir) {
    const cam = this.shadowCam, R = this.shadowRange;
    const L = sunDir.clone().normalize();
    // axes de l'espace lumière
    const up = Math.abs(L.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, L).normalize();
    const lup = new THREE.Vector3().crossVectors(L, right).normalize();
    const texel = (2 * R) / this.shadowSize;
    const cr = Math.round(center.dot(right) / texel) * texel;
    const cu = Math.round(center.dot(lup) / texel) * texel;
    const cl = center.dot(L);
    const snapped = right.clone().multiplyScalar(cr).add(lup.clone().multiplyScalar(cu)).add(L.clone().multiplyScalar(cl));
    cam.position.copy(snapped).addScaledVector(L, 250);
    cam.up.copy(lup);
    cam.lookAt(snapped);
    cam.left = -R; cam.right = R; cam.top = R; cam.bottom = -R; cam.near = 1; cam.far = 500;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    const bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.U.uShadowMatrix.value.copy(bias).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
  }

  render(st) {
    const r = this.renderer, U = this.U, cam = this.camera, S = this.settings;
    this.frame++;
    cam.updateMatrixWorld();
    U.uCamPos.value.copy(cam.position);

    // 1) LUT du ciel
    if (st.dim === 0 && (this.frame % 2 === 0 || this.frame < 3)) this.pass(this.lutMat, this.lutRT);

    // 2) carte d'ombre
    if (this.shadowRT && st.shadowLight) {
      if (this.frame % (S.shadowEvery || 1) === 0) {
        this.updateShadowCamera(st.shadowCenter, U.uSunDir.value);
        r.setRenderTarget(this.shadowRT);
        r.setClearColor(0xffffff, 1);
        r.clear(true, true, false);
        this.shadowCam.layers.set(0);
        r.render(this.shadowScene, this.shadowCam);
        this.shadowCam.layers.set(1);
        this.entityScene.overrideMaterial = this.basicShadowMat;
        r.render(this.entityScene, this.shadowCam);
        this.entityScene.overrideMaterial = null;
      }
      U.uShadowOn.value = 1;
    } else U.uShadowOn.value = 0;

    // 3) scène opaque + ciel
    this.skyU.uInvProj.value.copy(cam.projectionMatrixInverse);
    this.skyU.uCamWorld.value.copy(cam.matrixWorld);
    r.setRenderTarget(this.sceneRT);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, false);
    r.render(this.terrainScene, cam);
    r.render(this.entityScene, cam);

    // 4) eau et blocs translucides
    const W = this.waterU;
    W.uSceneColor.value = this.sceneRT.texture;
    W.uSceneDepth.value = this.sceneRT.depthTexture;
    W.uProj.value.copy(cam.projectionMatrix);
    W.uInvProj.value.copy(cam.projectionMatrixInverse);
    W.uNear.value = cam.near; W.uFar.value = cam.far;
    W.uSSR.value = S.ssr ? 1 : 0;
    r.setRenderTarget(this.waterRT);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    r.render(this.waterScene, cam);

    // 5) composition HDR (brouillard + volumétrique)
    const C = this.compU;
    C.tScene.value = this.sceneRT.texture; C.tSceneDepth.value = this.sceneRT.depthTexture;
    C.tWater.value = this.waterRT.texture; C.tWaterDepth.value = this.waterRT.depthTexture;
    C.uInvProj.value.copy(cam.projectionMatrixInverse); C.uCamWorld.value.copy(cam.matrixWorld);
    C.uNear.value = cam.near; C.uFar.value = cam.far;
    C.uVolumetric.value = S.volumetric ? 1 : 0;
    this.pass(this.compMat, this.hdrRT);

    // 6) bloom
    let bloomTex = null;
    if (S.bloom) {
      const B = this.bloomRTs;
      this.bloomPreU.tSrc.value = this.hdrRT.texture;
      this.bloomPreU.uTexel.value.set(1 / this.width, 1 / this.height);
      this.pass(this.bloomPreMat, B[0].down);
      for (let i = 1; i < B.length; i++) {
        this.bloomDownU.tSrc.value = B[i - 1].down.texture;
        this.bloomDownU.uTexel.value.set(1 / B[i - 1].w, 1 / B[i - 1].h);
        this.pass(this.bloomDownMat, B[i].down);
      }
      let prev = B[B.length - 1].down;
      for (let i = B.length - 2; i >= 0; i--) {
        this.bloomUpU.tSrc.value = prev.texture;
        this.bloomUpU.tPrev.value = B[i].down.texture;
        this.bloomUpU.uTexel.value.set(1 / B[i + 1].w, 1 / B[i + 1].h);
        this.pass(this.bloomUpMat, B[i].up);
        prev = B[i].up;
      }
      bloomTex = B[0].up.texture;
    }

    // 7) final
    const F = this.finalU;
    F.tHDR.value = this.hdrRT.texture;
    F.tBloom.value = bloomTex || this.hdrRT.texture;
    F.uBloom.value = S.bloom ? 0.055 : 0;
    this.pass(this.finalMat, null);

    // 8) main / objet tenu
    if (this.handScene.children.length && st.showHand) {
      r.setRenderTarget(null);
      r.clearDepth();
      r.render(this.handScene, this.handCamera);
    }
  }
}
