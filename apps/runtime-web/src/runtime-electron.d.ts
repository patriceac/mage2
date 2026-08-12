export {};

declare global {
  interface Mage2RuntimeStartupMetrics {
    version: number;
    projectName: string;
    processStartedAt: number;
    windowCreatedAt: number | null;
    startupDocumentLoadedAt: number | null;
    windowShownAt: number | null;
    windowShownMonotonicNs: string | null;
    playerNavigationStartedAt: number | null;
    playerLoadedAt: number | null;
    playerLoadedMonotonicNs: string | null;
    initialSurfaceReadyAt: number | null;
    initialSurfaceReadyMonotonicNs: string | null;
  }

  interface Window {
    mage2Runtime?: {
      quit(): void;
      getStartupMetrics(): Promise<Mage2RuntimeStartupMetrics | null>;
      reportInitialSurfaceReady(): void;
    };
  }
}
