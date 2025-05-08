// Import required modules
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');

// Import API wrappers and utilities
const { getMetadata } = require('./lib/metadata');
const { getStreams } = require('./lib/streams');
const { mapAnimeToStremio } = require('./lib/utils');

const API_BASE_URL = process.env.API_BASE_URL;

// Function to fetch available anime sources from the API
async function fetchAnimeSources() {
  try {
    const response = await fetch(`${API_BASE_URL}/view-data`);
    if (!response.ok) throw new Error(`API request failed with status ${response.status}`);
    
    const responseJson = await response.json();
    if (!responseJson.ok) throw new Error(`API returned error: ${responseJson.message}`);
    
    return responseJson.data.sources.map(source => ({
      id: `${source.route.replace('/', '')}-anime`,
      name: `${source.title} Anime`,
      route: source.route.replace('/', '')
    }));
  } catch (error) {
    console.error('Error fetching anime sources:', error);
    return [];
  }
}

// Function to fetch all genres for a specific source
async function fetchGenres(source) {
  try {
    const url = `${API_BASE_URL}/${source}/genres`;
    const response = await fetch(url);
    
    if (!response.ok) throw new Error(`API request failed with status ${response.status}`);
    
    const responseJson = await response.json();
    if (!responseJson.ok) throw new Error(`API returned error: ${responseJson.message}`);
    
    return responseJson.data.map(genre => ({
      id: genre.id || genre.slug,
      name: genre.title
    }));
  } catch (error) {
    console.error(`Error fetching genres for ${source}:`, error);
    return [];
  }
}

// Function to fetch schedule data for a specific source
async function fetchSchedule(source) {
  try {
    const url = `${API_BASE_URL}/${source}/schedule`;
    const response = await fetch(url);
    
    if (!response.ok) throw new Error(`API request failed with status ${response.status}`);
    
    const responseJson = await response.json();
    if (!responseJson.ok) throw new Error(`API returned error: ${responseJson.message}`);
    
    return responseJson.data;
  } catch (error) {
    console.error(`Error fetching schedule for ${source}:`, error);
    return [];
  }
}

// Create a base manifest with common properties and catalogs
const createManifest = (sources) => {
  // Create idPrefixes from sources
  const idPrefixes = sources.map(source => `${source.route}:`);
  
  // Create catalogs from sources with different categories
  const catalogs = [];
  
  // Standard extra options for most catalogs
  const standardExtra = [
    { name: 'search', isRequired: false },
    { name: 'genre', isRequired: false },
    { name: 'skip', isRequired: false }
  ];
  
  // Add catalogs for all sources
  for (const source of sources) {
      catalogs.push(
        {
          type: 'series',
          id: `${source.id}-ongoing`,
          name: `${source.name} (Ongoing)`,
          extra: standardExtra
        },
        {
          type: 'series',
          id: `${source.id}-completed`,
          name: `${source.name} (Completed)`,
          extra: standardExtra
        },
        {
          type: 'series', 
          id: `${source.id}-recent`,
          name: `${source.name} (Recent)`,
          extra: standardExtra
        }
      );
  }
  
  return {
    id: 'org.zannime.stremio',
    version: '1.0.0',
    name: 'Zannime',
    description: 'Stremio addon for WAJIK ANIME API',
    logo: '',
    background: '',
    catalogs,
    resources: ['catalog', 'meta', 'stream'],
    types: ['series'],
    idPrefixes
  };
};

// Initialize the addon with async sources
async function initAddon() {
  // Fetch available sources
  const sources = await fetchAnimeSources();
  console.log(`Loaded ${sources.length} anime sources:`, sources.map(s => s.name).join(', '));
  
  // Create the manifest with dynamic sources
  const manifest = createManifest(sources);
  
  // Create the addon builder
  const builder = new addonBuilder(manifest);

  builder.defineCatalogHandler(async ({ type, id, extra }) => {
    if (type !== 'series') return { metas: [] };
    
    // Parse catalog ID to get source and catalog type
    const catalogInfo = parseCatalogId(id);
    if (!catalogInfo) return { metas: [] };
    
    const { sourceId, catalogType } = catalogInfo;
    
    // Find the source from the catalog id
    const source = sources.find(s => s.id === sourceId);
    if (!source) return { metas: [] };
    
    // Process request parameters
    const { endpoint, params } = buildRequestParams(source, catalogType, extra);
    if (!endpoint) return { metas: [] };
    
    // The first page is always 1 when no skip is provided
    let page = 1;
    
    // Handle pagination when skip is provided
    if (extra.skip) {
      const skipCount = parseInt(extra.skip);
      
      // If we have skip parameter but don't know items per page yet,
      // we need to fetch the first page to determine items per page
      if (skipCount > 0) {
        try {
          // First make a request to page 1 to determine items per page
          const firstPageUrl = params.toString() ? `${endpoint}?${params.toString()}` : endpoint;
          const firstPageResponse = await fetch(firstPageUrl);
          
          if (!firstPageResponse.ok) {
            throw new Error(`API request failed with status ${firstPageResponse.status}`);
          }
          
          const firstPageJson = await firstPageResponse.json();
          if (!firstPageJson.ok) throw new Error(`API returned error: ${firstPageJson.message}`);
          
          // Extract anime list from the first page
          const firstPageAnimeList = extractAnimeList(firstPageJson);
          
          // Calculate items per page from first page response
          const itemsPerPage = firstPageAnimeList.length;
          
          // Now calculate the correct page based on skip and items per page
          page = Math.floor(skipCount / itemsPerPage) + 1;
          
          // If pagination info is available and we would exceed total pages, return empty result
          if (firstPageJson.pagination && 
              firstPageJson.pagination.totalPages && 
              page > firstPageJson.pagination.totalPages) {
            return { metas: [] };
          }
          
          // If we're already on page 1, return the results we already have
          if (page === 1) {
            return {
              metas: firstPageAnimeList.map(anime => mapAnimeToStremio(anime, source.route))
            };
          }
        } catch (error) {
          console.error('Error fetching first page for pagination data:', error);
          // Fall back to assuming 24 items per page if first page fetch fails
          page = Math.floor(skipCount / 24) + 1;
        }
      }
    }
    
    // Set the calculated page number
    params.append('page', page.toString());
    
    try {
      const url = params.toString() ? `${endpoint}?${params.toString()}` : endpoint;
      const response = await fetch(url);
      
      if (!response.ok) {
        if (response.status === 404 && page > 1) {
          return { metas: [] };
        }
        
        throw new Error(`API request failed with status ${response.status}`);
      }

      const responseJson = await response.json();
      if (!responseJson.ok) throw new Error(`API returned error: ${responseJson.message}`);

      const animeList = extractAnimeList(responseJson);
      
      return {
        metas: animeList.map(anime => mapAnimeToStremio(anime, source.route))
      };
    } catch (error) {
      console.error('Error fetching catalog:', error);
      return { metas: [] };
    }
  });

  // Builds request parameters based on source, catalog type and extra filters
  function buildRequestParams(source, catalogType, extra) {
    let endpoint;
    const params = new URLSearchParams();

    if (extra.search) {
      endpoint = `${API_BASE_URL}/${source.route}/search`;
      params.append('q', extra.search);
    } 
    else if (extra.genre) {
      endpoint = `${API_BASE_URL}/${source.route}/genres/${extra.genre}`;
    } 
    else {
      const catalogEndpoints = {
        ongoing: 'ongoing',
        completed: 'completed',
        recent: 'recent'
      };
      
      const endpointPath = catalogEndpoints[catalogType];
      
      if (!endpointPath) {
        return { endpoint: null, params };
      }
      
      endpoint = `${API_BASE_URL}/${source.route}/${endpointPath}`;
    }
    
    return { endpoint, params };
  }

  // Extracts anime list from various response formats
  function extractAnimeList(responseJson) {
    if (Array.isArray(responseJson.data)) {
      return responseJson.data;
    } else if (responseJson.data?.animeList) {
      return responseJson.data.animeList;
    } else {
      return responseJson.data || [];
    }
  }

  // Function to parse catalog ID into source and type
  function parseCatalogId(catalogId) {
    const match = catalogId.match(/^(.+?)-(ongoing|completed|recent)$/);
    if (!match) return null;
    
    return {
      sourceId: match[1],
      catalogType: match[2]
    };
  }

  builder.defineMetaHandler(async ({ type, id }) => {
    if (type !== 'series') return { meta: null };

    const [source, animeId] = id.split(':');
    try {
      const metadata = await getMetadata(source, animeId, API_BASE_URL);
      
      try {
        const scheduleData = await fetchSchedule(source);
        
        if (scheduleData && Array.isArray(scheduleData)) {
          for (const daySchedule of scheduleData) {
            if (daySchedule.animeList) {
              const scheduledAnime = daySchedule.animeList.find(
                anime => anime.animeId === animeId
              );
              
              if (scheduledAnime) {
                metadata.releaseInfo = metadata.releaseInfo || '';
                if (!metadata.releaseInfo.includes(daySchedule.day)) {
                  metadata.releaseInfo += 
                    (metadata.releaseInfo ? ' | ' : '') + 
                    `Airs on ${daySchedule.day}`;
                }
                break;
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error adding schedule data to metadata: ${error.message}`);
        // Non-critical error, continue without schedule data
      }
      
      return { meta: metadata };
    } catch (error) {
      console.error('Error fetching metadata:', error);
      return { meta: null };
    }
  });

  builder.defineStreamHandler(async ({ type, id }) => {
    if (type !== 'series') return { streams: [] };

    try {
      const streams = await getStreams(id, API_BASE_URL);
      return { streams };
    } catch (error) {
      console.error('Error fetching streams:', error);
      return { streams: [] };
    }
  });

  return builder;
}

// Start the server
async function startServer() {
  const builder = await initAddon();
  const PORT = process.env.PORT || 7000;
  serveHTTP(builder.getInterface(), { port: PORT });
  console.log(`ZANIME addon running at http://127.0.0.1:${PORT}`);
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
