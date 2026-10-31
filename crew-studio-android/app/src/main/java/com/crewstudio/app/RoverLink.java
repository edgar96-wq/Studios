package com.crewstudio.app;

import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Locale;
import java.util.UUID;

/**
 * The rover link: a Bluetooth serial (SPP) connection that reads NMEA, and an NTRIP client that
 * fetches RTCM corrections over the phone's internet and writes them straight to the rover.
 * Both run on their own threads and reconnect by themselves; the page only gets short status events
 * and the NMEA sentences it needs (GGA, GST, GSA), batched a few times a second.
 */
@SuppressLint("MissingPermission")
final class RoverLink {
    interface Emitter { void emit(String type, String json); }

    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private final MainActivity act;
    private final Emitter em;

    private volatile boolean btWanted;
    private volatile BluetoothSocket sock;
    private volatile OutputStream btOut;
    private final Object outLock = new Object();
    private volatile String btAddr, btName;
    private volatile String lastGga;
    private Thread btThread;

    private volatile boolean ntWanted;
    private volatile Socket ntSock;
    private volatile JSONObject ntCfg;
    private Thread ntThread;

    RoverLink(MainActivity act, Emitter em) { this.act = act; this.em = em; }

    private BluetoothAdapter adapter() {
        BluetoothManager m = (BluetoothManager) act.getSystemService(Context.BLUETOOTH_SERVICE);
        return m == null ? null : m.getAdapter();
    }

    String paired() {
        try {
            BluetoothAdapter ad = adapter();
            if (ad == null) return "{\"error\":\"This phone has no Bluetooth.\"}";
            if (!ad.isEnabled()) return "{\"error\":\"Turn Bluetooth on, then press Connect again.\"}";
            JSONArray a = new JSONArray();
            for (BluetoothDevice d : ad.getBondedDevices()) {
                JSONObject o = new JSONObject();
                o.put("name", d.getName() == null ? "" : d.getName());
                o.put("address", d.getAddress());
                a.put(o);
            }
            return a.toString();
        } catch (Exception e) {
            return "{\"error\":\"Bluetooth: " + esc(e.getMessage()) + "\"}";
        }
    }

    /* ---------------- Bluetooth ---------------- */
    synchronized void connect(String address) {
        disconnect(false);
        btWanted = true;
        btAddr = address;
        btThread = new Thread(this::btLoop, "rover-bt");
        btThread.start();
    }

    synchronized void disconnect(boolean tell) {
        btWanted = false;
        ntripStop();
        closeBt();
        if (btThread != null) btThread.interrupt();
        btThread = null;
        act.keepAwake(false);
        if (tell) bt("closed", null);
    }

    private void btLoop() {
        boolean everConnected = false;
        int fails = 0;
        while (btWanted) {
            bt(everConnected ? "reconnecting" : "connecting", null);
            BluetoothSocket s = null;
            try {
                BluetoothAdapter ad = adapter();
                if (ad == null) throw new IOException("no Bluetooth");
                BluetoothDevice dev = ad.getRemoteDevice(btAddr);
                btName = dev.getName();
                ad.cancelDiscovery();
                try {
                    s = dev.createRfcommSocketToServiceRecord(SPP);
                    s.connect();
                } catch (IOException first) {
                    closeQuiet(s);
                    try { // some GNSS receivers only answer on channel 1
                        s = (BluetoothSocket) dev.getClass().getMethod("createRfcommSocket", int.class).invoke(dev, 1);
                        s.connect();
                    } catch (Exception second) { closeQuiet(s); throw first; }
                }
                sock = s;
                synchronized (outLock) { btOut = s.getOutputStream(); }
                everConnected = true;
                fails = 0;
                act.keepAwake(true);
                bt("connected", null);
                readNmea(s.getInputStream());
            } catch (Exception e) {
                if (!btWanted) break;
                fails++;
                if (!everConnected && fails >= 2) {
                    btWanted = false;
                    closeBt();
                    act.keepAwake(false);
                    bt("error", "could not connect to " + (btName != null ? btName : btAddr) + ". Is the rover on, and FieldGenius disconnected from it?");
                    return;
                }
            } finally {
                closeBt();
            }
            if (!btWanted) break;
            bt("lost", null);
            sleep(Math.min(10000, 2000L * Math.max(1, fails)));
        }
    }

    private void readNmea(InputStream in) throws IOException {
        byte[] buf = new byte[4096];
        StringBuilder line = new StringBuilder(128);
        ArrayList<String> batch = new ArrayList<>();
        long lastFlush = System.currentTimeMillis();
        while (btWanted) {
            int n = in.read(buf);
            if (n < 0) throw new EOFException();
            for (int i = 0; i < n; i++) {
                int b = buf[i] & 0xff;
                if (b == '\n') {
                    if (line.length() > 6 && line.charAt(0) == '$') {
                        String l = line.toString();
                        String t = l.length() > 6 ? l.substring(3, 6) : "";
                        if (t.equals("GGA")) { lastGga = l; batch.add(l); }
                        else if (t.equals("GST") || t.equals("GSA")) batch.add(l);
                    }
                    line.setLength(0);
                } else if (b != '\r') {
                    if (b == '$') line.setLength(0); // resync on a new sentence
                    if (line.length() < 300 && b >= 32 && b < 127) line.append((char) b);
                }
            }
            long now = System.currentTimeMillis();
            if (!batch.isEmpty() && now - lastFlush >= 200) {
                JSONArray a = new JSONArray(batch);
                em.emit("nmea", "{\"lines\":" + a + "}");
                batch.clear();
                lastFlush = now;
            }
        }
    }

    private void writeToRover(byte[] b, int n) {
        synchronized (outLock) {
            if (btOut == null) return;
            try { btOut.write(b, 0, n); btOut.flush(); } catch (IOException e) { /* the read loop notices and reconnects */ }
        }
    }

    private void closeBt() {
        synchronized (outLock) { btOut = null; }
        closeQuiet(sock);
        sock = null;
    }

    private void bt(String state, String msg) {
        StringBuilder j = new StringBuilder("{\"state\":\"").append(state).append('"');
        if (btName != null) j.append(",\"name\":\"").append(esc(btName)).append('"');
        if (msg != null) j.append(",\"msg\":\"").append(esc(msg)).append('"');
        em.emit("bt", j.append('}').toString());
    }

    /* ---------------- NTRIP ---------------- */
    synchronized void ntripStart(JSONObject cfg) {
        ntripStop();
        ntCfg = cfg;
        ntWanted = true;
        ntThread = new Thread(this::ntLoop, "ntrip");
        ntThread.start();
    }

    synchronized void ntripStop() {
        boolean was = ntWanted;
        ntWanted = false;
        closeQuiet(ntSock);
        ntSock = null;
        if (ntThread != null) ntThread.interrupt();
        ntThread = null;
        if (was) nt("off", null, 0);
    }

    private void ntLoop() {
        long bytes = 0;
        while (ntWanted) {
            JSONObject c = ntCfg;
            String host = c.optString("host"), mount = c.optString("mount"), user = c.optString("user"), pass = c.optString("pass");
            int port = c.optInt("port", 2101);
            boolean gga = c.optBoolean("gga", true);
            long retry = 5000;
            Socket s = new Socket();
            try {
                nt("connecting", null, bytes);
                s.connect(new InetSocketAddress(host, port), 10000);
                s.setSoTimeout(5000);
                ntSock = s;
                OutputStream o = s.getOutputStream();
                InputStream in = new BufferedInputStream(s.getInputStream());
                StringBuilder req = new StringBuilder();
                req.append("GET /").append(mount).append(" HTTP/1.0\r\n")
                   .append("User-Agent: NTRIP CrewStudio/1.0\r\n")
                   .append("Accept: */*\r\n");
                if (!user.isEmpty()) {
                    String auth = Base64.encodeToString((user + ":" + pass).getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP);
                    req.append("Authorization: Basic ").append(auth).append("\r\n");
                }
                req.append("Connection: close\r\n\r\n");
                o.write(req.toString().getBytes(StandardCharsets.US_ASCII));
                o.flush();

                String status = readLine(in, 20000);
                if (status == null) throw new IOException("the caster closed the connection");
                String up = status.toUpperCase(Locale.US);
                if (up.contains("SOURCETABLE")) { retry = 30000; throw new IOException("mount point \"" + mount + "\" not found on this caster"); }
                if (up.contains(" 401")) { retry = 30000; throw new IOException("username or password refused"); }
                if (!(up.startsWith("ICY 200") || up.contains(" 200"))) throw new IOException(status.trim());
                boolean chunked = false;
                if (up.startsWith("HTTP")) {
                    for (String h; (h = readLine(in, 20000)) != null && !h.isEmpty(); )
                        if (h.toLowerCase(Locale.US).replace(" ", "").contains("transfer-encoding:chunked")) chunked = true;
                }
                InputStream data = chunked ? new Chunked(in) : in;
                nt("on", null, bytes);
                long lastGgaSent = 0, lastData = System.currentTimeMillis(), lastStatus = 0;
                byte[] buf = new byte[4096];
                while (ntWanted) {
                    long now = System.currentTimeMillis();
                    if (gga && lastGga != null && now - lastGgaSent >= 10000) {
                        o.write((lastGga + "\r\n").getBytes(StandardCharsets.US_ASCII));
                        o.flush();
                        lastGgaSent = now;
                    }
                    int n;
                    try { n = data.read(buf); } catch (SocketTimeoutException t) { n = 0; }
                    now = System.currentTimeMillis();
                    if (n < 0) throw new IOException("the caster ended the stream");
                    if (n > 0) { writeToRover(buf, n); bytes += n; lastData = now; }
                    else if (now - lastData > 30000) throw new IOException("no corrections for 30 s" + (gga && lastGga == null ? " (waiting for the rover's position)" : ""));
                    if (now - lastStatus >= 2000) { nt("on", null, bytes); lastStatus = now; }
                }
            } catch (Exception e) {
                if (!ntWanted) break;
                nt("error", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage(), bytes);
            } finally {
                closeQuiet(s);
            }
            if (ntWanted) sleep(retry);
        }
    }

    private void nt(String state, String msg, long bytes) {
        StringBuilder j = new StringBuilder("{\"state\":\"").append(state).append("\",\"bytes\":").append(bytes);
        if (msg != null) j.append(",\"msg\":\"").append(esc(msg)).append('"');
        em.emit("ntrip", j.append('}').toString());
    }

    /** One header line (ASCII, CR/LF stripped); null at end of stream. */
    private static String readLine(InputStream in, int max) throws IOException {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < max; i++) {
            int b = in.read();
            if (b < 0) return sb.length() == 0 ? null : sb.toString();
            if (b == '\n') return sb.toString();
            if (b != '\r') sb.append((char) b);
        }
        return sb.toString();
    }

    /** HTTP chunked transfer decoding (NTRIP 2 casters). */
    private static final class Chunked extends InputStream {
        private final InputStream in;
        private int left;
        Chunked(InputStream in) { this.in = in; }
        @Override public int read() throws IOException { byte[] b = new byte[1]; int n = read(b, 0, 1); return n <= 0 ? -1 : b[0] & 0xff; }
        @Override public int read(byte[] b, int off, int len) throws IOException {
            if (left == 0) {
                String size = readLine(in, 64);
                if (size == null) return -1;
                if (size.isEmpty()) size = readLine(in, 64); // CRLF after the previous chunk
                if (size == null) return -1;
                int semi = size.indexOf(';');
                left = Integer.parseInt((semi >= 0 ? size.substring(0, semi) : size).trim(), 16);
                if (left == 0) return -1;
            }
            int n = in.read(b, off, Math.min(len, left));
            if (n > 0) left -= n;
            return n;
        }
    }

    private static void closeQuiet(java.io.Closeable c) { if (c != null) try { c.close(); } catch (IOException e) { /* ignore */ } }
    private static void sleep(long ms) { try { Thread.sleep(ms); } catch (InterruptedException e) { Thread.currentThread().interrupt(); } }
    private static String esc(String s) { return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " "); }
}
