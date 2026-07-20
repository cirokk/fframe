package com.wave.fframe.uploader

import android.content.Context

/** Configuracoes salvas do app (servidor, chave, modo, projeto, barra de status). */
class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("fframe", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = sp.getString("serverUrl", "")!!.trimEnd('/')
        set(v) = sp.edit().putString("serverUrl", v.trim().trimEnd('/')).apply()

    var deviceKey: String
        get() = sp.getString("deviceKey", "")!!
        set(v) = sp.edit().putString("deviceKey", v.trim()).apply()

    /** AUTO = envia tudo, ASK = pergunta, OFF = nao envia. */
    var uploadMode: String
        get() = sp.getString("uploadMode", MODE_ASK)!!
        set(v) = sp.edit().putString("uploadMode", v).apply()

    var bubbleEnabled: Boolean
        get() = sp.getBoolean("bubbleEnabled", false)
        set(v) = sp.edit().putBoolean("bubbleEnabled", v).apply()

    /** Mostrar a barrinha de status flutuante durante o envio. */
    var showStatusBar: Boolean
        get() = sp.getBoolean("showStatusBar", true)
        set(v) = sp.edit().putBoolean("showStatusBar", v).apply()

    /** Projeto de destino dos uploads (vazio = usa o projeto conectado no servidor). */
    var projectId: String
        get() = sp.getString("projectId", "")!!
        set(v) = sp.edit().putString("projectId", v).apply()

    var projectName: String
        get() = sp.getString("projectName", "")!!
        set(v) = sp.edit().putString("projectName", v).apply()

    /** Qualidade do proxy gerado no aparelho. */
    var proxyQuality: String
        get() = sp.getString("proxyQuality", PROXY_720)!!
        set(v) = sp.edit().putString("proxyQuality", v).apply()

    /** Permitir enviar usando dados móveis (senão, só no Wi-Fi). */
    var allowCellular: Boolean
        get() = sp.getBoolean("allowCellular", false)
        set(v) = sp.edit().putBoolean("allowCellular", v).apply()

    fun isConfigured() = serverUrl.isNotEmpty() && deviceKey.isNotEmpty()

    companion object {
        const val MODE_AUTO = "auto"
        const val MODE_ASK = "ask"
        const val MODE_OFF = "off"
        const val PROXY_720 = "720"       // 720p
        const val PROXY_1080LQ = "1080lq" // 1080p bitrate baixo
        const val PROXY_1080HQ = "1080hq" // 1080p bitrate alto

        fun proxyLabel(q: String) = when (q) {
            PROXY_1080LQ -> "1080 LQ"
            PROXY_1080HQ -> "1080 HQ"
            else -> "720"
        }
        /** altura, bitrate(bps) */
        fun proxySpec(q: String): Pair<Int, Int> = when (q) {
            PROXY_1080LQ -> 1080 to 4_000_000
            PROXY_1080HQ -> 1080 to 8_000_000
            else -> 720 to 2_500_000
        }
    }
}
