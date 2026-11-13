# Usenet/NZB Integration - Product Requirements Document

**Status:** 🚧 Implementation In Progress | Approved 2026-01-06

**Priority:** High | Strategic feature expansion

---

## Executive Summary

Add SABnzbd integration to support Usenet/NZB downloads alongside existing qBittorrent torrenting. Prowlarr already indexes NZB content natively. This feature enables users to choose between torrent or Usenet download methods during setup, expanding the application's reach to the Usenet community.

**Key Benefits:**
- Dual download protocol support (BitTorrent + Usenet)
- Leverage existing Prowlarr NZB indexing
- No code changes to ranking algorithm (works with NZB results)
- Minimal architectural changes (follows existing patterns)
- Rock-solid implementation with comprehensive test coverage

---

## Technology Selection: SABnzbd

### Why SABnzbd (Recommended)

**Pros:**
- **Industry Standard:** Most widely deployed Usenet client in automation stacks (Sonarr/Radarr/*arr ecosystem)
- **User-Friendly:** Intuitive web UI with wizard-driven setup (lower support burden)
- **Well-Documented API:** Comprehensive REST API with JSON responses
- **Active Development:** Regular updates, strong community support
- **Docker-Ready:** Official Docker images, well-tested in containerized environments
- **Post-Processing:** Built-in verification (par2), extraction (rar/zip), cleanup
- **Category Support:** Similar to qBittorrent categories (matches existing architecture)

**Cons:**
- Python-based (slightly higher resource usage vs NZBGet's C++)
- Requires more CPU during post-processing

### Why Not NZBGet

**Pros:**
- C++ based (lower resource usage)
- Slightly faster downloads

**Cons:**
- **Abandoned and Forked:** Original project archived, now maintained by community fork (stability concern)
- **Steeper Learning Curve:** More complex configuration (higher support burden)
- **Less Integration Testing:** Fewer production deployments in automation stacks
- **Fragmented Support:** Discord-only support for fork (vs SABnzbd's established forums/docs)

### Decision

**SABnzbd is the clear choice** for this project due to better user experience, proven stability in automation workflows, and lower support burden. Resource usage is negligible for audiobook downloads (small files, infrequent downloads).

---

## Architecture Overview

### Design Principles

1. **Parallel Systems:** Torrent and Usenet pipelines run independently, no mixing
2. **Shared Infrastructure:** Reuse ranking algorithm, file organization, job queue
3. **Configuration Isolation:** Clear separation between qBittorrent and SABnzbd config
4. **Graceful Degradation:** Each download client can function independently
5. **Test-Driven:** Comprehensive unit and integration tests (no Usenet server required for dev)

### High-Level Flow

```
User Setup
  ├─ Choose Download Client: qBittorrent OR SABnzbd
  ├─ Configure credentials and connection
  └─ Test connection

Prowlarr Search
  ├─ Returns both torrent AND NZB results (already implemented)
  └─ Ranking algorithm scores all results (protocol-agnostic)

Download Selection
  ├─ IF top result is Torrent → qBittorrent pipeline
  └─ IF top result is NZB → SABnzbd pipeline

Download Monitoring
  ├─ qBittorrent: Poll torrent status via getTorrent()
  └─ SABnzbd: Poll NZB status via queue/history APIs

File Organization
  └─ Identical for both (copy files to media library, tag metadata)

Plex Scan
  └─ Identical for both (scan library, fuzzy match)
```

---

## Database Schema Changes

### Configuration Table (No Changes Required)

**Existing keys work as-is:**
```
download_client_type = 'qbittorrent' | 'sabnzbd'
download_client_url
download_client_username
download_client_password
download_client_disable_ssl_verify
download_dir
```

**New SABnzbd-specific keys:**
```
sabnzbd_api_key                   # SABnzbd API key
sabnzbd_category                  # Category name (default: 'readmeabook')
sabnzbd_verify_ssl                # Boolean (default: true, inverse of disable_ssl_verify for clarity)
```

**Why minimal changes?**
- SABnzbd doesn't use username/password (API key only) - reuse `download_client_password` for API key
- Path mapping works identically (reuse existing fields)
- SSL verification works identically

### Download_History Table (Minor Addition)

**New optional field:**
```typescript
nzb_id?: string;  // SABnzbd NZB ID (equivalent to torrent hash)
```

**Rationale:** Keep `torrent_hash` field (nullable) for backwards compatibility. Add `nzb_id` for SABnzbd jobs. Monitor job uses whichever is populated.

---

## New Services & Components

### 1. SABnzbd Service (`src/lib/integrations/sabnzbd.service.ts`)

**Mirrors qBittorrent service structure:**

```typescript
export class SABnzbdService {
  private client: AxiosInstance;
  private baseUrl: string;
  private apiKey: string;
  private defaultCategory: string;
  private disableSSLVerify: boolean;

  constructor(
    baseUrl: string,
    apiKey: string,
    defaultCategory: string = 'readmeabook',
    disableSSLVerify: boolean = false
  ) { }

  // Connection & Health
  async testConnection(): Promise<{ success: boolean; version?: string; }>
  async getVersion(): Promise<string>
  async getConfig(): Promise<SABnzbdConfig>

  // NZB Management
  async addNZB(url: string, options?: AddNZBOptions): Promise<string> // Returns nzbId
  async addNZBFile(nzbContent: Buffer, filename: string, options?: AddNZBOptions): Promise<string>
  async getNZB(nzbId: string): Promise<NZBInfo | null>
  async getQueue(): Promise<QueueItem[]>
  async getHistory(limit?: number): Promise<HistoryItem[]>

  // Category Management
  async ensureCategory(): Promise<void> // Create category if not exists, set download path

  // Download Control
  async pauseNZB(nzbId: string): Promise<void>
  async resumeNZB(nzbId: string): Promise<void>
  async deleteNZB(nzbId: string, deleteFiles?: boolean): Promise<void>

  // Progress Tracking
  getDownloadProgress(queueItem: QueueItem): DownloadProgress
}
```

**Key API Endpoints:**
```
GET  /api?mode=version&apikey={key}
GET  /api?mode=queue&apikey={key}
GET  /api?mode=history&limit=100&apikey={key}
POST /api?mode=addurl&name={url}&cat={category}&apikey={key}
POST /api?mode=addfile (multipart/form-data)
GET  /api?mode=pause&value={nzbId}&apikey={key}
GET  /api?mode=resume&value={nzbId}&apikey={key}
POST /api?mode=queue&name=delete&value={nzbId}&apikey={key}
```

**Data Models:**
```typescript
interface NZBInfo {
  nzbId: string;        // SABnzbd NZB ID
  name: string;         // NZB filename
  size: number;         // Bytes
  progress: number;     // 0.0 to 1.0
  status: NZBStatus;    // 'downloading' | 'queued' | 'paused' | 'extracting' | 'completed' | 'failed'
  downloadSpeed: number; // Bytes/sec
  timeLeft: number;     // Seconds
  category: string;
  downloadPath: string;
  completedAt?: Date;
  errorMessage?: string;
}

interface AddNZBOptions {
  category?: string;
  priority?: 'low' | 'normal' | 'high' | 'force';
  paused?: boolean;
}

interface DownloadProgress {
  percent: number;
  bytesDownloaded: number;
  bytesTotal: number;
  speed: number;
  eta: number;
  state: string;
}
```

**Singleton Pattern (matches qBittorrent):**
```typescript
let sabnzbdServiceInstance: SABnzbdService | null = null;

export async function getSABnzbdService(): Promise<SABnzbdService> {
  if (sabnzbdServiceInstance) return sabnzbdServiceInstance;

  const config = await getConfigService();
  const url = await config.get('download_client_url');
  const apiKey = await config.get('download_client_password'); // Reuse password field
  const category = await config.getOrDefault('sabnzbd_category', 'readmeabook');
  const disableSSL = (await config.getOrDefault('download_client_disable_ssl_verify', 'false')) === 'true';

  if (!url || !apiKey) throw new Error('SABnzbd not configured');

  sabnzbdServiceInstance = new SABnzbdService(url, apiKey, category, disableSSL);
  await sabnzbdServiceInstance.ensureCategory(); // Ensure category exists

  return sabnzbdServiceInstance;
}

export function invalidateSABnzbdService() {
  sabnzbdServiceInstance = null;
}
```

---

### 2. Download Service Factory (`src/lib/integrations/download-client.factory.ts`)

**Abstraction layer for download client selection:**

```typescript
export type DownloadClientType = 'qbittorrent' | 'sabnzbd';

export interface IDownloadClient {
  testConnection(): Promise<{ success: boolean; version?: string; }>;
  addDownload(url: string, metadata: DownloadMetadata): Promise<string>; // Returns hash/nzbId
  getDownloadStatus(id: string): Promise<DownloadStatus>;
  pauseDownload(id: string): Promise<void>;
  resumeDownload(id: string): Promise<void>;
  deleteDownload(id: string, deleteFiles?: boolean): Promise<void>;
}

export interface DownloadMetadata {
  title: string;
  author: string;
  category?: string;
}

export interface DownloadStatus {
  id: string;
  name: string;
  progress: number;
  state: string;
  downloadPath?: string;
  completedAt?: Date;
  errorMessage?: string;
}

export async function getDownloadClient(): Promise<{
  type: DownloadClientType;
  client: IDownloadClient;
}> {
  const config = await getConfigService();
  const type = await config.get('download_client_type') as DownloadClientType;

  if (!type) throw new Error('No download client configured');

  if (type === 'qbittorrent') {
    return { type, client: new QBittorrentAdapter(await getQBittorrentService()) };
  } else if (type === 'sabnzbd') {
    return { type, client: new SABnzbdAdapter(await getSABnzbdService()) };
  }

  throw new Error(`Unknown download client type: ${type}`);
}
```

**Adapter Pattern:** Wrap existing services to implement `IDownloadClient` interface. This allows download-agnostic code in jobs/processors.

---

## Integration Points

### 1. Setup Wizard (`src/app/setup/steps/DownloadClientStep.tsx`)

**Current State:**
- 2 buttons: qBittorrent (active) | Transmission (disabled)

**New State:**
- 2 buttons: qBittorrent | SABnzbd (both active)

**Changes:**
```tsx
<div className="grid grid-cols-2 gap-4">
  <button onClick={() => onUpdate('downloadClient', 'qbittorrent')}>
    <div>qBittorrent</div>
    <div>Torrent downloads</div>
  </button>

  <button onClick={() => onUpdate('downloadClient', 'sabnzbd')}>
    <div>SABnzbd</div>
    <div>Usenet/NZB downloads</div>
  </button>
</div>

{/* Conditional form fields based on selection */}
{downloadClient === 'qbittorrent' && (
  <QBittorrentFields />
)}

{downloadClient === 'sabnzbd' && (
  <SABnzbdFields />  {/* URL + API Key (no username) */}
)}
```

**Form Differences:**
- **qBittorrent:** URL, Username, Password, SSL verify toggle, Path mapping
- **SABnzbd:** URL, API Key (no username), SSL verify toggle, Path mapping
- Reuse existing path mapping UI (works identically for both)

**Test Connection:**
- Route: `POST /api/setup/test-download-client`
- Body: `{ type: 'sabnzbd', url, apiKey, ... }`
- Returns: `{ success: true, version: 'SABnzbd 4.x.x' }`

---

### 2. Search & Ranking (No Changes Required!)

**Implementation Strategy (Approved):**

1. **Prowlarr Search (`src/lib/integrations/prowlarr.service.ts`)**
   - Already returns both torrent AND NZB results
   - **NEW:** Filter results by configured download client protocol
   - If `download_client_type = 'qbittorrent'` → only return torrent results
   - If `download_client_type = 'sabnzbd'` → only return NZB results
   - Filtering happens BEFORE ranking algorithm

2. **Ranking Algorithm (`src/lib/utils/ranking-algorithm.ts`)**
   - Protocol-agnostic scoring (title/author match, seeders, format, size)
   - Works with both torrent and NZB results
   - No changes needed (receives pre-filtered results)

3. **Result Selection**
   - Best result always matches user's configured client
   - No protocol auto-detection needed
   - Simpler, cleaner logic

**Protocol Detection (for filtering):**
```typescript
function getResultProtocol(result: TorrentResult): 'torrent' | 'nzb' {
  if (result.downloadUrl.endsWith('.nzb') ||
      result.downloadUrl.includes('/nzb/') ||
      result.categories?.includes(3030)) { // Usenet category
    return 'nzb';
  }
  return 'torrent';
}
```

---

### 3. Download Job Processor (`src/lib/processors/download-torrent.processor.ts`)

**Rename to:** `download.processor.ts` (handles both protocols)

**Current Logic:**
```typescript
export async function processDownloadTorrent(payload) {
  const qbt = await getQBittorrentService();
  const hash = await qbt.addTorrent(downloadUrl);

  await prisma.downloadHistory.update({
    data: { torrent_hash: hash }
  });

  // Schedule monitor job
}
```

**New Logic (Config-Based Routing - APPROVED):**

User's configured download client handles ALL downloads. Prowlarr results are pre-filtered to match the client type, so downloads always match the user's infrastructure.

```typescript
export async function processDownload(payload) {
  const config = await getConfigService();
  const clientType = await config.get('download_client_type');

  let downloadId: string;
  let downloadClient: 'qbittorrent' | 'sabnzbd';

  if (clientType === 'sabnzbd') {
    // Download via SABnzbd
    const sabnzbd = await getSABnzbdService();
    downloadId = await sabnzbd.addNZB(payload.torrent.downloadUrl, { category: 'readmeabook' });
    downloadClient = 'sabnzbd';

    await prisma.downloadHistory.update({
      where: { id: payload.downloadHistoryId },
      data: {
        nzb_id: downloadId,
        download_client: 'sabnzbd',
      }
    });
  } else {
    // Download via qBittorrent (default)
    const qbt = await getQBittorrentService();
    downloadId = await qbt.addTorrent(payload.torrent.downloadUrl);
    downloadClient = 'qbittorrent';

    await prisma.downloadHistory.update({
      where: { id: payload.downloadHistoryId },
      data: {
        torrent_hash: downloadId,
        download_client: 'qbittorrent',
      }
    });
  }

  // Schedule monitor job (unified)
  await jobQueue.addMonitorJob(
    payload.requestId,
    payload.downloadHistoryId,
    downloadId,
    downloadClient,
    3 // 3 second initial delay
  );
}
```

**Benefits:**
- Simpler logic (no protocol auto-detection)
- Respects user's explicit choice during setup
- No mixed protocols in system
- Prowlarr filtering ensures results match client type

---

### 4. Monitor Download Job (`src/lib/processors/monitor-download.processor.ts`)

**Current Logic:**
```typescript
export async function processMonitorDownload(payload) {
  const { downloadClientId, downloadClient } = payload;

  if (downloadClient !== 'qbittorrent') {
    throw new Error(`Client ${downloadClient} not supported`);
  }

  const qbt = await getQBittorrentService();
  const torrent = await qbt.getTorrent(downloadClientId);
  const progress = qbt.getDownloadProgress(torrent);

  // Update request progress
  // Check if completed → trigger organize job
}
```

**New Logic (Protocol Branching):**
```typescript
export async function processMonitorDownload(payload) {
  const { downloadClientId, downloadClient, requestId, downloadHistoryId } = payload;

  let progress: DownloadProgress;
  let downloadPath: string | undefined;

  if (downloadClient === 'qbittorrent') {
    const qbt = await getQBittorrentService();
    const torrent = await qbt.getTorrent(downloadClientId);
    progress = qbt.getDownloadProgress(torrent);
    downloadPath = torrent.content_path || path.join(torrent.save_path, torrent.name);

  } else if (downloadClient === 'sabnzbd') {
    const sabnzbd = await getSABnzbdService();

    // Check queue first, then history
    const queueItem = (await sabnzbd.getQueue()).find(item => item.nzbId === downloadClientId);
    if (queueItem) {
      progress = sabnzbd.getDownloadProgress(queueItem);
    } else {
      // Not in queue, check history
      const historyItem = (await sabnzbd.getHistory()).find(item => item.nzbId === downloadClientId);
      if (!historyItem) throw new Error(`NZB ${downloadClientId} not found`);

      progress = {
        percent: historyItem.status === 'completed' ? 100 : 0,
        bytesDownloaded: historyItem.size,
        bytesTotal: historyItem.size,
        speed: 0,
        eta: 0,
        state: historyItem.status,
      };
      downloadPath = historyItem.downloadPath;
    }

  } else {
    throw new Error(`Download client ${downloadClient} not supported`);
  }

  // Update request progress (unified)
  await prisma.request.update({
    where: { id: requestId },
    data: { progress: progress.percent },
  });

  // Check completion (unified)
  if (progress.state === 'completed') {
    await logger?.info('Download completed');

    // Apply path mapping (works for both)
    const organizePath = PathMapper.transform(downloadPath, pathMappingConfig);

    // Trigger organize job (unified)
    await jobQueue.addJob('organize_files', {
      requestId,
      audiobookId: request.audiobook.id,
      downloadPath: organizePath,
      targetPath: mediaDir,
    });
  } else {
    // Re-schedule monitoring (unified)
    await jobQueue.addJob('monitor_download', payload, { delay: 10000 });
  }
}
```

**Key Points:**
- SABnzbd queue/history API differs from qBittorrent (queue = active, history = completed/failed)
- SABnzbd handles post-processing (par2 verification, rar extraction) automatically
- Path from SABnzbd is post-processed directory (already extracted)

---

### 5. File Organization (No Changes Required)

**Current Implementation Already Compatible:**
- Accepts `downloadPath` (directory or file)
- Copies audiobook files (`.m4b`, `.mp3`, `.m4a`) to media library
- Tags metadata with ffmpeg
- Downloads/copies cover art

**SABnzbd Compatibility:**
- SABnzbd extracts `.rar`/`.zip` archives automatically
- `downloadPath` points to extracted directory
- File organizer finds audiobook files identically

**No code changes needed!**

---

### 6. Admin Settings Page

**Current State:**
- Download Client tab: qBittorrent fields only

**New State:**
- Show fields based on `download_client_type` config
- Allow switching between qBittorrent and SABnzbd
- Test connection button (revalidate on change)

**UI Changes:**
```tsx
const [clientType, setClientType] = useState<'qbittorrent' | 'sabnzbd'>('qbittorrent');

<select value={clientType} onChange={handleClientTypeChange}>
  <option value="qbittorrent">qBittorrent</option>
  <option value="sabnzbd">SABnzbd</option>
</select>

{clientType === 'qbittorrent' && <QBittorrentSettings />}
{clientType === 'sabnzbd' && <SABnzbdSettings />}
```

**Warning on Switch:**
> Changing download clients will affect new downloads only. Existing downloads will continue with their original client.

---

## Testing Strategy (Rock Solid Without Usenet)

### Challenge
You don't have an active Usenet account. We need comprehensive tests that don't require real Usenet servers.

### Solution: Mock-Based Testing

#### 1. Unit Tests (SABnzbd Service)

**Mock HTTP responses:**
```typescript
describe('SABnzbdService', () => {
  let mockAxios: jest.Mocked<AxiosInstance>;
  let service: SABnzbdService;

  beforeEach(() => {
    mockAxios = axios.create() as jest.Mocked<AxiosInstance>;
    service = new SABnzbdService('http://sabnzbd:8080', 'test-api-key');
  });

  test('addNZB returns nzbId', async () => {
    mockAxios.post.mockResolvedValue({
      data: { status: true, nzo_ids: ['SABnzbd_nzo_abc123'] }
    });

    const nzbId = await service.addNZB('http://indexer.com/nzb/123.nzb');
    expect(nzbId).toBe('SABnzbd_nzo_abc123');
  });

  test('getQueue returns active downloads', async () => {
    mockAxios.get.mockResolvedValue({
      data: {
        queue: {
          slots: [{
            nzo_id: 'SABnzbd_nzo_abc123',
            filename: 'Audiobook.Name',
            mb: '250.5',
            mbleft: '125.25',
            percentage: '50',
            status: 'Downloading',
            timeleft: '0:15:30',
          }]
        }
      }
    });

    const queue = await service.getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].progress).toBe(0.5);
  });

  // Test error handling, retries, category creation, etc.
});
```

#### 2. Integration Tests (Job Processors)

**Mock SABnzbd service:**
```typescript
jest.mock('../integrations/sabnzbd.service');

describe('Download Processor', () => {
  test('routes NZB downloads to SABnzbd', async () => {
    const mockSABnzbd = {
      addNZB: jest.fn().resolvedValue('SABnzbd_nzo_abc123'),
    };
    (getSABnzbdService as jest.Mock).mockResolvedValue(mockSABnzbd);

    await processDownload({
      downloadUrl: 'http://indexer.com/nzb/audiobook.nzb',
      requestId: 'test-request-id',
    });

    expect(mockSABnzbd.addNZB).toHaveBeenCalledWith(
      'http://indexer.com/nzb/audiobook.nzb',
      expect.objectContaining({ category: 'readmeabook' })
    );
  });
});
```

#### 3. Manual Testing with Docker Compose

**Add SABnzbd to docker-compose.yml (test mode):**
```yaml
services:
  sabnzbd:
    image: linuxserver/sabnzbd:latest
    container_name: sabnzbd-test
    ports:
      - "8080:8080"
    environment:
      - PUID=1000
      - PGID=1000
    volumes:
      - ./test-data/sabnzbd-config:/config
      - ./test-data/sabnzbd-downloads:/downloads
```

**Configure with fake Usenet server:**
- Host: `fake.usenet.server` (will fail gracefully)
- Add test NZB files manually via web UI
- Test ReadMeABook integration without real downloads

#### 4. Simulated Download Flow

**Test NZB file (minimal valid structure):**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE nzb PUBLIC "-//newzBin//DTD NZB 1.1//EN" "http://www.newzbin.com/DTD/nzb/nzb-1.1.dtd">
<nzb xmlns="http://www.newzbin.com/DTD/2003/nzb">
  <file poster="test@example.com" date="1234567890" subject="Test Audiobook">
    <groups><group>alt.binaries.audiobooks</group></groups>
    <segments>
      <segment bytes="100000" number="1">test123@example.com</segment>
    </segments>
  </file>
</nzb>
```

Upload to SABnzbd → will fail download but test monitoring/state management.

---

## Implementation Plan

### Phase 1: Core SABnzbd Service (Week 1)

**Deliverables:**
- [ ] `src/lib/integrations/sabnzbd.service.ts` (full implementation)
- [ ] `src/lib/integrations/sabnzbd.service.test.ts` (unit tests with mocks)
- [ ] Documentation: `documentation/phase3/sabnzbd.md` (token-efficient format)
- [ ] Update TABLEOFCONTENTS.md

**Acceptance Criteria:**
- All unit tests pass (100% coverage on service methods)
- Mock-based tests validate API response parsing
- Error handling for common failure modes (401, 503, network errors)

---

### Phase 2: Setup Wizard Integration (Week 1)

**Deliverables:**
- [ ] Update `src/app/setup/steps/DownloadClientStep.tsx` (add SABnzbd option)
- [ ] Create SABnzbd field component (URL + API key form)
- [ ] Update `src/app/api/setup/test-download-client/route.ts` (add SABnzbd test logic)
- [ ] Update setup wizard documentation

**Acceptance Criteria:**
- SABnzbd selection shows correct form fields
- Test connection validates API key and returns version
- Successful test enables "Next" button
- Config saved to database correctly

---

### Phase 3: Download & Monitor Jobs (Week 2)

**Deliverables:**
- [ ] Rename `download-torrent.processor.ts` → `download.processor.ts`
- [ ] Add SABnzbd routing logic (config-based)
- [ ] Update `monitor-download.processor.ts` (add SABnzbd branch)
- [ ] Update database schema (add `nzb_id` field)
- [ ] Integration tests for both protocols

**Acceptance Criteria:**
- Downloads route to correct client based on config
- Monitor job polls SABnzbd queue/history correctly
- Progress updates reflect SABnzbd states (downloading, extracting, completed)
- Failed downloads trigger proper error handling

---

### Phase 4: Admin Settings & Polish (Week 2)

**Deliverables:**
- [ ] Update `src/app/admin/settings/page.tsx` (download client tab)
- [ ] Add SABnzbd settings form
- [ ] Update `src/app/api/admin/settings/download-client/route.ts`
- [ ] Add client type switcher with warning
- [ ] Test connection in settings page

**Acceptance Criteria:**
- Settings page shows correct fields for selected client
- Switching clients saves config and invalidates singleton
- Test connection works from settings page
- Warning displayed when switching clients

---

### Phase 5: Testing & Documentation (Week 3)

**Deliverables:**
- [ ] Manual testing with Docker SABnzbd instance
- [ ] End-to-end test: Setup → Search → Download → Monitor → Organize
- [ ] Update all documentation (PRD, implementation guide, troubleshooting)
- [ ] Create migration guide for existing qBittorrent users

**Acceptance Criteria:**
- Full download flow works with mock SABnzbd (no real Usenet)
- All integration tests pass
- Documentation complete and accurate
- Zero regressions in qBittorrent flow

---

## Risk Mitigation

### Risk 1: No Real Usenet Access for Testing

**Mitigation:**
- Comprehensive mock-based unit tests (cover 90%+ of code paths)
- Docker SABnzbd instance with fake server (test API integration)
- Community beta testing (recruit 2-3 Usenet users for real-world validation)
- Graceful error handling (assume Usenet server issues common)

---

### Risk 2: SABnzbd API Differences Across Versions

**Mitigation:**
- Test against SABnzbd 4.x (latest stable)
- Document minimum supported version (3.x or 4.x)
- Version detection in testConnection() warns if unsupported
- Graceful degradation for missing API features

---

### Risk 3: NZB Post-Processing Failures

**Mitigation:**
- SABnzbd handles par2 repair and extraction automatically
- Monitor for "failed" status in history
- Log post-processing errors to job events
- Retry logic for transient failures (network issues)
- User-facing error messages with actionable guidance

---

### Risk 4: Breaking Existing qBittorrent Flow

**Mitigation:**
- No changes to qBittorrent service (isolated)
- Download/monitor processors use branching (not replacement)
- Integration tests cover both protocols
- Manual regression testing before release
- Feature flag (optional): `usenet_enabled` config to disable if issues arise

---

## Success Metrics

1. **Zero Regressions:** All existing qBittorrent tests pass
2. **High Test Coverage:** ≥90% coverage on new SABnzbd code
3. **Mock Test Success:** All unit/integration tests pass without real Usenet
4. **Beta Validation:** 2-3 community testers confirm working downloads
5. **Documentation Complete:** Setup wizard, admin guide, troubleshooting docs

---

## Approved Decisions (2026-01-06)

1. **Download Client Selection:** ✅ **Option A Approved**
   - User picks ONE client during setup (qBittorrent OR SABnzbd)
   - All downloads use that client
   - Prowlarr results filtered by configured backend's protocol
   - Simpler UX, matches user's infrastructure reality

2. **Transmission Support:** ✅ **Removed Entirely**
   - Transmission references scrubbed from codebase
   - No placeholder button in UI
   - Clean two-option choice: qBittorrent vs SABnzbd

3. **Beta Testing:** ✅ **User Has Beta Testers Ready**
   - Community testers lined up for real-world validation
   - No additional recruitment needed

4. **Priority:** ✅ **Implement Immediately**
   - Full end-to-end implementation approved
   - Target: Complete, polished, professional product

---

## Appendices

### Appendix A: SABnzbd API Reference

**Key Endpoints:**
```
GET  /api?mode=version&output=json&apikey={key}
GET  /api?mode=queue&output=json&apikey={key}
GET  /api?mode=history&output=json&limit=100&apikey={key}
GET  /api?mode=addurl&name={url}&cat={cat}&output=json&apikey={key}
POST /api?mode=addfile&cat={cat}&output=json&apikey={key} (multipart: nzbfile)
GET  /api?mode=pause&value={nzbId}&output=json&apikey={key}
GET  /api?mode=resume&value={nzbId}&output=json&apikey={key}
GET  /api?mode=queue&name=delete&value={nzbId}&del_files=1&output=json&apikey={key}
GET  /api?mode=get_cats&output=json&apikey={key}
POST /api?mode=set_config&section=categories&keyword={cat}&value={path}&output=json&apikey={key}
```

**Response Format (Queue):**
```json
{
  "queue": {
    "slots": [
      {
        "nzo_id": "SABnzbd_nzo_abc123",
        "filename": "Audiobook.Name.2024",
        "mb": "250.50",
        "mbleft": "125.25",
        "percentage": "50",
        "status": "Downloading",
        "timeleft": "0:15:30",
        "cat": "readmeabook",
        "script": "None",
        "priority": "Normal"
      }
    ],
    "speed": "5.2 MB/s",
    "mbleft": "125.25"
  }
}
```

**Response Format (History):**
```json
{
  "history": {
    "slots": [
      {
        "nzo_id": "SABnzbd_nzo_abc123",
        "name": "Audiobook.Name.2024",
        "category": "readmeabook",
        "status": "Completed",
        "bytes": "262656000",
        "fail_message": "",
        "storage": "/downloads/complete/Audiobook.Name.2024",
        "completed": "1640000000",
        "download_time": "900"
      }
    ]
  }
}
```

---

### Appendix B: Database Migration Script

**Add `nzb_id` field to DownloadHistory:**
```sql
-- Migration: Add NZB ID field for SABnzbd integration
ALTER TABLE "DownloadHistory"
ADD COLUMN "nzb_id" TEXT;

-- Add index for fast NZB lookups
CREATE INDEX "DownloadHistory_nzb_id_idx" ON "DownloadHistory"("nzb_id");

-- Make torrent_hash nullable (was implicitly nullable, now explicit)
ALTER TABLE "DownloadHistory"
ALTER COLUMN "torrent_hash" DROP NOT NULL;

-- Add constraint: at least one of torrent_hash or nzb_id must be set
ALTER TABLE "DownloadHistory"
ADD CONSTRAINT "DownloadHistory_download_id_check"
CHECK (
  (torrent_hash IS NOT NULL AND nzb_id IS NULL) OR
  (torrent_hash IS NULL AND nzb_id IS NOT NULL)
);
```

**Prisma Schema Update:**
```prisma
model DownloadHistory {
  id                  String   @id @default(uuid())
  requestId           String
  indexerName         String
  torrentName         String
  torrentHash         String?  // Nullable for NZB downloads
  nzbId               String?  // SABnzbd NZB ID
  torrentSizeBytes    BigInt
  magnetLink          String?
  torrentUrl          String?
  seeders             Int
  leechers            Int
  qualityScore        Float
  selected            Boolean  @default(false)
  downloadClient      String   // 'qbittorrent' | 'sabnzbd'
  downloadClientId    String   // torrentHash or nzbId (redundant but convenient)
  downloadStatus      String
  downloadError       String?
  startedAt           DateTime?
  completedAt         DateTime?
  createdAt           DateTime @default(now())

  request             Request  @relation(fields: [requestId], references: [id], onDelete: Cascade)

  @@index([requestId])
  @@index([selected])
  @@index([torrentHash])
  @@index([nzbId])
  @@index([createdAt(sort: Desc)])
}
```

---

## Summary

This PRD outlines a **rock-solid, professionally architected NZB/Usenet integration** using SABnzbd. The design:

✅ **Minimally invasive:** Reuses 90% of existing infrastructure (ranking, jobs, file org)
✅ **Well-tested:** Comprehensive mock-based tests (no Usenet required for dev)
✅ **User-friendly:** Simple setup wizard, clear documentation
✅ **Production-ready:** Error handling, retry logic, graceful degradation
✅ **Future-proof:** Adapter pattern supports adding more clients (NZBGet, Deluge, etc.)

**Next Steps:**
1. Review this PRD and provide feedback
2. Answer open questions (download client selection model, beta testing, priority)
3. Approve for implementation OR request revisions
4. Begin Phase 1 development

**Estimated Timeline:** 3 weeks (part-time development)
**Risk Level:** Low (isolated changes, comprehensive testing)
**User Impact:** High (unlocks entire Usenet user base)

---

**Ready for your review!** 🚀
