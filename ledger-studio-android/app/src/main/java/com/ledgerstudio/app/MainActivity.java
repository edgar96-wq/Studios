package com.ledgerstudio.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.location.Address;
import android.location.Geocoder;
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

import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.List;
import java.util.Locale;

/**
 * Ledger Studio: the books run as a web page inside a WebView (offline, from the app's own files).
 * This activity adds what a web page can't do: drive tracking and its permissions, the phone's location,
 * address lookup, saving exports, the camera for receipts, and the back button.
 */
public class MainActivity extends Activity {
    static final int REQ_FILES = 11, REQ_SAVE = 12, REQ_TREE = 13, REQ_PERM = 14;
    static final String ORIGIN = "https://appassets.androidplatform.net", HOME = ORIGIN + "/assets/www/index.html";
    static final String[] LOCATION = {Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION};

    WebView web;
    Saver saver;
    OneDrive onedrive;
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
        ws.setSupportZoom(false);
        ws.setBuiltInZoomControls(false);
        ws.setTextZoom(100);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setBackgroundColor(Color.rgb(0xEE, 0xEB, 0xE6));
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) WebView.setWebContentsDebuggingEnabled(true);

        final WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .addPathHandler("/receipts/", new WebViewAssetLoader.InternalStoragePathHandler(this, receiptsDir()))
                .build();
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                return assets.shouldInterceptRequest(req.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if ("appassets.androidplatform.net".equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException e) { /* nothing can open it */ }
                return true; // other links open in their own apps
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                return openChooser(cb, params);
            }
        });
        saver = new Saver(this);
        onedrive = new OneDrive(this);
        web.addJavascriptInterface(new Bridge(), "LedgerNative");
        Tracker.ui = this;
        if (state != null) web.restoreState(state); else web.loadUrl(HOME);

        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        Tracker.ui = this;
        Tracker.register(this); // (re)start listening for drives; harmless if already listening
        emit("perms", Tracker.perms(this)); // the user may be back from Android's settings
        emit("track", Tracker.state(this));
    }

    File receiptsDir() {
        File d = new File(getFilesDir(), "receipts");
        //noinspection ResultOfMethodCallIgnored
        d.mkdirs();
        return d;
    }

    /** Draw under the status and navigation bars and pad the page so nothing hides under them. */
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

    /** Send an event to the page: window.__ledgerEvt(type, json). */
    void emit(String type, String json) {
        ui.post(() -> {
            if (web != null) web.evaluateJavascript("window.__ledgerEvt&&__ledgerEvt(" + JSONObject.quote(type) + "," + JSONObject.quote(json) + ")", null);
        });
    }

    private static String err(String msg) { return "{\"error\":" + JSONObject.quote(msg) + "}"; }

    private void handleBack() {
        web.evaluateJavascript("window.__ledgerBack?String(window.__ledgerBack()):'false'", v -> {
            if (!"\"true\"".equals(v)) moveTaskToBack(true);
        });
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() { handleBack(); }

    /* ---------------- permissions for tracking ---------------- */
    void ask(String what) {
        switch (what) {
            case "location":
                requestPermissions(LOCATION, REQ_PERM);
                break;
            case "background":
                if (!Tracker.hasFine(this)) requestPermissions(LOCATION, REQ_PERM);
                else if (Build.VERSION.SDK_INT >= 30) requestPermissions(new String[]{Manifest.permission.ACCESS_BACKGROUND_LOCATION}, REQ_PERM); // opens Android's page: pick "Allow all the time"
                else requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_BACKGROUND_LOCATION}, REQ_PERM);
                break;
            case "activity":
                requestPermissions(new String[]{Manifest.permission.ACTIVITY_RECOGNITION}, REQ_PERM);
                break;
            case "notifications":
                if (Build.VERSION.SDK_INT >= 33) requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_PERM);
                else open(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()));
                break;
            case "battery":
                @SuppressLint("BatteryLife")
                Intent b = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName()));
                if (!open(b)) open(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
                break;
            default:
                open(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getPackageName(), null)));
        }
    }

    private boolean open(Intent i) {
        try { startActivity(i); return true; } catch (ActivityNotFoundException e) { return false; }
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] results) {
        super.onRequestPermissionsResult(req, perms, results);
        Tracker.log(this, "permissions now: " + Tracker.perms(this));
        Tracker.register(this);
        emit("perms", Tracker.perms(this));
    }

    /* ---------------- files: camera/gallery for receipts, any file for statements and GPS tracks ---------------- */
    private boolean openChooser(ValueCallback<Uri[]> cb, WebChromeClient.FileChooserParams params) {
        if (fileCb != null) fileCb.onReceiveValue(null);
        fileCb = cb;
        boolean images = false;
        for (String t : params.getAcceptTypes()) if (t != null && t.startsWith("image")) images = true;
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
        Intent pick;
        if (images) pick = params.createIntent();
        else { // .csv / .gpx / .json: phones label these types differently, so let any file be picked
            pick = new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
        }
        Intent target = Intent.createChooser(pick, "Choose");
        if (cam != null) target.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{cam});
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
        if (Tracker.ui == this) Tracker.ui = null;
        web.destroy();
        super.onDestroy();
    }

    /** What the page can call: window.LedgerNative.* (every argument arrives as text) */
    public class Bridge {
        @JavascriptInterface public String version() { return "1"; }

        /* tracking */
        @JavascriptInterface public String state() { return Tracker.state(MainActivity.this); }
        @JavascriptInterface public String perms() { return Tracker.perms(MainActivity.this); }
        @JavascriptInterface public void setMode(String m) { Tracker.setMode(MainActivity.this, m); }
        @JavascriptInterface public void ask(String what) { ui.post(() -> MainActivity.this.ask(what)); }
        @JavascriptInterface public String log() { return Tracker.readLog(MainActivity.this); }
        @JavascriptInterface public String points(String since) { return Tracker.points(MainActivity.this, toLong(since)); }
        @JavascriptInterface public void prune(String before) { Tracker.prune(MainActivity.this, toLong(before)); }

        @JavascriptInterface public void startDrive() {
            ui.post(() -> {
                if (!Tracker.hasFine(MainActivity.this)) { MainActivity.this.ask("location"); return; }
                try {
                    startForegroundService(new Intent(MainActivity.this, TrackService.class).setAction(TrackService.ACTION_START).putExtra("why", "started from the app"));
                } catch (Exception e) { Tracker.log(MainActivity.this, "could not start recording (" + e.getClass().getSimpleName() + ")"); }
            });
        }

        @JavascriptInterface public void stopDrive() {
            TrackService s = TrackService.inst;
            if (s != null) s.stopNow("stopped from the app");
        }

        /* where am I / where is this address */
        @SuppressLint("MissingPermission")
        @JavascriptInterface public void here() {
            if (!Tracker.hasFine(MainActivity.this)) {
                ui.post(() -> requestPermissions(LOCATION, REQ_PERM));
                emit("here", err("Allow location for Ledger Studio, then tap again."));
                return;
            }
            ui.post(() -> LocationServices.getFusedLocationProviderClient(MainActivity.this)
                    .getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null)
                    .addOnSuccessListener(l -> {
                        if (l == null) { emit("here", err("No GPS fix yet. Step outside and try again.")); return; }
                        try {
                            emit("here", new JSONObject().put("lat", l.getLatitude()).put("lon", l.getLongitude()).put("acc", l.getAccuracy()).toString());
                        } catch (Exception e) { emit("here", err("Location failed.")); }
                    })
                    .addOnFailureListener(e -> emit("here", err("Location failed: " + e.getMessage()))));
        }

        @JavascriptInterface public void geocode(String q) {
            new Thread(() -> {
                try {
                    if (!Geocoder.isPresent()) { emit("geocode", err("Address lookup is not available on this phone.")); return; }
                    // search Florida first (SW corner, NE corner)
                    @SuppressWarnings("deprecation")
                    List<Address> list = new Geocoder(MainActivity.this, Locale.US).getFromLocationName(q, 5, 24.3, -87.7, 31.1, -79.8);
                    JSONArray arr = new JSONArray();
                    if (list != null) for (Address a : list) {
                        String label = a.getMaxAddressLineIndex() >= 0 ? a.getAddressLine(0) : q;
                        arr.put(new JSONObject().put("lat", a.getLatitude()).put("lon", a.getLongitude()).put("label", label));
                    }
                    emit("geocode", new JSONObject().put("results", arr).toString());
                } catch (Exception e) {
                    emit("geocode", err("Address lookup needs internet. (" + e.getMessage() + ")"));
                }
            }, "geocode").start();
        }

        /* receipts: kept in the app's own storage, shown from /receipts/ */
        @JavascriptInterface public String putReceipt(String name, String b64) {
            String safe = name.replaceAll("[^A-Za-z0-9._-]", "_");
            try (OutputStream o = new FileOutputStream(new File(receiptsDir(), safe))) {
                o.write(Base64.decode(b64, Base64.DEFAULT));
                return ORIGIN + "/receipts/" + safe;
            } catch (Exception e) { return ""; }
        }

        /* OneDrive jobs, read-only (see OneDrive.java) */
        @JavascriptInterface public String odStatus() { return onedrive.status(); }
        @JavascriptInterface public void odConnect(String clientId) { onedrive.connect(clientId); }
        @JavascriptInterface public void odOpen(String uri, String code) { onedrive.openLogin(uri, code); }
        @JavascriptInterface public void odDisconnect() { onedrive.disconnect(); }
        @JavascriptInterface public void odJobs(String req) { onedrive.listJobs(req); }

        /* saving exports (Android's save screen, so OneDrive or Downloads) */
        @JavascriptInterface public String saveBegin(String name, String mime, String where) { return saver.begin(name, mime, where); }
        @JavascriptInterface public void saveChunk(String id, String b64) { saver.chunk(id, Base64.decode(b64, Base64.DEFAULT)); }
        @JavascriptInterface public void saveEnd(String id) { saver.end(id); }

        private long toLong(String s) {
            try { return (long) Double.parseDouble(s); } catch (Exception e) { return 0; }
        }
    }
}
