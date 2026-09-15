import * as THREE from 'three'
import { smokeShader } from './smoke-shader'
import { SimulationBudgetError } from './simulation-errors'
import type { BandMember, EvaluatedFixture, EvaluatedFrame, FixtureDeployment, SimulationCamera } from './domain'
import { fixtureProfiles } from './fixtures'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { createStageScenery } from './stage-scenery'
import { defaultSimulationSettings, simulationFixtureOutput, validSimulationHaze, validSimulationBrightness, type SimulationSettings } from './simulation-settings'

/** Allocation guard, not a frame-rate guarantee; persisted shows retain their wider import limits. */
export function assertSimulationBudget(fixtures: FixtureDeployment[]) {
  if (fixtures.length > 1024) throw new SimulationBudgetError('Simulatie gepauzeerd: maximaal 1024 fixtures. Je show blijft beschikbaar om te bewerken en exporteren.')
  let heads = 0
  for (const fixture of fixtures) {
    if (fixtureProfiles.find(profile => profile.id === fixture.profileId)?.kind === 'hazer') continue
    // Grouped personalities still create a visible lamp and spotlight for every head.
    const segments = fixture.visualSegments ?? 1
    if (!Number.isInteger(segments) || segments < 1 || segments > 64) throw new SimulationBudgetError('Simulatie gepauzeerd: ongeldig aantal lichtpunten bij een fixture.')
    heads += segments
    if (heads > 256) throw new SimulationBudgetError('Simulatie gepauzeerd: maximaal 256 lichtpunten. Je show blijft beschikbaar om te bewerken en exporteren.')
  }
}

/** Approximate stage boundary, not a measured photometric beam throw. */
export function beamThrow(origin: THREE.Vector3, direction: THREE.Vector3) {
  let distance = 18
  for (const [axis, value] of [['y', 0], ['z', -5.15], ['x', -7.3], ['x', 7.3]] as const) {
    if (Math.abs(direction[axis]) < 1e-6) continue
    const t = (value - origin[axis]) / direction[axis]
    if (t <= .05 || t >= distance) continue
    const hit = origin.clone().addScaledVector(direction, t)
    const hitsSurface = axis === 'y' ? Math.abs(hit.x) <= 7 && hit.z >= -5 && hit.z <= 5
      : axis === 'z' ? Math.abs(hit.x) <= 7.3 && hit.y >= 0 && hit.y <= 5
      : hit.z >= -5.15 && hit.z <= -3.15 && hit.y >= 0 && hit.y <= 5
    if (hitsSurface) distance = t
  }
  return distance
}

function beamMaterial(origin: THREE.Vector3, direction: THREE.Vector3, length: number, angle: number, smokeTime: { value: number }) {
  // Beam scattering already represents the haze; scene fog must not add grey to emitted colours.
  const material = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide, toneMapped: false, fog: false })
  // Approximate scattering through a soft cone cross-section, rather than tinting its hard shell.
  material.onBeforeCompile = shader => {
    shader.uniforms.smokeTime = smokeTime
    shader.uniforms.beamOrigin = { value: origin.clone() }
    shader.uniforms.beamDirection = { value: direction.clone() }
    shader.uniforms.beamLength = { value: length }
    shader.uniforms.beamSpread = { value: Math.tan(angle) }
    shader.vertexShader = 'varying vec3 beamWorld;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nbeamWorld = (modelMatrix * vec4(position, 1.0)).xyz;')
    shader.fragmentShader = smokeShader + '\nvarying vec3 beamWorld; uniform vec3 beamOrigin; uniform vec3 beamDirection; uniform float beamLength; uniform float beamSpread;\n' + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      vec3 ray = normalize(beamWorld - cameraPosition);
      vec3 relative = cameraPosition - beamOrigin;
      float alignment = dot(ray, beamDirection);
      float perpendicular = max(0.001, 1.0 - alignment * alignment);
      float alongRay = max(0.0, (alignment * dot(relative, beamDirection) - dot(relative, ray)) / perpendicular);
      float alongBeam = clamp(dot(relative, beamDirection) + alignment * alongRay, 0.02, beamLength);
      vec3 center = beamOrigin + beamDirection * alongBeam;
      alongRay = max(0.0, dot(center - cameraPosition, ray));
      float radial = length(cameraPosition + ray * alongRay - center);
      float radius = max(0.02, alongBeam * beamSpread);
      float feather = 1.0 - smoothstep(0.1, 1.0, radial / radius);
      float thickness = 2.0 * sqrt(max(0.0, radius * radius - radial * radial)) / sqrt(max(0.05, perpendicular));
      float endFade = 1.0 - smoothstep(beamLength * 0.8, beamLength, alongBeam);
      diffuseColor.a *= feather * min(1.2, thickness * 0.35) * endFade * smokeDensity(cameraPosition + ray * alongRay);
      #include <opaque_fragment>
    `)
  }
  material.customProgramCacheKey = () => 'lightlab-soft-beam-smoke-v2'
  return material
}

export function createFixtureView(fixture: FixtureDeployment, segment: number, smokeTime = { value: 0 }) {
  const beamAngle = Math.PI / 10 // Conceptual half-angle until per-fixture optics are calibrated.
  const [x, y, z] = fixture.position
  const segmentX = x + (segment - ((fixture.visualSegments ?? 1) - 1) / 2) * 0.45
  // An emitter must not reflect palette colours from neighbouring lights.
  const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.13, 24), new THREE.MeshBasicMaterial({ color: '#000000', side: THREE.DoubleSide, fog: false }))
  lamp.position.set(segmentX, y, z)
  const direction = new THREE.Vector3(...fixture.aim).sub(fixture.aimMode === 'direction' ? new THREE.Vector3(...fixture.position) : lamp.position)
  if (direction.lengthSq() < 0.000001) direction.set(0, -1, 0)
  const targetDistance = direction.length()
  direction.normalize()
  const length = beamThrow(lamp.position, direction)
  const beam = new THREE.Mesh(new THREE.ConeGeometry(length * Math.tan(beamAngle), length, 48, 1, true), beamMaterial(lamp.position, direction, length, beamAngle, smokeTime))
  lamp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction)
  const housing = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.17, .14, .32, 16), new THREE.MeshStandardMaterial({ color: '#232830', roughness: .55, metalness: .65 }))
  body.position.copy(lamp.position).addScaledVector(direction, -.17)
  body.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)
  body.castShadow = true; body.receiveShadow = true
  housing.add(body)
  // ConeGeometry has its tip at +Y; its base extends along local -Y.
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), direction)
  beam.position.copy(lamp.position).addScaledVector(direction, length / 2)
  const light = new THREE.SpotLight('#ffffff', 0, 20, beamAngle, 0.75, 1.5)
  light.position.copy(lamp.position)
  light.target.position.copy(lamp.position).addScaledVector(direction, targetDistance)
  return { lamp, beam, light, housing }
}

/** Presentation gain only; evaluated intensities and physical output remain unchanged. */
export function updateFixtureView(view: ReturnType<typeof createFixtureView>, fixture: EvaluatedFixture, haze: number, segment = 0) {
  const output = fixture.segments?.[segment] ?? fixture
  const color = new THREE.Color(output.color)
  ;(view.lamp.material as THREE.MeshBasicMaterial).color.copy(color).multiplyScalar(output.intensity * 2.5)
  ;(view.beam.material as THREE.MeshBasicMaterial).color.copy(color)
  ;(view.beam.material as THREE.MeshBasicMaterial).opacity = output.intensity * haze * 0.08
  view.light.color.copy(color)
  view.light.intensity = output.intensity * 40
  view.beam.visible = output.intensity > 0 && haze > 0
}

/** Neutral, light-reactive stand-in; no emissive colour that could hide the lighting effect. */
export function createBandMemberView(member: BandMember) {
  const person = new THREE.Group()
  person.name = member.name
  person.position.set(...member.position)
  const clothing = new THREE.MeshStandardMaterial({ color: '#93979c', roughness: .85, metalness: 0 })
  const skin = new THREE.MeshStandardMaterial({ color: '#c8bcae', roughness: .8, metalness: 0 })
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const part = new THREE.Mesh(geometry, material)
    part.castShadow = true; part.receiveShadow = true
    part.position.set(x, y, z)
    person.add(part)
    return part
  }
  add(new THREE.SphereGeometry(.15, 16, 12), skin, 0, 1.62, 0)
  add(new THREE.CapsuleGeometry(.2, .3, 6, 16), clothing, 0, 1.15, 0)
  for (const side of [-1, 1]) {
    add(new THREE.CylinderGeometry(.08, .065, .77, 10), clothing, side * .11, .445, 0)
    add(new THREE.BoxGeometry(.17, .09, .29), clothing, side * .11, .045, .055)
    const arm = add(new THREE.CapsuleGeometry(.06, .48, 4, 12), clothing, side * .285, 1.09, 0)
    arm.rotation.z = side * .15
  }
  return person
}

export class StageSimulator {
  private readonly scene = new THREE.Scene()
  private readonly atmosphere = new THREE.FogExp2('#101722', 0)
  private readonly smokeTime = { value: 0 }
  private readonly reducedMotion: MediaQueryList
  private previousRenderTime: number | undefined
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100)
  private readonly renderer: THREE.WebGLRenderer
  private readonly composer: EffectComposer
  private readonly bloom: UnrealBloomPass
  private readonly output: OutputPass
  private readonly lights = new Map<string, Array<ReturnType<typeof createFixtureView>>>()
  private readonly resizeObserver: ResizeObserver
  private animationFrame = 0
  private shadowCount = 0
  private width = 0
  private height = 0
  private readonly fixtureGroups: Map<string, string>

  constructor(private readonly element: HTMLElement, fixtures: FixtureDeployment[], cameraPreset: SimulationCamera, bandMembers: BandMember[] = []) {
    assertSimulationBudget(fixtures)
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    this.fixtureGroups = new Map(fixtures.map(fixture => [fixture.id, fixture.groupId]))
    this.scene.fog = this.atmosphere
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.setClearColor('#010204')
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.1
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    // Scene geometry is immutable for this simulator instance. Color/level animation reuses shadows.
    this.renderer.shadowMap.autoUpdate = false
    this.renderer.shadowMap.needsUpdate = true
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: Math.min(4, this.renderer.capabilities.maxSamples) })
    this.composer = new EffectComposer(this.renderer, target)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .22, .45, 1.15)
    this.output = new OutputPass()
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.composer.addPass(this.bloom)
    this.composer.addPass(this.output)
    // Drawing-buffer pixels include DPR; every host needs CSS sizing to avoid Retina clipping.
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.renderer.domElement.style.display = 'block'
    element.append(this.renderer.domElement)
    this.setCamera(cameraPreset)
    this.scene.add(new THREE.HemisphereLight(0xb7c9e5, 0x11141b, 0.3))
    this.scene.add(createStageScenery())
    // Prefer front spots for the bounded shadow budget; the remaining lights still illuminate.
    const ordered = [...fixtures].sort((a, b) => Number(fixtureProfiles.find(p => p.id === b.profileId)?.kind === 'theatre-spot') - Number(fixtureProfiles.find(p => p.id === a.profileId)?.kind === 'theatre-spot'))
    ordered.forEach((fixture) => this.addFixture(fixture))
    bandMembers.forEach(member => this.scene.add(createBandMemberView(member)))
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(element); this.resize(); this.render()
  }

  private addFixture(fixture: FixtureDeployment) {
    if (fixtureProfiles.find((profile) => profile.id === fixture.profileId)?.kind === 'hazer') {
      const housing = new THREE.Mesh(new THREE.BoxGeometry(.5, .3, .6), new THREE.MeshStandardMaterial({ color: '#333b48' }))
      housing.position.set(...fixture.position)
      this.scene.add(housing)
      return
    }
    const views: Array<ReturnType<typeof createFixtureView>> = []
    const segments = fixture.visualSegments ?? 1
    for (let segment = 0; segment < segments; segment += 1) {
      const view = createFixtureView(fixture, segment, this.smokeTime)
      const { lamp, beam, light, housing } = view
      if (this.shadowCount < 4) {
        light.castShadow = true
        light.shadow.mapSize.set(1024, 1024)
        light.shadow.camera.near = .08
        light.shadow.camera.far = 20
        light.shadow.bias = -.0002
        light.shadow.normalBias = .025
        this.shadowCount++
      }
      this.scene.add(lamp, beam, light, light.target, housing)
      views.push(view)
    }
    this.lights.set(fixture.id, views)
  }

  update(frame: EvaluatedFrame, settings: SimulationSettings = defaultSimulationSettings) {
    this.renderer.toneMappingExposure = 1.1 * validSimulationBrightness(settings.brightness) / 100
    const hidden = new Set(settings.hiddenGroupIds)
    const isHidden = (id: string) => hidden.has(this.fixtureGroups.get(id) ?? '')
    // Viewer haze represents air already in the room, independent of the machine's DMX output.
    // Older direct consumers without a viewer preference still follow the evaluated hazer.
    const haze = settings.haze === undefined
      ? Math.max(0, ...frame.fixtures.map((fixture) => isHidden(fixture.fixtureId) ? 0 : fixture.haze))
      : validSimulationHaze(settings.haze) / 100
    this.atmosphere.density = haze * .022
    for (const fixture of frame.fixtures) {
      const views = this.lights.get(fixture.fixtureId); if (!views) continue
      const output = simulationFixtureOutput(fixture, isHidden(fixture.fixtureId))
      views.forEach((view, segment) => updateFixtureView(view, output, haze, segment))
    }
  }
  setCamera(preset: SimulationCamera) {
    this.camera.fov = preset.fov
    this.camera.position.set(...preset.position)
    // Vertical views need an explicit up axis: keep the audience at the bottom of the plan.
    const vertical = Math.hypot(preset.target[0] - preset.position[0], preset.target[2] - preset.position[2]) < .000001
    this.camera.up.set(0, vertical ? 0 : 1, vertical ? -1 : 0)
    this.camera.lookAt(...preset.target)
    this.camera.updateProjectionMatrix()
  }

  private resize() {
    const { width, height } = this.element.getBoundingClientRect()
    this.width = width; this.height = height
    if (width <= 0 || height <= 0) return
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix()
    const ratio = Math.min(window.devicePixelRatio, 1.5, Math.sqrt(2_000_000 / (width * height)))
    this.renderer.setPixelRatio(ratio); this.renderer.setSize(width, height, false)
    this.composer.setPixelRatio(ratio); this.composer.setSize(width, height)
  }
  private render = (now = performance.now()) => {
    this.animationFrame = requestAnimationFrame(this.render)
    const elapsed = this.previousRenderTime === undefined ? 0 : Math.min(.1, Math.max(0, (now - this.previousRenderTime) / 1000))
    this.previousRenderTime = now
    if (!document.hidden && this.width > 0 && this.height > 0) {
      // Independent of BPM/Look pauses; clamp gaps so a resumed tab never jumps through the plume.
      if (!this.reducedMotion.matches) this.smokeTime.value += elapsed
      this.composer.render()
    }
  }
  dispose() {
    cancelAnimationFrame(this.animationFrame)
    this.resizeObserver.disconnect()
    this.scene.traverse((object) => {
      if (object instanceof THREE.SpotLight) object.shadow.dispose()
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => material.dispose())
      }
    })
    this.bloom.dispose(); this.output.dispose(); this.composer.dispose()
    this.renderer.dispose()
    this.element.replaceChildren()
  }
}
