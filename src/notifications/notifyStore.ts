import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Notification + auto-claim preferences.
 *
 * Kept in its own persisted store (`shade.notify`) so it is independent of the
 * identity vault and session log: these are device-level UX preferences, not
 * secrets. Nothing here is sensitive.
 *
 * Both features default OFF. Auto-claim in particular is a privacy trade-off
 * (see NotificationsSettings / AutoClaimHost), so it is strictly opt-in behind
 * an explicit warning and confirm.
 */

export interface AutoClaimSettings {
  enabled: boolean;
  /** Lower bound of the random claim delay, in minutes. */
  minMinutes: number;
  /** Upper bound of the random claim delay, in minutes. */
  maxMinutes: number;
}

export interface NotifyState {
  /** Fire a browser Notification when a new payment is detected. */
  notificationsEnabled: boolean;
  autoClaim: AutoClaimSettings;

  setNotificationsEnabled: (value: boolean) => void;
  setAutoClaimEnabled: (value: boolean) => void;
  setAutoClaimDelay: (patch: Partial<Pick<AutoClaimSettings, 'minMinutes' | 'maxMinutes'>>) => void;
}

export const DEFAULT_NOTIFY: Pick<NotifyState, 'notificationsEnabled' | 'autoClaim'> = {
  notificationsEnabled: false,
  autoClaim: { enabled: false, minMinutes: 10, maxMinutes: 120 },
};

export const useNotifyStore = create<NotifyState>()(
  persist(
    (set) => ({
      ...DEFAULT_NOTIFY,

      setNotificationsEnabled: (value) => set({ notificationsEnabled: value }),

      setAutoClaimEnabled: (value) =>
        set((state) => ({ autoClaim: { ...state.autoClaim, enabled: value } })),

      setAutoClaimDelay: (patch) =>
        set((state) => ({ autoClaim: { ...state.autoClaim, ...patch } })),
    }),
    {
      name: 'shade.notify',
      version: 1,
      // Merge persisted values over defaults so new keys always exist and a
      // partially-written record can never leave `autoClaim` undefined.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<NotifyState>;
        return {
          ...current,
          ...p,
          autoClaim: { ...DEFAULT_NOTIFY.autoClaim, ...(p.autoClaim ?? {}) },
        };
      },
    },
  ),
);
