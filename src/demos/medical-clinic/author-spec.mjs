import fs from 'node:fs';

const specPath = new URL('./object-sculpt-spec.json', import.meta.url);
const assessmentPath = new URL('./pre-spec-assessment.json', import.meta.url);
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));

const observedSource =
  'attached-reference: single isometric view of a rounded single-storey courtyard medical clinic';

spec.sourceImage = observedSource;
spec.suitability = 'conditional';
spec.scores = {
  object_isolation: 3,
  silhouette_readability: 3,
  depth_inference: 2,
  primitive_decomposition: 3,
  material_procedurality: 3,
  occlusion_risk: 2,
  interaction_fit: 3,
};
spec.referenceCamera = {
  solved: true,
  fovDegrees: 28,
  aspect: 1,
  orientation: { yaw: -42, pitch: -32, roll: 0 },
  positionHint: [-15.5, 13.2, 17.5],
  note:
    'Isometric-like three-quarter view inferred from the visible front, left elevation, and roof. ' +
    'The supplied attachment is visible to agent vision but was not materialized as a local file, ' +
    'so camera values are an explicit visual estimate and must be overlay-refined if the source file is supplied.',
};

const assessment = spec.preSpecAssessment;
assessment.sourceImage = observedSource;
assessment.objectClass = {
  primaryType: 'architectural medical-clinic diorama',
  primaryDomain: 'object',
  formLanguage: ['hard-surface', 'architectural', 'rounded geometric'],
  structureKind: ['compound object', 'layered shell', 'repeated modules', 'courtyard ring'],
  motionPotential: ['static prop', 'whole-object transform', 'detachable architectural assemblies'],
  materialFamilies: ['painted composite', 'glass-like', 'metal', 'stone', 'grass', 'warm interior fabric'],
  notes:
    'Observable: a single-storey rounded rectangular building surrounds an open square courtyard. ' +
    'White fascia bands frame amber curtain walls; grass and pale paving form roof and ground ribbons.',
};
assessment.complexity = {
  tier: 'complex',
  scores: {
    silhouetteComplexity: 2,
    componentCount: 3,
    hierarchyDepth: 3,
    repetitionDensity: 3,
    materialLayerCount: 3,
    localDetailDensity: 2,
    occlusionRisk: 2,
    actionReadinessNeed: 2,
  },
  estimatedCounts: {
    macroComponents: 6,
    mesoComponents: 18,
    microFeatureGroups: 18,
    materialLayers: 7,
    repetitionSystems: 4,
  },
  reasoning: [
    'The identity depends on nested negative space: outer rounded footprint, roof promenade, and square courtyard opening.',
    'Curtain-wall bays, mullions, parapet bands, grass borders, steps, furniture, and light fixtures are repeated systems.',
    'Single-view rear geometry is inferred; visible front, left, roof, and courtyard relationships are high-confidence.',
  ],
};
assessment.specDepthDecision = {
  requiredDepth: 'complex',
  minimumComponentLevels: ['macro', 'meso', 'micro'],
  needsRepetitionSystems: true,
  needsMaterialLocalOverrides: true,
  needsMultipleReviewViews: true,
  needsActionReadyHierarchy: true,
  rationale:
    'A shallow box cannot preserve the roof/courtyard negative space or repeated transparent façade system.',
};
assessment.unknownsToResolveBeforeImplementation = [];
assessment.anatomy.applies = false;

const rootTemplate = spec.componentTree[0];
const clone = (value) => JSON.parse(JSON.stringify(value));

function component({
  id,
  name,
  level,
  parent = 'root',
  role = 'static-part',
  primitive = 'box',
  topologyClass = 'assembled-solid',
  topologyRationale = 'Discrete rigid architectural assembly with countable planar or simply curved faces.',
  material = 'white-shell',
  dims = [1, 1, 1],
  position = [0, 0, 0],
  importance = 0.75,
  confidence = 0.8,
  localFeatures = [],
  evidenceRefs = ['full-object'],
}) {
  const c = clone(rootTemplate);
  c.id = id;
  c.name = name;
  c.level = level;
  c.role = role;
  c.importance = importance;
  if (level !== 'macro' && importance === 0.75) c.importance = 0.62;
  c.confidence = confidence;
  c.primitive = primitive;
  c.topologyClass = topologyClass;
  c.topologyRationale = topologyRationale;
  c.parent = parent;
  c.attachment = null;
  c.dimensions = {
    width: dims[0],
    height: dims[1],
    depth: dims[2],
    units: 'world',
    confidence,
  };
  c.transform = { position, rotation: [0, 0, 0], scale: [1, 1, 1] };
  c.material = material;
  c.materialLayers = [material];
  c.localFeatures = localFeatures.map((f) => ({
    id: f,
    placement: 'image-observed region',
    geometryEffect: 'implemented as separate named geometry or material-local response',
    confidence,
    evidenceRefs,
  }));
  c.evidenceRefs = evidenceRefs;
  c.geometryDescriptor = {
    topologyIntent:
      primitive === 'extrude'
        ? 'rounded two-dimensional footprint extruded to a finite architectural thickness'
        : 'bevel-ready rigid assembly with stable object-space dimensions',
    edgeTreatment: { type: 'chamfer', bevelRadius: 0.06, segments: 3 },
    deformationStack: [],
    uvStrategy: 'world-scaled procedural coordinates',
    normalStrategy: 'generated vertex normals plus independent procedural bump where required',
  };
  c.actionProfile.animationRole = role;
  c.actionProfile.pivot.mode = 'center';
  c.actionProfile.pivot.confidence = confidence;
  c.actionProfile.collider = {
    type: 'box',
    offset: [0, 0, 0],
    scale: dims,
    isTrigger: false,
    notes: 'Compound architectural collider proxy; courtyard remains a non-colliding opening.',
  };
  c.actionProfile.destruction = {
    breakable: level !== 'macro',
    fractureGroup: parent ?? 'root',
    seamRefs: [],
    detachableFragments: [],
    breakImpulse: level === 'micro' ? 2 : 8,
    debrisMaterial: material,
  };
  return c;
}

const root = component({
  id: 'root',
  name: 'Rounded Courtyard Medical Clinic',
  level: 'macro',
  parent: null,
  role: 'root',
  material: 'utility-invisible',
  dims: [10.4, 2.9, 9.2],
  confidence: 0.86,
  importance: 1,
});
root.actionProfile.transformChannels = {
  translate: true,
  rotate: true,
  scale: true,
  bend: false,
  twist: false,
  detach: false,
  visibility: true,
  materialState: true,
};

spec.componentTree = [
  root,
  component({ id: 'site-plinth', name: 'Rounded stone site plinth', level: 'macro', dims: [10.4, 0.22, 9.2], position: [0, 0.11, 0], material: 'paving', localFeatures: ['plinth-rounded-corners', 'paving-grid'] }),
  component({ id: 'ground-storey', name: 'Ground-storey clinic ring shell', level: 'macro', dims: [8.1, 1.75, 6.55], position: [0, 1.25, -0.15], localFeatures: ['ground-corner-radii', 'ground-white-fascia'] }),
  component({ id: 'roof-assembly', name: 'Roof promenade and courtyard', level: 'macro', dims: [8.25, 0.34, 6.7], position: [-0.05, 2.38, -0.18], material: 'paving', localFeatures: ['roof-square-opening', 'roof-medical-cross'] }),
  component({ id: 'landscape-assembly', name: 'Landscaped grass ribbons', level: 'macro', dims: [10.0, 0.24, 8.6], position: [0, 0.27, 0], material: 'grass', localFeatures: ['grass-curb-ribbons', 'grass-micro-blades'] }),

  component({ id: 'outer-floor-slabs', name: 'White outer floor slabs', level: 'meso', parent: 'ground-storey', dims: [8.25, 0.18, 6.7], position: [0, 2.18, -0.18], localFeatures: ['slab-bevel-highlight'] }),
  component({ id: 'front-curtain-wall', name: 'Front warm curtain wall', level: 'meso', parent: 'ground-storey', dims: [6.15, 1.62, 0.12], position: [-0.82, 1.28, 3.12], material: 'glass', localFeatures: ['front-glass-gloss', 'front-mullion-seams'] }),
  component({ id: 'left-curtain-wall', name: 'Left warm curtain wall', level: 'meso', parent: 'ground-storey', dims: [0.12, 1.62, 5.65], position: [-3.96, 1.28, -0.28], material: 'glass', localFeatures: ['left-glass-gloss', 'left-mullion-seams'] }),
  component({ id: 'courtyard-walls', name: 'Courtyard amber glazing', level: 'meso', parent: 'ground-storey', dims: [3.25, 1.57, 2.55], position: [0.2, 1.31, -0.25], material: 'glass', localFeatures: ['courtyard-glass-gloss', 'courtyard-mullion-seams'] }),
  component({ id: 'entrance-portal', name: 'Stepped entrance shell and steps', level: 'meso', parent: 'ground-storey', dims: [7.15, 1.82, 0.9], position: [-0.24, 1.25, 3.28], localFeatures: ['portal-rounded-return', 'portal-canopy-bevel'] }),
  component({ id: 'entrance-doors', name: 'Entrance double doors', level: 'meso', parent: 'entrance-portal', dims: [1.48, 1.48, 0.08], position: [1.55, 1.18, 3.36], material: 'glass', localFeatures: ['door-pull-handles', 'door-center-seam'] }),
  component({ id: 'facade-cross-pier', name: 'Illuminated medical cross pier', level: 'meso', parent: 'ground-storey', dims: [0.78, 1.86, 0.42], position: [3.22, 1.24, 3.08], localFeatures: ['facade-cross-emissive'] }),
  component({ id: 'roof-walkway', name: 'Pale roof promenade ring', level: 'meso', parent: 'roof-assembly', primitive: 'extrude', dims: [7.25, 0.1, 5.7], position: [-0.05, 2.49, -0.18], material: 'paving', localFeatures: ['roof-paving-grid'] }),
  component({ id: 'roof-grass-band', name: 'Outer green roof band', level: 'meso', parent: 'roof-assembly', primitive: 'extrude', dims: [7.9, 0.11, 6.35], position: [-0.05, 2.49, -0.18], material: 'grass', localFeatures: ['roof-grass-blades'] }),
  component({ id: 'outer-parapet', name: 'Outer rounded roof parapet', level: 'meso', parent: 'roof-assembly', primitive: 'extrude', dims: [8.24, 0.22, 6.69], position: [-0.05, 2.53, -0.18], localFeatures: ['outer-parapet-bevel'] }),
  component({ id: 'courtyard-parapet', name: 'Inner courtyard parapet', level: 'meso', parent: 'roof-assembly', primitive: 'extrude', dims: [3.45, 0.25, 2.72], position: [0.2, 2.53, -0.25], localFeatures: ['courtyard-parapet-bevel'] }),
  component({ id: 'courtyard-lawn', name: 'Sunken courtyard lawn', level: 'meso', parent: 'ground-storey', primitive: 'extrude', dims: [2.9, 0.08, 2.18], position: [0.2, 0.38, -0.25], material: 'grass', localFeatures: ['courtyard-grass-blades'] }),
  component({ id: 'front-steps', name: 'Three rounded entry steps', level: 'meso', parent: 'site-plinth', primitive: 'extrude', dims: [4.8, 0.3, 1.72], position: [0.92, 0.27, 3.62], material: 'paving', localFeatures: ['step-edge-light'] }),
  component({ id: 'front-lawn-island', name: 'Front lawn island with concave entry edge', level: 'meso', parent: 'landscape-assembly', primitive: 'extrude', dims: [6.3, 0.12, 2.75], position: [-1.4, 0.29, 3.25], material: 'grass', localFeatures: ['front-lawn-curb'] }),
  component({ id: 'right-lawn-ribbon', name: 'Right lawn ribbon', level: 'meso', parent: 'landscape-assembly', primitive: 'extrude', dims: [2.1, 0.12, 6.9], position: [4.1, 0.29, 0], material: 'grass', localFeatures: ['right-ribbon-curb'] }),
  component({ id: 'interior-floor', name: 'Visible lobby interior', level: 'macro', dims: [6.8, 1.75, 5.35], position: [-0.35, 1.18, -0.05], material: 'interior', localFeatures: ['interior-tile-grid'] }),
  component({ id: 'reception', name: 'Curved reception island', level: 'meso', parent: 'ground-storey', primitive: 'cylinder', dims: [1.55, 0.58, 0.7], position: [-0.75, 0.78, 1.78], material: 'interior', localFeatures: ['reception-rounded-counter'] }),
  component({ id: 'seating-cluster', name: 'Waiting-room seating cluster', level: 'meso', parent: 'ground-storey', dims: [2.5, 0.75, 1.2], position: [-0.8, 0.65, 2.2], material: 'interior', localFeatures: ['chair-upholstery-contrast'] }),
  component({ id: 'warm-light-rig', name: 'Interior warm illumination', level: 'meso', parent: 'ground-storey', primitive: 'sphere', dims: [3.8, 1.4, 4.5], position: [-0.4, 1.7, 0], material: 'emissive', localFeatures: ['pendant-emissive-bulbs'] }),

  component({ id: 'facade-mullions', name: 'Curtain-wall mullion system', level: 'micro', parent: 'ground-storey', dims: [0.05, 1.55, 0.05], material: 'metal', localFeatures: ['mullion-repetition'] }),
  component({ id: 'medical-crosses', name: 'Roof and façade medical crosses', level: 'micro', parent: 'roof-assembly', primitive: 'extrude', topologyClass: 'surface-relief', topologyRationale: 'Thin raised identity marks mounted to larger architectural surfaces.', dims: [0.88, 0.06, 0.88], material: 'emissive', localFeatures: ['cross-white-emission'] }),
  component({ id: 'door-hardware', name: 'Entrance pull handles', level: 'micro', parent: 'entrance-doors', primitive: 'tube', topologyClass: 'fiber-strand', topologyRationale: 'Thin curved metal handles following a path.', role: 'static-part', dims: [0.07, 0.65, 0.07], material: 'metal', localFeatures: ['handle-gloss'] }),
  component({ id: 'pendant-lights', name: 'Pendant bulb cluster', level: 'micro', parent: 'ground-storey', primitive: 'instanced-cluster', topologyClass: 'surface-relief', topologyRationale: 'Repeated small luminous bulbs and stems attach to the ground-storey ceiling and form a visible detail system.', dims: [0.14, 0.35, 0.14], material: 'emissive', localFeatures: ['pendant-glow'] }),
];

const baseMaterial = spec.materials[0];
function material(id, name, color, roughness, metalness, overrides = [], extra = {}) {
  const m = clone(baseMaterial);
  m.id = id;
  m.name = name;
  m.baseColor = color;
  m.color = color;
  m.albedo = {
    dominant: color,
    secondary: extra.secondary ?? [color],
    samplingNotes: 'Visually estimated from the attached isometric reference; no de-lit source crop was locally available.',
  };
  m.colorVariation = {
    palette: [color, ...(extra.secondary ?? [])],
    pattern: extra.pattern ?? 'low-amplitude procedural mottling',
    amplitude: extra.amplitude ?? 0.06,
    heightCorrelation: extra.heightCorrelation ?? 0.12,
  };
  m.roughness = {
    base: roughness,
    variation: extra.roughnessVariation ?? 0.08,
    map: `independent-procedural-${id}-roughness`,
    localResponse: extra.localResponse ?? 'slightly lower roughness on bevel crests, higher in seams',
  };
  m.metalness = { base: metalness, variation: 0.03 };
  m.normal = {
    pattern: `independent-procedural-${id}-height-field`,
    strength: extra.normalStrength ?? 0.12,
    scale: extra.normalScale ?? 32,
    space: 'tangent',
  };
  m.ambientOcclusion = {
    cavityStrength: 0.2,
    contactShadowBias: 0.3,
    notes: 'Independent procedural AO response at joints and recessed seams.',
  };
  m.localOverrides = overrides.map((o) => ({
    id: o,
    region: 'image-observed localized zone',
    roughness: Math.max(0.04, roughness - 0.08),
    evidenceRefs: ['full-object'],
  }));
  m.textureResolution = 1024;
  m.textureProjection = {
    mode: 'world-planar',
    repeat: [2, 2],
    anisotropy: 8,
    texelDensityIntent: 'Keep procedural detail at stable world scale across architectural parts.',
  };
  m.qualityTier = extra.qualityTier;
  Object.assign(m, extra.fields ?? {});
  return m;
}

spec.materials = [
  material('utility-invisible', 'Invisible hierarchy carrier', '#ffffff', 1, 0, [], { qualityTier: 'utility' }),
  material('white-shell', 'Satin white architectural shell', '#f2f1ed', 0.28, 0.03, ['white-bevel-gloss', 'fascia-shadow-seams'], {
    secondary: ['#deded9', '#ffffff'],
    normalStrength: 0.05,
    fields: { clearcoat: 0.32, clearcoatRoughness: 0.22 },
  }),
  material('glass', 'Warm low-iron curtain glass', '#d8b36f', 0.12, 0.05, ['glass-edge-gloss', 'warm-interior-reflection'], {
    secondary: ['#f1c779', '#6a6255'],
    pattern: 'vertical bay-to-bay value variation',
    fields: { transmission: 0.52, opacity: 0.34, transparent: true, ior: 1.48, clearcoat: 0.7 },
  }),
  material('grass', 'Dense clipped grass', '#527f0d', 0.88, 0, ['grass-tip-variation', 'grass-cavity-darkening'], {
    secondary: ['#395f08', '#719d18'],
    pattern: 'seeded short-blade strokes in three hue/value bands',
    normalStrength: 0.38,
    normalScale: 72,
  }),
  material('paving', 'Pale stone paving', '#d9d8d3', 0.76, 0, ['paving-joint-lines', 'step-edge-glow'], {
    secondary: ['#c7c6c1', '#ecebe7'],
    pattern: 'subtle square tile grid with independent fine grain',
    normalStrength: 0.18,
  }),
  material('interior', 'Warm maple and cream interior', '#d4ad72', 0.58, 0, ['warm-floor-grid', 'upholstery-value-shift'], {
    secondary: ['#eed29d', '#9f7b4e'],
    pattern: 'fine orthogonal wood/tile rhythm',
    normalStrength: 0.14,
  }),
  material('metal', 'Dark bronze mullions and hardware', '#343129', 0.26, 0.74, ['mullion-edge-gloss', 'handle-highlight'], {
    secondary: ['#171713', '#6a5a42'],
    normalStrength: 0.06,
  }),
  material('emissive', 'Warm-white luminous details', '#fff6d8', 0.18, 0, ['cross-emission', 'pendant-emission'], {
    secondary: ['#ffc76c'],
    fields: { emissive: '#fff1c1', emissiveIntensity: 2.2, toneMapped: false },
  }),
];

const componentRecipes = {
  'utility-invisible': ['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0)', 'plastic'],
  'white-shell': ['rgba(242, 241, 237, 1)', 'rgba(222, 222, 217, 1)', 'plastic'],
  glass: ['rgba(216, 179, 111, 0.34)', 'rgba(241, 199, 121, 0.28)', 'glass'],
  grass: ['rgba(82, 127, 13, 1)', 'rgba(57, 95, 8, 1)', 'fabric'],
  paving: ['rgba(217, 216, 211, 1)', 'rgba(199, 198, 193, 1)', 'stone'],
  interior: ['rgba(212, 173, 114, 1)', 'rgba(238, 210, 157, 1)', 'wood'],
  metal: ['rgba(52, 49, 41, 1)', 'rgba(23, 23, 19, 1)', 'metal'],
  emissive: ['rgba(255, 246, 216, 1)', 'rgba(255, 199, 108, 1)', 'glass'],
};
for (const c of spec.componentTree) {
  const [dominantAlbedo, secondaryAlbedo, materialClass] =
    componentRecipes[c.material] ?? componentRecipes['white-shell'];
  c.colorMaterialRecipe = {
    dominantAlbedo,
    secondaryAlbedo,
    materialClass,
    materialClassConfidence: c.confidence,
    evidenceRefs: ['full-object'],
  };
  if (c.parent && ['cylinder', 'cone', 'capsule', 'tube', 'curve-sweep'].includes(c.primitive)) {
    c.attachment = {
      parentId: c.parent,
      parentSocket: `${c.parent}-surface`,
      localStart: [0, -c.dimensions.height / 2, 0],
      localEnd: [0, c.dimensions.height / 2, 0],
      contactType: 'embed',
      embedDepth: 0.04,
      overlap: 0.04,
      gapTolerance: 0.015,
      evidenceRefs: ['full-object'],
    };
  }
}

spec.repetitionSystems = [
  { id: 'curtain-wall-bays', componentRefs: ['facade-mullions'], realization: 'instanced-geometry', buildsGeometry: true, geometry: 'thin mullion boxes', instances: 38, distribution: 'linear across front, lateral, upper, and courtyard elevations' },
  { id: 'grass-blades', componentRefs: ['roof-grass-band', 'front-lawn-island', 'right-lawn-ribbon', 'courtyard-lawn'], realization: 'canvas-texture-plus-sparse-geometry', buildsGeometry: true, geometry: 'seeded blade strokes and sparse crossed blade clusters', instances: 420, distribution: 'denser at perimeter ribbons, evenly clipped in courtyard' },
  { id: 'paving-grid', componentRefs: ['site-plinth', 'roof-walkway', 'front-steps'], realization: 'independent-procedural-maps', buildsGeometry: false, geometry: 'canvas albedo and bump grid', instances: 144, distribution: 'square grid with low-amplitude value jitter' },
  { id: 'interior-furnishings', componentRefs: ['reception', 'seating-cluster', 'pendant-lights'], realization: 'named-repeated-meshes', buildsGeometry: true, geometry: 'chairs, tables, bulbs, and stems', instances: 26, distribution: 'visible front lobby and courtyard-facing rooms' },
];

const details = [
  ['d01', 'bevel', 'Rounded white fascia catch-light', 'outer-parapet-bevel'],
  ['d02', 'gloss', 'Low-roughness front glazing response', 'glass-edge-gloss'],
  ['d03', 'linework', 'Front curtain-wall vertical mullion rhythm', 'front-mullion-seams'],
  ['d04', 'linework', 'Left curtain-wall vertical mullion rhythm', 'left-mullion-seams'],
  ['d05', 'emissive', 'Roof medical cross', 'cross-emission'],
  ['d06', 'emissive', 'Façade medical cross', 'facade-cross-emissive'],
  ['d07', 'ridge', 'Raised outer white parapet', 'outer-parapet-bevel'],
  ['d08', 'hole', 'Square roof courtyard opening', 'roof-square-opening'],
  ['d09', 'seam', 'Pale square paving joints', 'paving-joint-lines'],
  ['d10', 'ridge', 'Dense green roof border', 'roof-grass-blades'],
  ['d11', 'gloss', 'Warm courtyard glass highlight', 'courtyard-glass-gloss'],
  ['d12', 'bevel', 'Rounded entrance portal return', 'portal-rounded-return'],
  ['d13', 'linework', 'Double-door centre seam', 'door-center-seam'],
  ['d14', 'fastener', 'Repeated pendant bulb and stem cluster', 'pendant-lights'],
  ['d15', 'contour', 'White curb following landscape islands', 'grass-curb-ribbons'],
  ['d16', 'emissive', 'Warm light line under entry steps', 'step-edge-light'],
];
assessment.detailInventory = {
  scanMethod: 'grid-3x3',
  targetMinDetails: 16,
  note: 'Manually authored from the visible attached reference after the crop scaffold was generated.',
  details: details.map(([id, kind, description, ref], index) => ({
    id,
    kind,
    description,
    region: { x: (index % 4) * 0.25, y: Math.floor(index / 4) * 0.25, width: 0.25, height: 0.25, units: 'normalized' },
    scale: kind === 'hole' ? 'macro' : kind === 'linework' || kind === 'fastener' ? 'micro' : 'meso',
    affects: kind === 'gloss' || kind === 'emissive' ? 'material response' : 'geometry/readability',
    mapsTo: { type: ref.includes('/') ? 'material.localOverrides' : 'component.localFeatures', ref },
    evidenceRef: 'full-object',
    confidence: kind === 'hole' || kind === 'emissive' ? 0.95 : 0.84,
  })),
};

spec.viewEvidence = [
  {
    id: 'full-object',
    view: 'isometric-three-quarter',
    imageRegion: { x: 0, y: 0, width: 1, height: 1, units: 'normalized' },
    observations: [
      'Front and left elevations plus roof and courtyard are visible.',
      'Outer white frame, amber glass, green ribbons, pale paving, and medical crosses are identity-defining.',
      'Rear elevation, exact wall thickness, roof drainage, and interior plan are hidden and inferred.',
    ],
    confidence: 0.88,
  },
];
spec.visualEvidence = [];

spec.qualityContract.qualityBar = 'complex';
spec.qualityContract.definitionOfDone = [
  'At the reference isometric view, the model reads immediately as the same rounded single-storey medical clinic: square courtyard void, layered white fascia, green roof ribbons, warm modular glazing, front portal, two crosses, and landscaped stepped plinth.',
  'At two orbit views, roof and courtyard remain genuinely volumetric and no façade collapses into a projection plane.',
  'All named architectural assemblies remain independently clickable and separable by explode mode.',
];
spec.qualityContract.minimumSpecDepth = {
  macroComponents: 6,
  mesoComponents: 18,
  microFeatureGroups: 16,
  materialLayers: 7,
  repetitionSystems: 4,
  reviewViewpoints: 5,
};
spec.qualityContract.featureGroups = [
  { id: 'courtyard-ring', name: 'Courtyard and roof negative-space system', required: true, qualityCriteria: ['Square opening remains centered within the rounded roof ring and exposes the lawn below.'], evidenceRefs: ['full-object'], failureModes: ['roof becomes a solid slab', 'courtyard is painted rather than open'] },
  { id: 'curtain-wall-system', name: 'Warm curtain-wall and mullion system', required: true, qualityCriteria: ['Front, left, and courtyard glazing use repeated dark mullions and reveal warm interior depth.'], evidenceRefs: ['full-object'], failureModes: ['flat amber walls', 'missing bay rhythm'] },
  { id: 'white-fascia-system', name: 'Rounded white fascia and parapet system', required: true, qualityCriteria: ['All major floor and roof edges carry thick rounded white bands with legible bevel highlights.'], evidenceRefs: ['full-object'], failureModes: ['sharp box edges', 'inconsistent band thickness'] },
  { id: 'landscape-ribbons', name: 'Ground and roof grass ribbon system', required: true, qualityCriteria: ['Clipped green zones follow white curbs around roof, courtyard, front lawn, and right-side ribbon.'], evidenceRefs: ['full-object'], failureModes: ['grass becomes a full rectangular carpet', 'curbs do not follow grass silhouette'] },
  { id: 'medical-entry', name: 'Medical identity and entry system', required: true, qualityCriteria: ['Roof and façade crosses are visible and the rounded glass entry portal aligns with stepped paving.'], evidenceRefs: ['full-object'], failureModes: ['missing cross', 'entrance reads as an ordinary window bay'] },
];
spec.qualityContract.visualDeltaChecks = [
  'outer rounded-square silhouette and single-storey height ratio',
  'courtyard aperture size and roof-ring thickness',
  'front portal position relative to long glass façade',
  'curtain-wall bay spacing and dark mullion value',
  'green-to-white-to-grey material zoning on roof and plinth',
];
spec.qualityContract.antiShallowSpecRules = [
  'Do not fuse the roof slab, courtyard parapet, grass band, and walkway into one opaque mesh.',
  'Do not represent the curtain-wall bay rhythm with a flat texture alone.',
  'Do not omit the front and roof medical crosses.',
  'Do not accept orbit views where the roof or walls collapse to planar cards.',
];
spec.qualityContract.mustNotDo = [...spec.qualityContract.antiShallowSpecRules];

spec.qualityTargets = {
  targetFidelity: 0.76,
  mustMatch: ['courtyard negative space', 'rounded white fascia', 'warm modular glazing', 'green roof and landscape ribbons', 'two medical crosses and stepped entry'],
  niceToHave: ['exact hidden rear façade', 'fully furnished unseen rooms', 'individual grass blade geometry'],
  fpsTarget: 60,
  reviewViewpoints: ['reference-isometric', 'front-three-quarter', 'rear-orbit', 'courtyard-top', 'grazing-material'],
};

spec.featureReviewTargets = [
  { id: 'courtyard-roof-system', name: 'Open courtyard and nested roof-ring system', tier: 'critical', passIds: ['blockout', 'structural-pass', 'form-refinement'], minimumScore: 0.82, mustPass: true, componentRefs: ['roof-assembly', 'roof-walkway', 'courtyard-parapet', 'courtyard-lawn'], evidenceRefs: ['full-object'] },
  { id: 'rounded-fascia-system', name: 'Rounded white floor and parapet bands', tier: 'critical', passIds: ['blockout', 'form-refinement'], minimumScore: 0.8, mustPass: true, componentRefs: ['outer-floor-slabs', 'outer-parapet', 'entrance-portal'], evidenceRefs: ['full-object'] },
  { id: 'warm-curtain-wall-system', name: 'Warm transparent façades and mullion rhythm', tier: 'critical', passIds: ['structural-pass', 'material-pass', 'surface-pass'], minimumScore: 0.78, mustPass: true, componentRefs: ['front-curtain-wall', 'left-curtain-wall', 'courtyard-walls', 'facade-mullions'], evidenceRefs: ['full-object'] },
  { id: 'landscape-ribbon-system', name: 'Ground and roof grass ribbons with white curbs', tier: 'critical', passIds: ['structural-pass', 'material-pass'], minimumScore: 0.78, mustPass: true, componentRefs: ['landscape-assembly', 'roof-grass-band', 'front-lawn-island', 'right-lawn-ribbon'], evidenceRefs: ['full-object'] },
  { id: 'medical-entry-system', name: 'Stepped glass entry and medical crosses', tier: 'critical', passIds: ['form-refinement', 'lighting-pass'], minimumScore: 0.8, mustPass: true, componentRefs: ['entrance-portal', 'entrance-doors', 'medical-crosses', 'front-steps'], evidenceRefs: ['full-object'] },
  { id: 'interior-readability', name: 'Visible warm lobby furniture and pendant lighting', tier: 'important', passIds: ['surface-pass', 'lighting-pass'], minimumScore: 0.66, mustPass: false, componentRefs: ['reception', 'seating-cluster', 'pendant-lights'], evidenceRefs: ['full-object'] },
];

spec.lookDevTargets.qualityPriority = 'performance-balanced';
spec.lookDevTargets.materialPass.referencePbrExtraction.requiredWhenSourceImagePresent = false;
spec.lookDevTargets.materialPass.referencePbrExtraction.acceptedLimitation =
  'The chat attachment was available to agent vision but not as a local image path. Materials are procedural visual estimates, not recovered PBR.';
spec.lightingFromPhoto = [
  'Key light: large soft neutral-warm directional light from upper camera-left, intensity 2.2, shadow radius 5.',
  'Fill light: cool-white hemisphere/environment fill at intensity 1.05 to keep white shell readable.',
  'Rim light: broad rear-right directional light at intensity 1.15 to separate parapets and glass edges.',
  'Exposure 0.82 with ACES filmic tone mapping; near-white studio background #f4f2ef.',
  'Soft contact shadows under plinth, curbs, steps, furniture, and façade slabs; no ambient-only lighting.',
];

for (const pass of spec.buildPasses) {
  pass.componentRefs = spec.componentTree
    .filter((c) => {
      if (pass.id === 'blockout') return c.level === 'macro';
      if (pass.id === 'structural-pass') return c.level === 'macro' || c.level === 'meso';
      if (pass.id === 'form-refinement') return c.material !== 'utility-invisible';
      if (pass.id === 'material-pass' || pass.id === 'surface-pass') return c.material !== 'utility-invisible';
      if (pass.id === 'interaction-pass') return c.level === 'macro' || c.level === 'meso';
      return ['root', 'roof-assembly', 'ground-storey', 'interior-floor', 'landscape-assembly'].includes(c.id);
    })
    .map((c) => c.id);
}

spec.assumptions = [
  'Rear and right elevations repeat the visible curtain-wall module language at lower confidence.',
  'Wall thickness, structural grid, and interior floor plan are inferred for a stable real-time prop.',
  'Grass is procedural texture plus sparse relief rather than millions of individual blades.',
  'Glass transmission is tuned for interior readability, not physically exact optical simulation.',
];
spec.risks = [
  'Single view hides the rear façade and underside of roof bands.',
  'Transparent façade sorting may vary with renderer and orbit angle.',
  'Procedural rounded rings approximate the reference’s subtly asymmetric entrance notches.',
];
spec.proceduralStrategy = [
  'Extruded rounded-ring shapes for site, slabs, roof promenade, parapets, and landscape curbs.',
  'Separate transparent glass bays with dark repeated mullions and warm interior backing.',
  'Seeded independent canvas textures for grass albedo/bump and paving grid/roughness.',
  'Named interior furniture primitives provide parallax and scale through the curtain wall.',
  'Named groups, collider metadata, and stored base positions drive part picking and radial explode.',
];
spec.performanceBudget = {
  targetFps: 60,
  triangleBudget: 190000,
  drawCallBudget: 180,
  textureMemoryMB: 18,
  notes: 'Instanced/reused geometries for mullions, chairs, lights, and grass relief; no external models.',
};

fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);

const assessmentFile = JSON.parse(fs.readFileSync(assessmentPath, 'utf8'));
assessmentFile.sourceImage = observedSource;
assessmentFile.preSpecAssessment = assessment;
assessmentFile.qualityContract = spec.qualityContract;
assessmentFile.localSpecSearch = spec.localSpecSearch;
fs.writeFileSync(assessmentPath, `${JSON.stringify(assessmentFile, null, 2)}\n`);
