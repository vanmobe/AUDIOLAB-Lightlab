import { expect, it } from 'vitest'
import * as THREE from 'three'
import { createFixtureView } from './simulator'
import { initialShow } from './seed'

it('shares the moving air field across independently compiled beam materials', () => {
  const time = { value: 3 }
  for (const fixture of initialShow.fixtures.slice(0, 2)) {
    const material = createFixtureView(fixture, 0, time).beam.material
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader }
    material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer)
    expect(shader.uniforms).toHaveProperty('smokeTime', time)
    expect(shader.fragmentShader).toContain('smokeDensity(cameraPosition + ray * alongRay)')
    time.value = 8
    expect((shader.uniforms as { smokeTime: { value: number } }).smokeTime.value).toBe(8)
  }
})
