package com.crewstudio.app;

import android.content.Context;
import android.net.Uri;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

/**
 * The background check behind GAIA Today: lists OneDrive GAIA/Jobs, reads job.json eTags 20 at a time,
 * and counts jobs that are new (ordered or scheduled, not on this phone yet) or changed by the office.
 * Only job folder names and counts are kept ("remote" in today.json); job.json is read in memory and dropped,
 * so no buyer, seller or phone numbers are stored. Importing still happens in the app, where the crew decides.
 */
public class GaiaSyncWorker extends Worker {
    public GaiaSyncWorker(@NonNull Context c, @NonNull WorkerParameters p) { super(c, p); }

    private static final String GRAPH = "https://graph.microsoft.com/v1.0";

    @NonNull
    @Override
    public Result doWork() {
        Context c = getApplicationContext();
        if (!MsAuth.signedIn(c)) { GaiaWidget.checking(c, false); GaiaWidget.updateAll(c); return Result.success(); }
        JSONObject today = TodayStore.read(c), old = today.optJSONObject("remote");
        JSONObject gaia = today.optJSONObject("gaia");
        String root = gaia != null ? gaia.optString("root", "GAIA/Jobs") : "GAIA/Jobs";
        JSONObject known = gaia != null && gaia.optJSONObject("known") != null ? gaia.optJSONObject("known") : new JSONObject();
        JSONArray open = gaia != null && gaia.optJSONArray("open") != null ? gaia.optJSONArray("open") : new JSONArray().put("ordered").put("scheduled");
        JSONObject seenBefore = old != null && old.optJSONObject("seen") != null ? old.optJSONObject("seen") : new JSONObject();

        JSONObject remote = new JSONObject();
        try {
            remote.put("checked", OffsetDateTime.now().truncatedTo(ChronoUnit.SECONDS).toString());
            String tok = MsAuth.access(c);
            List<String> names = new ArrayList<>();
            String url = GRAPH + path(root) + ":/children?$select=name,folder&$top=999";
            while (url != null) {
                JSONObject d = new JSONObject(MsAuth.get(url, tok));
                JSONArray v = d.optJSONArray("value");
                for (int i = 0; v != null && i < v.length(); i++) if (v.getJSONObject(i).has("folder")) names.add(v.getJSONObject(i).getString("name"));
                url = d.optString("@odata.nextLink", null);
                if (url != null && url.isEmpty()) url = null;
            }
            String[] tags = new String[names.size()];
            for (int i = 0; i < names.size(); i += 20) { // one round trip per 20 jobs
                JSONArray reqs = new JSONArray();
                for (int k = i; k < Math.min(names.size(), i + 20); k++)
                    reqs.put(new JSONObject().put("id", String.valueOf(k)).put("method", "GET")
                            .put("url", path(root + "/" + names.get(k) + "/job.json").substring(1) + "?$select=eTag,lastModifiedDateTime"));
                JSONObject b = new JSONObject(MsAuth.post(GRAPH + "/$batch", tok, new JSONObject().put("requests", reqs).toString()));
                JSONArray rs = b.optJSONArray("responses");
                for (int r = 0; rs != null && r < rs.length(); r++) {
                    JSONObject x = rs.getJSONObject(r), body = x.optJSONObject("body");
                    if (x.optInt("status") == 200 && body != null) tags[Integer.parseInt(x.getString("id"))] = body.optString("eTag", body.optString("lastModifiedDateTime"));
                }
            }
            int nNew = 0, nChanged = 0;
            JSONArray newIds = new JSONArray();
            JSONObject seen = new JSONObject();
            for (int i = 0; i < names.size(); i++) {
                String id = names.get(i), tag = tags[i];
                if (tag == null) continue;
                if (known.has(id)) {
                    if (!tag.equals(known.optString(id))) nChanged++; // the app decides what really changed
                    continue;
                }
                String kind; // new job: is it ordered or scheduled? remember the answer per eTag so job.json is read once
                JSONObject s = seenBefore.optJSONObject(id);
                if (s != null && tag.equals(s.optString("tag"))) kind = s.optString("kind");
                else {
                    String status = "";
                    try { status = new JSONObject(MsAuth.get(GRAPH + path(root + "/" + id + "/job.json") + ":/content", tok)).optString("status", ""); }
                    catch (org.json.JSONException e) { /* unreadable job.json: not counted */ }
                    kind = has(open, status.toLowerCase()) ? "new" : "other";
                }
                seen.put(id, new JSONObject().put("tag", tag).put("kind", kind));
                if ("new".equals(kind)) { nNew++; newIds.put(id); }
            }
            remote.put("state", "ok").put("new", nNew).put("changed", nChanged).put("newIds", newIds).put("seen", seen);
        } catch (MsAuth.SignInNeeded e) {
            put(remote, "state", "signin");
        } catch (MsAuth.HttpError e) {
            put(remote, "state", e.code == 404 ? "nofolder" : "error");
            keep(remote, old);
        } catch (IOException e) {
            put(remote, "state", "offline");
            keep(remote, old);
        } catch (Exception e) {
            put(remote, "state", "error");
            keep(remote, old);
        }
        TodayStore.writeRemote(c, remote);
        GaiaWidget.checking(c, false);
        GaiaWidget.updateAll(c);
        return Result.success(); // failures wait for the next hourly run: no retry storms on a weak signal
    }

    /** /me/drive/root:/GAIA/Jobs/… with each part encoded */
    private static String path(String rel) {
        StringBuilder b = new StringBuilder("/me/drive/root:");
        for (String part : rel.split("/")) b.append('/').append(Uri.encode(part));
        return b.toString();
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
