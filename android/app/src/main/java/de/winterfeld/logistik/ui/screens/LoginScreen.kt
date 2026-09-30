package de.winterfeld.logistik.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Checkbox
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import de.winterfeld.logistik.BuildConfig
import de.winterfeld.logistik.data.remote.ServerUrl
import de.winterfeld.logistik.data.repo.AuthRepository
import de.winterfeld.logistik.ui.components.BigButton
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(auth: AuthRepository, initialServerUrl: String, onLoggedIn: () -> Unit) {
    var serverUrl by remember {
        mutableStateOf(initialServerUrl.ifEmpty { BuildConfig.DEFAULT_SERVER_URL })
    }
    var email by remember { mutableStateOf(auth.gespeicherteEmail.orEmpty()) }
    var password by remember { mutableStateOf(auth.gespeichertesPasswort.orEmpty()) }
    var merken by remember { mutableStateOf(auth.gespeicherteEmail != null) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
           verticalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterVertically),
           horizontalAlignment = Alignment.CenterHorizontally) {
        Text("Winterfeldt Logistik", style = MaterialTheme.typography.headlineMedium)
        Text("Anmeldung Lager-App", color = MaterialTheme.colorScheme.outline)
        Column(Modifier.widthIn(max = 480.dp).fillMaxWidth(),
               verticalArrangement = Arrangement.spacedBy(14.dp)) {
            OutlinedTextField(value = serverUrl, onValueChange = { serverUrl = it },
                label = { Text("Server-Adresse") }, modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri,
                                                  autoCorrectEnabled = false),
                placeholder = { Text(BuildConfig.DEFAULT_SERVER_URL) })
            OutlinedTextField(value = email, onValueChange = { email = it },
                label = { Text("E-Mail") }, modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email,
                                                  autoCorrectEnabled = false))
            OutlinedTextField(value = password, onValueChange = { password = it },
                label = { Text("Passwort") }, modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                visualTransformation = PasswordVisualTransformation())
            // Anmeldedaten verschlüsselt auf dem Gerät merken — beim nächsten
            // Mal stehen E-Mail und Passwort schon drin.
            Row(Modifier.fillMaxWidth().toggleable(value = merken, role = Role.Checkbox,
                                                   onValueChange = { merken = it }),
                verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = merken, onCheckedChange = null)
                Text("Anmeldedaten auf diesem Gerät speichern",
                     modifier = Modifier.padding(start = 8.dp))
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            BigButton(if (busy) "Anmelden …" else "Anmelden", enabled = !busy) {
                busy = true; error = null
                scope.launch {
                    try {
                        auth.login(serverUrl, email.trim(), password)
                        // Erst nach erfolgreicher Anmeldung merken, nie falsche Daten.
                        if (merken) auth.anmeldedatenMerken(email.trim(), password)
                        else auth.anmeldedatenVergessen()
                        onLoggedIn()
                    } catch (e: Exception) {
                        error = ServerUrl.anmeldeFehler(e)
                    } finally { busy = false }
                }
            }
        }
    }
}
