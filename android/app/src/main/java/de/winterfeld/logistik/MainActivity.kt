package de.winterfeld.logistik

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import de.winterfeld.logistik.capture.CaptureFlowScreen
import de.winterfeld.logistik.data.sync.SyncWorker
import de.winterfeld.logistik.ui.screens.DashboardScreen
import de.winterfeld.logistik.ui.screens.LocationsScreen
import de.winterfeld.logistik.ui.screens.LoginScreen
import de.winterfeld.logistik.ui.screens.ProductDetailScreen
import de.winterfeld.logistik.ui.screens.ProductListScreen
import de.winterfeld.logistik.ui.screens.SettingsScreen
import de.winterfeld.logistik.ui.screens.SuppliersScreen
import de.winterfeld.logistik.ui.screens.SyncScreen
import de.winterfeld.logistik.ui.theme.WinterfeldTheme

class MainActivity : ComponentActivity() {

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {}

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = (application as WinterfeldApp).container
        SyncWorker.schedule(this) // liegengebliebene Uploads direkt anstoßen

        // Ab Android 15 zeichnet jede App bis unter Status- und Navigationsleiste.
        // Einheitlich einschalten und den Inhalt unten per safeDrawingPadding
        // freihalten — so sieht es auf allen Android-Versionen gleich aus.
        enableEdgeToEdge()
        setContent {
            WinterfeldTheme {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    Box(Modifier.fillMaxSize().safeDrawingPadding()) {
                        AppNavigation(
                            container = container,
                            ensurePermissions = { ensureCaptureRuntimePermissions() },
                        )
                    }
                }
            }
        }
    }

    private fun ensureCaptureRuntimePermissions() {
        val needed = listOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO)
            .filter {
                ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
            }
        if (needed.isNotEmpty()) permissionLauncher.launch(needed.toTypedArray())
    }
}

@Composable
private fun AppNavigation(container: AppContainer, ensurePermissions: () -> Unit) {
    val navController = rememberNavController()
    var loggedIn by remember { mutableStateOf(container.authRepository.isLoggedIn) }
    var quickMode by remember { mutableStateOf(false) }
    val pendingCount by container.captureRepository.observePendingCount()
        .collectAsState(initial = 0)

    if (!loggedIn) {
        LoginScreen(container.authRepository, container.tokenStore.baseUrl) {
            loggedIn = true
        }
        return
    }

    val baseUrl = container.tokenStore.baseUrl.ifEmpty { BuildConfig.DEFAULT_SERVER_URL }
    val back: () -> Unit = { navController.popBackStack() }
    val openProduct: (String) -> Unit = { id -> navController.navigate("product/$id") }

    NavHost(navController = navController, startDestination = "dashboard") {
        composable("dashboard") {
            DashboardScreen(
                products = container.productRepository,
                pendingCount = pendingCount,
                quickMode = quickMode,
                onQuickModeChange = { quickMode = it },
                onStartCapture = {
                    ensurePermissions()
                    navController.navigate("capture")
                },
                onNavigate = { navController.navigate(it) },
            )
        }
        composable("capture") {
            CaptureFlowScreen(quickMode = quickMode) { navController.popBackStack() }
        }
        composable(
            "products?filter={filter}",
            arguments = listOf(navArgument("filter") {
                type = NavType.StringType; nullable = true; defaultValue = null
            }),
        ) { entry ->
            ProductListScreen(container.productRepository, baseUrl,
                              initialFilter = entry.arguments?.getString("filter"),
                              onBack = back, onOpen = openProduct)
        }
        composable("product/{id}") { entry ->
            ProductDetailScreen(container.productRepository,
                entry.arguments?.getString("id") ?: return@composable, baseUrl, onBack = back)
        }
        composable("suppliers") { SuppliersScreen(container.productRepository, onBack = back) }
        composable("locations") { LocationsScreen(container.productRepository, onBack = back) }
        composable("sync") {
            val context = LocalContext.current
            SyncScreen(container.captureRepository, onBack = back) { SyncWorker.schedule(context) }
        }
        composable("settings") {
            SettingsScreen(container.authRepository, container.tokenStore.baseUrl, onBack = back) {
                loggedIn = false
            }
        }
    }
}
