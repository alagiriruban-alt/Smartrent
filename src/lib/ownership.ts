/** Every landlord query includes the signed-in user id. */
export function ownedWhere(userId: string, id?: string) {
  if (id === undefined) {
    return { ownerId: userId };
  }
  return { id, ownerId: userId };
}
