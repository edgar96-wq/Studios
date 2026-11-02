package com.crewstudio.app;

import android.content.Context;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * today.json in the app's private files: the only thing the GAIA Today widget reads.
 * The page writes everything except "remote"; the background check writes only "remote".
 * Holds job no., address, due and status: no client or personal data, never a token.
 */
final class TodayStore {
    private TodayStore() { }

    private static File file(Context c) { return new File(c.getFilesDir(), "today.json"); }

    static synchronized JSONObject read(Context c) {
        File f = file(c);
        if (!f.isFile()) return new JSONObject();
        try (InputStream in = new FileInputStream(f)) {
            byte[] b = new byte[(int) f.length()];
            int off = 0;
            for (int n; off < b.length && (n = in.read(b, off, b.length - off)) > 0; ) off += n;
            return new JSONObject(new String(b, 0, off, StandardCharsets.UTF_8));
        } catch (Exception e) { return new JSONObject(); }
    }

    /** From the page (through the bridge). Keeps what the background check found. */
    static synchronized void writePage(Context c, String json) {
        try {
            JSONObject in = new JSONObject(json), old = read(c);
            in.remove("remote");
            if (old.has("remote")) in.put("remote", old.get("remote"));
            save(c, in);
        } catch (Exception e) { /* a bad write is ignored; the widget keeps the last good file */ }
    }

    /** From the background check. */
    static synchronized void writeRemote(Context c, JSONObject remote) {
        try {
            JSONObject d = read(c);
            d.put("remote", remote);
            save(c, d);
        } catch (Exception e) { /* ignore */ }
    }

    /** Write a temp file, then rename it over today.json, so the widget never reads half a file. */
    private static void save(Context c, JSONObject d) throws IOException {
        File tmp = new File(c.getFilesDir(), "today.json.tmp");
        try (OutputStream o = new FileOutputStream(tmp)) { o.write(d.toString().getBytes(StandardCharsets.UTF_8)); }
        if (!tmp.renameTo(file(c))) throw new IOException("rename failed");
    }
}
