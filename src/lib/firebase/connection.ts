/**
 * Optional Firestore reachability probe.
 * Not used on app boot — getDocFromServer() often reports "client is offline"
 * during startup (especially with named databases) and slows auth unnecessarily.
 */
export async function testConnection() {
  // Intentionally no-op. Real connectivity is validated by auth/profile listeners.
}
