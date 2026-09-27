package de.winterfeld.logistik.data.repo

import com.google.gson.Gson
import de.winterfeld.logistik.data.local.AppDatabase
import de.winterfeld.logistik.data.local.CaptureEntity
import de.winterfeld.logistik.data.local.CaptureImageEntity
import de.winterfeld.logistik.data.local.PendingOperationEntity
import de.winterfeld.logistik.data.remote.ApiClient
import de.winterfeld.logistik.data.remote.TokenStore
import de.winterfeld.logistik.data.remote.dto.AnswerDto
import de.winterfeld.logistik.data.remote.dto.AnswersRequest
import de.winterfeld.logistik.data.remote.dto.DashboardDto
import de.winterfeld.logistik.data.remote.dto.LoginRequest
import de.winterfeld.logistik.data.remote.dto.PageDto
import de.winterfeld.logistik.data.remote.dto.ProductDto
import de.winterfeld.logistik.data.remote.dto.UserDto
import kotlinx.coroutines.flow.Flow
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.util.UUID
import de.winterfeld.logistik.data.remote.ServerUrl

class AuthRepository(private val api: ApiClient, private val tokenStore: TokenStore) {
    val isLoggedIn: Boolean get() = tokenStore.isLoggedIn

    suspend fun login(serverUrl: String, email: String, password: String): UserDto {
        tokenStore.baseUrl = ServerUrl.normalize(serverUrl)
        val tokens = api.service().login(LoginRequest(email, password))
        tokenStore.accessToken = tokens.accessToken
        tokenStore.refreshToken = tokens.refreshToken
        return api.service().me()
    }

    fun logout() = tokenStore.clearTokens()

    val gespeicherteEmail: String? get() = tokenStore.gespeicherteEmail
    val gespeichertesPasswort: String? get() = tokenStore.gespeichertesPasswort

    fun anmeldedatenMerken(email: String, passwort: String) =
        tokenStore.anmeldedatenMerken(email, passwort)

    fun anmeldedatenVergessen() = tokenStore.anmeldedatenVergessen()
}

/**
 * Offline-first: Alles wird zuerst in Room persistiert, dann als Operation
 * eingereiht. Der SyncWorker spielt die Queue idempotent nach.
 */
class CaptureRepository(
    private val db: AppDatabase,
    private val gson: Gson = Gson(),
) {
    suspend fun startCapture(quickMode: Boolean): CaptureEntity {
        val capture = CaptureEntity(id = UUID.randomUUID().toString(), quickMode = quickMode)
        db.captureDao().upsert(capture)
        db.pendingOperationDao().enqueue(
            PendingOperationEntity(captureId = capture.id, type = "CREATE_CAPTURE"))
        return capture
    }

    suspend fun addImage(captureId: String, file: File, role: String): CaptureImageEntity {
        val image = CaptureImageEntity(
            id = UUID.randomUUID().toString(), captureId = captureId,
            filePath = file.absolutePath, role = role)
        db.captureImageDao().insert(image)
        db.pendingOperationDao().enqueue(PendingOperationEntity(
            captureId = captureId, type = "UPLOAD_IMAGE",
            payload = gson.toJson(mapOf("imageId" to image.id))))
        return image
    }

    suspend fun addTranscript(captureId: String, transcript: String) {
        db.captureDao().setTranscript(captureId, transcript)
        db.pendingOperationDao().enqueue(PendingOperationEntity(
            captureId = captureId, type = "SEND_VOICE",
            payload = gson.toJson(mapOf("transcript" to transcript))))
    }

    suspend fun sendAnswer(captureId: String, answer: AnswerDto) {
        db.pendingOperationDao().enqueue(PendingOperationEntity(
            captureId = captureId, type = "SEND_ANSWER", payload = gson.toJson(answer)))
    }

    suspend fun confirm(captureId: String, duplicateAction: String? = null,
                        duplicateId: String? = null) {
        db.pendingOperationDao().enqueue(PendingOperationEntity(
            captureId = captureId, type = "CONFIRM",
            payload = gson.toJson(mapOf(
                "duplicateAction" to duplicateAction, "duplicateId" to duplicateId))))
        db.captureDao().setStatus(captureId, "syncing")
    }

    suspend fun capture(id: String): CaptureEntity? = db.captureDao().byId(id)
    suspend fun images(captureId: String): List<CaptureImageEntity> =
        db.captureImageDao().forCapture(captureId)

    fun observeCaptures(): Flow<List<CaptureEntity>> = db.captureDao().observeAll()
    fun observePendingCount(): Flow<Int> =
        db.pendingOperationDao().observePendingCaptureCount()
    fun observePendingOperations(): Flow<List<PendingOperationEntity>> =
        db.pendingOperationDao().observeAll()
}

class ProductRepository(private val api: ApiClient) {
    suspend fun dashboard(): DashboardDto = api.service().dashboard()
    /** [filter]: Bearbeitungsstatus, außer "published" — das ist der Veröffentlichungsstatus. */
    suspend fun list(query: String?, filter: String?, offset: Int = 0): PageDto<ProductDto> =
        if (filter == "published")
            api.service().products(query = query, publicationStatus = filter, offset = offset)
        else api.service().products(query = query, status = filter, offset = offset)
    suspend fun get(id: String): ProductDto = api.service().product(id)
    suspend fun getCaptureState(serverId: String): ProductDto = api.service().getCapture(serverId)
    /** Ändert Felder; null leert ein Feld (deshalb mit serializeNulls gesendet). */
    suspend fun patch(id: String, fields: Map<String, Any?>): ProductDto =
        api.service().patchProduct(id, patchBody(fields))
    /** Beantwortet eine Rückfrage — auch nach dem Speichern der Erfassung. */
    suspend fun answer(id: String, answer: AnswerDto): ProductDto =
        api.service().sendAnswers(id, AnswersRequest(listOf(answer)))
    suspend fun sendAnswersDirect(serverId: String, answers: List<AnswerDto>): ProductDto =
        api.service().sendAnswers(serverId, AnswersRequest(answers))
    /** Absturzbericht an den Server; true, wenn er angekommen ist. */
    suspend fun reportError(body: de.winterfeld.logistik.data.remote.dto.ClientErrorDto): Boolean =
        api.service().clientError(body).isSuccessful
    suspend fun suppliers() = api.service().suppliers()
    suspend fun storageLocations() = api.service().storageLocations()
}

/** JSON für PATCH: Gson ließe null-Werte sonst weg, und "Feld leeren" käme nie an. */
fun patchBody(fields: Map<String, Any?>): okhttp3.RequestBody =
    com.google.gson.GsonBuilder().serializeNulls().create().toJson(fields)
        .toRequestBody("application/json".toMediaType())
