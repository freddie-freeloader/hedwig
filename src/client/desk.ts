export function deskIdFromLocation(search: string): string | null {
  const desk = new URLSearchParams(search).get('desk')
  if (!desk || !/^[a-z0-9-]{1,24}$/.test(desk)) return null
  return desk
}

export function databaseName(deskId: string | null): string {
  return deskId ? `hedwig-desk-${deskId}` : 'hedwig'
}
