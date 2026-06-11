// Live Object3D registry so the camera director and effects can track moving
// bodies (planets orbit continuously) without prop drilling refs.

const objects = new Map()

export function register(id, object3D) {
  objects.set(id, object3D)
  return () => {
    if (objects.get(id) === object3D) objects.delete(id)
  }
}

export function getObject(id) {
  return objects.get(id) || null
}

/** Writes the tracked object's world position into `out`. Returns false if missing. */
export function getWorldPosition(id, out) {
  const obj = objects.get(id)
  if (!obj) return false
  obj.getWorldPosition(out)
  return true
}
