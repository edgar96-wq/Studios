package com.ledgerstudio.app;

import android.content.Context;
import android.content.SharedPreferences;

import com.microsoft.identity.client.AcquireTokenSilentParameters;
import com.microsoft.identity.client.AuthenticationCallback;
import com.microsoft.identity.client.IAccount;
import com.microsoft.identity.client.IAuthenticationResult;
import com.microsoft.identity.client.ISingleAccountPublicClientApplication;
import com.microsoft.identity.client.PublicClientApplication;
import com.microsoft.identity.client.SignInParameters;
import com.microsoft.identity.client.exception.MsalClientException;
import com.microsoft.identity.client.exception.MsalDeclinedScopeException;
import com.microsoft.identity.client.exception.MsalException;
import com.microsoft.identity.client.exception.MsalServiceException;
import com.microsoft.identity.client.exception.MsalUiRequiredException;

import org.json.JSONObject;

import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * OneDrive sign-in (read-only) with Microsoft's MSAL library, Ledger Studio's own app registration, single-account mode (res/raw/auth_config.json).
 * Sign in once; after that tokens are renewed silently. MSAL keeps them in this app's private, encrypted storage:
 * never in the web page, exports or backups (shared preferences are excluded from backups). Only the account name is shown to the page.
 */
final class Ms {
    /** MSAL adds openid, profile and offline_access by itself. */
    static final List<String> SCOPES = Arrays.asList("Files.Read", "User.Read"); // read-only: Ledger never changes anything in OneDrive (MSAL adds offline_access itself)

    /** Why a call can't go on, in words the page turns into a message. */
    static final class Fail extends IOException {
        final String code; // offline | signin | denied | nofolder | notfound | throttled | error
        Fail(String code, String msg) { super(msg); this.code = code; }
    }

    static final ExecutorService BG = Executors.newSingleThreadExecutor();
    private static ISingleAccountPublicClientApplication app;

    private Ms() { }

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences("ledger.ms", Context.MODE_PRIVATE); }

    /** Cheap, safe on the main thread: what we last knew. */
    static boolean signedIn(Context c) { return prefs(c).getString("account", null) != null && !prefs(c).getBoolean("again", false); }
    static String account(Context c) { return prefs(c).getString("account", ""); }

    /** Off the main thread only. */
    static synchronized ISingleAccountPublicClientApplication app(Context c) throws Fail {
        if (app != null) return app;
        try { app = PublicClientApplication.createSingleAccountPublicClientApplication(c.getApplicationContext(), R.raw.auth_config); }
        catch (Exception e) { throw new Fail("error", "Microsoft sign-in could not start: " + e.getMessage()); }
        return app;
    }

    /** A valid Graph token, renewed silently. Off the main thread only. */
    static String token(Context c, boolean forceRefresh) throws Fail {
        ISingleAccountPublicClientApplication a = app(c);
        IAccount acc;
        try { acc = a.getCurrentAccount().getCurrentAccount(); }
        catch (Exception e) { throw map(e); }
        if (acc == null) { prefs(c).edit().remove("account").apply(); throw new Fail("signin", "signed out"); }
        try {
            AcquireTokenSilentParameters p = new AcquireTokenSilentParameters.Builder()
                    .forAccount(acc).fromAuthority(acc.getAuthority()).withScopes(SCOPES).forceRefresh(forceRefresh).build();
            IAuthenticationResult r = a.acquireTokenSilent(p);
            remember(c, r.getAccount());
            return r.getAccessToken();
        } catch (Exception e) {
            Fail f = map(e);
            if ("signin".equals(f.code)) prefs(c).edit().putBoolean("again", true).apply(); // Microsoft wants the password again
            throw f;
        }
    }

    static Fail map(Exception e) {
        if (e instanceof Fail) return (Fail) e;
        if (e instanceof MsalUiRequiredException) return new Fail("signin", "Microsoft wants you to sign in again");
        if (e instanceof MsalDeclinedScopeException) return new Fail("denied", "OneDrive permission was not given");
        if (e instanceof MsalClientException) {
            String c = ((MsalClientException) e).getErrorCode();
            if ("device_network_not_available".equals(c) || "io_error".equals(c)) return new Fail("offline", "no signal");
            if ("no_current_account".equals(c)) return new Fail("signin", "signed out");
        }
        if (e instanceof MsalServiceException) {
            String c = ((MsalServiceException) e).getErrorCode();
            if ("access_denied".equals(c) || "consent_required".equals(c)) return new Fail("denied", "OneDrive permission was refused");
            if ("invalid_grant".equals(c) || "interaction_required".equals(c)) return new Fail("signin", "Microsoft wants you to sign in again");
        }
        if (e instanceof InterruptedException) Thread.currentThread().interrupt();
        String m = e.getMessage();
        return new Fail("error", m == null ? e.getClass().getSimpleName() : m);
    }

    private static void remember(Context c, IAccount a) {
        if (a == null) return;
        String u = a.getUsername();
        prefs(c).edit().putString("account", u == null || u.isEmpty() ? "Microsoft account" : u).remove("again").apply();
    }

    /** "Connect OneDrive": the Microsoft page opens once (in the browser); later calls are silent. */
    static void signIn(MainActivity act) {
        BG.execute(() -> {
            ISingleAccountPublicClientApplication a;
            IAccount cur;
            try {
                a = app(act);
                cur = a.getCurrentAccount().getCurrentAccount();
                if (cur != null) { // already signed in: if the token still works, done; if not, Microsoft asks for the password again
                    try { token(act, false); remember(act, cur); connected(act); return; }
                    catch (Fail f) { if (!"signin".equals(f.code)) { fail(act, f); return; } }
                }
            } catch (Exception e) { fail(act, map(e)); return; }
            final boolean again = cur != null; // signed in, but Microsoft wants the password again
            AuthenticationCallback cb = new AuthenticationCallback() {
                @Override public void onSuccess(IAuthenticationResult r) { remember(act, r.getAccount()); connected(act); }
                @Override public void onError(MsalException e) { fail(act, map(e)); }
                @Override public void onCancel() { act.emit("ms", "{\"ok\":false,\"cancelled\":true}"); }
            };
            act.ui.post(() -> {
                SignInParameters p = SignInParameters.builder().withActivity(act).withScopes(SCOPES).withCallback(cb).build();
                if (again) a.signInAgain(p); else a.signIn(p);
            });
        });
    }

    private static void connected(MainActivity act) {
        act.emit("ms", "{\"ok\":true,\"account\":" + JSONObject.quote(account(act)) + "}");
    }

    private static void fail(MainActivity act, Fail f) {
        act.emit("ms", "{\"ok\":false,\"code\":" + JSONObject.quote(f.code) + ",\"error\":" + JSONObject.quote(String.valueOf(f.getMessage())) + "}");
    }

    static void signOut(MainActivity act) {
        BG.execute(() -> {
            try { app(act).signOut(); } catch (Exception e) { /* forget it locally anyway */ }
            prefs(act).edit().clear().apply();
            act.emit("ms", "{\"ok\":false,\"signedOut\":true}");
        });
    }
}
