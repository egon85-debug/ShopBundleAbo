package de.winterfeld.logistik.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
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
import de.winterfeld.logistik.data.repo.AuthRepository
import de.winterfeld.logistik.ui.components.BigButton
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(auth: AuthRepository, initialServerUrl: String, onLoggedIn: () -> Unit) {
    var serverUrl by remember { mutableStateOf(initialServerUrl) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Column(Modifier.fillMaxSize().padding(24.dp),
           verticalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterVertically),
           horizontalAlignment = Alignment.CenterHorizontally) {
        Text("WINTERFELD LOGISTIK", style = MaterialTheme.typography.displayLarge)
        Column(Modifier.widthIn(max = 480.dp).fillMaxWidth(),
               verticalArrangement = Arrangement.spacedBy(14.dp)) {
            OutlinedTextField(value = serverUrl, onValueChange = { serverUrl = it },
                label = { Text("Server-URL") }, modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("https://logistik.example.de") })
            OutlinedTextField(value = email, onValueChange = { email = it },
                label = { Text("E-Mail") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = password, onValueChange = { password = it },
                label = { Text("Passwort") }, modifier = Modifier.fillMaxWidth(),
                visualTransformation = PasswordVisualTransformation())
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            BigButton(if (busy) "Anmelden …" else "ANMELDEN", enabled = !busy) {
                busy = true; error = null
                scope.launch {
                    try {
                        auth.login(serverUrl, email.trim(), password)
                        onLoggedIn()
                    } catch (e: Exception) {
                        error = "Anmeldung fehlgeschlagen: ${e.message}"
                    } finally { busy = false }
                }
            }
        }
    }
}
