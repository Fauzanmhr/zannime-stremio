/**
 * Metadata handler for WAJIK ANIME API
 */

/**
 * Fetch anime metadata and convert to Stremio format
 * @param {string} source - The source name
 * @param {string} animeId - The anime ID
 * @param {string} baseUrl - Base API URL
 * @returns {Object} - Stremio metadata object
 */
async function getMetadata(source, animeId, baseUrl) {
  try {
    const url = `${baseUrl}/${source}/anime/${animeId}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    
    const responseJson = await response.json();
    if (!responseJson.ok) {
      throw new Error(`API returned error: ${responseJson.message}`);
    }
    
    const animeData = responseJson.data;
    
    // Create base metadata structure
    const meta = createBaseMetadata(source, animeId, animeData);
    
    // Process episode list if available
    if (Array.isArray(animeData.episodeList)) {
      meta.videos = createEpisodeList(animeData.episodeList, source, animeId);
    }
    
    return meta;
  } catch (error) {
    console.error(`Error fetching metadata for ${source}:${animeId}:`, error);
    throw error;
  }
}

/**
 * Create base metadata structure from anime data
 * @param {string} source - The source name
 * @param {string} animeId - The anime ID
 * @param {Object} animeData - The anime data from API
 * @returns {Object} - Base metadata object
 */
function createBaseMetadata(source, animeId, animeData) {
  const meta = {
    id: `${source}:${animeId}`,
    type: 'series',
    name: animeData.title,
    poster: animeData.poster,
    background: animeData.poster, // Use poster as background if no banner provided
    posterShape: 'poster',
    description: '',
    releaseInfo: animeData.aired || animeData.season || '',
    videos: [],
    genres: []
  };
  
  // Process synopsis
  if (animeData.synopsis && animeData.synopsis.paragraphs) {
    meta.description = animeData.synopsis.paragraphs.join('\n\n');
  }
  
  // Process genre list
  if (animeData.genreList && Array.isArray(animeData.genreList)) {
    meta.genres = animeData.genreList.map(genre => genre.title);
  }
  
  // Add extra information based on available fields
  if (animeData.score) meta.imdbRating = parseFloat(animeData.score);
  if (animeData.status) meta.status = animeData.status;
  if (animeData.episodes) meta.runtime = `${animeData.episodes} episodes`;
  if (animeData.duration) meta.runtime = animeData.duration;
  if (animeData.studios) meta.director = animeData.studios;
  if (animeData.japanese) meta.name = `${meta.name} (${animeData.japanese})`;
  
  return meta;
}

/**
 * Create episode list for Stremio videos array
 * @param {Array} episodeList - List of episodes from API
 * @param {string} source - The source name
 * @param {string} animeId - The anime ID
 * @returns {Array} - Stremio videos array
 */
function createEpisodeList(episodeList, source, animeId) {
  const videos = episodeList.map(episode => {
    // Extract episode number from title
    let episodeNumber = episode.title;
    if (typeof episodeNumber === 'string' && episodeNumber.includes('Episode')) {
      episodeNumber = episodeNumber.replace('Episode', '').trim();
    }
    
    return {
      id: `${source}:${animeId}:${episode.episodeId}`,
      title: `Episode ${episodeNumber}`,
      released: '2000-01-01',
      season: 1, // Default to season 1
      episode: parseFloat(episodeNumber) || 0
    };
  });
  
  // Sort episodes in ascending order
  return videos.sort((a, b) => a.episode - b.episode);
}

module.exports = {
  getMetadata
};