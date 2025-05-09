/**
 * Streams handler for WAJIK ANIME API
 */

const { parseEpisodeId } = require('./utils');

/**
 * Fetch video streams for an episode
 * @param {string} id - The episode ID in format "source:animeId:episodeId"
 * @param {string} baseUrl - Base API URL
 * @returns {Array} - Array of Stremio stream objects
 */
async function getStreams(id, baseUrl) {
  try {
    const { source, animeId, episodeId } = parseEpisodeId(id);
    
    if (!episodeId) return [];
    
    // Fetch episode details
    const episodeUrl = `${baseUrl}/${source}/episode/${episodeId}`;
    const episodeResponse = await fetch(episodeUrl);
    
    if (!episodeResponse.ok) {
      throw new Error(`Episode API request failed with status ${episodeResponse.status}`);
    }
    
    const episodeJson = await episodeResponse.json();
    if (!episodeJson.ok) {
      throw new Error(`API returned error: ${episodeJson.message}`);
    }
    
    const episodeData = episodeJson.data;
    const streams = [];
    
    // Add default streaming URL if available
    if (episodeData.defaultStreamingUrl) {
      streams.push({
        title: 'Default Stream',
        url: episodeData.defaultStreamingUrl,
        name: 'Default',
      });
    }
    
    // Process server qualities if available
    if (episodeData.server && episodeData.server.qualities) {
      await processQualities(episodeData.server.qualities, source, baseUrl, streams);
    }
    
    return streams;
  } catch (error) {
    console.error(`Error fetching streams for ${id}:`, error);
    return [];
  }
}

/**
 * Process quality options and add streams
 * @param {Array} qualities - Quality options from the API
 * @param {string} source - The anime source
 * @param {string} baseUrl - Base API URL
 * @param {Array} streams - Streams array to add to
 */
async function processQualities(qualities, source, baseUrl, streams) {
  for (const quality of qualities) {
    if (!quality.serverList || !Array.isArray(quality.serverList)) continue;

    for (const server of quality.serverList) {
      try {
        const serverUrl = `${baseUrl}/${source}/server/${server.serverId}`;
        const serverResponse = await fetch(serverUrl);

        if (!serverResponse.ok) continue;

        const serverJson = await serverResponse.json();
        if (!serverJson.ok || !serverJson.data || !serverJson.data.url) continue;

        let streamUrl = serverJson.data.url;

        // Modify URL for specific hosters like "pixeldrain"
        if (streamUrl.toLowerCase().includes('pixeldrain')) {
          streamUrl = streamUrl.replace('/u/', '/api/file/');
        }

        streams.push({
          title: `${quality.title} - ${server.title}`,
          url: streamUrl,
          name: `${quality.title} [${server.title}]`
        });
      } catch {
        // Skip failed servers silently
      }
    }
  }
}

module.exports = {
  getStreams
};
