package com.zombicraft.game;

import android.content.Intent;
import android.net.nsd.NsdManager;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.URI;
import java.util.Collections;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;

@CapacitorPlugin(name = "LocalMultiplayer")
public class LocalMultiplayerPlugin extends Plugin {
    private final Map<Integer, WebSocketClient> sockets = new ConcurrentHashMap<>();
    private LanRelay relay;
    private LanDiscovery discovery;

    @Override
    public void load() {
        discovery = new LanDiscovery(getContext().getSystemService(NsdManager.class));
    }

    @PluginMethod
    public void startLan(PluginCall call) {
        int port = call.getInt("port", 27015);
        JSArray addresses = new JSArray();
        try {
            for (NetworkInterface network : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!network.isUp() || network.isLoopback()) continue;
                for (InetAddress address : Collections.list(network.getInetAddresses())) {
                    if (address.isSiteLocalAddress()) addresses.put(address.getHostAddress());
                }
            }
        } catch (Exception error) {
            call.reject("Не удалось определить адрес устройства", error);
            return;
        }
        if (addresses.length() == 0) {
            call.reject("Подключитесь к Wi-Fi или включите точку доступа");
            return;
        }

        synchronized (this) {
            if (relay != null) {
                call.reject("Сетевой мир уже открыт");
                return;
            }
            relay = new LanRelay(port, () -> call.resolve(new JSObject().put("port", port).put("ips", addresses)),
                error -> {
                    synchronized (this) { relay = null; }
                    call.reject("Не удалось открыть порт " + port, error);
                });
            relay.start();
        }
    }

    @PluginMethod
    public void stopLan(PluginCall call) {
        stopRelay();
        call.resolve();
    }

    @PluginMethod
    public void advertise(PluginCall call) {
        discovery.advertise(call.getInt("port", 27015), call.getString("name", "Zombi Craft"));
        call.resolve();
    }

    @PluginMethod
    public void findWorlds(PluginCall call) {
        discovery.find(call);
    }

    private void stopRelay() {
        discovery.stopAdvertising();
        LanRelay current;
        synchronized (this) {
            current = relay;
            relay = null;
        }
        if (current == null) return;
        try {
            current.stop(500);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
        }
    }

    @PluginMethod
    public void connect(PluginCall call) {
        int id = call.getInt("id", -1);
        try {
            URI uri = URI.create(call.getString("url", ""));
            if (uri.getHost() == null || !("ws".equals(uri.getScheme()) || "wss".equals(uri.getScheme()))) {
                call.reject("Недопустимый адрес");
                return;
            }
            WebSocketClient socket = new WebSocketClient(uri, new org.java_websocket.drafts.Draft_6455(),
                    Collections.emptyMap(), 5000) {
                @Override
                public void onOpen(ServerHandshake handshake) { event(id, "open", ""); }
                @Override
                public void onMessage(String message) { event(id, "message", message); }
                @Override
                public void onClose(int code, String reason, boolean remote) {
                    sockets.remove(id, this);
                    event(id, "close", reason);
                }
                @Override
                public void onError(Exception error) { event(id, "error", ""); }
            };
            sockets.put(id, socket);
            socket.connect();
            call.resolve();
        } catch (RuntimeException error) {
            sockets.remove(id);
            call.reject("Не удалось начать подключение", error);
        }
    }

    private void event(int id, String type, String data) {
        notifyListeners("socket", new JSObject().put("id", id).put("type", type).put("data", data));
    }

    @PluginMethod
    public void send(PluginCall call) {
        WebSocketClient socket = sockets.get(call.getInt("id", -1));
        try {
            if (socket != null && socket.isOpen()) socket.send(call.getString("data", ""));
            call.resolve();
        } catch (RuntimeException error) {
            call.reject("Соединение закрыто", error);
        }
    }

    @PluginMethod
    public void close(PluginCall call) {
        WebSocketClient socket = sockets.remove(call.getInt("id", -1));
        if (socket != null) socket.close();
        call.resolve();
    }

    @PluginMethod
    public void shareAddress(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                Intent intent = new Intent(Intent.ACTION_SEND);
                intent.setType("text/plain");
                intent.putExtra(Intent.EXTRA_TEXT, call.getString("address", ""));
                getActivity().startActivity(Intent.createChooser(intent, "Адрес сетевого мира"));
                call.resolve();
            } catch (RuntimeException error) {
                call.reject("Не удалось поделиться адресом", error);
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        for (WebSocketClient socket : sockets.values()) socket.close();
        sockets.clear();
        discovery.stop();
        stopRelay();
    }
}
