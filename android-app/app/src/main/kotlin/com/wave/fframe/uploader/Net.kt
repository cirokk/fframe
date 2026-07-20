package com.wave.fframe.uploader

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities

/** Detecta o tipo de conexão e decide se pode enviar agora. */
object Net {

    private fun caps(ctx: Context): NetworkCapabilities? {
        val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return null
        val net = cm.activeNetwork ?: return null
        return cm.getNetworkCapabilities(net)
    }

    fun isWifi(ctx: Context): Boolean =
        caps(ctx)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true ||
        caps(ctx)?.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) == true

    fun isCellular(ctx: Context): Boolean =
        caps(ctx)?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true

    fun hasInternet(ctx: Context): Boolean =
        caps(ctx)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true

    /** Pode enviar agora? Wi-Fi sempre; dados móveis só se o usuário permitiu. */
    fun canUploadNow(ctx: Context, prefs: Prefs): Boolean {
        if (!hasInternet(ctx)) return false
        if (isWifi(ctx)) return true
        if (isCellular(ctx)) return prefs.allowCellular
        return true // outras redes (ex.: ethernet/desconhecida)
    }
}
