package de.winterfeld.logistik

import android.app.Application
import android.content.Context
import de.winterfeld.logistik.data.local.AppDatabase
import de.winterfeld.logistik.data.remote.ApiClient
import de.winterfeld.logistik.data.remote.TokenStore
import de.winterfeld.logistik.data.repo.AuthRepository
import de.winterfeld.logistik.data.repo.CaptureRepository
import de.winterfeld.logistik.data.repo.ProductRepository

/** Manueller DI-Container — bewusst ohne Framework, klein und explizit. */
class AppContainer(context: Context, val tokenStore: TokenStore = TokenStore(context)) {
    val apiClient = ApiClient(tokenStore)
    val database = AppDatabase.get(context)
    val authRepository = AuthRepository(apiClient, tokenStore)
    val captureRepository = CaptureRepository(database)
    val productRepository = ProductRepository(apiClient)
}

open class WinterfeldApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        CrashReporter.install(this)
        container = createContainer()
    }

    /** Tests ersetzen hier Teile, etwa die Token-Ablage. */
    protected open fun createContainer() = AppContainer(this)
}
