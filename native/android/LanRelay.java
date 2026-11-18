package com.zombicraft.game;

import java.net.InetSocketAddress;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import org.java_websocket.WebSocket;
import org.java_websocket.drafts.Draft_6455;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;
import org.json.JSONObject;

final class LanRelay extends WebSocketServer {
    private static final int MAX_CLIENTS = 8;
    private static final int MAX_FRAME_BYTES = 16 * 1024 * 1024;
    private final Map<WebSocket, Integer> clients = new HashMap<>();
    private final Runnable started;
    private final java.util.function.Consumer<Exception> failed;
    private WebSocket host;
    private int nextId = 1;

    LanRelay(int port, Runnable started, java.util.function.Consumer<Exception> failed) {
        super(new InetSocketAddress("0.0.0.0", port), 1, Collections.singletonList(
            new Draft_6455(Collections.emptyList(), Collections.singletonList(
                new org.java_websocket.protocols.Protocol("")), MAX_FRAME_BYTES)));
        this.started = started;
        this.failed = failed;
        setReuseAddr(true);
    }

    @Override
    public void onStart() {
        started.run();
    }

    @Override
    public void onError(WebSocket socket, Exception error) {
        if (socket == null) failed.accept(error);
    }

    @Override
    public synchronized void onOpen(WebSocket socket, ClientHandshake handshake) {
        String route = handshake.getResourceDescriptor();
        if ("/zc?role=host".equals(route) && host == null
                && socket.getRemoteSocketAddress().getAddress().isLoopbackAddress()) {
            host = socket;
        } else if (!"/zc?role=client".equals(route)) {
            socket.close(1008, "Unsupported connection");
        } else if (host == null) {
            socket.send("{\"t\":\"nohost\"}");
            socket.close();
        } else if (clients.size() >= MAX_CLIENTS) {
            socket.send("{\"t\":\"full\"}");
            socket.close();
        } else {
            int id = nextId++;
            clients.put(socket, id);
            host.send("{\"sys\":\"join\",\"id\":" + id + "}");
        }
    }

    @Override
    public synchronized void onClose(WebSocket socket, int code, String reason, boolean remote) {
        if (socket == host) {
            host = null;
            for (WebSocket client : clients.keySet()) client.close();
            clients.clear();
        } else {
            Integer id = clients.remove(socket);
            if (id != null && host != null) host.send("{\"sys\":\"leave\",\"id\":" + id + "}");
        }
    }

    @Override
    public synchronized void onMessage(WebSocket socket, String text) {
        try {
            if (socket == host) {
                JSONObject envelope = new JSONObject(text);
                Object destination = envelope.opt("to");
                Object data = envelope.opt("d");
                int kick = envelope.optInt("kick", -1);
                for (Map.Entry<WebSocket, Integer> client : clients.entrySet()) {
                    int id = client.getValue();
                    if (data instanceof String && ("*".equals(destination) || Integer.valueOf(id).equals(destination))) {
                        if (client.getKey().isOpen()) client.getKey().send((String) data);
                    }
                    if (kick == id) client.getKey().close();
                }
            } else {
                Integer id = clients.get(socket);
                if (id != null && host != null && host.isOpen()) {
                    host.send(new JSONObject().put("from", id).put("d", text).toString());
                }
            }
        } catch (org.json.JSONException ignored) {
            // Ignore malformed relay envelopes.
        }
    }
}
