export {};

declare global {
  interface Window {
    mage2Runtime?: {
      quit(): void;
    };
  }
}
