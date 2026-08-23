// App container — manual DI (mirrors the Android AppContainer).

import { ApiClient } from "./api/ApiClient";
import { Mp3QuranApi } from "./api/Mp3QuranApi";
import { QuranComApi } from "./api/QuranComApi";
import { JsonDiskCache } from "./cache/JsonDiskCache";
import { CatalogRepository } from "./repo/CatalogRepository";
import { TimingRepository } from "./repo/TimingRepository";
import { QuranTextRepository } from "./repo/QuranTextRepository";
import { SessionRepository } from "./repo/SessionRepository";
import { TafseerRepository } from "./repo/TafseerRepository";
import { KsuHilitesRepository } from "./repo/KsuHilitesRepository";

export interface AppContainer {
  api: Mp3QuranApi;
  quranApi: QuranComApi;
  cache: JsonDiskCache;
  catalog: CatalogRepository;
  timing: TimingRepository;
  quranText: QuranTextRepository;
  session: SessionRepository;
  tafseer: TafseerRepository;
  ksuHilites: KsuHilitesRepository;
}

let container: AppContainer | null = null;

export function appContainer(): AppContainer {
  if (container === null) {
    const client = new ApiClient();
    const api = new Mp3QuranApi(client);
    const quranApi = new QuranComApi(client);
    const cache = new JsonDiskCache();
    const timing = new TimingRepository(api, cache);
    const catalog = new CatalogRepository(api, quranApi, cache, timing);
    container = {
      api,
      quranApi,
      cache,
      catalog,
      timing,
      quranText: new QuranTextRepository(quranApi, cache),
      session: new SessionRepository(),
      tafseer: new TafseerRepository(),
      ksuHilites: new KsuHilitesRepository(api, cache),
    };
  }
  return container;
}
