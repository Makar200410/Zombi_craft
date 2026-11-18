package com.zombicraft.game;

import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Collections;
import java.util.List;
import java.util.HashSet;
import java.util.Set;

final class LanDiscovery {
    private static final String SERVICE = "_zombicraft._tcp.";
    private static final String TAG = "ZombiCraftLan";
    private final NsdManager manager;
    private final Handler main = new Handler(Looper.getMainLooper());
    private NsdManager.RegistrationListener advertisement;
    private Scan scan;

    LanDiscovery(NsdManager manager) {
        this.manager = manager;
    }

    void advertise(int port, String name) {
        main.post(() -> {
            if (manager == null) return;
            unadvertise();
            NsdServiceInfo service = new NsdServiceInfo();
            service.setServiceName("Zombi Craft");
            service.setServiceType(SERVICE);
            service.setPort(port);
            service.setAttribute("world", name);
            advertisement = new NsdManager.RegistrationListener() {
                @Override public void onRegistrationFailed(NsdServiceInfo info, int code) { Log.w(TAG, "Discovery registration failed: " + code); }
                @Override public void onUnregistrationFailed(NsdServiceInfo info, int code) {}
                @Override public void onServiceRegistered(NsdServiceInfo info) {}
                @Override public void onServiceUnregistered(NsdServiceInfo info) {}
            };
            try { manager.registerService(service, NsdManager.PROTOCOL_DNS_SD, advertisement); }
            catch (RuntimeException error) {
                advertisement = null;
                Log.w(TAG, "Cannot advertise LAN world", error);
            }
        });
    }

    void stopAdvertising() {
        main.post(this::unadvertise);
    }

    private void unadvertise() {
        if (advertisement == null) return;
        try { manager.unregisterService(advertisement); }
        catch (IllegalArgumentException ignored) { /* Already unregistered. */ }
        advertisement = null;
    }

    void find(PluginCall call) {
        main.post(() -> {
            if (manager == null || scan != null) {
                call.reject("Поиск миров сейчас недоступен");
                return;
            }
            scan = new Scan(call);
            try {
                manager.discoverServices(SERVICE, NsdManager.PROTOCOL_DNS_SD, scan);
                main.postDelayed(scan.end, 5000);
            } catch (RuntimeException error) {
                scan.finish("Не удалось начать поиск миров");
            }
        });
    }

    void stop() {
        main.post(() -> {
            unadvertise();
            if (scan != null) scan.finish("Поиск миров остановлен");
        });
    }

    private final class Scan implements NsdManager.DiscoveryListener {
        private final PluginCall call;
        private final Set<String> seenServices = new HashSet<>();
        private final Set<String> seenAddresses = new HashSet<>();
        private final ArrayDeque<NsdServiceInfo> queue = new ArrayDeque<>();
        private final JSArray worlds = new JSArray();
        private final Runnable end = () -> finish(null);
        private boolean resolving;

        Scan(PluginCall call) {
            this.call = call;
        }

        @Override public void onDiscoveryStarted(String type) {}
        @Override public void onDiscoveryStopped(String type) { main.post(() -> finish(null)); }
        @Override public void onStartDiscoveryFailed(String type, int code) { main.post(() -> finish("Не удалось найти миры по Wi-Fi")); }
        @Override public void onStopDiscoveryFailed(String type, int code) { Log.w(TAG, "Discovery stop failed: " + code); }
        @Override public void onServiceLost(NsdServiceInfo service) {}

        @Override
        public void onServiceFound(NsdServiceInfo service) {
            main.post(() -> {
                if (scan != this || seenServices.size() >= 32 || !seenServices.add(service.getServiceName())) return;
                queue.add(service);
                resolveNext();
            });
        }

        @SuppressWarnings("deprecation")
        private void resolveNext() {
            if (resolving || queue.isEmpty() || scan != this) return;
            resolving = true;
            try {
                manager.resolveService(queue.remove(), new NsdManager.ResolveListener() {
                    @Override public void onResolveFailed(NsdServiceInfo info, int code) { main.post(() -> resolved(null)); }
                    @Override public void onServiceResolved(NsdServiceInfo info) { main.post(() -> resolved(info)); }
                });
            } catch (RuntimeException error) {
                resolved(null);
            }
        }

        @SuppressWarnings("deprecation")
        private void resolved(NsdServiceInfo info) {
            if (scan != this) return;
            resolving = false;
            if (info != null) {
                List<InetAddress> hosts = Build.VERSION.SDK_INT >= 34
                    ? info.getHostAddresses() : Collections.singletonList(info.getHost());
                for (InetAddress host : hosts) {
                    if (!(host instanceof Inet4Address) || info.getPort() <= 0) continue;
                    String address = host.getHostAddress() + ":" + info.getPort();
                    if (seenAddresses.add(address)) {
                        byte[] label = info.getAttributes().get("world");
                        String name = label == null ? info.getServiceName() : new String(label, StandardCharsets.UTF_8);
                        worlds.put(new JSObject().put("address", address).put("name", name));
                    }
                }
            }
            resolveNext();
        }

        private void finish(String error) {
            if (scan != this) return;
            scan = null;
            main.removeCallbacks(end);
            try { manager.stopServiceDiscovery(this); }
            catch (IllegalArgumentException ignored) { /* Discovery already stopped. */ }
            if (error == null) call.resolve(new JSObject().put("worlds", worlds));
            else call.reject(error);
        }
    }
}
