/* eslint-disable react-refresh/only-export-components */
import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  InteractionStatus,
  type Configuration,
} from '@azure/msal-browser';
import { MsalProvider, useMsal } from '@azure/msal-react';
import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { apiRequest, setApiAuthHeaderProvider } from '@/shared/lib/api';
import {
  isFeatureEnabled,
  normalizeFeatureStateRecord,
  type FeatureStateRecord,
} from '@/shared/features/feature-registry';
import type { NavigationAccess } from '@/shared/navigation/navigation';

const DEV_ACCOUNT_STORAGE_KEY = 'elevatehr-dev-account-id';
const DEV_ACCOUNT_HEADER = 'x-dev-account-id';

interface SessionResponse {
  user: {
    oid: string;
    name: string;
    email: string;
    roles: string[];
    scopes: string[];
  } | null;
  account: {
    id: string;
    entraObjectId: string | null;
    email: string;
    displayName: string;
    status: string;
    employeeId: string | null;
    lastSignedInAt: string | null;
    queueMemberships: string[];
    employee: {
      id: string;
      employeeNumber: string;
      firstName: string;
      lastName: string;
      fullName: string;
      department: string;
      jobTitle: string;
      status: string;
    } | null;
  } | null;
  accountLinked: boolean;
  access: NavigationAccess;
  features: FeatureStateRecord;
  dev: {
    enabled: boolean;
    headerName: string;
    availableAccounts: Array<{
      id: string;
      email: string;
      displayName: string;
      employeeLabel: string | null;
    }>;
  };
}

export interface InboxSummary {
  openCount: number;
  overdueCount: number;
  approvalCount: number;
  dueTodayCount: number;
  urgentPreview: Array<{
    id: string;
    sourceType: string;
    taskType: string;
    title: string;
    dueDate: string | null;
    priority: string;
    status: string;
    assignee: {
      type: string;
      label: string;
      queueKey: string | null;
    };
    subjectEmployee: {
      id: string;
      employeeNumber: string;
      fullName: string;
      department: string;
      jobTitle: string;
    } | null;
    relatedEntityType: string | null;
    relatedEntityId: string | null;
    actionKind: string;
  }>;
}

interface AppSessionContextValue {
  authMode: 'dev' | 'entra';
  session: SessionResponse | null;
  inboxSummary: InboxSummary | null;
  loading: boolean;
  error: string | null;
  refreshSession: () => Promise<void>;
  refreshInboxSummary: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  selectedDevAccountId: string;
  setSelectedDevAccountId: (accountId: string) => void;
}

const emptyInboxSummary: InboxSummary = {
  openCount: 0,
  overdueCount: 0,
  approvalCount: 0,
  dueTodayCount: 0,
  urgentPreview: [],
};

const AppSessionContext = createContext<AppSessionContextValue | null>(null);

const entraClientId = import.meta.env.VITE_ENTRA_CLIENT_ID ?? '';
const entraTenantId = import.meta.env.VITE_ENTRA_TENANT_ID ?? '';
const apiScope = import.meta.env.VITE_API_SCOPE ?? '';
const authMode = (import.meta.env.VITE_AUTH_MODE ?? (entraClientId && entraTenantId ? 'entra' : 'dev')) as 'dev' | 'entra';
const entraEnabled = authMode === 'entra' && Boolean(entraClientId && entraTenantId && apiScope);
const redirectUri = import.meta.env.VITE_ENTRA_REDIRECT_URI ?? window.location.origin;
const authority = import.meta.env.VITE_ENTRA_AUTHORITY ?? `https://login.microsoftonline.com/${entraTenantId}`;

const msalConfiguration: Configuration = {
  auth: {
    clientId: entraClientId,
    authority,
    redirectUri,
  },
  cache: {
    cacheLocation: 'localStorage',
  },
};

const msalInstance = entraEnabled ? new PublicClientApplication(msalConfiguration) : null;

function getFallbackAccess(session: Pick<SessionResponse, 'user' | 'account'>): NavigationAccess {
  const roles = session.user?.roles ?? [];
  const isHrAdmin = roles.includes('Admin') || roles.includes('HR.Manager');
  const hasRecruitmentRole = roles.includes('Finance') || roles.includes('HR.BusinessPartner');

  return {
    isStaff: Boolean(session.user),
    isManager: false,
    isHrAdmin,
    visibleRoutes: [
      ...new Set([
        '/inbox',
        '/time-off',
        '/time-attendance',
        ...(session.account?.employeeId ? ['/my-profile'] : []),
        '/my-performance',
        '/my-learning',
        ...(isHrAdmin || hasRecruitmentRole ? ['/recruitment'] : []),
        ...(isHrAdmin ? ['/', '/performance', '/learning', '/workforce-time', '/employees', '/organization', '/reports', '/settings'] : []),
      ]),
    ],
  };
}

function normalizeAccess(
  access: NavigationAccess | null | undefined,
  session: Pick<SessionResponse, 'user' | 'account'>,
  features: FeatureStateRecord,
): NavigationAccess {
  const fallbackAccess = getFallbackAccess(session);
  const isManager = access?.isManager ?? false;
  const isHrAdmin = access?.isHrAdmin ?? fallbackAccess.isHrAdmin;
  const hasRecruitmentRole = (session.user?.roles ?? []).some((role) => role === 'Finance' || role === 'HR.BusinessPartner');
  const mergedVisibleRoutes = [
      ...new Set([
        ...fallbackAccess.visibleRoutes,
        ...(session.account?.employeeId ? ['/my-profile'] : []),
        ...(isManager ? ['/performance', '/learning', '/workforce-time', '/recruitment'] : []),
      ...(isHrAdmin ? ['/', '/performance', '/learning', '/workforce-time', '/recruitment', '/employees', '/organization', '/reports', '/settings'] : []),
      ...(hasRecruitmentRole ? ['/recruitment'] : []),
      ...(access?.visibleRoutes ?? []),
    ]),
  ];

  const featureAwareRoutes = mergedVisibleRoutes.filter((route) => {
    if (route === '/learning') {
      return isFeatureEnabled(features, 'learning_management');
    }

    if (route === '/my-learning') {
      return isFeatureEnabled(features, 'learning_self_service');
    }

    if (route === '/time-attendance') {
      return isFeatureEnabled(features, 'time_attendance_self_service');
    }

    if (route === '/workforce-time') {
      return isFeatureEnabled(features, 'time_attendance_management');
    }

    if (route === '/performance') {
      return isFeatureEnabled(features, 'planning_management');
    }

    if (route === '/recruitment') {
      return isFeatureEnabled(features, 'recruitment_management');
    }

    if (route === '/my-performance') {
      return isFeatureEnabled(features, 'planning_self_service');
    }

    return true;
  });

  if (!access) {
    return {
      ...fallbackAccess,
      visibleRoutes: featureAwareRoutes,
    };
  }

  return {
    isStaff: access.isStaff ?? fallbackAccess.isStaff,
    isManager,
    isHrAdmin,
    visibleRoutes: featureAwareRoutes,
  };
}

function normalizeSessionPayload(
  session: Omit<SessionResponse, 'access' | 'features'> & {
    access?: NavigationAccess | null;
    features?: Partial<FeatureStateRecord> | null;
  },
): SessionResponse {
  const features = normalizeFeatureStateRecord(session.features);

  return {
    ...session,
    access: normalizeAccess(session.access, session, features),
    features,
  };
}

async function loadSessionPayload() {
  const response = await apiRequest<{
    success: true;
    data: Omit<SessionResponse, 'access' | 'features'> & {
      access?: NavigationAccess | null;
      features?: Partial<FeatureStateRecord> | null;
    };
  }>('/api/session/me', {}, 'Unable to load session.');
  return normalizeSessionPayload(response.data);
}

async function loadInboxSummaryPayload() {
  const response = await apiRequest<{ success: true; data: InboxSummary }>('/api/inbox/summary', {}, 'Unable to load inbox summary.');
  return response.data;
}

function LoadingShell({ message }: { message: string }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--color-background)' }}>
      <div className="card" style={{ width: 'min(480px, calc(100vw - 2rem))' }}>
        <h2 className="card-title">Elevate HR</h2>
        <p className="card-subtitle">{message}</p>
      </div>
    </div>
  );
}

function AppSessionStateProvider({
  children,
  authModeValue,
  getHeaders,
  signIn,
  signOut,
}: {
  children: ReactNode;
  authModeValue: 'dev' | 'entra';
  getHeaders: () => Promise<Record<string, string>>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}) {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [inboxSummary, setInboxSummary] = useState<InboxSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDevAccountId, setSelectedDevAccountIdState] = useState(() => {
    if (typeof window === 'undefined') {
      return '';
    }

    return window.localStorage.getItem(DEV_ACCOUNT_STORAGE_KEY) ?? '';
  });
  const inboxLoadRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    setApiAuthHeaderProvider(getHeaders);
    return () => {
      setApiAuthHeaderProvider(null);
    };
  }, [getHeaders]);

  const refreshInboxSummary = useCallback(async () => {
    if (inboxLoadRef.current) {
      return inboxLoadRef.current;
    }

    const nextLoad = (async () => {
      try {
        const nextInboxSummary = await loadInboxSummaryPayload();
        setInboxSummary(nextInboxSummary);
      } catch (loadError) {
        setInboxSummary(emptyInboxSummary);
        throw loadError;
      } finally {
        inboxLoadRef.current = null;
      }
    })();

    inboxLoadRef.current = nextLoad;
    return nextLoad;
  }, []);

  const refreshSession = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextSession = await loadSessionPayload();
      setSession(nextSession);
      await refreshInboxSummary();
    } catch (loadError) {
      setSession(null);
      setInboxSummary(emptyInboxSummary);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load your session.');
    } finally {
      setLoading(false);
    }
  }, [refreshInboxSummary]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession, selectedDevAccountId]);

  const setSelectedDevAccountId = (accountId: string) => {
    setSelectedDevAccountIdState(accountId);

    if (typeof window !== 'undefined') {
      if (accountId) {
        window.localStorage.setItem(DEV_ACCOUNT_STORAGE_KEY, accountId);
      } else {
        window.localStorage.removeItem(DEV_ACCOUNT_STORAGE_KEY);
      }
    }
  };

  const contextValue: AppSessionContextValue = {
    authMode: authModeValue,
    session,
    inboxSummary,
    loading,
    error,
    refreshSession,
    refreshInboxSummary,
    signIn,
    signOut,
    selectedDevAccountId,
    setSelectedDevAccountId,
  };

  return (
    <AppSessionContext.Provider value={contextValue}>
      {children}
    </AppSessionContext.Provider>
  );
}

function DevSessionProvider({ children }: { children: ReactNode }) {
  return (
    <AppSessionStateProvider
      authModeValue="dev"
      getHeaders={async () => {
        if (typeof window === 'undefined') {
          return {} as Record<string, string>;
        }

        const selectedDevAccountId = window.localStorage.getItem(DEV_ACCOUNT_STORAGE_KEY) ?? '';
        return selectedDevAccountId
          ? { [DEV_ACCOUNT_HEADER]: selectedDevAccountId }
          : {} as Record<string, string>;
      }}
      signIn={async () => {}}
      signOut={async () => {}}
    >
      {children}
    </AppSessionStateProvider>
  );
}

function EntraSessionBridge({ children }: { children: ReactNode }) {
  const { instance, accounts, inProgress } = useMsal();
  const activeAccount = instance.getActiveAccount() ?? accounts[0] ?? null;

  useEffect(() => {
    if (activeAccount && instance.getActiveAccount()?.homeAccountId !== activeAccount.homeAccountId) {
      instance.setActiveAccount(activeAccount);
    }
  }, [activeAccount, instance]);

  useEffect(() => {
    if (inProgress !== InteractionStatus.None || activeAccount) {
      return;
    }

    void instance.loginRedirect({
      scopes: [apiScope],
    });
  }, [activeAccount, inProgress, instance]);

  const getHeaders = useMemo(() => {
    return async () => {
      const account = instance.getActiveAccount() ?? accounts[0];

      if (!account) {
        return {};
      }

      try {
        const result = await instance.acquireTokenSilent({
          account,
          scopes: [apiScope],
        });

        return {
          Authorization: `Bearer ${result.accessToken}`,
        };
      } catch (error) {
        if (error instanceof InteractionRequiredAuthError) {
          await instance.loginRedirect({
            scopes: [apiScope],
          });
          return {} as Record<string, string>;
        }

        throw error;
      }
    };
  }, [accounts, instance]);

  if (!activeAccount) {
    return <LoadingShell message="Redirecting to Microsoft Entra ID..." />;
  }

  return (
    <AppSessionStateProvider
      authModeValue="entra"
      getHeaders={getHeaders}
      signIn={async () => {
        await instance.loginRedirect({ scopes: [apiScope] });
      }}
      signOut={async () => {
        const account = instance.getActiveAccount() ?? accounts[0] ?? undefined;
        await instance.logoutRedirect({
          account: account ?? undefined,
          postLogoutRedirectUri: window.location.origin,
        });
      }}
    >
      {children}
    </AppSessionStateProvider>
  );
}

function EntraSessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!msalInstance) {
      return;
    }

    void (async () => {
      try {
        await msalInstance.initialize();
        await msalInstance.handleRedirectPromise();
        const existingAccount = msalInstance.getAllAccounts()[0] ?? null;

        if (existingAccount) {
          msalInstance.setActiveAccount(existingAccount);
        }

        setReady(true);
      } catch (initializationError) {
        setError(initializationError instanceof Error ? initializationError.message : 'Unable to initialize Microsoft Entra ID.');
      }
    })();
  }, []);

  if (!msalInstance) {
    return <DevSessionProvider>{children}</DevSessionProvider>;
  }

  if (error) {
    return <LoadingShell message={error} />;
  }

  if (!ready) {
    return <LoadingShell message="Initializing Microsoft Entra ID..." />;
  }

  return (
    <MsalProvider instance={msalInstance}>
      <EntraSessionBridge>{children}</EntraSessionBridge>
    </MsalProvider>
  );
}

export function AppSessionProvider({ children }: { children: ReactNode }) {
  if (entraEnabled) {
    return <EntraSessionProvider>{children}</EntraSessionProvider>;
  }

  return <DevSessionProvider>{children}</DevSessionProvider>;
}

export function useAppSession() {
  const context = useContext(AppSessionContext);

  if (!context) {
    throw new Error('useAppSession must be used inside AppSessionProvider.');
  }

  return context;
}
