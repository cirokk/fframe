package com.wave.fframe.uploader

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.database.ContentObserver
import android.graphics.PixelFormat
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.MediaStore
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.concurrent.thread

/**
 * Servico em primeiro plano com:
 *  - bolha flutuante (toque abre o painel flutuante, sem sair do app atual)
 *  - painel flutuante: projeto de destino, modo, barra on/off, videos recentes, atalhos
 *  - barra de status de upload flutuante (aparece ao enviar, some ao terminar)
 *  - regra: painel aberto esconde a barra; ao fechar, a barra volta se ainda houver upload
 */
class OverlayBubbleService : Service() {

    private lateinit var wm: WindowManager
    private lateinit var prefs: Prefs
    private val ui = Handler(Looper.getMainLooper())
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private var bubbleView: View? = null
    private var statusDot: View? = null
    private var panelView: View? = null
    private var statusBarView: View? = null
    private var closeTargetView: View? = null

    private var activeUploads = 0
    private var projects: List<Api.Project> = emptyList()

    private var startedAt = 0L
    private val seenIds = HashSet<Long>()
    private var observer: ContentObserver? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        prefs = Prefs(this)
        wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        startedAt = System.currentTimeMillis()
        startForeground(NOTIF_ID, buildNotification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) { stopSelf(); return START_NOT_STICKY }
        addBubble()
        startWatching()
        return START_STICKY
    }

    private fun buildNotification(): Notification {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL, getString(R.string.notif_channel_name), NotificationManager.IMPORTANCE_LOW)
            )
        }
        return NotificationCompat.Builder(this, CHANNEL)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(getString(R.string.notif_bubble_text))
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setOngoing(true).build()
    }

    private fun overlayType() = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY

    // ---- Bolha --------------------------------------------------------------
    private fun addBubble() {
        if (bubbleView != null) return
        val view = LayoutInflater.from(this).inflate(R.layout.overlay_bubble, null)
        statusDot = view.findViewById(R.id.statusDot)
        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
            overlayType(), WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE, PixelFormat.TRANSLUCENT
        ).apply { gravity = Gravity.TOP or Gravity.START; x = 24; y = 240 }
        attachDrag(view, lp)
        wm.addView(view, lp)
        bubbleView = view
    }

    private fun attachDrag(view: View, lp: WindowManager.LayoutParams) {
        var startX = 0; var startY = 0; var touchX = 0f; var touchY = 0f; var moved = false
        view.setOnTouchListener { _, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> { startX = lp.x; startY = lp.y; touchX = e.rawX; touchY = e.rawY; moved = false; true }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (e.rawX - touchX).toInt(); val dy = (e.rawY - touchY).toInt()
                    if (kotlin.math.abs(dx) > 14 || kotlin.math.abs(dy) > 14) {
                        if (!moved) showCloseTarget()
                        moved = true
                    }
                    lp.x = startX + dx; lp.y = startY + dy; wm.updateViewLayout(view, lp)
                    if (moved) highlightCloseTarget(isOverCloseTarget(e.rawX, e.rawY))
                    true
                }
                MotionEvent.ACTION_UP -> {
                    val overClose = moved && isOverCloseTarget(e.rawX, e.rawY)
                    hideCloseTarget()
                    if (overClose) closeBubbleViaDrag()
                    else if (!moved) togglePanel()
                    true
                }
                else -> false
            }
        }
    }

    // ---- Arrastar para o X (fechar a bolha) ---------------------------------
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun showCloseTarget() {
        if (closeTargetView != null) return
        val v = LayoutInflater.from(this).inflate(R.layout.close_target, null)
        // Tamanho explicito: com WRAP_CONTENT o inflate(null) colapsa o layout
        // e o ✕ aparece fora do centro do circulo.
        val lp = WindowManager.LayoutParams(
            dp(88), dp(88),
            overlayType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
            PixelFormat.TRANSLUCENT
        ).apply { gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL; y = dp(70) }
        wm.addView(v, lp)
        closeTargetView = v
    }

    private fun hideCloseTarget() {
        closeTargetView?.let { runCatching { wm.removeView(it) } }
        closeTargetView = null
    }

    private fun highlightCloseTarget(over: Boolean) {
        closeTargetView?.let { it.scaleX = if (over) 1.35f else 1f; it.scaleY = if (over) 1.35f else 1f }
    }

    private fun isOverCloseTarget(rawX: Float, rawY: Float): Boolean {
        // Usa a posicao real do alvo na tela: displayMetrics.heightPixels exclui a
        // barra de navegacao em muitos aparelhos, enquanto rawX/rawY sao da tela toda.
        val v = closeTargetView ?: return false
        if (v.width == 0) return false // ainda sem layout
        val loc = IntArray(2)
        v.getLocationOnScreen(loc)
        val cx = loc[0] + v.width / 2f
        val cy = loc[1] + v.height / 2f
        return kotlin.math.hypot((rawX - cx).toDouble(), (rawY - cy).toDouble()) < dp(70)
    }

    private fun closeBubbleViaDrag() {
        prefs.bubbleEnabled = false
        toast("Bolha desligada")
        stopSelf()
    }

    private fun setStatusDot(color: Int) { ui.post { statusDot?.background?.setTint(getColor(color)) } }

    // ---- Painel flutuante ---------------------------------------------------
    private fun togglePanel() { if (panelView != null) closePanel() else openPanel() }

    private fun openPanel() {
        val v = LayoutInflater.from(this).inflate(R.layout.overlay_panel, null)
        v.findViewById<TextView>(R.id.panelClose).setOnClickListener { closePanel() }
        v.findViewById<Button>(R.id.panelConfig).setOnClickListener { closePanel(); openActivity(ConfigActivity::class.java) }
        v.findViewById<Button>(R.id.panelGallery).setOnClickListener { closePanel(); openActivity(MainActivity::class.java) }

        val projectBtn = v.findViewById<Button>(R.id.panelProject)
        projectBtn.text = (prefs.projectName.ifEmpty { "Projeto padrão" }) + " ▾"
        projectBtn.setOnClickListener { showProjectDialog(projectBtn) }

        val modeBtns = mapOf(
            Prefs.MODE_AUTO to v.findViewById<Button>(R.id.pmAuto),
            Prefs.MODE_ASK to v.findViewById<Button>(R.id.pmAsk),
            Prefs.MODE_OFF to v.findViewById<Button>(R.id.pmOff)
        )
        val refreshModes = {
            modeBtns.forEach { (mode, btn) ->
                val sel = prefs.uploadMode == mode
                btn.background = androidx.core.content.ContextCompat.getDrawable(this,
                    if (sel) R.drawable.btn_primary else R.drawable.btn_ghost)
                btn.setTextColor(getColor(if (sel) R.color.ink else R.color.muted))
            }
        }
        modeBtns.forEach { (mode, btn) -> btn.setOnClickListener { prefs.uploadMode = mode; refreshModes() } }
        refreshModes()

        val qBtns = mapOf(
            Prefs.PROXY_720 to v.findViewById<Button>(R.id.pq720),
            Prefs.PROXY_1080LQ to v.findViewById<Button>(R.id.pq1080lq),
            Prefs.PROXY_1080HQ to v.findViewById<Button>(R.id.pq1080hq)
        )
        val refreshQ = {
            qBtns.forEach { (q, btn) ->
                val sel = prefs.proxyQuality == q
                btn.background = androidx.core.content.ContextCompat.getDrawable(this,
                    if (sel) R.drawable.btn_primary else R.drawable.btn_ghost)
                btn.setTextColor(getColor(if (sel) R.color.ink else R.color.muted))
            }
        }
        qBtns.forEach { (q, btn) -> btn.setOnClickListener { prefs.proxyQuality = q; refreshQ() } }
        refreshQ()

        val sw = v.findViewById<Switch>(R.id.panelStatusSwitch)
        sw.isChecked = prefs.showStatusBar
        sw.setOnCheckedChangeListener { _, c -> prefs.showStatusBar = c; updateStatusBar() }

        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT,
            overlayType(),
            WindowManager.LayoutParams.FLAG_DIM_BEHIND, PixelFormat.TRANSLUCENT
        ).apply { gravity = Gravity.CENTER; dimAmount = 0.5f }
        wm.addView(v, lp)
        panelView = v
        loadProjectsAsync()
        updateStatusBar() // esconde a barra enquanto o painel esta aberto
    }

    private fun closePanel() {
        panelView?.let { runCatching { wm.removeView(it) } }
        panelView = null
        updateStatusBar() // barra volta se ainda houver upload
    }

    private fun showProjectDialog(btn: Button) {
        if (projects.isEmpty()) { toast("Carregando projetos…"); loadProjectsAsync(); return }
        val names = mutableListOf("Projeto padrão do servidor")
        names.addAll(projects.map { "${it.name} (${it.videoCount})" })
        val ctx = android.view.ContextThemeWrapper(this, R.style.Theme_Fframe)
        val dlg = androidx.appcompat.app.AlertDialog.Builder(ctx)
            .setTitle("Enviar para")
            .setItems(names.toTypedArray()) { _, which ->
                if (which == 0) { prefs.projectId = ""; prefs.projectName = ""; btn.text = "Projeto padrão ▾" }
                else { val p = projects[which - 1]; prefs.projectId = p.id; prefs.projectName = p.name; btn.text = "${p.name} ▾" }
            }.create()
        dlg.window?.setType(overlayType())
        dlg.show()
    }

    private fun loadProjectsAsync() {
        thread { val list = Api.projects(prefs); ui.post { projects = list } }
    }

    // ---- Barra de status flutuante ------------------------------------------
    private fun updateStatusBar() {
        val shouldShow = activeUploads > 0 && prefs.showStatusBar && panelView == null
        if (shouldShow) showStatusBar() else hideStatusBar()
    }

    private fun showStatusBar() {
        val text = "Enviando $activeUploads vídeo(s)…"
        if (statusBarView == null) {
            val v = LayoutInflater.from(this).inflate(R.layout.status_bar, null)
            val lp = WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
                overlayType(),
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
                PixelFormat.TRANSLUCENT
            ).apply { gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL; y = 60 }
            wm.addView(v, lp)
            statusBarView = v
        }
        statusBarView?.findViewById<TextView>(R.id.statusBarText)?.text = text
    }

    private fun hideStatusBar() {
        statusBarView?.let { runCatching { wm.removeView(it) } }
        statusBarView = null
    }

    // ---- Deteccao de video --------------------------------------------------
    private fun startWatching() {
        if (observer != null) return
        val obs = object : ContentObserver(ui) {
            override fun onChange(selfChange: Boolean, uri: Uri?) { checkForNewVideo() }
        }
        contentResolver.registerContentObserver(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, true, obs)
        observer = obs
    }

    private fun checkForNewVideo() {
        val col = arrayOf(MediaStore.Video.Media._ID, MediaStore.Video.Media.DISPLAY_NAME,
            MediaStore.Video.Media.DATE_ADDED, MediaStore.Video.Media.IS_PENDING)
        val sel = "${MediaStore.Video.Media.DATE_ADDED} >= ? AND ${MediaStore.Video.Media.IS_PENDING} = 0"
        val args = arrayOf((startedAt / 1000).toString())
        val sort = "${MediaStore.Video.Media.DATE_ADDED} DESC"
        try {
            contentResolver.query(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, col, sel, args, sort)?.use { c ->
                while (c.moveToNext()) {
                    val id = c.getLong(0); val name = c.getString(1) ?: "video.mp4"
                    if (seenIds.add(id)) {
                        val uri = Uri.withAppendedPath(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id.toString())
                        ui.post { onNewVideo(uri, name) }
                    }
                }
            }
        } catch (e: Exception) { }
    }

    private fun onNewVideo(uri: Uri, name: String) {
        when (prefs.uploadMode) {
            Prefs.MODE_OFF -> { }
            Prefs.MODE_AUTO -> doUpload(uri, name)
            else -> showAsk(uri, name)
        }
    }

    private fun showAsk(uri: Uri, name: String) {
        val v = LayoutInflater.from(this).inflate(R.layout.overlay_ask, null)
        v.findViewById<TextView>(R.id.askName).text = name
        var win: View? = v
        val remove = { win?.let { runCatching { wm.removeView(it) } }; win = null }
        v.findViewById<Button>(R.id.askIgnore).setOnClickListener { remove() }
        v.findViewById<Button>(R.id.askQueue).setOnClickListener {
            remove()
            Queue.add(applicationContext, Queue.Item(uri.toString(), name, prefs.projectId, prefs.projectName, prefs.proxyQuality))
            toast("Adicionado à fila (${prefs.projectName.ifEmpty { "projeto padrão" }})")
        }
        v.findViewById<Button>(R.id.askSend).setOnClickListener { remove(); doUpload(uri, name) }
        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT,
            overlayType(), WindowManager.LayoutParams.FLAG_DIM_BEHIND, PixelFormat.TRANSLUCENT
        ).apply { gravity = Gravity.BOTTOM; dimAmount = 0.4f; y = 80 }
        wm.addView(v, lp)
    }

    // ---- Upload -------------------------------------------------------------
    private fun queueItem(uri: Uri, name: String) =
        Queue.Item(uri.toString(), name, prefs.projectId, prefs.projectName, prefs.proxyQuality)

    private fun doUpload(uri: Uri, name: String) {
        // Sem permissao de rede (ex.: dados moveis desativados) -> vai pra fila
        if (!Net.canUploadNow(this, prefs)) {
            Queue.add(applicationContext, queueItem(uri, name))
            toast("Sem Wi-Fi — adicionado à fila para enviar depois")
            return
        }
        activeUploads++
        setStatusDot(R.color.royal)
        updateStatusBar()
        toast("Preparando proxy de $name…")
        // 1) cria o proxy no aparelho (na thread principal, exigencia do Transformer)
        ProxyMaker.make(this, uri, prefs.proxyQuality) { proxyFile ->
            if (proxyFile == null) {
                activeUploads = (activeUploads - 1).coerceAtLeast(0)
                setStatusDot(R.color.danger); toast("✗ Falha ao criar proxy de $name"); updateStatusBar()
                return@make
            }
            // 2) envia o proxy
            scope.launch {
                val res = Uploader.uploadFile(proxyFile, name, prefs)
                runCatching { proxyFile.delete() }
                withContext(Dispatchers.Main) {
                    activeUploads = (activeUploads - 1).coerceAtLeast(0)
                    if (res.ok) { setStatusDot(R.color.success); toast("✓ $name enviado") }
                    else {
                        setStatusDot(R.color.danger)
                        // falha de envio (rede) -> vai pra fila de reenvio
                        Queue.add(applicationContext, queueItem(uri, name))
                        toast("✗ Falha ao enviar $name — foi pra fila")
                    }
                    updateStatusBar()
                }
            }
        }
    }

    private fun openActivity(cls: Class<*>) {
        startActivity(Intent(this, cls).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    private fun toast(msg: String) = ui.post { Toast.makeText(this, msg, Toast.LENGTH_SHORT).show() }

    override fun onDestroy() {
        super.onDestroy()
        observer?.let { contentResolver.unregisterContentObserver(it) }
        bubbleView?.let { runCatching { wm.removeView(it) } }
        closePanel(); hideStatusBar(); hideCloseTarget()
        scope.cancel()
    }

    companion object {
        const val ACTION_STOP = "com.wave.fframe.uploader.STOP"
        private const val CHANNEL = "fframe_service"
        private const val NOTIF_ID = 1001
    }
}
