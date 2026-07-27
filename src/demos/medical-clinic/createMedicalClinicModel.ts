import * as THREE from 'three';

/**
 * ROUNDED COURTYARD MEDICAL CLINIC
 *
 * A code-only procedural reconstruction from one isometric reference. The visible front,
 * left elevation, roof and courtyard drive the geometry; the rear/right faces and room plan
 * are deliberately inferred. The model is a stylized real-time diorama, not an architectural
 * survey or photogrammetric asset.
 */

export interface MedicalClinicOptions {
  scale?: number;
  shadows?: boolean;
}

interface BuildContext {
  shadows: boolean;
  mats: {
    shell: THREE.MeshPhysicalMaterial;
    shellShade: THREE.MeshStandardMaterial;
    glass: THREE.MeshPhysicalMaterial;
    glassDark: THREE.MeshPhysicalMaterial;
    warmWall: THREE.MeshStandardMaterial;
    grass: THREE.MeshStandardMaterial;
    paving: THREE.MeshStandardMaterial;
    pavingSide: THREE.MeshStandardMaterial;
    metal: THREE.MeshStandardMaterial;
    wood: THREE.MeshStandardMaterial;
    cream: THREE.MeshStandardMaterial;
    emissive: THREE.MeshStandardMaterial;
    bulb: THREE.MeshStandardMaterial;
    curbGlow: THREE.MeshStandardMaterial;
  };
}

const WHITE = 0xf2f1ed;
const WHITE_SHADE = 0xdedfdc;
const GLASS_AMBER = 0xd7aa58;
const GLASS_SHADOW = 0x5f5849;
const WARM_INTERIOR = 0xf1c778;
const GRASS = 0x557f12;
const GRASS_DARK = 0x345b08;
const PAVING = 0xd9d8d3;
const PAVING_SIDE = 0xbebdb8;
const MULLION = 0x282721;
const WOOD = 0xb58a52;
const CREAM = 0xe5d3ae;
const WARM_WHITE = 0xfff2c5;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(
  size: number,
  paint: (ctx: CanvasRenderingContext2D, size: number) => void,
  colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  paint(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = colorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

function makeGrassTextures(): {
  albedo: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
} {
  const albedo = canvasTexture(512, (ctx, s) => {
    const rand = mulberry32(0x44a551);
    ctx.fillStyle = '#4f770e';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 7200; i++) {
      const x = rand() * s;
      const y = rand() * s;
      const len = 2 + rand() * 6;
      const shade = rand();
      ctx.strokeStyle = shade < 0.38 ? '#345b08' : shade < 0.74 ? '#628c16' : '#789e21';
      ctx.globalAlpha = 0.22 + rand() * 0.45;
      ctx.lineWidth = 0.45 + rand() * 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y + len * 0.5);
      ctx.quadraticCurveTo(x + (rand() - 0.5) * 2, y, x + (rand() - 0.5) * 2.6, y - len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
  const bump = canvasTexture(
    512,
    (ctx, s) => {
      const rand = mulberry32(0x44a552);
      ctx.fillStyle = '#777';
      ctx.fillRect(0, 0, s, s);
      ctx.lineCap = 'round';
      for (let i = 0; i < 8200; i++) {
        const v = 105 + Math.floor(rand() * 75);
        ctx.strokeStyle = `rgb(${v},${v},${v})`;
        ctx.globalAlpha = 0.28 + rand() * 0.5;
        ctx.lineWidth = 0.5 + rand();
        const x = rand() * s;
        const y = rand() * s;
        ctx.beginPath();
        ctx.moveTo(x, y + 3);
        ctx.lineTo(x + (rand() - 0.5) * 2, y - 3 - rand() * 4);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    THREE.NoColorSpace,
  );
  const roughness = canvasTexture(
    512,
    (ctx, s) => {
      const rand = mulberry32(0x44a553);
      const image = ctx.createImageData(s, s);
      for (let i = 0; i < image.data.length; i += 4) {
        const v = 205 + Math.floor(rand() * 38);
        image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
        image.data[i + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
    },
    THREE.NoColorSpace,
  );
  for (const texture of [albedo, bump, roughness]) texture.repeat.set(4, 4);
  return { albedo, bump, roughness };
}

function makePavingTextures(): {
  albedo: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
} {
  const albedo = canvasTexture(512, (ctx, s) => {
    const rand = mulberry32(0x9a617e);
    ctx.fillStyle = '#d9d8d3';
    ctx.fillRect(0, 0, s, s);
    const unit = s / 8;
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(124,124,119,.26)';
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo(i * unit, 0);
      ctx.lineTo(i * unit, s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * unit);
      ctx.lineTo(s, i * unit);
      ctx.stroke();
    }
    for (let i = 0; i < 2600; i++) {
      const v = 185 + Math.floor(rand() * 45);
      ctx.fillStyle = `rgba(${v},${v},${v - 2},${0.025 + rand() * 0.06})`;
      ctx.fillRect(rand() * s, rand() * s, 1 + rand() * 2, 1 + rand() * 2);
    }
  });
  const bump = canvasTexture(
    512,
    (ctx, s) => {
      const rand = mulberry32(0x9a617f);
      ctx.fillStyle = '#a7a7a7';
      ctx.fillRect(0, 0, s, s);
      const unit = s / 8;
      ctx.strokeStyle = '#585858';
      ctx.lineWidth = 2;
      for (let i = 0; i <= 8; i++) {
        ctx.beginPath();
        ctx.moveTo(i * unit, 0);
        ctx.lineTo(i * unit, s);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * unit);
        ctx.lineTo(s, i * unit);
        ctx.stroke();
      }
      for (let i = 0; i < 1800; i++) {
        const v = 132 + Math.floor(rand() * 50);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(rand() * s, rand() * s, 1, 1);
      }
    },
    THREE.NoColorSpace,
  );
  const roughness = canvasTexture(
    512,
    (ctx, s) => {
      const rand = mulberry32(0x9a6180);
      const image = ctx.createImageData(s, s);
      for (let i = 0; i < image.data.length; i += 4) {
        const v = 174 + Math.floor(rand() * 48);
        image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
        image.data[i + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
    },
    THREE.NoColorSpace,
  );
  for (const texture of [albedo, bump, roughness]) texture.repeat.set(2.6, 2.2);
  return { albedo, bump, roughness };
}

function roundedRectPath(path: THREE.Shape | THREE.Path, w: number, d: number, r: number): void {
  const x = -w / 2;
  const z = -d / 2;
  const rr = Math.max(0, Math.min(r, w / 2, d / 2));
  path.moveTo(x + rr, z);
  path.lineTo(x + w - rr, z);
  path.quadraticCurveTo(x + w, z, x + w, z + rr);
  path.lineTo(x + w, z + d - rr);
  path.quadraticCurveTo(x + w, z + d, x + w - rr, z + d);
  path.lineTo(x + rr, z + d);
  path.quadraticCurveTo(x, z + d, x, z + d - rr);
  path.lineTo(x, z + rr);
  path.quadraticCurveTo(x, z, x + rr, z);
}

function roundedRectShape(w: number, d: number, r: number): THREE.Shape {
  const shape = new THREE.Shape();
  roundedRectPath(shape, w, d, r);
  return shape;
}

function ringShape(
  outerW: number,
  outerD: number,
  outerR: number,
  innerW: number,
  innerD: number,
  innerR: number,
  innerOffsetX = 0,
  innerOffsetZ = 0,
): THREE.Shape {
  const shape = roundedRectShape(outerW, outerD, outerR);
  const hole = new THREE.Path();
  const x = innerOffsetX - innerW / 2;
  const z = innerOffsetZ - innerD / 2;
  const r = Math.min(innerR, innerW / 2, innerD / 2);
  // Reverse winding for a reliable hole in ExtrudeGeometry.
  hole.moveTo(x + r, z);
  hole.quadraticCurveTo(x, z, x, z + r);
  hole.lineTo(x, z + innerD - r);
  hole.quadraticCurveTo(x, z + innerD, x + r, z + innerD);
  hole.lineTo(x + innerW - r, z + innerD);
  hole.quadraticCurveTo(x + innerW, z + innerD, x + innerW, z + innerD - r);
  hole.lineTo(x + innerW, z + r);
  hole.quadraticCurveTo(x + innerW, z, x + innerW - r, z);
  hole.lineTo(x + r, z);
  shape.holes.push(hole);
  return shape;
}

function horizontalExtrude(
  shape: THREE.Shape,
  height: number,
  material: THREE.Material | THREE.Material[],
  bevel = 0.04,
): THREE.Mesh {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    steps: 1,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: Math.min(bevel, height * 0.35),
    bevelSegments: bevel > 0 ? 3 : 1,
    curveSegments: 14,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

function plusShape(arm = 0.22, span = 0.72): THREE.Shape {
  const h = span / 2;
  const a = arm / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-a, -h);
  shape.lineTo(a, -h);
  shape.lineTo(a, -a);
  shape.lineTo(h, -a);
  shape.lineTo(h, a);
  shape.lineTo(a, a);
  shape.lineTo(a, h);
  shape.lineTo(-a, h);
  shape.lineTo(-a, a);
  shape.lineTo(-h, a);
  shape.lineTo(-h, -a);
  shape.lineTo(-a, -a);
  shape.closePath();
  return shape;
}

function box(
  ctx: BuildContext,
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 1, 1, 1), material);
  mesh.castShadow = ctx.shadows;
  mesh.receiveShadow = ctx.shadows;
  return mesh;
}

function setMeshFlags(ctx: BuildContext, object: THREE.Object3D): void {
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = ctx.shadows;
    mesh.receiveShadow = ctx.shadows;
    if (!mesh.name) mesh.userData.explodeWithParent = true;
  });
}

function part(parent: THREE.Object3D, name: string, description: string): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  group.userData.description = description;
  parent.add(group);
  return group;
}

function makeMaterials(): BuildContext['mats'] {
  const grass = makeGrassTextures();
  const paving = makePavingTextures();
  return {
    shell: new THREE.MeshPhysicalMaterial({
      color: WHITE,
      roughness: 0.27,
      metalness: 0.03,
      clearcoat: 0.36,
      clearcoatRoughness: 0.22,
      envMapIntensity: 0.85,
    }),
    shellShade: new THREE.MeshStandardMaterial({
      color: WHITE_SHADE,
      roughness: 0.46,
      metalness: 0.02,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: GLASS_AMBER,
      roughness: 0.12,
      metalness: 0.03,
      transmission: 0.42,
      transparent: true,
      opacity: 0.36,
      ior: 1.48,
      thickness: 0.08,
      clearcoat: 0.72,
      clearcoatRoughness: 0.1,
      envMapIntensity: 1.05,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    glassDark: new THREE.MeshPhysicalMaterial({
      color: GLASS_SHADOW,
      roughness: 0.24,
      transmission: 0.16,
      transparent: true,
      opacity: 0.26,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    warmWall: new THREE.MeshStandardMaterial({
      color: WARM_INTERIOR,
      roughness: 0.66,
      emissive: 0x9b5d19,
      emissiveIntensity: 0.08,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    grass: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: grass.albedo,
      bumpMap: grass.bump,
      bumpScale: 0.065,
      roughnessMap: grass.roughness,
      roughness: 0.92,
      metalness: 0,
    }),
    paving: new THREE.MeshStandardMaterial({
      color: 0xe0dfdc,
      map: paving.albedo,
      bumpMap: paving.bump,
      bumpScale: 0.025,
      roughnessMap: paving.roughness,
      roughness: 0.8,
      metalness: 0,
    }),
    pavingSide: new THREE.MeshStandardMaterial({ color: PAVING_SIDE, roughness: 0.82 }),
    metal: new THREE.MeshStandardMaterial({
      color: MULLION,
      roughness: 0.27,
      metalness: 0.76,
      envMapIntensity: 0.85,
    }),
    wood: new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.62, metalness: 0 }),
    cream: new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.74, metalness: 0 }),
    emissive: new THREE.MeshStandardMaterial({
      color: 0xfff7dc,
      emissive: WARM_WHITE,
      emissiveIntensity: 2.5,
      roughness: 0.2,
      toneMapped: false,
    }),
    bulb: new THREE.MeshStandardMaterial({
      color: 0xfff4d5,
      emissive: 0xffd58c,
      emissiveIntensity: 3.1,
      roughness: 0.18,
      toneMapped: false,
    }),
    curbGlow: new THREE.MeshStandardMaterial({
      color: 0xfff5df,
      emissive: 0xffc96c,
      emissiveIntensity: 1.25,
      roughness: 0.34,
      toneMapped: false,
    }),
  };
}

function addCurtainWall(
  ctx: BuildContext,
  parent: THREE.Group,
  name: string,
  width: number,
  height: number,
  bays: number,
  position: THREE.Vector3,
  rotationY = 0,
  darkEvery = 0,
): THREE.Group {
  const wall = part(parent, name, `${bays}-bay amber curtain wall with dark bronze mullions`);
  wall.position.copy(position);
  wall.rotation.y = rotationY;

  const bayW = width / bays;
  const back = box(ctx, width - 0.08, height - 0.16, 0.035, ctx.mats.warmWall);
  back.position.z = -0.1;
  back.userData.explodeWithParent = true;
  wall.add(back);

  for (let i = 0; i < bays; i++) {
    const panel = box(
      ctx,
      bayW - 0.035,
      height - 0.08,
      0.045,
      darkEvery > 0 && i % darkEvery === darkEvery - 1 ? ctx.mats.glassDark : ctx.mats.glass,
    );
    panel.position.set(-width / 2 + bayW * (i + 0.5), 0, 0);
    panel.userData.explodeWithParent = true;
    wall.add(panel);
  }
  for (let i = 0; i <= bays; i++) {
    const mullion = box(ctx, 0.034, height + 0.02, 0.09, ctx.mats.metal);
    mullion.position.set(-width / 2 + bayW * i, 0, 0.035);
    mullion.userData.explodeWithParent = true;
    wall.add(mullion);
  }
  for (const y of [-height / 2, height / 2]) {
    const rail = box(ctx, width + 0.03, 0.045, 0.095, ctx.mats.metal);
    rail.position.set(0, y, 0.035);
    rail.userData.explodeWithParent = true;
    wall.add(rail);
  }
  setMeshFlags(ctx, wall);
  return wall;
}

function addChair(
  ctx: BuildContext,
  parent: THREE.Object3D,
  x: number,
  z: number,
  rotationY: number,
  scale = 1,
): THREE.Group {
  const chair = new THREE.Group();
  chair.position.set(x, 0.51, z);
  chair.rotation.y = rotationY;
  chair.scale.setScalar(scale);
  const seat = box(ctx, 0.42, 0.12, 0.42, ctx.mats.cream);
  seat.position.y = 0.25;
  const back = box(ctx, 0.42, 0.48, 0.11, ctx.mats.cream);
  back.position.set(0, 0.52, -0.18);
  chair.add(seat, back);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = box(ctx, 0.045, 0.28, 0.045, ctx.mats.metal);
      leg.position.set(sx * 0.16, 0.1, sz * 0.16);
      chair.add(leg);
    }
  }
  chair.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.userData.explodeWithParent = true;
  });
  parent.add(chair);
  return chair;
}

function addVisibleInterior(ctx: BuildContext, root: THREE.Group): void {
  const interior = part(
    root,
    'Visible lobby interior',
    'Warm lobby floor, curved reception counter, waiting chairs, side tables and pendant lamps',
  );

  const floor = horizontalExtrude(roundedRectShape(6.9, 5.35, 0.32), 0.07, ctx.mats.wood, 0.01);
  floor.position.set(-0.32, 0.39, -0.05);
  floor.userData.explodeWithParent = true;
  interior.add(floor);

  // Curved reception island: flattened cylinders plus a pale counter lip.
  const desk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.66, 0.58, 32), ctx.mats.cream);
  desk.scale.set(1.38, 1, 0.62);
  desk.position.set(-0.78, 0.72, 1.62);
  desk.userData.explodeWithParent = true;
  interior.add(desk);
  const counter = new THREE.Mesh(new THREE.CylinderGeometry(0.67, 0.67, 0.09, 32), ctx.mats.shell);
  counter.scale.set(1.42, 1, 0.66);
  counter.position.set(-0.78, 1.03, 1.62);
  counter.userData.explodeWithParent = true;
  interior.add(counter);

  const waiting = new THREE.Group();
  waiting.position.set(-1.12, 0, 2.02);
  for (let i = 0; i < 5; i++) {
    addChair(ctx, waiting, (i - 2) * 0.52, 0.38 + (i % 2) * 0.06, Math.PI, 0.82);
  }
  const table = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.34, 0.34, 24), ctx.mats.wood);
  table.position.set(0, 0.55, -0.22);
  table.userData.explodeWithParent = true;
  waiting.add(table);
  interior.add(waiting);

  // Courtyard-facing lounge.
  addChair(ctx, interior, 1.72, -1.06, -Math.PI / 2, 0.86);
  addChair(ctx, interior, 1.7, -0.35, -Math.PI / 2, 0.86);
  const loungeTable = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.22, 0.34, 24), ctx.mats.wood);
  loungeTable.position.set(1.42, 0.55, -0.7);
  loungeTable.userData.explodeWithParent = true;
  interior.add(loungeTable);

  // Pendant system.
  const bulbGeometry = new THREE.SphereGeometry(0.07, 14, 10);
  const stemGeometry = new THREE.CylinderGeometry(0.012, 0.012, 0.52, 8);
  const points: Array<[number, number, number]> = [
    [-1.25, 1.78, 1.15],
    [-0.65, 1.95, 1.3],
    [0.02, 1.8, 1.08],
    [0.68, 1.92, 1.4],
    [-2.15, 1.75, -1.55],
    [1.82, 1.8, -1.12],
  ];
  for (const [x, y, z] of points) {
    const stem = new THREE.Mesh(stemGeometry, ctx.mats.metal);
    stem.position.set(x, y + 0.28, z);
    stem.userData.explodeWithParent = true;
    const bulb = new THREE.Mesh(bulbGeometry, ctx.mats.bulb);
    bulb.position.set(x, y, z);
    bulb.userData.explodeWithParent = true;
    interior.add(stem, bulb);
  }

  // Room divider hints provide parallax through the curtain walls.
  for (const x of [-2.25, 2.08]) {
    const divider = box(ctx, 0.05, 1.28, 2.1, ctx.mats.cream);
    divider.position.set(x, 1.1, -0.35);
    divider.userData.explodeWithParent = true;
    interior.add(divider);
  }
  setMeshFlags(ctx, interior);
}

function addLandscape(ctx: BuildContext, root: THREE.Group): void {
  const landscape = part(
    root,
    'Landscaped grass ribbons',
    'Clipped grass islands with raised white curbs around the front, left and right site edges',
  );

  const addIsland = (
    name: string,
    w: number,
    d: number,
    r: number,
    x: number,
    z: number,
    height = 0.1,
  ): void => {
    const island = new THREE.Group();
    island.userData.description = name;
    island.position.set(x, 0, z);

    const curb = horizontalExtrude(roundedRectShape(w + 0.22, d + 0.22, r + 0.1), 0.17, ctx.mats.shell, 0.06);
    curb.position.y = 0.23;
    curb.userData.explodeWithParent = true;
    island.add(curb);
    const lawn = horizontalExtrude(roundedRectShape(w, d, r), height, ctx.mats.grass, 0.035);
    lawn.position.y = 0.36;
    lawn.userData.explodeWithParent = true;
    island.add(lawn);
    landscape.add(island);
  };

  addIsland('Front lawn', 6.25, 2.25, 0.72, -1.25, 3.23);
  addIsland('Left lawn', 1.25, 5.85, 0.5, -4.25, -0.18);
  addIsland('Right lawn ribbon', 1.85, 6.35, 0.62, 4.12, -0.06);
  addIsland('Rear lawn ribbon', 6.2, 1.25, 0.5, 0.3, -3.62);

  // A few sparse, actual blade clusters at prominent lawn edges. Most grass remains textured.
  const bladeGeo = new THREE.ConeGeometry(0.012, 0.13, 4);
  const bladeMat = new THREE.MeshStandardMaterial({ color: GRASS_DARK, roughness: 0.94 });
  const blades = new THREE.InstancedMesh(bladeGeo, bladeMat, 140);
  const rand = mulberry32(0x66726173);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 140; i++) {
    const region = i % 3;
    if (region === 0) dummy.position.set(-3.8 + rand() * 5.4, 0.49, 2.62 + rand() * 1.1);
    else if (region === 1) dummy.position.set(3.48 + rand() * 1.12, 0.49, -2.6 + rand() * 5.2);
    else dummy.position.set(-4.58 + rand() * 0.85, 0.49, -2.7 + rand() * 5.1);
    dummy.rotation.set((rand() - 0.5) * 0.18, rand() * Math.PI, (rand() - 0.5) * 0.18);
    dummy.scale.setScalar(0.72 + rand() * 0.6);
    dummy.updateMatrix();
    blades.setMatrixAt(i, dummy.matrix);
  }
  blades.userData.explodeWithParent = true;
  landscape.add(blades);
  setMeshFlags(ctx, landscape);
}

function addEntry(ctx: BuildContext, root: THREE.Group): void {
  const entry = part(
    root,
    'Stepped entrance portal',
    'Three pale rounded steps, glass double doors, dark metal pulls, white canopy and illuminated cross pier',
  );
  const entryShell = part(
    entry,
    'Stepped entrance shell and steps',
    'Rounded white portal frame, three pale steps, illuminated tread line and medical cross pier',
  );

  for (let i = 0; i < 3; i++) {
    const step = horizontalExtrude(
      roundedRectShape(3.2 - i * 0.28, 1.24 - i * 0.2, 0.34),
      0.1,
      i === 0 ? ctx.mats.pavingSide : ctx.mats.paving,
      0.035,
    );
    step.position.set(1.28, 0.22 + i * 0.09, 3.65 - i * 0.04);
    step.userData.explodeWithParent = true;
    entryShell.add(step);
  }
  const lightLine = box(ctx, 2.72, 0.035, 0.035, ctx.mats.curbGlow);
  lightLine.position.set(1.28, 0.42, 4.03);
  lightLine.userData.explodeWithParent = true;
  entryShell.add(lightLine);

  // White portal cap and curved-return side blocks.
  const canopy = horizontalExtrude(roundedRectShape(4.05, 0.9, 0.36), 0.22, ctx.mats.shell, 0.075);
  canopy.position.set(1.34, 2.19, 3.28);
  canopy.userData.explodeWithParent = true;
  entryShell.add(canopy);
  for (const x of [-0.58, 3.23]) {
    const side = box(ctx, 0.3, 1.76, 0.54, ctx.mats.shell);
    side.position.set(x, 1.27, 3.29);
    side.userData.explodeWithParent = true;
    entryShell.add(side);
  }

  const doors = addCurtainWall(
    ctx,
    entry,
    'Entrance double doors',
    3.42,
    1.66,
    5,
    new THREE.Vector3(1.18, 1.27, 3.42),
  );

  // Door pull tubes.
  for (const x of [0.72, 1.38]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x - 1.18, -0.31, 0.07),
      new THREE.Vector3(x - 1.18, -0.03, 0.13),
      new THREE.Vector3(x - 1.18, 0.29, 0.07),
    ]);
    const handle = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.025, 7, false), ctx.mats.metal);
    handle.userData.explodeWithParent = true;
    doors.add(handle);
  }

  // Right white identity pier and its luminous cross.
  const pier = horizontalExtrude(roundedRectShape(0.88, 0.68, 0.2), 1.9, ctx.mats.shell, 0.07);
  pier.position.set(3.27, 0.42, 3.29);
  pier.userData.explodeWithParent = true;
  entryShell.add(pier);

  const crossGeo = new THREE.ExtrudeGeometry(plusShape(0.23, 0.78), {
    depth: 0.06,
    bevelEnabled: true,
    bevelSize: 0.018,
    bevelThickness: 0.018,
    bevelSegments: 2,
  });
  const cross = new THREE.Mesh(crossGeo, ctx.mats.emissive);
  cross.position.set(3.27, 1.42, 3.66);
  cross.userData.explodeWithParent = true;
  entryShell.add(cross);
  setMeshFlags(ctx, entry);
}

function addRoof(ctx: BuildContext, root: THREE.Group): void {
  const roof = part(
    root,
    'Roof promenade and courtyard',
    'Nested white parapets, outer green roof ribbon, pale promenade, open square courtyard and roof cross',
  );

  const slab = horizontalExtrude(ringShape(8.22, 6.66, 0.62, 3.05, 2.38, 0.46, 0.2, -0.1), 0.18, ctx.mats.shell, 0.055);
  slab.position.set(-0.05, 4.0, -0.18);
  slab.userData.explodeWithParent = true;
  roof.add(slab);

  // Green perimeter band: an outer strip around the pale promenade.
  const green = horizontalExtrude(ringShape(7.84, 6.28, 0.52, 6.75, 5.2, 0.42), 0.09, ctx.mats.grass, 0.025);
  green.position.set(-0.05, 4.19, -0.18);
  green.userData.explodeWithParent = true;
  roof.add(green);

  // Pale inner promenade ring around the courtyard opening.
  const walk = horizontalExtrude(ringShape(6.72, 5.17, 0.43, 3.16, 2.49, 0.5, 0.2, -0.1), 0.075, ctx.mats.paving, 0.022);
  walk.position.set(-0.05, 4.185, -0.18);
  walk.userData.explodeWithParent = true;
  roof.add(walk);

  // Outer and courtyard parapet rings.
  const outerParapet = horizontalExtrude(ringShape(8.4, 6.84, 0.68, 8.08, 6.52, 0.58), 0.22, ctx.mats.shell, 0.055);
  outerParapet.position.set(-0.05, 4.23, -0.18);
  outerParapet.userData.explodeWithParent = true;
  roof.add(outerParapet);
  const innerParapet = horizontalExtrude(ringShape(3.48, 2.82, 0.56, 3.11, 2.45, 0.44), 0.22, ctx.mats.shell, 0.05);
  innerParapet.position.set(0.15, 4.23, -0.28);
  innerParapet.userData.explodeWithParent = true;
  roof.add(innerParapet);

  // Roof cross lies horizontally on the pale promenade.
  const crossGeo = new THREE.ExtrudeGeometry(plusShape(0.23, 0.88), {
    depth: 0.035,
    bevelEnabled: true,
    bevelSize: 0.018,
    bevelThickness: 0.012,
    bevelSegments: 2,
  });
  crossGeo.rotateX(-Math.PI / 2);
  const cross = new THREE.Mesh(crossGeo, ctx.mats.emissive);
  cross.position.set(-1.65, 4.29, 1.4);
  cross.rotation.y = -0.08;
  cross.userData.explodeWithParent = true;
  roof.add(cross);
  setMeshFlags(ctx, roof);
}

function addBuilding(ctx: BuildContext, root: THREE.Group): void {
  const lower = part(
    root,
    'Ground-storey clinic ring',
    'Warm glazed perimeter surrounding the lawn courtyard, held between thick rounded white slabs',
  );
  const upper = part(
    root,
    'Upper-storey clinic ring',
    'Second level of amber curtain walls with the visible square courtyard cut through the centre',
  );
  const lowerShell = part(
    lower,
    'Ground-storey clinic ring shell',
    'Ground floor slabs, courtyard curb and continuous rounded corner piers',
  );
  const upperShell = part(
    upper,
    'Upper-storey clinic ring shell',
    'Upper floor and roof-line slabs that keep the second-storey envelope independently selectable',
  );

  // Slabs define the characteristic thick, continuous white horizontal bands.
  for (const [group, y, w, d] of [
    [lowerShell, 0.42, 8.18, 6.62],
    [lowerShell, 2.18, 8.18, 6.62],
    [upperShell, 2.3, 8.1, 6.55],
    [upperShell, 3.88, 8.12, 6.57],
  ] as Array<[THREE.Group, number, number, number]>) {
    const slab = horizontalExtrude(ringShape(w, d, 0.58, 3.05, 2.38, 0.44, 0.2, -0.1), 0.18, ctx.mats.shell, 0.06);
    slab.position.set(-0.05, y, -0.18);
    slab.userData.explodeWithParent = true;
    group.add(slab);
  }

  const groundY = 1.31;
  const upperY = 3.08;
  // Front and left are the hero elevations visible in the reference.
  addCurtainWall(ctx, lower, 'Ground front curtain wall', 6.18, 1.57, 10, new THREE.Vector3(-0.76, groundY, 3.08), 0, 5);
  addCurtainWall(ctx, lower, 'Ground left curtain wall', 5.45, 1.57, 9, new THREE.Vector3(-4.02, groundY, -0.23), -Math.PI / 2, 4);
  addCurtainWall(ctx, lower, 'Ground rear curtain wall', 6.55, 1.57, 10, new THREE.Vector3(0.18, groundY, -3.42), Math.PI, 5);
  addCurtainWall(ctx, lower, 'Ground right curtain wall', 4.7, 1.57, 8, new THREE.Vector3(4.0, groundY, -0.55), Math.PI / 2, 4);

  addCurtainWall(ctx, upper, 'Upper front curtain wall', 7.45, 1.38, 12, new THREE.Vector3(-0.2, upperY, 3.04), 0, 6);
  addCurtainWall(ctx, upper, 'Upper left curtain wall', 5.75, 1.38, 9, new THREE.Vector3(-3.98, upperY, -0.23), -Math.PI / 2, 5);
  addCurtainWall(ctx, upper, 'Upper rear curtain wall', 7.25, 1.38, 11, new THREE.Vector3(0.05, upperY, -3.35), Math.PI, 5);
  addCurtainWall(ctx, upper, 'Upper right curtain wall', 5.55, 1.38, 9, new THREE.Vector3(3.93, upperY, -0.25), Math.PI / 2, 5);

  // Inner courtyard glazing, inset around the open lawn.
  addCurtainWall(ctx, upper, 'Courtyard rear glazing', 2.94, 1.38, 5, new THREE.Vector3(0.15, upperY, -1.54), 0);
  addCurtainWall(ctx, upper, 'Courtyard front glazing', 2.94, 1.38, 5, new THREE.Vector3(0.15, upperY, 0.98), Math.PI);
  addCurtainWall(ctx, upper, 'Courtyard left glazing', 2.08, 1.38, 4, new THREE.Vector3(-1.39, upperY, -0.28), Math.PI / 2);
  addCurtainWall(ctx, upper, 'Courtyard right glazing', 2.08, 1.38, 4, new THREE.Vector3(1.69, upperY, -0.28), -Math.PI / 2);

  // Ground courtyard lawn and white curb.
  const courtyardCurb = horizontalExtrude(roundedRectShape(3.15, 2.48, 0.48), 0.14, ctx.mats.shell, 0.045);
  courtyardCurb.position.set(0.15, 0.38, -0.28);
  courtyardCurb.userData.explodeWithParent = true;
  lowerShell.add(courtyardCurb);
  const courtyardLawn = horizontalExtrude(roundedRectShape(2.92, 2.25, 0.4), 0.07, ctx.mats.grass, 0.03);
  courtyardLawn.position.set(0.15, 0.5, -0.28);
  courtyardLawn.userData.explodeWithParent = true;
  lowerShell.add(courtyardLawn);

  // Rounded opaque corner piers hide curtain-wall ends and strengthen the silhouette.
  const corners: Array<[number, number, number]> = [
    [-3.92, 0, 3.0],
    [-3.92, 0, -3.24],
    [3.83, 0, -3.24],
    [3.83, 0, 2.92],
  ];
  for (const [x, , z] of corners) {
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 3.5, 24), ctx.mats.shell);
    column.scale.set(0.78, 1, 1);
    column.position.set(x, 2.14, z);
    column.userData.explodeWithParent = true;
    lowerShell.add(column);
  }
  setMeshFlags(ctx, lower);
  setMeshFlags(ctx, upper);
}

export function createMedicalClinicModel(options: MedicalClinicOptions = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Rounded Courtyard Medical Clinic';
  const scale = options.scale ?? 1;
  root.scale.setScalar(scale);
  const ctx: BuildContext = {
    shadows: options.shadows ?? true,
    mats: makeMaterials(),
  };

  // Stone presentation plinth.
  const plinth = part(
    root,
    'Rounded stone site plinth',
    'Pale square presentation base with softly chamfered corners and procedural tile joints',
  );
  const base = horizontalExtrude(roundedRectShape(10.5, 9.25, 0.58), 0.22, [ctx.mats.paving, ctx.mats.pavingSide], 0.08);
  base.position.y = 0.06;
  base.userData.explodeWithParent = true;
  plinth.add(base);
  setMeshFlags(ctx, plinth);

  addVisibleInterior(ctx, root);
  addBuilding(ctx, root);
  addRoof(ctx, root);
  addLandscape(ctx, root);
  addEntry(ctx, root);

  // Soft warm lights inside give the transparent façade the same amber depth as the reference.
  const interiorLights = new THREE.Group();
  interiorLights.name = 'Interior warm illumination';
  const lightPositions: Array<[number, number, number, number]> = [
    [-1.1, 1.55, 1.55, 2.3],
    [1.62, 1.45, 1.35, 1.75],
    [-2.45, 1.45, -1.55, 1.65],
    [2.35, 1.5, -1.35, 1.55],
    [-0.6, 3.25, -1.65, 1.4],
    [1.55, 3.25, 1.4, 1.25],
  ];
  for (const [x, y, z, intensity] of lightPositions) {
    const light = new THREE.PointLight(0xffc66d, intensity, 4.1, 2.1);
    light.position.set(x, y, z);
    interiorLights.add(light);
  }
  root.add(interiorLights);

  const partGroups = new Map<string, THREE.Object3D>();
  root.traverse((o) => {
    if (o.name && o !== root) partGroups.set(o.name, o);
  });
  root.userData.sculptRuntime = {
    parts: partGroups,
    pivots: {
      root,
      courtyard: partGroups.get('Roof promenade and courtyard'),
      entry: partGroups.get('Stepped entrance portal'),
    },
    sockets: {
      entry: new THREE.Vector3(1.1, 0.46, 4.05),
      courtyardCenter: new THREE.Vector3(0.15, 0.52, -0.28),
      roofCross: new THREE.Vector3(-1.65, 4.31, 1.4),
    },
    colliders: [
      { id: 'site', type: 'box', center: [0, 0.18, 0], size: [10.5, 0.36, 9.25] },
      { id: 'building-ring', type: 'compound-box-ring', center: [-0.05, 2.25, -0.18], size: [8.2, 3.7, 6.65] },
    ],
    destructionGroups: {
      site: ['Rounded stone site plinth', 'Landscaped grass ribbons'],
      envelope: ['Ground-storey clinic ring', 'Upper-storey clinic ring'],
      roof: ['Roof promenade and courtyard'],
      entry: ['Stepped entrance portal'],
      interior: ['Visible lobby interior'],
    },
    provenance: {
      source: 'single attached isometric reference',
      visibleEvidence: 'front, left elevation, roof, courtyard, entry and landscape plinth',
      inferred: 'rear/right façade continuation, wall thickness, structural grid and room plan',
      method: 'code-only procedural Three.js; no downloaded mesh, texture atlas or photogrammetry',
      structuralGateLimit:
        'Named-part coverage proves implementation structure, not that the single-view spec reveals every hidden architectural component.',
    },
  };

  return root;
}

export function createMedicalClinicLookDevLights(): THREE.Group {
  const lights = new THREE.Group();
  lights.name = 'Medical clinic look-dev lights';

  const hemi = new THREE.HemisphereLight(0xf7f4ee, 0xc9c5b8, 1.25);
  lights.add(hemi);

  const key = new THREE.DirectionalLight(0xfff2dc, 2.65);
  key.position.set(-7.5, 11, 8.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.00022;
  key.shadow.normalBias = 0.025;
  key.shadow.radius = 5;
  const camera = key.shadow.camera as THREE.OrthographicCamera;
  camera.left = camera.bottom = -8;
  camera.right = camera.top = 8;
  camera.near = 1;
  camera.far = 28;
  lights.add(key);

  const fill = new THREE.DirectionalLight(0xd9e6f2, 0.92);
  fill.position.set(8, 5.5, 2.5);
  lights.add(fill);

  const rim = new THREE.DirectionalLight(0xffe0aa, 1.45);
  rim.position.set(4, 8, -8);
  lights.add(rim);
  return lights;
}

export function makeMedicalClinicBackground(): THREE.CanvasTexture {
  return canvasTexture(32, (ctx, s) => {
    const gradient = ctx.createRadialGradient(s * 0.48, s * 0.4, 0, s * 0.48, s * 0.4, s * 0.72);
    gradient.addColorStop(0, '#fbfaf8');
    gradient.addColorStop(0.72, '#f2f0ed');
    gradient.addColorStop(1, '#e9e7e3');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, s, s);
  });
}
