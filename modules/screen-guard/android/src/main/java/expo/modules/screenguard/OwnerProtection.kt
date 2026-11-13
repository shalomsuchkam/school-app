package expo.modules.screenguard

/** Policy logic is independent of Android so failure/ownership boundaries can be tested. */
internal interface OwnerPolicy {
  fun isOwner(): Boolean
  fun isBlocked(): Boolean
  fun setBlocked(blocked: Boolean)
  fun clearOwner()
}

internal class OwnerProtection(private val policy: OwnerPolicy) {
  fun status(): Map<String, Boolean> {
    val owner = policy.isOwner()
    return mapOf("device_owner" to owner, "uninstall_blocked" to (owner && policy.isBlocked()))
  }

  fun protect(): Map<String, Boolean> {
    if (policy.isOwner()) policy.setBlocked(true)
    return status() // Read back the actual OS state; never infer success from the request.
  }

  fun release(): Map<String, Boolean> {
    if (policy.isOwner()) {
      policy.setBlocked(false)
      policy.clearOwner()
    }
    return status()
  }
}
