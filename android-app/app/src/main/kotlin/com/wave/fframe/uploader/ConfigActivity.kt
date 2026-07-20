package com.wave.fframe.uploader

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.RadioGroup
import android.widget.Spinner
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import kotlin.concurrent.thread

class ConfigActivity : AppCompatActivity() {

    private lateinit var prefs: Prefs
    private lateinit var serverUrl: EditText
    private lateinit var deviceKey: EditText
    private lateinit var uploadMode: RadioGroup
    private lateinit var proxyQuality: RadioGroup
    private lateinit var projectSpinner: Spinner
    private lateinit var statusBarSwitch: Switch
    private lateinit var cellularSwitch: Switch
    private lateinit var permStatus: TextView
    private lateinit var statusText: TextView
    private lateinit var toggleBtn: Button

    private var projects: List<Api.Project> = emptyList()

    private val askPermissions = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { refreshPermissions() }

    // Pareamento por QR: o painel gera um QR com {"url": ..., "key": ...}
    private val scanQr = registerForActivityResult(com.journeyapps.barcodescanner.ScanContract()) { result ->
        val text = result.contents ?: return@registerForActivityResult
        try {
            val o = org.json.JSONObject(text)
            serverUrl.setText(o.getString("url"))
            deviceKey.setText(o.getString("key"))
            save()
            loadProjects()
            toast("Pareado com o servidor!")
        } catch (e: Exception) {
            toast("QR code inválido — use o QR gerado no painel")
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_config)
        prefs = Prefs(this)

        serverUrl = findViewById(R.id.serverUrl)
        deviceKey = findViewById(R.id.deviceKey)
        uploadMode = findViewById(R.id.uploadMode)
        proxyQuality = findViewById(R.id.proxyQuality)
        projectSpinner = findViewById(R.id.projectSpinner)
        statusBarSwitch = findViewById(R.id.statusBarSwitch)
        cellularSwitch = findViewById(R.id.cellularSwitch)
        permStatus = findViewById(R.id.permStatus)
        statusText = findViewById(R.id.statusText)
        toggleBtn = findViewById(R.id.toggleBubbleBtn)

        serverUrl.setText(prefs.serverUrl)
        deviceKey.setText(prefs.deviceKey)
        statusBarSwitch.isChecked = prefs.showStatusBar
        cellularSwitch.isChecked = prefs.allowCellular
        when (prefs.uploadMode) {
            Prefs.MODE_AUTO -> uploadMode.check(R.id.modeAuto)
            Prefs.MODE_OFF -> uploadMode.check(R.id.modeOff)
            else -> uploadMode.check(R.id.modeAsk)
        }
        when (prefs.proxyQuality) {
            Prefs.PROXY_1080LQ -> proxyQuality.check(R.id.q1080lq)
            Prefs.PROXY_1080HQ -> proxyQuality.check(R.id.q1080hq)
            else -> proxyQuality.check(R.id.q720)
        }
        findViewById<TextView>(R.id.proxyInfo).setOnClickListener { showProxyInfo() }

        findViewById<Button>(R.id.scanQrBtn).setOnClickListener {
            scanQr.launch(
                com.journeyapps.barcodescanner.ScanOptions()
                    .setDesiredBarcodeFormats(com.journeyapps.barcodescanner.ScanOptions.QR_CODE)
                    .setPrompt("Aponte para o QR code do painel (Dispositivos → Adicionar)")
                    .setBeepEnabled(false)
                    .setOrientationLocked(true)
            )
        }
        findViewById<Button>(R.id.saveBtn).setOnClickListener { save() }
        findViewById<Button>(R.id.reloadProjects).setOnClickListener { loadProjects() }
        findViewById<Button>(R.id.permOverlayBtn).setOnClickListener { requestOverlay() }
        findViewById<Button>(R.id.permMediaBtn).setOnClickListener { requestMedia() }
        toggleBtn.setOnClickListener { toggleBubble() }

        setProjectAdapter(listOf(prefs.projectName.ifEmpty { "Projeto padrão do servidor" }))
        if (prefs.isConfigured()) loadProjects()
    }

    override fun onResume() {
        super.onResume(); refreshPermissions(); refreshToggle()
    }

    private fun setProjectAdapter(names: List<String>) {
        val ad = ArrayAdapter(this, android.R.layout.simple_spinner_item, names)
        ad.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        projectSpinner.adapter = ad
    }

    private fun loadProjects() {
        // salva servidor/chave atuais antes de consultar
        prefs.serverUrl = serverUrl.text.toString()
        prefs.deviceKey = deviceKey.text.toString()
        if (!prefs.isConfigured()) { toast("Preencha servidor e chave primeiro"); return }
        toast("Carregando projetos…")
        thread {
            val list = Api.projects(prefs)
            runOnUiThread {
                projects = list
                if (list.isEmpty()) { toast("Nenhum projeto (verifique servidor/chave)"); return@runOnUiThread }
                val names = list.map { "${it.name} (${it.videoCount})" }
                setProjectAdapter(names)
                val idx = list.indexOfFirst { it.id == prefs.projectId }
                if (idx >= 0) projectSpinner.setSelection(idx)
            }
        }
    }

    private fun save() {
        prefs.serverUrl = serverUrl.text.toString()
        prefs.deviceKey = deviceKey.text.toString()
        prefs.showStatusBar = statusBarSwitch.isChecked
        prefs.allowCellular = cellularSwitch.isChecked
        prefs.uploadMode = when (uploadMode.checkedRadioButtonId) {
            R.id.modeAuto -> Prefs.MODE_AUTO
            R.id.modeOff -> Prefs.MODE_OFF
            else -> Prefs.MODE_ASK
        }
        prefs.proxyQuality = when (proxyQuality.checkedRadioButtonId) {
            R.id.q1080lq -> Prefs.PROXY_1080LQ
            R.id.q1080hq -> Prefs.PROXY_1080HQ
            else -> Prefs.PROXY_720
        }
        val pos = projectSpinner.selectedItemPosition
        if (projects.isNotEmpty() && pos in projects.indices) {
            prefs.projectId = projects[pos].id
            prefs.projectName = projects[pos].name
        }
        toast("Configurações salvas")
    }

    // ---- Permissoes ---------------------------------------------------------
    private fun hasOverlay() = Settings.canDrawOverlays(this)
    private fun hasMedia(): Boolean {
        val perm = if (Build.VERSION.SDK_INT >= 33) Manifest.permission.READ_MEDIA_VIDEO
        else Manifest.permission.READ_EXTERNAL_STORAGE
        return ContextCompat.checkSelfPermission(this, perm) == PackageManager.PERMISSION_GRANTED
    }

    private fun requestOverlay() {
        if (hasOverlay()) return
        startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
    }

    private fun requestMedia() {
        val perms = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= 33) { perms.add(Manifest.permission.READ_MEDIA_VIDEO); perms.add(Manifest.permission.POST_NOTIFICATIONS) }
        else perms.add(Manifest.permission.READ_EXTERNAL_STORAGE)
        askPermissions.launch(perms.toTypedArray())
    }

    private fun refreshPermissions() {
        val o = if (hasOverlay()) "✓" else "✗"
        val m = if (hasMedia()) "✓" else "✗"
        permStatus.text = "Sobrepor apps: $o    •    Acesso a vídeos: $m"
    }

    // ---- Ligar/desligar a bolha --------------------------------------------
    private fun toggleBubble() {
        if (prefs.bubbleEnabled) {
            stopService(Intent(this, OverlayBubbleService::class.java)); prefs.bubbleEnabled = false
        } else {
            if (!prefs.isConfigured()) { toast("Preencha servidor e chave, e salve"); return }
            if (!hasOverlay()) { toast("Permita 'sobrepor apps' primeiro"); requestOverlay(); return }
            if (!hasMedia()) { toast("Permita o acesso aos vídeos primeiro"); requestMedia(); return }
            ContextCompat.startForegroundService(this, Intent(this, OverlayBubbleService::class.java))
            prefs.bubbleEnabled = true
        }
        refreshToggle()
    }

    private fun refreshToggle() {
        if (prefs.bubbleEnabled) {
            toggleBtn.text = "Desligar a bolha flutuante"
            statusText.text = "Bolha ativa. Grave em qualquer app de câmera."
        } else {
            toggleBtn.text = "Ligar a bolha flutuante"; statusText.text = ""
        }
    }

    private fun showProxyInfo() {
        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Qualidade de Proxy")
            .setMessage(
                "O proxy é uma versão mais leve do vídeo, criada no próprio aparelho antes do envio " +
                "(economiza dados e sobe mais rápido).\n\n" +
                "• 720 — menor e mais rápido\n" +
                "• 1080 LQ — Full HD, arquivo menor\n" +
                "• 1080 HQ — Full HD, melhor qualidade\n\n" +
                "O vídeo original em qualidade máxima continua salvo no seu celular."
            )
            .setPositiveButton("Entendi", null)
            .show()
    }

    private fun toast(m: String) = Toast.makeText(this, m, Toast.LENGTH_SHORT).show()
}
