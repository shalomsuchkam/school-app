package expo.modules.screenguard

import org.junit.Assert.*
import org.junit.Test

class OwnerProtectionTest {
  private class Policy(var owner: Boolean = true) : OwnerPolicy {
    var uninstallBlocked = false
    var ignoreBlock = false
    var failRelease = false
    val writes = mutableListOf<String>()
    override fun isOwner() = owner
    override fun isBlocked(): Boolean {
      check(owner) { "Non-owner must not query managed policy" }
      return uninstallBlocked
    }
    override fun setBlocked(blocked: Boolean) {
      check(owner)
      writes.add("block:$blocked")
      if (!ignoreBlock) this.uninstallBlocked = blocked
    }
    override fun clearOwner() {
      check(!uninstallBlocked) { "Remove our policy before clearing ownership" }
      if (failRelease) throw SecurityException("Cannot release")
      writes.add("release")
      owner = false
    }
  }

  @Test fun ordinaryDeviceNeverRequestsAdminOrChangesPolicy() {
    val policy = Policy(false)
    assertEquals(mapOf("device_owner" to false, "uninstall_blocked" to false), OwnerProtection(policy).protect())
    OwnerProtection(policy).release()
    assertTrue(policy.writes.isEmpty())
  }
  @Test fun ownerProtectsOnlyAfterOsConfirmsIt() {
    val policy = Policy()
    assertEquals(true, OwnerProtection(policy).protect()["uninstall_blocked"])
    assertEquals(listOf("block:true"), policy.writes)
  }
  @Test fun ignoredPolicyIsNeverShownAsProtected() {
    val policy = Policy().apply { ignoreBlock = true }
    assertEquals(false, OwnerProtection(policy).protect()["uninstall_blocked"])
  }
  @Test fun releaseRemovesPolicyBeforeOwnershipAndCanBeRepeated() {
    val policy = Policy().apply { uninstallBlocked = true }
    val protection = OwnerProtection(policy)
    assertEquals(false, protection.release()["device_owner"])
    protection.release()
    assertEquals(listOf("block:false", "release"), policy.writes)
  }
  @Test fun failedReleaseIsNotReportedAsSuccess() {
    val policy = Policy().apply { uninstallBlocked = true; failRelease = true }
    val protection = OwnerProtection(policy)
    assertThrows(SecurityException::class.java) { protection.release() }
    assertEquals(true, protection.status()["device_owner"])
    assertEquals(false, protection.status()["uninstall_blocked"])
  }
}

