import { useEffect, useState } from "react";
import { Keyboard, Platform, type KeyboardEvent } from "react-native";

function currentKeyboardHeight(): number {
  if (Platform.OS === "web") return 0;
  return Math.max(0, Keyboard.metrics()?.height ?? 0);
}

/**
 * Returns the native keyboard height, including a keyboard that was already
 * opened by an auto-focused input before the effect subscribed.
 */
export function useKeyboardInset(enabled: boolean): number {
  const [height, setHeight] = useState(() => enabled ? currentKeyboardHeight() : 0);

  useEffect(() => {
    if (!enabled || Platform.OS === "web") {
      setHeight(0);
      return;
    }

    const showEvent = Platform.OS === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const update = (event: KeyboardEvent) => setHeight(Math.max(0, event.endCoordinates.height));
    const showSubscription = Keyboard.addListener(showEvent, update);
    const hideSubscription = Keyboard.addListener(hideEvent, () => setHeight(0));

    // autoFocus can open the keyboard before useEffect has attached listeners.
    setHeight(currentKeyboardHeight());
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [enabled]);

  return height;
}
