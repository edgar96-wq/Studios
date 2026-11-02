package com.crewstudio.app;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Iterator;

/**
 * The background check behind GAIA Today: lists GAIA/Jobs (same native Graph calls as the app) and counts jobs that
 * are new (ordered or scheduled, not on this phone yet) or changed by the office. Only folder names and counts are kept
 * ("remote" in today.json); job.json is read in memory and dropped, so no buyer, seller or phone numbers are stored.
 * Importing still happens in the app, where the crew decides.
 */
public class GaiaSyncWorker extends Worker {
    public GaiaSyncWorker(@NonNull Context c, @NonNull WorkerParameters p) { super(c, p); }

    @NonNull
    @Override
    public Result doWork() {
        Context c = getApplicationContext();
        if (!Ms.signedIn(c)) { GaiaWidget.checking(c, false); GaiaWidget.updateAll(c); return Result.success(); }
        JSONObject today = TodayStore.read(c), old = today.optJSONObject("remote"), gaia = today.optJSONObject("gaia");
        JSONObject known = gaia != null && gaia.optJSONObject("known") != null ? gaia.optJSONObject("known") : new JSONObject();
        JSONArray open = gaia != null && gaia.optJSONArray("open") != null ? gaia.optJSONArray("open") : new JSONArray().put("ordered").put("scheduled");
        JSONObject seenBefore = old != null && old.optJSONObject("seen") != null ? old.optJSONObject("seen") : new JSONObject();

        JSONObject remote = new JSONObject();
        try {
            remote.put("checked", OffsetDateTime.now().truncatedTo(ChronoUnit.SECONDS).toString());
            // what the page has, plus new jobs already classified: their job.json isn't downloaded again
            JSONObject ask = new JSONObject(known.toString());
            for (Iterator<String> it = seenBefore.keys(); it.hasNext(); ) {
                String k = it.next();
                if (!ask.has(k)) ask.put(k, seenBefore.getJSONObject(k).optString("tag"));
            }
            JSONArray list = Graph.listJobs(c, ask);
            int nNew = 0, nChanged = 0;
            JSONArray newIds = new JSONArray();
            JSONObject seen = new JSONObject();
            for (int i = 0; i < list.length(); i++) {
                JSONObject e = list.getJSONObject(i);
                String id = e.getString("name"), tag = e.isNull("etag") ? null : e.getString("etag");
                if (tag == null) continue;
                if (known.has(id)) { if (!tag.equals(known.optString(id))) nChanged++; continue; } // the app decides what really changed
                String kind;
                JSONObject s = seenBefore.optJSONObject(id);
                if (e.isNull("json") && s != null && tag.equals(s.optString("tag"))) kind = s.optString("kind");
                else {
                    String status = "";
                    try { status = new JSONObject(e.optString("json", "{}")).optString("status", ""); } catch (Exception x) { /* unreadable: not counted */ }
                    kind = has(open, status.toLowerCase()) ? "new" : "other";
                }
                seen.put(id, new JSONObject().put("tag", tag).put("kind", kind));
                if ("new".equals(kind)) { nNew++; newIds.put(id); }
            }
            remote.put("state", "ok").put("new", nNew).put("changed", nChanged).put("newIds", newIds).put("seen", seen);
        } catch (Ms.Fail f) {
            put(remote, "state", f.code);
            if (!"signin".equals(f.code)) keep(remote, old);
        } catch (Exception e) {
            put(remote, "state", "error");
            keep(remote, old);
        }
        TodayStore.writeRemote(c, remote);
        GaiaWidget.checking(c, false);
        GaiaWidget.updateAll(c);
        return Result.success(); // failures wait for the next hourly run: no retry storms on a weak signal
    }

    private static boolean has(JSONArray a, String s) {
        for (int i = 0; i < a.length(); i++) if (s.equals(a.optString(i))) return true;
        return false;
    }

    private static void put(JSONObject o, String k, Object v) { try { o.put(k, v); } catch (Exception e) { /* ignore */ } }

    /** On a failed check keep the last good counts, with the time they were found. */
    private static void keep(JSONObject remote, JSONObject old) {
        if (old == null) return;
        for (Iterator<String> it = old.keys(); it.hasNext(); ) {
            String k = it.next();
            if (!remote.has(k)) put(remote, k, old.opt(k));
        }
        if (old.has("checked")) put(remote, "lastOk", old.optString("lastOk", old.optString("checked")));
    }
}
