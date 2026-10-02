import { describe, expect, it } from 'vitest';
import {
  EBOOK_SOURCE_DEFINITIONS,
  EBOOK_SOURCE_IDS,
  getEbookSourceDefinition,
  validateEbookSourceConfigurations,
} from '@/lib/services/ebook-source-registry';

describe('ebook source registry', () => {
  it('registers existing sources with their download strategies', () => {
    expect(getEbookSourceDefinition(EBOOK_SOURCE_IDS.ANNAS_ARCHIVE)?.downloadStrategy).toBe('direct');
    expect(getEbookSourceDefinition(EBOOK_SOURCE_IDS.PROWLARR)?.downloadStrategy).toBe('indexer');
    expect(EBOOK_SOURCE_DEFINITIONS).toHaveLength(2);
  });

  it('accepts additional provider configuration with several mirrors and a preferred mirror', () => {
    const validation = validateEbookSourceConfigurations([{
      id: 'future-provider',
      name: 'Future Provider',
      mirrorUrls: ['https://mirror-one.example', 'https://mirror-two.example'],
      preferredMirror: 'https://mirror-two.example',
      settings: {},
    }]);

    expect(validation.valid).toBe(true);
    if (validation.valid) {
      expect(validation.configs[0].mirrorUrls).toHaveLength(2);
      expect(validation.configs[0].preferredMirror).toBe('https://mirror-two.example');
    }
  });

  it('rejects invalid and reserved source IDs, duplicate IDs, and invalid mirror URLs', () => {
    const reserved = validateEbookSourceConfigurations([{
      id: 'annas_archive',
      name: 'Renamed',
      mirrorUrls: [],
      preferredMirror: '',
      settings: {},
    }]);
    const invalidUrl = validateEbookSourceConfigurations([{
      id: 'future-provider',
      name: 'Future Provider',
      mirrorUrls: ['file:///private/file'],
      preferredMirror: 'file:///private/file',
      settings: {},
    }]);
    const duplicate = validateEbookSourceConfigurations([
      {
        id: 'future-provider',
        name: 'First',
        mirrorUrls: [],
        preferredMirror: '',
        settings: {},
      },
      {
        id: 'future-provider',
        name: 'Second',
        mirrorUrls: [],
        preferredMirror: '',
        settings: {},
      },
    ]);

    expect(reserved).toMatchObject({ valid: false });
    expect(invalidUrl).toMatchObject({ valid: false });
    expect(duplicate).toMatchObject({ valid: false });
  });

  it('requires the preferred mirror to be one of the configured mirror URLs', () => {
    const validation = validateEbookSourceConfigurations([{
      id: 'future-provider',
      name: 'Future Provider',
      mirrorUrls: ['https://mirror.example'],
      preferredMirror: 'https://other.example',
      settings: {},
    }]);

    expect(validation).toMatchObject({ valid: false });
  });

  it('requires a preferred mirror when mirror URLs are configured', () => {
    const validation = validateEbookSourceConfigurations([{
      id: 'future-provider',
      name: 'Future Provider',
      mirrorUrls: ['https://mirror.example'],
      preferredMirror: '',
      settings: {},
    }]);

    expect(validation).toMatchObject({ valid: false });
  });
});
