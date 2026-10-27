import ExpoModulesCore
import ManagedSettings

// iOS screen time (docs/SCREEN_TIME.md, "iOS"): the two ManagedSettings switches react-native-device-activity does
// not expose. A named store of its own, so the library's shield store and this one never overwrite each other.
// Works only after the child device granted FamilyControls authorization (.child); before that the writes are
// ignored by the system. Called from JS only when the iosScreenTime flag is on.
public class UrokiAppLockModule: Module {
  public func definition() -> ModuleDefinition {
    Name("UrokiAppLock")

    // denyInstall: the App Store cannot install apps; denyRemoval: no app (incl. «Уроки») can be deleted.
    Function("set") { (denyInstall: Bool, denyRemoval: Bool) in
      if #available(iOS 16.0, *) {
        let store = ManagedSettingsStore(named: ManagedSettingsStore.Name("uroki.apps"))
        store.application.denyAppInstallation = denyInstall ? true : nil
        store.application.denyAppRemoval = denyRemoval ? true : nil
      }
    }

    Function("clear") {
      if #available(iOS 16.0, *) {
        ManagedSettingsStore(named: ManagedSettingsStore.Name("uroki.apps")).clearAllSettings()
      }
    }
  }
}
