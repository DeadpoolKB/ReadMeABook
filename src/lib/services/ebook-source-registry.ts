/**
 * Component: Ebook Source Provider Contract
 * Documentation: documentation/integrations/ebook-sidecar.md
 */

export const EBOOK_SOURCE_IDS = {
  ANNAS_ARCHIVE: 'annas_archive',
  PROWLARR: 'prowlarr',
} as const;

export const EBOOK_SOURCE_SECRET_MASK = '••••••••••••';

export type EbookSourceId = string;
export type EbookSourceDownloadStrategy = 'direct' | 'indexer';
export type EbookSourceSettingValue = string | boolean;

export type EbookSourceSettingField =
  | {
      key: string;
      label: string;
      type: 'text' | 'url' | 'password';
      secret?: boolean;
    }
  | {
      key: string;
      label: string;
      type: 'boolean';
    }
  | {
      key: string;
      label: string;
      type: 'select';
      options: Array<{ label: string; value: string }>;
    };

export interface EbookSourceConfiguration {
  id: string;
  name: string;
  mirrorUrls: string[];
  preferredMirror: string;
  settings: Record<string, EbookSourceSettingValue>;
}

export interface EbookSourceSearchContext {
  title: string;
  author: string;
  asin?: string;
  preferredFormat: string;
  settings: Record<string, EbookSourceSettingValue>;
  mirrors: string[];
  preferredMirror: string;
}

export interface EbookSourceSearchResult {
  source: EbookSourceId;
  id: string;
  title: string;
  author?: string;
  format?: string;
  downloadUrl: string;
  metadata: Record<string, unknown>;
}

export interface EbookSourceProvider {
  id: EbookSourceId;
  name: string;
  downloadStrategy: EbookSourceDownloadStrategy;
  settingsFields: EbookSourceSettingField[];
  supportsMirrors: boolean;
  searchAutomatic(context: EbookSourceSearchContext): Promise<EbookSourceSearchResult | null>;
  searchInteractive(context: EbookSourceSearchContext): Promise<EbookSourceSearchResult[]>;
  startDownload(result: EbookSourceSearchResult, requestId: string): Promise<void>;
}

export interface EbookSourceDefinition {
  id: EbookSourceId;
  name: string;
  downloadStrategy: EbookSourceDownloadStrategy;
  settingsFields: EbookSourceSettingField[];
  supportsMirrors: boolean;
}

export const EBOOK_SOURCE_DEFINITIONS: readonly EbookSourceDefinition[] = [
  {
    id: EBOOK_SOURCE_IDS.ANNAS_ARCHIVE,
    name: "Anna's Archive",
    downloadStrategy: 'direct',
    settingsFields: [],
    supportsMirrors: true,
  },
  {
    id: EBOOK_SOURCE_IDS.PROWLARR,
    name: 'Indexer Search',
    downloadStrategy: 'indexer',
    settingsFields: [],
    supportsMirrors: false,
  },
];

export function getEbookSourceDefinition(sourceId: string): EbookSourceDefinition | undefined {
  return EBOOK_SOURCE_DEFINITIONS.find((source) => source.id === sourceId);
}

function isSecretField(field: EbookSourceSettingField): boolean {
  return field.type === 'password' || ('secret' in field && field.secret === true);
}

export function maskEbookSourceConfigurationSecrets(
  configs: EbookSourceConfiguration[]
): EbookSourceConfiguration[] {
  return configs.map((config) => {
    const definition = getEbookSourceDefinition(config.id);
    if (!definition) return config;

    const settings = { ...config.settings };
    for (const field of definition.settingsFields) {
      if (isSecretField(field) && settings[field.key]) {
        settings[field.key] = EBOOK_SOURCE_SECRET_MASK;
      }
    }
    return { ...config, settings };
  });
}

export function preserveEbookSourceSecrets(
  incoming: EbookSourceConfiguration[],
  previous: EbookSourceConfiguration[]
): EbookSourceConfiguration[] {
  const previousById = new Map(previous.map((config) => [config.id, config]));
  return incoming.map((config) => {
    const definition = getEbookSourceDefinition(config.id);
    const previousConfig = previousById.get(config.id);
    if (!definition || !previousConfig) return config;

    const settings = { ...config.settings };
    for (const field of definition.settingsFields) {
      if (
        isSecretField(field) &&
        settings[field.key] === EBOOK_SOURCE_SECRET_MASK &&
        previousConfig.settings[field.key]
      ) {
        settings[field.key] = previousConfig.settings[field.key];
      }
    }
    return { ...config, settings };
  });
}

export function validateEbookSourceConfigurations(
  configs: unknown
): { valid: true; configs: EbookSourceConfiguration[] } | { valid: false; error: string } {
  if (!Array.isArray(configs)) {
    return { valid: false, error: 'Additional ebook sources must be an array' };
  }

  const ids = new Set<string>();
  const normalized: EbookSourceConfiguration[] = [];

  for (const config of configs) {
    if (!config || typeof config !== 'object') {
      return { valid: false, error: 'Each additional ebook source must be an object' };
    }

    const candidate = config as Partial<EbookSourceConfiguration>;
    if (typeof candidate.id !== 'string' || !/^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/.test(candidate.id)) {
      return { valid: false, error: 'Source IDs must use lowercase letters, numbers, underscores, or hyphens' };
    }
    if (Object.values(EBOOK_SOURCE_IDS).includes(candidate.id as typeof EBOOK_SOURCE_IDS[keyof typeof EBOOK_SOURCE_IDS])) {
      return { valid: false, error: `Source ID "${candidate.id}" is reserved for a built-in source` };
    }
    if (ids.has(candidate.id)) {
      return { valid: false, error: `Duplicate ebook source ID "${candidate.id}"` };
    }
    ids.add(candidate.id);

    if (typeof candidate.name !== 'string' || !candidate.name.trim()) {
      return { valid: false, error: `Source "${candidate.id}" must have a name` };
    }
    if (!Array.isArray(candidate.mirrorUrls) || !candidate.mirrorUrls.every((url) => typeof url === 'string')) {
      return { valid: false, error: `Source "${candidate.id}" mirror URLs must be a list of strings` };
    }

    const mirrorUrls = candidate.mirrorUrls.map((url) => url.trim()).filter(Boolean);
    const uniqueMirrorUrls = [...new Set(mirrorUrls)];
    for (const mirror of uniqueMirrorUrls) {
      let parsed: URL;
      try {
        parsed = new URL(mirror);
      } catch {
        return { valid: false, error: `Invalid mirror URL for "${candidate.id}": ${mirror}` };
      }
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
        return { valid: false, error: `Mirror URLs for "${candidate.id}" must be HTTP(S) URLs without embedded credentials` };
      }
    }

    if (typeof candidate.preferredMirror !== 'string') {
      return { valid: false, error: `Source "${candidate.id}" must specify a preferred mirror` };
    }
    const preferredMirror = candidate.preferredMirror.trim();
    if (uniqueMirrorUrls.length > 0 && !preferredMirror) {
      return { valid: false, error: `Source "${candidate.id}" must choose a preferred mirror` };
    }
    if (preferredMirror && !uniqueMirrorUrls.includes(preferredMirror)) {
      return { valid: false, error: `Preferred mirror for "${candidate.id}" must be in its mirror list` };
    }

    if (
      !candidate.settings ||
      typeof candidate.settings !== 'object' ||
      Array.isArray(candidate.settings) ||
      !Object.values(candidate.settings).every((value) => typeof value === 'string' || typeof value === 'boolean')
    ) {
      return { valid: false, error: `Source "${candidate.id}" settings must be an object` };
    }

    const definition = getEbookSourceDefinition(candidate.id);
    const settingFields = definition?.settingsFields ?? [];
    for (const [key, value] of Object.entries(candidate.settings)) {
      const field = settingFields.find((settingField) => settingField.key === key);
      if (!field) {
        return { valid: false, error: `Setting "${key}" is not registered for ebook source "${candidate.id}"` };
      }
      if (field.type === 'boolean' ? typeof value !== 'boolean' : typeof value !== 'string') {
        return { valid: false, error: `Setting "${key}" has an invalid value for ebook source "${candidate.id}"` };
      }
      if (
        field.type === 'select' &&
        typeof value === 'string' &&
        !field.options.some((option) => option.value === value)
      ) {
        return { valid: false, error: `Setting "${key}" is not an allowed option for ebook source "${candidate.id}"` };
      }
    }

    normalized.push({
      id: candidate.id,
      name: candidate.name.trim(),
      mirrorUrls: uniqueMirrorUrls,
      preferredMirror,
      settings: candidate.settings,
    });
  }

  return { valid: true, configs: normalized };
}
