import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "./auth";
import { AppNavigator } from "./navigation";

export default function AppRoot() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <AppNavigator />
    </AuthProvider>
  );
}
