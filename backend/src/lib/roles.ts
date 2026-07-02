/** Helper compartido de autorización: roles con visibilidad total (buzón, gestión). */
export function isPrivileged(role: string | undefined): boolean {
  return role === 'ADMIN' || role === 'COORDINATOR';
}
