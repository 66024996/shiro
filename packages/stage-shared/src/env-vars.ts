/**
 * Returns true if the provided environment variable represents a truthy value.
 *
 * Truthy values: `true`, `t`, `yes`, `y`, `on`, `1`
 */
export function isEnvTruthy(value: string | undefined | null): boolean {
  if (value == null)
    return false
  return /^(?:1|true|t|yes|y|on)$/i.test(value.trim())
}

export function isFluxPurchaseDisabled(): boolean {
  return isEnvTruthy(import.meta.env.VITE_DISABLE_FLUX_PURCHASE)
}

export function isCustomProvidersDisabled(): boolean {
  return isEnvTruthy(import.meta.env.VITE_DISABLE_CUSTOM_PROVIDERS)
}

/**
 * Returns true when the build has no AIRI cloud features: no AIRI sign-in and no official AIRI providers.
 * An app that runs only local and self-configured services sets `VITE_DISABLE_AIRI_CLOUD`.
 */
export function isAiriCloudDisabled(): boolean {
  return isEnvTruthy(import.meta.env.VITE_DISABLE_AIRI_CLOUD)
}
