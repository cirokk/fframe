package com.wave.fframe.uploader

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Consultas ao servidor Fframe usando a device key (projetos, videos recentes). */
object Api {

    data class Project(val id: String, val name: String, val videoCount: Int)
    data class Asset(val id: String, val name: String, val date: String)

    fun projects(prefs: Prefs): List<Project> {
        val body = get(prefs, "/_api/projects") ?: return emptyList()
        return try {
            val arr = JSONArray(body)
            (0 until arr.length()).map {
                val o = arr.getJSONObject(it)
                Project(o.getString("id"), o.getString("name"), o.optInt("video_count", 0))
            }
        } catch (e: Exception) { emptyList() }
    }

    fun recentAssets(prefs: Prefs, limit: Int = 20): List<Asset> {
        val body = get(prefs, "/_api/assets") ?: return emptyList()
        return try {
            val arr = JSONArray(body)
            (0 until minOf(arr.length(), limit)).map {
                val o = arr.getJSONObject(it)
                Asset(o.getString("id"), o.optString("name", "video"), o.optString("date", ""))
            }
        } catch (e: Exception) { emptyList() }
    }

    fun assetsOf(prefs: Prefs, projectId: String?): List<Asset> {
        val q = if (!projectId.isNullOrEmpty()) "?project=" + java.net.URLEncoder.encode(projectId, "UTF-8") else ""
        val body = get(prefs, "/_api/assets$q") ?: return emptyList()
        return try {
            val arr = JSONArray(body)
            (0 until arr.length()).map {
                val o = arr.getJSONObject(it)
                Asset(o.getString("id"), o.optString("name", "video"), o.optString("date", ""))
            }
        } catch (e: Exception) { emptyList() }
    }

    fun createProject(prefs: Prefs, name: String): Boolean {
        val body = JSONObject().put("name", name).toString()
        return send(prefs, "POST", "/_api/projects", body) in 200..299
    }

    fun deleteProject(prefs: Prefs, id: String): Boolean =
        send(prefs, "DELETE", "/_api/projects/$id", null) in 200..299

    fun deleteAsset(prefs: Prefs, id: String): Boolean =
        send(prefs, "DELETE", "/_api/assets/$id", null) in 200..299

    private fun send(prefs: Prefs, method: String, path: String, jsonBody: String?): Int {
        if (!prefs.isConfigured()) return 0
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(prefs.serverUrl + path).openConnection() as HttpURLConnection).apply {
                requestMethod = method
                connectTimeout = 15_000; readTimeout = 15_000
                setRequestProperty("X-Device-Key", prefs.deviceKey)
                if (jsonBody != null) {
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                }
            }
            if (jsonBody != null) conn.outputStream.use { it.write(jsonBody.toByteArray()) }
            conn.responseCode
        } catch (e: Exception) { -1 } finally { conn?.disconnect() }
    }

    /** URL para tocar/baixar um video. A autenticacao vai no header X-Device-Key
     *  (nunca na query string, para a chave nao vazar em logs de servidor/proxy). */
    fun mediaUrl(prefs: Prefs, id: String) = "${prefs.serverUrl}/_media/$id"

    private fun get(prefs: Prefs, path: String): String? {
        if (!prefs.isConfigured()) return null
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(prefs.serverUrl + path).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 15_000
                readTimeout = 15_000
                setRequestProperty("X-Device-Key", prefs.deviceKey)
            }
            if (conn.responseCode in 200..299) conn.inputStream.bufferedReader().readText() else null
        } catch (e: Exception) { null } finally { conn?.disconnect() }
    }
}
