import UIKit
import Capacitor

// iOS 27 exige el ciclo de vida UIScene: sin este delegado la app no abre.
// La ventana la crea el storyboard Main (UISceneStoryboardFile en Info.plist);
// acá solo se reenvían a Capacitor los enlaces (OAuth de Google, deep links
// y universal links), que con escenas ya no llegan al AppDelegate.
@objc(SceneDelegate)
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        for contexto in connectionOptions.urlContexts {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: contexto.url, options: [:])
        }
        for actividad in connectionOptions.userActivities {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: actividad, restorationHandler: { _ in })
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for contexto in URLContexts {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: contexto.url, options: [:])
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
    }
}
