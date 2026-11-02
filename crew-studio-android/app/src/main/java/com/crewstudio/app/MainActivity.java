package com.crewstudio.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.window.OnBackInvokedDispatcher;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.File;
import java.io.IOException;

/**
 * Crew Studio: the field app runs as a web page inside a WebView (offline, from the app's own files).
 * This activity adds what a web page can't do: Bluetooth to the rover, NTRIP over the phone's internet,
 * saving exports to OneDrive / a folder / the phone, the camera for job photos, and the back button.
 */
public class MainActivity extends Activity {
    static final int REQ_FILES = 11, REQ_SAVE = 12, REQ_TREE = 13, REQ_BT = 14;
    static final String HOME = "https://appassets.androidplatform.net/assets/www/index.html";

    WebView web;
    RoverLink rover;
    Saver saver;
    ValueCallback<Uri[]> fileCb;
    Uri cameraUri;
    final Handler ui = new Handler(Looper.getMainLooper());

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(0xEE, 0xEB, 0xE6));
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        edgeToEdge(root);

        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setDatabaseEnabled(true);
        ws.setAllowFileAccess(false);
        ws.setAllowContentAccess(true);
        ws.setMediaPlaybackRequiresUserGesture(false);
        ws.setSupportZoom(false);
        ws.setBuiltInZoomControls(false);
        ws.setTextZoom(100);
        ws.setCacheMode(WebSettings.LOAD_DEFAULT);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setBackgroundColor(Color.rgb(0xEE, 0xEB, 0xE6));
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) WebView.setWebContentsDebuggingEnabled(true);

        final WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                return assets.shouldInterceptRequest(req.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                String h = u.getHost() == null ? "" : u.getHost();
                if ("appassets.androidplatform.net".equals(h)) return false;
                // Microsoft sign-in for OneDrive stays inside the app, so it can come back with the code
                if (h.matches("(.+\\.)?(login\\.microsoftonline\\.com|login\\.live\\.com|account\\.live\\.com|login\\.microsoft\\.com|account\\.microsoft\\.com|logincdn\\.msftauth\\.net)")) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException e) { /* nothing can open it */ }
                return true; // maps and other links open in their own apps
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                return openChooser(cb, params);
            }
        });
        rover = new RoverLink(this, this::emit);
        saver = new Saver(this);
        web.addJavascriptInterface(new Bridge(), "CrewNative");
        if (state != null) web.restoreState(state); else web.loadUrl(HOME);

        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }
    }

    /** Draw under the status and navigation bars (Android 15 does this anyway) and pad the page so nothing hides under them. */
    private void edgeToEdge(View root) {
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(light, light);
            }
            root.setOnApplyWindowInsetsListener((v, in) -> {
                android.graphics.Insets b = in.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                v.setPadding(b.left, b.top, b.right, b.bottom);
                return WindowInsets.CONSUMED;
            });
        } else {
            root.setFitsSystemWindows(true);
        }
    }

    /** Send an event to the page: window.__crewEvt(type, json). */
    void emit(String type, String json) {
        ui.post(() -> {
            if (web != null) web.evaluateJavascript("window.__crewEvt&&__crewEvt(" + JSONObject.quote(type) + "," + JSONObject.quote(json) + ")", null);
        });
    }

    void keepAwake(boolean on) {
        ui.post(() -> {
            if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }

    private void handleBack() {
        web.evaluateJavascript("window.__crewBack?String(window.__crewBack()):'false'", v -> {
            if (!"\"true\"".equals(v)) moveTaskToBack(true);
        });
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() { handleBack(); }

    boolean hasBtPermission() {
        return Build.VERSION.SDK_INT < 31 || checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    /* ---------------- photos: camera or gallery for <input type=file> ---------------- */
    private boolean openChooser(ValueCallback<Uri[]> cb, WebChromeClient.FileChooserParams params) {
        if (fileCb != null) fileCb.onReceiveValue(null);
        fileCb = cb;
        boolean images = false;
        for (String t : params.getAcceptTypes()) if (t == null || t.isEmpty() || t.startsWith("image")) images = true;
        Intent cam = null;
        if (images) {
            try {
                File dir = new File(getCacheDir(), "photos");
                if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("no photo folder");
                File img = File.createTempFile("photo_", ".jpg", dir);
                cameraUri = FileProvider.getUriForFile(this, getPackageName() + ".files", img);
                cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                cam.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (IOException e) { cam = null; }
        }
        Intent target;
        if (params.isCaptureEnabled() && cam != null) target = cam;
        else {
            Intent pick = params.createIntent();
            if (params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            target = Intent.createChooser(pick, "Choose");
            if (cam != null) target.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{cam});
        }
        try { startActivityForResult(target, REQ_FILES); }
        catch (ActivityNotFoundException e) { fileCb.onReceiveValue(null); fileCb = null; return false; }
        return true;
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_FILES) {
            if (fileCb == null) return;
            Uri[] out = null;
            if (res == RESULT_OK) {
                ClipData clip = data == null ? null : data.getClipData();
                if (clip != null && clip.getItemCount() > 0) {
                    out = new Uri[clip.getItemCount()];
                    for (int i = 0; i < out.length; i++) out[i] = clip.getItemAt(i).getUri();
                } else if (data != null && data.getData() != null) out = new Uri[]{data.getData()};
                else if (cameraUri != null) out = new Uri[]{cameraUri};
            }
            fileCb.onReceiveValue(out);
            fileCb = null;
        } else if (req == REQ_SAVE) {
            saver.onPicked(res == RESULT_OK && data != null ? data.getData() : null);
        } else if (req == REQ_TREE) {
            saver.onTree(res == RESULT_OK && data != null ? data.getData() : null);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onDestroy() {
        rover.disconnect(false);
        web.destroy();
        super.onDestroy();
    }

    /** What the page can call: window.CrewNative.* */
    public class Bridge {
        @JavascriptInterface public String version() { return "1"; }

        @JavascriptInterface public String btPaired() {
            if (!hasBtPermission()) {
                ui.post(() -> requestPermissions(new String[]{Manifest.permission.BLUETOOTH_CONNECT}, REQ_BT));
                return "{\"error\":\"Allow \\\"Nearby devices\\\" for Crew Studio, then press Connect again.\"}";
            }
            return rover.paired();
        }

        @JavascriptInterface public void btConnect(String address) { if (hasBtPermission()) rover.connect(address); }
        @JavascriptInterface public void btDisconnect() { rover.disconnect(true); }

        @JavascriptInterface public void openBtSettings() {
            ui.post(() -> { try { startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS)); } catch (ActivityNotFoundException e) { /* ignore */ } });
        }

        @JavascriptInterface public void ntripStart(String json) {
            try { rover.ntripStart(new JSONObject(json)); } catch (Exception e) { emit("ntrip", "{\"state\":\"error\",\"msg\":\"bad settings\"}"); }
        }

        @JavascriptInterface public void ntripStop() { rover.ntripStop(); }

        @JavascriptInterface public String saveBegin(String name, String mime, String where) { return saver.begin(name, mime, where); }
        @JavascriptInterface public void saveChunk(String id, String b64) { saver.chunk(id, Base64.decode(b64, Base64.DEFAULT)); }
        @JavascriptInterface public void saveEnd(String id) { saver.end(id); }

        @JavascriptInterface public void pickFolder() {
            ui.post(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                try { startActivityForResult(i, REQ_TREE); } catch (ActivityNotFoundException e) { emit("folder", "{\"ok\":false}"); }
            });
        }
    }
}
