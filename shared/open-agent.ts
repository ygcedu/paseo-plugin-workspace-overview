import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";

/**
 * Contract shared by the client surface (`useRpc`) and the server handler
 * (`plugin.handle`). Opens an agent session in the Paseo desktop app.
 *
 * Why an RPC instead of `Linking.openURL`: the plugin UI runs inside the app's
 * own webview, where `paseo://` deep links get swallowed by expo-router and
 * render as "Unmatched Route". The supported delivery path is via the OS
 * (Electron `open-url`), which is what the `paseo agent open` CLI uses. This
 * RPC runs in the daemon-side plugin process (full Node), so it can shell out.
 */
export const openAgentRpc = defineRpc({
  name: "open_agent",
  input: z.object({
    agentId: z.string().min(1),
    serverId: z.string().min(1),
  }),
  output: z.object({
    ok: z.boolean(),
    error: z.string().optional(),
  }),
});
