package com.zombicraft.game;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle state) {
        registerPlugin(LocalMultiplayerPlugin.class);
        registerPlugin(VkAdsPlugin.class);
        super.onCreate(state);
    }
}
