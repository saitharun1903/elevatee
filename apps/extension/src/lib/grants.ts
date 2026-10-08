/**
 * Tabs the user has granted access to by clicking the toolbar icon (activeTab).
 * Kept in chrome.storage.session: cleared when the browser closes, never synced, never on disk.
 * We store only the tab id, the time and whether the page type is scriptable — not the URL.
 */
import type { KeyValueStorage } from "./session";
import { classifyUrl, type PageAccess } from "./capture";

export const GRANTS_KEY = "elevate.grants";

export interface Grant {
  at: number;
  access: PageAccess;
}

type GrantMap = Record<string, Grant>;

export class GrantStore {
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly storage: KeyValueStorage, private readonly now: () => number = () => Date.now()) {}

  private async read(): Promise<GrantMap> {
    const v = (await this.storage.get(GRANTS_KEY))[GRANTS_KEY];
    return v && typeof v === "object" ? (v as GrantMap) : {};
  }

  /** Serialize read-modify-write cycles so concurrent updates never lose a grant. */
  private update(fn: (m: GrantMap) => void): Promise<void> {
    const next = this.chain.then(async () => {
      const m = await this.read();
      fn(m);
      await this.storage.set({ [GRANTS_KEY]: m });
    });
    this.chain = next.catch(() => {});
    return next;
  }

  grant(tabId: number, tabUrl: string | undefined): Promise<void> {
    // Without a URL (should not happen with activeTab) let executeScript decide.
    const access: PageAccess = tabUrl ? classifyUrl(tabUrl) : { readable: true };
    return this.update((m) => {
      m[String(tabId)] = { at: this.now(), access };
    });
  }

  revoke(tabId: number): Promise<void> {
    return this.update((m) => {
      delete m[String(tabId)];
    });
  }

  async get(tabId: number): Promise<Grant | null> {
    await this.chain;
    return (await this.read())[String(tabId)] ?? null;
  }
}
