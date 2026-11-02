package com.crewstudio.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/**
 * GAIA Today, the home-screen widget. Reads only today.json (written by the page and by the background check).
 * 4×2: header, the first 3 open jobs, buttons. Taller sizes show more rows (up to 6).
 */
public class GaiaWidget extends AppWidgetProvider {
    static final String ACTION_REFRESH = "com.crewstudio.app.GAIA_REFRESH";
    static final String EXTRA_JOB = "crew.job", EXTRA_WHAT = "crew.what";
    private static final int[] ROW = {R.id.row0, R.id.row1, R.id.row2, R.id.row3, R.id.row4, R.id.row5};
    private static final int[] NO = {R.id.no0, R.id.no1, R.id.no2, R.id.no3, R.id.no4, R.id.no5};
    private static final int[] ADDR = {R.id.addr0, R.id.addr1, R.id.addr2, R.id.addr3, R.id.addr4, R.id.addr5};
    private static final int[] DUE = {R.id.due0, R.id.due1, R.id.due2, R.id.due3, R.id.due4, R.id.due5};

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, render(c, m, id));
        GaiaSync.schedule(c);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle o) {
        m.updateAppWidget(id, render(c, m, id)); // resized: show more or fewer rows
    }

    @Override
    public void onReceive(Context c, Intent i) {
        super.onReceive(c, i);
        if (ACTION_REFRESH.equals(i.getAction())) {
            if (Ms.signedIn(c)) { checking(c, true); GaiaSync.now(c); }
            updateAll(c);
        }
    }

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, GaiaWidget.class));
        for (int id : ids) m.updateAppWidget(id, render(c, m, id));
    }

    static void checking(Context c, boolean on) {
        c.getSharedPreferences("crew", Context.MODE_PRIVATE).edit().putLong("checking", on ? System.currentTimeMillis() : 0).apply();
    }

    private static RemoteViews render(Context c, AppWidgetManager m, int widgetId) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_gaia);
        JSONObject d = TodayStore.read(c);
        if (Build.VERSION.SDK_INT < 31) v.setViewVisibility(R.id.marble, View.GONE); // rounded clipping needs Android 12

        // how many rows fit: portrait height is OPTION_APPWIDGET_MAX_HEIGHT
        Bundle o = m.getAppWidgetOptions(widgetId);
        int h = o == null ? 0 : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        int rows = h <= 0 ? 3 : Math.max(1, Math.min(ROW.length, (h - 86) / 21));

        JSONArray jobs = d.optJSONArray("jobs");
        int count = d.optInt("count", jobs == null ? 0 : jobs.length());
        v.setTextViewText(R.id.count, String.valueOf(count));
        v.setTextViewText(R.id.countLabel, count == 1 ? "job" : "jobs");
        v.setTextViewText(R.id.status, status(c, d));

        int shown = 0;
        for (int i = 0; i < ROW.length; i++) {
            JSONObject j = jobs == null ? null : jobs.optJSONObject(i);
            if (j == null || i >= rows) { v.setViewVisibility(ROW[i], View.GONE); continue; }
            shown++;
            v.setViewVisibility(ROW[i], View.VISIBLE);
            v.setTextViewText(NO[i], j.optString("no", "—"));
            v.setTextViewText(ADDR[i], j.optString("address", "No address"));
            v.setTextViewText(DUE[i], due(j.optString("due", "")));
            v.setOnClickPendingIntent(ROW[i], openApp(c, 100 + i, j.optString("id"), null));
        }
        boolean none = jobs == null || jobs.length() == 0;
        v.setViewVisibility(R.id.empty, none ? View.VISIBLE : View.GONE);
        v.setTextViewText(R.id.empty, d.length() == 0 ? "Open Crew Studio once to load today's jobs." : "No open jobs today.");
        int more = count - shown;
        v.setViewVisibility(R.id.more, more > 0 && !none ? View.VISIBLE : View.GONE);
        v.setTextViewText(R.id.more, "+" + more + " more");

        // buttons
        v.setOnClickPendingIntent(R.id.head, openApp(c, 1, null, null));
        v.setOnClickPendingIntent(R.id.btnOpen, openApp(c, 2, null, null));
        String route = d.optString("route", "");
        if (!route.isEmpty() && !"null".equals(route)) {
            Intent r = new Intent(Intent.ACTION_VIEW, Uri.parse(route)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            v.setOnClickPendingIntent(R.id.btnRoute, PendingIntent.getActivity(c, 3, r, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
            dim(v, R.id.icRoute, R.id.txRoute, false);
        } else { // no open job with an address
            v.setOnClickPendingIntent(R.id.btnRoute, openApp(c, 3, null, null));
            dim(v, R.id.icRoute, R.id.txRoute, true);
        }
        String pkg = d.optString("ledger", "");
        Intent led = pkg.isEmpty() ? null : c.getPackageManager().getLaunchIntentForPackage(pkg);
        if (led != null) v.setOnClickPendingIntent(R.id.btnLedger, PendingIntent.getActivity(c, 4, led.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        else v.setOnClickPendingIntent(R.id.btnLedger, openApp(c, 4, null, "ledger-setup"));
        Intent ref = new Intent(c, GaiaWidget.class).setAction(ACTION_REFRESH);
        v.setOnClickPendingIntent(R.id.refresh, PendingIntent.getBroadcast(c, 5, ref, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        return v;
    }

    private static void dim(RemoteViews v, int icon, int text, boolean off) {
        v.setInt(icon, "setImageAlpha", off ? 100 : 255);
        v.setTextColor(text, off ? 0x80ECD38A : 0xFFECD38A);
    }

    private static PendingIntent openApp(Context c, int req, String job, String what) {
        Intent i = new Intent(c, MainActivity.class).setAction(Intent.ACTION_MAIN).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (job != null) i.putExtra(EXTRA_JOB, job);
        if (what != null) i.putExtra(EXTRA_WHAT, what);
        return PendingIntent.getActivity(c, req, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** The status line: OneDrive · checked 7:42 AM · 2 new / Offline · … / Sign in needed / Not connected */
    private static String status(Context c, JSONObject d) {
        long chk = c.getSharedPreferences("crew", Context.MODE_PRIVATE).getLong("checking", 0);
        if (chk > 0 && System.currentTimeMillis() - chk < 120_000) return "Checking OneDrive…";
        JSONObject sync = d.optJSONObject("sync"), rem = d.optJSONObject("remote");
        String state = sync == null ? "off" : sync.optString("state", "off");
        String last = sync == null ? "" : sync.optString("last", "");
        if ("null".equals(last)) last = "";
        boolean signed = Ms.signedIn(c);
        if (rem != null && after(rem.optString("checked"), last)) { // the background check is newer than the app's own
            String rs = rem.optString("state");
            if ("signin".equals(rs)) return "Sign in needed · open Crew Studio";
            if ("ok".equals(rs)) {
                String s = "OneDrive · checked " + when(rem.optString("checked"));
                int n = rem.optInt("new"), ch = rem.optInt("changed");
                if (n > 0) s += " · " + n + " new";
                else if (ch > 0) s += " · " + ch + " changed";
                return s;
            }
            String lastOk = rem.optString("lastOk", last);
            String head = "offline".equals(rs) ? "Offline" : "nofolder".equals(rs) ? "No GAIA/Jobs folder" : "denied".equals(rs) ? "OneDrive permission refused"
                    : "throttled".equals(rs) ? "OneDrive busy" : "OneDrive didn't answer";
            return head + (lastOk.isEmpty() ? "" : " · checked " + when(lastOk));
        }
        switch (state) {
            case "off": return "Not connected";
            case "signin": return signed ? "OneDrive" + (last.isEmpty() ? "" : " · checked " + when(last)) : "Sign in needed · open Crew Studio";
            case "offline": return "Offline" + (last.isEmpty() ? "" : " · checked " + when(last));
            default: return "OneDrive" + (last.isEmpty() ? "" : " · checked " + when(last));
        }
    }

    private static boolean after(String a, String b) {
        try { return !a.isEmpty() && (b.isEmpty() || OffsetDateTime.parse(a).isAfter(OffsetDateTime.parse(b))); }
        catch (Exception e) { return !a.isEmpty() && b.isEmpty(); }
    }

    private static String when(String iso) {
        try {
            ZonedDateTime t = OffsetDateTime.parse(iso).atZoneSameInstant(ZoneId.systemDefault());
            String hm = t.format(DateTimeFormatter.ofPattern("h:mm a", Locale.US));
            LocalDate day = t.toLocalDate(), now = LocalDate.now();
            if (day.equals(now)) return hm;
            if (day.equals(now.minusDays(1))) return "yesterday " + hm;
            return t.format(DateTimeFormatter.ofPattern("EEE MMM d", Locale.US));
        } catch (Exception e) { return iso; }
    }

    /** "2026-11-03" → "Tue 11/3"; "today" and other words stay as typed */
    private static String due(String s) {
        if (s.isEmpty()) return "";
        try {
            LocalDate d = LocalDate.parse(s.length() > 10 ? s.substring(0, 10) : s);
            if (d.equals(LocalDate.now())) return "today";
            return d.format(DateTimeFormatter.ofPattern("EEE M/d", Locale.US));
        } catch (Exception e) { return s.length() > 10 ? s.substring(0, 10) : s; }
    }
}
