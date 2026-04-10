import AsyncStorage from "@react-native-async-storage/async-storage";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import {
  PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Alert } from "react-native";
import { AppModuleKey } from "./types";
import { decodeJwtPayload } from "./utils";

type StoredSession = {
  idToken: string;
  accessToken?: string;
  name?: string;
  upn: string;
  email?: string;
};

type AuthContextValue = {
  initializing: boolean;
  accessLoading: boolean;
  accessError: string | null;
  session: StoredSession | null;
  moduleAccess: Partial<Record<AppModuleKey, boolean>>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
  reloadAccess: () => Promise<void>;
};

type AccessResponse = {
  access: Partial<Record<AppModuleKey, boolean>>;
};

const storageKey = "pitstop-mobile-session";
const AuthContext = createContext<AuthContextValue | null>(null);
const tenantId = process.env.EXPO_PUBLIC_AZURE_AD_TENANT_ID;
const clientId = process.env.EXPO_PUBLIC_AZURE_AD_CLIENT_ID;
const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

function requireConfig(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`Missing ${name} in mobile environment configuration`);
  }
  return value;
}

function buildDiscovery() {
  const resolvedTenantId = requireConfig(tenantId, "EXPO_PUBLIC_AZURE_AD_TENANT_ID");
  return {
    authorizationEndpoint: `https://login.microsoftonline.com/${resolvedTenantId}/oauth2/v2.0/authorize`,
    tokenEndpoint: `https://login.microsoftonline.com/${resolvedTenantId}/oauth2/v2.0/token`,
  };
}

function parseSession(idToken: string, accessToken?: string): StoredSession | null {
  const payload = decodeJwtPayload<{
    preferred_username?: string;
    upn?: string;
    email?: string;
    name?: string;
  }>(idToken);

  const upn = payload?.preferred_username || payload?.upn || payload?.email;
  if (!upn) return null;

  return {
    idToken,
    accessToken,
    upn,
    name: payload?.name,
    email: payload?.email,
  };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [initializing, setInitializing] = useState(true);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [moduleAccess, setModuleAccess] = useState<Partial<Record<AppModuleKey, boolean>>>({});

  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const stored = await AsyncStorage.getItem(storageKey);
        if (!stored) return;
        const parsed = JSON.parse(stored) as StoredSession;
        setSession(parsed);
      } catch {
        await AsyncStorage.removeItem(storageKey);
      } finally {
        setInitializing(false);
      }
    };

    void load();
  }, []);

  const apiFetch = async (path: string, init?: RequestInit) => {
    const base = requireConfig(apiBaseUrl, "EXPO_PUBLIC_API_BASE_URL");
    return fetch(`${base}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(session?.idToken ? { Authorization: `Bearer ${session.idToken}` } : {}),
        ...(init?.headers || {}),
      },
    });
  };

  const reloadAccess = async () => {
    if (!session) {
      setAccessLoading(false);
      setAccessError(null);
      setModuleAccess({});
      return;
    }

    setAccessLoading(true);
    setAccessError(null);
    try {
      const response = await apiFetch("/api/access/me");
      if (!response.ok) {
        if (response.status === 403) {
          setModuleAccess({});
          return;
        }
        throw new Error((await response.text()) || "Failed to load module access");
      }

      const json = (await response.json()) as AccessResponse;
      setModuleAccess(json.access ?? {});
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : "Unknown error");
      throw error;
    } finally {
      setAccessLoading(false);
    }
  };

  useEffect(() => {
    if (!session) {
      setAccessLoading(false);
      setAccessError(null);
      setModuleAccess({});
      return;
    }

    void reloadAccess().catch((error) => {
      console.error(error);
      Alert.alert(
        "Access load failed",
        error instanceof Error ? error.message : "Unknown error",
      );
    });
  }, [session]);

  const signIn = async () => {
    try {
      const redirectUri = AuthSession.makeRedirectUri({ scheme: "pitstopmobile" });
      const discovery = buildDiscovery();
      const resolvedClientId = requireConfig(clientId, "EXPO_PUBLIC_AZURE_AD_CLIENT_ID");
      const request = new AuthSession.AuthRequest({
        clientId: resolvedClientId,
        scopes: ["openid", "profile", "email", "User.Read"],
        responseType: AuthSession.ResponseType.Code,
        redirectUri,
        usePKCE: true,
        prompt: AuthSession.Prompt.SelectAccount,
      });

      await request.makeAuthUrlAsync(discovery);
      const result = await request.promptAsync(discovery);
      if (result.type !== "success" || !result.params.code) {
        return;
      }

      const tokenResponse = await AuthSession.exchangeCodeAsync(
        {
          clientId: resolvedClientId,
          code: result.params.code,
          redirectUri,
          extraParams: {
            code_verifier: request.codeVerifier || "",
          },
        },
        discovery,
      );

      if (!tokenResponse.idToken) {
        throw new Error("Azure AD did not return an ID token");
      }

      const nextSession = parseSession(tokenResponse.idToken, tokenResponse.accessToken);
      if (!nextSession) {
        throw new Error("Could not read the signed-in user from the Azure AD token");
      }

      setSession(nextSession);
      await AsyncStorage.setItem(storageKey, JSON.stringify(nextSession));
    } catch (error) {
      console.error(error);
      Alert.alert("Sign-in failed", error instanceof Error ? error.message : "Unknown error");
    }
  };

  const signOut = async () => {
    setSession(null);
    setAccessLoading(false);
    setAccessError(null);
    setModuleAccess({});
    await AsyncStorage.removeItem(storageKey);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      initializing,
      accessLoading,
      accessError,
      session,
      moduleAccess,
      signIn,
      signOut,
      apiFetch,
      reloadAccess,
    }),
    [accessError, accessLoading, initializing, moduleAccess, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
