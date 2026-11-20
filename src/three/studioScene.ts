import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type EquipmentId = 'kettlebell' | 'dumbbell' | 'gyro';
export type FinishId = 'royal_titanium' | 'matte_obsidian' | 'rose_copper';
export type CameraPresetId = 'hero' | 'side' | 'top';

export interface StudioSceneApi {
  setEquipment: (id: EquipmentId) => void;
  setFinish: (id: FinishId) => void;
  setExploded: (exploded: boolean) => void;
  setAnimating: (playing: boolean) => void;
  setCameraPreset: (preset: CameraPresetId) => void;
  setDarkMode: (isDark: boolean) => void;
  isSoftwareRenderer: boolean;
  dispose: () => void;
}

interface ExplodablePart {
  mesh: THREE.Object3D;
  basePos: THREE.Vector3;
  explodeOffset: THREE.Vector3;
}

const FINISH_CONFIGS: Record<
  FinishId,
  { primary: number; secondary: number; accent: number; metalness: number; roughness: number }
> = {
  royal_titanium: {
    primary: 0x3b2f6e,
    secondary: 0xc8ccd6,
    accent: 0x6b5aa8,
    metalness: 0.72,
    roughness: 0.28,
  },
  matte_obsidian: {
    primary: 0x1e2028,
    secondary: 0x4b5563,
    accent: 0x10b981,
    metalness: 0.35,
    roughness: 0.58,
  },
  rose_copper: {
    primary: 0xbe123c,
    secondary: 0xd9a189,
    accent: 0xf43f5e,
    metalness: 0.78,
    roughness: 0.24,
  },
};

function detectSoftwareGl(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '')
      : String(gl.getParameter(gl.RENDERER) || '');
    return /swiftshader|llvmpipe|mesa|software/i.test(rendererStr);
  } catch {
    return false;
  }
}

export function createStudioScene(container: HTMLElement): StudioSceneApi {
  const width = Math.max(300, container.clientWidth);
  const height = Math.max(300, container.clientHeight);

  const probeCanvas = document.createElement('canvas');
  const probeGl =
    probeCanvas.getContext('webgl2') ||
    (probeCanvas.getContext('webgl') as WebGLRenderingContext | null);
  const isSoftwareRenderer = probeGl ? detectSoftwareGl(probeGl) : false;

  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareRenderer,
    powerPreference: isSoftwareRenderer ? 'low-power' : 'high-performance',
  });
  renderer.setPixelRatio(isSoftwareRenderer ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !isSoftwareRenderer;
  if (!isSoftwareRenderer) {
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeef0f8);
  scene.fog = new THREE.Fog(0xeef0f8, 8, 22);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;

  const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 60);
  camera.position.set(2.4, 1.8, 3.0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !isSoftwareRenderer;
  controls.dampingFactor = 0.06;
  controls.minDistance = 1.4;
  controls.maxDistance = 8.5;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.target.set(0, 0.72, 0);
  controls.update();

  // Lighting: Warm Key Directional + Cool Sky Hemisphere + Subtle Rim
  const hemi = new THREE.HemisphereLight(0xdfe8ff, 0xc9cdd8, 0.75);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xfff4e6, 2.2);
  keyLight.position.set(3.6, 5.2, 3.2);
  if (!isSoftwareRenderer) {
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 16;
    keyLight.shadow.camera.left = -2.5;
    keyLight.shadow.camera.right = 2.5;
    keyLight.shadow.camera.top = 2.5;
    keyLight.shadow.camera.bottom = -2.5;
    keyLight.shadow.bias = -0.0006;
  }
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xc7d2fe, 0.9);
  rimLight.position.set(-3.0, 2.5, -3.2);
  scene.add(rimLight);

  // Studio Floor Disc + Subtle Calibrated Grid Ring
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xe4e7f2,
    roughness: 0.75,
    metalness: 0.05,
  });
  const floorMesh = new THREE.Mesh(new THREE.CircleGeometry(6.5, 48), floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = !isSoftwareRenderer;
  scene.add(floorMesh);

  const gridHelper = new THREE.GridHelper(6, 16, 0x9ca3c9, 0xd4d8ea);
  gridHelper.position.y = 0.003;
  scene.add(gridHelper);

  // Shared PBR Materials updated dynamically by Finish selector
  const primaryMat = new THREE.MeshStandardMaterial({
    color: FINISH_CONFIGS.royal_titanium.primary,
    metalness: FINISH_CONFIGS.royal_titanium.metalness,
    roughness: FINISH_CONFIGS.royal_titanium.roughness,
  });
  const secondaryMat = new THREE.MeshStandardMaterial({
    color: FINISH_CONFIGS.royal_titanium.secondary,
    metalness: 0.85,
    roughness: 0.22,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: FINISH_CONFIGS.royal_titanium.accent,
    metalness: 0.5,
    roughness: 0.35,
  });
  const rubberMat = new THREE.MeshStandardMaterial({
    color: 0x181a20,
    metalness: 0.05,
    roughness: 0.82,
  });

  // ==================== 1. CALIBRATED KETTLEBELL ====================
  const kettlebellGroup = new THREE.Group();
  const kettleParts: ExplodablePart[] = [];

  const bellProfile = [
    new THREE.Vector2(0.0, 0.05),
    new THREE.Vector2(0.28, 0.05),
    new THREE.Vector2(0.39, 0.15),
    new THREE.Vector2(0.45, 0.34),
    new THREE.Vector2(0.42, 0.56),
    new THREE.Vector2(0.30, 0.72),
    new THREE.Vector2(0.18, 0.78),
    new THREE.Vector2(0.0, 0.78),
  ];
  const bellGeo = new THREE.LatheGeometry(bellProfile, 36);
  const bellMesh = new THREE.Mesh(bellGeo, primaryMat);
  bellMesh.castShadow = !isSoftwareRenderer;
  bellMesh.receiveShadow = !isSoftwareRenderer;
  kettlebellGroup.add(bellMesh);
  kettleParts.push({
    mesh: bellMesh,
    basePos: bellMesh.position.clone(),
    explodeOffset: new THREE.Vector3(0, 0, 0),
  });

  const baseRingGeo = new THREE.CylinderGeometry(0.31, 0.33, 0.06, 36);
  const baseRingMesh = new THREE.Mesh(baseRingGeo, rubberMat);
  baseRingMesh.position.set(0, 0.03, 0);
  baseRingMesh.castShadow = !isSoftwareRenderer;
  kettlebellGroup.add(baseRingMesh);
  kettleParts.push({
    mesh: baseRingMesh,
    basePos: baseRingMesh.position.clone(),
    explodeOffset: new THREE.Vector3(0, -0.22, 0),
  });

  const handleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.26, 0.68, 0),
    new THREE.Vector3(-0.34, 0.96, 0),
    new THREE.Vector3(0, 1.09, 0),
    new THREE.Vector3(0.34, 0.96, 0),
    new THREE.Vector3(0.26, 0.68, 0),
  ]);
  const handleGeo = new THREE.TubeGeometry(handleCurve, 32, 0.055, 16, false);
  const handleMesh = new THREE.Mesh(handleGeo, secondaryMat);
  handleMesh.castShadow = !isSoftwareRenderer;
  kettlebellGroup.add(handleMesh);
  kettleParts.push({
    mesh: handleMesh,
    basePos: handleMesh.position.clone(),
    explodeOffset: new THREE.Vector3(0, 0.34, 0),
  });

  const badgeGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.04, 28);
  const badgeMesh = new THREE.Mesh(badgeGeo, accentMat);
  badgeMesh.rotation.x = Math.PI / 2;
  badgeMesh.position.set(0, 0.42, 0.435);
  kettlebellGroup.add(badgeMesh);
  kettleParts.push({
    mesh: badgeMesh,
    basePos: badgeMesh.position.clone(),
    explodeOffset: new THREE.Vector3(0, 0, 0.32),
  });
  scene.add(kettlebellGroup);

  // ==================== 2. MACHINED HEX DUMBBELL ====================
  const dumbbellGroup = new THREE.Group();
  dumbbellGroup.position.set(0, 0.42, 0);
  const dumbbellParts: ExplodablePart[] = [];

  const barGeo = new THREE.CylinderGeometry(0.052, 0.052, 1.1, 24);
  barGeo.rotateZ(Math.PI / 2);
  const barMesh = new THREE.Mesh(barGeo, secondaryMat);
  barMesh.castShadow = !isSoftwareRenderer;
  dumbbellGroup.add(barMesh);
  dumbbellParts.push({
    mesh: barMesh,
    basePos: barMesh.position.clone(),
    explodeOffset: new THREE.Vector3(0, 0, 0),
  });

  const hexShape = new THREE.Shape();
  const hexRadius = 0.32;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const x = Math.cos(a) * hexRadius;
    const y = Math.sin(a) * hexRadius;
    if (i === 0) hexShape.moveTo(x, y);
    else hexShape.lineTo(x, y);
  }
  hexShape.closePath();

  const hexGeo = new THREE.ExtrudeGeometry(hexShape, {
    depth: 0.14,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 3,
  });
  hexGeo.rotateY(Math.PI / 2);
  hexGeo.center();

  const collarGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.06, 24);
  collarGeo.rotateZ(Math.PI / 2);

  const boltGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.04, 6);
  boltGeo.rotateZ(Math.PI / 2);

  for (const side of [-1, 1] as const) {
    const innerPlate = new THREE.Mesh(hexGeo, primaryMat);
    innerPlate.position.set(side * 0.38, 0, 0);
    innerPlate.castShadow = !isSoftwareRenderer;
    dumbbellGroup.add(innerPlate);
    dumbbellParts.push({
      mesh: innerPlate,
      basePos: innerPlate.position.clone(),
      explodeOffset: new THREE.Vector3(side * 0.24, 0, 0),
    });

    const outerPlate = new THREE.Mesh(hexGeo, rubberMat);
    outerPlate.scale.set(0.75, 0.88, 0.88);
    outerPlate.position.set(side * 0.56, 0, 0);
    outerPlate.castShadow = !isSoftwareRenderer;
    dumbbellGroup.add(outerPlate);
    dumbbellParts.push({
      mesh: outerPlate,
      basePos: outerPlate.position.clone(),
      explodeOffset: new THREE.Vector3(side * 0.52, 0, 0),
    });

    const collar = new THREE.Mesh(collarGeo, accentMat);
    collar.position.set(side * 0.24, 0, 0);
    dumbbellGroup.add(collar);
    dumbbellParts.push({
      mesh: collar,
      basePos: collar.position.clone(),
      explodeOffset: new THREE.Vector3(side * 0.12, 0, 0),
    });

    const bolt = new THREE.Mesh(boltGeo, secondaryMat);
    bolt.position.set(side * 0.65, 0, 0);
    dumbbellGroup.add(bolt);
    dumbbellParts.push({
      mesh: bolt,
      basePos: bolt.position.clone(),
      explodeOffset: new THREE.Vector3(side * 0.72, 0, 0),
    });
  }
  dumbbellGroup.visible = false;
  scene.add(dumbbellGroup);

  // ==================== 3. CORE BALANCE GYRO ====================
  const gyroGroup = new THREE.Group();
  const gyroParts: ExplodablePart[] = [];

  const standMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 0.12, 36), rubberMat);
  standMesh.position.set(0, 0.06, 0);
  standMesh.castShadow = !isSoftwareRenderer;
  gyroGroup.add(standMesh);
  gyroParts.push({
    mesh: standMesh,
    basePos: standMesh.position.clone(),
    explodeOffset: new THREE.Vector3(0, -0.18, 0),
  });

  const pillarMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.34, 24), secondaryMat);
  pillarMesh.position.set(0, 0.28, 0);
  gyroGroup.add(pillarMesh);
  gyroParts.push({
    mesh: pillarMesh,
    basePos: pillarMesh.position.clone(),
    explodeOffset: new THREE.Vector3(0, -0.05, 0),
  });

  const outerRing = new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.045, 20, 48), primaryMat);
  outerRing.position.set(0, 0.92, 0);
  outerRing.castShadow = !isSoftwareRenderer;
  gyroGroup.add(outerRing);
  gyroParts.push({
    mesh: outerRing,
    basePos: outerRing.position.clone(),
    explodeOffset: new THREE.Vector3(0, 0.18, 0),
  });

  const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.036, 18, 42), secondaryMat);
  innerRing.position.set(0, 0.92, 0);
  innerRing.rotation.y = Math.PI / 3;
  innerRing.castShadow = !isSoftwareRenderer;
  gyroGroup.add(innerRing);
  gyroParts.push({
    mesh: innerRing,
    basePos: innerRing.position.clone(),
    explodeOffset: new THREE.Vector3(0, 0.32, 0),
  });

  const coreSphere = new THREE.Mesh(new THREE.SphereGeometry(0.18, 32, 24), accentMat);
  coreSphere.position.set(0, 0.92, 0);
  coreSphere.castShadow = !isSoftwareRenderer;
  gyroGroup.add(coreSphere);
  gyroParts.push({
    mesh: coreSphere,
    basePos: coreSphere.position.clone(),
    explodeOffset: new THREE.Vector3(0, 0.46, 0),
  });

  gyroGroup.visible = false;
  scene.add(gyroGroup);

  // State + Pre-allocated scratch values (zero per-frame allocations)
  let activeEquipment: EquipmentId = 'kettlebell';
  let explodeFactor = 0;
  let targetExplode = 0;
  let isAnimating = false;
  let phaseAngle = 0;
  let rafId = 0;
  let renderPending = false;
  let disposed = false;

  const scratchOffset = new THREE.Vector3();

  const allGroups: Record<EquipmentId, THREE.Group> = {
    kettlebell: kettlebellGroup,
    dumbbell: dumbbellGroup,
    gyro: gyroGroup,
  };
  const allParts: ExplodablePart[] = [...kettleParts, ...dumbbellParts, ...gyroParts];

  function applySceneTransforms(dtSeconds: number) {
    // Smooth explode lerp
    const diff = targetExplode - explodeFactor;
    if (Math.abs(diff) > 0.002) {
      explodeFactor += diff * Math.min(1, dtSeconds * 9);
      for (let i = 0; i < allParts.length; i++) {
        const p = allParts[i];
        scratchOffset.copy(p.explodeOffset).multiplyScalar(explodeFactor);
        p.mesh.position.copy(p.basePos).add(scratchOffset);
      }
    } else if (explodeFactor !== targetExplode) {
      explodeFactor = targetExplode;
      for (let i = 0; i < allParts.length; i++) {
        const p = allParts[i];
        scratchOffset.copy(p.explodeOffset).multiplyScalar(explodeFactor);
        p.mesh.position.copy(p.basePos).add(scratchOffset);
      }
    }

    if (isAnimating) {
      phaseAngle += dtSeconds * 1.9;
      if (activeEquipment === 'kettlebell') {
        kettlebellGroup.rotation.x = Math.sin(phaseAngle) * 0.34;
        kettlebellGroup.position.y = Math.max(0, Math.sin(phaseAngle * 2) * 0.16);
      } else if (activeEquipment === 'dumbbell') {
        dumbbellGroup.position.y = 0.42 + Math.sin(phaseAngle) * 0.22;
        dumbbellGroup.rotation.z = Math.sin(phaseAngle * 0.5) * 0.08;
      } else {
        outerRing.rotation.y = phaseAngle * 0.7;
        innerRing.rotation.x = phaseAngle * 1.1;
        coreSphere.rotation.y = phaseAngle * 1.5;
      }
    }
  }

  let lastTime = performance.now();

  function drawFrame() {
    renderPending = false;
    if (disposed) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    controls.update();
    applySceneTransforms(dt);
    renderer.render(scene, camera);

    const needsMore =
      isAnimating ||
      Math.abs(targetExplode - explodeFactor) > 0.002;
    if (needsMore) {
      rafId = requestAnimationFrame(drawFrame);
    }
  }

  function requestRender() {
    if (disposed || renderPending) return;
    renderPending = true;
    rafId = requestAnimationFrame(drawFrame);
  }

  // Controls trigger on-demand redraws; damping/continuous loop avoided on software WebGL
  controls.addEventListener('change', requestRender);

  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const w = Math.max(300, entry.contentRect.width);
      const h = Math.max(300, entry.contentRect.height);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    }
  });
  resizeObserver.observe(container);

  // Initial synchronous render so canvas has crisp frame immediately
  renderer.render(scene, camera);

  return {
    isSoftwareRenderer,
    setEquipment(id: EquipmentId) {
      activeEquipment = id;
      (Object.keys(allGroups) as EquipmentId[]).forEach((k) => {
        allGroups[k].visible = k === id;
      });
      kettlebellGroup.rotation.set(0, 0, 0);
      kettlebellGroup.position.set(0, 0, 0);
      dumbbellGroup.position.set(0, 0.42, 0);
      dumbbellGroup.rotation.set(0, 0, 0);
      requestRender();
    },
    setFinish(id: FinishId) {
      const cfg = FINISH_CONFIGS[id];
      primaryMat.color.setHex(cfg.primary);
      primaryMat.metalness = cfg.metalness;
      primaryMat.roughness = cfg.roughness;
      secondaryMat.color.setHex(cfg.secondary);
      accentMat.color.setHex(cfg.accent);
      requestRender();
    },
    setExploded(exploded: boolean) {
      targetExplode = exploded ? 1 : 0;
      requestRender();
    },
    setAnimating(playing: boolean) {
      isAnimating = playing;
      lastTime = performance.now();
      requestRender();
    },
    setCameraPreset(preset: CameraPresetId) {
      if (preset === 'hero') {
        camera.position.set(2.4, 1.8, 3.0);
        controls.target.set(0, 0.72, 0);
      } else if (preset === 'side') {
        camera.position.set(3.4, 0.95, 0.05);
        controls.target.set(0, 0.65, 0);
      } else {
        camera.position.set(0.05, 3.8, 0.8);
        controls.target.set(0, 0.45, 0);
      }
      controls.update();
      requestRender();
    },
    setDarkMode(isDark: boolean) {
      const hex = isDark ? 0x0f1324 : 0xeef0f8;
      scene.background = new THREE.Color(hex);
      scene.fog = new THREE.Fog(hex, 8, 22);
      requestRender();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      controls.removeEventListener('change', requestRender);
      controls.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      });
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}
