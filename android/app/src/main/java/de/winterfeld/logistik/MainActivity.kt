package de.winterfeld.logistik

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
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

        setContent {
            WinterfeldTheme {
                AppNavigation(
                    container = container,
                    ensurePermissions = { ensureCaptureRuntimePermissions() },
                )
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
        composable("products") {
            ProductListScreen(container.productRepository) { id ->
                navController.navigate("product/$id")
            }
        }
        composable("shopready") {
            ProductListScreen(container.productRepository, initialStatus = "shop_ready") { id ->
                navController.navigate("product/$id")
            }
        }
        composable("product/{id}") { backStackEntry ->
            ProductDetailScreen(container.productRepository,
                backStackEntry.arguments?.getString("id") ?: return@composable)
        }
        composable("suppliers") { SuppliersScreen(container.productRepository) }
        composable("locations") { LocationsScreen(container.productRepository) }
        composable("sync") {
            val context = androidx.compose.ui.platform.LocalContext.current
            SyncScreen(container.captureRepository) { SyncWorker.schedule(context) }
        }
        composable("settings") {
            SettingsScreen(container.authRepository, container.tokenStore.baseUrl) {
                loggedIn = false
            }
        }
    }
}
