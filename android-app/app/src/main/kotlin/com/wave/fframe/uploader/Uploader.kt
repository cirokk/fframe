package com.wave.fframe.uploader

import android.content.Context
import android.net.Uri
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/** Envia um video para o servidor Fframe via POST /_ingest (autenticado por device key). */
object Uploader {

    data class Result(val ok: Boolean, val code: Int, val message: String)

    fun upload(context: Context, uri: Uri, name: String, prefs: Prefs): Result {
        val base = prefs.serverUrl
        if (base.isEmpty() || prefs.deviceKey.isEmpty())
            return Result(false, 0, "Servidor ou chave não configurados")

        val resolver = context.contentResolver
        val size = querySize(context, uri)
        val encodedName = Uri.encode(name)
        val projParam = if (prefs.projectId.isNotEmpty()) "&project=${Uri.encode(prefs.projectId)}" else ""
        val url = URL("$base/_ingest?name=$encodedName$projParam")

        var conn: HttpURLConnection? = null
        return try {
            conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                connectTimeout = 30_000
                readTimeout = 300_000
                setRequestProperty("X-Device-Key", prefs.deviceKey)
                setRequestProperty("Content-Type", "video/mp4")
                if (size > 0) setFixedLengthStreamingMode(size)
                else setChunkedStreamingMode(0)
            }
            resolver.openInputStream(uri)!!.use { input ->
                conn.outputStream.use { output ->
                    input.copyTo(output, 64 * 1024)
                }
            }
            val code = conn.responseCode
            val ok = code in 200..299
            Result(ok, code, if (ok) "enviado" else "erro HTTP $code")
        } catch (e: Exception) {
            Result(false, -1, e.message ?: "falha de rede")
        } finally {
            conn?.disconnect()
        }
    }

    /** Envia um arquivo ja pronto (o proxy gerado no aparelho). projectId sobrepoe o padrao. */
    fun uploadFile(file: File, name: String, prefs: Prefs, projectId: String = prefs.projectId): Result {
        val base = prefs.serverUrl
        if (base.isEmpty() || prefs.deviceKey.isEmpty())
            return Result(false, 0, "Servidor ou chave não configurados")
        val encodedName = Uri.encode(name)
        val projParam = if (projectId.isNotEmpty()) "&project=${Uri.encode(projectId)}" else ""
        val url = URL("$base/_ingest?name=$encodedName$projParam")
        var conn: HttpURLConnection? = null
        return try {
            conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"; doOutput = true
                connectTimeout = 30_000; readTimeout = 300_000
                setRequestProperty("X-Device-Key", prefs.deviceKey)
                setRequestProperty("Content-Type", "video/mp4")
                setFixedLengthStreamingMode(file.length())
            }
            file.inputStream().use { input -> conn.outputStream.use { out -> input.copyTo(out, 64 * 1024) } }
            val code = conn.responseCode
            val ok = code in 200..299
            Result(ok, code, if (ok) "enviado" else "erro HTTP $code")
        } catch (e: Exception) {
            Result(false, -1, e.message ?: "falha de rede")
        } finally { conn?.disconnect() }
    }

    private fun querySize(context: Context, uri: Uri): Long {
        return try {
            context.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.SIZE), null, null, null)?.use {
                if (it.moveToFirst()) it.getLong(0) else -1L
            } ?: -1L
        } catch (e: Exception) { -1L }
    }
}
