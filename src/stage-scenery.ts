import * as THREE from 'three'

/** Presentation-only scenery: y=0 remains the deployment plane, +Z faces the audience. */
export function createStageScenery(): THREE.Group {
  const stage = new THREE.Group()
  stage.name = 'stage-scenery'
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(14, 0.3, 10),
    new THREE.MeshStandardMaterial({ color: '#898989', roughness: 0.6, metalness: 0 }),
  )
  floor.name = 'stage-floor'
  floor.position.y = -0.15
  floor.receiveShadow = true
  floor.castShadow = true
  stage.add(floor)

  const fabric = new THREE.MeshStandardMaterial({
    color: '#383838',
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
  })
  const curtainGeometry = (width: number) => {
    const geometry = new THREE.PlaneGeometry(width, 5, Math.ceil(width * 12), 1)
    const positions = geometry.getAttribute('position')
    for (let i = 0; i < positions.count; i++) {
      positions.setZ(i, 0.12 * Math.cos(positions.getX(i) * Math.PI * 4))
    }
    geometry.computeVertexNormals()
    return geometry
  }
  const rear = new THREE.Mesh(curtainGeometry(14.6), fabric)
  rear.name = 'stage-curtain'
  rear.position.set(0, 2.5, -5.15)
  rear.receiveShadow = true
  rear.castShadow = true
  stage.add(rear)
  const wingGeometry = curtainGeometry(2)
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(wingGeometry, fabric)
    wing.name = side < 0 ? 'stage-wing-left' : 'stage-wing-right'
    wing.position.set(side * 7.3, 2.5, -4.15)
    wing.rotation.y = Math.PI / 2
    wing.receiveShadow = true
    wing.castShadow = true
    stage.add(wing)
  }

  const truss = new THREE.Group()
  truss.name = 'stage-truss'
  truss.position.set(0, 4.8, -3)
  const aluminum = new THREE.MeshStandardMaterial({ color: '#a6a6a6', roughness: 0.38, metalness: 0.65 })
  // All tubes share a unit cylinder; transforms supply lengths and radii without extra buffers.
  const tubeGeometry = new THREE.CylinderGeometry(1, 1, 1, 8)
  const up = new THREE.Vector3(0, 1, 0)
  const tube = (from: THREE.Vector3, to: THREE.Vector3, radius: number) => {
    const direction = to.clone().sub(from)
    const mesh = new THREE.Mesh(tubeGeometry, aluminum)
    mesh.position.copy(from).add(to).multiplyScalar(0.5)
    mesh.scale.set(radius, direction.length(), radius)
    mesh.quaternion.setFromUnitVectors(up, direction.normalize())
    mesh.castShadow = true
    mesh.receiveShadow = true
    truss.add(mesh)
  }
  const corners = [
    [-0.2, -0.2],
    [-0.2, 0.2],
    [0.2, 0.2],
    [0.2, -0.2],
  ] as const
  for (const [y, z] of corners) tube(new THREE.Vector3(-6, y, z), new THREE.Vector3(6, y, z), 0.025)
  for (let bay = 0; bay <= 12; bay++) {
    const x = bay - 6
    for (let face = 0; face < 4; face++) {
      const [y, z] = corners[face]
      const [nextY, nextZ] = corners[(face + 1) % 4]
      tube(new THREE.Vector3(x, y, z), new THREE.Vector3(x, nextY, nextZ), 0.014)
      if (bay < 12) {
        const from = new THREE.Vector3(x, y, z)
        const to = new THREE.Vector3(x + 1, nextY, nextZ)
        if (bay % 2) {
          from.set(x, nextY, nextZ)
          to.set(x + 1, y, z)
        }
        tube(from, to, 0.012)
      }
    }
  }
  stage.add(truss)
  return stage
}
