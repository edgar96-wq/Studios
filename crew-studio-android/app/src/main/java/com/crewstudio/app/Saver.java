package com.crewstudio.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.provider.DocumentsContract;
import android.provider.MediaStore;

import org.json.JSONObject;

import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Saving exports. The page streams the file in pieces (saveBegin / saveChunk / saveEnd) into the app's cache,
 * then it goes to: "pick" — Android's save screen (OneDrive shows there when its app is installed),
 * "folder" — a folder picked once (e.g. the OneDrive jobs folder), or "phone" — Downloads › Crew Studio.
 */
final class Saver {
    private static final class Job { String id, name, mime, where; File tmp; OutputStream out; }

    private final MainActivity act;
    private final Map<String, Job> jobs = new HashMap<>();
    private int seq;
    private Job waiting; // the file waiting for Android's save screen

    Saver(MainActivity act) { this.act = act; }

    synchronized String begin(String name, String mime, String where) {
        Job j = new Job();
        j.id = "f" + (++seq);
        j.name = name.replaceAll("[\\\\/:*?\"<>|]", "_");
        j.mime = mime == null || mime.isEmpty() ? "application/octet-stream" : mime;
        j.where = where == null ? "pick" : where;
        try {
            j.tmp = new File(act.getCacheDir(), "out_" + j.id);
            j.out = new BufferedOutputStream(new FileOutputStream(j.tmp), 1 << 16);
            jobs.put(j.id, j);
        } catch (IOException e) {
            done(j, false, false, e.getMessage(), null);
        }
        return j.id;
    }

    synchronized void chunk(String id, byte[] b) {
        Job j = jobs.get(id);
        if (j == null || j.out == null) return;
        try { j.out.write(b); } catch (IOException e) { closeQuiet(j.out); j.out = null; }
    }

    void end(String id) {
        Job j;
        synchronized (this) { j = jobs.remove(id); }
        if (j == null) return;
        if (j.out == null) { done(j, false, false, "could not write the file", null); return; }
        try { j.out.close(); } catch (IOException e) { done(j, false, false, e.getMessage(), null); return; }
        if ("phone".equals(j.where)) new Thread(() -> toPhone(j), "save").start();
        else if ("folder".equals(j.where) && treeUri() != null) new Thread(() -> toFolder(j), "save").start();
        else pick(j);
    }

    private void pick(Job j) {
        synchronized (this) { if (waiting != null) done(waiting, false, true, null, null); waiting = j; }
        act.ui.post(() -> {
            Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType(j.mime);
            i.putExtra(Intent.EXTRA_TITLE, j.name);
            try { act.startActivityForResult(i, MainActivity.REQ_SAVE); }
            catch (Exception e) { synchronized (this) { waiting = null; } toPhone(j); }
        });
    }

    void onPicked(Uri uri) {
        Job j;
        synchronized (this) { j = waiting; waiting = null; }
        if (j == null) return;
        if (uri == null) { done(j, false, true, null, null); return; }
        new Thread(() -> {
            try { copy(j.tmp, act.getContentResolver().openOutputStream(uri, "wt")); done(j, true, false, null, "the place you chose"); }
            catch (Exception e) { done(j, false, false, e.getMessage(), null); }
        }, "save").start();
    }

    private void toPhone(Job j) {
        try {
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, j.name);
            v.put(MediaStore.MediaColumns.MIME_TYPE, j.mime);
            v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Crew Studio");
            ContentResolver cr = act.getContentResolver();
            Uri u = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            if (u == null) throw new IOException("Downloads is not available");
            copy(j.tmp, cr.openOutputStream(u));
            done(j, true, false, null, "Downloads › Crew Studio");
        } catch (Exception e) { done(j, false, false, e.getMessage(), null); }
    }

    private void toFolder(Job j) {
        try {
            Uri tree = treeUri();
            Uri parent = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
            Uri doc = DocumentsContract.createDocument(act.getContentResolver(), parent, j.mime, j.name);
            if (doc == null) throw new IOException("the folder refused the file");
            copy(j.tmp, act.getContentResolver().openOutputStream(doc, "wt"));
            done(j, true, false, null, folderName());
        } catch (Exception e) {
            pick(j); // folder gone or permission lost: fall back to the save screen
        }
    }

    void onTree(Uri tree) {
        if (tree == null) { act.emit("folder", "{\"ok\":false}"); return; }
        try {
            act.getContentResolver().takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (SecurityException e) { /* some providers give only temporary access */ }
        prefs().edit().putString("tree", tree.toString()).apply();
        String name = queryName(DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree)));
        prefs().edit().putString("treeName", name).apply();
        act.emit("folder", "{\"ok\":true,\"name\":" + JSONObject.quote(name) + "}");
    }

    private Uri treeUri() { String s = prefs().getString("tree", null); return s == null ? null : Uri.parse(s); }
    private String folderName() { return prefs().getString("treeName", "your folder"); }
    private SharedPreferences prefs() { return act.getSharedPreferences("crew", 0); }

    private String queryName(Uri doc) {
        try (Cursor c = act.getContentResolver().query(doc, new String[]{DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception e) { /* fall through */ }
        return "Picked folder";
    }

    private void done(Job j, boolean ok, boolean cancelled, String msg, String where) {
        if (j.tmp != null) //noinspection ResultOfMethodCallIgnored
            j.tmp.delete();
        StringBuilder s = new StringBuilder("{\"id\":").append(JSONObject.quote(j.id)).append(",\"ok\":").append(ok)
                .append(",\"cancelled\":").append(cancelled).append(",\"name\":").append(JSONObject.quote(j.name));
        if (where != null) s.append(",\"where\":").append(JSONObject.quote(where));
        if (msg != null) s.append(",\"msg\":").append(JSONObject.quote(msg));
        act.emit("saved", s.append('}').toString());
    }

    private static void copy(File src, OutputStream out) throws IOException {
        if (out == null) throw new IOException("could not open the destination");
        try (InputStream in = new FileInputStream(src); OutputStream o = out) {
            byte[] b = new byte[1 << 16];
            for (int n; (n = in.read(b)) > 0; ) o.write(b, 0, n);
        }
    }

    private static void closeQuiet(OutputStream o) { try { o.close(); } catch (IOException e) { /* ignore */ } }
}
